import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { WebSocket, WebSocketServer } from 'ws';
import { createApiRouter } from './src/server/api-router.ts';
import { AutonomousFactoryDirector } from './src/server/autonomous-factory.ts';
import { TwinSiteOrchestrator } from './src/server/mission-orchestrator.ts';
import { DEFAULT_SITE_ID, DEFAULT_TENANT_ID } from './src/server/seed-data.ts';

export function createTwinServerApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  const orchestrator = new TwinSiteOrchestrator(DEFAULT_TENANT_ID, DEFAULT_SITE_ID);
  const autopilot = new AutonomousFactoryDirector(orchestrator);
  orchestrator.setAutopilotProvider(() => autopilot.getStatus());
  app.use('/api/v2', createApiRouter(orchestrator, autopilot));

  return { app, orchestrator, autopilot };
}

async function startServer() {
  const { app, orchestrator, autopilot } = createTwinServerApp();
  autopilot.seedInitialLiveOperations();
  const server = http.createServer(app);

  // Scoped WebSocket server sharing port 3000 with Express
  const wss = new WebSocketServer({ server, path: '/ws' });
  const clients = new Set<{ ws: WebSocket; tenantId: string; siteId: string }>();

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url || '/ws', 'http://localhost:3000');
    const tenantId = url.searchParams.get('tenantId') || DEFAULT_TENANT_ID;
    const siteId = url.searchParams.get('siteId') || DEFAULT_SITE_ID;

    if (
      tenantId !== orchestrator.world.tenantId ||
      siteId !== orchestrator.world.siteId
    ) {
      ws.close(4003, 'Unauthorized tenant/site scope');
      return;
    }

    const client = { ws, tenantId, siteId };
    clients.add(client);

    // Send initial authoritative snapshot
    ws.send(
      JSON.stringify({
        type: 'snapshot',
        data: orchestrator.getFullSnapshot(),
      })
    );

    ws.on('close', () => {
      clients.delete(client);
    });
  });

  // Subscribe to event backbone and push scoped delta events to connected clients
  orchestrator.eventBus.subscribe(
    orchestrator.world.tenantId,
    orchestrator.world.siteId,
    (event) => {
      const msg = JSON.stringify({ type: 'event', data: event });
      for (const c of clients) {
        if (
          c.ws.readyState === WebSocket.OPEN &&
          c.tenantId === event.tenantId &&
          c.siteId === event.siteId
        ) {
          c.ws.send(msg);
        }
      }
    }
  );

  // Authoritative simulation / telemetry tick (250ms = 4 Hz server authoritative updates)
  // Frontend Three.js loop smoothly interpolates between authoritative updates at 60fps
  let tickCounter = 0;
  setInterval(() => {
    autopilot.step(0.25);
    tickCounter += 1;

    // Broadcast full projection sync every 1s or whenever any vehicle is moving
    const hasBusy = orchestrator.getVehicles().some((v) => v.activeMissionId !== null);
    if (hasBusy || tickCounter % 4 === 0) {
      const snap = JSON.stringify({
        type: 'snapshot',
        data: orchestrator.getFullSnapshot(),
      });
      for (const c of clients) {
        if (c.ws.readyState === WebSocket.OPEN) {
          c.ws.send(snap);
        }
      }
    }
  }, 250);

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT || 3000);
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Gradian Digital Twin P2 server listening on http://0.0.0.0:${PORT}`);
  });
}

// Start server only when executed directly (not imported by Vitest)
const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith('server.ts') || process.argv[1].endsWith('server.js'));

if (isDirectRun) {
  startServer().catch((err) => {
    console.error('Failed to start Gradian Digital Twin server:', err);
    process.exit(1);
  });
}
