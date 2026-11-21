import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { WebSocket, WebSocketServer } from 'ws';
import { createApiRouter } from './src/server/api-router.ts';
import { AutonomousFactoryDirector } from './src/server/autonomous-factory.ts';
import { TwinSiteOrchestrator } from './src/server/mission-orchestrator.ts';
import { DEFAULT_SITE_ID, DEFAULT_TENANT_ID } from './src/server/seed-data.ts';

type TwinHttpRuntime = {
  app: express.Express;
  server: http.Server;
  orchestrator: TwinSiteOrchestrator;
  autopilot: AutonomousFactoryDirector;
};

declare global {
  // Persist across warm Fluid Compute invocations / HMR.
  // eslint-disable-next-line no-var
  var __gradianTwinHttpRuntime: TwinHttpRuntime | undefined;
}

export function createTwinServerApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  const orchestrator = new TwinSiteOrchestrator(DEFAULT_TENANT_ID, DEFAULT_SITE_ID);
  const autopilot = new AutonomousFactoryDirector(orchestrator);
  orchestrator.setAutopilotProvider(() => autopilot.getStatus());
  app.use('/api/v2', createApiRouter(orchestrator, autopilot));

  return { app, orchestrator, autopilot };
}

function attachRealtimeLayer(
  server: http.Server,
  orchestrator: TwinSiteOrchestrator,
  autopilot: AutonomousFactoryDirector
) {
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

  // Authoritative simulation tick (250ms). Frontend interpolates between updates.
  let tickCounter = 0;
  setInterval(() => {
    autopilot.step(0.25);
    tickCounter += 1;

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
}

function resolveStaticDir() {
  const publicDir = path.resolve(process.cwd(), 'public');
  const distDir = path.resolve(process.cwd(), 'dist');
  if (fs.existsSync(path.join(publicDir, 'index.html'))) return publicDir;
  return distDir;
}

function attachProductionStatic(app: express.Express) {
  // On Vercel, `public/**` is served by the CDN; express.static is ignored there.
  if (process.env.VERCEL) return;

  const staticDir = resolveStaticDir();
  app.use(express.static(staticDir));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(staticDir, 'index.html'));
  });
}

function createTwinHttpRuntime(): TwinHttpRuntime {
  const { app, orchestrator, autopilot } = createTwinServerApp();
  autopilot.seedInitialLiveOperations();
  const server = http.createServer(app);
  attachRealtimeLayer(server, orchestrator, autopilot);
  return { app, server, orchestrator, autopilot };
}

function getTwinHttpRuntime(): TwinHttpRuntime {
  if (!globalThis.__gradianTwinHttpRuntime) {
    globalThis.__gradianTwinHttpRuntime = createTwinHttpRuntime();
  }
  return globalThis.__gradianTwinHttpRuntime;
}

async function startServer() {
  const runtime = getTwinHttpRuntime();
  const { app, server } = runtime;

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    attachProductionStatic(app);
  }

  const PORT = Number(process.env.PORT || 3000);
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Gradian Digital Twin P2 server listening on http://0.0.0.0:${PORT}`);
  });
}

// Vercel Fluid Compute / Express entry: export HTTP server (required for WebSocket upgrades).
const runtime = getTwinHttpRuntime();
export default runtime.server;

// Start only when executed directly (not imported by Vitest / Vercel).
const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith('server.ts') || process.argv[1].endsWith('server.js'));

if (isDirectRun && !process.env.VERCEL) {
  startServer().catch((err) => {
    console.error('Failed to start Gradian Digital Twin server:', err);
    process.exit(1);
  });
}
