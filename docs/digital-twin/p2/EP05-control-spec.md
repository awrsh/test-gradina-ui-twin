# Gradian Digital Twin — Global Control Plane & EP05 Control Spec

**Status:** Awaiting Approval Checkpoint (before EP05 Control Plane implementation)  
**Checkpoint Order:** **EP05** → EP06 → EP08 → EP09  
**Target Codebase Alignment Note:**  
This workspace runs on **Express 4 + tsx + Zod + WebSocket (`ws`) + Vite + React 19 + Tailwind CSS v4 + Three.js (`THREE.WebGLRenderer`) + Vitest** (rather than NestJS/TypeORM/Next.js/R3F). All Control Plane contracts, versioned schemas (`/api/v2/contracts` OpenAPI descriptor), typed runtime configuration (`TwinOpsConfig`), per-tenant/site feature flags, outbox + pub/sub event bus, and 3D Three.js operator controls will be implemented cleanly inside `src/shared/`, `src/server/`, `src/client/`, and `tests/` following the existing repository architecture without breaking any working modules.

---

## 1. Global Control Plane Contract (`TwinOpsConfig` & Feature Flags)

### 1.1 `TwinOpsConfig` (Tenant + Site Scoped)
```ts
export interface TwinOpsConfig {
  actuationMode: 'twin_only' | 'shadow' | 'physical'; // default: 'twin_only'
  worldRevisionPin?: string; // optional pin; else active world revision
  routing: {
    algorithm: 'weighted_astar';
    defaultCostProfile: 'shortest' | 'fastest' | 'safest';
    costs: {
      distance: number;       // default: 1.0
      turn: number;           // default: 0.6
      elevation: number;      // default: 1.2
      congestion: number;     // default: 1.5
      closurePenalty: number; // default: 1000
    };
    maxExpandNodes: number;   // default: 500
    allowPartialPath: false;  // default: false (enforced)
  };
  traffic: {
    edgeReservationEnabled: boolean; // default: true
    reservationHorizonSec: number;   // default: 120
    edgeCapacityDefault: number;     // default: 1
    intersectionPolicy: 'wait' | 'yield' | 'replan'; // default: 'yield'
    deadlockDetectionIntervalMs: number; // default: 500
    deadlockResolvePolicy: 'replan_lowest_priority' | 'pause_all_and_alert' | 'fail_mission';
  };
  dispatch: {
    scoring: {
      wDistance: number;      // default: 1.0
      wBattery: number;       // default: 0.35
      wWorkload: number;      // default: 25.0
      wCapabilityFit: number; // default: 15.0
    };
    minBatteryPct: number;           // default: 20
    maxQueueDepthPerVehicle: number; // default: 3
    autoAssign: boolean;             // default: true
  };
  mission: {
    staleCommandTimeoutSec: number;   // default: 60
    maxReplans: number;               // default: 3
    deviationThresholdMeters: number; // default: 1.5
    idempotencyTtlSec: number;        // default: 3600
  };
  vehicleRuntime: {
    poseInterpolation: boolean;       // default: true
    maxExtrapolateMs: number;         // default: 250
    staleTelemetryMs: number;         // default: 3000
    driftThresholdMeters: number;     // default: 2.0
    easing: 'linear' | 'easeInOut';   // default: 'easeInOut'
  };
  wms: {
    occupancyBands: { low: number; mid: number; high: number }; // 30 / 70 / 90
    heatmapWindowMin: number;         // default: 30
    quarantineBlocksPutaway: boolean; // default: true
    quarantineBlocksPicking: boolean; // default: true
  };
  mes: {
    oeeWindowMin: number;               // default: 60
    gmpEnforcement: 'off' | 'warn' | 'block'; // default: 'block'
    maintenanceBlocksDispatch: boolean; // default: true
  };
  ui: {
    defaultOverlays: string[]; // ['lanes', 'occupancy', 'routes']
    cameraFollowSelectedVehicle: boolean; // default: false
  };
}
```

### 1.2 Feature Flags (Per Tenant + Site)
| Flag Key | Default | Controls |
| :--- | :--- | :--- |
| `dt.safety.physicalActuationAllowed` | `false` | Hard gate required before `actuationMode = "physical"` can ever be enabled |
| `dt.ep05.semanticCommands` | `true` | Enables/disables `/api/v2/commands/move` intake |
| `dt.ep05.weightedAstar` | `true` | Enables cost-weighted A* (when `false`, rejects routing or falls back to pure distance only if configured) |
| `dt.ep05.edgeReservations` | `true` | Enables time-window edge reservations |
| `dt.ep05.autoDeadlockResolve` | `true` | Enables automatic intersection/cycle resolution |
| `dt.ep05.dynamicReroute` | `true` | Enables automatic replanning on closure/drift |
| `dt.ep05.autoDispatch` | `true` | Enables auto-selection when `vehicleId` is omitted |

