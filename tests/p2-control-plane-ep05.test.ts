import http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTwinServerApp } from '../twin-server';
import { resolvePrincipal } from '../src/server/auth-rbac';
import { TwinSiteOrchestrator } from '../src/server/mission-orchestrator';
import { DEFAULT_SITE_ID, DEFAULT_TENANT_ID } from '../src/server/seed-data';
import { TwinDomainError } from '../src/shared/p2-contracts';

const dispatcher = resolvePrincipal({ actorId: 'DISP-01' });
const supervisor = resolvePrincipal({ actorId: 'SUP-01' });
const operator = resolvePrincipal({ actorId: 'OP-01' });

describe('Gradian Digital Twin — Global Control Plane & EP05 Control Tests', () => {
  it('enforces RBAC and Zod schema bounds on TwinOpsConfig and feature flags', () => {
    const orch = new TwinSiteOrchestrator();

    // Negative: Operator lacks manageControlPlane permission
    try {
      orch.controlPlane.patchConfig({ routing: { maxExpandNodes: 100 } }, operator);
      expect.unreachable();
    } catch (e) {
      expect((e as TwinDomainError).code).toBe('UNAUTHORIZED_RBAC');
    }

    // Negative: Boundary violation (minBatteryPct > 100 or negative cost weight)
    try {
      orch.controlPlane.patchConfig({ dispatch: { minBatteryPct: 120 } }, dispatcher);
      expect.unreachable();
    } catch (e) {
      expect((e as TwinDomainError).code).toBe('VALIDATION_ERROR');
    }

    // Negative: Unknown feature flag rejected
    try {
      orch.controlPlane.patchFlags({ 'dt.unknown.flag': true } as never, dispatcher);
      expect.unreachable();
    } catch (e) {
      expect((e as TwinDomainError).code).toBe('VALIDATION_ERROR');
    }

    // Positive: Dispatcher updates config and publishes twin.config.updated event
    const updated = orch.controlPlane.patchConfig(
      { routing: { defaultCostProfile: 'safest', maxExpandNodes: 300 } },
      dispatcher,
      'Unit test config update'
    );
    expect(updated.routing.defaultCostProfile).toBe('safest');
    expect(updated.routing.maxExpandNodes).toBe(300);

    const events = orch.eventBus.getOutbox(DEFAULT_TENANT_ID, DEFAULT_SITE_ID, 5);
    expect(events.some((ev) => ev.topic === 'twin.config.updated')).toBe(true);
  });

  it('enforces 3-part dual-confirmation interlock before entering physical actuation mode', () => {
    const orch = new TwinSiteOrchestrator();

    // Default is always twin_only
    expect(orch.controlPlane.getConfig().actuationMode).toBe('twin_only');

    // Positive: shadow mode allowed with manageSafetyMode
    const shadowRes = orch.controlPlane.setActuationMode(
      { actuationMode: 'shadow', reason: 'Shadow fleet validation' },
      dispatcher
    );
    expect(shadowRes.actuationMode).toBe('shadow');

    // Negative 1: Flag dt.safety.physicalActuationAllowed is false
    try {
      orch.controlPlane.setActuationMode(
        {
          actuationMode: 'physical',
          reason: 'Attempt without flag',
          confirmPhrase: 'ENABLE_PHYSICAL_INTERLOCK',
          secondaryApproverId: 'SUP-01',
        },
        dispatcher
      );
      expect.unreachable();
    } catch (e) {
      expect((e as TwinDomainError).code).toBe('SAFETY_INTERLOCK_REQUIRED');
    }

    // Enable flag
    orch.controlPlane.patchFlags({ 'dt.safety.physicalActuationAllowed': true }, supervisor);

    // Negative 2: Wrong confirmPhrase
    try {
      orch.controlPlane.setActuationMode(
        {
          actuationMode: 'physical',
          reason: 'Wrong phrase',
          confirmPhrase: 'YES',
          secondaryApproverId: 'SUP-01',
        },
        dispatcher
      );
      expect.unreachable();
    } catch (e) {
      expect((e as TwinDomainError).code).toBe('SAFETY_INTERLOCK_REQUIRED');
    }

    // Negative 3: Same primary and secondary approver (self-approval forbidden)
    try {
      orch.controlPlane.setActuationMode(
        {
          actuationMode: 'physical',
          reason: 'Self approval attempt',
          confirmPhrase: 'ENABLE_PHYSICAL_INTERLOCK',
          secondaryApproverId: 'DISP-01',
        },
        dispatcher
      );
      expect.unreachable();
    } catch (e) {
      expect((e as TwinDomainError).code).toBe('SAFETY_INTERLOCK_REQUIRED');
    }

    // Positive: All 3 interlock checks satisfied
    const physRes = orch.controlPlane.setActuationMode(
      {
        actuationMode: 'physical',
        reason: 'Dual-approved commissioning run',
        confirmPhrase: 'ENABLE_PHYSICAL_INTERLOCK',
        secondaryApproverId: 'SUP-01',
      },
      dispatcher
    );
    expect(physRes.actuationMode).toBe('physical');

    // Boundary / Failsafe: turning safety flag off auto-reverts actuationMode back to twin_only
    orch.controlPlane.patchFlags({ 'dt.safety.physicalActuationAllowed': false }, supervisor);
    expect(orch.controlPlane.getConfig().actuationMode).toBe('twin_only');
  });

  it('dynamically flips auto-dispatch winner via scoring weights and exposes explainability breakdown', () => {
    // Run 1: Pure distance weighting -> VEH-AGV-02 (closer at (-16, 0)) wins
    const orchDist = new TwinSiteOrchestrator();
    orchDist.controlPlane.patchConfig(
      {
        dispatch: {
          scoring: { wDistance: 10, wBattery: 0, wWorkload: 0, wCapabilityFit: 0 },
        },
      },
      dispatcher
    );
    const resDist = orchDist.submitMoveCommand(
      {
        idempotencyKey: 'cp-score-dist',
        originId: 'BIN-A1-01',
        destinationId: 'STAGE-OUT-01',
      },
      dispatcher
    );
    expect(resDist.mission.vehicleId).toBe('VEH-AGV-02');
    const expDist = orchDist.getMissionExplanation(resDist.mission.id);
    expect(expDist.autoAssigned).toBe(true);
    expect(expDist.selectedVehicleId).toBe('VEH-AGV-02');
    expect(expDist.candidates.length).toBe(3);

    // Run 2: Pure battery weighting -> VEH-AMR-01 (battery 88% > 76% > 64%) wins
    const orchBat = new TwinSiteOrchestrator();
    orchBat.controlPlane.patchConfig(
      {
        dispatch: {
          scoring: { wDistance: 0, wBattery: 5, wWorkload: 0, wCapabilityFit: 0 },
        },
      },
      dispatcher
    );
    const resBat = orchBat.submitMoveCommand(
      {
        idempotencyKey: 'cp-score-bat',
        originId: 'BIN-A1-01',
        destinationId: 'STAGE-OUT-01',
      },
      dispatcher
    );
    expect(resBat.mission.vehicleId).toBe('VEH-AMR-01');
    const expBat = orchBat.getMissionExplanation(resBat.mission.id);
    const amrScore = expBat.candidates.find((c) => c.vehicleId === 'VEH-AMR-01')!;
    expect(amrScore.eligible).toBe(true);
    expect(amrScore.scoreBreakdown?.batteryTerm).toBe(440);
  });

  it('enforces minBatteryPct, maxQueueDepthPerVehicle, maxExpandNodes, and maxReplans boundaries', () => {
    const orch = new TwinSiteOrchestrator();

    // Boundary 1: minBatteryPct = 90 rejects all seed vehicles (max 88%)
    orch.controlPlane.patchConfig({ dispatch: { minBatteryPct: 90 } }, dispatcher);
    try {
      orch.submitMoveCommand(
        {
          idempotencyKey: 'cp-min-bat',
          originId: 'BIN-A1-01',
          destinationId: 'STAGE-OUT-01',
        },
        dispatcher
      );
      expect.unreachable();
    } catch (e) {
      expect((e as TwinDomainError).code).toBe('INCOMPATIBLE_VEHICLE');
    }
    orch.controlPlane.patchConfig({ dispatch: { minBatteryPct: 20 } }, dispatcher);

    // Boundary 2: maxQueueDepthPerVehicle = 0 rejects 2nd mission for same busy vehicle
    orch.controlPlane.patchConfig({ dispatch: { maxQueueDepthPerVehicle: 0 } }, dispatcher);
    orch.submitMoveCommand(
      {
        idempotencyKey: 'cp-q-1',
        originId: 'BIN-A1-01',
        destinationId: 'STAGE-OUT-01',
        vehicleId: 'VEH-AMR-01',
      },
      dispatcher
    );
    try {
      orch.submitMoveCommand(
        {
          idempotencyKey: 'cp-q-2',
          originId: 'BIN-A1-02',
          destinationId: 'STAGE-OUT-01',
          vehicleId: 'VEH-AMR-01',
        },
        dispatcher
      );
      expect.unreachable();
    } catch (e) {
      expect((e as TwinDomainError).code).toBe('INCOMPATIBLE_VEHICLE');
    }

    // Boundary 3: maxExpandNodes = 2 fails multi-hop A* expansion
    orch.controlPlane.patchConfig({ routing: { maxExpandNodes: 2 } }, dispatcher);
    try {
      orch.submitMoveCommand(
        {
          idempotencyKey: 'cp-expand-2',
          originId: 'BIN-A1-01',
          destinationId: 'STAGE-OUT-01',
          vehicleId: 'VEH-AGV-02',
        },
        dispatcher
      );
      expect.unreachable();
    } catch (e) {
      expect((e as TwinDomainError).code).toBe('UNREACHABLE_ROUTE');
    }
    orch.controlPlane.patchConfig({ routing: { maxExpandNodes: 500 } }, dispatcher);

    // Boundary 4: maxReplans = 1 safe-stops mission on 2nd replan
    orch.controlPlane.patchConfig({ mission: { maxReplans: 1 } }, dispatcher);
    const active = orch.getMissions()[0];
    orch.replanActiveMission(active, dispatcher.actorId, 'First replan');
    expect(active.replanCount).toBe(1);
    expect(active.state).toBe('executing');

    orch.replanActiveMission(active, dispatcher.actorId, 'Second replan exceeds cap');
    expect(active.state).toBe('failed');
    expect(active.failureReason).toContain('Max replans (1) exceeded');
  });

  it('respects feature flags, deadlock resolution policies, and manual overrides', () => {
    const orch = new TwinSiteOrchestrator();

    // Feature flag dt.ep05.semanticCommands = false blocks command intake
    orch.controlPlane.patchFlags({ 'dt.ep05.semanticCommands': false }, dispatcher);
    try {
      orch.submitMoveCommand(
        {
          idempotencyKey: 'cp-flag-off',
          originId: 'BIN-A1-01',
          destinationId: 'STAGE-OUT-01',
        },
        dispatcher
      );
      expect.unreachable();
    } catch (e) {
      expect((e as TwinDomainError).code).toBe('FEATURE_DISABLED');
    }
    orch.controlPlane.patchFlags({ 'dt.ep05.semanticCommands': true }, dispatcher);

    // Feature flag dt.ep05.autoDispatch = false requires explicit vehicleId
    orch.controlPlane.patchFlags({ 'dt.ep05.autoDispatch': false }, dispatcher);
    try {
      orch.submitMoveCommand(
        {
          idempotencyKey: 'cp-no-autods',
          originId: 'BIN-A1-01',
          destinationId: 'STAGE-OUT-01',
        },
        dispatcher
      );
      expect.unreachable();
    } catch (e) {
      expect((e as TwinDomainError).code).toBe('FEATURE_DISABLED');
    }
    orch.controlPlane.patchFlags({ 'dt.ep05.autoDispatch': true }, dispatcher);

    // Mission 1 reserves corridor on VEH-AMR-01
    const m1 = orch.submitMoveCommand(
      {
        idempotencyKey: 'cp-dl-1',
        originId: 'BIN-A1-01',
        destinationId: 'STAGE-OUT-01',
        vehicleId: 'VEH-AMR-01',
      },
      dispatcher
    ).mission;

    // Manual override: pause, resume, reassign
    orch.pauseMissionById(m1.id, dispatcher, 'Inspect aisle');
    expect(m1.state).toBe('paused');
    orch.resumeMissionById(m1.id, dispatcher, 'Aisle clear');
    expect(m1.state).toBe('executing');

    orch.reassignMission(m1.id, 'VEH-AGV-02', dispatcher, 'Battery balance');
    expect(m1.vehicleId).toBe('VEH-AGV-02');
    expect(orch.getVehicleById('VEH-AMR-01')!.activeMissionId).toBeNull();
    expect(orch.getVehicleById('VEH-AGV-02')!.activeMissionId).toBe(m1.id);

    // Deadlock policy 'pause_all_and_alert' pauses conflicting mission
    orch.controlPlane.patchConfig(
      { traffic: { deadlockResolvePolicy: 'pause_all_and_alert' } },
      dispatcher
    );
    const m2 = orch.submitMoveCommand(
      {
        idempotencyKey: 'cp-dl-2',
        originId: 'BIN-A1-01',
        destinationId: 'STAGE-OUT-01',
        vehicleId: 'VEH-AMR-01',
      },
      dispatcher
    ).mission;
    expect(m2.state).toBe('paused');

    // Manual reservation release frees reservation & records override
    const reservations = orch.traffic.getReservations();
    expect(reservations.length).toBeGreaterThan(0);
    const released = orch.releaseReservation(
      reservations[0].reservationId,
      dispatcher,
      'Manual clearance'
    );
    expect(released.reservationId).toBe(reservations[0].reservationId);
  });
});

