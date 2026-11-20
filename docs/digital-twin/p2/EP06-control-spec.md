# Gradian Digital Twin — EP06 Control Spec (Vehicle Runtime, Telemetry & Fleet Controls)

**Status:** Awaiting Approval Checkpoint (before EP06 Control Plane implementation)  
**Checkpoint Order:** EP05 (Done) → **EP06 (Pending Approval)** → EP08 → EP09  

---

## 1. Scope & Backlog Mapping (`DT-EP06-F01` → `DT-EP06-F05`)
EP06 governs 3D fleet profiles, kinematic pose interpolation/extrapolation, live telemetry ingestion & staleness/drift monitoring, cargo attachment lifecycle, and manual vehicle controls (pause/resume/E-stop/pose/attachment overrides).

---

## 2. Control Deliverables (A–J)

### A. Versioned Schemas & OpenAPI (`/api/v2/contracts`)
- `VehicleRuntimeExplainResponse`: diagnostic Read DTO capturing telemetry sequence, `telemetryAgeMs` vs `staleTelemetryMs`, `driftMeters` vs `driftThresholdMeters`, active `vehicleRuntime` motion parameters, E-stop lock & interlock status, attachment ledger, recent `SafetyGateway` intents, and manual override audit log.
- `ManualPoseOverrideSchema` (Zod): `{ x, z, headingRad?, velocityMps?, batteryPct?, reason }`
- `ForceAttachmentSchema` (Zod): `{ action: 'attach' | 'detach', loadId?, reason }`
- `VehicleRuntimeProfilePatchSchema` (Zod): `{ maxSpeedMps?, reason }`

### B. Runtime Config Knobs (`TwinOpsConfig.vehicleRuntime` — Zero Magic Constants)
All EP06 runtime behavior reads from `config.vehicleRuntime`:
- `poseInterpolation: boolean` (default `true`) — enables smooth 60fps pose/heading interpolation in `ThreeTwinViewport`; when `false`, snaps directly to authoritative server poses.
- `maxExtrapolateMs: number` (default `250`) — caps forward dead-reckoning extrapolation between 4Hz server snapshots using vehicle velocity vector.
- `staleTelemetryMs: number` (default `5000`) — age cutoff at which missing/delayed telemetry transitions vehicle to `stale` and triggers alerts/auto-pause.
- `driftThresholdMeters: number` (default `2.2`) — positional jump threshold on incoming telemetry triggering drift detection / rerouting.
- `easing: 'linear' | 'easeInOut'` (default `'easeInOut'`) — interpolation curve applied in `ThreeTwinViewport` frame loop.

### C. Feature Flags (Per Tenant + Site)
| Flag Key | Default | Controls |
| :--- | :--- | :--- |
| `dt.ep06.telemetryIngestion` | `true` | Enables/disables `POST /api/v2/vehicles/telemetry` intake |
| `dt.ep06.staleAutoPause` | `false` | When `true`, marking a busy vehicle `stale` automatically pauses its active mission and emits `twin.vehicle.stale` |
| `dt.ep06.driftAutoReplan` | `true` | When `true`, pose drift > `driftThresholdMeters` triggers mission replan; when `false`, logs drift alert without replanning |
| `dt.ep06.poseInterpolation` | `true` | Global override flag disabling 3D viewport interpolation/extrapolation |

### D. Explainability Read API ("Why is vehicle X in state Y / stale / stopped / drifting?")
- `GET /api/v2/vehicles/:id/explain`
  - Returns exact telemetry age arithmetic (`nowMs - lastTelemetryMs`), stale cutoff (`staleTelemetryMs`), latest drift measurement vs `driftThresholdMeters`, active mission/E-stop lock state, `SafetyGateway` intent trail (`physicalIoActuated: false`), and manual `runtimeOverrides[]`.

### E. Manual Override APIs
- `POST /api/v2/vehicles/:id/pose-override` — reset/inject vehicle pose (`x`, `z`, `headingRad`, `velocityMps`, `batteryPct`) with mandatory `reason`; requires `manageControlPlane` or `controlVehicle` (`twin_only`/`shadow` safety check enforced).
- `POST /api/v2/vehicles/:id/attachment` — force-attach (`loadId: PLT-*`) or force-detach cargo cleanly syncing `WmsService` pallet location/transit state; requires `controlVehicle`.
- `PATCH /api/v2/vehicles/:id/profile` — runtime speed limit override (`maxSpeedMps`) with audit event; requires `manageControlPlane`.
- Existing `POST /api/v2/vehicles/:id/{pause,resume,estop,estop/ack,stale}` updated to record structured `runtimeOverrides[]` and obey `dt.ep06.*` flags & `vehicleRuntime` knobs.

