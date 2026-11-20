import crypto from 'node:crypto';
import type { NavEdge } from '../shared/p1-contracts.ts';
import { TwinDomainError } from '../shared/p2-contracts.ts';
import type {
  DeadlockResolutionRecord,
  EdgeReservation,
  PlannedRoute,
  TwinOpsConfig,
} from '../shared/p2-contracts.ts';
import { createDefaultTwinOpsConfig } from './control-plane.ts';

const SAFETY_BUFFER_MS = 350;
const MAX_WAIT_OFFSET_MS = 18_000;

export class TrafficManager {
  private reservations: EdgeReservation[] = [];
  private deadlockHistory: DeadlockResolutionRecord[] = [];

  public getReservations(): EdgeReservation[] {
    const now = Date.now();
    this.reservations = this.reservations.filter((r) => r.endMs > now - 10_000);
    return [...this.reservations];
  }

  public getDeadlockHistory(): DeadlockResolutionRecord[] {
    return [...this.deadlockHistory];
  }

  public releaseMissionReservations(missionId: string): void {
    this.reservations = this.reservations.filter((r) => r.missionId !== missionId);
  }

  public releaseReservationById(reservationId: string): EdgeReservation {
    const idx = this.reservations.findIndex((r) => r.reservationId === reservationId);
    if (idx === -1) {
      throw new TwinDomainError(
        'RESOURCE_NOT_FOUND',
        `Reservation ${reservationId} not found`,
        404
      );
    }
    const [removed] = this.reservations.splice(idx, 1);
    return removed;
  }

