import http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTwinServerApp } from '../twin-server';
import { resolvePrincipal } from '../src/server/auth-rbac';
import { AutonomousFactoryDirector } from '../src/server/autonomous-factory';
import { TwinSiteOrchestrator } from '../src/server/mission-orchestrator';

const OPS_HEADERS = {
  'Content-Type': 'application/json',
  'x-tenant-id': 'tenant-gradian-pharma',
  'x-site-id': 'site-teh-01',
  'x-actor-id': 'DISP-01',
};

const VIEWER_HEADERS = {
  'Content-Type': 'application/json',
  'x-tenant-id': 'tenant-gradian-pharma',
  'x-site-id': 'site-teh-01',
  'x-actor-id': 'VIEW-01',
};

describe('Autonomous Factory Director & Autopilot API', () => {
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

  it('seeds live initial missions across Forklift, AGV, and AMR and circulates continuously on step()', () => {
    const orch = new TwinSiteOrchestrator();
    const director = new AutonomousFactoryDirector(orch);

    director.seedInitialLiveOperations();
    const initialSnap = orch.getFullSnapshot();
    expect(initialSnap.missions.length).toBeGreaterThanOrEqual(3);
    expect(initialSnap.vehicles.filter((v) => v.status === 'busy').length).toBe(3);
    expect(initialSnap.tasks.some((tk) => tk.status === 'in_progress')).toBe(true);

    const startPoseForklift = { ...orch.getVehicleById('VEH-FLT-03')!.pose };

    // Simulate 16 seconds so initial legs advance/complete and next circuit legs dispatch
    for (let i = 0; i < 64; i++) {
      director.step(0.25);
    }

    const endPoseForklift = orch.getVehicleById('VEH-FLT-03')!.pose;
    const movedDist = Math.hypot(
      endPoseForklift.x - startPoseForklift.x,
      endPoseForklift.z - startPoseForklift.z
    );
    expect(movedDist).toBeGreaterThan(1.0);
    expect(orch.getFullSnapshot().metrics.completedMissionsCount).toBeGreaterThanOrEqual(1);
  });

  it('respects vehicle pause and E-Stop overrides during autonomous circulation', () => {
    const orch = new TwinSiteOrchestrator();
    const director = new AutonomousFactoryDirector(orch);
    const disp = resolvePrincipal({ actorId: 'DISP-01' });

    orch.triggerEStop('VEH-FLT-03', 'Operator test', disp);
    for (let i = 0; i < 30; i++) {
      director.step(0.25);
    }

    const flt = orch.getVehicleById('VEH-FLT-03')!;
    expect(flt.eStopActive).toBe(true);
    expect(flt.activeMissionId).toBeNull();
  });

  it('exposes GET & POST /api/v2/simulation/autopilot with RBAC enforcement and speed control', async () => {
    const getRes = await fetch(`${baseUrl}/api/v2/simulation/autopilot`, { headers: OPS_HEADERS });
    expect(getRes.status).toBe(200);
    const getBody = await getRes.json();
    expect(getBody.autopilot.enabled).toBe(true);
    expect(getBody.autopilot.speedMultiplier).toBe(1);

    // Viewer cannot mutate autopilot
    const denied = await fetch(`${baseUrl}/api/v2/simulation/autopilot`, {
      method: 'POST',
      headers: VIEWER_HEADERS,
      body: JSON.stringify({ enabled: false }),
    });
    expect(denied.status).toBe(403);

    // Dispatcher can pause and adjust speed multiplier
    const updatedRes = await fetch(`${baseUrl}/api/v2/simulation/autopilot`, {
      method: 'POST',
      headers: OPS_HEADERS,
      body: JSON.stringify({ enabled: false, speedMultiplier: 4 }),
    });
    expect(updatedRes.status).toBe(200);
    const updatedBody = await updatedRes.json();
    expect(updatedBody.autopilot.enabled).toBe(false);
    expect(updatedBody.autopilot.speedMultiplier).toBe(4);

    // Snapshot reflects updated autopilot state
    const snapRes = await fetch(`${baseUrl}/api/v2/snapshot`, { headers: OPS_HEADERS });
    expect(snapRes.status).toBe(200);
    const snapBody = await snapRes.json();
    expect(snapBody.autopilot.enabled).toBe(false);
    expect(snapBody.autopilot.speedMultiplier).toBe(4);
  });
});