### F. Operator Console UI Controls
- **Control Plane Tab (`src/client/ControlPlanePanel.tsx`)**:
  - Add **Vehicle Runtime & Telemetry** section with live editors for `poseInterpolation`, `easing`, `maxExtrapolateMs`, `staleTelemetryMs`, `driftThresholdMeters`, and `dt.ep06.*` feature flags.
- **Fleet & Controls Tab (`src/client/OperationsDock.tsx`)**:
  - Add **"Inspect Runtime"** drawer per vehicle displaying `GET /api/v2/vehicles/:id/explain` telemetry age, drift, safety intents, and override log.
  - Add inline manual overrides: **Snap/Inject Pose**, **Force Attach/Detach Load**, and **Max Speed Cap**.
- **3D Viewport (`src/client/ThreeTwinViewport.tsx`)**:
  - Wire `snapshot.config.vehicleRuntime` + `snapshot.flags['dt.ep06.poseInterpolation']` into `animate()` loop (`linear` vs `easeInOut` + bounded `maxExtrapolateMs` velocity extrapolation).

### G. Events Emitted
- `twin.vehicle.pose`
- `twin.vehicle.stale`
- `twin.vehicle.drift_detected`
- `twin.vehicle.estop`
- `twin.vehicle.attachment`
- `twin.vehicle.override`

### H. Planned Tests (`tests/p2-control-plane-ep06.test.ts` — Positive / Negative / Boundary)
1. **Staleness & Drift Boundaries**:
   - Telemetry age `staleTelemetryMs - 50ms` stays fresh; `staleTelemetryMs + 50ms` marks `isStale = true`; lowering `staleTelemetryMs` dynamically flips staleness evaluation.
   - `dt.ep06.staleAutoPause = true` pauses active mission on stale telemetry.
   - Pose drift `<= driftThresholdMeters` does not replan; drift `> driftThresholdMeters` triggers replan when `dt.ep06.driftAutoReplan = true` and emits `twin.vehicle.drift_detected` only when `false`.
2. **Feature Flag & RBAC Guards**:
   - Disabling `dt.ep06.telemetryIngestion` rejects telemetry with `409 FEATURE_DISABLED`.
   - `VIEW-01` denied pose/attachment/profile overrides (`403 UNAUTHORIZED_RBAC`); `OP-01` denied `PATCH /profile` (`403`) while `DISP-01` succeeds (`200`).
3. **Manual Overrides & Explainability**:
   - `POST /vehicles/:id/attachment` force-attaches and force-detaches `PLT-1002` cleanly updating `WmsService`.
   - `POST /vehicles/:id/pose-override` snaps pose and logs audit entry visible in `GET /vehicles/:id/explain`.
   - Safety invariant: `physicalIoActuated === false` across all intents.

### I. Traceability Matrix (EP06)
| Task ID | Control Knobs & Flags | API / Override | Test Coverage |
| :--- | :--- | :--- | :--- |
| `DT-EP06-F01-US01-T01/02` | `vehicleRuntime`, vehicle speed cap | `PATCH /vehicles/:id/profile` | Profile speed override, RBAC check |
| `DT-EP06-F02-US01-T01/02` | `poseInterpolation`, `easing`, `maxExtrapolateMs`, `dt.ep06.poseInterpolation` | `PATCH /control-plane/config`, `ThreeTwinViewport` | Viewport interpolation/extrapolation wiring |
| `DT-EP06-F03-US01-T01/02` | `staleTelemetryMs`, `driftThresholdMeters`, `dt.ep06.telemetryIngestion`, `dt.ep06.staleAutoPause`, `dt.ep06.driftAutoReplan` | `POST /vehicles/telemetry`, `GET /vehicles/:id/explain`, `POST /vehicles/:id/pose-override` | Staleness & drift boundaries, flag toggles |
| `DT-EP06-F04-US01-T01/02` | Attachment state tracking | `POST /vehicles/:id/attachment` | Force attach/detach + WMS sync |
| `DT-EP06-F05-US01-T01/02` | `actuationMode`, `dt.safety.physicalActuationAllowed` | `POST /vehicles/:id/{pause,resume,estop,estop/ack}` | Runtime explainability + E-stop RBAC |

---

**Checkpoint:** Ready for your approval (`confirm`) to implement the **EP06 Control Plane** (and proceed to the EP08 Control Spec next).