### 1.3 Safety Boundary (`actuationMode` Guard)
- Default `actuationMode = "twin_only"`.
- Transitioning to `"physical"` requires **all three**:
  1. Feature flag `dt.safety.physicalActuationAllowed === true`
  2. Principal role is `supervisor` or `dispatcher` with explicit `manageSafetyMode` permission
  3. Explicit dual-confirmation payload (`confirmPhrase: "ENABLE_PHYSICAL_INTERLOCK"`, `secondaryApproverId !== primaryActorId`)
- Every privileged change emits `twin.audit.security` + `twin.safety.actuation_mode_changed` with `who / what / why / when / tenantId / siteId / worldRevision`.

---

## 2. EP05 Control Plane Specification (`DT-EP05-F01` → `DT-EP05-F06`)

### A. Versioned Schemas & OpenAPI
- `TwinOpsConfigSchema`, `TwinOpsConfigPatchSchema`, `FeatureFlagsPatchSchema`, `ActuationModeChangeSchema` (Zod + `/api/v2/contracts` catalog).
- `MissionDecisionExplanation`: structured read DTO capturing location resolution trace, vehicle eligibility/scoring breakdown, A* expansion stats & edge cost terms, reservation wait/yield outcomes, and replan/override history.

### B. Runtime Knobs Wired into EP05 Logic (Zero Magic Constants)
1. **Pathfinding (`src/server/pathfinding.ts`)**:
   - Reads `config.routing.costs.{distance, turn, elevation, congestion, closurePenalty}` to compute edge cost dynamically using current WMS edge congestion scores.
   - Enforces `config.routing.maxExpandNodes` (throws `UNREACHABLE_ROUTE` with `expandedNodes` details if exceeded) and `config.routing.allowPartialPath`.
   - Uses `config.routing.defaultCostProfile` if caller omits `costProfile`.
2. **Traffic Manager (`src/server/traffic-manager.ts`)**:
   - Respects `config.traffic.edgeReservationEnabled`, `reservationHorizonSec`, `edgeCapacityDefault`.
   - Uses `config.traffic.intersectionPolicy` (`wait` | `yield` | `replan`) and `config.traffic.deadlockResolvePolicy` (`replan_lowest_priority` | `pause_all_and_alert` | `fail_mission`).
3. **Dispatch & Mission Orchestrator (`src/server/mission-orchestrator.ts`)**:
   - Reads `config.dispatch.scoring.{wDistance, wBattery, wWorkload, wCapabilityFit}` to score candidates and stores the full score matrix in `mission.decisionExplanation`.
   - Enforces `config.dispatch.minBatteryPct`, `config.dispatch.maxQueueDepthPerVehicle`, and `config.dispatch.autoAssign`.
   - Enforces `config.mission.maxReplans`, `config.mission.deviationThresholdMeters`, `config.mission.staleCommandTimeoutSec`, and `config.mission.idempotencyTtlSec`.

### C. Explainability Read APIs ("Why did dispatcher choose vehicle X?")
- `GET /api/v2/control-plane/config` — read active `TwinOpsConfig` + `FeatureFlags`.
- `GET /api/v2/missions/:id/explain` — returns:
  - Resolved origin/destination nodes & world revision
  - Candidate vehicle table: `{ vehicleId, eligible, rejectionReasons[], scoreBreakdown: { distanceTerm, batteryTerm, workloadTerm, capabilityFitTerm, totalScore } }`
  - Routing summary: `{ algorithm, costProfile, expandedNodes, costTerms, totalCost, totalDistanceM }`
  - Traffic & reservation decisions + deadlock resolution trace
  - Override/replan audit history

### D. Manual Override & Config APIs
- `PATCH /api/v2/control-plane/config` — update any `TwinOpsConfig` section with validation & audit event.
- `PATCH /api/v2/control-plane/flags` — toggle per-tenant/site feature flags.
- `POST /api/v2/control-plane/actuation-mode` — change `actuationMode` (dual confirmation enforced for `physical`).
- `POST /api/v2/missions/:id/pause` & `POST /api/v2/missions/:id/resume` — mission-level pause/resume override.
- `POST /api/v2/missions/:id/replan` — force replan with optional `{ costProfile, avoidEdgeIds }`.
- `POST /api/v2/missions/:id/reassign` — manual vehicle override (`{ vehicleId, reason }`).
- `DELETE /api/v2/traffic/reservations/:reservationId` — manual reservation release with audit reason.

