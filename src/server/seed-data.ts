import type {
  CleanlinessGrade,
  NavEdge,
  NavNode,
  SpatialLocation,
  SpatialZone,
  WorldModel,
} from '../shared/p1-contracts.ts';
import type {
  BatchGenealogy,
  BomDemand,
  GmpTransferRule,
  Gs1Pallet,
  HeatmapCell,
  MaintenanceWindow,
  ObjectTask,
  ProductionAsset,
  SlottingOpportunity,
  VehicleProfile,
  WarehouseFlowRecord,
} from '../shared/p2-contracts.ts';

export const DEFAULT_TENANT_ID = 'tenant-gradian-pharma';
export const DEFAULT_SITE_ID = 'site-teh-01';
export const DEFAULT_WORLD_REVISION = 'rev-2026.11.04';

function dist2D(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Number(Math.hypot(b.x - a.x, b.z - a.z).toFixed(2));
}

export function createSeedWorldModel(
  tenantId = DEFAULT_TENANT_ID,
  siteId = DEFAULT_SITE_ID,
  worldRevision = DEFAULT_WORLD_REVISION
): WorldModel {
  const zones: SpatialZone[] = [
    {
      id: 'WH-MAIN',
      name: 'Warehouse Main Storage',
      kind: 'warehouse',
      cleanlinessGrade: 'Warehouse',
      bounds: { xMin: -25, xMax: 2, zMin: -15, zMax: 15 },
      colorHex: '#1e293b',
    },
    {
      id: 'WH-QUARANTINE',
      name: 'QA Quarantine Cage',
      kind: 'quarantine',
      cleanlinessGrade: 'Warehouse',
      bounds: { xMin: -16.5, xMax: -11.5, zMin: 4, zMax: 8.5 },
      colorHex: '#78350f',
    },
    {
      id: 'AIRLOCK-ZONE',
      name: 'GMP Material Airlock',
      kind: 'airlock',
      cleanlinessGrade: 'Grade D',
      bounds: { xMin: 2, xMax: 8, zMin: -4, zMax: 4 },
      colorHex: '#0f766e',
    },
    {
      id: 'ROOM-PREP-01',
      name: 'Granulation & Prep Suite',
      kind: 'production',
      cleanlinessGrade: 'Grade C',
      bounds: { xMin: 8, xMax: 26, zMin: -15, zMax: 0 },
      colorHex: '#1e3a5f',
    },
    {
      id: 'ROOM-FILL-01',
      name: 'Aseptic Filling Suite',
      kind: 'production',
      cleanlinessGrade: 'Grade B',
      bounds: { xMin: 8, xMax: 26, zMin: 0, zMax: 15 },
      colorHex: '#172554',
    },
  ];

  const navNodes: NavNode[] = [
    // Docks & Parking (West)
    { id: 'N-DOCK-IN', x: -22, y: 0, z: -10, zoneId: 'WH-MAIN', cleanlinessGrade: 'Warehouse', label: 'Receiving Dock 01' },
    { id: 'N-PARK-01', x: -21, y: 0, z: 0, zoneId: 'WH-MAIN', cleanlinessGrade: 'Warehouse', isIntersection: true, label: 'Fleet Staging' },
    { id: 'N-DOCK-OUT', x: -22, y: 0, z: 10, zoneId: 'WH-MAIN', cleanlinessGrade: 'Warehouse', label: 'Shipping Dock 01' },

    // Main Aisle Spine (z = 0)
    { id: 'N-AISLE-W', x: -16, y: 0, z: 0, zoneId: 'WH-MAIN', cleanlinessGrade: 'Warehouse', isIntersection: true },
    { id: 'N-AISLE-C', x: -9, y: 0, z: 0, zoneId: 'WH-MAIN', cleanlinessGrade: 'Warehouse', isIntersection: true },
    { id: 'N-AISLE-E', x: -2, y: 0, z: 0, zoneId: 'WH-MAIN', cleanlinessGrade: 'Warehouse', isIntersection: true },

    // North Bypass Aisle & Rack A Bins (z = -10 and z = -6)
    { id: 'N-NORTH-W', x: -16, y: 0, z: -10, zoneId: 'WH-MAIN', cleanlinessGrade: 'Warehouse', isIntersection: true },
    { id: 'N-BIN-A1-01', x: -14, y: 0, z: -6, zoneId: 'WH-MAIN', cleanlinessGrade: 'Warehouse', label: 'BIN-A1-01' },
    { id: 'N-NORTH-C', x: -9, y: 0, z: -10, zoneId: 'WH-MAIN', cleanlinessGrade: 'Warehouse', isIntersection: true },
    { id: 'N-BIN-A1-02', x: -8, y: 0, z: -6, zoneId: 'WH-MAIN', cleanlinessGrade: 'Warehouse', label: 'BIN-A1-02' },
    { id: 'N-NORTH-E', x: -2, y: 0, z: -10, zoneId: 'WH-MAIN', cleanlinessGrade: 'Warehouse', isIntersection: true },
    { id: 'N-BIN-A2-01', x: -2, y: 0, z: -6, zoneId: 'WH-MAIN', cleanlinessGrade: 'Warehouse', label: 'BIN-A2-01' },

    // South Bypass Aisle & Rack B / Staging (z = 10 and z = 6)
    { id: 'N-SOUTH-W', x: -16, y: 0, z: 10, zoneId: 'WH-MAIN', cleanlinessGrade: 'Warehouse', isIntersection: true },
    { id: 'N-BIN-B1-01', x: -14, y: 0, z: 6, zoneId: 'WH-QUARANTINE', cleanlinessGrade: 'Warehouse', label: 'BIN-B1-01 (QA)' },
    { id: 'N-SOUTH-C', x: -9, y: 0, z: 10, zoneId: 'WH-MAIN', cleanlinessGrade: 'Warehouse', isIntersection: true },
    { id: 'N-BIN-B1-02', x: -8, y: 0, z: 6, zoneId: 'WH-MAIN', cleanlinessGrade: 'Warehouse', label: 'BIN-B1-02' },
    { id: 'N-SOUTH-E', x: -2, y: 0, z: 10, zoneId: 'WH-MAIN', cleanlinessGrade: 'Warehouse', isIntersection: true },
    { id: 'N-STAGE-OUT', x: -2, y: 0, z: 6, zoneId: 'WH-MAIN', cleanlinessGrade: 'Warehouse', label: 'STAGE-OUT-01' },

    // Airlock Gateway (Warehouse <-> GMP Production)
    { id: 'N-AIRLOCK-W', x: 2, y: 0, z: 0, zoneId: 'AIRLOCK-ZONE', cleanlinessGrade: 'Grade D', isAirlockNode: true, airlockId: 'AIRLOCK-01' },
    { id: 'N-AIRLOCK-C', x: 5, y: 0, z: 0, zoneId: 'AIRLOCK-ZONE', cleanlinessGrade: 'Grade C', isAirlockNode: true, airlockId: 'AIRLOCK-01', label: 'AIRLOCK-01' },
    { id: 'N-AIRLOCK-E', x: 9, y: 0, z: 0, zoneId: 'ROOM-PREP-01', cleanlinessGrade: 'Grade C', isIntersection: true, isAirlockNode: true, airlockId: 'AIRLOCK-01' },

    // Production Wing - Prep Suite (Grade C, North East)
    { id: 'N-PREP-W', x: 9, y: 0, z: -8, zoneId: 'ROOM-PREP-01', cleanlinessGrade: 'Grade C', isIntersection: true },
    { id: 'N-BUF-IN-01', x: 12, y: 0, z: -8, zoneId: 'ROOM-PREP-01', cleanlinessGrade: 'Grade C', label: 'BUF-IN-01' },
    { id: 'N-MIXER-01', x: 18, y: 0, z: -8, zoneId: 'ROOM-PREP-01', cleanlinessGrade: 'Grade C', label: 'MCH-MIXER-01' },
    { id: 'N-COATER-01', x: 23, y: 0, z: -8, zoneId: 'ROOM-PREP-01', cleanlinessGrade: 'Grade C', label: 'MCH-COATER-01' },

    // Production Wing - Filling Suite (Grade B, South East)
    { id: 'N-FILL-W', x: 9, y: 0, z: 8, zoneId: 'ROOM-FILL-01', cleanlinessGrade: 'Grade B', isIntersection: true },
    { id: 'N-BUF-FILL-01', x: 12, y: 0, z: 8, zoneId: 'ROOM-FILL-01', cleanlinessGrade: 'Grade B', label: 'BUF-FILL-01' },
    { id: 'N-FILLER-02', x: 18, y: 0, z: 8, zoneId: 'ROOM-FILL-01', cleanlinessGrade: 'Grade B', label: 'MCH-FILLER-02' },
    { id: 'N-CAPPER-02', x: 23, y: 0, z: 8, zoneId: 'ROOM-FILL-01', cleanlinessGrade: 'Grade B', label: 'MCH-CAPPER-02' },
  ];

  const nodeMap = new Map(navNodes.map((n) => [n.id, n]));
  const makeEdge = (
    id: string,
    fromNodeId: string,
    toNodeId: string,
    opts: Partial<Omit<NavEdge, 'id' | 'fromNodeId' | 'toNodeId' | 'lengthM'>> = {}
  ): NavEdge => {
    const a = nodeMap.get(fromNodeId)!;
    const b = nodeMap.get(toNodeId)!;
    return {
      id,
      fromNodeId,
      toNodeId,
      lengthM: dist2D(a, b),
      maxWidthM: 2.4,
      maxHeightM: 3.5,
      maxSlopeDeg: 2,
      oneWay: false,
      capacity: 1,
      preferredAisle: false,
      speedLimitMps: 2.0,
      zoneId: a.zoneId,
      cleanlinessGrade: b.cleanlinessGrade,
      closed: false,
      ...opts,
    };
  };

  const navEdges: NavEdge[] = [
    // Docks & Park
    makeEdge('LANE-DOCK-IN-W', 'N-DOCK-IN', 'N-NORTH-W', { preferredAisle: true }),
    makeEdge('LANE-DOCK-IN-P', 'N-DOCK-IN', 'N-PARK-01'),
    makeEdge('LANE-PARK-OUT', 'N-PARK-01', 'N-DOCK-OUT'),
    makeEdge('LANE-DOCK-OUT-W', 'N-DOCK-OUT', 'N-SOUTH-W', { preferredAisle: true }),
    makeEdge('LANE-PARK-SPINE', 'N-PARK-01', 'N-AISLE-W', { preferredAisle: true }),

    // Central Main Aisle Spine (Preferred fast corridor)
    makeEdge('LANE-MAIN-01', 'N-AISLE-W', 'N-AISLE-C', { preferredAisle: true, speedLimitMps: 2.2 }),
    makeEdge('LANE-MAIN-02', 'N-AISLE-C', 'N-AISLE-E', { preferredAisle: true, speedLimitMps: 2.2 }),

    // North Aisle & Bins
    makeEdge('LANE-N-01', 'N-NORTH-W', 'N-NORTH-C', { preferredAisle: false }),
    makeEdge('LANE-N-02', 'N-NORTH-C', 'N-NORTH-E', { preferredAisle: false }),
    makeEdge('LANE-N-DROP-W', 'N-NORTH-W', 'N-BIN-A1-01'),
    makeEdge('LANE-SPINE-A1-01', 'N-AISLE-W', 'N-BIN-A1-01'),
    makeEdge('LANE-N-DROP-C', 'N-NORTH-C', 'N-BIN-A1-02'),
    makeEdge('LANE-SPINE-A1-02', 'N-AISLE-C', 'N-BIN-A1-02'),
    makeEdge('LANE-N-DROP-E', 'N-NORTH-E', 'N-BIN-A2-01'),
    makeEdge('LANE-SPINE-A2-01', 'N-AISLE-E', 'N-BIN-A2-01'),

    // South Aisle & Bins / Staging
    makeEdge('LANE-S-01', 'N-SOUTH-W', 'N-SOUTH-C'),
    // Narrow low-clearance shortcut on South-East corridor (incompatible with Forklift width 1.3m / height 2.4m)
    makeEdge('EDGE-NARROW-01', 'N-SOUTH-C', 'N-SOUTH-E', {
      maxWidthM: 1.0,
      maxHeightM: 1.8,
      speedLimitMps: 1.1,
      preferredAisle: false,
    }),
    makeEdge('LANE-S-DROP-W', 'N-SOUTH-W', 'N-BIN-B1-01', { zoneId: 'WH-QUARANTINE' }),
    makeEdge('LANE-SPINE-B1-01', 'N-AISLE-W', 'N-BIN-B1-01', { zoneId: 'WH-QUARANTINE' }),
    makeEdge('LANE-S-DROP-C', 'N-SOUTH-C', 'N-BIN-B1-02'),
    makeEdge('LANE-SPINE-B1-02', 'N-AISLE-C', 'N-BIN-B1-02'),
    makeEdge('LANE-S-DROP-E', 'N-SOUTH-E', 'N-STAGE-OUT'),
    makeEdge('LANE-SPINE-STAGE', 'N-AISLE-E', 'N-STAGE-OUT', { preferredAisle: true }),

    // Airlock Transfer Corridor (GMP gated)
    makeEdge('LANE-TO-AIRLOCK', 'N-AISLE-E', 'N-AIRLOCK-W', { preferredAisle: true, speedLimitMps: 1.5 }),
    makeEdge('LANE-AIRLOCK-IN', 'N-AIRLOCK-W', 'N-AIRLOCK-C', {
      maxWidthM: 1.25,
      maxHeightM: 2.2,
      speedLimitMps: 0.9,
      cleanlinessGrade: 'Grade C',
      requiresAirlockId: 'AIRLOCK-01',
    }),
    makeEdge('LANE-AIRLOCK-OUT', 'N-AIRLOCK-C', 'N-AIRLOCK-E', {
      maxWidthM: 1.25,
      maxHeightM: 2.2,
      speedLimitMps: 0.9,
      cleanlinessGrade: 'Grade C',
      requiresAirlockId: 'AIRLOCK-01',
    }),

    // Production Prep Suite (Grade C)
    makeEdge('LANE-PREP-ENTRY', 'N-AIRLOCK-E', 'N-PREP-W', { zoneId: 'ROOM-PREP-01', cleanlinessGrade: 'Grade C', preferredAisle: true }),
    makeEdge('LANE-PREP-BUF', 'N-PREP-W', 'N-BUF-IN-01', { zoneId: 'ROOM-PREP-01', cleanlinessGrade: 'Grade C', preferredAisle: true }),
    makeEdge('LANE-PREP-MIX', 'N-BUF-IN-01', 'N-MIXER-01', { zoneId: 'ROOM-PREP-01', cleanlinessGrade: 'Grade C' }),
    makeEdge('LANE-PREP-COAT', 'N-MIXER-01', 'N-COATER-01', { zoneId: 'ROOM-PREP-01', cleanlinessGrade: 'Grade C' }),

    // Production Filling Suite (Grade B)
    makeEdge('LANE-FILL-ENTRY', 'N-AIRLOCK-E', 'N-FILL-W', { zoneId: 'ROOM-FILL-01', cleanlinessGrade: 'Grade B', requiresAirlockId: 'AIRLOCK-01' }),
    makeEdge('LANE-FILL-BUF', 'N-FILL-W', 'N-BUF-FILL-01', { zoneId: 'ROOM-FILL-01', cleanlinessGrade: 'Grade B' }),
    makeEdge('LANE-FILL-MCH', 'N-BUF-FILL-01', 'N-FILLER-02', { zoneId: 'ROOM-FILL-01', cleanlinessGrade: 'Grade B' }),
    makeEdge('LANE-FILL-CAP', 'N-FILLER-02', 'N-CAPPER-02', { zoneId: 'ROOM-FILL-01', cleanlinessGrade: 'Grade B' }),
  ];

  const makeLoc = (
    id: string,
    code: string,
    name: string,
    kind: SpatialLocation['kind'],
    navNodeId: string,
    opts: Partial<SpatialLocation> = {}
  ): SpatialLocation => {
    const node = nodeMap.get(navNodeId)!;
    return {
      id,
      tenantId,
      siteId,
      worldRevision,
      code,
      name,
      kind,
      buildingId: 'BLDG-01',
      floorId: 'FL-01',
      zoneId: node.zoneId,
      cleanlinessGrade: node.cleanlinessGrade,
      navNodeId,
      pose: { x: node.x, y: node.y, z: node.z, headingRad: 0 },
      capacity: 2,
      aliases: [code, id],
      ...opts,
    };
  };

  const locations: SpatialLocation[] = [
    makeLoc('LOC-DOCK-IN-01', 'DOCK-IN-01', 'Inbound Receiving Dock 01', 'dock_in', 'N-DOCK-IN', { capacity: 4, aliases: ['DOCK-IN-01', 'RECEIVING'] }),
    makeLoc('LOC-DOCK-OUT-01', 'DOCK-OUT-01', 'Outbound Shipping Dock 01', 'dock_out', 'N-DOCK-OUT', { capacity: 4, aliases: ['DOCK-OUT-01', 'SHIPPING'] }),
    makeLoc('LOC-PARK-01', 'PARK-01', 'AGV Home Parking Bay', 'parking', 'N-PARK-01', { capacity: 3 }),
    makeLoc('LOC-BIN-A1-01', 'BIN-A1-01', 'Rack A1 Tier 1 Bin 01', 'bin', 'N-BIN-A1-01', { rackId: 'RACK-A1', capacity: 2 }),
    makeLoc('LOC-BIN-A1-02', 'BIN-A1-02', 'Rack A1 Tier 1 Bin 02', 'bin', 'N-BIN-A1-02', { rackId: 'RACK-A1', capacity: 2 }),
    makeLoc('LOC-BIN-A2-01', 'BIN-A2-01', 'Rack A2 High-Velocity Bin', 'bin', 'N-BIN-A2-01', { rackId: 'RACK-A2', capacity: 2 }),
    makeLoc('LOC-BIN-B1-01', 'BIN-B1-01', 'QA Quarantine Bin B1-01', 'bin', 'N-BIN-B1-01', { rackId: 'RACK-B1', capacity: 2 }),
    makeLoc('LOC-BIN-B1-02', 'BIN-B1-02', 'Rack B1 Bulk Bin 02', 'bin', 'N-BIN-B1-02', { rackId: 'RACK-B1', capacity: 2 }),
    makeLoc('LOC-STAGE-OUT-01', 'STAGE-OUT-01', 'Outbound Staging Bay 01', 'staging', 'N-STAGE-OUT', { capacity: 4 }),
    makeLoc('LOC-AIRLOCK-01', 'AIRLOCK-01', 'GMP Material Airlock 01', 'airlock', 'N-AIRLOCK-C', { roomId: 'AIRLOCK-ZONE', capacity: 1 }),
    makeLoc('LOC-BUF-IN-01', 'BUF-IN-01', 'Granulation Line Input Buffer', 'buffer', 'N-BUF-IN-01', { roomId: 'ROOM-PREP-01', capacity: 2 }),
    makeLoc('LOC-MCH-MIXER-01', 'MCH-MIXER-01', 'High-Shear Mixer 01', 'workstation', 'N-MIXER-01', { roomId: 'ROOM-PREP-01', capacity: 1 }),
    makeLoc('LOC-MCH-COATER-01', 'MCH-COATER-01', 'Fluid-Bed Coater 01', 'workstation', 'N-COATER-01', { roomId: 'ROOM-PREP-01', capacity: 1 }),
    makeLoc('LOC-BUF-FILL-01', 'BUF-FILL-01', 'Aseptic Filling Input Buffer', 'buffer', 'N-BUF-FILL-01', { roomId: 'ROOM-FILL-01', capacity: 2 }),
    makeLoc('LOC-MCH-FILLER-02', 'MCH-FILLER-02', 'Vial Filler 02', 'workstation', 'N-FILLER-02', { roomId: 'ROOM-FILL-01', capacity: 1 }),
    makeLoc('LOC-MCH-CAPPER-02', 'MCH-CAPPER-02', 'Sterile Capper 02', 'workstation', 'N-CAPPER-02', { roomId: 'ROOM-FILL-01', capacity: 1 }),
  ];

  return {
    tenantId,
    siteId,
    siteName: 'Tehran BioPharma Campus — Plant 01',
    worldRevision,
    zones,
    locations,
    navNodes,
    navEdges,
  };
}

