import React, { useMemo } from 'react';
import { Activity, Bot, ChevronDown, ChevronUp, Pause, Play, Truck, Warehouse } from 'lucide-react';
import { Mission, TwinFullSnapshot } from '../shared/p2-contracts';
import { useI18n } from './i18n';
import { SelectedEntityRef } from './ThreeTwinViewport';
import { ModernButton } from './ui/ModernControls';

interface Props {
  snapshot: TwinFullSnapshot;
  wsConnected: boolean;
  hasSelection: boolean;
  onFocusPose: (x: number, z: number, distance?: number) => void;
  onSelect: (sel: SelectedEntityRef) => void;
  onConfigureAutopilot: (payload: {
    enabled?: boolean;
    speedMultiplier?: 1 | 2 | 4;
  }) => Promise<unknown>;
}

export function computeMissionProgressPct(m: Mission | undefined): number {
  if (!m) return 0;
  if (m.state === 'completed') return 100;
  if (!m.route || m.route.segments.length === 0) return 0;
  const total = m.route.segments.length;
  const done = m.currentSegmentIndex + m.progressOnSegment;
  return Math.max(0, Math.min(100, Math.round((done / total) * 100)));
}

export const LiveFactoryHud: React.FC<Props> = ({
  snapshot,
  wsConnected,
  hasSelection,
  onFocusPose,
  onSelect,
  onConfigureAutopilot,
}) => {
  const {
    lang,
    t,
    num,
    labelSite,
    labelWorldRev,
    labelActuationMode,
    labelVehicle,
    labelVehicleStatus,
    labelLocationCode,
  } = useI18n();

  const [expanded, setExpanded] = React.useState(true);
  const autopilot = snapshot.autopilot ?? {
    enabled: true,
    speedMultiplier: 1 as 1 | 2 | 4,
    cyclesCompleted: 0,
    lastActionIso: null,
  };

  const kpis = useMemo(() => {
    const busyCount = snapshot.vehicles.filter((v) => v.status === 'busy').length;
    const totalFleet = snapshot.vehicles.length;
    const machines = snapshot.mes.assets.filter((a) => a.kind === 'machine');
    const avgOee =
      machines.length > 0
        ? Math.round(
            (machines.reduce((acc, m) => acc + m.oee.overall, 0) / machines.length) * 100
          )
        : 0;
    const runningTasks = (snapshot.tasks ?? []).filter((tk) => tk.status === 'in_progress').length;
    return {
      busyCount,
      totalFleet,
      completedMoves: snapshot.metrics.completedMissionsCount,
      avgOee,
      runningTasks,
    };
  }, [snapshot]);

  const showTracker = expanded && !hasSelection;

  return (
    <section
      aria-label={t('autoOpsLabel')}
      className="pointer-events-auto w-[372px] max-w-[calc(100vw-2.5rem)] bg-white/[0.97] dark:bg-[#0B1220]/[0.97] border border-slate-200/90 dark:border-slate-800/90 rounded-xl shadow-[0_14px_34px_-12px_rgba(15,23,42,0.18)] dark:shadow-[0_18px_40px_-12px_rgba(2,6,23,0.75)] overflow-hidden transition-all duration-150"
    >
      {/* Top Contextual Telemetry Row — strict hairline text with middots (zero pills) */}
      <div className="px-3.5 py-2 border-b border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between gap-2 text-[11px] font-mono-tabular text-slate-600 dark:text-slate-400">
        <div className="flex items-center gap-1.5 min-w-0 truncate">
          <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">
            {labelSite(snapshot.context.siteId)}
          </span>
          <span aria-hidden="true">·</span>
          <span className="shrink-0">{labelWorldRev(snapshot.context.worldRevision)}</span>
          <span aria-hidden="true">·</span>
          <span
            className={`shrink-0 ${
              snapshot.config.actuationMode === 'physical'
                ? 'text-red-600 dark:text-red-400 font-semibold'
                : snapshot.config.actuationMode === 'shadow'
                  ? 'text-amber-600 dark:text-amber-300 font-semibold'
                  : 'text-sky-700 dark:text-sky-400 font-medium'
            }`}
          >
            {labelActuationMode(snapshot.config.actuationMode)}
          </span>
        </div>
        <span
          className={`shrink-0 font-medium ${
            wsConnected
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-amber-600 dark:text-amber-400'
          }`}
        >
          {wsConnected ? t('liveStream') : t('reconnecting')}
        </span>
      </div>

      {/* Autonomous Factory Controls + 4-Column Tabular KPI Grid */}
      <div className="px-3.5 py-2.5 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Activity
              className={`w-3.5 h-3.5 shrink-0 ${
                autopilot.enabled
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-slate-400 dark:text-slate-500'
              }`}
            />
            <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
              {autopilot.enabled ? t('autoOpsActive') : t('autoOpsPaused')}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <ModernButton
              variant={autopilot.enabled ? 'secondary' : 'primary'}
              size="xs"
              onClick={() => onConfigureAutopilot({ enabled: !autopilot.enabled })}
            >
              {autopilot.enabled ? (
                <Pause className="w-3 h-3" />
              ) : (
                <Play className="w-3 h-3" />
              )}
              <span>{autopilot.enabled ? t('pauseAutoOps') : t('resumeAutoOps')}</span>
            </ModernButton>

            <div className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100/80 dark:bg-slate-900/90 p-0.5">
              {([1, 2, 4] as const).map((spd) => (
                <button
                  key={spd}
                  type="button"
                  onClick={() => onConfigureAutopilot({ speedMultiplier: spd })}
                  className={`px-1.5 py-0.5 text-[11px] font-mono-tabular rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    autopilot.speedMultiplier === spd
                      ? 'bg-white dark:bg-slate-800 text-sky-700 dark:text-sky-300 font-semibold shadow-xs'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {num(spd)}×
                </button>
              ))}
            </div>

            {!hasSelection && (
              <button
                type="button"
                onClick={() => setExpanded((e) => !e)}
                aria-label={t('liveFleetTracker')}
                className="p-1 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/80 cursor-pointer"
              >
                {expanded ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>
            )}
          </div>
        </div>

        {/* Hairline 4-KPI Bar */}
        <div className="grid grid-cols-4 divide-x rtl:divide-x-reverse divide-slate-200/80 dark:divide-slate-800/80 pt-1 border-t border-slate-200/70 dark:border-slate-800/70 text-center">
          <div className="px-1">
            <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
              {t('activeFleetKpi')}
            </div>
            <div className="text-sm font-semibold font-mono-tabular text-sky-700 dark:text-sky-300">
              {num(kpis.busyCount)}/{num(kpis.totalFleet)}
            </div>
          </div>
          <div className="px-1">
            <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
              {t('completedMovesKpi')}
            </div>
            <div className="text-sm font-semibold font-mono-tabular text-slate-900 dark:text-slate-100">
              {num(kpis.completedMoves)}
            </div>
          </div>
          <div className="px-1">
            <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
              {t('avgOeeKpi')}
            </div>
            <div className="text-sm font-semibold font-mono-tabular text-emerald-600 dark:text-emerald-400">
              {num(kpis.avgOee)}٪
            </div>
          </div>
          <div className="px-1">
            <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
              {t('activeTasksKpi')}
            </div>
            <div className="text-sm font-semibold font-mono-tabular text-slate-900 dark:text-slate-100">
              {num(kpis.runningTasks)}
            </div>
          </div>
        </div>
      </div>

      {/* Live Fleet Telemetry Rows */}
      {showTracker && (
        <div className="px-3.5 pb-3 pt-2 border-t border-slate-200/80 dark:border-slate-800/80 space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {t('liveFleetTracker')}
          </div>
          <div className="space-y-2">
            {snapshot.vehicles.map((v) => {
              const activeMission = v.activeMissionId
                ? snapshot.missions.find((m) => m.id === v.activeMissionId)
                : undefined;
              const progressPct = computeMissionProgressPct(activeMission);
              const VehicleIcon =
                v.type === 'AMR' ? Bot : v.type === 'Forklift' ? Warehouse : Truck;

              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => {
                    onFocusPose(v.pose.x, v.pose.z, 11);
                    onSelect({ kind: 'vehicle', id: v.id });
                  }}
                  className="w-full text-start group rounded-lg px-2.5 py-1.5 bg-slate-50/90 hover:bg-sky-50/80 dark:bg-slate-900/75 dark:hover:bg-slate-800/85 border border-slate-200/80 dark:border-slate-800/80 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <VehicleIcon className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
                      <span className="font-medium text-slate-900 dark:text-slate-100 truncate group-hover:text-sky-700 dark:group-hover:text-sky-300">
                        {labelVehicle(v.id)}
                      </span>
                    </div>
                    <span className="font-mono-tabular text-[10px] text-slate-600 dark:text-slate-400 shrink-0">
                      {num(v.velocityMps.toFixed(1))} {lang === 'fa' ? 'م/ث' : 'm/s'} ·{' '}
                      {num(v.batteryPct.toFixed(0))}٪
                    </span>
                  </div>

                  <div className="mt-1 flex items-center justify-between gap-2 text-[10px] font-mono-tabular">
                    <span className="text-slate-500 dark:text-slate-400 truncate">
                      {activeMission
                        ? `${t('enRouteTo')} ${labelLocationCode(activeMission.destinationCode)}`
                        : v.status === 'idle'
                          ? t('idleParked')
                          : labelVehicleStatus(v.status, v.eStopActive, v.isStale)}
                    </span>
                    <span className="text-sky-700 dark:text-sky-300 shrink-0">
                      {activeMission ? `${num(progressPct)}٪` : ''}
                    </span>
                  </div>

                  <div className="mt-1 h-1 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-200 ${
                        v.eStopActive
                          ? 'bg-red-500'
                          : v.status === 'paused'
                            ? 'bg-amber-500'
                            : activeMission
                              ? 'bg-sky-500 dark:bg-sky-400'
                              : 'bg-emerald-500/60'
                      }`}
                      style={{ width: `${activeMission ? Math.max(6, progressPct) : 100}%`, opacity: activeMission ? 1 : 0.35 }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
};
