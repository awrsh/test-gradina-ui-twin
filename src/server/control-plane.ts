import type { ActorPrincipal } from '../shared/p1-contracts.ts';
import {
  ActuationModeChangeSchema,
  TwinDomainError,
  TwinOpsConfigPatchSchema,
} from '../shared/p2-contracts.ts';
import type {
  ActuationMode,
  TwinFeatureFlags,
  TwinOpsConfig,
} from '../shared/p2-contracts.ts';
import { ACTOR_DIRECTORY, assertPermission } from './auth-rbac.ts';
import type { TwinEventBus } from './event-bus.ts';

export function createDefaultTwinOpsConfig(): TwinOpsConfig {
  return {
    actuationMode: 'twin_only',
    worldRevisionPin: undefined,
    routing: {
      algorithm: 'weighted_astar',
      defaultCostProfile: 'fastest',
      costs: {
        distance: 1.0,
        turn: 0.6,
        elevation: 1.2,
        congestion: 1.5,
        closurePenalty: 1000,
      },
      maxExpandNodes: 500,
      allowPartialPath: false,
    },
    traffic: {
      edgeReservationEnabled: true,
      reservationHorizonSec: 120,
      edgeCapacityDefault: 1,
      intersectionPolicy: 'yield',
      deadlockDetectionIntervalMs: 500,
      deadlockResolvePolicy: 'replan_lowest_priority',
    },
    dispatch: {
      scoring: {
        wDistance: 1.0,
        wBattery: 0.35,
        wWorkload: 25.0,
        wCapabilityFit: 15.0,
      },
      minBatteryPct: 20,
      maxQueueDepthPerVehicle: 3,
      autoAssign: true,
    },
    mission: {
      staleCommandTimeoutSec: 60,
      maxReplans: 3,
      deviationThresholdMeters: 2.2,
      idempotencyTtlSec: 3600,
    },
    vehicleRuntime: {
      poseInterpolation: true,
      maxExtrapolateMs: 250,
      staleTelemetryMs: 5000,
      driftThresholdMeters: 2.2,
      easing: 'easeInOut',
    },
    wms: {
      occupancyBands: { low: 30, mid: 70, high: 90 },
      heatmapWindowMin: 30,
      quarantineBlocksPutaway: true,
      quarantineBlocksPicking: true,
    },
    mes: {
      oeeWindowMin: 60,
      gmpEnforcement: 'block',
      maintenanceBlocksDispatch: true,
    },
    ui: {
      defaultOverlays: ['lanes'],
      cameraFollowSelectedVehicle: false,
    },
  };
}

export function createDefaultFeatureFlags(): TwinFeatureFlags {
  return {
    'dt.safety.physicalActuationAllowed': false,
    'dt.ep05.semanticCommands': true,
    'dt.ep05.weightedAstar': true,
    'dt.ep05.edgeReservations': true,
    'dt.ep05.autoDeadlockResolve': true,
    'dt.ep05.dynamicReroute': true,
    'dt.ep05.autoDispatch': true,
  };
}

export class TwinControlPlaneService {
  private config: TwinOpsConfig = createDefaultTwinOpsConfig();
  private flags: TwinFeatureFlags = createDefaultFeatureFlags();

  private readonly tenantId: string;
  private readonly siteId: string;
  private readonly worldRevision: string;
  private readonly eventBus: TwinEventBus;

  constructor(
    tenantId: string,
    siteId: string,
    worldRevision: string,
    eventBus: TwinEventBus
  ) {
    this.tenantId = tenantId;
    this.siteId = siteId;
    this.worldRevision = worldRevision;
    this.eventBus = eventBus;
  }

  public getConfig(): TwinOpsConfig {
    return structuredClone(this.config);
  }

  public getFlags(): TwinFeatureFlags {
    return { ...this.flags };
  }

  public isFlagEnabled(flag: keyof TwinFeatureFlags): boolean {
    return Boolean(this.flags[flag]);
  }

  public patchConfig(
    rawPatch: unknown,
    principal: ActorPrincipal,
    reason = 'Control plane parameter update'
  ): TwinOpsConfig {
    assertPermission(principal, 'manageControlPlane', 'modify TwinOpsConfig');

    const parsed = TwinOpsConfigPatchSchema.safeParse(rawPatch);
    if (!parsed.success) {
      throw new TwinDomainError('VALIDATION_ERROR', 'Invalid TwinOpsConfig patch', 400, {
        issues: parsed.error.issues,
      });
    }
    const p = parsed.data;

    if (p.worldRevisionPin !== undefined) this.config.worldRevisionPin = p.worldRevisionPin;
    if (p.routing) {
      this.config.routing = {
        ...this.config.routing,
        ...p.routing,
        costs: { ...this.config.routing.costs, ...(p.routing.costs || {}) },
        algorithm: 'weighted_astar',
        allowPartialPath: false,
      };
    }
    if (p.traffic) {
      this.config.traffic = { ...this.config.traffic, ...p.traffic };
    }
    if (p.dispatch) {
      this.config.dispatch = {
        ...this.config.dispatch,
        ...p.dispatch,
        scoring: { ...this.config.dispatch.scoring, ...(p.dispatch.scoring || {}) },
      };
    }
    if (p.mission) {
      this.config.mission = { ...this.config.mission, ...p.mission };
    }
    if (p.vehicleRuntime) {
      this.config.vehicleRuntime = { ...this.config.vehicleRuntime, ...p.vehicleRuntime };
    }
    if (p.wms) {
      this.config.wms = {
        ...this.config.wms,
        ...p.wms,
        occupancyBands: {
          ...this.config.wms.occupancyBands,
          ...(p.wms.occupancyBands || {}),
        },
      };
    }
    if (p.mes) {
      this.config.mes = { ...this.config.mes, ...p.mes };
    }
    if (p.ui) {
      this.config.ui = { ...this.config.ui, ...p.ui };
    }

    this.eventBus.publish({
      topic: 'twin.config.updated',
      tenantId: this.tenantId,
      siteId: this.siteId,
      worldRevision: this.worldRevision,
      actorId: principal.actorId,
      payload: { reason, patch: p, updatedConfig: this.config },
    });

    return this.getConfig();
  }