export function createSeedVehicles(
  tenantId = DEFAULT_TENANT_ID,
  siteId = DEFAULT_SITE_ID
): VehicleProfile[] {
  const now = Date.now();
  return [
    {
      id: 'VEH-AMR-01',
      tenantId,
      siteId,
      name: 'Kestrel AMR-01 (Cleanroom)',
      type: 'AMR',
      dimensions: { lengthM: 1.15, widthM: 0.85, heightM: 1.2 },
      maxSpeedMps: 1.8,
      turnRadiusM: 0.6,
      maxPayloadKg: 600,
      maxSlopeDeg: 6,
      allowedZones: ['WH-MAIN', 'WH-QUARANTINE', 'AIRLOCK-ZONE', 'ROOM-PREP-01', 'ROOM-FILL-01'],
      allowedCleanlinessGrades: ['Warehouse', 'Grade D', 'Grade C', 'Grade B'],
      batteryPct: 88,
      status: 'idle',
      pose: { x: -21, y: 0, z: 0, headingRad: 0 },
      velocityMps: 0,
      lastTelemetryMs: now,
      telemetrySequence: 100,
      staleThresholdMs: 5000,
      isStale: false,
      driftMeters: 0,
      eStopActive: false,
      activeMissionId: null,
      queuedMissionIds: [],
      attachment: null,
    },
    {
      id: 'VEH-AGV-02',
      tenantId,
      siteId,
      name: 'Titan AGV-02 (Pallet Carrier)',
      type: 'AGV',
      dimensions: { lengthM: 1.55, widthM: 1.12, heightM: 1.75 },
      maxSpeedMps: 1.5,
      turnRadiusM: 1.0,
      maxPayloadKg: 1400,
      maxSlopeDeg: 4,
      allowedZones: ['WH-MAIN', 'WH-QUARANTINE', 'AIRLOCK-ZONE', 'ROOM-PREP-01'],
      allowedCleanlinessGrades: ['Warehouse', 'Grade D', 'Grade C'],
      batteryPct: 76,
      status: 'idle',
      pose: { x: -16, y: 0, z: 0, headingRad: 0 },
      velocityMps: 0,
      lastTelemetryMs: now,
      telemetrySequence: 200,
      staleThresholdMs: 5000,
      isStale: false,
      driftMeters: 0,
      eStopActive: false,
      activeMissionId: null,
      queuedMissionIds: [],
      attachment: null,
    },
    {
      id: 'VEH-FLT-03',
      tenantId,
      siteId,
      name: 'Atlas Forklift-03 (Heavy Rack)',
      type: 'Forklift',
      dimensions: { lengthM: 2.1, widthM: 1.3, heightM: 2.4 },
      maxSpeedMps: 2.1,
      turnRadiusM: 1.4,
      maxPayloadKg: 2500,
      maxSlopeDeg: 3,
      allowedZones: ['WH-MAIN', 'WH-QUARANTINE'],
      allowedCleanlinessGrades: ['Warehouse'],
      batteryPct: 64,
      status: 'idle',
      pose: { x: -22, y: 0, z: -10, headingRad: Math.PI / 2 },
      velocityMps: 0,
      lastTelemetryMs: now,
      telemetrySequence: 300,
      staleThresholdMs: 5000,
      isStale: false,
      driftMeters: 0,
      eStopActive: false,
      activeMissionId: null,
      queuedMissionIds: [],
      attachment: null,
    },
  ];
}

