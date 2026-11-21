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
  // No fixed `path` filter: on Vercel, `/ws` may be rewritten onto the `/api` function.
  const wss = new WebSocketServer({ server });
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
  const distDir = path.resolve(process.cwd(), 'dist');
  const publicDir = path.resolve(process.cwd(), 'public');
  if (fs.existsSync(path.join(distDir, 'index.html'))) return distDir;
  return publicDir;
}

function attachSpaAssets(app: express.Express) {
  const staticDir = resolveStaticDir();
  const indexHtml = path.join(staticDir, 'index.html');
  if (!fs.existsSync(indexHtml)) return;

  app.use(express.static(staticDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path === '/ws') return next();
    res.sendFile(indexHtml);
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
    // Local production (`npm start`): serve Vite build from dist/.
    // On Vercel, the Vite CDN serves dist/; this function only handles /api and /ws.
    attachSpaAssets(app);
  }

  const PORT = Number(process.env.PORT || 3000);
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Gradian Digital Twin P2 server listening on http://0.0.0.0:${PORT}`);
  });
}

// Vercel `/api` entry and local runtime share this HTTP server (needed for WS upgrades).
const runtime = getTwinHttpRuntime();
export default runtime.server;

const entry = process.argv[1] || '';
const isDirectRun =
  entry.endsWith('server.ts') ||
  entry.endsWith('server.js') ||
  entry.endsWith('twin-server.ts') ||
  entry.endsWith('twin-server.js');

if (isDirectRun && !process.env.VERCEL) {
  startServer().catch((err) => {
    console.error('Failed to start Gradian Digital Twin server:', err);
    process.exit(1);
  });
}
