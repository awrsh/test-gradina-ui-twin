import crypto from 'node:crypto';
import type {
  ActorPrincipal,
  NavEdge,
  NavNode,
  SpatialLocation,
  WorldModel,
} from '../shared/p1-contracts.ts';
import {
  CreateObjectTaskSchema,
  MoveCommandSchema,
  P2_CONTRACT_VERSION,
  TwinDomainError,
  VehicleTelemetrySchema,
} from '../shared/p2-contracts.ts';
import type {
  AutopilotStatus,
  CostProfile,
  DeadlockResolutionRecord,
  EdgeReservation,
  Mission,
  MissionCandidateScore,
  MissionDecisionExplanation,
  MissionState,
  MoveCommandInput,
  ObjectTask,
  ObjectTaskStatus,
  PlannedRoute,
  TwinFullSnapshot,
  VehicleProfile,
  VehicleTelemetryInput,
} from '../shared/p2-contracts.ts';
import { assertPermission, assertSpatialAbac } from './auth-rbac.ts';
import { TwinControlPlaneService } from './control-plane.ts';
import { TwinEventBus } from './event-bus.ts';
import { MesService } from './mes-service.ts';
import { findWeightedRouteWithStats } from './pathfinding.ts';
import { ApprovedFleetControllerGateway } from './safety-gateway.ts';
import {
  createSeedObjectTasks,
  createSeedVehicles,
  createSeedWorldModel,
  DEFAULT_SITE_ID,
  DEFAULT_TENANT_ID,
} from './seed-data.ts';
import { TrafficManager } from './traffic-manager.ts';
import { WmsService } from './wms-service.ts';

const LEGAL_TRANSITIONS: Record<MissionState, MissionState[]> = {
  requested: ['planned', 'failed'],
  planned: ['executing', 'paused', 'failed'],
  executing: ['paused', 'completed', 'failed'],
  paused: ['executing', 'failed'],
  completed: [],
  failed: [],
};

export class TwinSiteOrchestrator {
  public readonly world: WorldModel;
  public readonly eventBus: TwinEventBus;
  public readonly controlPlane: TwinControlPlaneService;
  public readonly traffic: TrafficManager;
  public readonly safetyGateway: ApprovedFleetControllerGateway;
  public readonly wms: WmsService;
  public readonly mes: MesService;

  private vehicles: VehicleProfile[];
  private missions: Mission[] = [];
  private tasks: ObjectTask[];
  private idempotencyStore = new Map<
    string,
    { missionId: string; fingerprint: string; createdAtMs: number }
  >();
  private nodesById: Map<string, NavNode>;
  private edgesById: Map<string, NavEdge>;
  private autopilotProvider?: () => AutopilotStatus;

  constructor(
    tenantId = DEFAULT_TENANT_ID,
    siteId = DEFAULT_SITE_ID
  ) {
    this.world = createSeedWorldModel(tenantId, siteId);
    this.eventBus = new TwinEventBus();
    this.controlPlane = new TwinControlPlaneService(
      tenantId,
      siteId,
      this.world.worldRevision,
      this.eventBus
    );
    this.traffic = new TrafficManager();
    this.safetyGateway = new ApprovedFleetControllerGateway();
    this.wms = new WmsService(this.world, this.eventBus);
    this.mes = new MesService(this.world, this.eventBus);
    this.vehicles = createSeedVehicles(tenantId, siteId);
    this.tasks = createSeedObjectTasks(tenantId, siteId);
    this.nodesById = new Map(this.world.navNodes.map((n) => [n.id, n]));
    this.edgesById = new Map(this.world.navEdges.map((e) => [e.id, e]));
  }

  public setAutopilotProvider(provider: () => AutopilotStatus): void {
    this.autopilotProvider = provider;
  }

  public getVehicles(): VehicleProfile[] {
    return this.vehicles;
  }

  public getMissions(): Mission[] {
    return this.missions;
  }

  public getMissionById(id: string): Mission | undefined {
    return this.missions.find((m) => m.id === id);
  }

  public getVehicleById(id: string): VehicleProfile | undefined {
    return this.vehicles.find((v) => v.id === id);
  }

  public getTasks(targetKind?: string, targetId?: string): ObjectTask[] {
    if (!targetKind && !targetId) return this.tasks;
    return this.tasks.filter(
      (t) =>
        (!targetKind || t.targetKind === targetKind) &&
        (!targetId || t.targetId === targetId)
    );
  }

  public createObjectTask(rawInput: unknown, principal: ActorPrincipal): ObjectTask {
    if (principal.role === 'viewer') {
      throw new TwinDomainError(
        'UNAUTHORIZED_RBAC',
        `Actor ${principal.actorId} (viewer) cannot define operational tasks`,
        403
      );
    }
    const parsed = CreateObjectTaskSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new TwinDomainError('VALIDATION_ERROR', 'Invalid object task payload', 400, {
        issues: parsed.error.issues,
      });
    }
    const input = parsed.data;

    // Verify target object exists in digital twin
    const exists =
      (input.targetKind === 'vehicle' && this.vehicles.some((v) => v.id === input.targetId)) ||
      (input.targetKind === 'location' &&
        this.world.locations.some((l) => l.id === input.targetId)) ||
      (input.targetKind === 'asset' &&
        this.mes.getAssets().some((a) => a.id === input.targetId)) ||
      (input.targetKind === 'pallet' &&
        this.wms.getPallets().some((p) => p.id === input.targetId));

    if (!exists) {
      throw new TwinDomainError(
        'RESOURCE_NOT_FOUND',
        `Target ${input.targetKind} '${input.targetId}' not found`,
        404
      );
    }

    const nowIso = new Date().toISOString();
    const task: ObjectTask = {
      id: `TSK-${crypto.randomUUID().slice(0, 5).toUpperCase()}`,
      tenantId: this.world.tenantId,
      siteId: this.world.siteId,
      targetKind: input.targetKind,
      targetId: input.targetId,
      title: input.title,
      titleFa: input.titleFa,
      category: input.category,
      priority: input.priority,
      status: input.startImmediately ? 'in_progress' : 'pending',
      notes: input.notes,
      createdBy: principal.actorId,
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };

    this.tasks.unshift(task);

    this.eventBus.publish({
      topic: 'twin.task.created',
      tenantId: this.world.tenantId,
      siteId: this.world.siteId,
      worldRevision: this.world.worldRevision,
      actorId: principal.actorId,
      correlationId: task.id,
      payload: {
        taskId: task.id,
        targetKind: task.targetKind,
        targetId: task.targetId,
        category: task.category,
        priority: task.priority,
      },
    });