export function createSeedPallets(): Gs1Pallet[] {
  return [
    {
      id: 'PLT-1001',
      sscc: '003626123400001001',
      label: 'API Cefazolin Drum Pallet',
      locationId: 'LOC-BIN-A1-01',
      binCode: 'BIN-A1-01',
      qaStatus: 'released',
      weightKg: 340,
      inTransitVehicleId: null,
      cartons: [
        {
          id: 'CTN-1001-A',
          sscc: '003626123400010011',
          gtin: '06261234500014',
          lot: 'LOT-API-2601',
          items: [
            {
              id: 'ITM-8801',
              gtin: '06261234500014',
              sku: 'RM-CEFA-API',
              description: 'Cefazolin Sodium Sterile API (25kg Drum)',
              lot: 'LOT-API-2601',
              serial: 'SN-8801',
              quantity: 8,
              uom: 'KG',
              expiryIso: '2028-06-30T00:00:00Z',
            },
            {
              id: 'ITM-8802',
              gtin: '06261234500014',
              sku: 'RM-CEFA-API',
              description: 'Cefazolin Sodium Sterile API (25kg Drum)',
              lot: 'LOT-API-2601',
              serial: 'SN-8802',
              quantity: 8,
              uom: 'KG',
              expiryIso: '2028-06-30T00:00:00Z',
            },
          ],
        },
      ],
    },
    {
      id: 'PLT-1002',
      sscc: '003626123400001002',
      label: 'Mannitol Excipient Lot 2604',
      locationId: 'LOC-BIN-A1-02',
      binCode: 'BIN-A1-02',
      qaStatus: 'released',
      weightKg: 420,
      inTransitVehicleId: null,
      cartons: [
        {
          id: 'CTN-1002-A',
          sscc: '003626123400010021',
          gtin: '06261234500021',
          lot: 'LOT-EXC-2604',
          items: [
            {
              id: 'ITM-8803',
              gtin: '06261234500021',
              sku: 'RM-MANN-EXC',
              description: 'D-Mannitol Pearlitol Pharma Grade',
              lot: 'LOT-EXC-2604',
              serial: 'SN-8803',
              quantity: 20,
              uom: 'KG',
              expiryIso: '2028-11-15T00:00:00Z',
            },
          ],
        },
      ],
    },
    {
      id: 'PLT-1003',
      sscc: '003626123400001003',
      label: 'Type-I Glass Vials (QA Quarantine)',
      locationId: 'LOC-BIN-B1-01',
      binCode: 'BIN-B1-01',
      qaStatus: 'quarantine',
      weightKg: 280,
      inTransitVehicleId: null,
      cartons: [
        {
          id: 'CTN-1003-A',
          sscc: '003626123400010031',
          gtin: '06261234500038',
          lot: 'LOT-PKG-2609',
          items: [
            {
              id: 'ITM-8804',
              gtin: '06261234500038',
              sku: 'PK-VIAL-10ML',
              description: '10mL Borosilicate Type-I Sterile Vials',
              lot: 'LOT-PKG-2609',
              serial: 'SN-8804',
              quantity: 1200,
              uom: 'EA',
              expiryIso: '2030-01-01T00:00:00Z',
            },
          ],
        },
      ],
    },
    {
      id: 'PLT-1004',
      sscc: '003626123400001004',
      label: 'Finished Goods Batch 2611-A',
      locationId: 'LOC-STAGE-OUT-01',
      binCode: 'STAGE-OUT-01',
      qaStatus: 'released',
      weightKg: 390,
      inTransitVehicleId: null,
      cartons: [
        {
          id: 'CTN-1004-A',
          sscc: '003626123400010041',
          gtin: '06261234500090',
          lot: 'BATCH-2611-A',
          items: [
            {
              id: 'ITM-8805',
              gtin: '06261234500090',
              sku: 'FG-CEFA-1G',
              description: 'Cefazolin 1g IV Injection Pack',
              lot: 'BATCH-2611-A',
              serial: 'SN-8805',
              quantity: 480,
              uom: 'BOX',
              expiryIso: '2028-11-20T00:00:00Z',
            },
          ],
        },
      ],
    },
  ];
}