  /**
   * Reserves time windows for every segment of a planned route using TwinOpsConfig.traffic.
   */
  public reserveRoute(params: {
    missionId: string;
    vehicleId: string;
    priority: number;
    route: PlannedRoute;
    edgesById: Map<string, NavEdge>;
    trafficConfig?: TwinOpsConfig['traffic'];
    autoDeadlockResolve?: boolean;
    startTimeMs?: number;
  }): {
    reservations: EdgeReservation[];
    resolutions: DeadlockResolutionRecord[];
    conflictingEdgeIds: Set<string>;
    policyActionRequired?: 'pause_all_and_alert' | 'fail_mission';
    involvedVehicles?: string[];
  } {
    const cfg = params.trafficConfig ?? createDefaultTwinOpsConfig().traffic;

    if (!cfg.edgeReservationEnabled) {
      return {
        reservations: [],
        resolutions: [],
        conflictingEdgeIds: new Set<string>(),
      };
    }

    const baseStart = params.startTimeMs ?? Date.now();
    const horizonLimitMs = baseStart + cfg.reservationHorizonSec * 1000;
    const pending: EdgeReservation[] = [];
    const resolutions: DeadlockResolutionRecord[] = [];
    const conflictingEdgeIds = new Set<string>();

    let cursorMs = baseStart;

    for (const seg of params.route.segments) {
      if (cursorMs > horizonLimitMs) {
        break;
      }

      const edge = params.edgesById.get(seg.edgeId);
      const capacity = edge?.capacity ?? cfg.edgeCapacityDefault;
      const durationMs = Math.max(800, Math.round(seg.estimatedDurationSec * 1000));

      let segStart = cursorMs;
      let segEnd = segStart + durationMs;

      const overlapping = this.reservations.filter(
        (r) =>
          r.edgeId === seg.edgeId &&
          r.vehicleId !== params.vehicleId &&
          r.endMs + SAFETY_BUFFER_MS > segStart &&
          r.startMs - SAFETY_BUFFER_MS < segEnd
      );

      if (overlapping.length >= capacity) {
        const oppositeOrSame = overlapping[0];
        const latestEnd = Math.max(...overlapping.map((o) => o.endMs));
        const waitMs = latestEnd + SAFETY_BUFFER_MS - segStart;

        if (params.autoDeadlockResolve === false) {
          throw new TwinDomainError(
            'RESERVATION_CONFLICT',
            `Reservation conflict on ${seg.edgeId} while autoDeadlockResolve is disabled`,
            409,
            { edgeId: seg.edgeId, conflictingVehicleId: oppositeOrSame.vehicleId }
          );
        }

        if (cfg.deadlockResolvePolicy === 'pause_all_and_alert') {
          const rec: DeadlockResolutionRecord = {
            resolutionId: `dlr_${crypto.randomUUID().slice(0, 8)}`,
            policy: 'wait',
            involvedVehicles: [params.vehicleId, oppositeOrSame.vehicleId],
            contestedEdgeId: seg.edgeId,
            winnerVehicleId: oppositeOrSame.vehicleId,
            yieldVehicleId: params.vehicleId,
            waitMs,
            reason: `Contention on ${seg.edgeId} triggered 'pause_all_and_alert' deadlock policy.`,
            timestampIso: new Date().toISOString(),
          };
          this.deadlockHistory.unshift(rec);
          return {
            reservations: [],
            resolutions: [rec],
            conflictingEdgeIds,
            policyActionRequired: 'pause_all_and_alert',
            involvedVehicles: [params.vehicleId, oppositeOrSame.vehicleId],
          };
        }

        if (cfg.deadlockResolvePolicy === 'fail_mission') {
          const rec: DeadlockResolutionRecord = {
            resolutionId: `dlr_${crypto.randomUUID().slice(0, 8)}`,
            policy: 'replan',
            involvedVehicles: [params.vehicleId, oppositeOrSame.vehicleId],
            contestedEdgeId: seg.edgeId,
            winnerVehicleId: oppositeOrSame.vehicleId,
            yieldVehicleId: params.vehicleId,
            waitMs,
            reason: `Contention on ${seg.edgeId} triggered 'fail_mission' deadlock policy.`,
            timestampIso: new Date().toISOString(),
          };
          this.deadlockHistory.unshift(rec);
          return {
            reservations: [],
            resolutions: [rec],
            conflictingEdgeIds,
            policyActionRequired: 'fail_mission',
            involvedVehicles: [params.vehicleId, oppositeOrSame.vehicleId],
          };
        }

        if (cfg.intersectionPolicy === 'replan' || waitMs > MAX_WAIT_OFFSET_MS) {
          conflictingEdgeIds.add(seg.edgeId);
          const rec: DeadlockResolutionRecord = {
            resolutionId: `dlr_${crypto.randomUUID().slice(0, 8)}`,
            policy: 'replan',
            involvedVehicles: [params.vehicleId, oppositeOrSame.vehicleId],
            contestedEdgeId: seg.edgeId,
            winnerVehicleId: oppositeOrSame.vehicleId,
            yieldVehicleId: params.vehicleId,
            waitMs,
            reason: `Intersection policy (${cfg.intersectionPolicy}) / wait (${waitMs}ms) triggered replan around ${seg.edgeId}.`,
            timestampIso: new Date().toISOString(),
          };
          resolutions.push(rec);
          return { reservations: [], resolutions, conflictingEdgeIds };
        }

        const policyUsed: DeadlockResolutionRecord['policy'] =
          cfg.intersectionPolicy === 'yield' ? 'yield' : 'wait';

        const rec: DeadlockResolutionRecord = {
          resolutionId: `dlr_${crypto.randomUUID().slice(0, 8)}`,
          policy: policyUsed,
          involvedVehicles: [params.vehicleId, oppositeOrSame.vehicleId],
          contestedEdgeId: seg.edgeId,
          winnerVehicleId: oppositeOrSame.vehicleId,
          yieldVehicleId: params.vehicleId,
          waitMs,
          reason: `Traffic policy '${policyUsed}' on ${seg.edgeId}: ${params.vehicleId} deferred ${waitMs}ms to ${oppositeOrSame.vehicleId}.`,
          timestampIso: new Date().toISOString(),
        };
        resolutions.push(rec);
        segStart = latestEnd + SAFETY_BUFFER_MS;
        segEnd = segStart + durationMs;
      }

      pending.push({
        reservationId: `res_${crypto.randomUUID().slice(0, 10)}`,
        edgeId: seg.edgeId,
        fromNodeId: seg.fromNodeId,
        toNodeId: seg.toNodeId,
        vehicleId: params.vehicleId,
        missionId: params.missionId,
        startMs: segStart,
        endMs: segEnd,
      });

      cursorMs = segEnd;
    }

    this.reservations.push(...pending);
    if (resolutions.length > 0) {
      this.deadlockHistory.unshift(...resolutions);
      if (this.deadlockHistory.length > 100) {
        this.deadlockHistory.length = 100;
      }
    }

    return { reservations: pending, resolutions, conflictingEdgeIds };
  }