describe('Gradian Digital Twin — Control Plane & EP05 REST API Integration', () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    const { app } = createTwinServerApp();
    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as { port: number };
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('supports config/flags PATCH, mission explainability, and manual overrides via HTTP API', async () => {
    const headers = {
      'Content-Type': 'application/json',
      'x-tenant-id': DEFAULT_TENANT_ID,
      'x-site-id': DEFAULT_SITE_ID,
      'x-actor-id': 'DISP-01',
    };

    const getCfg = await fetch(`${baseUrl}/api/v2/control-plane/config`, { headers });
    expect(getCfg.status).toBe(200);
    const cfgBody = await getCfg.json();
    expect(cfgBody.config.actuationMode).toBe('twin_only');

    // Patch config via API
    const patchRes = await fetch(`${baseUrl}/api/v2/control-plane/config`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        config: { routing: { defaultCostProfile: 'shortest' } },
        reason: 'API test override',
      }),
    });
    expect(patchRes.status).toBe(200);
    const patchBody = await patchRes.json();
    expect(patchBody.config.routing.defaultCostProfile).toBe('shortest');

    // Dispatch move without explicit costProfile -> inherits defaultCostProfile ('shortest')
    const moveRes = await fetch(`${baseUrl}/api/v2/commands/move`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        idempotencyKey: 'api-cp-move-1',
        originId: 'BIN-A1-01',
        destinationId: 'STAGE-OUT-01',
      }),
    });
    expect(moveRes.status).toBe(201);
    const moveBody = await moveRes.json();
    expect(moveBody.mission.costProfile).toBe('shortest');

    // Inspect decision explainability endpoint
    const explainRes = await fetch(`${baseUrl}/api/v2/missions/${moveBody.mission.id}/explain`, {
      headers,
    });
    expect(explainRes.status).toBe(200);
    const explainBody = await explainRes.json();
    expect(explainBody.explanation.missionId).toBe(moveBody.mission.id);
    expect(explainBody.explanation.candidates.length).toBe(3);

    // Pause + Resume via HTTP API
    const pauseRes = await fetch(`${baseUrl}/api/v2/missions/${moveBody.mission.id}/pause`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ reason: 'API pause test' }),
    });
    expect(pauseRes.status).toBe(200);
    expect((await pauseRes.json()).mission.state).toBe('paused');

    const resumeRes = await fetch(`${baseUrl}/api/v2/missions/${moveBody.mission.id}/resume`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ reason: 'API resume test' }),
    });
    expect(resumeRes.status).toBe(200);
    expect((await resumeRes.json()).mission.state).toBe('executing');
  });
});
