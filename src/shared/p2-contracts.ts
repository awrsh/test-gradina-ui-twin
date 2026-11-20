import { z } from 'zod';
import type { CleanlinessGrade, Pose3D, TenantSiteContext } from './p1-contracts.ts';

export const P2_CONTRACT_VERSION = '2026.2.0';

export type TwinErrorCode =
  | 'LOCATION_NOT_FOUND'
  | 'LOCATION_AMBIGUOUS'
  | 'UNAUTHORIZED_RBAC'
  | 'UNAUTHORIZED_SPATIAL_ABAC'
  | 'GMP_AIRLOCK_REQUIRED'
  | 'QA_QUARANTINE_BLOCKED'
  | 'MAINTENANCE_CONFLICT'
  | 'UNREACHABLE_ROUTE'
  | 'INCOMPATIBLE_VEHICLE'
  | 'INVALID_STATE_TRANSITION'
  | 'IDEMPOTENCY_CONFLICT'
  | 'RESERVATION_CONFLICT'
  | 'E_STOP_ACTIVE'
  | 'FEATURE_DISABLED'
  | 'SAFETY_INTERLOCK_REQUIRED'
  | 'VALIDATION_ERROR'
  | 'RESOURCE_NOT_FOUND';

export interface TwinErrorBody {
  code: TwinErrorCode;
  message: string;
  httpStatus: number;
  details?: Record<string, unknown>;
  correlationId?: string;
}

export class TwinDomainError extends Error {
  public readonly code: TwinErrorCode;
  public readonly httpStatus: number;
  public readonly details?: Record<string, unknown>;