export function createSeedWarehouseFlows(): WarehouseFlowRecord[] {
  const now = new Date().toISOString();
  return [
    {
      id: 'FLOW-IN-01',
      kind: 'inbound_putaway',
      palletId: 'PLT-1001',
      sscc: '003626123400001001',
      fromLocationId: 'LOC-DOCK-IN-01',
      toLocationId: 'LOC-BIN-A1-01',
      status: 'completed',
      updatedAtIso: now,
    },
    {
      id: 'FLOW-IN-02',
      kind: 'inbound_receiving',
      palletId: 'PLT-1003',
      sscc: '003626123400001003',
      fromLocationId: 'LOC-DOCK-IN-01',
      toLocationId: 'LOC-BIN-B1-01',
      status: 'blocked_qa',
      updatedAtIso: now,
    },
    {
      id: 'FLOW-OUT-01',
      kind: 'outbound_staging',
      palletId: 'PLT-1004',
      sscc: '003626123400001004',
      fromLocationId: 'LOC-BIN-A2-01',
      toLocationId: 'LOC-STAGE-OUT-01',
      status: 'in_progress',
      updatedAtIso: now,
    },
  ];
}

export function createSeedHeatmaps(): HeatmapCell[] {
  return [
    { id: 'HM-01', x: -16, z: 0, width: 5, depth: 3.5, zoneId: 'WH-MAIN', congestionScore: 0.72, travelIntensity: 0.85, traversalCount: 142 },
    { id: 'HM-02', x: -9, z: 0, width: 6, depth: 3.5, zoneId: 'WH-MAIN', congestionScore: 0.88, travelIntensity: 0.94, traversalCount: 189 },
    { id: 'HM-03', x: -2, z: 0, width: 5, depth: 3.5, zoneId: 'WH-MAIN', congestionScore: 0.65, travelIntensity: 0.78, traversalCount: 121 },
    { id: 'HM-04', x: 5, z: 0, width: 4.5, depth: 3.5, zoneId: 'AIRLOCK-ZONE', congestionScore: 0.81, travelIntensity: 0.69, traversalCount: 74 },
    { id: 'HM-05', x: -14, z: -8, width: 5, depth: 3.5, zoneId: 'WH-MAIN', congestionScore: 0.28, travelIntensity: 0.44, traversalCount: 52 },
    { id: 'HM-06', x: -8, z: 8, width: 5, depth: 3.5, zoneId: 'WH-MAIN', congestionScore: 0.19, travelIntensity: 0.31, traversalCount: 38 },
  ];
}

