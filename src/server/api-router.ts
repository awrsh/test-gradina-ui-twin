import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { P1_CONTRACT_VERSION } from '../shared/p1-contracts.ts';
import { P2_CONTRACT_VERSION, TwinDomainError } from '../shared/p2-contracts.ts';
import type {
  CostProfile,
  MachineRunState,
  ObjectTaskStatus,
  QaStatus,
} from '../shared/p2-contracts.ts';
import {
  ACTOR_DIRECTORY,
  assertPermission,
  resolvePrincipal,
} from './auth-rbac.ts';
import type { AutonomousFactoryDirector } from './autonomous-factory.ts';
import type { TwinSiteOrchestrator } from './mission-orchestrator.ts';
import { DEFAULT_SITE_ID, DEFAULT_TENANT_ID } from './seed-data.ts';

function getPrincipalFromReq(req: Request) {
  const tenantId = (
    req.header('x-tenant-id') ||
    (req.query.tenantId as string) ||
    DEFAULT_TENANT_ID
  ).trim();
  const siteId = (
    req.header('x-site-id') ||
    (req.query.siteId as string) ||
    DEFAULT_SITE_ID
  ).trim();
  const actorId = (
    req.header('x-actor-id') ||
    (req.query.actorId as string) ||
    'DISP-01'
  ).trim();
  return {
    tenantId,
    siteId,
    principal: resolvePrincipal({ actorId, tenantId, siteId }),
  };
}