    return task;
  }

  public updateObjectTaskStatus(
    taskId: string,
    status: ObjectTaskStatus,
    principal: ActorPrincipal
  ): ObjectTask {
    if (principal.role === 'viewer') {
      throw new TwinDomainError(
        'UNAUTHORIZED_RBAC',
        `Actor ${principal.actorId} (viewer) cannot modify operational tasks`,
        403
      );
    }
    if (!['pending', 'in_progress', 'completed', 'cancelled'].includes(status)) {
      throw new TwinDomainError('VALIDATION_ERROR', 'Invalid task status value', 400);
    }
    const task = this.tasks.find((t) => t.id === taskId);
    if (!task) {
      throw new TwinDomainError('RESOURCE_NOT_FOUND', `Task ${taskId} not found`, 404);
    }
    task.status = status;
    task.updatedAtIso = new Date().toISOString();

    this.eventBus.publish({
      topic: 'twin.task.updated',
      tenantId: this.world.tenantId,
      siteId: this.world.siteId,
      worldRevision: this.world.worldRevision,
      actorId: principal.actorId,
      correlationId: task.id,
      payload: {
        taskId: task.id,
        targetKind: task.targetKind,
        targetId: task.targetId,
        status: task.status,
      },
    });

    return task;
  }

  public getMissionExplanation(missionId: string): MissionDecisionExplanation {
    const m = this.getMissionById(missionId);
    if (!m) {
      throw new TwinDomainError('RESOURCE_NOT_FOUND', `Mission ${missionId} not found`, 404);
    }
    if (!m.decisionExplanation) {
      throw new TwinDomainError(
        'RESOURCE_NOT_FOUND',
        `No decision explanation stored for mission ${missionId}`,
        404
      );
    }
    return m.decisionExplanation;
  }

  private buildEdgeCongestionMap(): Map<string, number> {
    const map = new Map<string, number>();
    const cells = this.wms.getHeatmaps();
    for (const edge of this.world.navEdges) {
      const a = this.nodesById.get(edge.fromNodeId);
      const b = this.nodesById.get(edge.toNodeId);
      if (!a || !b) continue;
      const mx = (a.x + b.x) / 2;
      const mz = (a.z + b.z) / 2;
      let maxCong = 0;
      for (const cell of cells) {
        if (Math.abs(mx - cell.x) <= cell.width / 2 && Math.abs(mz - cell.z) <= cell.depth / 2) {
          maxCong = Math.max(maxCong, cell.congestionScore);
        }
      }
      if (maxCong > 0) map.set(edge.id, maxCong);
    }
    return map;
  }

  // ==========================================================================
  // EP05-F01: Semantic Location Resolution & Command Validation
  // ==========================================================================

  public resolveSemanticLocation(query: string): SpatialLocation {
    const q = query.trim().toLowerCase();
    if (!q) {
      throw new TwinDomainError('LOCATION_NOT_FOUND', 'Location ID cannot be empty', 404);
    }

    const exactMatches = this.world.locations.filter(
      (loc) =>
        loc.id.toLowerCase() === q ||
        loc.code.toLowerCase() === q ||
        (loc.aliases ?? []).some((a) => a.toLowerCase() === q)
    );

    if (exactMatches.length === 1) {
      return exactMatches[0];
    }
    if (exactMatches.length > 1) {
      throw new TwinDomainError(
        'LOCATION_AMBIGUOUS',
        `Location identifier '${query}' is ambiguous (${exactMatches.map((m) => m.code).join(', ')})`,
        409,
        { query, candidates: exactMatches.map((m) => m.id) }
      );
    }

    const partialMatches = this.world.locations.filter(
      (loc) => loc.code.toLowerCase().includes(q) || loc.name.toLowerCase().includes(q)
    );
    if (partialMatches.length > 1) {
      throw new TwinDomainError(
        'LOCATION_AMBIGUOUS',
        `Location query '${query}' matched multiple entities: ${partialMatches.map((m) => m.code).join(', ')}`,
        409,
        { query, candidates: partialMatches.map((m) => m.id) }
      );
    }
    if (partialMatches.length === 1) {
      return partialMatches[0];
    }

    throw new TwinDomainError(
      'LOCATION_NOT_FOUND',
      `Unknown location '${query}' in world revision ${this.world.worldRevision}`,
      404,
      { query, worldRevision: this.world.worldRevision }
    );
  }

  // ==========================================================================
  // EP05-F06: Execution State Machine
  // ==========================================================================

  public transitionMissionState(
    mission: Mission,
    toState: MissionState,
    actorId: string,
    reason: string
  ): Mission {
    const legal = LEGAL_TRANSITIONS[mission.state];
    if (!legal.includes(toState)) {
      throw new TwinDomainError(
        'INVALID_STATE_TRANSITION',
        `Illegal mission state transition: ${mission.state} -> ${toState} for mission ${mission.id}`,
        409,
        { missionId: mission.id, fromState: mission.state, toState }
      );
    }

    const fromState = mission.state;
    const nowIso = new Date().toISOString();
    mission.state = toState;
    mission.updatedAtIso = nowIso;
    mission.transitions.push({
      fromState,
      toState,
      actorId,
      reason,
      worldRevision: this.world.worldRevision,
      timestampIso: nowIso,
    });

    this.updateMissionMetrics();

    this.eventBus.publish({
      topic: 'twin.mission.transition',
      tenantId: mission.tenantId,
      siteId: mission.siteId,
      worldRevision: mission.worldRevision,
      actorId,
      correlationId: mission.id,
      payload: {
        missionId: mission.id,
        vehicleId: mission.vehicleId,
        fromState,
        toState,
        reason,
        worldRevision: mission.worldRevision,
      },
    });

    return mission;
  }

  private updateMissionMetrics(): void {
    this.eventBus.metrics.activeMissionsCount = this.missions.filter(
      (m) => m.state === 'planned' || m.state === 'executing' || m.state === 'paused'
    ).length;
    this.eventBus.metrics.completedMissionsCount = this.missions.filter(
      (m) => m.state === 'completed'
    ).length;
  }

  // ==========================================================================
  // EP05-F05: Eligible Vehicle Selection & Explainable Scoring
  // ==========================================================================

  private selectEligibleVehicle(params: {
    origin: SpatialLocation;
    destination: SpatialLocation;
    payloadKg: number;
    costProfile: CostProfile;
    preferredVehicleId?: string;
    bypassGmpAirlockCheck?: boolean;
  }): {
    vehicle: VehicleProfile;
    routeToOrigin: PlannedRoute | null;
    missionRoute: PlannedRoute;
    expandedNodes: number;
    candidates: MissionCandidateScore[];
  } {
    const cfg = this.controlPlane.getConfig();
    const flags = this.controlPlane.getFlags();

    if (!params.preferredVehicleId && (!cfg.dispatch.autoAssign || !flags['dt.ep05.autoDispatch'])) {
      throw new TwinDomainError(
        'FEATURE_DISABLED',
        'Auto-dispatch is disabled by Control Plane config/flag; explicit vehicleId is required',
        409
      );
    }

    const candidates = params.preferredVehicleId
      ? this.vehicles.filter((v) => v.id === params.preferredVehicleId)
      : [...this.vehicles];

    if (candidates.length === 0) {
      throw new TwinDomainError(
        'RESOURCE_NOT_FOUND',
        `Requested vehicle '${params.preferredVehicleId}' not found`,
        404
      );
    }

    const effectiveProfile: CostProfile = flags['dt.ep05.weightedAstar']
      ? params.costProfile
      : 'shortest';
    const edgeCongestion = this.buildEdgeCongestionMap();

    const candidateLog: MissionCandidateScore[] = [];
    const viable: Array<{
      vehicle: VehicleProfile;
      routeToOrigin: PlannedRoute | null;
      missionRoute: PlannedRoute;
      expandedNodes: number;
      score: number;
    }> = [];

    for (const v of candidates) {
      const reasons: string[] = [];
      if (v.eStopActive) reasons.push('E-Stop active');
      if (v.isStale) reasons.push('Telemetry stale');
      if (v.batteryPct < cfg.dispatch.minBatteryPct) {
        reasons.push(`Battery ${v.batteryPct}% below minBatteryPct (${cfg.dispatch.minBatteryPct}%)`);
      }
      const totalWorkload = (v.activeMissionId ? 1 : 0) + v.queuedMissionIds.length;
      if (v.activeMissionId && v.queuedMissionIds.length >= cfg.dispatch.maxQueueDepthPerVehicle) {
        reasons.push(
          `Queue depth ${v.queuedMissionIds.length} reached maxQueueDepthPerVehicle (${cfg.dispatch.maxQueueDepthPerVehicle})`
        );
      }
      if (v.maxPayloadKg < params.payloadKg) {
        reasons.push(`Payload ${params.payloadKg}kg exceeds max ${v.maxPayloadKg}kg`);
      }
      if (!v.allowedCleanlinessGrades.includes(params.destination.cleanlinessGrade)) {
        reasons.push(`Not qualified for ${params.destination.cleanlinessGrade}`);
      }

      if (reasons.length > 0) {
        candidateLog.push({ vehicleId: v.id, eligible: false, rejectionReasons: reasons });
        continue;
      }

      try {
        const vehicleNode = this.findNearestNavNode(v.pose.x, v.pose.z);
        let expandedTotal = 0;
        let routeToOrigin: PlannedRoute | null = null;
        if (vehicleNode.id !== params.origin.navNodeId) {
          const approach = findWeightedRouteWithStats({
            world: this.world,
            vehicle: v,
            startNodeId: vehicleNode.id,
            goalNodeId: params.origin.navNodeId,
            costProfile: effectiveProfile,
            routingConfig: cfg.routing,
            edgeCongestion,
            bypassGmpAirlockCheck: params.bypassGmpAirlockCheck,
          });
          routeToOrigin = approach.route;
          expandedTotal += approach.expandedNodes;
        }

        const mainRes = findWeightedRouteWithStats({
          world: this.world,
          vehicle: v,
          startNodeId: params.origin.navNodeId,
          goalNodeId: params.destination.navNodeId,
          costProfile: effectiveProfile,
          routingConfig: cfg.routing,
          edgeCongestion,
          bypassGmpAirlockCheck: params.bypassGmpAirlockCheck,
        });
        expandedTotal += mainRes.expandedNodes;

        const approachDist = routeToOrigin ? routeToOrigin.totalDistanceM : 0;
        const w = cfg.dispatch.scoring;

        // Higher score wins:
        // - closer vehicle gets higher distanceTerm
        // - higher battery gets higher batteryTerm
        // - busy/queued vehicle gets negative workloadTerm
        // - cleaner/wider capability fit gets higher capabilityFitTerm
        const distanceTerm = Number((Math.max(0, 60 - approachDist) * w.wDistance).toFixed(2));
        const batteryTerm = Number((v.batteryPct * w.wBattery).toFixed(2));
        const workloadTerm = Number((-totalWorkload * w.wWorkload).toFixed(2));
        const capabilityScore =
          (v.allowedCleanlinessGrades.length / 4) * 0.6 +
          (v.maxPayloadKg >= params.payloadKg ? 0.4 : 0);
        const capabilityFitTerm = Number((capabilityScore * w.wCapabilityFit).toFixed(2));
        const totalScore = Number(
          (distanceTerm + batteryTerm + workloadTerm + capabilityFitTerm).toFixed(2)
        );

        candidateLog.push({
          vehicleId: v.id,
          eligible: true,
          rejectionReasons: [],
          scoreBreakdown: {
            distanceTerm,
            batteryTerm,
            workloadTerm,
            capabilityFitTerm,
            totalScore,
          },
        });

        viable.push({
          vehicle: v,
          routeToOrigin,
          missionRoute: mainRes.route,
          expandedNodes: expandedTotal,
          score: totalScore,
        });
      } catch (err) {
        if (err instanceof TwinDomainError) {
          if (params.preferredVehicleId && err.code === 'GMP_AIRLOCK_REQUIRED') {
            throw err;
          }
          candidateLog.push({
            vehicleId: v.id,
            eligible: false,
            rejectionReasons: [err.message],
          });
        }
      }
    }

    if (viable.length === 0) {
      this.eventBus.metrics.routingFailures += 1;
      const allReasons = candidateLog.flatMap((c) => c.rejectionReasons);
      const hasIncompat = allReasons.some(
        (r) =>
          r.includes('exceeds') ||
          r.includes('qualified') ||
          r.includes('INCOMPATIBLE') ||
          r.includes('cleanliness') ||
          r.includes('Battery') ||
          r.includes('Queue depth')
      );
      throw new TwinDomainError(
        hasIncompat ? 'INCOMPATIBLE_VEHICLE' : 'UNREACHABLE_ROUTE',
        `No eligible vehicle could execute move ${params.origin.code} -> ${params.destination.code}`,
        422,
        { candidates: candidateLog }
      );
    }

    // Highest score wins; deterministic tie-break by vehicle ID
    viable.sort((a, b) => b.score - a.score || a.vehicle.id.localeCompare(b.vehicle.id));
    return { ...viable[0], candidates: candidateLog };
  }

  // ==========================================================================
  // EP05-F01..F06: Submit Semantic Move Command
  // ==========================================================================

  public submitMoveCommand(
    rawInput: unknown,
    principal: ActorPrincipal
  ): {
    mission: Mission;
    idempotentReplay: boolean;
    dryRun: boolean;
    deadlockResolutions: DeadlockResolutionRecord[];
  } {
    const cfg = this.controlPlane.getConfig();
    const flags = this.controlPlane.getFlags();

    if (!flags['dt.ep05.semanticCommands']) {
      this.eventBus.metrics.commandsRejected += 1;
      throw new TwinDomainError(
        'FEATURE_DISABLED',
        "Semantic move command intake is disabled ('dt.ep05.semanticCommands' = false)",
        409
      );
    }

    const parsed = MoveCommandSchema.safeParse(rawInput);
    if (!parsed.success) {
      this.eventBus.metrics.commandsRejected += 1;
      throw new TwinDomainError(
        'VALIDATION_ERROR',
        'Invalid move command payload',
        400,
        { issues: parsed.error.issues }
      );
    }
    const input = parsed.data;
    const costProfile: CostProfile = input.costProfile ?? cfg.routing.defaultCostProfile;

    try {
      assertPermission(principal, 'issueMove', 'submit semantic move command');

      // Idempotency TTL + conflict verification
      const nowMs = Date.now();
      const fingerprint = `${input.originId}|${input.destinationId}|${input.vehicleId ?? 'auto'}|${costProfile}`;
      const existingIdem = this.idempotencyStore.get(input.idempotencyKey);
      if (existingIdem) {
        const ageSec = (nowMs - existingIdem.createdAtMs) / 1000;
        if (ageSec <= cfg.mission.idempotencyTtlSec) {
          if (existingIdem.fingerprint !== fingerprint) {
            throw new TwinDomainError(
              'IDEMPOTENCY_CONFLICT',
              `Idempotency key '${input.idempotencyKey}' already used with different command parameters`,
              409,
              { idempotencyKey: input.idempotencyKey }
            );
          }
          const existingMission = this.getMissionById(existingIdem.missionId)!;
          return {
            mission: existingMission,
            idempotentReplay: true,
            dryRun: false,
            deadlockResolutions: [],
          };
        } else {
          this.idempotencyStore.delete(input.idempotencyKey);
        }
      }

      const origin = this.resolveSemanticLocation(input.originId);
      const destination = this.resolveSemanticLocation(input.destinationId);

      assertSpatialAbac(principal, origin.zoneId, origin.cleanlinessGrade, origin.code);
      assertSpatialAbac(
        principal,
        destination.zoneId,
        destination.cleanlinessGrade,
        destination.code
      );

      if (cfg.mes.maintenanceBlocksDispatch) {
        this.mes.assertLocationAvailableForDispatch(origin.id);
        this.mes.assertLocationAvailableForDispatch(destination.id);
      }

      let loadPallet = input.loadId ? this.wms.getPalletById(input.loadId) : undefined;
      if (!loadPallet) {
        loadPallet = this.wms
          .getPallets()
          .find((p) => p.locationId === origin.id && !p.inTransitVehicleId);
      }

      if (
        loadPallet &&
        loadPallet.qaStatus === 'quarantine' &&
        destination.zoneId !== 'WH-QUARANTINE' &&
        (cfg.wms.quarantineBlocksPicking || cfg.wms.quarantineBlocksPutaway)
      ) {
        throw new TwinDomainError(
          'QA_QUARANTINE_BLOCKED',
          `Material ${loadPallet.id} (${loadPallet.label}) is in QA Quarantine and cannot move to ${destination.code}`,
          409,
          { palletId: loadPallet.id, qaStatus: loadPallet.qaStatus, destination: destination.code }
        );
      }

      const selection = this.selectEligibleVehicle({
        origin,
        destination,
        payloadKg: loadPallet ? loadPallet.weightKg : input.payloadKg,
        costProfile,
        preferredVehicleId: input.vehicleId,
        bypassGmpAirlockCheck: input.airlockOverrideApproved,
      });

      const combinedSegments = [
        ...(selection.routeToOrigin?.segments ?? []),
        ...selection.missionRoute.segments,
      ];
      const combinedNodeIds = selection.routeToOrigin
        ? [
            ...selection.routeToOrigin.nodeIds.slice(0, -1),
            ...selection.missionRoute.nodeIds,
          ]
        : [...selection.missionRoute.nodeIds];

      const fullRoute: PlannedRoute = {
        costProfile,
        nodeIds: combinedNodeIds,
        segments: combinedSegments,
        totalDistanceM: Number(
          combinedSegments.reduce((s, seg) => s + seg.lengthM, 0).toFixed(2)
        ),
        totalCost: Number(
          combinedSegments.reduce((s, seg) => s + seg.cost, 0).toFixed(3)
        ),
        estimatedDurationSec: Number(
          combinedSegments.reduce((s, seg) => s + seg.estimatedDurationSec, 0).toFixed(2)
        ),
        passesAirlockId: selection.missionRoute.passesAirlockId,
      };

      if (!input.airlockOverrideApproved && cfg.mes.gmpEnforcement !== 'off') {
        const gmpGate = this.mes.checkGmpTransferGate({
          fromGrade: origin.cleanlinessGrade,
          toGrade: destination.cleanlinessGrade,
          passesAirlockId: fullRoute.passesAirlockId,
          qaReleased: !loadPallet || loadPallet.qaStatus === 'released',
        });
        if (!gmpGate.allowed && cfg.mes.gmpEnforcement === 'block') {
          throw new TwinDomainError(
            'GMP_AIRLOCK_REQUIRED',
            gmpGate.reason ?? 'GMP airlock clearance required',
            422,
            { rule: gmpGate.rule }
          );
        }
      }

      const nowIso = new Date().toISOString();
      const missionId = `MSN-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

      const explanation: MissionDecisionExplanation = {
        missionId,
        worldRevision: cfg.worldRevisionPin || this.world.worldRevision,
        resolvedOrigin: {
          id: origin.id,
          code: origin.code,
          navNodeId: origin.navNodeId,
          zoneId: origin.zoneId,
        },
        resolvedDestination: {
          id: destination.id,
          code: destination.code,
          navNodeId: destination.navNodeId,
          zoneId: destination.zoneId,
        },
        selectedVehicleId: selection.vehicle.id,
        autoAssigned: !input.vehicleId,
        candidates: selection.candidates,
        routingSummary: {
          algorithm: cfg.routing.algorithm,
          costProfile,
          expandedNodes: selection.expandedNodes,
          maxExpandNodes: cfg.routing.maxExpandNodes,
          totalDistanceM: fullRoute.totalDistanceM,
          totalCost: fullRoute.totalCost,
          costWeights: { ...cfg.routing.costs },
        },
        trafficDecisions: [],
        overrides: [],
      };

      const mission: Mission = {
        id: missionId,
        idempotencyKey: input.idempotencyKey,
        tenantId: this.world.tenantId,
        siteId: this.world.siteId,
        worldRevision: cfg.worldRevisionPin || this.world.worldRevision,
        originLocationId: origin.id,
        destinationLocationId: destination.id,
        originCode: origin.code,
        destinationCode: destination.code,
        vehicleId: selection.vehicle.id,
        costProfile,
        priority: input.priority,
        payloadKg: loadPallet ? loadPallet.weightKg : input.payloadKg,
        loadId: loadPallet?.id ?? input.loadId,
        bomOrderId: input.bomOrderId,
        state: 'requested',
        route: fullRoute,
        reservations: [],
        currentSegmentIndex: 0,
        progressOnSegment: 0,
        replanCount: 0,
        createdAtIso: nowIso,
        updatedAtIso: nowIso,
        transitions: [
          {
            fromState: null,
            toState: 'requested',
            actorId: principal.actorId,
            reason: `Semantic move intent ${origin.code} -> ${destination.code}`,
            worldRevision: this.world.worldRevision,
            timestampIso: nowIso,
          },
        ],
        decisionExplanation: explanation,
      };

      if (input.dryRun) {
        return {
          mission,
          idempotentReplay: false,
          dryRun: true,
          deadlockResolutions: [],
        };
      }

      const trafficCfg = {
        ...cfg.traffic,
        edgeReservationEnabled:
          cfg.traffic.edgeReservationEnabled && flags['dt.ep05.edgeReservations'],
      };

      let resResult = this.traffic.reserveRoute({
        missionId: mission.id,
        vehicleId: selection.vehicle.id,
        priority: input.priority,
        route: fullRoute,
        edgesById: this.edgesById,
        trafficConfig: trafficCfg,
        autoDeadlockResolve: flags['dt.ep05.autoDeadlockResolve'],
      });

      if (resResult.policyActionRequired === 'fail_mission') {
        this.missions.unshift(mission);
        this.transitionMissionState(
          mission,
          'failed',
          'TRAFFIC-MANAGER',
          `Deadlock policy 'fail_mission' triggered on reservation conflict`
        );
        return {
          mission,
          idempotentReplay: false,
          dryRun: false,
          deadlockResolutions: resResult.resolutions,
        };
      }

      if (resResult.conflictingEdgeIds.size > 0) {
        const startNode = this.findNearestNavNode(
          selection.vehicle.pose.x,
          selection.vehicle.pose.z
        );
        const alt = findWeightedRouteWithStats({
          world: this.world,
          vehicle: selection.vehicle,
          startNodeId: startNode.id,
          goalNodeId: destination.navNodeId,
          costProfile,
          routingConfig: cfg.routing,
          edgeCongestion: this.buildEdgeCongestionMap(),
          avoidEdgeIds: resResult.conflictingEdgeIds,
          bypassGmpAirlockCheck: input.airlockOverrideApproved,
        });
        mission.route = alt.route;
        mission.replanCount += 1;
        explanation.trafficDecisions.push(
          `Replanned around contested edge(s): ${Array.from(resResult.conflictingEdgeIds).join(', ')}`
        );
        resResult = this.traffic.reserveRoute({
          missionId: mission.id,
          vehicleId: selection.vehicle.id,
          priority: input.priority,
          route: alt.route,
          edgesById: this.edgesById,
          trafficConfig: trafficCfg,
          autoDeadlockResolve: flags['dt.ep05.autoDeadlockResolve'],
        });
      }

      for (const r of resResult.resolutions) {
        explanation.trafficDecisions.push(r.reason);
      }

      mission.reservations = resResult.reservations;
      this.missions.unshift(mission);
      this.idempotencyStore.set(input.idempotencyKey, {
        missionId: mission.id,
        fingerprint,
        createdAtMs: nowMs,
      });
      this.eventBus.metrics.commandsAccepted += 1;

      if (resResult.resolutions.length > 0) {
        this.eventBus.metrics.deadlocksResolved += resResult.resolutions.length;
        for (const dlr of resResult.resolutions) {
          this.eventBus.publish({
            topic: 'twin.traffic.deadlock_resolved',
            tenantId: this.world.tenantId,
            siteId: this.world.siteId,
            worldRevision: this.world.worldRevision,
            actorId: principal.actorId,
            payload: dlr,
          });
        }
      }

      this.eventBus.publish({
        topic: 'twin.traffic.reservation',
        tenantId: this.world.tenantId,
        siteId: this.world.siteId,
        worldRevision: this.world.worldRevision,
        actorId: principal.actorId,
        correlationId: mission.id,
        payload: {
          missionId: mission.id,
          vehicleId: selection.vehicle.id,
          reservationCount: mission.reservations.length,
        },
      });

      this.transitionMissionState(
        mission,
        'planned',
        principal.actorId,
        `Route planned (${mission.route?.totalDistanceM ?? 0}m, ${costProfile})`
      );

      if (resResult.policyActionRequired === 'pause_all_and_alert') {
        this.transitionMissionState(
          mission,
          'paused',
          'TRAFFIC-MANAGER',
          `Paused by 'pause_all_and_alert' deadlock policy`
        );
        return {
          mission,
          idempotentReplay: false,
          dryRun: false,
          deadlockResolutions: resResult.resolutions,
        };
      }

      this.safetyGateway.submitOrchestrationIntent({
        tenantId: this.world.tenantId,
        siteId: this.world.siteId,
        vehicleId: selection.vehicle.id,
        missionId: mission.id,
        intentType: 'DISPATCH_PLAN',
      });

      if (input.bomOrderId) {
        this.mes.linkBomDemandToMission(input.bomOrderId, mission.id, principal.actorId);
      }

      if (!selection.vehicle.activeMissionId) {
        this.startMissionOnVehicle(mission, selection.vehicle, principal.actorId);
      } else {
        selection.vehicle.queuedMissionIds.push(mission.id);
        this.sortVehicleQueue(selection.vehicle);
      }

      return {
        mission,
        idempotentReplay: false,
        dryRun: false,
        deadlockResolutions: resResult.resolutions,
      };
    } catch (err) {
      this.eventBus.metrics.commandsRejected += 1;
      if (
        err instanceof TwinDomainError &&
        (err.code === 'UNAUTHORIZED_RBAC' || err.code === 'UNAUTHORIZED_SPATIAL_ABAC')
      ) {
        this.eventBus.publish({
          topic: 'twin.audit.security',
          tenantId: this.world.tenantId,
          siteId: this.world.siteId,
          worldRevision: this.world.worldRevision,
          actorId: principal.actorId,
          payload: { code: err.code, message: err.message, details: err.details },
        });
      }
      throw err;
    }
  }

  private sortVehicleQueue(vehicle: VehicleProfile): void {
    vehicle.queuedMissionIds.sort((aId, bId) => {
      const a = this.getMissionById(aId);
      const b = this.getMissionById(bId);
      return (b?.priority ?? 0) - (a?.priority ?? 0);
    });
  }

  private startMissionOnVehicle(
    mission: Mission,
    vehicle: VehicleProfile,
    actorId: string
  ): void {
    vehicle.activeMissionId = mission.id;
    vehicle.status = 'busy';

    if (mission.loadId) {
      const pallet = this.wms.getPalletById(mission.loadId);
      vehicle.attachment = {
        loadId: mission.loadId,
        loadType: 'pallet',
        label: pallet ? pallet.label : mission.loadId,
        weightKg: mission.payloadKg,
        state: 'in_transit',
        attachedAtIso: new Date().toISOString(),
      };
      if (pallet) {
        this.wms.markPalletInTransit(pallet.id, vehicle.id, actorId);
      }
      this.eventBus.publish({
        topic: 'twin.vehicle.attachment',
        tenantId: this.world.tenantId,
        siteId: this.world.siteId,
        worldRevision: this.world.worldRevision,
        actorId,
        payload: { vehicleId: vehicle.id, missionId: mission.id, attachment: vehicle.attachment },
      });
    }

    if (mission.route && mission.route.segments.length === 0) {
      this.transitionMissionState(mission, 'executing', actorId, 'Arrived at target node');
      this.completeMission(mission, vehicle, actorId);
      return;
    }

    this.transitionMissionState(mission, 'executing', actorId, `Dispatched on ${vehicle.id}`);
  }

  private completeMission(
    mission: Mission,
    vehicle: VehicleProfile,
    actorId: string
  ): void {
    this.traffic.releaseMissionReservations(mission.id);
    this.transitionMissionState(mission, 'completed', actorId, 'Destination pose reached');

    if (vehicle.attachment) {
      const detached = {
        ...vehicle.attachment,
        state: 'detached' as const,
        detachedAtIso: new Date().toISOString(),
      };
      if (mission.loadId) {
        this.wms.markPalletDropped(
          mission.loadId,
          mission.destinationLocationId,
          mission.destinationCode,
          actorId
        );
      }
      vehicle.attachment = null;
      this.eventBus.publish({
        topic: 'twin.vehicle.attachment',
        tenantId: this.world.tenantId,
        siteId: this.world.siteId,
        worldRevision: this.world.worldRevision,
        actorId,
        payload: { vehicleId: vehicle.id, missionId: mission.id, attachment: detached },
      });
    }

    if (mission.bomOrderId) {
      this.mes.completeBomHandoff(mission.id, actorId);
    }

    vehicle.velocityMps = 0;
    vehicle.activeMissionId = null;

    const nextMissionId = vehicle.queuedMissionIds.shift();
    if (nextMissionId) {
      const nextMission = this.getMissionById(nextMissionId);
      if (nextMission && nextMission.state === 'planned') {
        this.startMissionOnVehicle(nextMission, vehicle, actorId);
        return;
      }
    }

    vehicle.status = 'idle';
  }

  // ==========================================================================
  // EP05 Manual Override APIs (Pause / Resume / Reassign / Release Reservation)
  // ==========================================================================

  public pauseMissionById(
    missionId: string,
    principal: ActorPrincipal,
    reason = 'Manual operator mission pause'
  ): Mission {
    assertPermission(principal, 'controlVehicle', 'pause mission');
    const mission = this.getMissionById(missionId);
    if (!mission) {
      throw new TwinDomainError('RESOURCE_NOT_FOUND', `Mission ${missionId} not found`, 404);
    }
    this.transitionMissionState(mission, 'paused', principal.actorId, reason);
    const vehicle = mission.vehicleId ? this.getVehicleById(mission.vehicleId) : undefined;
    if (vehicle && vehicle.activeMissionId === mission.id) {
      vehicle.velocityMps = 0;
      vehicle.status = 'paused';
    }
    mission.decisionExplanation?.overrides.push({
      overrideId: `ovr_${crypto.randomUUID().slice(0, 8)}`,
      action: 'pause',
      actorId: principal.actorId,
      reason,
      timestampIso: new Date().toISOString(),
    });
    this.eventBus.publish({
      topic: 'twin.mission.override',
      tenantId: this.world.tenantId,
      siteId: this.world.siteId,
      worldRevision: this.world.worldRevision,
      actorId: principal.actorId,
      correlationId: mission.id,
      payload: { missionId: mission.id, action: 'pause', reason },
    });
    return mission;
  }

  public resumeMissionById(
    missionId: string,
    principal: ActorPrincipal,
    reason = 'Manual operator mission resume'
  ): Mission {
    assertPermission(principal, 'controlVehicle', 'resume mission');
    const mission = this.getMissionById(missionId);
    if (!mission) {
      throw new TwinDomainError('RESOURCE_NOT_FOUND', `Mission ${missionId} not found`, 404);
    }
    const vehicle = mission.vehicleId ? this.getVehicleById(mission.vehicleId) : undefined;
    if (vehicle?.eStopActive) {
      throw new TwinDomainError(
        'E_STOP_ACTIVE',
        `Cannot resume mission ${missionId} while ${vehicle.id} E-Stop is active`,
        409
      );
    }
    this.transitionMissionState(mission, 'executing', principal.actorId, reason);
    if (vehicle && vehicle.activeMissionId === mission.id) {
      vehicle.status = 'busy';
    }
    mission.decisionExplanation?.overrides.push({
      overrideId: `ovr_${crypto.randomUUID().slice(0, 8)}`,
      action: 'resume',
      actorId: principal.actorId,
      reason,
      timestampIso: new Date().toISOString(),
    });
    this.eventBus.publish({
      topic: 'twin.mission.override',
      tenantId: this.world.tenantId,
      siteId: this.world.siteId,
      worldRevision: this.world.worldRevision,
      actorId: principal.actorId,
      correlationId: mission.id,
      payload: { missionId: mission.id, action: 'resume', reason },
    });
    return mission;
  }

  public reassignMission(
    missionId: string,
    newVehicleId: string,
    principal: ActorPrincipal,
    reason = 'Manual vehicle reassignment'
  ): Mission {
    assertPermission(principal, 'manageControlPlane', 'reassign mission vehicle');
    const mission = this.getMissionById(missionId);
    if (!mission) {
      throw new TwinDomainError('RESOURCE_NOT_FOUND', `Mission ${missionId} not found`, 404);
    }
    if (mission.state === 'completed' || mission.state === 'failed') {
      throw new TwinDomainError(
        'INVALID_STATE_TRANSITION',
        `Cannot reassign terminal mission ${missionId} (${mission.state})`,
        409
      );
    }
    const nextVehicle = this.getVehicleById(newVehicleId);
    if (!nextVehicle) {
      throw new TwinDomainError('RESOURCE_NOT_FOUND', `Vehicle ${newVehicleId} not found`, 404);
    }

    const origin = this.resolveSemanticLocation(mission.originLocationId);
    const dest = this.resolveSemanticLocation(mission.destinationLocationId);
    const cfg = this.controlPlane.getConfig();

    // Validate new vehicle compatibility & route
    const startNode = this.findNearestNavNode(nextVehicle.pose.x, nextVehicle.pose.z);
    const leg1 =
      startNode.id !== origin.navNodeId
        ? findWeightedRouteWithStats({
            world: this.world,
            vehicle: nextVehicle,
            startNodeId: startNode.id,
            goalNodeId: origin.navNodeId,
            costProfile: mission.costProfile,
            routingConfig: cfg.routing,
          }).route
        : null;
    const leg2 = findWeightedRouteWithStats({
      world: this.world,
      vehicle: nextVehicle,
      startNodeId: origin.navNodeId,
      goalNodeId: dest.navNodeId,
      costProfile: mission.costProfile,
      routingConfig: cfg.routing,
    }).route;

    // Detach from old vehicle
    const oldVehicleId = mission.vehicleId;
    if (oldVehicleId) {
      const oldV = this.getVehicleById(oldVehicleId);
      if (oldV) {
        if (oldV.activeMissionId === mission.id) {
          oldV.activeMissionId = null;
          oldV.velocityMps = 0;
          oldV.attachment = null;
          oldV.status = oldV.eStopActive ? 'e_stopped' : 'idle';
        }
        oldV.queuedMissionIds = oldV.queuedMissionIds.filter((id) => id !== mission.id);
      }
    }

    this.traffic.releaseMissionReservations(mission.id);
    const combinedSegments = [...(leg1?.segments ?? []), ...leg2.segments];
    const combinedNodes = leg1 ? [...leg1.nodeIds.slice(0, -1), ...leg2.nodeIds] : [...leg2.nodeIds];
    mission.route = {
      costProfile: mission.costProfile,
      nodeIds: combinedNodes,
      segments: combinedSegments,
      totalDistanceM: Number(combinedSegments.reduce((s, seg) => s + seg.lengthM, 0).toFixed(2)),
      totalCost: Number(combinedSegments.reduce((s, seg) => s + seg.cost, 0).toFixed(3)),
      estimatedDurationSec: Number(
        combinedSegments.reduce((s, seg) => s + seg.estimatedDurationSec, 0).toFixed(2)
      ),
      passesAirlockId: leg2.passesAirlockId,
    };
    mission.vehicleId = nextVehicle.id;
    mission.currentSegmentIndex = 0;
    mission.progressOnSegment = 0;
    mission.updatedAtIso = new Date().toISOString();

    const res = this.traffic.reserveRoute({
      missionId: mission.id,
      vehicleId: nextVehicle.id,
      priority: mission.priority,
      route: mission.route,
      edgesById: this.edgesById,
      trafficConfig: cfg.traffic,
    });
    mission.reservations = res.reservations;

    if (!nextVehicle.activeMissionId) {
      nextVehicle.activeMissionId = mission.id;
      nextVehicle.status = 'busy';
      if (mission.state === 'planned' || mission.state === 'paused') {
        this.transitionMissionState(mission, 'executing', principal.actorId, reason);
      }
    } else {
      nextVehicle.queuedMissionIds.push(mission.id);
    }

    mission.decisionExplanation?.overrides.push({
      overrideId: `ovr_${crypto.randomUUID().slice(0, 8)}`,
      action: 'reassign',
      actorId: principal.actorId,
      reason,
      details: { fromVehicleId: oldVehicleId, toVehicleId: nextVehicle.id },
      timestampIso: new Date().toISOString(),
    });
    if (mission.decisionExplanation) {
      mission.decisionExplanation.selectedVehicleId = nextVehicle.id;
    }

    this.eventBus.publish({
      topic: 'twin.mission.override',
      tenantId: this.world.tenantId,
      siteId: this.world.siteId,
      worldRevision: this.world.worldRevision,
      actorId: principal.actorId,
      correlationId: mission.id,
      payload: {
        missionId: mission.id,
        action: 'reassign',
        fromVehicleId: oldVehicleId,
        toVehicleId: nextVehicle.id,
        reason,
      },
    });

    return mission;
  }

  public releaseReservation(
    reservationId: string,
    principal: ActorPrincipal,
    reason = 'Manual reservation release'
  ): EdgeReservation {
    assertPermission(principal, 'manageControlPlane', 'release traffic edge reservation');
    const released = this.traffic.releaseReservationById(reservationId);
    const mission = this.getMissionById(released.missionId);
    if (mission) {
      mission.reservations = mission.reservations.filter(
        (r) => r.reservationId !== reservationId
      );
      mission.decisionExplanation?.overrides.push({
        overrideId: `ovr_${crypto.randomUUID().slice(0, 8)}`,
        action: 'release_reservation',
        actorId: principal.actorId,
        reason,
        details: { reservationId, edgeId: released.edgeId },
        timestampIso: new Date().toISOString(),
      });
    }

    this.eventBus.publish({
      topic: 'twin.traffic.reservation_released',
      tenantId: this.world.tenantId,
      siteId: this.world.siteId,
      worldRevision: this.world.worldRevision,
      actorId: principal.actorId,
      correlationId: released.missionId,
      payload: { reservationId, edgeId: released.edgeId, vehicleId: released.vehicleId, reason },
    });

    return released;
  }

  // ==========================================================================
  // EP05-F04: Dynamic Rerouting, Lane Closures & Safe Stop
  // ==========================================================================

  public setEdgeClosure(
    edgeId: string,
    closed: boolean,
    reason: string | undefined,
    principal: ActorPrincipal
  ): NavEdge {
    assertPermission(principal, 'manageClosures', 'update lane closure state');
    const edge = this.edgesById.get(edgeId);
    if (!edge) {
      throw new TwinDomainError('RESOURCE_NOT_FOUND', `Lane edge ${edgeId} not found`, 404);
    }

    edge.closed = closed;
    edge.closureReason = closed ? reason || 'Manual operational closure' : undefined;

    this.eventBus.publish({
      topic: 'twin.topology.closure',
      tenantId: this.world.tenantId,
      siteId: this.world.siteId,
      worldRevision: this.world.worldRevision,
      actorId: principal.actorId,
      payload: { edgeId, closed, reason: edge.closureReason },
    });

    if (closed && this.controlPlane.isFlagEnabled('dt.ep05.dynamicReroute')) {
      for (const mission of this.missions) {
        if (
          (mission.state === 'executing' || mission.state === 'planned') &&
          mission.route
        ) {
          const remaining = mission.route.segments.slice(mission.currentSegmentIndex);
          if (remaining.some((s) => s.edgeId === edgeId)) {
            this.replanActiveMission(
              mission,
              principal.actorId,
              `Lane ${edgeId} closed mid-mission`
            );
          }
        }
      }
    }

    return edge;
  }

  public replanActiveMission(
    mission: Mission,
    actorId: string,
    triggerReason: string,
    overrideOptions?: { costProfile?: CostProfile; avoidEdgeIds?: string[] }
  ): Mission {
    if (!mission.vehicleId) return mission;
    const vehicle = this.getVehicleById(mission.vehicleId);
    const destLoc = this.world.locations.find((l) => l.id === mission.destinationLocationId);
    if (!vehicle || !destLoc) return mission;

    const cfg = this.controlPlane.getConfig();
    if (mission.replanCount >= cfg.mission.maxReplans) {
      this.safeStopMission(
        mission,
        vehicle,
        actorId,
        `Max replans (${cfg.mission.maxReplans}) exceeded on trigger: ${triggerReason}`
      );
      return mission;
    }

    const currentNode = this.findNearestNavNode(vehicle.pose.x, vehicle.pose.z);
    const profileToUse = overrideOptions?.costProfile ?? mission.costProfile;

    try {
      const resRoute = findWeightedRouteWithStats({
        world: this.world,
        vehicle,
        startNodeId: currentNode.id,
        goalNodeId: destLoc.navNodeId,
        costProfile: profileToUse,
        routingConfig: cfg.routing,
        edgeCongestion: this.buildEdgeCongestionMap(),
        avoidEdgeIds: overrideOptions?.avoidEdgeIds
          ? new Set(overrideOptions.avoidEdgeIds)
          : undefined,
      });

      this.traffic.releaseMissionReservations(mission.id);
      const res = this.traffic.reserveRoute({
        missionId: mission.id,
        vehicleId: vehicle.id,
        priority: mission.priority,
        route: resRoute.route,
        edgesById: this.edgesById,
        trafficConfig: cfg.traffic,
      });

      mission.costProfile = profileToUse;
      mission.route = resRoute.route;
      mission.reservations = res.reservations;
      mission.currentSegmentIndex = 0;
      mission.progressOnSegment = 0;
      mission.replanCount += 1;
      mission.updatedAtIso = new Date().toISOString();
      this.eventBus.metrics.replansTriggered += 1;

      if (mission.decisionExplanation) {
        mission.decisionExplanation.overrides.push({
          overrideId: `ovr_${crypto.randomUUID().slice(0, 8)}`,
          action: 'replan',
          actorId,
          reason: triggerReason,
          details: { costProfile: profileToUse, expandedNodes: resRoute.expandedNodes },
          timestampIso: mission.updatedAtIso,
        });
      }

      this.eventBus.publish({
        topic: 'twin.mission.rerouted',
        tenantId: mission.tenantId,
        siteId: mission.siteId,
        worldRevision: mission.worldRevision,
        actorId,
        correlationId: mission.id,
        payload: {
          missionId: mission.id,
          vehicleId: vehicle.id,
          reason: triggerReason,
          replanCount: mission.replanCount,
          newDistanceM: resRoute.route.totalDistanceM,
        },
      });

      return mission;
    } catch (err) {
      this.safeStopMission(
        mission,
        vehicle,
        actorId,
        `Safe stop after replan failure (${triggerReason}): ${
          err instanceof Error ? err.message : 'unreachable'
        }`
      );
      return mission;
    }
  }

  public safeStopMission(
    mission: Mission,
    vehicle: VehicleProfile,
    actorId: string,
    reason: string
  ): void {
    this.traffic.releaseMissionReservations(mission.id);
    vehicle.velocityMps = 0;
    vehicle.activeMissionId = null;
    vehicle.status = vehicle.eStopActive ? 'e_stopped' : 'idle';
    mission.failureReason = reason;

    this.safetyGateway.submitOrchestrationIntent({
      tenantId: this.world.tenantId,
      siteId: this.world.siteId,
      vehicleId: vehicle.id,
      missionId: mission.id,
      intentType: 'CANCEL_INTENT',
    });

    if (mission.state !== 'completed' && mission.state !== 'failed') {
      this.transitionMissionState(mission, 'failed', actorId, reason);
    }
  }

  // ==========================================================================
  // EP06-F03 & F05: Telemetry Ingestion, Stale Detection, Controls, E-Stop
  // ==========================================================================

  public ingestVehicleTelemetry(
    rawInput: unknown,
    tenantId: string,
    siteId: string
  ): VehicleProfile {
    if (tenantId !== this.world.tenantId || siteId !== this.world.siteId) {
      throw new TwinDomainError(
        'UNAUTHORIZED_RBAC',
        `Telemetry tenant/site mismatch (${tenantId}/${siteId})`,
        403
      );
    }

    const parsed = VehicleTelemetrySchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new TwinDomainError('VALIDATION_ERROR', 'Invalid vehicle telemetry payload', 400, {
        issues: parsed.error.issues,
      });
    }
    const input: VehicleTelemetryInput = parsed.data;
    const vehicle = this.getVehicleById(input.vehicleId);
    if (!vehicle) {
      throw new TwinDomainError('RESOURCE_NOT_FOUND', `Vehicle ${input.vehicleId} not found`, 404);
    }

    if (input.sequence < vehicle.telemetrySequence) {
      throw new TwinDomainError(
        'VALIDATION_ERROR',
        `Out-of-order telemetry sequence ${input.sequence} < ${vehicle.telemetrySequence}`,
        409
      );
    }

    const cfg = this.controlPlane.getConfig();
    const driftMeters = Math.hypot(
      input.pose.x - vehicle.pose.x,
      input.pose.z - vehicle.pose.z
    );

    vehicle.pose = input.pose;
    vehicle.velocityMps = input.velocityMps;
    if (typeof input.batteryPct === 'number') {
      vehicle.batteryPct = input.batteryPct;
    }
    vehicle.lastTelemetryMs = input.timestampMs;
    vehicle.telemetrySequence = input.sequence;
    vehicle.driftMeters = Number(driftMeters.toFixed(2));
    vehicle.staleThresholdMs = cfg.vehicleRuntime.staleTelemetryMs;
    vehicle.isStale = Date.now() - input.timestampMs > cfg.vehicleRuntime.staleTelemetryMs;

    if (vehicle.isStale) {
      vehicle.status = 'stale';
    } else if (vehicle.status === 'stale') {
      vehicle.status = vehicle.activeMissionId ? 'busy' : 'idle';
    }

    if (
      vehicle.activeMissionId &&
      driftMeters > cfg.mission.deviationThresholdMeters &&
      this.controlPlane.isFlagEnabled('dt.ep05.dynamicReroute')
    ) {
      const mission = this.getMissionById(vehicle.activeMissionId);
      if (mission && mission.state === 'executing') {
        this.replanActiveMission(
          mission,
          'TELEMETRY-MONITOR',
          `Pose drift (${driftMeters.toFixed(2)}m) exceeded ${cfg.mission.deviationThresholdMeters}m threshold`
        );
      }
    }

    this.evaluateStaleMetrics();

    this.eventBus.publish({
      topic: vehicle.isStale ? 'twin.vehicle.stale' : 'twin.vehicle.pose',
      tenantId: this.world.tenantId,
      siteId: this.world.siteId,
      worldRevision: this.world.worldRevision,
      actorId: vehicle.id,
      payload: {
        vehicleId: vehicle.id,
        pose: vehicle.pose,
        velocityMps: vehicle.velocityMps,
        isStale: vehicle.isStale,
        driftMeters: vehicle.driftMeters,
      },
    });

    return vehicle;
  }

  public injectStaleTelemetryState(
    vehicleId: string,
    stale: boolean,
    principal: ActorPrincipal
  ): VehicleProfile {
    assertPermission(principal, 'controlVehicle', 'simulate or recover telemetry staleness');
    const vehicle = this.getVehicleById(vehicleId);
    if (!vehicle) {
      throw new TwinDomainError('RESOURCE_NOT_FOUND', `Vehicle ${vehicleId} not found`, 404);
    }
    const staleMs = this.controlPlane.getConfig().vehicleRuntime.staleTelemetryMs;
    vehicle.staleThresholdMs = staleMs;
    if (stale) {
      vehicle.lastTelemetryMs = Date.now() - staleMs - 4000;
      vehicle.isStale = true;
      vehicle.status = 'stale';
      vehicle.velocityMps = 0;
    } else {
      vehicle.lastTelemetryMs = Date.now();
      vehicle.isStale = false;
      vehicle.status = vehicle.eStopActive
        ? 'e_stopped'
        : vehicle.activeMissionId
          ? 'busy'
          : 'idle';
    }
    this.evaluateStaleMetrics();

    this.eventBus.publish({
      topic: 'twin.vehicle.stale',
      tenantId: this.world.tenantId,
      siteId: this.world.siteId,
      worldRevision: this.world.worldRevision,
      actorId: principal.actorId,
      payload: { vehicleId: vehicle.id, isStale: vehicle.isStale, status: vehicle.status },
    });

    return vehicle;
  }

  private evaluateStaleMetrics(): void {
    const now = Date.now();
    const staleMs = this.controlPlane.getConfig().vehicleRuntime.staleTelemetryMs;
    let staleCount = 0;
    let eStopCount = 0;
    for (const v of this.vehicles) {
      v.staleThresholdMs = staleMs;
      if (now - v.lastTelemetryMs > staleMs) {
        if (!v.isStale) {
          v.isStale = true;
          v.status = 'stale';
        }
      }
      if (v.isStale) staleCount += 1;
      if (v.eStopActive) eStopCount += 1;
    }
    this.eventBus.metrics.staleVehiclesCount = staleCount;
    this.eventBus.metrics.eStopsActiveCount = eStopCount;
  }

  public pauseVehicleOrMission(
    vehicleId: string,
    principal: ActorPrincipal
  ): VehicleProfile {
    assertPermission(principal, 'controlVehicle', 'pause vehicle');
    const vehicle = this.getVehicleById(vehicleId);
    if (!vehicle) {
      throw new TwinDomainError('RESOURCE_NOT_FOUND', `Vehicle ${vehicleId} not found`, 404);
    }

    vehicle.velocityMps = 0;
    vehicle.status = 'paused';

    if (vehicle.activeMissionId) {
      const mission = this.getMissionById(vehicle.activeMissionId);
      if (mission && mission.state === 'executing') {
        this.transitionMissionState(mission, 'paused', principal.actorId, 'Paused by operator');
      }
    }

    this.safetyGateway.submitOrchestrationIntent({
      tenantId: this.world.tenantId,
      siteId: this.world.siteId,
      vehicleId: vehicle.id,
      missionId: vehicle.activeMissionId ?? undefined,
      intentType: 'PAUSE_INTENT',
    });

    return vehicle;
  }

  public resumeVehicleOrMission(
    vehicleId: string,
    principal: ActorPrincipal
  ): VehicleProfile {
    assertPermission(principal, 'controlVehicle', 'resume vehicle');
    const vehicle = this.getVehicleById(vehicleId);
    if (!vehicle) {
      throw new TwinDomainError('RESOURCE_NOT_FOUND', `Vehicle ${vehicleId} not found`, 404);
    }
    if (vehicle.eStopActive) {
      throw new TwinDomainError(
        'E_STOP_ACTIVE',
        `Cannot resume ${vehicle.id} while E-Stop is active and unacknowledged`,
        409
      );
    }

    vehicle.status = vehicle.activeMissionId ? 'busy' : 'idle';
    if (vehicle.activeMissionId) {
      const mission = this.getMissionById(vehicle.activeMissionId);
      if (mission && mission.state === 'paused') {
        this.transitionMissionState(
          mission,
          'executing',
          principal.actorId,
          'Resumed by operator'
        );
      }
    }

    this.safetyGateway.submitOrchestrationIntent({
      tenantId: this.world.tenantId,
      siteId: this.world.siteId,
      vehicleId: vehicle.id,
      missionId: vehicle.activeMissionId ?? undefined,
      intentType: 'RESUME_INTENT',
    });

    return vehicle;
  }

  public cancelMission(
    missionId: string,
    principal: ActorPrincipal,
    reason = 'Cancelled by operator'
  ): Mission {
    assertPermission(principal, 'controlVehicle', 'cancel mission');
    const mission = this.getMissionById(missionId);
    if (!mission) {
      throw new TwinDomainError('RESOURCE_NOT_FOUND', `Mission ${missionId} not found`, 404);
    }

    const vehicle = mission.vehicleId ? this.getVehicleById(mission.vehicleId) : undefined;
    if (vehicle) {
      if (vehicle.activeMissionId === mission.id) {
        this.safeStopMission(mission, vehicle, principal.actorId, reason);
      } else {
        vehicle.queuedMissionIds = vehicle.queuedMissionIds.filter((id) => id !== mission.id);
        this.traffic.releaseMissionReservations(mission.id);
        this.transitionMissionState(mission, 'failed', principal.actorId, reason);
      }
    } else {
      this.traffic.releaseMissionReservations(mission.id);
      this.transitionMissionState(mission, 'failed', principal.actorId, reason);
    }

    return mission;
  }

  public triggerEStop(
    vehicleId: string,
    reason: string,
    principal: ActorPrincipal
  ): VehicleProfile {
    assertPermission(principal, 'controlVehicle', 'trigger twin E-Stop visualization');
    const vehicle = this.getVehicleById(vehicleId);
    if (!vehicle) {
      throw new TwinDomainError('RESOURCE_NOT_FOUND', `Vehicle ${vehicleId} not found`, 404);
    }

    vehicle.eStopActive = true;
    vehicle.eStopReason = reason || 'Manual twin E-Stop triggered';
    vehicle.eStopAcknowledgedBy = undefined;
    vehicle.eStopAcknowledgedAtIso = undefined;
    vehicle.velocityMps = 0;
    vehicle.status = 'e_stopped';

    if (vehicle.activeMissionId) {
      const mission = this.getMissionById(vehicle.activeMissionId);
      if (mission && mission.state === 'executing') {
        this.transitionMissionState(
          mission,
          'paused',
          principal.actorId,
          `E-Stop latched: ${vehicle.eStopReason}`
        );
      }
    }

    this.safetyGateway.submitOrchestrationIntent({
      tenantId: this.world.tenantId,
      siteId: this.world.siteId,
      vehicleId: vehicle.id,
      missionId: vehicle.activeMissionId ?? undefined,
      intentType: 'ESTOP_LATCH_TWIN',
    });

    this.evaluateStaleMetrics();

    this.eventBus.publish({
      topic: 'twin.vehicle.estop',
      tenantId: this.world.tenantId,
      siteId: this.world.siteId,
      worldRevision: this.world.worldRevision,
      actorId: principal.actorId,
      payload: {
        vehicleId: vehicle.id,
        eStopActive: true,
        reason: vehicle.eStopReason,
        physicalIoActuated: false,
      },
    });

    return vehicle;
  }

  public acknowledgeEStop(
    vehicleId: string,
    principal: ActorPrincipal
  ): VehicleProfile {
    assertPermission(principal, 'ackEstop', 'acknowledge and clear E-Stop');
    const vehicle = this.getVehicleById(vehicleId);
    if (!vehicle) {
      throw new TwinDomainError('RESOURCE_NOT_FOUND', `Vehicle ${vehicleId} not found`, 404);
    }

    vehicle.eStopActive = false;
    vehicle.eStopAcknowledgedBy = principal.actorId;
    vehicle.eStopAcknowledgedAtIso = new Date().toISOString();
    vehicle.status = vehicle.activeMissionId ? 'paused' : 'idle';
    this.evaluateStaleMetrics();

    this.eventBus.publish({
      topic: 'twin.vehicle.estop',
      tenantId: this.world.tenantId,
      siteId: this.world.siteId,
      worldRevision: this.world.worldRevision,
      actorId: principal.actorId,
      payload: {
        vehicleId: vehicle.id,
        eStopActive: false,
        acknowledgedBy: principal.actorId,
        acknowledgedAtIso: vehicle.eStopAcknowledgedAtIso,
      },
    });

    return vehicle;
  }

  public tick(dtSec = 0.25): void {
    const now = Date.now();

    for (const vehicle of this.vehicles) {
      if (!vehicle.isStale && vehicle.status !== 'stale') {
        vehicle.lastTelemetryMs = now;
      }

      if (vehicle.eStopActive || vehicle.isStale || vehicle.status === 'paused') {
        vehicle.velocityMps = 0;
        continue;
      }

      if (!vehicle.activeMissionId) continue;
      const mission = this.getMissionById(vehicle.activeMissionId);
      if (!mission || mission.state !== 'executing' || !mission.route) continue;

      const seg = mission.route.segments[mission.currentSegmentIndex];
      if (!seg) {
        this.completeMission(mission, vehicle, 'FLEET-ORCHESTRATOR');
        continue;
      }

      const fromNode = this.nodesById.get(seg.fromNodeId);
      const toNode = this.nodesById.get(seg.toNodeId);
      const edge = this.edgesById.get(seg.edgeId);
      if (!fromNode || !toNode || !edge) continue;

      const targetSpeed = Math.min(vehicle.maxSpeedMps, edge.speedLimitMps);
      const distProgress = (targetSpeed * dtSec) / Math.max(0.2, seg.lengthM);
      mission.progressOnSegment += distProgress;
      vehicle.velocityMps = Number(targetSpeed.toFixed(2));
      vehicle.batteryPct = Math.max(5, Number((vehicle.batteryPct - dtSec * 0.015).toFixed(2)));

      if (mission.progressOnSegment >= 1) {
        vehicle.pose = {
          x: toNode.x,
          y: toNode.y,
          z: toNode.z,
          headingRad: Math.atan2(toNode.x - fromNode.x, toNode.z - fromNode.z),
        };
        this.wms.recordTraversalAt(toNode.x, toNode.z);
        mission.currentSegmentIndex += 1;
        mission.progressOnSegment = 0;

        if (mission.currentSegmentIndex >= mission.route.segments.length) {
          this.completeMission(mission, vehicle, 'FLEET-ORCHESTRATOR');
        }
      } else {
        const t = mission.progressOnSegment;
        const x = fromNode.x + (toNode.x - fromNode.x) * t;
        const z = fromNode.z + (toNode.z - fromNode.z) * t;
        const targetHeading = Math.atan2(toNode.x - fromNode.x, toNode.z - fromNode.z);

        vehicle.pose = {
          x: Number(x.toFixed(3)),
          y: 0,
          z: Number(z.toFixed(3)),
          headingRad: Number(targetHeading.toFixed(3)),
        };
      }

      vehicle.telemetrySequence += 1;

      this.eventBus.publish({
        topic: 'twin.vehicle.pose',
        tenantId: this.world.tenantId,
        siteId: this.world.siteId,
        worldRevision: this.world.worldRevision,
        actorId: vehicle.id,
        payload: {
          vehicleId: vehicle.id,
          pose: vehicle.pose,
          velocityMps: vehicle.velocityMps,
          batteryPct: vehicle.batteryPct,
          missionId: mission.id,
          progressOnSegment: mission.progressOnSegment,
        },
      });
    }

    this.evaluateStaleMetrics();
  }

  private findNearestNavNode(x: number, z: number): NavNode {
    let best = this.world.navNodes[0];
    let bestDist = Infinity;
    for (const node of this.world.navNodes) {
      const d = Math.hypot(node.x - x, node.z - z);
      if (d < bestDist) {
        bestDist = d;
        best = node;
      }
    }
    return best;
  }

  public getFullSnapshot(): TwinFullSnapshot {
    const config = this.controlPlane.getConfig();
    return {
      schemaVersion: P2_CONTRACT_VERSION,
      context: {
        tenantId: this.world.tenantId,
        siteId: this.world.siteId,
        worldRevision: config.worldRevisionPin || this.world.worldRevision,
      },
      config,
      flags: this.controlPlane.getFlags(),
      world: {
        siteName: this.world.siteName,
        zones: this.world.zones,
        locations: this.world.locations,
        navNodes: this.world.navNodes,
        navEdges: this.world.navEdges,
      },
      vehicles: this.vehicles,
      missions: this.missions,
      reservations: this.traffic.getReservations(),
      deadlockResolutions: this.traffic.getDeadlockHistory(),
      wms: {
        pallets: this.wms.getPallets(),
        occupancy: this.wms.computeBinOccupancy(),
        flows: this.wms.getFlows(),
        heatmaps: this.wms.getHeatmaps(),
        opportunities: this.wms.getOpportunities(),
      },
      mes: {
        assets: this.mes.getAssets(),
        bomDemands: this.mes.getBomDemands(),
        batches: this.mes.getBatches(),
        gmpRules: this.mes.getGmpRules(),
        maintenanceWindows: this.mes.getMaintenanceWindows(),
      },
      tasks: this.tasks,
      metrics: { ...this.eventBus.metrics },
      safetyIntents: this.safetyGateway.getRecentIntents(
        this.world.tenantId,
        this.world.siteId
      ),
      autopilot: this.autopilotProvider?.(),
    };
  }
}
