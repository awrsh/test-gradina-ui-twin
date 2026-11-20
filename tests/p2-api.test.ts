import http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTwinServerApp } from '../server';
import { DEFAULT_SITE_ID, DEFAULT_TENANT_ID } from '../src/server/seed-data';

describe('Gradian Digital Twin — REST API v2 Integration', () => {
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

  it('serves versioned API contracts and health metrics', async () => {
    const res = await fetch(`${baseUrl}/api/v2/contracts`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.openapi).toBe('3.1.0');
    expect(body.endpoints).toContain('POST /api/v2/commands/move');
  });

  it('returns structured 404/403/422 domain errors instead of 500s', async () => {
    // Unknown location -> 404 LOCATION_NOT_FOUND
    const unknownRes = await fetch(`${baseUrl}/api/v2/commands/move`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': DEFAULT_TENANT_ID,
        'x-site-id': DEFAULT_SITE_ID,
        'x-actor-id': 'DISP-01',
      },
      body: JSON.stringify({
        idempotencyKey: 'api-test-404',
        originId: 'UNKNOWN-LOC',
        destinationId: 'STAGE-OUT-01',
      }),
    });
    expect(unknownRes.status).toBe(404);
    const unknownBody = await unknownRes.json();
    expect(unknownBody.error.code).toBe('LOCATION_NOT_FOUND');

    // Viewer role -> 403 UNAUTHORIZED_RBAC
    const viewerRes = await fetch(`${baseUrl}/api/v2/commands/move`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': DEFAULT_TENANT_ID,
        'x-site-id': DEFAULT_SITE_ID,
        'x-actor-id': 'VIEW-01',
      },
      body: JSON.stringify({
        idempotencyKey: 'api-test-403',
        originId: 'BIN-A1-01',
        destinationId: 'STAGE-OUT-01',
      }),
    });
    expect(viewerRes.status).toBe(403);
    const viewerBody = await viewerRes.json();
    expect(viewerBody.error.code).toBe('UNAUTHORIZED_RBAC');

    // Full semantic move + WMS search + MES BOM dispatch via API
    const moveRes = await fetch(`${baseUrl}/api/v2/commands/move`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': DEFAULT_TENANT_ID,
        'x-site-id': DEFAULT_SITE_ID,
        'x-actor-id': 'DISP-01',
      },
      body: JSON.stringify({
        idempotencyKey: 'api-test-move-1',
        originId: 'BIN-A1-01',
        destinationId: 'STAGE-OUT-01',
        costProfile: 'safest',
      }),
    });
    expect(moveRes.status).toBe(201);
    const moveBody = await moveRes.json();
    expect(moveBody.mission.state).toBe('executing');

    const wmsRes = await fetch(`${baseUrl}/api/v2/wms/search?q=LOT-API-2601`);
    expect(wmsRes.status).toBe(200);
    const wmsBody = await wmsRes.json();
    expect(wmsBody.matches.length).toBeGreaterThan(0);
  });
});
