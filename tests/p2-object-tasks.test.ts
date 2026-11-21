import http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTwinServerApp } from '../twin-server';
import { DEFAULT_SITE_ID, DEFAULT_TENANT_ID } from '../src/server/seed-data';

describe('Gradian Digital Twin — Object-Bound Tasks & MES Window API', () => {
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

  it('lists seeded tasks filtered by targetKind and targetId', async () => {
    const res = await fetch(
      `${baseUrl}/api/v2/tasks?targetKind=asset&targetId=AIRLOCK-01`
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tasks.length).toBeGreaterThanOrEqual(1);
    expect(body.tasks[0].targetId).toBe('AIRLOCK-01');
  });

  it('creates and transitions an operational task for a clicked vehicle', async () => {
    const createRes = await fetch(`${baseUrl}/api/v2/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': DEFAULT_TENANT_ID,
        'x-site-id': DEFAULT_SITE_ID,
        'x-actor-id': 'OP-01',
      },
      body: JSON.stringify({
        targetKind: 'vehicle',
        targetId: 'VEH-AGV-02',
        title: 'Inspect pallet roller guide alignment',
        category: 'inspection',
        priority: 'high',
        notes: 'Routine pre-shift inspection',
      }),
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    expect(created.task.status).toBe('pending');
    expect(created.task.targetId).toBe('VEH-AGV-02');

    const statusRes = await fetch(
      `${baseUrl}/api/v2/tasks/${created.task.id}/status`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': DEFAULT_TENANT_ID,
          'x-site-id': DEFAULT_SITE_ID,
          'x-actor-id': 'OP-01',
        },
        body: JSON.stringify({ status: 'completed' }),
      }
    );
    expect(statusRes.status).toBe(200);
    const updated = await statusRes.json();
    expect(updated.task.status).toBe('completed');
  });

  it('enforces RBAC (rejects viewer) and validates missing targets', async () => {
    const viewerRes = await fetch(`${baseUrl}/api/v2/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-actor-id': 'VIEW-01',
      },
      body: JSON.stringify({
        targetKind: 'vehicle',
        targetId: 'VEH-AMR-01',
        title: 'Unauthorized task',
        category: 'inspection',
        priority: 'low',
      }),
    });
    expect(viewerRes.status).toBe(403);
    const viewerErr = await viewerRes.json();
    expect(viewerErr.error.code).toBe('UNAUTHORIZED_RBAC');

    const missingRes = await fetch(`${baseUrl}/api/v2/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-actor-id': 'DISP-01',
      },
      body: JSON.stringify({
        targetKind: 'location',
        targetId: 'NON-EXISTENT-BIN',
        title: 'Cycle count',
        category: 'cycle_count',
        priority: 'medium',
      }),
    });
    expect(missingRes.status).toBe(404);
    const missingErr = await missingRes.json();
    expect(missingErr.error.code).toBe('RESOURCE_NOT_FOUND');
  });

  it('allows supervisor to schedule a new MES maintenance window directly for an asset', async () => {
    const res = await fetch(`${baseUrl}/api/v2/mes/maintenance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-actor-id': 'SUP-01',
      },
      body: JSON.stringify({
        assetId: 'MCH-MIXER-01',
        type: 'calibration',
        title: 'Torque sensor verification before next batch',
        active: true,
        blocksDispatch: true,
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.maintenanceWindow.assetId).toBe('MCH-MIXER-01');
    expect(body.maintenanceWindow.active).toBe(true);
  });

  it('starts an asset operational task immediately in_progress when startImmediately is true', async () => {
    const res = await fetch(`${baseUrl}/api/v2/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': DEFAULT_TENANT_ID,
        'x-site-id': DEFAULT_SITE_ID,
        'x-actor-id': 'OP-01',
      },
      body: JSON.stringify({
        targetKind: 'asset',
        targetId: 'MCH-COATER-01',
        title: 'Run pan coating spray & warm air cycle',
        category: 'material_prep',
        priority: 'high',
        startImmediately: true,
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.task.targetKind).toBe('asset');
    expect(body.task.targetId).toBe('MCH-COATER-01');
    expect(body.task.status).toBe('in_progress');
  });
});

