import React, { useEffect, useState } from 'react';
import { Compass, Flag, ShieldAlert, Sliders } from 'lucide-react';
import { ActorPrincipal } from '../shared/p1-contracts';
import { ActuationMode, CostProfile, TwinFeatureFlags, TwinOpsConfig } from '../shared/p2-contracts';
import { useI18n } from './i18n';
import {
  ModernButton,
  ModernInput,
  ModernSegmented,
  ModernSelect,
  ModernSwitch,
} from './ui/ModernControls';

type ControlSection = 'safety' | 'flags' | 'dispatch' | 'routing';

interface Props {
  config: TwinOpsConfig;
  flags: TwinFeatureFlags;
  actors: ActorPrincipal[];
  currentActorId: string;
  onPatchConfig: (patch: Record<string, unknown>, reason?: string) => Promise<unknown>;
  onPatchFlags: (flags: Record<string, boolean>, reason?: string) => Promise<unknown>;
  onChangeActuationMode: (payload: {
    actuationMode: ActuationMode;
    reason: string;
    confirmPhrase?: string;
    secondaryApproverId?: string;
  }) => Promise<unknown>;
}

export const ControlPlanePanel: React.FC<Props> = ({
  config,
  flags,
  actors,
  currentActorId,
  onPatchConfig,
  onPatchFlags,
  onChangeActuationMode,
}) => {
  const {
    t,
    lang,
    labelActuationMode,
    labelActor,
    labelFlag,
    labelIntersectionPolicy,
    labelDeadlockPolicy,
    labelCostProfile,
  } = useI18n();

  const [section, setSection] = useState<ControlSection>('safety');

  const [wDist, setWDist] = useState(config.dispatch.scoring.wDistance);
  const [wBat, setWBat] = useState(config.dispatch.scoring.wBattery);
  const [wWork, setWWork] = useState(config.dispatch.scoring.wWorkload);
  const [wCap, setWCap] = useState(config.dispatch.scoring.wCapabilityFit);
  const [minBat, setMinBat] = useState(config.dispatch.minBatteryPct);
  const [maxQueue, setMaxQueue] = useState(config.dispatch.maxQueueDepthPerVehicle);

  const [costDist, setCostDist] = useState(config.routing.costs.distance);
  const [costTurn, setCostTurn] = useState(config.routing.costs.turn);
  const [costCong, setCostCong] = useState(config.routing.costs.congestion);
  const [maxExpand, setMaxExpand] = useState(config.routing.maxExpandNodes);
  const [maxReplans, setMaxReplans] = useState(config.mission.maxReplans);
  const [devThresh, setDevThresh] = useState(config.mission.deviationThresholdMeters);

  const [targetMode, setTargetMode] = useState<ActuationMode>(config.actuationMode);
  const [confirmPhrase, setConfirmPhrase] = useState('');
  const [secondaryApproverId, setSecondaryApproverId] = useState(
    actors.find((a) => a.actorId !== currentActorId && a.permissions.manageSafetyMode)?.actorId ||
      'SUP-01'
  );
  const [modeReason, setModeReason] = useState(
    lang === 'fa' ? 'راستی‌آزمایی عملیاتی' : 'Operational verification'
  );

  useEffect(() => {
    setWDist(config.dispatch.scoring.wDistance);
    setWBat(config.dispatch.scoring.wBattery);
    setWWork(config.dispatch.scoring.wWorkload);
    setWCap(config.dispatch.scoring.wCapabilityFit);
    setMinBat(config.dispatch.minBatteryPct);
    setMaxQueue(config.dispatch.maxQueueDepthPerVehicle);
    setCostDist(config.routing.costs.distance);
    setCostTurn(config.routing.costs.turn);
    setCostCong(config.routing.costs.congestion);
    setMaxExpand(config.routing.maxExpandNodes);
    setMaxReplans(config.mission.maxReplans);
    setDevThresh(config.mission.deviationThresholdMeters);
    setTargetMode(config.actuationMode);
  }, [config]);

  useEffect(() => {
    setModeReason(lang === 'fa' ? 'راستی‌آزمایی عملیاتی' : 'Operational verification');
  }, [lang]);

  const applyRoutingAndMission = () => {
    onPatchConfig(
      {
        routing: {
          costs: {
            distance: Number(costDist),
            turn: Number(costTurn),
            congestion: Number(costCong),
          },
          maxExpandNodes: Number(maxExpand),
        },
        mission: {
          maxReplans: Number(maxReplans),
          deviationThresholdMeters: Number(devThresh),
        },
      },
      lang === 'fa'
        ? 'تنظیم ضرایب مسیریابی و آستانه‌های مأموریت توسط اپراتور'
        : 'Operator tuned routing & mission thresholds'
    );
  };

  const applyDispatchScoring = () => {
    onPatchConfig(
      {
        dispatch: {
          scoring: {
            wDistance: Number(wDist),
            wBattery: Number(wBat),
            wWorkload: Number(wWork),
            wCapabilityFit: Number(wCap),
          },
          minBatteryPct: Number(minBat),
          maxQueueDepthPerVehicle: Number(maxQueue),
        },
      },
      lang === 'fa'
        ? 'تنظیم وزن‌های تخصیص ناوگان توسط اپراتور'
        : 'Operator tuned dispatch scoring & eligibility'
    );
  };

  const sections: Array<{
    id: ControlSection;
    label: string;
    icon: React.ReactNode;
  }> = [
    {
      id: 'safety',
      label: t('cpTabSafety'),
      icon: <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />,
    },
    {
      id: 'flags',
      label: t('cpTabFlags'),
      icon: <Flag className="w-3.5 h-3.5 text-emerald-500" />,
    },
    {
      id: 'dispatch',
      label: t('cpTabDispatch'),
      icon: <Sliders className="w-3.5 h-3.5 text-sky-500" />,
    },
    {
      id: 'routing',
      label: t('cpTabRouting'),
      icon: <Compass className="w-3.5 h-3.5 text-cyan-500" />,
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-4 text-xs">
      {/* Partitioned Control Plane Sidebar Rail */}
      <aside className="md:col-span-3 flex md:flex-col gap-1 overflow-x-auto pb-2 md:pb-0 md:border-e border-b md:border-b-0 border-slate-200/80 dark:border-slate-800/80 md:pe-3">
        {sections.map((s) => {
          const active = section === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setSection(s.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-start text-xs font-medium transition-all whitespace-nowrap shrink-0 cursor-pointer border ${
                active
                  ? 'bg-sky-500/12 text-sky-700 dark:text-sky-300 border-sky-500/35 shadow-xs font-semibold'
                  : 'bg-transparent text-slate-600 dark:text-slate-400 border-transparent hover:bg-slate-100 dark:hover:bg-slate-900/70 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              {s.icon}
              <span>{s.label}</span>
            </button>
          );
        })}
      </aside>

      {/* Focused Section Body */}
      <div className="md:col-span-9 min-w-0">
        {/* SECTION 1: SAFETY & ACTUATION */}
        {section === 'safety' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200/75 dark:border-slate-800/75">
              <div>
                <h4 className="font-semibold text-slate-900 dark:text-slate-100">
                  {t('safetyActuationMode')}
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {t('cpSafetyDesc')}
                </p>
              </div>
              <span
                className={`font-mono-tabular font-semibold text-xs ${
                  config.actuationMode === 'physical'
                    ? 'text-red-600 dark:text-red-400'
                    : config.actuationMode === 'shadow'
                      ? 'text-amber-600 dark:text-amber-300'
                      : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {labelActuationMode(config.actuationMode)}
              </span>
            </div>

            <ModernSegmented
              value={targetMode}
              onChange={(m) => setTargetMode(m)}
              className="w-full"
              options={[
                { value: 'twin_only', label: labelActuationMode('twin_only') },
                { value: 'shadow', label: labelActuationMode('shadow') },
                { value: 'physical', label: labelActuationMode('physical') },
              ]}
            />

            {targetMode === 'physical' && (
              <div className="p-3 bg-red-50/90 dark:bg-red-950/40 border border-red-300/90 dark:border-red-800/70 rounded-xl space-y-2">
                <div className="text-[11px] font-medium text-red-700 dark:text-red-200">
                  {t('physicalGateWarning')}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <ModernInput
                    type="text"
                    dir="ltr"
                    value={confirmPhrase}
                    onChange={(e) => setConfirmPhrase(e.target.value)}
                    placeholder={t('confirmPhrasePlaceholder')}
                  />
                  <ModernSelect
                    value={secondaryApproverId}
                    onChange={(val) => setSecondaryApproverId(val)}
                    options={actors.map((a) => ({
                      value: a.actorId,
                      label: `${t('secondApproverPrefix')} ${labelActor(a.actorId, a.role)}`,
                    }))}
                  />
                </div>
              </div>
            )}

            <div className="flex items-end gap-2.5">
              <div className="flex-1">
                <ModernInput
                  label={t('reasonLabel')}
                  type="text"
                  value={modeReason}
                  onChange={(e) => setModeReason(e.target.value)}
                />
              </div>
              <ModernButton
                variant="warning"
                size="sm"
                onClick={() =>
                  onChangeActuationMode({
                    actuationMode: targetMode,
                    reason: modeReason,
                    confirmPhrase: confirmPhrase || undefined,
                    secondaryApproverId: secondaryApproverId || undefined,
                  })
                }
              >
                {t('applyMode')}
              </ModernButton>
            </div>
          </div>
        )}

        {/* SECTION 2: FEATURE FLAGS */}
        {section === 'flags' && (
          <div className="space-y-3">
            <div className="pb-2 border-b border-slate-200/75 dark:border-slate-800/75">
              <h4 className="font-semibold text-slate-900 dark:text-slate-100">
                {t('featureFlagsTitle')}
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">{t('cpFlagsDesc')}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {(Object.keys(flags) as Array<keyof TwinFeatureFlags>).map((fk) => (
                <ModernSwitch
                  key={fk}
                  checked={Boolean(flags[fk])}
                  onChange={(next) => onPatchFlags({ [fk]: next }, `Toggle ${fk}`)}
                  label={labelFlag(fk)}
                  title={fk}
                />
              ))}
            </div>
          </div>
        )}

        {/* SECTION 3: DISPATCH SCORING & TRAFFIC POLICIES */}
        {section === 'dispatch' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200/75 dark:border-slate-800/75">
              <div>
                <h4 className="font-semibold text-slate-900 dark:text-slate-100">
                  {t('dispatchScoringTraffic')}
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {t('cpDispatchDesc')}
                </p>
              </div>
              <ModernButton variant="primary" size="xs" onClick={applyDispatchScoring}>
                {t('saveDispatch')}
              </ModernButton>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              <ModernInput
                label={t('wDistance')}
                type="number"
                step="0.1"
                value={wDist}
                onChange={(e) => setWDist(Number(e.target.value))}
              />
              <ModernInput
                label={t('wBattery')}
                type="number"
                step="0.1"
                value={wBat}
                onChange={(e) => setWBat(Number(e.target.value))}
              />
              <ModernInput
                label={t('wWorkload')}
                type="number"
                step="1"
                value={wWork}
                onChange={(e) => setWWork(Number(e.target.value))}
              />
              <ModernInput
                label={t('wCapabilityFit')}
                type="number"
                step="1"
                value={wCap}
                onChange={(e) => setWCap(Number(e.target.value))}
              />
              <ModernInput
                label={t('minBatteryPct')}
                type="number"
                unit="٪"
                value={minBat}
                onChange={(e) => setMinBat(Number(e.target.value))}
              />
              <ModernInput
                label={t('maxQueueDepth')}
                type="number"
                value={maxQueue}
                onChange={(e) => setMaxQueue(Number(e.target.value))}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              <div className="space-y-1">
                <span className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                  {t('intersectionPolicy')}
                </span>
                <ModernSelect
                  value={config.traffic.intersectionPolicy}
                  onChange={(val) => onPatchConfig({ traffic: { intersectionPolicy: val } })}
                  options={[
                    { value: 'wait', label: labelIntersectionPolicy('wait') },
                    { value: 'yield', label: labelIntersectionPolicy('yield') },
                    { value: 'replan', label: labelIntersectionPolicy('replan') },
                  ]}
                />
              </div>
              <div className="space-y-1">
                <span className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                  {t('deadlockPolicy')}
                </span>
                <ModernSelect
                  value={config.traffic.deadlockResolvePolicy}
                  onChange={(val) => onPatchConfig({ traffic: { deadlockResolvePolicy: val } })}
                  options={[
                    {
                      value: 'replan_lowest_priority',
                      label: labelDeadlockPolicy('replan_lowest_priority'),
                    },
                    {
                      value: 'pause_all_and_alert',
                      label: labelDeadlockPolicy('pause_all_and_alert'),
                    },
                    { value: 'fail_mission', label: labelDeadlockPolicy('fail_mission') },
                  ]}
                />
              </div>
            </div>
          </div>
        )}

        {/* SECTION 4: ROUTING COSTS & MISSION GUARDRAILS */}
        {section === 'routing' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200/75 dark:border-slate-800/75">
              <div>
                <h4 className="font-semibold text-slate-900 dark:text-slate-100">
                  {t('routingCostsLimits')}
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {t('cpRoutingDesc')}
                </p>
              </div>
              <ModernButton variant="primary" size="xs" onClick={applyRoutingAndMission}>
                {t('saveRouting')}
              </ModernButton>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              <ModernInput
                label={t('costDistance')}
                type="number"
                step="0.1"
                value={costDist}
                onChange={(e) => setCostDist(Number(e.target.value))}
              />
              <ModernInput
                label={t('costTurn')}
                type="number"
                step="0.1"
                value={costTurn}
                onChange={(e) => setCostTurn(Number(e.target.value))}
              />
              <ModernInput
                label={t('costCongestion')}
                type="number"
                step="0.1"
                value={costCong}
                onChange={(e) => setCostCong(Number(e.target.value))}
              />
              <ModernInput
                label={t('maxExpandNodes')}
                type="number"
                value={maxExpand}
                onChange={(e) => setMaxExpand(Number(e.target.value))}
              />
              <ModernInput
                label={t('maxReplans')}
                type="number"
                value={maxReplans}
                onChange={(e) => setMaxReplans(Number(e.target.value))}
              />
              <ModernInput
                label={t('deviationThresh')}
                type="number"
                step="0.1"
                unit={lang === 'fa' ? 'متر' : 'm'}
                value={devThresh}
                onChange={(e) => setDevThresh(Number(e.target.value))}
              />
            </div>

            <div className="space-y-1 pt-1">
              <span className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                {t('defaultCostProfile')}
              </span>
              <ModernSegmented<CostProfile>
                value={config.routing.defaultCostProfile}
                onChange={(val) => onPatchConfig({ routing: { defaultCostProfile: val } })}
                className="w-full"
                options={[
                  { value: 'fastest', label: labelCostProfile('fastest') },
                  { value: 'safest', label: labelCostProfile('safest') },
                  { value: 'shortest', label: labelCostProfile('shortest') },
                ]}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