export function createSeedSlottingOpportunities(): SlottingOpportunity[] {
  return [
    {
      id: 'SLOT-01',
      severity: 'high',
      kind: 'slotting',
      title: 'Relocate fast-moving API (PLT-1001) closer to Airlock',
      rationale: 'BIN-A1-01 requires traversing congested central spine HM-02; moving to BIN-A2-01 cuts deadhead travel.',
      sourceBinCode: 'BIN-A1-01',
      targetBinCode: 'BIN-A2-01',
      estimatedTravelReductionPct: 34,
    },
    {
      id: 'SLOT-02',
      severity: 'medium',
      kind: 'replenishment',
      title: 'Replenish Granulation Input Buffer BUF-IN-01',
      rationale: 'Work order WO-2026-409 requires 16kg Cefazolin API; BIN-A1-02 Mannitol stock also nearing reorder threshold.',
      sourceBinCode: 'BIN-A1-02',
      targetBinCode: 'BUF-IN-01',
      estimatedTravelReductionPct: 18,
    },
  ];
}

export function createSeedProductionAssets(world: WorldModel): ProductionAsset[] {
  const locMap = new Map(world.locations.map((l) => [l.id, l]));
  const poseOf = (locId: string) => locMap.get(locId)?.pose ?? { x: 15, y: 0, z: 0, headingRad: 0 };

  return [
    {
      id: 'AIRLOCK-01',
      code: 'AIRLOCK-01',
      name: 'GMP Material Airlock 01',
      kind: 'airlock',
      locationId: 'LOC-AIRLOCK-01',
      roomId: 'AIRLOCK-ZONE',
      cleanlinessGrade: 'Grade C',
      calibrationStatus: 'calibrated',
      calibrationDueIso: '2027-02-01T00:00:00Z',
      machineState: 'run',
      oee: { availability: 0.99, performance: 0.97, quality: 1.0, overall: 0.96 },
      pose: poseOf('LOC-AIRLOCK-01'),
    },
    {
      id: 'LINE-GRAN-01',
      code: 'LINE-GRAN-01',
      name: 'Granulation & Prep Line 01',
      kind: 'line',
      locationId: 'LOC-BUF-IN-01',
      roomId: 'ROOM-PREP-01',
      lineId: 'LINE-GRAN-01',
      cleanlinessGrade: 'Grade C',
      calibrationStatus: 'calibrated',
      calibrationDueIso: '2027-01-15T00:00:00Z',
      machineState: 'run',
      oee: { availability: 0.91, performance: 0.89, quality: 0.98, overall: 0.79 },
      currentBatchId: 'BATCH-2611-A',
      pose: { x: 17.5, y: 0, z: -8, headingRad: 0 },
    },
    {
      id: 'BUF-IN-01',
      code: 'BUF-IN-01',
      name: 'Prep Input Buffer',
      kind: 'buffer',
      locationId: 'LOC-BUF-IN-01',
      roomId: 'ROOM-PREP-01',
      lineId: 'LINE-GRAN-01',
      cleanlinessGrade: 'Grade C',
      calibrationStatus: 'calibrated',
      calibrationDueIso: '2027-01-15T00:00:00Z',
      machineState: 'run',
      oee: { availability: 0.98, performance: 0.95, quality: 1.0, overall: 0.93 },
      currentBatchId: 'BATCH-2611-A',
      pose: poseOf('LOC-BUF-IN-01'),
    },
    {
      id: 'MCH-MIXER-01',
      code: 'MCH-MIXER-01',
      name: 'High-Shear Mixer 01',
      kind: 'machine',
      locationId: 'LOC-MCH-MIXER-01',
      roomId: 'ROOM-PREP-01',
      lineId: 'LINE-GRAN-01',
      cleanlinessGrade: 'Grade C',
      calibrationStatus: 'calibrated',
      calibrationDueIso: '2027-03-10T00:00:00Z',
      machineState: 'run',
      oee: { availability: 0.94, performance: 0.91, quality: 0.99, overall: 0.85 },
      currentBatchId: 'BATCH-2611-A',
      pose: poseOf('LOC-MCH-MIXER-01'),
    },
    {
      id: 'MCH-COATER-01',
      code: 'MCH-COATER-01',
      name: 'Fluid-Bed Coater 01',
      kind: 'machine',
      locationId: 'LOC-MCH-COATER-01',
      roomId: 'ROOM-PREP-01',
      lineId: 'LINE-GRAN-01',
      cleanlinessGrade: 'Grade C',
      calibrationStatus: 'due_soon',
      calibrationDueIso: '2026-11-28T00:00:00Z',
      machineState: 'idle',
      oee: { availability: 0.86, performance: 0.82, quality: 0.97, overall: 0.68 },
      currentBatchId: 'BATCH-2611-A',
      pose: poseOf('LOC-MCH-COATER-01'),
    },
    {
      id: 'LINE-FILL-02',
      code: 'LINE-FILL-02',
      name: 'Aseptic Vial Filling Line 02',
      kind: 'line',
      locationId: 'LOC-BUF-FILL-01',
      roomId: 'ROOM-FILL-01',
      lineId: 'LINE-FILL-02',
      cleanlinessGrade: 'Grade B',
      calibrationStatus: 'calibrated',
      calibrationDueIso: '2027-04-01T00:00:00Z',
      machineState: 'maintenance',
      oee: { availability: 0.62, performance: 0.88, quality: 0.99, overall: 0.54 },
      pose: { x: 17.5, y: 0, z: 8, headingRad: 0 },
    },
    {
      id: 'BUF-FILL-01',
      code: 'BUF-FILL-01',
      name: 'Aseptic Line Buffer',
      kind: 'buffer',
      locationId: 'LOC-BUF-FILL-01',
      roomId: 'ROOM-FILL-01',
      lineId: 'LINE-FILL-02',
      cleanlinessGrade: 'Grade B',
      calibrationStatus: 'calibrated',
      calibrationDueIso: '2027-04-01T00:00:00Z',
      machineState: 'idle',
      oee: { availability: 0.95, performance: 0.92, quality: 1.0, overall: 0.87 },
      pose: poseOf('LOC-BUF-FILL-01'),
    },
    {
      id: 'MCH-FILLER-02',
      code: 'MCH-FILLER-02',
      name: 'Sterile Vial Filler 02',
      kind: 'machine',
      locationId: 'LOC-MCH-FILLER-02',
      roomId: 'ROOM-FILL-01',
      lineId: 'LINE-FILL-02',
      cleanlinessGrade: 'Grade B',
      calibrationStatus: 'expired',
      calibrationDueIso: '2026-11-18T00:00:00Z',
      machineState: 'maintenance',
      oee: { availability: 0.52, performance: 0.85, quality: 0.99, overall: 0.44 },
      pose: poseOf('LOC-MCH-FILLER-02'),
    },
    {
      id: 'MCH-CAPPER-02',
      code: 'MCH-CAPPER-02',
      name: 'Vial Capper & Crimper 02',
      kind: 'machine',
      locationId: 'LOC-MCH-CAPPER-02',
      roomId: 'ROOM-FILL-01',
      lineId: 'LINE-FILL-02',
      cleanlinessGrade: 'Grade B',
      calibrationStatus: 'calibrated',
      calibrationDueIso: '2027-05-12T00:00:00Z',
      machineState: 'down',
      oee: { availability: 0.71, performance: 0.89, quality: 0.96, overall: 0.61 },
      pose: poseOf('LOC-MCH-CAPPER-02'),
    },
  ];
}

