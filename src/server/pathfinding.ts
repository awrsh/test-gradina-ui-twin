import type { CleanlinessGrade, NavEdge, NavNode, WorldModel } from '../shared/p1-contracts.ts';
import { TwinDomainError } from '../shared/p2-contracts.ts';
import type {
  CostProfile,
  PlannedRoute,
  RouteSegment,
  TwinOpsConfig,
  VehicleProfile,
} from '../shared/p2-contracts.ts';
import { createDefaultTwinOpsConfig } from './control-plane.ts';

export interface EdgeCompatibilityResult {
  compatible: boolean;
  reasons: string[];
}

export interface WeightedRouteResult {
  route: PlannedRoute;
  expandedNodes: number;
}

const GRADE_RANK: Record<CleanlinessGrade, number> = {
  Warehouse: 0,
  'Grade D': 1,
  'Grade C': 2,
  'Grade B': 3,
  'Grade A': 4,
};

export function checkEdgeCompatibility(
  vehicle: VehicleProfile,
  edge: NavEdge,
  targetNode: NavNode,
  options?: { allowAirlock?: boolean }
): EdgeCompatibilityResult {
  const reasons: string[] = [];

  if (edge.closed) {
    reasons.push(`Edge ${edge.id} is closed (${edge.closureReason ?? 'blocked'})`);
  }
  if (vehicle.dimensions.widthM > edge.maxWidthM) {
    reasons.push(
      `Vehicle width ${vehicle.dimensions.widthM}m exceeds edge ${edge.id} maxWidth ${edge.maxWidthM}m`
    );
  }
  if (vehicle.dimensions.heightM > edge.maxHeightM) {
    reasons.push(
      `Vehicle height ${vehicle.dimensions.heightM}m exceeds edge ${edge.id} maxHeight ${edge.maxHeightM}m`
    );
  }
  if (edge.maxSlopeDeg > vehicle.maxSlopeDeg) {
    reasons.push(
      `Edge ${edge.id} slope ${edge.maxSlopeDeg}° exceeds vehicle maxSlope ${vehicle.maxSlopeDeg}°`
    );
  }
  if (
    !vehicle.allowedZones.includes('*') &&
    !vehicle.allowedZones.includes(targetNode.zoneId)
  ) {
    reasons.push(
      `Vehicle ${vehicle.id} is not authorized for zone ${targetNode.zoneId}`
    );
  }
  if (!vehicle.allowedCleanlinessGrades.includes(targetNode.cleanlinessGrade)) {
    reasons.push(
      `Vehicle ${vehicle.id} lacks cleanliness qualification for ${targetNode.cleanlinessGrade}`
    );
  }
  if (edge.requiresAirlockId && options?.allowAirlock === false) {
    reasons.push(
      `Edge ${edge.id} requires GMP airlock clearance (${edge.requiresAirlockId})`
    );
  }

  return { compatible: reasons.length === 0, reasons };
}

function computeEdgeCost(
  edge: NavEdge,
  vehicle: VehicleProfile,
  profile: CostProfile,
  costs: TwinOpsConfig['routing']['costs'],
  prevNode: NavNode | null,
  fromNode: NavNode,
  toNode: NavNode,
  congestionScore = 0
): number {
  const effectiveSpeed = Math.max(0.2, Math.min(vehicle.maxSpeedMps, edge.speedLimitMps));
  const travelSec = edge.lengthM / effectiveSpeed;

  let turnRad = 0;
  if (prevNode) {
    const h1 = Math.atan2(fromNode.z - prevNode.z, fromNode.x - prevNode.x);
    const h2 = Math.atan2(toNode.z - fromNode.z, toNode.x - fromNode.x);
    let delta = Math.abs(h2 - h1);
    if (delta > Math.PI) delta = 2 * Math.PI - delta;
    if (delta > 0.25) {
      turnRad = delta / Math.PI;
    }
  }

  const turnPenalty = turnRad * vehicle.turnRadiusM * costs.turn;
  const elevationPenalty = (edge.maxSlopeDeg > 0 ? edge.maxSlopeDeg * 0.1 : 0) * costs.elevation;
  const congestionPenalty = congestionScore * edge.lengthM * 0.25 * costs.congestion;

  if (profile === 'shortest') {
    return edge.lengthM * costs.distance;
  }
  if (profile === 'fastest') {
    const preferredDiscount = edge.preferredAisle ? 0.92 : 1.0;
    return travelSec * costs.distance * preferredDiscount + turnPenalty + congestionPenalty * 0.5;
  }
  // 'safest' profile
  const clearanceMargin = edge.maxWidthM - vehicle.dimensions.widthM;
  const clearanceFactor = clearanceMargin < 0.3 ? 1.85 : clearanceMargin < 0.6 ? 1.25 : 1.0;
  const preferredFactor = edge.preferredAisle ? 0.72 : 1.25;
  const airlockFactor = edge.requiresAirlockId ? 1.15 : 1.0;
  return (
    edge.lengthM * costs.distance * clearanceFactor * preferredFactor * airlockFactor +
    turnPenalty * 1.4 +
    elevationPenalty +
    congestionPenalty
  );
}

