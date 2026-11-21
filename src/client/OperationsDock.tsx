import React, { useState } from 'react';
import {
  Activity,
  ChevronDown,
  ChevronUp,
  Cpu,
  Navigation,
  Package,
  Search,
  ShieldCheck,
  Sliders,
  Truck,
} from 'lucide-react';
import { ActorPrincipal, TwinEventEnvelope } from '../shared/p1-contracts';
import {
  ActuationMode,
  CostProfile,
  MachineRunState,
  MissionDecisionExplanation,
  QaStatus,
  TwinFullSnapshot,
} from '../shared/p2-contracts';
import { ControlPlanePanel } from './ControlPlanePanel';
import { useI18n } from './i18n';
import { computeMissionProgressPct } from './LiveFactoryHud';
import { SelectedEntityRef, TwinOverlayMode } from './ThreeTwinViewport';
import { ModernButton, ModernInput, ModernSelect } from './ui/ModernControls';

export type DockTab = 'traffic' | 'control' | 'fleet' | 'wms' | 'mes' | 'events';

interface Props {
  snapshot: TwinFullSnapshot;
  events: TwinEventEnvelope<unknown>[];
  actors: ActorPrincipal[];
  actorId: string;
  activeTab: DockTab;
  setActiveTab: (t: DockTab) => void;
  collapsed: boolean;
  setCollapsed: (c: boolean) => void;
  overlays: TwinOverlayMode;
  setOverlays: React.Dispatch<React.SetStateAction<TwinOverlayMode>>;
  onFocusPose: (x: number, z: number, distance?: number) => void;
  onSelect: (sel: SelectedEntityRef) => void;
  actions: {
    submitMove: (payload: {
      idempotencyKey: string;
      originId: string;
      destinationId: string;
      vehicleId?: string;
      costProfile: CostProfile;
      loadId?: string;
      dryRun?: boolean;
    }) => Promise<unknown>;
    toggleEdgeClosure: (edgeId: string, closed: boolean, reason?: string) => Promise<unknown>;
    controlVehicle: (
      vehicleId: string,
      action: 'pause' | 'resume' | 'estop' | 'estop/ack' | 'stale-on' | 'stale-off',
      reason?: string
    ) => Promise<unknown>;
    cancelMission: (missionId: string) => Promise<unknown>;
    setPalletQa: (palletId: string, qaStatus: QaStatus) => Promise<unknown>;
    searchWms: (query: string) => Promise<{
      ok: boolean;
      data?: {
        matches: Array<{
          pallet: TwinFullSnapshot['wms']['pallets'][number];
          matchedOn: string;
          matchedValue: string;
          locationId: string;
          binCode: string;
          pose: { x: number; y: number; z: number };
        }>;
      };
    }>;
    dispatchBom: (bomId: string) => Promise<unknown>;
    setMachineState: (assetId: string, machineState: MachineRunState) => Promise<unknown>;
    toggleMaintenance: (windowId: string, active: boolean) => Promise<unknown>;
    validateGmp: (payload: {
      fromGrade: string;
      toGrade: string;
      passesAirlockId?: string;
      qaReleased: boolean;
    }) => Promise<{ ok: boolean; data?: { allowed: boolean; reason?: string } }>;
    patchConfig: (patch: Record<string, unknown>, reason?: string) => Promise<unknown>;
    patchFlags: (flags: Record<string, boolean>, reason?: string) => Promise<unknown>;
    setActuationMode: (payload: {
      actuationMode: ActuationMode;
      reason: string;
      confirmPhrase?: string;
      secondaryApproverId?: string;
    }) => Promise<unknown>;
    explainMission: (missionId: string) => Promise<{
      ok: boolean;
      data?: { explanation: MissionDecisionExplanation };
    }>;
    overrideMission: (
      missionId: string,
      action: 'pause' | 'resume' | 'replan' | 'reassign',
      body?: Record<string, unknown>
    ) => Promise<unknown>;
    releaseReservation: (reservationId: string, reason?: string) => Promise<unknown>;
  };
}