export function createSeedBomDemands(): BomDemand[] {
  return [
    {
      id: 'BOM-01',
      workOrderId: 'WO-2026-409',
      productSku: 'FG-CEFA-1G',
      productName: 'Cefazolin 1g IV Powder',
      targetLineId: 'LINE-GRAN-01',
      targetBufferLocationId: 'LOC-BUF-IN-01',
      requiredGtin: '06261234500014',
      requiredLot: 'LOT-API-2601',
      quantity: 16,
      uom: 'KG',
      sourceBinLocationId: 'LOC-BIN-A1-01',
      linkedMissionId: null,
      handoffState: 'pending',
    },
    {
      id: 'BOM-02',
      workOrderId: 'WO-2026-412',
      productSku: 'FG-CEFA-1G',
      productName: 'Cefazolin Excipient Blend',
      targetLineId: 'LINE-GRAN-01',
      targetBufferLocationId: 'LOC-BUF-IN-01',
      requiredGtin: '06261234500021',
      requiredLot: 'LOT-EXC-2604',
      quantity: 20,
      uom: 'KG',
      sourceBinLocationId: 'LOC-BIN-A1-02',
      linkedMissionId: null,
      handoffState: 'pending',
    },
  ];
}

export function createSeedBatches(): BatchGenealogy[] {
  return [
    {
      batchId: 'BATCH-2611-A',
      productName: 'Cefazolin 1g IV Injection Pack',
      productSku: 'FG-CEFA-1G',
      status: 'in_process',
      inputLots: [
        {
          gtin: '06261234500014',
          lot: 'LOT-API-2601',
          materialName: 'Cefazolin Sodium Sterile API',
          sourcePalletId: 'PLT-1001',
          quantity: 16,
          uom: 'KG',
        },
        {
          gtin: '06261234500021',
          lot: 'LOT-EXC-2604',
          materialName: 'D-Mannitol Pharma Grade',
          sourcePalletId: 'PLT-1002',
          quantity: 20,
          uom: 'KG',
        },
      ],
      spatialJourney: [
        {
          stepOrder: 1,
          locationId: 'LOC-BIN-A1-01',
          locationCode: 'BIN-A1-01',
          assetId: 'RACK-A1',
          assetName: 'Warehouse Rack A1',
          cleanlinessGrade: 'Warehouse',
          enteredAtIso: '2026-11-20T05:10:00Z',
          exitedAtIso: '2026-11-20T05:45:00Z',
          status: 'completed',
        },
        {
          stepOrder: 2,
          locationId: 'LOC-AIRLOCK-01',
          locationCode: 'AIRLOCK-01',
          assetId: 'AIRLOCK-01',
          assetName: 'GMP Material Airlock 01',
          cleanlinessGrade: 'Grade C',
          enteredAtIso: '2026-11-20T05:48:00Z',
          exitedAtIso: '2026-11-20T06:02:00Z',
          status: 'completed',
        },
        {
          stepOrder: 3,
          locationId: 'LOC-BUF-IN-01',
          locationCode: 'BUF-IN-01',
          assetId: 'BUF-IN-01',
          assetName: 'Prep Input Buffer',
          cleanlinessGrade: 'Grade C',
          enteredAtIso: '2026-11-20T06:05:00Z',
          exitedAtIso: '2026-11-20T06:20:00Z',
          status: 'completed',
        },
        {
          stepOrder: 4,
          locationId: 'LOC-MCH-MIXER-01',
          locationCode: 'MCH-MIXER-01',
          assetId: 'MCH-MIXER-01',
          assetName: 'High-Shear Mixer 01',
          cleanlinessGrade: 'Grade C',
          enteredAtIso: '2026-11-20T06:22:00Z',
          status: 'active',
        },
        {
          stepOrder: 5,
          locationId: 'LOC-MCH-COATER-01',
          locationCode: 'MCH-COATER-01',
          assetId: 'MCH-COATER-01',
          assetName: 'Fluid-Bed Coater 01',
          cleanlinessGrade: 'Grade C',
          enteredAtIso: '2026-11-20T08:00:00Z',
          status: 'pending',
        },
      ],
    },
  ];
}

