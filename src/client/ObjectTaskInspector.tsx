import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ClipboardList,
  Crosshair,
  Loader2,
  Play,
  Plus,
  Route,
  Wrench,
  X,
} from 'lucide-react';
import {
  CostProfile,
  MachineRunState,
  ObjectTask,
  ObjectTaskCategory,
  ObjectTaskPriority,
  ObjectTaskStatus,
  QaStatus,
  TwinFullSnapshot,
} from '../shared/p2-contracts';
import { SelectedEntityRef } from './ThreeTwinViewport';
import { useI18n } from './i18n';
import {
  ModernButton,
  ModernCheckbox,
  ModernInput,
  ModernSegmented,
  ModernSelect,
} from './ui/ModernControls';

interface Props {
  selected: SelectedEntityRef;
  snapshot: TwinFullSnapshot;
  onClose: () => void;
  onFocusPose: (x: number, z: number, distance?: number) => void;
  onSelect: (sel: SelectedEntityRef | null) => void;
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
    overrideMission: (
      missionId: string,
      action: 'pause' | 'resume' | 'replan' | 'reassign',
      body?: Record<string, unknown>
    ) => Promise<unknown>;
    cancelMission: (missionId: string) => Promise<unknown>;
    controlVehicle: (
      vehicleId: string,
      action: 'pause' | 'resume' | 'estop' | 'estop/ack' | 'stale-on' | 'stale-off',
      reason?: string
    ) => Promise<unknown>;
    setPalletQa: (palletId: string, qaStatus: QaStatus) => Promise<unknown>;
    dispatchBom: (bomId: string) => Promise<unknown>;
    setMachineState: (assetId: string, state: MachineRunState) => Promise<unknown>;
    toggleMaintenance: (windowId: string, active: boolean) => Promise<unknown>;
    createMaintenanceWindow: (payload: {
      assetId: string;
      type: 'PM' | 'calibration' | 'production_run';
      title: string;
      active: boolean;
      blocksDispatch: boolean;
    }) => Promise<{ ok: boolean }>;
    createTask: (payload: {
      targetKind: 'vehicle' | 'location' | 'asset' | 'pallet';
      targetId: string;
      title: string;
      titleFa?: string;
      category: ObjectTaskCategory;
      priority: ObjectTaskPriority;
      notes?: string;
      startImmediately?: boolean;
    }) => Promise<{ ok: boolean }>;
    updateTaskStatus: (taskId: string, status: ObjectTaskStatus) => Promise<unknown>;
  };
}

interface PresetDef {
  en: string;
  fa: string;
  category: ObjectTaskCategory;
  priority: ObjectTaskPriority;
}

const PRESETS_BY_KIND: Record<'vehicle' | 'location' | 'asset' | 'pallet', PresetDef[]> = {
  vehicle: [
    {
      fa: 'ضدعفونی IPA اتاق تمیز پیش از ورود به کلاس ب',
      en: 'Cleanroom IPA wipe-down before Grade B entry',
      category: 'sanitation',
      priority: 'high',
    },
    {
      fa: 'اعزام به ایستگاه شارژ و بررسی سلامت باتری',
      en: 'Send to charging bay & battery health check',
      category: 'charging',
      priority: 'medium',
    },
    {
      fa: 'کالیبراسیون سنسورهای ایمنی LiDAR و انکودر چرخ',
      en: 'LiDAR safety curtain & encoder calibration',
      category: 'inspection',
      priority: 'high',
    },
  ],
  location: [
    {
      fa: 'شمارش دوره‌ای موجودی و تطبیق بارکد GS1',
      en: 'Cycle count & GS1 SSCC barcode verification',
      category: 'cycle_count',
      priority: 'medium',
    },
    {
      fa: 'نمونه‌برداری کنترل کیفیت (QA) از محموله جایگاه',
      en: 'Pull QA composite sample from bay stock',
      category: 'qa_sampling',
      priority: 'high',
    },
    {
      fa: 'پاک‌سازی و ضدعفونی سطحی محدوده GMP',
      en: 'GMP bay surface sanitization & line clearance',
      category: 'sanitation',
      priority: 'medium',
    },
  ],
  asset: [
    {
      fa: 'تست یکپارچگی فیلتر HEPA و اختلاف فشار',
      en: 'Verify HEPA integrity & differential pressure',
      category: 'inspection',
      priority: 'critical',
    },
    {
      fa: 'نمونه‌گیری حین فرآیند تولید (IPC)',
      en: 'In-process quality control sampling (IPC)',
      category: 'qa_sampling',
      priority: 'high',
    },
    {
      fa: 'شستشو و استریل‌سازی CIP / SIP پیش از بچ جدید',
      en: 'CIP / SIP washdown before next batch',
      category: 'sanitation',
      priority: 'high',
    },
  ],
  pallet: [
    {
      fa: 'نمونه‌برداری آزمایشگاهی برای آزادسازی QA',
      en: 'Lab sampling for QA batch release',
      category: 'qa_sampling',
      priority: 'critical',
    },
    {
      fa: 'بازبینی برچسب SSCC، شماره بچ و تاریخ انقضا',
      en: 'Verify SSCC label, lot & expiry seal',
      category: 'inspection',
      priority: 'medium',
    },
    {
      fa: 'آماده‌سازی پالت جهت تحویل به خط تولید',
      en: 'Prep & outer-wrap sanitize for line handoff',
      category: 'material_prep',
      priority: 'high',
    },
  ],
};