export function createApiRouter(
  orchestrator: TwinSiteOrchestrator,
  autopilot?: AutonomousFactoryDirector
): express.Router {
  const router = express.Router();

  router.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      p1ContractVersion: P1_CONTRACT_VERSION,
      p2ContractVersion: P2_CONTRACT_VERSION,
      worldRevision: orchestrator.world.worldRevision,
      actuationMode: orchestrator.controlPlane.getConfig().actuationMode,
      metrics: orchestrator.eventBus.metrics,
    });
  });

  router.get('/contracts', (_req, res) => {
    res.json({
      openapi: '3.1.0',
      info: {
        title: 'Gradian Digital Twin — P2 Operations & Control Plane API',
        version: P2_CONTRACT_VERSION,
        p1StubVersion: P1_CONTRACT_VERSION,
      },
      endpoints: [
        'GET /api/v2/snapshot',
        'GET /api/v2/actors',
        'GET /api/v2/events',
        'GET /api/v2/control-plane/config',
        'PATCH /api/v2/control-plane/config',
        'PATCH /api/v2/control-plane/flags',
        'POST /api/v2/control-plane/actuation-mode',
        'POST /api/v2/commands/move',
        'GET /api/v2/missions/:id/explain',
        'POST /api/v2/missions/:id/pause',
        'POST /api/v2/missions/:id/resume',
        'POST /api/v2/missions/:id/cancel',
        'POST /api/v2/missions/:id/replan',
        'POST /api/v2/missions/:id/reassign',
        'GET /api/v2/traffic/reservations',
        'GET /api/v2/traffic/deadlocks',
        'DELETE /api/v2/traffic/reservations/:id',
        'POST /api/v2/topology/edges/:id/closure',
        'POST /api/v2/vehicles/telemetry',
        'POST /api/v2/vehicles/:id/stale',
        'POST /api/v2/vehicles/:id/pause',
        'POST /api/v2/vehicles/:id/resume',
        'POST /api/v2/vehicles/:id/estop',
        'POST /api/v2/vehicles/:id/estop/ack',
        'GET /api/v2/wms/search',
        'GET /api/v2/wms/insights',
        'POST /api/v2/wms/pallets/:id/qa',
        'POST /api/v2/mes/bom/:id/dispatch',
        'POST /api/v2/mes/assets/:id/state',
        'POST /api/v2/mes/maintenance',
        'POST /api/v2/mes/maintenance/:id/toggle',
        'POST /api/v2/mes/gmp/validate',
        'GET /api/v2/tasks',
        'POST /api/v2/tasks',
        'POST /api/v2/tasks/:id/status',
        'GET /api/v2/simulation/autopilot',
        'POST /api/v2/simulation/autopilot',
      ],
    });
  });

  router.get('/actors', (_req, res) => {
    res.json({ actors: Object.values(ACTOR_DIRECTORY) });
  });

  router.get('/snapshot', (req, res, next) => {
    try {
      getPrincipalFromReq(req);
      res.json(orchestrator.getFullSnapshot());
    } catch (err) {
      next(err);
    }
  });

  router.get('/events', (req, res, next) => {
    try {
      const { tenantId, siteId } = getPrincipalFromReq(req);
      const limit = Number(req.query.limit || 60);
      res.json({
        events: orchestrator.eventBus.getOutbox(tenantId, siteId, limit),
      });
    } catch (err) {
      next(err);
    }
  });

  // ==========================================================================
  // GLOBAL CONTROL PLANE
  // ==========================================================================

  router.get('/control-plane/config', (req, res, next) => {
    try {
      getPrincipalFromReq(req);
      res.json({
        config: orchestrator.controlPlane.getConfig(),
        flags: orchestrator.controlPlane.getFlags(),
      });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/control-plane/config', (req, res, next) => {
    try {
      const { principal } = getPrincipalFromReq(req);
      const config = orchestrator.controlPlane.patchConfig(
        req.body?.config ?? req.body,
        principal,
        req.body?.reason
      );
      res.json({ config });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/control-plane/flags', (req, res, next) => {
    try {
      const { principal } = getPrincipalFromReq(req);
      const flags = orchestrator.controlPlane.patchFlags(
        req.body?.flags ?? req.body,
        principal,
        req.body?.reason
      );
      res.json({ flags });
    } catch (err) {
      next(err);
    }
  });

  router.post('/control-plane/actuation-mode', (req, res, next) => {
    try {
      const { principal } = getPrincipalFromReq(req);
      const result = orchestrator.controlPlane.setActuationMode(req.body, principal);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // ==========================================================================
  // EP05 — Semantic Move Command, Explainability & Manual Overrides
  // ==========================================================================

  router.post('/commands/move', (req, res, next) => {
    try {
      const { principal } = getPrincipalFromReq(req);
      const result = orchestrator.submitMoveCommand(req.body, principal);
      res.status(result.idempotentReplay ? 200 : 201).json(result);
    } catch (err) {
      next(err);
    }
  });

  router.get('/missions/:id/explain', (req, res, next) => {
    try {
      getPrincipalFromReq(req);
      const explanation = orchestrator.getMissionExplanation(req.params.id);
      res.json({ explanation });
    } catch (err) {
      next(err);
    }
  });

  router.post('/missions/:id/pause', (req, res, next) => {
    try {
      const { principal } = getPrincipalFromReq(req);
      const mission = orchestrator.pauseMissionById(
        req.params.id,
        principal,
        req.body?.reason
      );
      res.json({ mission });
    } catch (err) {
      next(err);
    }
  });

  router.post('/missions/:id/resume', (req, res, next) => {
    try {
      const { principal } = getPrincipalFromReq(req);
      const mission = orchestrator.resumeMissionById(
        req.params.id,
        principal,
        req.body?.reason
      );
      res.json({ mission });
    } catch (err) {
      next(err);
    }
  });

  router.post('/missions/:id/cancel', (req, res, next) => {
    try {
      const { principal } = getPrincipalFromReq(req);
      const mission = orchestrator.cancelMission(
        req.params.id,
        principal,
        req.body?.reason
      );
      res.json({ mission });
    } catch (err) {
      next(err);
    }
  });

  router.post('/missions/:id/replan', (req, res, next) => {
    try {
      const { principal } = getPrincipalFromReq(req);
      assertPermission(principal, 'issueMove', 'replan mission');
      const mission = orchestrator.getMissionById(req.params.id);
      if (!mission) {
        throw new TwinDomainError('RESOURCE_NOT_FOUND', `Mission ${req.params.id} not found`, 404);
      }
      const updated = orchestrator.replanActiveMission(
        mission,
        principal.actorId,
        req.body?.reason || 'Operator requested route recalculation',
        {
          costProfile: req.body?.costProfile as CostProfile | undefined,
          avoidEdgeIds: Array.isArray(req.body?.avoidEdgeIds)
            ? (req.body.avoidEdgeIds as string[])
            : undefined,
        }
      );
      res.json({ mission: updated });
    } catch (err) {
      next(err);
    }
  });

  router.post('/missions/:id/reassign', (req, res, next) => {
    try {
      const { principal } = getPrincipalFromReq(req);
      const vehicleId = String(req.body?.vehicleId || '').trim();
      if (!vehicleId) {
        throw new TwinDomainError('VALIDATION_ERROR', 'vehicleId is required', 400);
      }
      const mission = orchestrator.reassignMission(
        req.params.id,
        vehicleId,
        principal,
        req.body?.reason
      );
      res.json({ mission });
    } catch (err) {
      next(err);
    }
  });

  router.get('/traffic/reservations', (req, res, next) => {
    try {
      getPrincipalFromReq(req);
      res.json({ reservations: orchestrator.traffic.getReservations() });
    } catch (err) {
      next(err);
    }
  });

  router.get('/traffic/deadlocks', (req, res, next) => {
    try {
      getPrincipalFromReq(req);
      res.json({ deadlocks: orchestrator.traffic.getDeadlockHistory() });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/traffic/reservations/:id', (req, res, next) => {
    try {
      const { principal } = getPrincipalFromReq(req);
      const released = orchestrator.releaseReservation(
        req.params.id,
        principal,
        req.body?.reason
      );
      res.json({ released });
    } catch (err) {
      next(err);
    }
  });

  router.post('/topology/edges/:id/closure', (req, res, next) => {
    try {
      const { principal } = getPrincipalFromReq(req);
      const closed = Boolean(req.body?.closed);
      const edge = orchestrator.setEdgeClosure(
        req.params.id,
        closed,
        req.body?.reason,
        principal
      );
      res.json({ edge });
    } catch (err) {
      next(err);
    }
  });

  // ==========================================================================
  // EP06 — Vehicle Runtime, Telemetry & Controls
  // ==========================================================================

  router.post('/vehicles/telemetry', (req, res, next) => {
    try {
      const { tenantId, siteId } = getPrincipalFromReq(req);
      const vehicle = orchestrator.ingestVehicleTelemetry(req.body, tenantId, siteId);
      res.json({ vehicle });
    } catch (err) {
      next(err);
    }
  });

  router.post('/vehicles/:id/stale', (req, res, next) => {
    try {
      const { principal } = getPrincipalFromReq(req);
      const vehicle = orchestrator.injectStaleTelemetryState(
        req.params.id,
        Boolean(req.body?.stale),
        principal
      );
      res.json({ vehicle });
    } catch (err) {
      next(err);
    }
  });

  router.post('/vehicles/:id/pause', (req, res, next) => {
    try {
      const { principal } = getPrincipalFromReq(req);
      const vehicle = orchestrator.pauseVehicleOrMission(req.params.id, principal);
      res.json({ vehicle });
    } catch (err) {
      next(err);
    }
  });

  router.post('/vehicles/:id/resume', (req, res, next) => {
    try {
      const { principal } = getPrincipalFromReq(req);
      const vehicle = orchestrator.resumeVehicleOrMission(req.params.id, principal);
      res.json({ vehicle });
    } catch (err) {
      next(err);
    }
  });

  router.post('/vehicles/:id/estop', (req, res, next) => {
    try {
      const { principal } = getPrincipalFromReq(req);
      const vehicle = orchestrator.triggerEStop(
        req.params.id,
        req.body?.reason || 'Manual twin E-Stop',
        principal
      );
      res.json({ vehicle });
    } catch (err) {
      next(err);
    }
  });

  router.post('/vehicles/:id/estop/ack', (req, res, next) => {
    try {
      const { principal } = getPrincipalFromReq(req);
      const vehicle = orchestrator.acknowledgeEStop(req.params.id, principal);
      res.json({ vehicle });
    } catch (err) {
      next(err);
    }
  });

  // ==========================================================================
  // EP08 — WMS Digital Twin
  // ==========================================================================

  router.get('/wms/search', (req, res, next) => {
    try {
      getPrincipalFromReq(req);
      const q = String(req.query.q || '');
      const matches = orchestrator.wms.searchTraceability(q);
      res.json({ query: q, matches });
    } catch (err) {
      next(err);
    }
  });

  router.get('/wms/insights', (req, res, next) => {
    try {
      getPrincipalFromReq(req);
      res.json({
        occupancy: orchestrator.wms.computeBinOccupancy(),
        heatmaps: orchestrator.wms.getHeatmaps(),
        opportunities: orchestrator.wms.getOpportunities(),
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/wms/pallets/:id/qa', (req, res, next) => {
    try {
      const { principal } = getPrincipalFromReq(req);
      assertPermission(principal, 'manageQa', 'change pallet QA quarantine/release state');
      const qaStatus = req.body?.qaStatus as QaStatus;
      if (!['released', 'quarantine', 'hold'].includes(qaStatus)) {
        throw new TwinDomainError('VALIDATION_ERROR', 'Invalid qaStatus value', 400);
      }
      const pallet = orchestrator.wms.setPalletQaStatus(
        req.params.id,
        qaStatus,
        principal.actorId
      );
      res.json({ pallet });
    } catch (err) {
      next(err);
    }
  });

  // ==========================================================================
  // EP09 — Production & MES Digital Twin
  // ==========================================================================

  router.post('/mes/bom/:id/dispatch', (req, res, next) => {
    try {
      const { principal } = getPrincipalFromReq(req);
      assertPermission(principal, 'manageMes', 'dispatch BOM material handoff');
      const bom = orchestrator.mes.getBomDemands().find((b) => b.id === req.params.id);
      if (!bom) {
        throw new TwinDomainError('RESOURCE_NOT_FOUND', `BOM demand ${req.params.id} not found`, 404);
      }

      const matchingPallet = orchestrator.wms
        .getPallets()
        .find((p) =>
          p.cartons.some((c) => c.gtin === bom.requiredGtin && c.lot === bom.requiredLot)
        );

      const result = orchestrator.submitMoveCommand(
        {
          idempotencyKey: req.body?.idempotencyKey || `bom-${bom.id}-${Date.now()}`,
          originId: matchingPallet?.locationId || bom.sourceBinLocationId,
          destinationId: bom.targetBufferLocationId,
          vehicleId: req.body?.vehicleId,
          costProfile: 'safest',
          priority: 8,
          loadId: matchingPallet?.id,
          bomOrderId: bom.id,
        },
        principal
      );

      res.status(201).json({ bom, mission: result.mission });
    } catch (err) {
      next(err);
    }
  });

  router.post('/mes/assets/:id/state', (req, res, next) => {
    try {
      const { principal } = getPrincipalFromReq(req);
      assertPermission(principal, 'manageMes', 'update production machine state');
      const state = req.body?.machineState as MachineRunState;
      if (!['run', 'idle', 'down', 'maintenance'].includes(state)) {
        throw new TwinDomainError('VALIDATION_ERROR', 'Invalid machineState value', 400);
      }
      const asset = orchestrator.mes.updateMachineState(
        req.params.id,
        state,
        principal.actorId
      );
      res.json({ asset });
    } catch (err) {
      next(err);
    }
  });

  router.post('/mes/maintenance', (req, res, next) => {
    try {
      const { principal } = getPrincipalFromReq(req);
      assertPermission(principal, 'manageMaintenance', 'schedule maintenance or calibration window');
      const win = orchestrator.mes.createMaintenanceWindow(req.body, principal.actorId);
      res.status(201).json({ maintenanceWindow: win });
    } catch (err) {
      next(err);
    }
  });

  router.post('/mes/maintenance/:id/toggle', (req, res, next) => {
    try {
      const { principal } = getPrincipalFromReq(req);
      assertPermission(principal, 'manageMaintenance', 'toggle maintenance window');
      const win = orchestrator.mes.toggleMaintenanceWindow(
        req.params.id,
        Boolean(req.body?.active),
        principal.actorId
      );
      res.json({ maintenanceWindow: win });
    } catch (err) {
      next(err);
    }
  });

  // ==========================================================================
  // Object-Bound Operational Tasks
  // ==========================================================================

  router.get('/tasks', (req, res, next) => {
    try {
      getPrincipalFromReq(req);
      const targetKind = req.query.targetKind ? String(req.query.targetKind) : undefined;
      const targetId = req.query.targetId ? String(req.query.targetId) : undefined;
      res.json({ tasks: orchestrator.getTasks(targetKind, targetId) });
    } catch (err) {
      next(err);
    }
  });

  router.post('/tasks', (req, res, next) => {
    try {
      const { principal } = getPrincipalFromReq(req);
      const task = orchestrator.createObjectTask(req.body, principal);
      res.status(201).json({ task });
    } catch (err) {
      next(err);
    }
  });

  router.post('/tasks/:id/status', (req, res, next) => {
    try {
      const { principal } = getPrincipalFromReq(req);
      const status = String(req.body?.status || '') as ObjectTaskStatus;
      const task = orchestrator.updateObjectTaskStatus(req.params.id, status, principal);
      res.json({ task });
    } catch (err) {
      next(err);
    }
  });

  router.post('/mes/gmp/validate', (req, res, next) => {
    try {
      getPrincipalFromReq(req);
      const gate = orchestrator.mes.checkGmpTransferGate({
        fromGrade: req.body?.fromGrade || 'Warehouse',
        toGrade: req.body?.toGrade || 'Grade C',
        passesAirlockId: req.body?.passesAirlockId,
        qaReleased: Boolean(req.body?.qaReleased ?? true),
      });
      res.json(gate);
    } catch (err) {
      next(err);
    }
  });

  router.get('/simulation/autopilot', (_req, res) => {
    res.json({
      autopilot: autopilot?.getStatus() ?? {
        enabled: false,
        speedMultiplier: 1,
        cyclesCompleted: 0,
        lastActionIso: null,
      },
    });
  });

  router.post('/simulation/autopilot', (req, res, next) => {
    try {
      const { principal } = getPrincipalFromReq(req);
      if (principal.role === 'viewer') {
        throw new TwinDomainError(
          'UNAUTHORIZED_RBAC',
          `Actor ${principal.actorId} (viewer) cannot modify autonomous factory simulation`,
          403
        );
      }
      if (!autopilot) {
        throw new TwinDomainError('FEATURE_DISABLED', 'Autopilot director not attached', 409);
      }
      const nextState = autopilot.configure({
        enabled: typeof req.body?.enabled === 'boolean' ? req.body.enabled : undefined,
        speedMultiplier: req.body?.speedMultiplier,
      });
      res.json({ autopilot: nextState });
    } catch (err) {
      next(err);
    }
  });

  router.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof TwinDomainError) {
      res.status(err.httpStatus).json({ error: err.toJSON() });
      return;
    }
    const message = err instanceof Error ? err.message : 'Unexpected server error';
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message,
        httpStatus: 500,
      },
    });
  });

  return router;
}
