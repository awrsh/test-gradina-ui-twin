import { useCallback, useEffect, useRef, useState } from 'react';
import { ActorPrincipal, TwinEventEnvelope } from '../shared/p1-contracts';
import {
  MachineRunState,
  ObjectEntityKind,
  ObjectTaskCategory,
  ObjectTaskPriority,
  ObjectTaskStatus,
  QaStatus,
  TwinErrorBody,
  TwinFullSnapshot,
} from '../shared/p2-contracts';

export interface CameraFocusTarget {
  x: number;
  y: number;
  z: number;
  distance?: number;
  nonce: number;
}

export interface ApiActionResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: TwinErrorBody;
}

export function useTwinClient() {
  const [snapshot, setSnapshot] = useState<TwinFullSnapshot | null>(null);
  const [events, setEvents] = useState<TwinEventEnvelope<unknown>[]>([]);
  const [actors, setActors] = useState<ActorPrincipal[]>([]);
  const [actorId, setActorId] = useState<string>('DISP-01');
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [lastError, setLastError] = useState<TwinErrorBody | null>(null);
  const [lastNotice, setLastNotice] = useState<string | null>(null);

  const actorIdRef = useRef(actorId);
  actorIdRef.current = actorId;

  const tenantId = 'tenant-gradian-pharma';
  const siteId = 'site-teh-01';

  const request = useCallback(
    async <T = unknown>(
      url: string,
      options?: RequestInit
    ): Promise<ApiActionResult<T>> => {
      try {
        const res = await fetch(url, {
          ...options,
          headers: {
            'Content-Type': 'application/json',
            'x-tenant-id': tenantId,
            'x-site-id': siteId,
            'x-actor-id': actorIdRef.current,
            ...(options?.headers || {}),
          },
        });
        const body = await res.json();
        if (!res.ok) {
          const err: TwinErrorBody = body.error || {
            code: 'VALIDATION_ERROR',
            message: 'Request failed',
            httpStatus: res.status,
          };
          setLastError(err);
          setLastNotice(null);
          return { ok: false, error: err };
        }
        setLastError(null);
        return { ok: true, data: body as T };
      } catch (e) {
        const err: TwinErrorBody = {
          code: 'VALIDATION_ERROR',
          message: e instanceof Error ? e.message : 'Network error',
          httpStatus: 0,
        };
        setLastError(err);
        return { ok: false, error: err };
      }
    },
    []
  );

  const refreshAll = useCallback(async () => {
    const [snapRes, evtRes, actRes] = await Promise.all([
      request<TwinFullSnapshot>('/api/v2/snapshot'),
      request<{ events: TwinEventEnvelope<unknown>[] }>('/api/v2/events?limit=50'),
      request<{ actors: ActorPrincipal[] }>('/api/v2/actors'),
    ]);
    if (snapRes.ok && snapRes.data) setSnapshot(snapRes.data);
    if (evtRes.ok && evtRes.data) setEvents(evtRes.data.events);
    if (actRes.ok && actRes.data) setActors(actRes.data.actors);
  }, [request]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  // Scoped WebSocket real-time event & projection stream
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: number | undefined;
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${proto}//${window.location.host}/ws?tenantId=${encodeURIComponent(
        tenantId
      )}&siteId=${encodeURIComponent(siteId)}`;

      ws = new WebSocket(wsUrl);
      ws.onopen = () => {
        if (!disposed) setWsConnected(true);
      };
      ws.onclose = () => {
        if (!disposed) {
          setWsConnected(false);
          reconnectTimer = window.setTimeout(connect, 1500);
        }
      };
      ws.onmessage = (ev) => {
        if (disposed) return;
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === 'snapshot') {
            setSnapshot(msg.data as TwinFullSnapshot);
          } else if (msg.type === 'event') {
            const envelope = msg.data as TwinEventEnvelope<unknown>;
            setEvents((prev) => {
              if (prev.some((p) => p.eventId === envelope.eventId)) return prev;
              return [envelope, ...prev].slice(0, 60);
            });
          }
        } catch {
          // Ignore malformed WS message
        }
      };
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, []);

  const submitMove = useCallback(
    async (payload: {
      idempotencyKey: string;
      originId: string;
      destinationId: string;
      vehicleId?: string;
      costProfile: 'fastest' | 'safest' | 'shortest';
      loadId?: string;
      dryRun?: boolean;
    }) => {
      const res = await request<{
        mission: TwinFullSnapshot['missions'][number];
        idempotentReplay: boolean;
        dryRun: boolean;
      }>('/api/v2/commands/move', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (res.ok && res.data) {
        if (res.data.dryRun) {
          setLastNotice(
            `Dry-run route planned: ${res.data.mission.route?.totalDistanceM}m (${res.data.mission.costProfile}) via ${res.data.mission.vehicleId}`
          );
        } else if (res.data.idempotentReplay) {
          setLastNotice(`Idempotent replay: returned existing mission ${res.data.mission.id}`);
        } else {
          setLastNotice(`Mission ${res.data.mission.id} dispatched to ${res.data.mission.vehicleId}`);
        }
        await refreshAll();
      }
      return res;
    },
    [request, refreshAll]
  );

  const toggleEdgeClosure = useCallback(
    async (edgeId: string, closed: boolean, reason?: string) => {
      const res = await request(`/api/v2/topology/edges/${edgeId}/closure`, {
        method: 'POST',
        body: JSON.stringify({ closed, reason }),
      });
      if (res.ok) {
        setLastNotice(`Lane ${edgeId} ${closed ? 'closed (dynamic reroute active)' : 'reopened'}`);
        await refreshAll();
      }
      return res;
    },
    [request, refreshAll]
  );

  const controlVehicle = useCallback(
    async (
      vehicleId: string,
      action: 'pause' | 'resume' | 'estop' | 'estop/ack' | 'stale-on' | 'stale-off',
      reason?: string
    ) => {
      const isStale = action === 'stale-on' || action === 'stale-off';
      const url = isStale
        ? `/api/v2/vehicles/${vehicleId}/stale`
        : `/api/v2/vehicles/${vehicleId}/${action}`;
      const body = isStale
        ? { stale: action === 'stale-on' }
        : { reason };
      const res = await request(url, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setLastNotice(`Vehicle ${vehicleId}: ${action} applied`);
        await refreshAll();
      }
      return res;
    },
    [request, refreshAll]
  );

  const cancelMission = useCallback(
    async (missionId: string) => {
      const res = await request(`/api/v2/missions/${missionId}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'Operator cancelled via Twin Console' }),
      });
      if (res.ok) {
        setLastNotice(`Mission ${missionId} cancelled with safe stop`);
        await refreshAll();
      }
      return res;
    },
    [request, refreshAll]
  );

  const setPalletQa = useCallback(
    async (palletId: string, qaStatus: QaStatus) => {
      const res = await request(`/api/v2/wms/pallets/${palletId}/qa`, {
        method: 'POST',
        body: JSON.stringify({ qaStatus }),
      });
      if (res.ok) {
        setLastNotice(`Pallet ${palletId} QA state updated to ${qaStatus}`);
        await refreshAll();
      }
      return res;
    },
    [request, refreshAll]
  );

  const searchWms = useCallback(
    async (query: string) => {
      return request<{
        query: string;
        matches: Array<{
          pallet: TwinFullSnapshot['wms']['pallets'][number];
          matchedOn: string;
          matchedValue: string;
          locationId: string;
          binCode: string;
          pose: { x: number; y: number; z: number };
        }>;
      }>(`/api/v2/wms/search?q=${encodeURIComponent(query)}`);
    },
    [request]
  );

  const dispatchBom = useCallback(
    async (bomId: string) => {
      const res = await request(`/api/v2/mes/bom/${bomId}/dispatch`, {
        method: 'POST',
        body: JSON.stringify({ idempotencyKey: `bom-${bomId}-${Date.now()}` }),
      });
      if (res.ok) {
        setLastNotice(`BOM ${bomId} material handoff mission dispatched`);
        await refreshAll();
      }
      return res;
    },
    [request, refreshAll]
  );

  const setMachineState = useCallback(
    async (assetId: string, machineState: MachineRunState) => {
      const res = await request(`/api/v2/mes/assets/${assetId}/state`, {
        method: 'POST',
        body: JSON.stringify({ machineState }),
      });
      if (res.ok) {
        setLastNotice(`Asset ${assetId} set to ${machineState}`);
        await refreshAll();
      }
      return res;
    },
    [request, refreshAll]
  );

  const toggleMaintenance = useCallback(
    async (windowId: string, active: boolean) => {
      const res = await request(`/api/v2/mes/maintenance/${windowId}/toggle`, {
        method: 'POST',
        body: JSON.stringify({ active }),
      });
      if (res.ok) {
        setLastNotice(`Maintenance window ${windowId} ${active ? 'activated' : 'cleared'}`);
        await refreshAll();
      }
      return res;
    },
    [request, refreshAll]
  );

  const createMaintenanceWindow = useCallback(
    async (payload: {
      assetId: string;
      type: 'PM' | 'calibration' | 'production_run';
      title: string;
      active: boolean;
      blocksDispatch: boolean;
    }) => {
      const res = await request('/api/v2/mes/maintenance', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setLastNotice(`Maintenance window created for ${payload.assetId}`);
        await refreshAll();
      }
      return res;
    },
    [request, refreshAll]
  );

  const createTask = useCallback(
    async (payload: {
      targetKind: ObjectEntityKind;
      targetId: string;
      title: string;
      titleFa?: string;
      category: ObjectTaskCategory;
      priority: ObjectTaskPriority;
      notes?: string;
      startImmediately?: boolean;
    }) => {
      const res = await request('/api/v2/tasks', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setLastNotice(`Task created for ${payload.targetId}`);
        await refreshAll();
      }
      return res;
    },
    [request, refreshAll]
  );

  const updateTaskStatus = useCallback(
    async (taskId: string, status: ObjectTaskStatus) => {
      const res = await request(`/api/v2/tasks/${taskId}/status`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setLastNotice(`Task ${taskId} updated to ${status}`);
        await refreshAll();
      }
      return res;
    },
    [request, refreshAll]
  );

  const validateGmp = useCallback(
    async (payload: {
      fromGrade: string;
      toGrade: string;
      passesAirlockId?: string;
      qaReleased: boolean;
    }) => {
      return request<{ allowed: boolean; reason?: string }>('/api/v2/mes/gmp/validate', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    [request]
  );

  const patchConfig = useCallback(
    async (patch: Record<string, unknown>, reason?: string) => {
      const res = await request('/api/v2/control-plane/config', {
        method: 'PATCH',
        body: JSON.stringify({ config: patch, reason }),
      });
      if (res.ok) {
        setLastNotice('Control Plane configuration updated');
        await refreshAll();
      }
      return res;
    },
    [request, refreshAll]
  );

  const patchFlags = useCallback(
    async (flags: Record<string, boolean>, reason?: string) => {
      const res = await request('/api/v2/control-plane/flags', {
        method: 'PATCH',
        body: JSON.stringify({ flags, reason }),
      });
      if (res.ok) {
        setLastNotice('Feature flags updated');
        await refreshAll();
      }
      return res;
    },
    [request, refreshAll]
  );

  const setActuationMode = useCallback(
    async (payload: {
      actuationMode: 'twin_only' | 'shadow' | 'physical';
      reason: string;
      confirmPhrase?: string;
      secondaryApproverId?: string;
    }) => {
      const res = await request<{ actuationMode: string }>(
        '/api/v2/control-plane/actuation-mode',
        {
          method: 'POST',
          body: JSON.stringify(payload),
        }
      );
      if (res.ok && res.data) {
        setLastNotice(`Actuation mode changed to '${res.data.actuationMode}'`);
        await refreshAll();
      }
      return res;
    },
    [request, refreshAll]
  );

  const explainMission = useCallback(
    async (missionId: string) => {
      return request<{
        explanation: NonNullable<
          TwinFullSnapshot['missions'][number]['decisionExplanation']
        >;
      }>(`/api/v2/missions/${missionId}/explain`);
    },
    [request]
  );

  const overrideMission = useCallback(
    async (
      missionId: string,
      action: 'pause' | 'resume' | 'replan' | 'reassign',
      body?: Record<string, unknown>
    ) => {
      const res = await request(`/api/v2/missions/${missionId}/${action}`, {
        method: 'POST',
        body: JSON.stringify(body || {}),
      });
      if (res.ok) {
        setLastNotice(`Mission ${missionId}: manual override '${action}' applied`);
        await refreshAll();
      }
      return res;
    },
    [request, refreshAll]
  );

  const releaseReservation = useCallback(
    async (reservationId: string, reason?: string) => {
      const res = await request(`/api/v2/traffic/reservations/${reservationId}`, {
        method: 'DELETE',
        body: JSON.stringify({ reason: reason || 'Operator manual reservation release' }),
      });
      if (res.ok) {
        setLastNotice(`Reservation ${reservationId} manually released`);
        await refreshAll();
      }
      return res;
    },
    [request, refreshAll]
  );

  const setAutopilot = useCallback(
    async (payload: { enabled?: boolean; speedMultiplier?: 1 | 2 | 4 }) => {
      const res = await request('/api/v2/simulation/autopilot', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setLastNotice(
          typeof payload.enabled === 'boolean'
            ? payload.enabled
              ? 'Autopilot autonomous factory resumed'
              : 'Autopilot autonomous factory paused'
            : `Autopilot speed set to ${payload.speedMultiplier}x`
        );
        await refreshAll();
      }
      return res;
    },
    [request, refreshAll]
  );

  const activeActor = actors.find((a) => a.actorId === actorId) ?? null;

  return {
    snapshot,
    events,
    actors,
    actorId,
    setActorId,
    activeActor,
    wsConnected,
    lastError,
    clearError: () => setLastError(null),
    lastNotice,
    clearNotice: () => setLastNotice(null),
    refreshAll,
    submitMove,
    toggleEdgeClosure,
    controlVehicle,
    cancelMission,
    setPalletQa,
    searchWms,
    dispatchBom,
    setMachineState,
    toggleMaintenance,
    createMaintenanceWindow,
    createTask,
    updateTaskStatus,
    validateGmp,
    patchConfig,
    patchFlags,
    setActuationMode,
    explainMission,
    overrideMission,
    releaseReservation,
    setAutopilot,
  };
}