  public patchFlags(
    patch: Partial<TwinFeatureFlags>,
    principal: ActorPrincipal,
    reason = 'Feature flag update'
  ): TwinFeatureFlags {
    assertPermission(principal, 'manageControlPlane', 'toggle feature flags');

    const validKeys = new Set(Object.keys(this.flags));
    for (const [k, v] of Object.entries(patch)) {
      if (!validKeys.has(k) || typeof v !== 'boolean') {
        throw new TwinDomainError(
          'VALIDATION_ERROR',
          `Invalid feature flag key or boolean value: ${k}`,
          400
        );
      }
      if (k === 'dt.safety.physicalActuationAllowed') {
        assertPermission(
          principal,
          'manageSafetyMode',
          'modify physical actuation safety feature flag'
        );
      }
      this.flags[k as keyof TwinFeatureFlags] = v;
    }

    // Safety fallback: if physical actuation flag is turned off, revert actuationMode to twin_only
    if (!this.flags['dt.safety.physicalActuationAllowed'] && this.config.actuationMode === 'physical') {
      this.config.actuationMode = 'twin_only';
    }

    this.eventBus.publish({
      topic: 'twin.flag.updated',
      tenantId: this.tenantId,
      siteId: this.siteId,
      worldRevision: this.worldRevision,
      actorId: principal.actorId,
      payload: { reason, patch, flags: this.getFlags() },
    });

    return this.getFlags();
  }

  public setActuationMode(
    rawInput: unknown,
    principal: ActorPrincipal
  ): { actuationMode: ActuationMode } {
    assertPermission(principal, 'manageSafetyMode', 'change twin actuationMode');

    const parsed = ActuationModeChangeSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new TwinDomainError('VALIDATION_ERROR', 'Invalid actuationMode request', 400, {
        issues: parsed.error.issues,
      });
    }
    const input = parsed.data;

    if (input.actuationMode === 'physical') {
      if (!this.flags['dt.safety.physicalActuationAllowed']) {
        throw new TwinDomainError(
          'SAFETY_INTERLOCK_REQUIRED',
          "Cannot enter 'physical' actuation mode: feature flag 'dt.safety.physicalActuationAllowed' is false",
          409,
          { flag: 'dt.safety.physicalActuationAllowed' }
        );
      }
      if (input.confirmPhrase !== 'ENABLE_PHYSICAL_INTERLOCK') {
        throw new TwinDomainError(
          'SAFETY_INTERLOCK_REQUIRED',
          "Physical actuation mode requires explicit confirmPhrase 'ENABLE_PHYSICAL_INTERLOCK'",
          409
        );
      }
      if (
        !input.secondaryApproverId ||
        input.secondaryApproverId === principal.actorId ||
        !ACTOR_DIRECTORY[input.secondaryApproverId]?.permissions.manageSafetyMode
      ) {
        throw new TwinDomainError(
          'SAFETY_INTERLOCK_REQUIRED',
          'Physical actuation mode requires a distinct authorized secondaryApproverId (dual confirmation)',
          409,
          { primaryActorId: principal.actorId, secondaryApproverId: input.secondaryApproverId }
        );
      }
    }

    const prevMode = this.config.actuationMode;
    this.config.actuationMode = input.actuationMode;

    this.eventBus.publish({
      topic: 'twin.safety.actuation_mode_changed',
      tenantId: this.tenantId,
      siteId: this.siteId,
      worldRevision: this.worldRevision,
      actorId: principal.actorId,
      payload: {
        previousMode: prevMode,
        actuationMode: input.actuationMode,
        reason: input.reason,
        secondaryApproverId: input.secondaryApproverId,
      },
    });

    this.eventBus.publish({
      topic: 'twin.audit.security',
      tenantId: this.tenantId,
      siteId: this.siteId,
      worldRevision: this.worldRevision,
      actorId: principal.actorId,
      payload: {
        action: 'ACTUATION_MODE_CHANGE',
        from: prevMode,
        to: input.actuationMode,
        reason: input.reason,
        secondaryApproverId: input.secondaryApproverId,
      },
    });

    return { actuationMode: this.config.actuationMode };
  }
}