export const ObjectTaskInspector: React.FC<Props> = ({
  selected,
  snapshot,
  onClose,
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
    labelVehicleStatus,
    labelGrade,
    labelZone,
    labelLocationCode,
    labelLocationName,
    labelPalletCode,
    labelPalletName,
    labelQaStatus,
    labelAttachmentState,
    labelAssetName,
    labelAssetCode,
    labelMachineState,
    labelCalibrationStatus,
    labelMissionState,
    labelBom,
    labelMaintenance,
    labelFlowKind,
    labelFlowStatus,
    labelHandoffState,
    labelTaskCategory,
    labelTaskPriority,
    labelTaskStatus,
    labelCostProfile,
    labelActorIdOnly,
  } = useI18n();

  const [tab, setTab] = useState<'related' | 'create'>('related');
  const [createMode, setCreateMode] = useState<'operational' | 'move' | 'mes'>('operational');

  // Operational Task form
  const [taskTitle, setTaskTitle] = useState('');
  const [taskCategory, setTaskCategory] = useState<ObjectTaskCategory>('inspection');
  const [taskPriority, setTaskPriority] = useState<ObjectTaskPriority>('high');
  const [taskNotes, setTaskNotes] = useState('');
  const [startImmediately, setStartImmediately] = useState(true);

  // Move Mission form
  const [moveDir, setMoveDir] = useState<'from' | 'to'>('from');
  const [moveCounterpartId, setMoveCounterpartId] = useState('LOC-STAGE-OUT-01');
  const [moveOriginId, setMoveOriginId] = useState('LOC-DOCK-IN-01');
  const [moveDestId, setMoveDestId] = useState('LOC-BIN-A2-01');
  const [moveVehicleId, setMoveVehicleId] = useState('');
  const [moveCostProfile, setMoveCostProfile] = useState<CostProfile>('fastest');
  const [moveLoadId, setMoveLoadId] = useState('');

  // MES Window form
  const [mesType, setMesType] = useState<'PM' | 'calibration' | 'production_run'>('PM');
  const [mesTitle, setMesTitle] = useState('');
  const [mesActive, setMesActive] = useState(true);
  const [mesBlocks, setMesBlocks] = useState(true);

  const [submitting, setSubmitting] = useState(false);

  // Resolve target entity
  const vehicle =
    selected.kind === 'vehicle'
      ? snapshot.vehicles.find((v) => v.id === selected.id)
      : undefined;
  const location =
    selected.kind === 'location'
      ? snapshot.world.locations.find((l) => l.id === selected.id)
      : undefined;
  const asset =
    selected.kind === 'asset'
      ? snapshot.mes.assets.find((a) => a.id === selected.id)
      : undefined;
  const pallet =
    selected.kind === 'pallet'
      ? snapshot.wms.pallets.find((p) => p.id === selected.id)
      : undefined;

  // Reset form defaults cleanly when selection changes
  useEffect(() => {
    setCreateMode('operational');
    setTaskTitle('');
    setTaskNotes('');
    setStartImmediately(true);

    const presets = PRESETS_BY_KIND[selected.kind];
    if (presets?.[0]) {
      setTaskCategory(presets[0].category);
      setTaskPriority(presets[0].priority);
    }

    if (selected.kind === 'vehicle') {
      setMoveVehicleId(selected.id);
      setMoveOriginId('LOC-DOCK-IN-01');
      setMoveDestId('LOC-BIN-A2-01');
      setMoveLoadId('');
    } else if (selected.kind === 'location') {
      setMoveVehicleId('');
      setMoveDir('from');
      setMoveCounterpartId(
        selected.id === 'LOC-STAGE-OUT-01' ? 'LOC-DOCK-OUT-01' : 'LOC-STAGE-OUT-01'
      );
      const palHere = snapshot.wms.pallets.find(
        (p) => p.locationId === selected.id && !p.inTransitVehicleId
      );
      setMoveLoadId(palHere?.id || '');
    } else if (selected.kind === 'asset') {
      const a = snapshot.mes.assets.find((item) => item.id === selected.id);
      setMoveVehicleId('VEH-AMR-01');
      setMoveDir('to');
      setMoveCounterpartId('LOC-BIN-A1-01');
      setMoveDestId(a?.locationId || 'LOC-BUF-IN-01');
      setMoveLoadId('');
      setMesTitle('');
      setMesType('PM');
      setMesActive(true);
      setMesBlocks(true);
    } else if (selected.kind === 'pallet') {
      const p = snapshot.wms.pallets.find((item) => item.id === selected.id);
      setMoveVehicleId('');
      setMoveOriginId(p?.locationId || 'LOC-BIN-A1-01');
      setMoveDestId('LOC-STAGE-OUT-01');
      setMoveLoadId(selected.id);
    }
  }, [selected.kind, selected.id]);

  // Collect all related items for the clicked object
  const related = useMemo(() => {
    const locIdForAsset = asset?.locationId;

    // 1. Missions
    const missions = snapshot.missions.filter((m) => {
      if (selected.kind === 'vehicle') return m.vehicleId === selected.id;
      if (selected.kind === 'location')
        return m.originLocationId === selected.id || m.destinationLocationId === selected.id;
      if (selected.kind === 'asset')
        return (
          Boolean(locIdForAsset) &&
          (m.originLocationId === locIdForAsset || m.destinationLocationId === locIdForAsset)
        );
      if (selected.kind === 'pallet') return m.loadId === selected.id;
      return false;
    });

    // 2. ObjectTasks
    const palletsAtLoc =
      selected.kind === 'location'
        ? snapshot.wms.pallets
            .filter((p) => p.locationId === selected.id && !p.inTransitVehicleId)
            .map((p) => p.id)
        : [];

    const tasks: ObjectTask[] = (snapshot.tasks ?? []).filter((tk) => {
      if (tk.targetKind === selected.kind && tk.targetId === selected.id) return true;
      if (selected.kind === 'location' && tk.targetKind === 'pallet' && palletsAtLoc.includes(tk.targetId))
        return true;
      if (selected.kind === 'asset' && locIdForAsset && tk.targetKind === 'location' && tk.targetId === locIdForAsset)
        return true;
      return false;
    });

    // 3. BOM Demands
    const boms = snapshot.mes.bomDemands.filter((b) => {
      if (selected.kind === 'location')
        return b.sourceBinLocationId === selected.id || b.targetBufferLocationId === selected.id;
      if (selected.kind === 'asset')
        return (
          b.targetLineId === asset?.lineId ||
          b.targetBufferLocationId === locIdForAsset ||
          b.sourceBinLocationId === locIdForAsset
        );
      if (selected.kind === 'pallet') {
        const gtins = pallet?.cartons.map((c) => c.gtin) ?? [];
        const lots = pallet?.cartons.map((c) => c.lot) ?? [];
        return gtins.includes(b.requiredGtin) && lots.includes(b.requiredLot);
      }
      if (selected.kind === 'vehicle') {
        return Boolean(b.linkedMissionId && missions.some((m) => m.id === b.linkedMissionId));
      }
      return false;
    });

    // 4. Maintenance windows
    const maintenanceWindows = snapshot.mes.maintenanceWindows.filter((w) => {
      if (selected.kind === 'asset') return w.assetId === selected.id;
      if (selected.kind === 'location') return w.locationId === selected.id;
      return false;
    });

    // 5. Material flows
    const flows = snapshot.wms.flows.filter((f) => {
      if (selected.kind === 'location')
        return f.fromLocationId === selected.id || f.toLocationId === selected.id;
      if (selected.kind === 'pallet') return f.palletId === selected.id;
      return false;
    });

    const totalCount =
      missions.length + tasks.length + boms.length + maintenanceWindows.length + flows.length;

    return { missions, tasks, boms, maintenanceWindows, flows, totalCount };
  }, [selected, snapshot, asset, pallet]);

  if (!vehicle && !location && !asset && !pallet) return null;

  const targetPose = vehicle
    ? vehicle.pose
    : location
      ? location.pose
      : asset
        ? asset.pose
        : snapshot.world.locations.find((l) => l.id === pallet?.locationId)?.pose;

  const palletsAtLocation = location
    ? snapshot.wms.pallets.filter((p) => p.locationId === location.id && !p.inTransitVehicleId)
    : [];
  const occAtLocation = location
    ? snapshot.wms.occupancy.find((o) => o.locationId === location.id)
    : undefined;

  const handleCreateOperationalTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim()) return;
    setSubmitting(true);
    const res = await actions.createTask({
      targetKind: selected.kind,
      targetId: selected.id,
      title: taskTitle.trim(),
      titleFa: lang === 'fa' ? taskTitle.trim() : undefined,
      category: taskCategory,
      priority: taskPriority,
      notes: taskNotes.trim() || undefined,
      startImmediately,
    });
    setSubmitting(false);
    if (res.ok) {
      setTaskTitle('');
      setTaskNotes('');
      setTab('related');
    }
  };

  const handleDispatchMove = async (e: React.FormEvent) => {
    e.preventDefault();
    let originId = moveOriginId;
    let destinationId = moveDestId;

    if (selected.kind === 'location') {
      originId = moveDir === 'from' ? selected.id : moveCounterpartId;
      destinationId = moveDir === 'from' ? moveCounterpartId : selected.id;
    } else if (selected.kind === 'asset' && asset) {
      originId = moveDir === 'to' ? moveCounterpartId : asset.locationId;
      destinationId = moveDir === 'to' ? asset.locationId : moveCounterpartId;
    } else if (selected.kind === 'pallet' && pallet) {
      originId = pallet.locationId;
      destinationId = moveDestId;
    }

    setSubmitting(true);
    await actions.submitMove({
      idempotencyKey: `obj-${selected.id}-${Date.now()}`,
      originId,
      destinationId,
      vehicleId: moveVehicleId || undefined,
      costProfile: moveCostProfile,
      loadId: moveLoadId || undefined,
    });
    setSubmitting(false);
    setTab('related');
  };

  const handleCreateMesWindow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!asset || !mesTitle.trim()) return;
    setSubmitting(true);
    const res = await actions.createMaintenanceWindow({
      assetId: asset.id,
      type: mesType,
      title: mesTitle.trim(),
      active: mesActive,
      blocksDispatch: mesBlocks,
    });
    setSubmitting(false);
    if (res.ok) {
      setMesTitle('');
      setTab('related');
    }
  };

  const priorityBadgeClass = (prio: string) => {
    if (prio === 'critical')
      return 'bg-red-100 text-red-700 dark:bg-red-950/70 dark:text-red-300 border-red-300 dark:border-red-800';
    if (prio === 'high')
      return 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border-amber-300 dark:border-amber-800';
    return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-700';
  };

  const statusBadgeClass = (st: string) => {
    if (st === 'completed' || st === 'handed_off')
      return 'text-emerald-700 dark:text-emerald-300';
    if (st === 'in_progress' || st === 'executing' || st === 'in_transit')
      return 'text-sky-700 dark:text-sky-300';
    if (st === 'cancelled' || st === 'failed' || st === 'blocked_qa')
      return 'text-red-600 dark:text-red-400';
    return 'text-amber-700 dark:text-amber-300';
  };

  const presets = PRESETS_BY_KIND[selected.kind];

  return (
    <div className="pointer-events-auto w-[372px] max-w-[calc(100vw-2.5rem)] max-h-[54vh] flex flex-col bg-white/[0.97] dark:bg-[#0B1220]/[0.97] border border-slate-200/90 dark:border-slate-800/90 rounded-xl shadow-[0_18px_40px_-12px_rgba(15,23,42,0.22)] dark:shadow-[0_22px_48px_-12px_rgba(2,6,23,0.8)] overflow-hidden text-xs transition-all duration-150">
      {/* Header */}
      <div className="p-3 border-b border-slate-200/80 dark:border-slate-800/80 bg-slate-50/90 dark:bg-slate-900/75 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-mono-tabular text-sky-700 dark:text-sky-400 font-semibold">
            {t('selectedPrefix')}{' '}
            {selected.kind === 'vehicle'
              ? t('selectedVehicle')
              : selected.kind === 'location'
                ? t('selectedLocation')
                : selected.kind === 'asset'
                  ? t('selectedAsset')
                  : t('selectedPallet')}
          </span>
          <div className="flex items-center gap-1.5">
            {targetPose && (
              <button
                type="button"
                onClick={() => onFocusPose(targetPose.x, targetPose.z, 11)}
                title={t('focusCamTitle')}
                aria-label={t('focusCamTitle')}
                className="p-1 rounded text-slate-500 hover:text-sky-600 dark:text-slate-400 dark:hover:text-sky-400 hover:bg-slate-200/70 dark:hover:bg-slate-800"
              >
                <Crosshair className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label={t('closeInspector')}
              className="p-1 rounded text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-800"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Entity Summary */}
        {vehicle && (
          <div className="space-y-1">
            <div className="font-semibold text-sm text-slate-900 dark:text-white">
              {labelVehicle(vehicle.id, vehicle.name)}
            </div>
            <div className="text-slate-600 dark:text-slate-400 font-mono-tabular">
              {labelVehicleStatus(vehicle.status, vehicle.eStopActive, vehicle.isStale)} ·{' '}
              {t('batteryShort')} {num(vehicle.batteryPct.toFixed(0))}٪ ·{' '}
              {num(vehicle.velocityMps.toFixed(1))} {lang === 'fa' ? 'متر/ثانیه' : 'm/s'}
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {vehicle.status === 'paused' ? (
                <button
                  type="button"
                  onClick={() => actions.controlVehicle(vehicle.id, 'resume')}
                  className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[11px]"
                >
                  {t('resumeBtn')}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => actions.controlVehicle(vehicle.id, 'pause')}
                  className="px-2 py-0.5 bg-amber-600 hover:bg-amber-500 text-white rounded text-[11px]"
                >
                  {t('pauseBtn')}
                </button>
              )}
              {vehicle.eStopActive ? (
                <button
                  type="button"
                  onClick={() => actions.controlVehicle(vehicle.id, 'estop/ack')}
                  className="px-2 py-0.5 bg-sky-600 hover:bg-sky-500 text-white rounded text-[11px]"
                >
                  {t('ackEstop')}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => actions.controlVehicle(vehicle.id, 'estop', 'Inspector E-Stop')}
                  className="px-2 py-0.5 bg-red-600 hover:bg-red-500 text-white rounded text-[11px]"
                >
                  {t('eStopBtn')}
                </button>
              )}
            </div>
            {vehicle.attachment && (
              <div className="text-sky-700 dark:text-sky-300 font-mono-tabular pt-0.5">
                {t('carryingLabel')}: {labelPalletCode(vehicle.attachment.loadId)} (
                {labelAttachmentState(vehicle.attachment.state)})
              </div>
            )}
          </div>
        )}

        {location && (
          <div className="space-y-1">
            <div className="font-semibold text-sm text-slate-900 dark:text-white">
              {labelLocationCode(location.code)} · {labelLocationName(location.code, location.name)}
            </div>
            <div className="text-slate-600 dark:text-slate-400 font-mono-tabular">
              {labelZone(location.zoneId)} · {labelGrade(location.cleanlinessGrade)}
              {occAtLocation ? ` · ${num(occAtLocation.utilizationPct)}٪ ${t('utilizedLabel')}` : ''}
            </div>
            {palletsAtLocation.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-2 pt-1 text-[11px]"
              >
                <button
                  type="button"
                  onClick={() => onSelect({ kind: 'pallet', id: p.id })}
                  className="text-sky-700 dark:text-sky-300 hover:underline font-medium text-start truncate"
                >
                  {labelPalletCode(p.id)}: {labelPalletName(p.id, p.label)} (
                  {labelQaStatus(p.qaStatus)})
                </button>
                <button
                  type="button"
                  onClick={() =>
                    actions.setPalletQa(
                      p.id,
                      p.qaStatus === 'quarantine' ? 'released' : 'quarantine'
                    )
                  }
                  className="px-1.5 py-0.5 rounded bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 shrink-0"
                >
                  {p.qaStatus === 'quarantine' ? t('quickReleaseBtn') : t('quickQuarantineBtn')}
                </button>
              </div>
            ))}
          </div>
        )}

        {asset && (
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <div className="font-semibold text-sm text-slate-900 dark:text-white">
                {labelAssetName(asset.id, asset.name)}
              </div>
              {(related.tasks.some((tk) => tk.status === 'in_progress') ||
                related.maintenanceWindows.some((w) => w.active)) && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 shrink-0">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>{t('activeProcessBadge')}</span>
                </span>
              )}
            </div>
            <div className="text-slate-600 dark:text-slate-400 font-mono-tabular">
              {labelAssetCode(asset.id)} · {labelGrade(asset.cleanlinessGrade)} ·{' '}
              {labelMachineState(asset.machineState)} · {lang === 'fa' ? 'بهره‌وری' : 'OEE'}{' '}
              {num((asset.oee.overall * 100).toFixed(0))}٪
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              {t('calLabel')}: {labelCalibrationStatus(asset.calibrationStatus)}
            </div>
            <div className="flex flex-wrap gap-1 pt-1">
              {(['run', 'idle', 'maintenance'] as MachineRunState[]).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => actions.setMachineState(asset.id, st)}
                  className={`px-2 py-0.5 rounded text-[11px] border ${
                    asset.machineState === st
                      ? 'bg-sky-600 text-white border-sky-600'
                      : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {labelMachineState(st)}
                </button>
              ))}
            </div>
          </div>
        )}

        {pallet && (
          <div className="space-y-1">
            <div className="font-semibold text-sm text-slate-900 dark:text-white">
              {labelPalletCode(pallet.id)} · {labelPalletName(pallet.id, pallet.label)}
            </div>
            <div className="text-slate-600 dark:text-slate-400 font-mono-tabular">
              {t('ssccLabel')}: {num(pallet.sscc)} · {labelLocationCode(pallet.binCode)} ·{' '}
              {labelQaStatus(pallet.qaStatus)}
            </div>
            <div className="flex gap-1.5 pt-1">
              <button
                type="button"
                onClick={() =>
                  actions.setPalletQa(
                    pallet.id,
                    pallet.qaStatus === 'quarantine' ? 'released' : 'quarantine'
                  )
                }
                className="px-2 py-0.5 rounded bg-sky-600 hover:bg-sky-500 text-white text-[11px]"
              >
                {pallet.qaStatus === 'quarantine' ? t('quickReleaseBtn') : t('quickQuarantineBtn')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Sub-tabs: Related Tasks vs Define New Task */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-900/60">
        <button
          type="button"
          onClick={() => setTab('related')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 font-medium transition-colors border-b-2 ${
            tab === 'related'
              ? 'border-sky-600 text-sky-700 dark:text-sky-300 bg-white dark:bg-slate-950'
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <ClipboardList className="w-3.5 h-3.5" />
          <span>
            {t('tabRelatedTasks')} ({num(related.totalCount)})
          </span>
        </button>
        <button
          type="button"
          onClick={() => setTab('create')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 font-medium transition-colors border-b-2 ${
            tab === 'create'
              ? 'border-sky-600 text-sky-700 dark:text-sky-300 bg-white dark:bg-slate-950'
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Plus className="w-3.5 h-3.5" />
          <span>{t('tabNewTask')}</span>
        </button>
      </div>

      {/* Scrollable Body */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {tab === 'related' && (
          <>
            {related.totalCount === 0 && (
              <div className="py-5 text-center space-y-2.5 text-slate-500 dark:text-slate-400">
                <p>{t('noRelatedTasksYet')}</p>
                <button
                  type="button"
                  onClick={() => setTab('create')}
                  className="px-3 py-1.5 rounded-md bg-sky-600 hover:bg-sky-500 text-white font-medium"
                >
                  {t('createFirstTaskCta')}
                </button>
              </div>
            )}

            {/* 1. Object Tasks & SOPs */}
            {related.tasks.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                  {t('relatedProjectTasksTitle')}
                </div>
                {related.tasks.map((tk) => (
                  <div
                    key={tk.id}
                    className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/70 space-y-1"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium text-slate-900 dark:text-slate-100 leading-snug">
                        {lang === 'fa' && tk.titleFa ? tk.titleFa : tk.title}
                      </span>
                      <span
                        className={`shrink-0 px-1.5 py-0.5 text-[10px] rounded border ${priorityBadgeClass(
                          tk.priority
                        )}`}
                      >
                        {labelTaskPriority(tk.priority)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                      <span>
                        {labelTaskCategory(tk.category)} ·{' '}
                        <span className={`font-medium ${statusBadgeClass(tk.status)}`}>
                          {labelTaskStatus(tk.status)}
                        </span>
                      </span>
                      <span className="font-mono-tabular">
                        {labelActorIdOnly(tk.createdBy)}
                      </span>
                    </div>
                    {tk.notes && (
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {lang === 'fa' ? num(tk.notes) : tk.notes}
                      </div>
                    )}
                    {tk.status !== 'completed' && tk.status !== 'cancelled' && (
                      <div className="flex items-center gap-1.5 pt-1">
                        {tk.status === 'pending' && (
                          <button
                            type="button"
                            onClick={() => actions.updateTaskStatus(tk.id, 'in_progress')}
                            className="flex items-center gap-1 px-2 py-0.5 rounded bg-sky-600 hover:bg-sky-500 text-white text-[11px]"
                          >
                            <Play className="w-2.5 h-2.5" />
                            <span>{t('startTaskBtn')}</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => actions.updateTaskStatus(tk.id, 'completed')}
                          className="flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[11px]"
                        >
                          <CheckCircle2 className="w-2.5 h-2.5" />
                          <span>{t('completeTaskBtn')}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => actions.updateTaskStatus(tk.id, 'cancelled')}
                          className="px-2 py-0.5 rounded bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-[11px]"
                        >
                          {t('cancelTaskBtn')}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* 2. Missions */}
            {related.missions.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                  {t('relatedMissionsTitle')}
                </div>
                {related.missions.map((m) => (
                  <div
                    key={m.id}
                    className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/70 space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono-tabular font-medium text-slate-900 dark:text-white">
                        {formatId(m.id)}
                      </span>
                      <span className={`text-[11px] font-medium ${statusBadgeClass(m.state)}`}>
                        {labelMissionState(m.state)}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-600 dark:text-slate-300">
                      {labelLocationCode(m.originCode)} {lang === 'fa' ? '←' : '→'} {labelLocationCode(m.destinationCode)}
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                      <span>{m.vehicleId ? labelVehicle(m.vehicleId) : t('unassigned')}</span>
                      <span>
                        {m.route ? `${num(m.route.totalDistanceM)} ${lang === 'fa' ? 'متر' : 'm'}` : ''}
                      </span>
                    </div>
                    {(m.state === 'executing' || m.state === 'paused' || m.state === 'planned') && (
                      <div className="flex gap-1.5 pt-1">
                        {m.state === 'executing' ? (
                          <button
                            type="button"
                            onClick={() => actions.overrideMission(m.id, 'pause')}
                            className="px-2 py-0.5 rounded bg-amber-600 hover:bg-amber-500 text-white text-[11px]"
                          >
                            {t('pauseBtn')}
                          </button>
                        ) : m.state === 'paused' ? (
                          <button
                            type="button"
                            onClick={() => actions.overrideMission(m.id, 'resume')}
                            className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[11px]"
                          >
                            {t('resumeBtn')}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => actions.cancelMission(m.id)}
                          className="px-2 py-0.5 rounded bg-red-600 hover:bg-red-500 text-white text-[11px]"
                        >
                          {t('safeStopBtn')}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* 3. MES Maintenance & Calibration Windows */}
            {related.maintenanceWindows.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                  {t('relatedMaintenanceTitle')}
                </div>
                {related.maintenanceWindows.map((mw) => (
                  <div
                    key={mw.id}
                    className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/70 space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-slate-900 dark:text-white">
                        {labelMaintenance(mw.id) === mw.id ? mw.title : labelMaintenance(mw.id)}
                      </span>
                      <span
                        className={`text-[11px] font-medium ${
                          mw.active
                            ? 'text-amber-600 dark:text-amber-300'
                            : 'text-emerald-600 dark:text-emerald-400'
                        }`}
                      >
                        {mw.active ? t('activeBlocksDispatch') : t('clearedLabel')}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => actions.toggleMaintenance(mw.id, !mw.active)}
                      className="px-2 py-0.5 rounded bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-[11px]"
                    >
                      {mw.active ? t('clearBtn') : t('activateBtn')}
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* 4. BOM Demands */}
            {related.boms.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                  {t('relatedBomTitle')}
                </div>
                {related.boms.map((b) => {
                  const lbl = labelBom(b.id, b.workOrderId, b.productName);
                  return (
                    <div
                      key={b.id}
                      className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/70 flex items-center justify-between gap-2"
                    >
                      <div>
                        <div className="font-medium text-slate-900 dark:text-white">
                          {lbl.title}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {labelLocationCode(b.sourceBinLocationId)} {lang === 'fa' ? '←' : '→'}{' '}
                          {labelLocationCode(b.targetBufferLocationId)} ·{' '}
                          {labelHandoffState(b.handoffState)}
                        </div>
                      </div>
                      {b.handoffState === 'pending' && (
                        <button
                          type="button"
                          onClick={() => actions.dispatchBom(b.id)}
                          className="px-2 py-1 rounded bg-sky-600 hover:bg-sky-500 text-white text-[11px] shrink-0"
                        >
                          {t('dispatchHandoff')}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* 5. Material Flows */}
            {related.flows.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                  {t('relatedFlowsTitle')}
                </div>
                {related.flows.map((f) => (
                  <div
                    key={f.id}
                    className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/70 flex items-center justify-between gap-2 text-[11px]"
                  >
                    <div>
                      <div className="font-medium text-slate-900 dark:text-slate-100">
                        {labelFlowKind(f.kind)} ({labelPalletCode(f.palletId)})
                      </div>
                      <div className="text-slate-500 dark:text-slate-400">
                        {labelLocationCode(f.fromLocationId)} {lang === 'fa' ? '←' : '→'}{' '}
                        {labelLocationCode(f.toLocationId)}
                      </div>
                    </div>
                    <span className={`font-medium ${statusBadgeClass(f.status)}`}>
                      {labelFlowStatus(f.status)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'create' && (
          <div className="space-y-3">
            {/* Mode Switcher */}
            <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setCreateMode('operational')}
                className={`flex items-center justify-center gap-1 py-1.5 rounded text-[11px] font-medium transition-colors ${
                  createMode === 'operational'
                    ? 'bg-white dark:bg-slate-800 text-sky-700 dark:text-sky-300 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                <ClipboardList className="w-3 h-3" />
                <span>{t('taskModeOperational')}</span>
              </button>
              <button
                type="button"
                onClick={() => setCreateMode('move')}
                className={`flex items-center justify-center gap-1 py-1.5 rounded text-[11px] font-medium transition-colors ${
                  createMode === 'move'
                    ? 'bg-white dark:bg-slate-800 text-sky-700 dark:text-sky-300 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                <Route className="w-3 h-3" />
                <span>{t('taskModeMove')}</span>
              </button>
              {selected.kind === 'asset' && (
                <button
                  type="button"
                  onClick={() => setCreateMode('mes')}
                  className={`col-span-2 flex items-center justify-center gap-1 py-1.5 rounded text-[11px] font-medium transition-colors ${
                    createMode === 'mes'
                      ? 'bg-white dark:bg-slate-800 text-sky-700 dark:text-sky-300 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <Wrench className="w-3 h-3" />
                  <span>{t('taskModeMesWindow')}</span>
                </button>
              )}
            </div>

            {createMode === 'operational' && (
              <form onSubmit={handleCreateOperationalTask} className="space-y-2.5">
                <div className="space-y-1">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    {t('taskPresetsLabel')}
                  </div>
                  <div className="flex flex-col gap-1">
                    {presets.map((p, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setTaskTitle(lang === 'fa' ? p.fa : p.en);
                          setTaskCategory(p.category);
                          setTaskPriority(p.priority);
                        }}
                        className="text-start px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 hover:bg-sky-50 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px] transition-colors"
                      >
                        + {lang === 'fa' ? p.fa : p.en}
                      </button>
                    ))}
                  </div>
                </div>

                <ModernInput
                  type="text"
                  required
                  label={t('taskTitleLabel')}
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder={t('taskTitlePlaceholder')}
                  className="font-sans"
                />

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                      {t('taskCategoryLabel')}
                    </label>
                    <ModernSelect<ObjectTaskCategory>
                      size="xs"
                      value={taskCategory}
                      onChange={setTaskCategory}
                      options={(
                        [
                          'inspection',
                          'maintenance',
                          'qa_sampling',
                          'sanitation',
                          'cycle_count',
                          'charging',
                          'material_prep',
                        ] as ObjectTaskCategory[]
                      ).map((c) => ({
                        value: c,
                        label: labelTaskCategory(c),
                      }))}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                      {t('taskPriorityLabel')}
                    </label>
                    <ModernSelect<ObjectTaskPriority>
                      size="xs"
                      value={taskPriority}
                      onChange={setTaskPriority}
                      options={(['low', 'medium', 'high', 'critical'] as ObjectTaskPriority[]).map(
                        (pr) => ({
                          value: pr,
                          label: labelTaskPriority(pr),
                        })
                      )}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                    {t('taskNotesLabel')}
                  </label>
                  <textarea
                    rows={2}
                    value={taskNotes}
                    onChange={(e) => setTaskNotes(e.target.value)}
                    placeholder={t('taskNotesPlaceholder')}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200/95 dark:border-slate-700/90 bg-white dark:bg-slate-900/95 text-slate-900 dark:text-white text-xs focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:outline-none"
                  />
                </div>

                <ModernCheckbox
                  checked={startImmediately}
                  onChange={setStartImmediately}
                  label={t('startImmediatelyLabel')}
                />

                <ModernButton
                  type="submit"
                  variant="primary"
                  size="md"
                  disabled={submitting || !taskTitle.trim()}
                  className="w-full"
                >
                  {t('createTaskBtn')}
                </ModernButton>
              </form>
            )}

            {createMode === 'move' && (
              <form onSubmit={handleDispatchMove} className="space-y-2.5">
                {selected.kind === 'vehicle' && (
                  <>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                        {t('origin')}
                      </label>
                      <ModernSelect
                        size="xs"
                        value={moveOriginId}
                        onChange={setMoveOriginId}
                        options={snapshot.world.locations.map((l) => ({
                          value: l.id,
                          label: labelLocationCode(l.code),
                        }))}
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                        {t('destination')}
                      </label>
                      <ModernSelect
                        size="xs"
                        value={moveDestId}
                        onChange={setMoveDestId}
                        options={snapshot.world.locations.map((l) => ({
                          value: l.id,
                          label: labelLocationCode(l.code),
                        }))}
                      />
                    </div>
                  </>
                )}

                {(selected.kind === 'location' || selected.kind === 'asset') && (
                  <>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                        {t('directionLabel')}
                      </label>
                      <ModernSegmented<'from' | 'to'>
                        value={moveDir}
                        onChange={setMoveDir}
                        className="w-full"
                        options={[
                          { value: 'from', label: t('dirSendFromHere') },
                          { value: 'to', label: t('dirBringHere') },
                        ]}
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                        {moveDir === 'from' ? t('destination') : t('origin')}
                      </label>
                      <ModernSelect
                        size="xs"
                        value={moveCounterpartId}
                        onChange={setMoveCounterpartId}
                        options={snapshot.world.locations
                          .filter(
                            (l) =>
                              l.id !==
                              (selected.kind === 'asset' ? asset?.locationId : selected.id)
                          )
                          .map((l) => ({
                            value: l.id,
                            label: labelLocationCode(l.code),
                          }))}
                      />
                    </div>
                  </>
                )}

                {selected.kind === 'pallet' && (
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                      {t('destination')}
                    </label>
                    <ModernSelect
                      size="xs"
                      value={moveDestId}
                      onChange={setMoveDestId}
                      options={snapshot.world.locations
                        .filter((l) => l.id !== pallet?.locationId)
                        .map((l) => ({
                          value: l.id,
                          label: labelLocationCode(l.code),
                        }))}
                    />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  {selected.kind !== 'vehicle' && (
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                        {t('vehicle')}
                      </label>
                      <ModernSelect
                        size="xs"
                        value={moveVehicleId}
                        onChange={setMoveVehicleId}
                        options={[
                          { value: '', label: t('autoAssign') },
                          ...snapshot.vehicles.map((v) => ({
                            value: v.id,
                            label: labelVehicle(v.id),
                          })),
                        ]}
                      />
                    </div>
                  )}

                  <div className={selected.kind === 'vehicle' ? 'col-span-2' : ''}>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                      {t('costProfile')}
                    </label>
                    <ModernSelect<CostProfile>
                      size="xs"
                      value={moveCostProfile}
                      onChange={setMoveCostProfile}
                      options={[
                        { value: 'fastest', label: labelCostProfile('fastest') },
                        { value: 'safest', label: labelCostProfile('safest') },
                        { value: 'shortest', label: labelCostProfile('shortest') },
                      ]}
                    />
                  </div>
                </div>

                {selected.kind !== 'pallet' && (
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                      {t('gs1Load')}
                    </label>
                    <ModernSelect
                      size="xs"
                      value={moveLoadId}
                      onChange={setMoveLoadId}
                      options={[
                        { value: '', label: t('emptyRun') },
                        ...snapshot.wms.pallets.map((p) => ({
                          value: p.id,
                          label: `${labelPalletCode(p.id)} · ${labelPalletName(p.id, p.label)}`,
                        })),
                      ]}
                    />
                  </div>
                )}

                <ModernButton
                  type="submit"
                  variant="primary"
                  size="md"
                  disabled={submitting}
                  className="w-full"
                >
                  {t('dispatchMissionBtn')}
                </ModernButton>
              </form>
            )}

            {createMode === 'mes' && selected.kind === 'asset' && (
              <form onSubmit={handleCreateMesWindow} className="space-y-2.5">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                    {t('mesWindowTypeLabel')}
                  </label>
                  <ModernSelect<'PM' | 'calibration' | 'production_run'>
                    size="xs"
                    value={mesType}
                    onChange={setMesType}
                    options={[
                      { value: 'PM', label: t('mesTypePm') },
                      { value: 'calibration', label: t('mesTypeCal') },
                      { value: 'production_run', label: t('mesTypeRun') },
                    ]}
                  />
                </div>

                <ModernInput
                  label={t('taskTitleLabel')}
                  type="text"
                  required
                  value={mesTitle}
                  onChange={(e) => setMesTitle(e.target.value)}
                  placeholder={
                    lang === 'fa'
                      ? 'مثلاً: کالیبراسیون سنسور فشار تفاضلی'
                      : 'e.g. Differential pressure sensor calibration'
                  }
                />

                <ModernCheckbox
                  checked={mesActive}
                  onChange={setMesActive}
                  label={t('activateImmediatelyLabel')}
                />

                <ModernCheckbox
                  checked={mesBlocks}
                  onChange={setMesBlocks}
                  label={t('blocksDispatchLabel')}
                />

                <ModernButton
                  type="submit"
                  variant="primary"
                  size="md"
                  disabled={submitting || !mesTitle.trim()}
                  className="w-full"
                >
                  {t('createMesWindowBtn')}
                </ModernButton>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