  public detectAndResolveCycle(
    waitGraph: Array<{
      vehicleId: string;
      holdingEdgeId: string;
      waitingForEdgeId: string;
      priority: number;
    }>,
    deadlockResolvePolicy: TwinOpsConfig['traffic']['deadlockResolvePolicy'] = 'replan_lowest_priority'
  ): DeadlockResolutionRecord | null {
    const holderByEdge = new Map<string, string>();
    const entryByVehicle = new Map<string, (typeof waitGraph)[number]>();

    for (const item of waitGraph) {
      holderByEdge.set(item.holdingEdgeId, item.vehicleId);
      entryByVehicle.set(item.vehicleId, item);
    }

    for (const start of waitGraph) {
      const visited = new Set<string>([start.vehicleId]);
      let curr = start;
      while (curr) {
        const nextHolder = holderByEdge.get(curr.waitingForEdgeId);
        if (!nextHolder) break;
        if (visited.has(nextHolder)) {
          const cycleEntries = Array.from(visited)
            .map((vid) => entryByVehicle.get(vid)!)
            .filter(Boolean);
          cycleEntries.sort(
            (a, b) => b.priority - a.priority || a.vehicleId.localeCompare(b.vehicleId)
          );
          const winner = cycleEntries[0];
          const yielder = cycleEntries[cycleEntries.length - 1];

          const policy: DeadlockResolutionRecord['policy'] =
            deadlockResolvePolicy === 'pause_all_and_alert' ? 'wait' : 'replan';

          const record: DeadlockResolutionRecord = {
            resolutionId: `dlr_${crypto.randomUUID().slice(0, 8)}`,
            policy,
            involvedVehicles: cycleEntries.map((c) => c.vehicleId),
            contestedEdgeId: yielder.waitingForEdgeId,
            winnerVehicleId: winner.vehicleId,
            yieldVehicleId: yielder.vehicleId,
            waitMs: 1500,
            reason: `Deadlock cycle (${cycleEntries.map((c) => c.vehicleId).join(' -> ')}) resolved via policy '${deadlockResolvePolicy}'.`,
            timestampIso: new Date().toISOString(),
          };
          this.deadlockHistory.unshift(record);
          return record;
        }
        visited.add(nextHolder);
        const nextEntry = entryByVehicle.get(nextHolder);
        if (!nextEntry) break;
        curr = nextEntry;
      }
    }

    return null;
  }

  public tryAcquireWindow(
    candidate: Omit<EdgeReservation, 'reservationId'>,
    capacity = 1
  ): EdgeReservation {
    const overlapCount = this.reservations.filter(
      (r) =>
        r.edgeId === candidate.edgeId &&
        r.vehicleId !== candidate.vehicleId &&
        r.endMs > candidate.startMs &&
        r.startMs < candidate.endMs
    ).length;

    if (overlapCount >= capacity) {
      throw new TwinDomainError(
        'RESERVATION_CONFLICT',
        `Edge ${candidate.edgeId} is already reserved during [${candidate.startMs}, ${candidate.endMs}]`,
        409,
        { edgeId: candidate.edgeId, startMs: candidate.startMs, endMs: candidate.endMs }
      );
    }

    const acquired: EdgeReservation = {
      ...candidate,
      reservationId: `res_${crypto.randomUUID().slice(0, 10)}`,
    };
    this.reservations.push(acquired);
    return acquired;
  }
}