export const OperationsDock: React.FC<Props> = ({
  snapshot,
  events,
  actors,
  actorId,
  activeTab,
  setActiveTab,
  collapsed,
  setCollapsed,
  overlays,
  setOverlays,
  onFocusPose,
  onSelect,
  actions,
}) => {
  const {
    lang,
    t,
    num,
    formatId,
    labelVehicle,
    labelVehicleType,
    labelLocationCode,
    labelGrade,
    labelEdge,
    labelActorIdOnly,
    labelAssetCode,
    labelPalletCode,
    labelPalletName,
    labelSkuDesc,
    labelUom,
    labelLot,
    labelSerial,
    labelBom,
    labelMaintenance,
    labelOpportunity,
    labelMissionState,
    labelVehicleStatus,
    labelQaStatus,
    labelMachineState,
    labelCalibrationStatus,
    labelFlowKind,
    labelFlowStatus,
    labelHandoffState,
    labelAttachmentState,
    labelCostProfile,
    labelTopic,
    labelRejection,
  } = useI18n();

  const [originId, setOriginId] = useState('BIN-A1-01');
  const [destinationId, setDestinationId] = useState('STAGE-OUT-01');
  const [vehicleId, setVehicleId] = useState<string>('');
  const [costProfile, setCostProfile] = useState<CostProfile>(
    snapshot.config.routing.defaultCostProfile
  );
  const [loadId, setLoadId] = useState<string>('PLT-1001');
  const [idempotencyKey, setIdempotencyKey] = useState<string>(
    () => `cmd-${Date.now().toString().slice(-6)}`
  );
  const [explainedMission, setExplainedMission] = useState<MissionDecisionExplanation | null>(null);
  const [reassignTarget, setReassignTarget] = useState<string>('VEH-AGV-02');

  const [wmsQuery, setWmsQuery] = useState('SN-8801');
  const [searchMatches, setSearchMatches] = useState<
    Array<{
      pallet: TwinFullSnapshot['wms']['pallets'][number];
      matchedOn: string;
      matchedValue: string;
      locationId: string;
      binCode: string;
      pose: { x: number; y: number; z: number };
    }>
  >([]);
  const [expandedPalletId, setExpandedPalletId] = useState<string>('PLT-1001');
  const [gmpCheckMsg, setGmpCheckMsg] = useState<string | null>(null);

  const handleDispatch = async (dryRun: boolean) => {
    await actions.submitMove({
      idempotencyKey,
      originId,
      destinationId,
      vehicleId: vehicleId || undefined,
      costProfile,
      loadId: loadId || undefined,
      dryRun,
    });
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await actions.searchWms(wmsQuery);
    if (res.ok && res.data) {
      setSearchMatches(res.data.matches);
      if (res.data.matches.length > 0) {
        const first = res.data.matches[0];
        setExpandedPalletId(first.pallet.id);
        onFocusPose(first.pose.x, first.pose.z, 10);
        onSelect({ kind: 'pallet', id: first.pallet.id });
      }
    }
  };

  const opsTabs: Array<{ id: DockTab; label: string; icon: React.ReactNode }> = [
    { id: 'traffic', label: t('tabTraffic'), icon: <Navigation className="w-3.5 h-3.5" /> },
    { id: 'fleet', label: t('tabFleet'), icon: <Truck className="w-3.5 h-3.5" /> },
    { id: 'wms', label: t('tabWms'), icon: <Package className="w-3.5 h-3.5" /> },
    { id: 'mes', label: t('tabMes'), icon: <Cpu className="w-3.5 h-3.5" /> },
  ];
  const sysTabs: Array<{ id: DockTab; label: string; icon: React.ReactNode }> = [
    { id: 'control', label: t('tabControl'), icon: <Sliders className="w-3.5 h-3.5" /> },
    { id: 'events', label: t('tabEvents'), icon: <Activity className="w-3.5 h-3.5" /> },
  ];

  const cardClass =
    'bg-slate-50/90 dark:bg-slate-900/80 border border-slate-200/90 dark:border-slate-800/90 rounded-xl';

  return (
    <div
      className="pointer-events-none fixed bottom-4 left-1/2 z-20 w-[min(1160px,calc(100vw-2rem))] max-w-full flex flex-col items-center transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]"
      style={{
        // Avoid Tailwind `-translate-x-*` here: in v4 it sets CSS `translate`
        // and would stack with this `transform`, shifting the dock off-screen.
        transform: collapsed ? 'translate(-50%, calc(100% - 38px))' : 'translate(-50%, 0)',
      }}
    >
      {/* Collapse Toggle Handle */}
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="pointer-events-auto flex items-center gap-2 px-4 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white/[0.97] dark:bg-[#0B1220]/[0.97] border border-b-0 border-slate-200/90 dark:border-slate-800/90 rounded-t-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 shadow-xs cursor-pointer"
      >
        {collapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        <span>{collapsed ? t('showDock') : t('hideDock')}</span>
      </button>

      {/* Main Solid Architectural Surface Dock */}
      <div className="pointer-events-auto w-full bg-white/[0.97] dark:bg-[#0B1220]/[0.97] border border-slate-200/90 dark:border-slate-800/90 rounded-xl shadow-[0_20px_48px_-14px_rgba(15,23,42,0.22)] dark:shadow-[0_24px_56px_-14px_rgba(2,6,23,0.85)] overflow-hidden">
        {/* Partitioned Two-Group Tab Strip */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 border-b border-slate-200/80 dark:border-slate-800/80 bg-slate-100/80 dark:bg-slate-900/75">
          {/* Group 1: Site Operations */}
          <div className="flex items-center gap-1.5 overflow-x-auto">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 me-1 hidden sm:inline">
              {t('dockGroupOps')}
            </span>
            {opsTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id);
                  if (collapsed) setCollapsed(false);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === tab.id
                    ? 'bg-white dark:bg-slate-800 text-sky-700 dark:text-sky-300 border border-sky-500/40 shadow-xs font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800/60 border border-transparent'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Group 2: System Control & Audit */}
          <div className="flex items-center gap-1.5 sm:border-s sm:border-slate-300/70 dark:sm:border-slate-700/70 sm:ps-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 me-1 hidden sm:inline">
              {t('dockGroupSys')}
            </span>
            {sysTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id);
                  if (collapsed) setCollapsed(false);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === tab.id
                    ? 'bg-white dark:bg-slate-800 text-sky-700 dark:text-sky-300 border border-sky-500/40 shadow-xs font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800/60 border border-transparent'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Dock Body */}
        <div className="p-4 max-h-[300px] overflow-y-auto">
          {/* TAB 1: TRAFFIC & MISSIONS */}
          {activeTab === 'traffic' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Left: Semantic Move Builder */}
              <div className="lg:col-span-5 space-y-2.5 border-b lg:border-b-0 lg:border-e border-slate-200 dark:border-slate-800 pb-3 lg:pb-0 lg:pe-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    {t('semanticMoveCmd')}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setIdempotencyKey(`cmd-${Date.now().toString().slice(-6)}`)}
                    className="text-xs text-sky-600 dark:text-sky-400 hover:text-sky-500 dark:hover:text-sky-300 whitespace-nowrap"
                  >
                    {t('newKey')}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
                    <span className="block font-medium">{t('origin')}</span>
                    <ModernSelect
                      value={originId}
                      onChange={setOriginId}
                      options={snapshot.world.locations.map((loc) => ({
                        value: loc.code,
                        label: `${labelLocationCode(loc.code)} (${labelGrade(loc.cleanlinessGrade)})`,
                      }))}
                    />
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
                    <span className="block font-medium">{t('destination')}</span>
                    <ModernSelect
                      value={destinationId}
                      onChange={setDestinationId}
                      options={snapshot.world.locations.map((loc) => ({
                        value: loc.code,
                        label: `${labelLocationCode(loc.code)} (${labelGrade(loc.cleanlinessGrade)})`,
                      }))}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
                    <span className="block font-medium">{t('vehicle')}</span>
                    <ModernSelect
                      value={vehicleId}
                      onChange={setVehicleId}
                      options={[
                        { value: '', label: t('autoAssign') },
                        ...snapshot.vehicles.map((v) => ({
                          value: v.id,
                          label: `${labelVehicle(v.id)} (${labelVehicleType(v.type)})`,
                        })),
                      ]}
                    />
                  </div>

                  <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
                    <span className="block font-medium">{t('costProfile')}</span>
                    <ModernSelect<CostProfile>
                      value={costProfile}
                      onChange={setCostProfile}
                      options={[
                        { value: 'fastest', label: labelCostProfile('fastest') },
                        { value: 'safest', label: labelCostProfile('safest') },
                        { value: 'shortest', label: labelCostProfile('shortest') },
                      ]}
                    />
                  </div>

                  <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
                    <span className="block font-medium">{t('gs1Load')}</span>
                    <ModernSelect
                      value={loadId}
                      onChange={setLoadId}
                      options={[
                        { value: '', label: t('emptyRun') },
                        ...snapshot.wms.pallets.map((p) => ({
                          value: p.id,
                          label: `${labelPalletCode(p.id)} (${labelQaStatus(p.qaStatus)})`,
                        })),
                      ]}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <div className="w-32 shrink-0">
                    <ModernInput
                      type="text"
                      dir="ltr"
                      value={idempotencyKey}
                      onChange={(e) => setIdempotencyKey(e.target.value)}
                      aria-label="Idempotency Key"
                    />
                  </div>
                  <ModernButton variant="secondary" size="sm" onClick={() => handleDispatch(true)}>
                    {t('dryRun')}
                  </ModernButton>
                  <ModernButton variant="primary" size="sm" onClick={() => handleDispatch(false)}>
                    {t('dispatchMoveCta')}
                  </ModernButton>
                </div>

                {/* Dynamic Lane Closure Controls */}
                <div className="pt-1 flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs text-slate-500">{t('closuresLabel')}</span>
                  {['LANE-MAIN-02', 'LANE-MAIN-01', 'EDGE-NARROW-01', 'LANE-AIRLOCK-IN'].map((eid) => {
                    const edge = snapshot.world.navEdges.find((e) => e.id === eid);
                    if (!edge) return null;
                    return (
                      <button
                        key={eid}
                        type="button"
                        onClick={() =>
                          actions.toggleEdgeClosure(
                            eid,
                            !edge.closed,
                            lang === 'fa' ? 'مسدودسازی دستی توسط اپراتور' : 'Operator obstacle block'
                          )
                        }
                        className={`px-2 py-1 text-[11px] font-mono-tabular rounded border transition-colors whitespace-nowrap shrink-0 ${
                          edge.closed
                            ? 'bg-red-100 dark:bg-red-950/80 border-red-400 dark:border-red-700 text-red-700 dark:text-red-300'
                            : 'bg-slate-100 dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-500'
                        }`}
                      >
                        {edge.closed ? t('unblock') : t('block')} {labelEdge(eid)}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Right: Active Mission Queue & Edge Reservations */}
              <div className="lg:col-span-7 space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {t('missionsTitle')} ({num(snapshot.missions.length)}) · {t('reservationsTitle')} (
                    {num(snapshot.reservations.length)}) · {t('deadlocksResolved')} (
                    {num(snapshot.deadlockResolutions.length)})
                  </span>
                </div>

                {snapshot.missions.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-500 dark:text-slate-400 border border-dashed border-slate-300 dark:border-slate-800 rounded-lg">
                    {t('noMissionsEmpty')}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {snapshot.missions.slice(0, 6).map((m) => {
                      const progressPct = computeMissionProgressPct(m);
                      return (
                      <div
                        key={m.id}
                        className={`flex items-center justify-between gap-3 px-3 py-2 text-xs ${cardClass}`}
                      >
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-2 text-slate-800 dark:text-slate-200 font-medium flex-wrap">
                            <span className="font-mono-tabular text-sky-700 dark:text-sky-300">
                              {formatId(m.id)}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>
                              {labelLocationCode(m.originCode)} ← {labelLocationCode(m.destinationCode)}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono-tabular text-slate-500 dark:text-slate-400">
                              {m.vehicleId ? labelVehicle(m.vehicleId) : t('unassigned')}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 font-mono-tabular flex-wrap">
                            <span
                              className={
                                m.state === 'completed'
                                  ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                                  : m.state === 'failed'
                                    ? 'text-red-600 dark:text-red-400 font-semibold'
                                    : m.state === 'paused'
                                      ? 'text-amber-600 dark:text-amber-400 font-semibold'
                                      : 'text-cyan-700 dark:text-cyan-400 font-semibold'
                              }
                            >
                              {labelMissionState(m.state)} ({num(progressPct)}٪)
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>
                              {num(m.route?.totalDistanceM ?? 0)} {lang === 'fa' ? 'متر' : 'm'}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{labelCostProfile(m.costProfile)}</span>
                            <span aria-hidden="true">·</span>
                            <span>
                              {t('replansLabel')}: {num(m.replanCount)}
                            </span>
                            {m.failureReason && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="text-red-600 dark:text-red-400 truncate max-w-[200px]">
                                  {num(m.failureReason)}
                                </span>
                              </>
                            )}
                          </div>
                          {(m.state === 'executing' || m.state === 'paused') && (
                            <div className="h-1 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-200 ${
                                  m.state === 'paused' ? 'bg-amber-500' : 'bg-sky-500 dark:bg-sky-400'
                                }`}
                                style={{ width: `${Math.max(5, progressPct)}%` }}
                              />
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={async () => {
                              const res = await actions.explainMission(m.id);
                              if (res.ok && res.data) {
                                setExplainedMission(res.data.explanation);
                              }
                            }}
                            className="px-2 py-1 text-xs bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-sky-700 dark:text-sky-300 rounded whitespace-nowrap"
                          >
                            {t('whyBtn')}
                          </button>

                          {m.state === 'executing' && (
                            <button
                              type="button"
                              onClick={() => actions.overrideMission(m.id, 'pause')}
                              className="px-2 py-1 text-xs bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-amber-700 dark:text-amber-300 rounded whitespace-nowrap"
                            >
                              {t('pauseBtn')}
                            </button>
                          )}
                          {m.state === 'paused' && (
                            <button
                              type="button"
                              onClick={() => actions.overrideMission(m.id, 'resume')}
                              className="px-2 py-1 text-xs bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-900/70 dark:hover:bg-emerald-800 text-emerald-800 dark:text-emerald-200 rounded whitespace-nowrap"
                            >
                              {t('resumeBtn')}
                            </button>
                          )}
                          {(m.state === 'executing' || m.state === 'planned' || m.state === 'paused') && (
                            <>
                              <button
                                type="button"
                                onClick={() => actions.overrideMission(m.id, 'replan')}
                                className="px-2 py-1 text-xs bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded whitespace-nowrap"
                              >
                                {t('replanBtn')}
                              </button>
                              <button
                                type="button"
                                onClick={() => actions.cancelMission(m.id)}
                                className="px-2 py-1 text-xs bg-red-100 hover:bg-red-200 dark:bg-red-950/60 dark:hover:bg-red-900/70 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-800/60 rounded whitespace-nowrap"
                              >
                                {t('safeStopBtn')}
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                      );
                    })}
                  </div>
                )}

                {/* Decision Explainability & Manual Override Drawer */}
                {explainedMission && (
                  <div className="mt-2 p-2.5 bg-sky-50 dark:bg-slate-900 border border-sky-300 dark:border-sky-800/60 rounded-lg text-[11px] space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sky-800 dark:text-sky-300 font-mono-tabular">
                        {t('decisionExplainTitle')} · {formatId(explainedMission.missionId)} (
                        {explainedMission.autoAssigned ? t('autoDispatchTag') : t('explicitVehicleTag')})
                      </span>
                      <button
                        type="button"
                        onClick={() => setExplainedMission(null)}
                        className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                      >
                        {t('closeBtn')}
                      </button>
                    </div>
                    {explainedMission.routingSummary && (
                      <div className="font-mono-tabular text-slate-700 dark:text-slate-300">
                        {t('astarExpanded')}: {num(explainedMission.routingSummary.expandedNodes)}/
                        {num(explainedMission.routingSummary.maxExpandNodes)} · {t('costLabel')}:{' '}
                        {num(explainedMission.routingSummary.totalCost)} · {t('distanceLabel')}:{' '}
                        {num(explainedMission.routingSummary.totalDistanceM)} {lang === 'fa' ? 'متر' : 'm'}
                      </div>
                    )}
                    <div className="space-y-0.5 font-mono-tabular">
                      {explainedMission.candidates.map((c) => (
                        <div key={c.vehicleId} className="text-slate-600 dark:text-slate-400">
                          <span
                            className={
                              c.vehicleId === explainedMission.selectedVehicleId
                                ? 'text-emerald-700 dark:text-emerald-400 font-semibold'
                                : 'text-slate-800 dark:text-slate-300'
                            }
                          >
                            {labelVehicle(c.vehicleId)}
                          </span>
                          :{' '}
                          {c.eligible && c.scoreBreakdown
                            ? lang === 'fa'
                              ? `امتیاز کل=${num(c.scoreBreakdown.totalScore)} (فاصله=${num(
                                  c.scoreBreakdown.distanceTerm
                                )}، باتری=${num(c.scoreBreakdown.batteryTerm)}، بار=${num(
                                  c.scoreBreakdown.workloadTerm
                                )}، انطباق=${num(c.scoreBreakdown.capabilityFitTerm)})`
                              : `score=${c.scoreBreakdown.totalScore} (dist=${c.scoreBreakdown.distanceTerm}, bat=${c.scoreBreakdown.batteryTerm}, work=${c.scoreBreakdown.workloadTerm}, cap=${c.scoreBreakdown.capabilityFitTerm})`
                            : `${t('rejectedTag')} [${c.rejectionReasons
                                .map((r) => labelRejection(r))
                                .join('؛ ')}]`}
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <div className="w-52">
                        <ModernSelect
                          size="xs"
                          value={reassignTarget}
                          onChange={setReassignTarget}
                          options={snapshot.vehicles.map((v) => ({
                            value: v.id,
                            label: `${t('reassignPrefix')} ${labelVehicle(v.id)}`,
                          }))}
                        />
                      </div>
                      <ModernButton
                        variant="primary"
                        size="xs"
                        onClick={() =>
                          actions.overrideMission(explainedMission.missionId, 'reassign', {
                            vehicleId: reassignTarget,
                            reason:
                              lang === 'fa'
                                ? 'تغییر دستی خودرو توسط اپراتور'
                                : 'Operator manual reassignment',
                          })
                        }
                      >
                        {t('applyReassign')}
                      </ModernButton>
                    </div>
                  </div>
                )}

                {snapshot.reservations.length > 0 && (
                  <div className="pt-1 flex items-center gap-1.5 flex-wrap text-[11px] font-mono-tabular">
                    <span className="text-slate-500">{t('activeReservations')}</span>
                    {snapshot.reservations.slice(0, 4).map((r) => (
                      <button
                        key={r.reservationId}
                        type="button"
                        onClick={() => actions.releaseReservation(r.reservationId)}
                        className="px-2 py-0.5 bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:border-amber-500 text-slate-700 dark:text-slate-300 rounded"
                        title={t('clickReleaseTitle')}
                      >
                        {labelEdge(r.edgeId)} ({labelVehicle(r.vehicleId)}) ×
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: CONTROL PLANE */}
          {activeTab === 'control' && (
            <ControlPlanePanel
              config={snapshot.config}
              flags={snapshot.flags}
              actors={actors}
              currentActorId={actorId}
              onPatchConfig={actions.patchConfig}
              onPatchFlags={actions.patchFlags}
              onChangeActuationMode={actions.setActuationMode}
            />
          )}

          {/* TAB 3: FLEET & VEHICLE RUNTIME */}
          {activeTab === 'fleet' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {snapshot.vehicles.map((v) => (
                <div key={v.id} className={`p-3 space-y-2 text-xs ${cardClass}`}>
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        onFocusPose(v.pose.x, v.pose.z, 11);
                        onSelect({ kind: 'vehicle', id: v.id });
                      }}
                      className="font-semibold text-slate-900 dark:text-slate-100 hover:text-sky-600 dark:hover:text-sky-300 text-start truncate"
                    >
                      {labelVehicle(v.id)} · {labelVehicleType(v.type)}
                    </button>
                    <span
                      className={`font-mono-tabular font-semibold ${
                        v.eStopActive
                          ? 'text-red-600 dark:text-red-400'
                          : v.isStale
                            ? 'text-amber-600 dark:text-amber-400'
                            : v.status === 'busy'
                              ? 'text-cyan-700 dark:text-cyan-400'
                              : 'text-emerald-600 dark:text-emerald-400'
                      }`}
                    >
                      {labelVehicleStatus(v.status, v.eStopActive, v.isStale)}
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-600 dark:text-slate-400 font-mono-tabular space-y-0.5">
                    <div>
                      {t('poseLabel')}: ({num(v.pose.x.toFixed(1))}, {num(v.pose.z.toFixed(1))}) ·{' '}
                      {num(v.velocityMps.toFixed(1))} {lang === 'fa' ? 'م/ث' : 'm/s'} · {t('batteryShort')}{' '}
                      {num(v.batteryPct.toFixed(0))}٪
                    </div>
                    <div>
                      {t('sizeLabel')}: {num(v.dimensions.widthM)}×{num(v.dimensions.lengthM)}×
                      {num(v.dimensions.heightM)} {lang === 'fa' ? 'متر' : 'm'} · {t('maxLabel')}{' '}
                      {num(v.maxPayloadKg)} {lang === 'fa' ? 'ک‌گ' : 'kg'}
                    </div>
                    <div>
                      {t('gradesLabel')}:{' '}
                      {v.allowedCleanlinessGrades.map((g) => labelGrade(g)).join('، ')}
                    </div>
                    <div>
                      {t('loadLabel')}:{' '}
                      {v.attachment
                        ? `${labelPalletCode(v.attachment.loadId)} (${labelAttachmentState(
                            v.attachment.state
                          )})`
                        : t('noneLabel')}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {v.status === 'paused' ? (
                      <button
                        type="button"
                        onClick={() => actions.controlVehicle(v.id, 'resume')}
                        className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded whitespace-nowrap"
                      >
                        {t('resumeBtn')}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => actions.controlVehicle(v.id, 'pause')}
                        className="px-2.5 py-1 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded whitespace-nowrap"
                      >
                        {t('pauseBtn')}
                      </button>
                    )}

                    {v.eStopActive ? (
                      <button
                        type="button"
                        onClick={() => actions.controlVehicle(v.id, 'estop/ack')}
                        className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded whitespace-nowrap"
                      >
                        {t('ackEstop')}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          actions.controlVehicle(
                            v.id,
                            'estop',
                            lang === 'fa' ? 'آزمایش توقف اضطراری' : 'Twin console E-Stop test'
                          )
                        }
                        className="px-2.5 py-1 bg-red-600 hover:bg-red-500 text-white rounded whitespace-nowrap"
                      >
                        {t('eStopBtn')}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() =>
                        actions.controlVehicle(v.id, v.isStale ? 'stale-off' : 'stale-on')
                      }
                      className="px-2.5 py-1 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded whitespace-nowrap"
                    >
                      {v.isStale ? t('recoverTelemetry') : t('staleTest')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* TAB 4: WMS DIGITAL TWIN */}
          {activeTab === 'wms' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 text-xs">
              <div className="lg:col-span-6 space-y-2.5">
                <form onSubmit={handleSearch} className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 absolute start-2.5 top-1/2 -translate-y-1/2 z-10 pointer-events-none" />
                    <ModernInput
                      type="text"
                      value={wmsQuery}
                      onChange={(e) => setWmsQuery(e.target.value)}
                      placeholder={t('wmsPlaceholder')}
                      className="ps-8 font-sans"
                    />
                  </div>
                  <ModernButton type="submit" variant="primary" size="sm">
                    {t('findJump3d')}
                  </ModernButton>
                </form>

                {searchMatches.length > 0 && (
                  <div className="px-3 py-2 bg-sky-50 dark:bg-sky-950/40 border border-sky-300 dark:border-sky-800/60 rounded text-sky-900 dark:text-sky-200">
                    {t('matchedLabel')}{' '}
                    <span className="font-mono-tabular font-semibold">
                      {num(searchMatches[0].matchedValue)}
                    </span>{' '}
                    {t('atLabel')}{' '}
                    <span className="font-semibold">
                      {labelLocationCode(searchMatches[0].binCode)}
                    </span>
                  </div>
                )}

                <div className="space-y-1.5">
                  {snapshot.wms.pallets.map((p) => {
                    const isExpanded = expandedPalletId === p.id;
                    return (
                      <div key={p.id} className={`p-2.5 ${cardClass}`}>
                        <div className="flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setExpandedPalletId(isExpanded ? '' : p.id);
                              const loc = snapshot.world.locations.find((l) => l.id === p.locationId);
                              if (loc) onFocusPose(loc.pose.x, loc.pose.z, 10);
                            }}
                            className="text-start font-medium text-slate-900 dark:text-slate-100 hover:text-sky-600 dark:hover:text-sky-300"
                          >
                            {labelPalletCode(p.id)} · {labelPalletName(p.id, p.label)}
                          </button>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-mono-tabular text-slate-500 dark:text-slate-400">
                              {p.inTransitVehicleId
                                ? `${t('inTransitLabel')} (${labelVehicle(p.inTransitVehicleId)})`
                                : labelLocationCode(p.binCode)}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                actions.setPalletQa(
                                  p.id,
                                  p.qaStatus === 'quarantine' ? 'released' : 'quarantine'
                                )
                              }
                              className={`px-2 py-0.5 rounded font-mono-tabular text-[11px] whitespace-nowrap ${
                                p.qaStatus === 'quarantine'
                                  ? 'bg-amber-100 dark:bg-amber-900/70 text-amber-800 dark:text-amber-200 border border-amber-400 dark:border-amber-700'
                                  : 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300 border border-emerald-400 dark:border-emerald-700/60'
                              }`}
                            >
                              {t('qaLabel')}: {labelQaStatus(p.qaStatus)}
                            </button>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-800 space-y-1 text-[11px] text-slate-600 dark:text-slate-400 font-mono-tabular">
                            <div>
                              {t('ssccLabel')}: {num(p.sscc)} · {t('weightLabel')}: {num(p.weightKg)}{' '}
                              {lang === 'fa' ? 'کیلوگرم' : 'kg'}
                            </div>
                            {p.cartons.map((c) => (
                              <div key={c.id} className="ps-3 space-y-0.5">
                                <div className="text-slate-700 dark:text-slate-300">
                                  {t('cartonLabel')} {formatId(c.id)} · {t('gtinLabel')} {num(c.gtin)} ·{' '}
                                  {t('lotLabel')} {labelLot(c.lot)}
                                </div>
                                {c.items.map((it) => (
                                  <div key={it.id} className="ps-3 text-slate-500 dark:text-slate-400">
                                    {t('itemLabel')} {labelSerial(it.serial)} ·{' '}
                                    {labelSkuDesc(it.sku, it.description)} · {num(it.quantity)}{' '}
                                    {labelUom(it.uom)} · {t('expLabel')} {num(it.expiryIso.slice(0, 10))}
                                  </div>
                                ))}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="lg:col-span-6 space-y-3">
                <div>
                  <h4 className="font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                    {t('inboundOutboundFlows')}
                  </h4>
                  <div className="space-y-1">
                    {snapshot.wms.flows.slice(0, 4).map((f) => (
                      <div
                        key={f.id}
                        className={`flex items-center justify-between px-2.5 py-1.5 ${cardClass}`}
                      >
                        <span className="text-slate-700 dark:text-slate-300">
                          {labelFlowKind(f.kind)} ·{' '}
                          <span className="font-mono-tabular">{labelPalletCode(f.palletId)}</span>
                        </span>
                        <span
                          className={`font-mono-tabular font-medium ${
                            f.status === 'blocked_qa'
                              ? 'text-amber-600 dark:text-amber-400'
                              : f.status === 'completed'
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-sky-600 dark:text-sky-400'
                          }`}
                        >
                          {labelFlowStatus(f.status)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                    {t('slottingInsights')}
                  </h4>
                  <div className="space-y-1.5">
                    {snapshot.wms.opportunities.map((op) => {
                      const localized = labelOpportunity(op.id, op.title, op.rationale);
                      return (
                        <div key={op.id} className={`p-2.5 space-y-0.5 ${cardClass}`}>
                          <div className="flex items-center justify-between text-slate-900 dark:text-slate-200 font-medium gap-2">
                            <span>{localized.title}</span>
                            <span className="font-mono-tabular text-emerald-600 dark:text-emerald-400 shrink-0">
                              -{num(op.estimatedTravelReductionPct)}٪ {t('travelReduction')}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            {localized.rationale}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: MES & GMP */}
          {activeTab === 'mes' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 text-xs">
              {/* Left: BOM Handoff & Batch Genealogy */}
              <div className="lg:col-span-5 space-y-3">
                <div>
                  <h4 className="font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                    {t('bomHandoffTitle')}
                  </h4>
                  <div className="space-y-1.5">
                    {snapshot.mes.bomDemands.map((b) => {
                      const bomLoc = labelBom(b.id, b.workOrderId, b.productName);
                      return (
                        <div
                          key={b.id}
                          className={`flex items-center justify-between gap-2 p-2.5 ${cardClass}`}
                        >
                          <div>
                            <div className="font-medium text-slate-900 dark:text-slate-200">
                              {bomLoc.title}
                            </div>
                            <div className="text-[11px] font-mono-tabular text-slate-500 dark:text-slate-400">
                              {t('lotLabel')} {labelLot(b.requiredLot)} · {num(b.quantity)}{' '}
                              {labelUom(b.uom)} · {t('stateLabel')}: {labelHandoffState(b.handoffState)}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => actions.dispatchBom(b.id)}
                            disabled={b.handoffState !== 'pending'}
                            className="px-2.5 py-1 bg-sky-600 hover:bg-sky-500 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-500 text-white rounded whitespace-nowrap shrink-0"
                          >
                            {b.handoffState === 'pending'
                              ? t('dispatchHandoff')
                              : labelHandoffState(b.handoffState)}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {snapshot.mes.batches[0] && (
                  <div className={`p-2.5 space-y-1.5 ${cardClass}`}>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {t('genealogyTitle')}: {formatId(snapshot.mes.batches[0].batchId)}
                      </span>
                      <button
                        type="button"
                        onClick={() => setOverlays((o) => ({ ...o, batchJourney: !o.batchJourney }))}
                        className="text-sky-600 dark:text-sky-400 hover:text-sky-500 whitespace-nowrap"
                      >
                        {overlays.batchJourney ? t('hide3dPath') : t('show3dPath')}
                      </button>
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono-tabular">
                      {t('inputsLabel')}:{' '}
                      {snapshot.mes.batches[0].inputLots
                        .map((l) => `${labelLot(l.lot)} (${num(l.quantity)} ${labelUom(l.uom)})`)
                        .join(' + ')}
                    </div>
                    <div className="flex items-center gap-1 flex-wrap text-[11px] font-mono-tabular text-slate-700 dark:text-slate-300">
                      {snapshot.mes.batches[0].spatialJourney.map((st, idx) => (
                        <React.Fragment key={st.stepOrder}>
                          <span
                            className={
                              st.status === 'active'
                                ? 'text-purple-700 dark:text-purple-300 font-semibold'
                                : st.status === 'completed'
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-slate-400 dark:text-slate-500'
                            }
                          >
                            {labelLocationCode(st.locationCode)}
                          </span>
                          {idx < snapshot.mes.batches[0].spatialJourney.length - 1 && (
                            <span className="text-slate-400 dark:text-slate-600">
                              {lang === 'fa' ? '←' : '→'}
                            </span>
                          )}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Right: Production Assets OEE, Maintenance & GMP Gate */}
              <div className="lg:col-span-7 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {snapshot.mes.assets
                    .filter((a) => a.kind === 'machine')
                    .map((asset) => {
                      const oeePct = Math.round(asset.oee.overall * 100);
                      return (
                      <div key={asset.id} className={`p-2.5 space-y-1.5 ${cardClass}`}>
                        <div className="flex items-center justify-between">
                          <button
                            type="button"
                            onClick={() => {
                              onFocusPose(asset.pose.x, asset.pose.z, 10);
                              onSelect({ kind: 'asset', id: asset.id });
                            }}
                            className="font-medium text-slate-900 dark:text-slate-100 hover:text-sky-600 dark:hover:text-sky-300 text-start"
                          >
                            {labelAssetCode(asset.id)} · {labelGrade(asset.cleanlinessGrade)}
                          </button>
                          <span className="font-mono-tabular text-slate-700 dark:text-slate-300">
                            {lang === 'fa' ? 'بهره‌وری' : 'OEE'}{' '}
                            {num(oeePct)}٪
                          </span>
                        </div>
                        <div className="h-1 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${
                              oeePct >= 80
                                ? 'bg-emerald-500'
                                : oeePct >= 60
                                  ? 'bg-amber-500'
                                  : 'bg-red-500'
                            }`}
                            style={{ width: `${oeePct}%` }}
                          />
                        </div>
                        <div className="text-[11px] font-mono-tabular text-slate-500 dark:text-slate-400">
                          {t('stateLabel')}: {labelMachineState(asset.machineState)} · {t('calLabel')}:{' '}
                          {labelCalibrationStatus(asset.calibrationStatus)}
                        </div>
                        <div className="flex items-center gap-1">
                          {(['run', 'idle', 'down'] as MachineRunState[]).map((st) => (
                            <button
                              key={st}
                              type="button"
                              onClick={() => actions.setMachineState(asset.id, st)}
                              className={`px-2 py-0.5 rounded text-[11px] ${
                                asset.machineState === st
                                  ? 'bg-sky-600 text-white'
                                  : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700'
                              }`}
                            >
                              {labelMachineState(st)}
                            </button>
                          ))}
                        </div>
                      </div>
                      );
                    })}
                </div>

                {/* Maintenance Windows + GMP Airlock Verification */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  {snapshot.mes.maintenanceWindows.map((mw) => (
                    <button
                      key={mw.id}
                      type="button"
                      onClick={() => actions.toggleMaintenance(mw.id, !mw.active)}
                      className={`px-2.5 py-1.5 rounded border text-xs font-mono-tabular whitespace-nowrap ${
                        mw.active
                          ? 'bg-amber-100 dark:bg-amber-950/70 border-amber-400 dark:border-amber-700 text-amber-800 dark:text-amber-200'
                          : 'bg-slate-100 dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {labelMaintenance(mw.id)}:{' '}
                      {mw.active ? t('activeBlocksDispatch') : t('clearedLabel')}
                    </button>
                  ))}

                  <button
                    type="button"
                    onClick={async () => {
                      const res = await actions.validateGmp({
                        fromGrade: 'Warehouse',
                        toGrade: 'Grade C',
                        qaReleased: true,
                      });
                      setGmpCheckMsg(
                        res.data?.allowed
                          ? t('gmpAllowed')
                          : `${t('gmpBlocked')}: ${t('airlockRequired')}`
                      );
                    }}
                    className="px-2.5 py-1.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded text-xs whitespace-nowrap"
                  >
                    {t('testDirectGmp')}
                  </button>
                </div>
                {gmpCheckMsg && (
                  <div className="text-xs text-amber-700 dark:text-amber-300 font-mono-tabular">
                    {gmpCheckMsg}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 6: EVENTS, METRICS & SAFETY BOUNDARY */}
          {activeTab === 'events' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 text-xs">
              <div className="lg:col-span-4 space-y-2">
                <h4 className="font-semibold text-slate-800 dark:text-slate-200">
                  {t('metricsTitle')}
                </h4>
                <div className="grid grid-cols-2 gap-1.5 font-mono-tabular text-[11px]">
                  <div className={`p-2 ${cardClass}`}>
                    <div className="text-slate-500 dark:text-slate-400">{t('acceptedRejected')}</div>
                    <div className="text-slate-900 dark:text-slate-100 text-sm font-semibold">
                      {num(snapshot.metrics.commandsAccepted)} / {num(snapshot.metrics.commandsRejected)}
                    </div>
                  </div>
                  <div className={`p-2 ${cardClass}`}>
                    <div className="text-slate-500 dark:text-slate-400">{t('replansDeadlocks')}</div>
                    <div className="text-slate-900 dark:text-slate-100 text-sm font-semibold">
                      {num(snapshot.metrics.replansTriggered)} / {num(snapshot.metrics.deadlocksResolved)}
                    </div>
                  </div>
                  <div className={`p-2 ${cardClass}`}>
                    <div className="text-slate-500 dark:text-slate-400">{t('staleEstop')}</div>
                    <div className="text-slate-900 dark:text-slate-100 text-sm font-semibold">
                      {num(snapshot.metrics.staleVehiclesCount)} /{' '}
                      {num(snapshot.metrics.eStopsActiveCount)}
                    </div>
                  </div>
                  <div className={`p-2 ${cardClass}`}>
                    <div className="text-slate-500 dark:text-slate-400">{t('safetyGateway')}</div>
                    <div className="text-emerald-600 dark:text-emerald-400 text-sm font-semibold flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>{t('noDirectIo')}</span>
                    </div>
                  </div>
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  {t('gatewayIntentsLogged')}{' '}
                  <span className="font-mono-tabular text-slate-800 dark:text-slate-200">
                    {num(snapshot.safetyIntents.length)}
                  </span>{' '}
                  (
                  {lang === 'fa' ? 'تمام موارد بدون تحریک سخت‌افزاری' : 'all physicalIoActuated: false'}
                  )
                </div>
              </div>

              <div className="lg:col-span-8 space-y-1.5">
                <h4 className="font-semibold text-slate-800 dark:text-slate-200">
                  {t('liveEventBackbone')}
                </h4>
                <div className="space-y-1 max-h-[180px] overflow-y-auto font-mono-tabular text-[11px]">
                  {events.slice(0, 20).map((ev) => (
                    <div
                      key={ev.eventId}
                      className={`flex items-center justify-between gap-2 px-2.5 py-1 ${cardClass}`}
                    >
                      <span className="text-sky-700 dark:text-sky-300 shrink-0">
                        {labelTopic(ev.topic)}
                      </span>
                      <span className="text-slate-500 dark:text-slate-400 truncate">
                        {t('actorLabel')}: {labelActorIdOnly(ev.actorId)}
                      </span>
                      <span className="text-slate-400 dark:text-slate-500 shrink-0">
                        {num(ev.timestampIso.slice(11, 19))}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