### E. Operator Console UI Controls
- New **"Control Plane"** tab in the Operations Dock + **"Inspect Decision (Why?)"** drawer on every mission row:
  - Live editors for Routing Weights, Traffic & Deadlock Policy, Dispatch Scoring Weights & Thresholds, Mission Limits (`maxReplans`, `deviationThresholdMeters`).
  - Feature Flag switches (`dt.ep05.*`, `dt.safety.physicalActuationAllowed`).
  - Safety `actuationMode` selector with dual-confirmation modal when switching to `physical`.
  - Mission Decision Explainability inspector showing exact vehicle scores, rejected vehicles + reasons, and manual override buttons (`Pause`, `Resume`, `Force Replan`, `Reassign Vehicle`, `Release Reservation`).

### F. Events Emitted
- `twin.config.updated`
- `twin.flag.updated`
- `twin.safety.actuation_mode_changed`
- `twin.mission.override`
- `twin.traffic.reservation_released`

### G. Planned Tests (Positive / Negative / Boundary)
1. **Dispatch Scoring Tuning**: Increasing `wBattery` vs `wDistance` flips auto-assigned winner between `VEH-AMR-01` and `VEH-AGV-02`; `/explain` API matches exact arithmetic.
2. **Boundary Checks**: Vehicle with battery `19%` rejected when `minBatteryPct = 20`; accepted when lowered to `15`. Queue depth exceeding `maxQueueDepthPerVehicle` rejects with structured error. `maxExpandNodes = 2` fails cleanly with `UNREACHABLE_ROUTE`.
3. **Max Replans & Deviation Threshold**: Exceeding `mission.maxReplans` transitions mission to `failed` (safe stop) instead of infinite replan loop. Lowering `deviationThresholdMeters` triggers replan on smaller telemetry drift.
4. **Deadlock Policy Switching**: Testing `pause_all_and_alert` and `fail_mission` vs `replan_lowest_priority`.
5. **Safety Actuation Guard**: Setting `actuationMode = "physical"` fails with `403`/`409` if flag is `false`, role is `operator`, or secondary approver is missing/same as primary; succeeds only when all 3 interlocks pass.
6. **Manual Overrides**: Releasing a reservation frees the edge for a waiting vehicle; reassigning a mission emits `twin.mission.override`.

### H. Traceability Matrix (EP05)
| Task ID | Control Knobs | API / Override | Test Coverage |
| :--- | :--- | :--- | :--- |
| `DT-EP05-F01-US01-T01/02` | `worldRevisionPin`, `dt.ep05.semanticCommands`, `mission.idempotencyTtlSec` | `POST /commands/move`, `GET /missions/:id/explain` | Semantic resolution, ABAC/RBAC, flag disable |
| `DT-EP05-F02-US01-T01/02` | `routing.costs.*`, `routing.maxExpandNodes`, `routing.defaultCostProfile` | `PATCH /control-plane/config` | Cost ordering, `maxExpandNodes` boundary |
| `DT-EP05-F03-US01-T01/02` | `traffic.edgeReservationEnabled`, `edgeCapacityDefault`, `intersectionPolicy`, `deadlockResolvePolicy` | `DELETE /traffic/reservations/:id` | Reservation release, 3 deadlock policies |
| `DT-EP05-F04-US01-T01/02` | `mission.maxReplans`, `mission.deviationThresholdMeters`, `dt.ep05.dynamicReroute` | `POST /missions/:id/replan` | Max replan cap, drift threshold boundary |
| `DT-EP05-F05-US01-T01/02` | `dispatch.scoring.*`, `minBatteryPct`, `maxQueueDepthPerVehicle`, `autoAssign` | `POST /missions/:id/reassign`, `GET /missions/:id/explain` | Weight flip, battery/queue boundaries |
| `DT-EP05-F06-US01-T01/02` | `actuationMode`, `staleCommandTimeoutSec` | `POST /missions/:id/pause`, `/resume`, `POST /control-plane/actuation-mode` | Dual confirmation safety, pause/resume audit |

---

**Checkpoint:** Ready for your approval to implement the **Global Control Plane + EP05 Control Plane** (and proceed to EP06 Control Spec next).
