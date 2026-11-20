import { describe, expect, it } from 'vitest';
import { resolvePrincipal } from '../src/server/auth-rbac';
import { TwinSiteOrchestrator } from '../src/server/mission-orchestrator';
import { findWeightedRoute } from '../src/server/pathfinding';
import { DEFAULT_SITE_ID, DEFAULT_TENANT_ID } from '../src/server/seed-data';
import { TwinDomainError } from '../src/shared/p2-contracts';

const dispatcher = resolvePrincipal({ actorId: 'DISP-01' });
const operator = resolvePrincipal({ actorId: 'OP-01' });
const supervisor = resolvePrincipal({ actorId: 'SUP-01' });
const qaLead = resolvePrincipal({ actorId: 'QA-01' });
const viewer = resolvePrincipal({ actorId: 'VIEW-01' });

describe('Gradian Digital Twin — P2 Operations Suite', () => {
  it('EP05-F01: resolves semantic locations and enforces RBAC / Spatial ABAC / schema validation', () => {
    const orch = new TwinSiteOrchestrator();

    const loc = orch.resolveSemanticLocation('BIN-A1-01');
    expect(loc.id).toBe('LOC-BIN-A1-01');

    // Negative: unknown location
    expect(() => orch.resolveSemanticLocation('NON-EXISTENT-BIN')).toThrowError(
      TwinDomainError
    );
    try {
      orch.resolveSemanticLocation('NON-EXISTENT-BIN');
    } catch (e) {
      expect((e as TwinDomainError).code).toBe('LOCATION_NOT_FOUND');
    }

    // Negative: ambiguous query ('BIN-A1' matches BIN-A1-01 and BIN-A1-02)
    try {
      orch.resolveSemanticLocation('BIN-A1');
      expect.unreachable();
    } catch (e) {
      expect((e as TwinDomainError).code).toBe('LOCATION_AMBIGUOUS');
    }

    // Negative: viewer lacks issueMove permission
    try {
      orch.submitMoveCommand(
        {
          idempotencyKey: 'cmd-viewer-1',
          originId: 'DOCK-IN-01',
          destinationId: 'BIN-A1-01',
        },
        viewer
      );
      expect.unreachable();
    } catch (e) {
      expect((e as TwinDomainError).code).toBe('UNAUTHORIZED_RBAC');
    }

    // Negative: tenant mismatch rejected
    expect(() =>
      resolvePrincipal({
        actorId: 'DISP-01',
        tenantId: 'other-tenant',
        siteId: DEFAULT_SITE_ID,
      })
    ).toThrowError(TwinDomainError);
  });

  it('EP05-F02: weighted A* respects vehicle dimensions/zones and cost profiles (fastest/safest/shortest)', () => {
    const orch = new TwinSiteOrchestrator();
    const amr = orch.getVehicleById('VEH-AMR-01')!;
    const forklift = orch.getVehicleById('VEH-FLT-03')!;

    // Forklift (width 1.3m, height 2.4m, Warehouse only) cannot traverse narrow edge (1.0m x 1.8m)
    const narrowEdge = orch.world.navEdges.find((e) => e.id === 'EDGE-NARROW-01')!;
    expect(forklift.dimensions.widthM).toBeGreaterThan(narrowEdge.maxWidthM);

    // Forklift cannot route into Grade C Prep room
    try {
      findWeightedRoute({
        world: orch.world,
        vehicle: forklift,
        startNodeId: 'N-AISLE-W',
        goalNodeId: 'N-BUF-IN-01',
        costProfile: 'fastest',
      });
      expect.unreachable();
    } catch (e) {
      expect((e as TwinDomainError).code).toBe('INCOMPATIBLE_VEHICLE');
    }

    // AMR can route with fastest, safest, and shortest profiles
    const fastest = findWeightedRoute({
      world: orch.world,
      vehicle: amr,
      startNodeId: 'N-NORTH-W',
      goalNodeId: 'N-STAGE-OUT',
      costProfile: 'fastest',
    });
    const safest = findWeightedRoute({
      world: orch.world,
      vehicle: amr,
      startNodeId: 'N-NORTH-W',
      goalNodeId: 'N-STAGE-OUT',
      costProfile: 'safest',
    });
    const shortest = findWeightedRoute({
      world: orch.world,
      vehicle: amr,
      startNodeId: 'N-NORTH-W',
      goalNodeId: 'N-STAGE-OUT',
      costProfile: 'shortest',
    });

    expect(fastest.segments.length).toBeGreaterThan(0);
    expect(shortest.totalDistanceM).toBeLessThanOrEqual(safest.totalDistanceM + 0.01);
    expect(safest.segments.some((s) => s.edgeId.startsWith('LANE-MAIN'))).toBe(true);
  });

  it('EP05-F03: enforces time-window edge reservations and detects/resolves deadlock cycles', () => {
    const orch = new TwinSiteOrchestrator();
    const now = Date.now();

    // Acquire edge reservation for VEH-AMR-01
    orch.traffic.tryAcquireWindow({
      edgeId: 'LANE-MAIN-01',
      fromNodeId: 'N-AISLE-W',
      toNodeId: 'N-AISLE-C',
      vehicleId: 'VEH-AMR-01',
      missionId: 'MSN-TEST-1',
      startMs: now,
      endMs: now + 5000,
    });

    // Double-booking same edge window by VEH-AGV-02 must throw RESERVATION_CONFLICT
    try {
      orch.traffic.tryAcquireWindow({
        edgeId: 'LANE-MAIN-01',
        fromNodeId: 'N-AISLE-C',
        toNodeId: 'N-AISLE-W',
        vehicleId: 'VEH-AGV-02',
        missionId: 'MSN-TEST-2',
        startMs: now + 1000,
        endMs: now + 4000,
      });
      expect.unreachable();
    } catch (e) {
      expect((e as TwinDomainError).code).toBe('RESERVATION_CONFLICT');
    }

    // Deadlock cycle detection & resolution
    const resolution = orch.traffic.detectAndResolveCycle([
      { vehicleId: 'VEH-AMR-01', holdingEdgeId: 'E1', waitingForEdgeId: 'E2', priority: 8 },
      { vehicleId: 'VEH-AGV-02', holdingEdgeId: 'E2', waitingForEdgeId: 'E1', priority: 4 },
    ]);
    expect(resolution).not.toBeNull();
    expect(resolution!.winnerVehicleId).toBe('VEH-AMR-01');
    expect(resolution!.yieldVehicleId).toBe('VEH-AGV-02');
    expect(resolution!.policy).toBe('replan');
  });

  it('EP05-F04 & F06: handles idempotency, mid-mission dynamic rerouting, safe stop, and legal state transitions', () => {
    const orch = new TwinSiteOrchestrator();

    const first = orch.submitMoveCommand(
      {
        idempotencyKey: 'idem-move-100',
        originId: 'BIN-A1-01',
        destinationId: 'STAGE-OUT-01',
        vehicleId: 'VEH-AMR-01',
        costProfile: 'fastest',
      },
      dispatcher
    );

    expect(first.idempotentReplay).toBe(false);
    expect(first.mission.state).toBe('executing');
    expect(first.mission.transitions.map((t) => t.toState)).toEqual([
      'requested',
      'planned',
      'executing',
    ]);

    // Replay same idempotency key -> no duplicate mission
    const replay = orch.submitMoveCommand(
      {
        idempotencyKey: 'idem-move-100',
        originId: 'BIN-A1-01',
        destinationId: 'STAGE-OUT-01',
        vehicleId: 'VEH-AMR-01',
        costProfile: 'fastest',
      },
      dispatcher
    );
    expect(replay.idempotentReplay).toBe(true);
    expect(replay.mission.id).toBe(first.mission.id);
    expect(orch.getMissions().length).toBe(1);

    // Conflicting idempotency reuse -> IDEMPOTENCY_CONFLICT
    try {
      orch.submitMoveCommand(
        {
          idempotencyKey: 'idem-move-100',
          originId: 'BIN-A1-01',
          destinationId: 'DOCK-OUT-01',
          vehicleId: 'VEH-AMR-01',
        },
        dispatcher
      );
      expect.unreachable();
    } catch (e) {
      expect((e as TwinDomainError).code).toBe('IDEMPOTENCY_CONFLICT');
    }

    // Close LANE-MAIN-02 mid-mission -> dynamic reroute triggers
    const activeEdge = first.mission.route!.segments[first.mission.currentSegmentIndex]?.edgeId;
    if (activeEdge) {
      orch.setEdgeClosure(activeEdge, true, 'Spill cleanup', dispatcher);
      expect(first.mission.replanCount).toBeGreaterThanOrEqual(1);
    }

    // Illegal state transition check after safe stop
    orch.cancelMission(first.mission.id, dispatcher, 'Test safe stop');
    expect(first.mission.state).toBe('failed');
    try {
      orch.transitionMissionState(first.mission, 'executing', dispatcher.actorId, 'Illegal resume');
      expect.unreachable();
    } catch (e) {
      expect((e as TwinDomainError).code).toBe('INVALID_STATE_TRANSITION');
    }
  });

  it('EP06: tracks live telemetry, stale detection, E-stop RBAC ack, and attachment lifecycle', () => {
    const orch = new TwinSiteOrchestrator();

    // Dispatch move carrying PLT-1001 from BIN-A1-01 to STAGE-OUT-01
    const { mission } = orch.submitMoveCommand(
      {
        idempotencyKey: 'idem-attach-01',
        originId: 'BIN-A1-01',
        destinationId: 'STAGE-OUT-01',
        vehicleId: 'VEH-AMR-01',
        loadId: 'PLT-1001',
      },
      operator
    );

    const veh = orch.getVehicleById('VEH-AMR-01')!;
    expect(veh.attachment?.loadId).toBe('PLT-1001');
    expect(veh.attachment?.state).toBe('in_transit');

    // Trigger E-Stop by operator
    orch.triggerEStop('VEH-AMR-01', 'Obstacle sensor trip', operator);
    expect(veh.eStopActive).toBe(true);
    expect(veh.status).toBe('e_stopped');
    expect(mission.state).toBe('paused');

    // Operator cannot acknowledge E-Stop (requires Supervisor/Dispatcher)
    try {
      orch.acknowledgeEStop('VEH-AMR-01', operator);
      expect.unreachable();
    } catch (e) {
      expect((e as TwinDomainError).code).toBe('UNAUTHORIZED_RBAC');
    }

    // Supervisor acknowledges E-Stop & resumes
    orch.acknowledgeEStop('VEH-AMR-01', supervisor);
    expect(veh.eStopActive).toBe(false);
    orch.resumeVehicleOrMission('VEH-AMR-01', operator);
    expect(mission.state).toBe('executing');

    // Advance simulation until mission completes
    for (let i = 0; i < 120 && mission.state !== 'completed'; i++) {
      orch.tick(0.5);
    }
    expect(mission.state).toBe('completed');
    expect(veh.attachment).toBeNull();
    expect(orch.wms.getPalletById('PLT-1001')?.locationId).toBe('LOC-STAGE-OUT-01');

    // Stale telemetry detection via old timestamp
    orch.ingestVehicleTelemetry(
      {
        vehicleId: 'VEH-AGV-02',
        pose: { x: -16, y: 0, z: 0, headingRad: 0 },
        velocityMps: 0,
        timestampMs: Date.now() - 12_000,
        sequence: 500,
      },
      DEFAULT_TENANT_ID,
      DEFAULT_SITE_ID
    );
    expect(orch.getVehicleById('VEH-AGV-02')!.isStale).toBe(true);

    // Safety boundary invariant: never actuate physical I/O
    const intents = orch.safetyGateway.getRecentIntents(DEFAULT_TENANT_ID, DEFAULT_SITE_ID);
    expect(intents.length).toBeGreaterThan(0);
    expect(intents.every((i) => i.physicalIoActuated === false && i.interlockVerified)).toBe(true);
  });

  it('EP08: WMS occupancy, GS1 search, and QA quarantine blocking', () => {
    const orch = new TwinSiteOrchestrator();

    const occ = orch.wms.computeBinOccupancy();
    const a1 = occ.find((o) => o.binCode === 'BIN-A1-01')!;
    expect(a1.usedPallets).toBe(1);
    expect(a1.utilizationPct).toBe(50);

    // Search by serial SN-8801
    const matches = orch.wms.searchTraceability('SN-8801');
    expect(matches.length).toBe(1);
    expect(matches[0].binCode).toBe('BIN-A1-01');

    // Quarantine pallet PLT-1003 cannot move to STAGE-OUT-01
    try {
      orch.submitMoveCommand(
        {
          idempotencyKey: 'idem-qa-block',
          originId: 'BIN-B1-01',
          destinationId: 'STAGE-OUT-01',
          loadId: 'PLT-1003',
        },
        dispatcher
      );
      expect.unreachable();
    } catch (e) {
      expect((e as TwinDomainError).code).toBe('QA_QUARANTINE_BLOCKED');
    }

    // QA Lead releases pallet -> now allowed
    orch.wms.setPalletQaStatus('PLT-1003', 'released', qaLead.actorId);
    const ok = orch.submitMoveCommand(
      {
        idempotencyKey: 'idem-qa-released',
        originId: 'BIN-B1-01',
        destinationId: 'STAGE-OUT-01',
        loadId: 'PLT-1003',
      },
      dispatcher
    );
    expect(ok.mission.state).toBe('executing');
  });

  it('EP09: MES BOM handoff, batch genealogy, OEE, GMP airlock gating, and PM dispatch blocking', () => {
    const orch = new TwinSiteOrchestrator();

    // GMP gate check blocks direct Warehouse -> Grade C without airlock
    const blockedGate = orch.mes.checkGmpTransferGate({
      fromGrade: 'Warehouse',
      toGrade: 'Grade C',
      qaReleased: true,
    });
    expect(blockedGate.allowed).toBe(false);

    const allowedGate = orch.mes.checkGmpTransferGate({
      fromGrade: 'Warehouse',
      toGrade: 'Grade C',
      passesAirlockId: 'AIRLOCK-01',
      qaReleased: true,
    });
    expect(allowedGate.allowed).toBe(true);

    // Maintenance window PM-FILLER-02 blocks dispatch to MCH-FILLER-02
    try {
      orch.submitMoveCommand(
        {
          idempotencyKey: 'idem-pm-block',
          originId: 'BIN-A1-01',
          destinationId: 'MCH-FILLER-02',
          vehicleId: 'VEH-AMR-01',
        },
        dispatcher
      );
      expect.unreachable();
    } catch (e) {
      expect((e as TwinDomainError).code).toBe('MAINTENANCE_CONFLICT');
    }

    // Clearing PM allows dispatch
    orch.mes.toggleMaintenanceWindow('PM-FILLER-02', false, supervisor.actorId);
    const bomMove = orch.submitMoveCommand(
      {
        idempotencyKey: 'idem-bom-01',
        originId: 'BIN-A1-01',
        destinationId: 'BUF-IN-01',
        vehicleId: 'VEH-AMR-01',
        bomOrderId: 'BOM-01',
      },
      dispatcher
    );
    expect(bomMove.mission.route?.passesAirlockId).toBe('AIRLOCK-01');
    expect(orch.mes.getBomDemands()[0].handoffState).toBe('in_transit');

    // Update machine state -> recalculates OEE
    const mixer = orch.mes.updateMachineState('MCH-MIXER-01', 'down', supervisor.actorId);
    expect(mixer.machineState).toBe('down');
    expect(mixer.oee.overall).toBeLessThan(0.85);
  });
});
