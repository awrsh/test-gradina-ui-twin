# Gradian Digital Twin — P2 Operations Architecture & Backlog Checklist

## 1. Architecture Overview & P1 Stubs
Because the repository started from a clean Vite + Express template, minimal **P1 Foundation Contracts** were implemented with explicit `[P1-CONTRACT]` annotations in `src/shared/p1-contracts.ts` and supporting server modules:
- **Multi-site Tenancy, RBAC & Spatial ABAC**: `src/server/auth-rbac.ts` (`resolvePrincipal`, `assertPermission`, `assertSpatialAbac`).
- **Spatial World Model & Navigation Topology**: `src/server/seed-data.ts` (`createSeedWorldModel`, 5 zones, 16 semantic locations, 29 nav nodes, 29 lane edges with width/height/slope/GMP metadata).
- **Event Backbone & Real-Time Delivery**: `src/server/event-bus.ts` (`TwinEventBus` outbox + scoped pub/sub) wired to WebSocket (`/ws`) in `server.ts`.
- **Safety Boundary**: `src/server/safety-gateway.ts` (`ApprovedFleetControllerGateway`). Twin orchestration intents never drive physical I/O (`physicalIoActuated: false`, `interlockVerified: true`).

## 2. P2 Operations Task Checklist & Evidence