export function findWeightedRouteWithStats(params: {
  world: WorldModel;
  vehicle: VehicleProfile;
  startNodeId: string;
  goalNodeId: string;
  costProfile: CostProfile;
  routingConfig?: TwinOpsConfig['routing'];
  edgeCongestion?: Map<string, number>;
  avoidEdgeIds?: Set<string>;
  bypassGmpAirlockCheck?: boolean;
}): WeightedRouteResult {
  const { world, vehicle, startNodeId, goalNodeId, costProfile, avoidEdgeIds } = params;
  const routingCfg = params.routingConfig ?? createDefaultTwinOpsConfig().routing;
  const nodeMap = new Map(world.navNodes.map((n) => [n.id, n]));
  const startNode = nodeMap.get(startNodeId);
  const goalNode = nodeMap.get(goalNodeId);

  if (!startNode || !goalNode) {
    throw new TwinDomainError(
      'UNREACHABLE_ROUTE',
      `Invalid navigation node(s): start=${startNodeId}, goal=${goalNodeId}`,
      422
    );
  }

  if (startNodeId === goalNodeId) {
    return {
      expandedNodes: 0,
      route: {
        costProfile,
        nodeIds: [startNodeId],
        segments: [],
        totalDistanceM: 0,
        totalCost: 0,
        estimatedDurationSec: 0,
      },
    };
  }

  const adjacency = new Map<string, Array<{ edge: NavEdge; nextNodeId: string }>>();
  for (const node of world.navNodes) {
    adjacency.set(node.id, []);
  }
  for (const edge of world.navEdges) {
    adjacency.get(edge.fromNodeId)?.push({ edge, nextNodeId: edge.toNodeId });
    if (!edge.oneWay) {
      adjacency.get(edge.toNodeId)?.push({ edge, nextNodeId: edge.fromNodeId });
    }
  }

  const heuristic = (nodeId: string): number => {
    const n = nodeMap.get(nodeId)!;
    const dist = Math.hypot(goalNode.x - n.x, goalNode.z - n.z);
    if (costProfile === 'fastest') {
      return (dist * routingCfg.costs.distance) / Math.max(0.5, vehicle.maxSpeedMps);
    }
    if (costProfile === 'safest') {
      return dist * routingCfg.costs.distance * 0.72;
    }
    return dist * routingCfg.costs.distance;
  };

  const openSet = new Set<string>([startNodeId]);
  const cameFrom = new Map<string, { prevNodeId: string; edge: NavEdge }>();
  const gScore = new Map<string, number>([[startNodeId, 0]]);
  const fScore = new Map<string, number>([[startNodeId, heuristic(startNodeId)]]);
  const incompatibilityNotes: string[] = [];
  let expandedNodes = 0;

  while (openSet.size > 0) {
    if (expandedNodes >= routingCfg.maxExpandNodes) {
      throw new TwinDomainError(
        'UNREACHABLE_ROUTE',
        `A* search exceeded maxExpandNodes (${routingCfg.maxExpandNodes})`,
        422,
        {
          expandedNodes,
          maxExpandNodes: routingCfg.maxExpandNodes,
          allowPartialPath: routingCfg.allowPartialPath,
        }
      );
    }

    let current = '';
    let bestF = Infinity;
    for (const id of openSet) {
      const f = fScore.get(id) ?? Infinity;
      if (f < bestF) {
        bestF = f;
        current = id;
      }
    }

    expandedNodes += 1;

    if (current === goalNodeId) {
      const nodeIds: string[] = [goalNodeId];
      const segments: RouteSegment[] = [];
      let cursor = goalNodeId;
      let totalDistanceM = 0;
      let estimatedDurationSec = 0;
      let passesAirlockId: string | undefined;

      while (cameFrom.has(cursor)) {
        const step = cameFrom.get(cursor)!;
        const fromN = nodeMap.get(step.prevNodeId)!;
        const toN = nodeMap.get(cursor)!;
        const prevStep = cameFrom.get(step.prevNodeId);
        const prevN = prevStep ? nodeMap.get(prevStep.prevNodeId)! : null;
        const cong = params.edgeCongestion?.get(step.edge.id) ?? 0;

        const segCost = computeEdgeCost(
          step.edge,
          vehicle,
          costProfile,
          routingCfg.costs,
          prevN,
          fromN,
          toN,
          cong
        );
        const speed = Math.max(0.2, Math.min(vehicle.maxSpeedMps, step.edge.speedLimitMps));
        const segDur = Number((step.edge.lengthM / speed).toFixed(2));

        if (step.edge.requiresAirlockId) {
          passesAirlockId = step.edge.requiresAirlockId;
        } else if (toN.isAirlockNode && toN.airlockId) {
          passesAirlockId = toN.airlockId;
        }

        segments.unshift({
          edgeId: step.edge.id,
          fromNodeId: step.prevNodeId,
          toNodeId: cursor,
          lengthM: step.edge.lengthM,
          cost: Number(segCost.toFixed(3)),
          estimatedDurationSec: segDur,
          zoneId: step.edge.zoneId,
        });

        totalDistanceM += step.edge.lengthM;
        estimatedDurationSec += segDur;
        nodeIds.unshift(step.prevNodeId);
        cursor = step.prevNodeId;
      }

      const startRank = GRADE_RANK[startNode.cleanlinessGrade];
      const goalRank = GRADE_RANK[goalNode.cleanlinessGrade];
      if (!params.bypassGmpAirlockCheck && goalRank > startRank && !passesAirlockId) {
        throw new TwinDomainError(
          'GMP_AIRLOCK_REQUIRED',
          `Transfer from ${startNode.cleanlinessGrade} to ${goalNode.cleanlinessGrade} must pass through an approved GMP airlock`,
          422,
          { startGrade: startNode.cleanlinessGrade, goalGrade: goalNode.cleanlinessGrade }
        );
      }

      return {
        expandedNodes,
        route: {
          costProfile,
          nodeIds,
          segments,
          totalDistanceM: Number(totalDistanceM.toFixed(2)),
          totalCost: Number((gScore.get(goalNodeId) ?? 0).toFixed(3)),
          estimatedDurationSec: Number(estimatedDurationSec.toFixed(2)),
          passesAirlockId,
        },
      };
    }

    openSet.delete(current);
    const currentNode = nodeMap.get(current)!;
    const prevRecord = cameFrom.get(current);
    const prevNode = prevRecord ? nodeMap.get(prevRecord.prevNodeId)! : null;

    for (const { edge, nextNodeId } of adjacency.get(current) ?? []) {
      if (avoidEdgeIds?.has(edge.id)) {
        incompatibilityNotes.push(`Edge ${edge.id} temporarily avoided due to reservation conflict`);
        continue;
      }
      const nextNode = nodeMap.get(nextNodeId)!;
      const compat = checkEdgeCompatibility(vehicle, edge, nextNode);
      if (!compat.compatible) {
        incompatibilityNotes.push(...compat.reasons);
        continue;
      }

      const cong = params.edgeCongestion?.get(edge.id) ?? 0;
      const stepCost = computeEdgeCost(
        edge,
        vehicle,
        costProfile,
        routingCfg.costs,
        prevNode,
        currentNode,
        nextNode,
        cong
      );
      const tentativeG = (gScore.get(current) ?? Infinity) + stepCost;

      if (tentativeG < (gScore.get(nextNodeId) ?? Infinity)) {
        cameFrom.set(nextNodeId, { prevNodeId: current, edge });
        gScore.set(nextNodeId, tentativeG);
        fScore.set(nextNodeId, tentativeG + heuristic(nextNodeId));
        openSet.add(nextNodeId);
      }
    }
  }

  const uniqueReasons = Array.from(new Set(incompatibilityNotes)).slice(0, 5);
  const hasWidthHeightOrZoneIssue = uniqueReasons.some(
    (r) => r.includes('exceeds') || r.includes('authorized') || r.includes('cleanliness')
  );

  throw new TwinDomainError(
    hasWidthHeightOrZoneIssue ? 'INCOMPATIBLE_VEHICLE' : 'UNREACHABLE_ROUTE',
    `No valid route from ${startNodeId} to ${goalNodeId} for ${vehicle.id} (${costProfile})`,
    422,
    {
      vehicleId: vehicle.id,
      startNodeId,
      goalNodeId,
      costProfile,
      expandedNodes,
      reasons: uniqueReasons,
    }
  );
}

export function findWeightedRoute(
  params: Parameters<typeof findWeightedRouteWithStats>[0]
): PlannedRoute {
  return findWeightedRouteWithStats(params).route;
}