export function createSeedGmpRules(): GmpTransferRule[] {
  return [
    {
      id: 'GMP-RULE-WH-C',
      fromGrade: 'Warehouse',
      toGrade: 'Grade C',
      requiredAirlockId: 'AIRLOCK-01',
      requiresQaRelease: true,
      personnelFlowRule: 'Dual-stage gowning interlock required before Grade C entry.',
      materialFlowRule: 'Outer wrap sanitization + airlock pressure cascade (+15 Pa) mandatory.',
    },
    {
      id: 'GMP-RULE-WH-B',
      fromGrade: 'Warehouse',
      toGrade: 'Grade B',
      requiredAirlockId: 'AIRLOCK-01',
      requiresQaRelease: true,
      personnelFlowRule: 'Sterile cleanroom suit + air shower interlock mandatory.',
      materialFlowRule: 'VHP decontamination cycle in AIRLOCK-01 required for Grade B material.',
    },
    {
      id: 'GMP-RULE-C-B',
      fromGrade: 'Grade C',
      toGrade: 'Grade B',
      requiredAirlockId: 'AIRLOCK-01',
      requiresQaRelease: true,
      personnelFlowRule: 'Step-up gowning required between Grade C and Grade B.',
      materialFlowRule: 'Pass-through airlock verification required.',
    },
  ];
}