| Task ID | Priority | Implementation Module(s) | Verification / Test Pointer | Status |
| :--- | :--- | :--- | :--- | :--- |
| `DT-EP05-F01-US01-T01` | Critical | `src/server/mission-orchestrator.ts` (`resolveSemanticLocation`), `POST /api/v2/commands/move` | `tests/p2-operations.test.ts` (resolves `BIN-A1-01`, fails `LOCATION_NOT_FOUND` / `LOCATION_AMBIGUOUS`) | Done |
| `DT-EP05-F01-US01-T02` | High | `src/shared/p2-contracts.ts` (`MoveCommandSchema`), `src/server/auth-rbac.ts`, `submitMoveCommand` | `tests/p2-operations.test.ts`, `tests/p2-api.test.ts` (RBAC, ABAC, tenant check, Zod schema) | Done |
| `DT-EP05-F02-US01-T01` | Critical | `src/server/pathfinding.ts` (`findWeightedRoute` with `fastest`/`safest`/`shortest`) | `tests/p2-operations.test.ts` (preferred aisles, turn penalty, shortest vs safest) | Done |
| `DT-EP05-F02-US01-T02` | High | `src/server/pathfinding.ts` (`checkEdgeCompatibility`) | `tests/p2-operations.test.ts` (`VEH-FLT-03` width/height/zone incompatibility, unreachable) | Done |
| `DT-EP05-F03-US01-T01` | Critical | `src/server/traffic-manager.ts` (`reserveRoute`, `tryAcquireWindow`) | `tests/p2-operations.test.ts` (double-booking throws `RESERVATION_CONFLICT`) | Done |
| `DT-EP05-F03-US01-T02` | Medium | `src/server/traffic-manager.ts` (`detectAndResolveCycle`, bounded wait/yield/replan) | `tests/p2-operations.test.ts` (cycle detection & deterministic yield resolution) | Done |
| `DT-EP05-F04-US01-T01` | Critical | `src/server/mission-orchestrator.ts` (`setEdgeClosure`, `replanActiveMission`, `ingestVehicleTelemetry`) | `tests/p2-operations.test.ts` (mid-mission closure triggers `replanCount++` + `twin.mission.rerouted`) | Done |
| `DT-EP05-F04-US01-T02` | High | `src/server/mission-orchestrator.ts` (`idempotencyStore`, `safeStopMission`) | `tests/p2-operations.test.ts` (replay returns same mission; conflict throws 409; safe stop zeroes motion) | Done |
| `DT-EP05-F05-US01-T01` | Critical | `src/server/mission-orchestrator.ts` (`selectEligibleVehicle`) | `tests/p2-operations.test.ts` (scores capability, zone, cleanliness, payload, battery, queue) | Done |
| `DT-EP05-F05-US01-T02` | High | `src/server/mission-orchestrator.ts` (`queuedMissionIds`, `sortVehicleQueue`, `cancelMission`) | `tests/p2-operations.test.ts` + Operations Dock queue UI | Done |
| `DT-EP05-F06-US01-T01` | Critical | `src/server/mission-orchestrator.ts` (`LEGAL_TRANSITIONS`, `transitionMissionState`) | `tests/p2-operations.test.ts` (rejects `failed -> executing` with `INVALID_STATE_TRANSITION`) | Done |
| `DT-EP05-F06-US01-T02` | High | `src/server/mission-orchestrator.ts` + `src/server/event-bus.ts` (`twin.mission.transition`) | `tests/p2-operations.test.ts` + Events & Audit dock tab | Done |
| `DT-EP06-F01-US01-T01` | Critical | `src/shared/p2-contracts.ts` (`VehicleProfile`), `src/server/seed-data.ts` (AMR/AGV/Forklift) | `tests/p2-operations.test.ts` + Fleet & Controls dock tab | Done |
| `DT-EP06-F01-US01-T02` | High | `src/server/pathfinding.ts` (`checkEdgeCompatibility`) | `tests/p2-operations.test.ts` (`EDGE-NARROW-01` & cleanroom grade gating) | Done |
| `DT-EP06-F02-US01-T01` | Critical | `src/client/ThreeTwinViewport.tsx` (`THREE.MathUtils.damp` interpolation at 60fps from 4Hz server ticks) | Browser 3D viewport inspection | Done |
| `DT-EP06-F02-US01-T02` | High | `src/client/ThreeTwinViewport.tsx` (shortest-angle heading damping) + `server/mission-orchestrator.ts` (`speedLimitMps`) | Browser 3D viewport + `tick()` | Done |
| `DT-EP06-F03-US01-T01` | Critical | `src/server/mission-orchestrator.ts` (`ingestVehicleTelemetry`), `POST /api/v2/vehicles/telemetry` | `tests/p2-operations.test.ts` | Done |
| `DT-EP06-F03-US01-T02` | High | `src/server/mission-orchestrator.ts` (`isStale`, `driftMeters`, `injectStaleTelemetryState`) | `tests/p2-operations.test.ts` + 3D amber beacon + Fleet UI | Done |
| `DT-EP06-F04-US01-T01` | High | `src/client/ThreeTwinViewport.tsx` (`cargoAttachment` 3D pallet group) | Visualized on vehicle during active mission | Done |
| `DT-EP06-F04-US01-T02` | Medium | `src/server/mission-orchestrator.ts` (`startMissionOnVehicle` -> `completeMission`) + `wms-service.ts` | `tests/p2-operations.test.ts` (`PLT-1001` moves from `BIN-A1-01` to `STAGE-OUT-01`) | Done |
| `DT-EP06-F05-US01-T01` | High | `src/server/mission-orchestrator.ts` (`pauseVehicleOrMission`, `resumeVehicleOrMission`, `cancelMission`) | `tests/p2-operations.test.ts` + Fleet & Controls UI | Done |
| `DT-EP06-F05-US01-T02` | Medium | `src/server/mission-orchestrator.ts` (`triggerEStop`, `acknowledgeEStop`) + Safety Gateway | `tests/p2-operations.test.ts` (operator denied ack, supervisor succeeds) | Done |
| `DT-EP08-F01-US01-T01` | High | `src/server/wms-service.ts`, `src/server/seed-data.ts` (GS1 Pallet -> Carton -> Item) | `tests/p2-operations.test.ts` + WMS Twin tab | Done |
| `DT-EP08-F01-US01-T02` | Medium | `src/server/wms-service.ts` (`computeBinOccupancy`) + `ThreeTwinViewport.tsx` (`occupancy` overlay) | `tests/p2-operations.test.ts` + 3D Occupancy overlay | Done |
| `DT-EP08-F02-US01-T01` | High | `src/server/wms-service.ts` (`flows`) + `OperationsDock.tsx` | WMS Twin tab + 3D pallet placement | Done |
| `DT-EP08-F02-US01-T02` | Medium | `src/server/wms-service.ts` (`setPalletQaStatus`) + `submitMoveCommand` quarantine block | `tests/p2-operations.test.ts` (`QA_QUARANTINE_BLOCKED`) | Done |
| `DT-EP08-F03-US01-T01` | High | `src/server/wms-service.ts` (`outbound_picking` / `outbound_staging` / `outbound_loading`) | WMS Twin tab | Done |
| `DT-EP08-F03-US01-T02` | Medium | `src/server/wms-service.ts` (`markPalletInTransit`, `markPalletDropped`) | `tests/p2-operations.test.ts` | Done |
| `DT-EP08-F04-US01-T01` | High | `src/client/OperationsDock.tsx` (expandable Pallet -> Carton -> Item tree) | WMS Twin tab | Done |
| `DT-EP08-F04-US01-T02` | Medium | `src/server/wms-service.ts` (`searchTraceability`) + `OperationsDock.tsx` (`Find & Jump 3D`) | `tests/p2-operations.test.ts` + `tests/p2-api.test.ts` + 3D camera focus | Done |
| `DT-EP08-F05-US01-T01` | High | `src/server/wms-service.ts` (`recordTraversalAt`, `heatmaps`) + `ThreeTwinViewport.tsx` (`heatmaps` overlay) | 3D Congestion/Travel Heatmap overlay | Done |
| `DT-EP08-F05-US01-T02` | Medium | `src/server/wms-service.ts` (`opportunities`) + `GET /api/v2/wms/insights` | WMS Twin tab insights cards | Done |
| `DT-EP09-F01-US01-T01` | Critical | `src/server/mes-service.ts` + `ThreeTwinViewport.tsx` (Rooms, Lines, Machines, Buffers, Airlock) | MES & GMP tab + 3D Cleanroom suites | Done |
| `DT-EP09-F01-US01-T02` | High | `src/server/mes-service.ts` (`calibrationStatus`, `calibrationDueIso`) | MES & GMP tab + dispatch availability check | Done |
| `DT-EP09-F02-US01-T01` | Critical | `src/server/mes-service.ts` (`linkBomDemandToMission`) + `POST /api/v2/mes/bom/:id/dispatch` | `tests/p2-operations.test.ts` | Done |
| `DT-EP09-F02-US01-T02` | High | `src/server/mes-service.ts` (`completeBomHandoff`: `pending -> in_transit -> handed_off`) | `tests/p2-operations.test.ts` + MES & GMP tab | Done |
| `DT-EP09-F03-US01-T01` | Critical | `src/server/seed-data.ts` (`createSeedBatches`) + `mes-service.ts` (`inputLots`) | MES & GMP Batch Genealogy panel | Done |
| `DT-EP09-F03-US01-T02` | High | `src/server/seed-data.ts` (`spatialJourney`) + `ThreeTwinViewport.tsx` (`batchJourney` 3D spline) | MES & GMP tab + 3D Batch Path overlay | Done |
| `DT-EP09-F04-US01-T01` | High | `src/server/mes-service.ts` (`updateMachineState`), `POST /api/v2/mes/assets/:id/state` | `tests/p2-operations.test.ts` | Done |
| `DT-EP09-F04-US01-T02` | Medium | `src/client/ThreeTwinViewport.tsx` (`oee` 3D columns + machine beacons) + MES tab | 3D OEE overlay + MES & GMP tab | Done |
| `DT-EP09-F05-US01-T01` | High | `src/server/mes-service.ts` (`gmpRules`, `checkGmpTransferGate`) | `tests/p2-operations.test.ts` | Done |
| `DT-EP09-F05-US01-T02` | Medium | `src/server/pathfinding.ts` (`passesAirlockId`) + `submitMoveCommand` | `tests/p2-operations.test.ts` | Done |
| `DT-EP09-F06-US01-T01` | High | `src/server/mes-service.ts` (`maintenanceWindows`, `toggleMaintenanceWindow`) | MES & GMP tab | Done |
| `DT-EP09-F06-US01-T02` | Medium | `src/server/mes-service.ts` (`assertLocationAvailableForDispatch`) | `tests/p2-operations.test.ts` (`MAINTENANCE_CONFLICT`) | Done |