  constructor(
    code: TwinErrorCode,
    message: string,
    httpStatus = 400,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'TwinDomainError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }

  toJSON(): TwinErrorBody {
    return {
      code: this.code,
      message: this.message,
      httpStatus: this.httpStatus,
      details: this.details,
    };
  }
}

// ============================================================================
// EP05 — Routing & Traffic Orchestration
// ============================================================================

export type CostProfile = 'fastest' | 'safest' | 'shortest';

export type MissionState =
  | 'requested'
  | 'planned'
  | 'executing'
  | 'paused'
  | 'completed'
  | 'failed';

export const MoveCommandSchema = z.object({
  idempotencyKey: z.string().min(3).max(128),
  originId: z.string().min(1),
  destinationId: z.string().min(1),
  vehicleId: z.string().min(1).optional(), // omit for auto-dispatch
  costProfile: z.enum(['shortest', 'fastest', 'safest']).optional(),
  priority: z.number().int().min(1).max(10).default(5),
  payloadKg: z.number().min(0).max(5000).default(250),
  loadId: z.string().optional(),
  bomOrderId: z.string().optional(),
  airlockOverrideApproved: z.boolean().default(false),
  dryRun: z.boolean().default(false),
});

export type MoveCommandInput = z.infer<typeof MoveCommandSchema>;

export interface RouteSegment {
  edgeId: string;
  fromNodeId: string;
  toNodeId: string;
  lengthM: number;
  cost: number;
  estimatedDurationSec: number;
  zoneId: string;
}

export interface PlannedRoute {
  costProfile: CostProfile;
  nodeIds: string[];
  segments: RouteSegment[];
  totalDistanceM: number;
  totalCost: number;
  estimatedDurationSec: number;
  passesAirlockId?: string;
}

export interface EdgeReservation {
  reservationId: string;
  edgeId: string;
  fromNodeId: string;
  toNodeId: string;
  vehicleId: string;
  missionId: string;
  startMs: number;
  endMs: number;
}

export interface DeadlockResolutionRecord {
  resolutionId: string;
  policy: 'wait' | 'yield' | 'replan';
  involvedVehicles: string[];
  contestedEdgeId: string;
  winnerVehicleId: string;
  yieldVehicleId: string;
  waitMs: number;
  reason: string;
  timestampIso: string;
}

export interface MissionTransitionRecord {
  fromState: MissionState | null;
  toState: MissionState;
  actorId: string;
  reason: string;
  worldRevision: string;
  timestampIso: string;
}

export interface MissionCandidateScore {
  vehicleId: string;
  eligible: boolean;
  rejectionReasons: string[];
  scoreBreakdown?: {
    distanceTerm: number;
    batteryTerm: number;
    workloadTerm: number;
    capabilityFitTerm: number;
    totalScore: number;
  };
}

export interface MissionOverrideRecord {
  overrideId: string;
  action: 'pause' | 'resume' | 'replan' | 'reassign' | 'release_reservation';
  actorId: string;
  reason: string;
  details?: Record<string, unknown>;
  timestampIso: string;
}

export interface MissionDecisionExplanation {
  missionId: string;
  worldRevision: string;
  resolvedOrigin: { id: string; code: string; navNodeId: string; zoneId: string };
  resolvedDestination: { id: string; code: string; navNodeId: string; zoneId: string };
  selectedVehicleId: string | null;
  autoAssigned: boolean;
  candidates: MissionCandidateScore[];
  routingSummary: {
    algorithm: 'weighted_astar';
    costProfile: CostProfile;
    expandedNodes: number;
    maxExpandNodes: number;
    totalDistanceM: number;
    totalCost: number;
    costWeights: TwinOpsConfig['routing']['costs'];
  } | null;
  trafficDecisions: string[];
  overrides: MissionOverrideRecord[];
}

export interface Mission {
  id: string;
  idempotencyKey: string;
  tenantId: string;
  siteId: string;
  worldRevision: string;
  originLocationId: string;
  destinationLocationId: string;
  originCode: string;
  destinationCode: string;
  vehicleId: string | null;
  costProfile: CostProfile;
  priority: number;
  payloadKg: number;
  loadId?: string;
  bomOrderId?: string;
  state: MissionState;
  route: PlannedRoute | null;
  reservations: EdgeReservation[];
  currentSegmentIndex: number;
  progressOnSegment: number; // 0..1
  replanCount: number;
  failureReason?: string;
  createdAtIso: string;
  updatedAtIso: string;
  transitions: MissionTransitionRecord[];
  decisionExplanation?: MissionDecisionExplanation;
}

// ============================================================================
// EP06 — Vehicle & Movement Runtime
// ============================================================================

export type VehicleType = 'AMR' | 'AGV' | 'Forklift';
export type VehicleOperationalStatus =
  | 'idle'
  | 'busy'
  | 'paused'
  | 'e_stopped'
  | 'stale'
  | 'charging';

export interface VehicleAttachment {
  loadId: string;
  loadType: 'pallet' | 'tote' | 'bin_carrier';
  label: string;
  weightKg: number;
  state: 'attached' | 'in_transit' | 'detached';
  attachedAtIso: string;
  detachedAtIso?: string;
}

export interface VehicleProfile {
  id: string;
  tenantId: string;
  siteId: string;
  name: string;
  type: VehicleType;
  dimensions: {
    lengthM: number;
    widthM: number;
    heightM: number;
  };
  maxSpeedMps: number;
  turnRadiusM: number;
  maxPayloadKg: number;
  maxSlopeDeg: number;
  allowedZones: string[];
  allowedCleanlinessGrades: CleanlinessGrade[];
  batteryPct: number;
  status: VehicleOperationalStatus;
  pose: Pose3D;
  velocityMps: number;
  lastTelemetryMs: number;
  telemetrySequence: number;
  staleThresholdMs: number;
  isStale: boolean;
  driftMeters: number;
  eStopActive: boolean;
  eStopReason?: string;
  eStopAcknowledgedBy?: string;
  eStopAcknowledgedAtIso?: string;
  activeMissionId: string | null;
  queuedMissionIds: string[];
  attachment: VehicleAttachment | null;
}

export const VehicleTelemetrySchema = z.object({
  vehicleId: z.string().min(1),
  pose: z.object({
    x: z.number(),
    y: z.number(),
    z: z.number(),
    headingRad: z.number(),
  }),
  velocityMps: z.number().min(0).max(15).default(0),
  batteryPct: z.number().min(0).max(100).optional(),
  timestampMs: z.number().int().positive(),
  sequence: z.number().int().nonnegative(),
});

export type VehicleTelemetryInput = z.infer<typeof VehicleTelemetrySchema>;

// ============================================================================
// EP08 — WMS Digital Twin
// ============================================================================

export type QaStatus = 'released' | 'quarantine' | 'hold';

export interface Gs1Item {
  id: string;
  gtin: string;
  sku: string;
  description: string;
  lot: string;
  serial: string;
  quantity: number;
  uom: 'EA' | 'KG' | 'BOX';
  expiryIso: string;
}

export interface Gs1Carton {
  id: string;
  sscc: string;
  gtin: string;
  lot: string;
  items: Gs1Item[];
}

export interface Gs1Pallet {
  id: string;
  sscc: string;
  label: string;
  locationId: string;
  binCode: string;
  qaStatus: QaStatus;
  weightKg: number;
  cartons: Gs1Carton[];
  inTransitVehicleId?: string | null;
}

export interface BinOccupancy {
  locationId: string;
  binCode: string;
  zoneId: string;
  capacityPallets: number;
  usedPallets: number;
  utilizationPct: number;
  qaStatusSummary: QaStatus | 'mixed' | 'empty';
  palletIds: string[];
}

export type WarehouseFlowKind =
  | 'inbound_receiving'
  | 'inbound_putaway'
  | 'outbound_picking'
  | 'outbound_staging'
  | 'outbound_loading';

export interface WarehouseFlowRecord {
  id: string;
  kind: WarehouseFlowKind;
  palletId: string;
  sscc: string;
  fromLocationId: string;
  toLocationId: string;
  missionId?: string;
  status: 'queued' | 'in_progress' | 'completed' | 'blocked_qa';
  updatedAtIso: string;
}

export interface HeatmapCell {
  id: string;
  x: number;
  z: number;
  width: number;
  depth: number;
  zoneId: string;
  congestionScore: number; // 0..1
  travelIntensity: number; // 0..1
  traversalCount: number;
}

export interface SlottingOpportunity {
  id: string;
  severity: 'high' | 'medium' | 'low';
  kind: 'slotting' | 'replenishment';
  title: string;
  rationale: string;
  sourceBinCode: string;
  targetBinCode: string;
  estimatedTravelReductionPct: number;
}

// ============================================================================
// EP09 — Production & MES Digital Twin
// ============================================================================

export type MachineRunState = 'run' | 'idle' | 'down' | 'maintenance';
export type CalibrationStatus = 'calibrated' | 'due_soon' | 'expired';

export interface ProductionAsset {
  id: string;
  code: string;
  name: string;
  kind: 'line' | 'machine' | 'buffer' | 'room' | 'airlock';
  locationId: string;
  roomId: string;
  lineId?: string;
  cleanlinessGrade: CleanlinessGrade;
  calibrationStatus: CalibrationStatus;
  calibrationDueIso: string;
  machineState: MachineRunState;
  oee: {
    availability: number; // 0..1
    performance: number; // 0..1
    quality: number; // 0..1
    overall: number; // 0..1
  };
  currentBatchId?: string;
  pose: Pose3D;
}

export interface BomDemand {
  id: string;
  workOrderId: string;
  productSku: string;
  productName: string;
  targetLineId: string;
  targetBufferLocationId: string;
  requiredGtin: string;
  requiredLot: string;
  quantity: number;
  uom: string;
  sourceBinLocationId: string;
  linkedMissionId?: string | null;
  handoffState: 'pending' | 'in_transit' | 'handed_off' | 'consumed';
}

export interface BatchJourneyStep {
  stepOrder: number;
  locationId: string;
  locationCode: string;
  assetId: string;
  assetName: string;
  cleanlinessGrade: CleanlinessGrade;
  enteredAtIso: string;
  exitedAtIso?: string;
  status: 'completed' | 'active' | 'pending';
}

export interface BatchGenealogy {
  batchId: string;
  productName: string;
  productSku: string;
  status: 'in_process' | 'qa_review' | 'released';
  inputLots: Array<{
    gtin: string;
    lot: string;
    materialName: string;
    sourcePalletId: string;
    quantity: number;
    uom: string;
  }>;
  spatialJourney: BatchJourneyStep[];
}

export interface GmpTransferRule {
  id: string;
  fromGrade: CleanlinessGrade;
  toGrade: CleanlinessGrade;
  requiredAirlockId: string;
  requiresQaRelease: boolean;
  personnelFlowRule: string;
  materialFlowRule: string;
}

export interface MaintenanceWindow {
  id: string;
  assetId: string;
  assetCode: string;
  locationId: string;
  type: 'PM' | 'calibration' | 'production_run';
  title: string;
  startIso: string;
  endIso: string;
  active: boolean;
  blocksDispatch: boolean;
}

export const CreateMaintenanceWindowSchema = z.object({
  assetId: z.string().min(1),
  type: z.enum(['PM', 'calibration', 'production_run']),
  title: z.string().min(2).max(160),
  active: z.boolean().default(true),
  blocksDispatch: z.boolean().default(true),
});

export type ObjectEntityKind = 'vehicle' | 'location' | 'asset' | 'pallet';
export type ObjectTaskCategory =
  | 'inspection'
  | 'maintenance'
  | 'qa_sampling'
  | 'sanitation'
  | 'cycle_count'
  | 'charging'
  | 'material_prep';
export type ObjectTaskPriority = 'low' | 'medium' | 'high' | 'critical';
export type ObjectTaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

export interface ObjectTask {
  id: string;
  tenantId: string;
  siteId: string;
  targetKind: ObjectEntityKind;
  targetId: string;
  title: string;
  titleFa?: string;
  category: ObjectTaskCategory;
  priority: ObjectTaskPriority;
  status: ObjectTaskStatus;
  notes?: string;
  createdBy: string;
  createdAtIso: string;
  updatedAtIso: string;
}

export const CreateObjectTaskSchema = z.object({
  targetKind: z.enum(['vehicle', 'location', 'asset', 'pallet']),
  targetId: z.string().min(1),
  title: z.string().min(2).max(160),
  titleFa: z.string().max(160).optional(),
  category: z.enum([
    'inspection',
    'maintenance',
    'qa_sampling',
    'sanitation',
    'cycle_count',
    'charging',
    'material_prep',
  ]),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  notes: z.string().max(400).optional(),
  startImmediately: z.boolean().optional(),
});

export interface TwinMetricsSnapshot {
  commandsAccepted: number;
  commandsRejected: number;
  routingFailures: number;
  replansTriggered: number;
  deadlocksResolved: number;
  staleVehiclesCount: number;
  eStopsActiveCount: number;
  activeMissionsCount: number;
  completedMissionsCount: number;
}

export type ActuationMode = 'twin_only' | 'shadow' | 'physical';

export interface TwinOpsConfig {
  actuationMode: ActuationMode;
  worldRevisionPin?: string;
  routing: {
    algorithm: 'weighted_astar';
    defaultCostProfile: CostProfile;
    costs: {
      distance: number;
      turn: number;
      elevation: number;
      congestion: number;
      closurePenalty: number;
    };
    maxExpandNodes: number;
    allowPartialPath: false;
  };
  traffic: {
    edgeReservationEnabled: boolean;
    reservationHorizonSec: number;
    edgeCapacityDefault: number;
    intersectionPolicy: 'wait' | 'yield' | 'replan';
    deadlockDetectionIntervalMs: number;
    deadlockResolvePolicy: 'replan_lowest_priority' | 'pause_all_and_alert' | 'fail_mission';
  };
  dispatch: {
    scoring: {
      wDistance: number;
      wBattery: number;
      wWorkload: number;
      wCapabilityFit: number;
    };
    minBatteryPct: number;
    maxQueueDepthPerVehicle: number;
    autoAssign: boolean;
  };
  mission: {
    staleCommandTimeoutSec: number;
    maxReplans: number;
    deviationThresholdMeters: number;
    idempotencyTtlSec: number;
  };
  vehicleRuntime: {
    poseInterpolation: boolean;
    maxExtrapolateMs: number;
    staleTelemetryMs: number;
    driftThresholdMeters: number;
    easing: 'linear' | 'easeInOut';
  };
  wms: {
    occupancyBands: { low: number; mid: number; high: number };
    heatmapWindowMin: number;
    quarantineBlocksPutaway: boolean;
    quarantineBlocksPicking: boolean;
  };
  mes: {
    oeeWindowMin: number;
    gmpEnforcement: 'off' | 'warn' | 'block';
    maintenanceBlocksDispatch: boolean;
  };
  ui: {
    defaultOverlays: string[];
    cameraFollowSelectedVehicle: boolean;
  };
}

export interface TwinFeatureFlags {
  'dt.safety.physicalActuationAllowed': boolean;
  'dt.ep05.semanticCommands': boolean;
  'dt.ep05.weightedAstar': boolean;
  'dt.ep05.edgeReservations': boolean;
  'dt.ep05.autoDeadlockResolve': boolean;
  'dt.ep05.dynamicReroute': boolean;
  'dt.ep05.autoDispatch': boolean;
}

export const TwinOpsConfigPatchSchema = z.object({
  worldRevisionPin: z.string().optional(),
  routing: z
    .object({
      defaultCostProfile: z.enum(['shortest', 'fastest', 'safest']).optional(),
      costs: z
        .object({
          distance: z.number().min(0).max(50).optional(),
          turn: z.number().min(0).max(50).optional(),
          elevation: z.number().min(0).max(50).optional(),
          congestion: z.number().min(0).max(50).optional(),
          closurePenalty: z.number().min(10).max(100000).optional(),
        })
        .optional(),
      maxExpandNodes: z.number().int().min(1).max(10000).optional(),
    })
    .optional(),
  traffic: z
    .object({
      edgeReservationEnabled: z.boolean().optional(),
      reservationHorizonSec: z.number().int().min(5).max(3600).optional(),
      edgeCapacityDefault: z.number().int().min(1).max(10).optional(),
      intersectionPolicy: z.enum(['wait', 'yield', 'replan']).optional(),
      deadlockDetectionIntervalMs: z.number().int().min(100).max(10000).optional(),
      deadlockResolvePolicy: z
        .enum(['replan_lowest_priority', 'pause_all_and_alert', 'fail_mission'])
        .optional(),
    })
    .optional(),
  dispatch: z
    .object({
      scoring: z
        .object({
          wDistance: z.number().min(0).max(100).optional(),
          wBattery: z.number().min(0).max(100).optional(),
          wWorkload: z.number().min(0).max(200).optional(),
          wCapabilityFit: z.number().min(0).max(100).optional(),
        })
        .optional(),
      minBatteryPct: z.number().min(0).max(95).optional(),
      maxQueueDepthPerVehicle: z.number().int().min(0).max(20).optional(),
      autoAssign: z.boolean().optional(),
    })
    .optional(),
  mission: z
    .object({
      staleCommandTimeoutSec: z.number().int().min(5).max(3600).optional(),
      maxReplans: z.number().int().min(0).max(20).optional(),
      deviationThresholdMeters: z.number().min(0.2).max(20).optional(),
      idempotencyTtlSec: z.number().int().min(10).max(86400).optional(),
    })
    .optional(),
  vehicleRuntime: z
    .object({
      poseInterpolation: z.boolean().optional(),
      maxExtrapolateMs: z.number().int().min(0).max(2000).optional(),
      staleTelemetryMs: z.number().int().min(500).max(60000).optional(),
      driftThresholdMeters: z.number().min(0.2).max(20).optional(),
      easing: z.enum(['linear', 'easeInOut']).optional(),
    })
    .optional(),
  wms: z
    .object({
      occupancyBands: z
        .object({
          low: z.number().min(1).max(99).optional(),
          mid: z.number().min(1).max(99).optional(),
          high: z.number().min(1).max(100).optional(),
        })
        .optional(),
      heatmapWindowMin: z.number().int().min(1).max(1440).optional(),
      quarantineBlocksPutaway: z.boolean().optional(),
      quarantineBlocksPicking: z.boolean().optional(),
    })
    .optional(),
  mes: z
    .object({
      oeeWindowMin: z.number().int().min(1).max(1440).optional(),
      gmpEnforcement: z.enum(['off', 'warn', 'block']).optional(),
      maintenanceBlocksDispatch: z.boolean().optional(),
    })
    .optional(),
  ui: z
    .object({
      defaultOverlays: z.array(z.string()).optional(),
      cameraFollowSelectedVehicle: z.boolean().optional(),
    })
    .optional(),
});

export const ActuationModeChangeSchema = z.object({
  actuationMode: z.enum(['twin_only', 'shadow', 'physical']),
  reason: z.string().min(3).max(256),
  confirmPhrase: z.string().optional(),
  secondaryApproverId: z.string().optional(),
});

export interface TwinFullSnapshot {
  schemaVersion: string;
  context: TenantSiteContext;
  config: TwinOpsConfig;
  flags: TwinFeatureFlags;
  world: {
    siteName: string;
    zones: WorldZoneSummary[];
    locations: import('./p1-contracts').SpatialLocation[];
    navNodes: import('./p1-contracts').NavNode[];
    navEdges: import('./p1-contracts').NavEdge[];
  };
  vehicles: VehicleProfile[];
  missions: Mission[];
  reservations: EdgeReservation[];
  deadlockResolutions: DeadlockResolutionRecord[];
  wms: {
    pallets: Gs1Pallet[];
    occupancy: BinOccupancy[];
    flows: WarehouseFlowRecord[];
    heatmaps: HeatmapCell[];
    opportunities: SlottingOpportunity[];
  };
  mes: {
    assets: ProductionAsset[];
    bomDemands: BomDemand[];
    batches: BatchGenealogy[];
    gmpRules: GmpTransferRule[];
    maintenanceWindows: MaintenanceWindow[];
  };
  tasks: ObjectTask[];
  metrics: TwinMetricsSnapshot;
  safetyIntents: import('./p1-contracts').PhysicalIntentAudit[];
  autopilot?: AutopilotStatus;
}

export interface AutopilotStatus {
  enabled: boolean;
  speedMultiplier: 1 | 2 | 4;
  cyclesCompleted: number;
  lastActionIso: string | null;
}

export type WorldZoneSummary = import('./p1-contracts').SpatialZone;