export function createSeedMaintenanceWindows(): MaintenanceWindow[] {
  return [
    {
      id: 'PM-FILLER-02',
      assetId: 'MCH-FILLER-02',
      assetCode: 'MCH-FILLER-02',
      locationId: 'LOC-MCH-FILLER-02',
      type: 'PM',
      title: 'Sterile Filler 02 — HEPA Integrity & Calibration PM',
      startIso: '2026-11-20T06:00:00Z',
      endIso: '2026-11-20T14:00:00Z',
      active: true,
      blocksDispatch: true,
    },
    {
      id: 'CAL-COATER-01',
      assetId: 'MCH-COATER-01',
      assetCode: 'MCH-COATER-01',
      locationId: 'LOC-MCH-COATER-01',
      type: 'calibration',
      title: 'Fluid-Bed Coater Differential Pressure Calibration',
      startIso: '2026-11-21T09:00:00Z',
      endIso: '2026-11-21T11:30:00Z',
      active: false,
      blocksDispatch: false,
    },
  ];
}

export function createSeedObjectTasks(
  tenantId = DEFAULT_TENANT_ID,
  siteId = DEFAULT_SITE_ID
): ObjectTask[] {
  const now = new Date().toISOString();
  return [
    {
      id: 'TSK-101',
      tenantId,
      siteId,
      targetKind: 'asset',
      targetId: 'AIRLOCK-01',
      title: 'Verify VHP +15 Pa cascade & HEPA integrity',
      titleFa: 'تأیید اختلاف فشار +۱۵ پاسکال و تست HEPA هوابند',
      category: 'inspection',
      priority: 'high',
      status: 'in_progress',
      notes: 'Required prior to Grade B aseptic material transfer.',
      createdBy: 'QA-01',
      createdAtIso: now,
      updatedAtIso: now,
    },
    {
      id: 'TSK-102',
      tenantId,
      siteId,
      targetKind: 'location',
      targetId: 'LOC-BIN-B1-01',
      title: 'Pull composite QA sample for quarantined vials',
      titleFa: 'نمونه‌برداری کنترل کیفیت از ویال‌های قرنطینه ب۱-۰۱',
      category: 'qa_sampling',
      priority: 'critical',
      status: 'pending',
      notes: 'Pallet PLT-1003 awaiting microbiological clearance.',
      createdBy: 'QA-01',
      createdAtIso: now,
      updatedAtIso: now,
    },
    {
      id: 'TSK-103',
      tenantId,
      siteId,
      targetKind: 'vehicle',
      targetId: 'VEH-AMR-01',
      title: 'Cleanroom IPA wipe-down & LiDAR lens check',
      titleFa: 'ضدعفونی اتاق تمیز و بازبینی لنز LiDAR ربات',
      category: 'sanitation',
      priority: 'medium',
      status: 'pending',
      createdBy: 'OP-01',
      createdAtIso: now,
      updatedAtIso: now,
    },
    {
      id: 'TSK-104',
      tenantId,
      siteId,
      targetKind: 'location',
      targetId: 'LOC-DOCK-IN-01',
      title: 'Verify incoming GS1 SSCC manifest & seal check',
      titleFa: 'تطبیق بارکد GS1 و بررسی پلمب محموله ورودی',
      category: 'cycle_count',
      priority: 'high',
      status: 'in_progress',
      createdBy: 'DISP-01',
      createdAtIso: now,
      updatedAtIso: now,
    },
    {
      id: 'TSK-105',
      tenantId,
      siteId,
      targetKind: 'asset',
      targetId: 'MCH-MIXER-01',
      title: 'In-process blend uniformity sample (Batch 2611-A)',
      titleFa: 'نمونه‌گیری یکنواختی مخلوط حین تولید (بچ ۲۶۱۱-الف)',
      category: 'qa_sampling',
      priority: 'high',
      status: 'pending',
      createdBy: 'OP-01',
      createdAtIso: now,
      updatedAtIso: now,
    },
  ];
}
