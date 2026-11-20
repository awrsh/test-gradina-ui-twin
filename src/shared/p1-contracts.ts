/**
 * [P1-CONTRACT] Minimal P1 Foundation Contracts & Stubs for Gradian Digital Twin.
 * Provides versioned primitives for multi-site tenancy, RBAC + Spatial ABAC,
 * spatial world model, navigation topology, event backbone, and safety boundary.
 */

export const P1_CONTRACT_VERSION = '2026.2.0-p1-stub';

export type CleanlinessGrade = 'Warehouse' | 'Grade D' | 'Grade C' | 'Grade B' | 'Grade A';

export type ActorRole = 'operator' | 'dispatcher' | 'supervisor' | 'qa_lead' | 'viewer';

export interface TenantSiteContext {
  tenantId: string;
  siteId: string;
  worldRevision: string;
}

export interface ActorPrincipal {
  actorId: string;
  displayName: string;
  role: ActorRole;
  tenantId: string;
  siteId: string;
  allowedZones: string[]; // Spatial ABAC zone allowlist ('*' for all)
  allowedCleanlinessGrades: CleanlinessGrade[];
  permissions: {
    issueMove: boolean;
    controlVehicle: boolean; // pause / resume / cancel
    ackEstop: boolean;
    manageQa: boolean;
    manageClosures: boolean;
    manageMes: boolean;
    manageMaintenance: boolean;
    manageControlPlane: boolean;
    manageSafetyMode: boolean;
  };
}

export interface Pose3D {
  x: number;
  y: number;
  z: number;
  headingRad: number;
}

export type SpatialLocationKind =
  | 'dock_in'
  | 'dock_out'
  | 'bin'
  | 'staging'
  | 'parking'
  | 'buffer'
  | 'workstation'
  | 'airlock'
  | 'junction';

export interface SpatialLocation {
  id: string;
  tenantId: string;
  siteId: string;
  worldRevision: string;
  code: string;
  name: string;
  kind: SpatialLocationKind;
  buildingId: string;
  floorId: string;
  zoneId: string;
  roomId?: string;
  rackId?: string;
  cleanlinessGrade: CleanlinessGrade;
  navNodeId: string;
  pose: Pose3D;
  capacity?: number;
  aliases?: string[];
}

export interface SpatialZone {
  id: string;
  name: string;
  kind: 'warehouse' | 'staging' | 'production' | 'airlock' | 'quarantine';
  cleanlinessGrade: CleanlinessGrade;
  bounds: { xMin: number; xMax: number; zMin: number; zMax: number };
  colorHex: string;
}

export interface NavNode {
  id: string;
  x: number;
  y: number;
  z: number;
  zoneId: string;
  cleanlinessGrade: CleanlinessGrade;
  isIntersection?: boolean;
  isAirlockNode?: boolean;
  airlockId?: string;
  label?: string;
}

export interface NavEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  lengthM: number;
  maxWidthM: number;
  maxHeightM: number;
  maxSlopeDeg: number;
  oneWay: boolean;
  capacity: number; // max concurrent vehicles in edge window
  preferredAisle: boolean; // lower safety/cost weight when true
  speedLimitMps: number;
  zoneId: string;
  cleanlinessGrade: CleanlinessGrade;
  closed: boolean;
  closureReason?: string;
  requiresAirlockId?: string;
}

export interface WorldModel {
  tenantId: string;
  siteId: string;
  siteName: string;
  worldRevision: string;
  zones: SpatialZone[];
  locations: SpatialLocation[];
  navNodes: NavNode[];
  navEdges: NavEdge[];
}

export type TwinEventTopic =
  | 'twin.mission.transition'
  | 'twin.mission.rerouted'
  | 'twin.mission.override'
  | 'twin.traffic.reservation'
  | 'twin.traffic.reservation_released'
  | 'twin.traffic.deadlock_resolved'
  | 'twin.vehicle.pose'
  | 'twin.vehicle.stale'
  | 'twin.vehicle.estop'
  | 'twin.vehicle.attachment'
  | 'twin.wms.inventory'
  | 'twin.wms.flow'
  | 'twin.mes.line'
  | 'twin.mes.batch'
  | 'twin.mes.bom_handoff'
  | 'twin.mes.maintenance'
  | 'twin.topology.closure'
  | 'twin.task.created'
  | 'twin.task.updated'
  | 'twin.config.updated'
  | 'twin.flag.updated'
  | 'twin.safety.actuation_mode_changed'
  | 'twin.audit.security';

export interface TwinEventEnvelope<T = unknown> {
  eventId: string;
  topic: TwinEventTopic;
  schemaVersion: string;
  tenantId: string;
  siteId: string;
  worldRevision: string;
  actorId: string;
  timestampIso: string;
  correlationId?: string;
  payload: T;
}

/**
 * [P1-CONTRACT] Safety Boundary:
 * Twin commands NEVER directly actuate physical hardware/PLC/vehicle I/O.
 * All physical actuation intents must be forwarded to an approved Fleet Controller
 * Gateway with hardware interlock validation.
 */
export interface PhysicalIntentAudit {
  intentId: string;
  tenantId: string;
  siteId: string;
  vehicleId: string;
  missionId?: string;
  intentType: 'DISPATCH_PLAN' | 'PAUSE_INTENT' | 'RESUME_INTENT' | 'CANCEL_INTENT' | 'ESTOP_LATCH_TWIN';
  interlockVerified: boolean;
  physicalIoActuated: false; // Invariant: always false in twin layer
  gatewayName: string;
  timestampIso: string;
}

export interface PhysicalControllerGateway {
  readonly gatewayId: string;
  submitOrchestrationIntent(
    intent: Omit<PhysicalIntentAudit, 'intentId' | 'interlockVerified' | 'physicalIoActuated' | 'gatewayName' | 'timestampIso'>
  ): PhysicalIntentAudit;
  getRecentIntents(tenantId: string, siteId: string): PhysicalIntentAudit[];
}
