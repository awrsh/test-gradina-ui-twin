import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, ChevronDown, ChevronUp, Languages, Layers, Moon, Sun, X } from 'lucide-react';
import { useI18n } from './client/i18n';
import { LiveFactoryHud } from './client/LiveFactoryHud';
import { DockTab, OperationsDock } from './client/OperationsDock';
import { ObjectTaskInspector } from './client/ObjectTaskInspector';
import {
  SelectedEntityRef,
  ThreeTwinViewport,
  TwinOverlayMode,
} from './client/ThreeTwinViewport';
import { ModernButton, ModernCheckbox, ModernSelect } from './client/ui/ModernControls';
import { CameraFocusTarget, useTwinClient } from './client/useTwinClient';

export default function App() {
  const twin = useTwinClient();
  const {
    lang,
    toggleLang,
    theme,
    toggleTheme,
    t,
    num,
    labelActor,
    labelErrorCode,
    translateNotice,
  } = useI18n();

  const [activeTab, setActiveTab] = useState<DockTab>('traffic');
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const [selected, setSelected] = useState<SelectedEntityRef | null>(null);
  const [focusTarget, setFocusTarget] = useState<CameraFocusTarget | null>(null);
  const [overlays, setOverlays] = useState<TwinOverlayMode>({
    lanes: true,
    occupancy: false,
    heatmaps: false,
    oee: false,
    batchJourney: false,
  });

  // Keyboard shortcut 'H' to collapse/expand operations dock
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.key === 'h' || e.key === 'H' || e.key === 'ا') {
        setDockCollapsed((c) => !c);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const focusCamera = (x: number, z: number, distance = 14) => {
    setFocusTarget({ x, y: 0, z, distance, nonce: Date.now() });
  };

  const actorOptions =
    twin.actors.length > 0
      ? twin.actors.map((a) => ({
          value: a.actorId,
          label: labelActor(a.actorId, a.role),
        }))
      : [{ value: 'DISP-01', label: labelActor('DISP-01', 'dispatcher') }];

  const overlayItems: Array<{ key: keyof TwinOverlayMode; label: string }> = [
    { key: 'lanes', label: t('overlayLanes') },
    { key: 'occupancy', label: t('overlayOccupancy') },
    { key: 'heatmaps', label: t('overlayHeatmaps') },
    { key: 'oee', label: t('overlayOee') },
    { key: 'batchJourney', label: t('overlayBatch') },
  ];

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#F8FAFC] dark:bg-[#090E1A] text-slate-900 dark:text-slate-100 select-none">
      {/* 1. Full-Viewport Three.js Digital Twin Canvas */}
      <div className="absolute inset-0 z-0">
        <ThreeTwinViewport
          snapshot={twin.snapshot}
          overlays={overlays}
          selected={selected}
          onSelect={setSelected}
          focusTarget={focusTarget}
          theme={theme}
          lang={lang}
        />
      </div>

      {/* 2. Top Navigation Bar (Strict 3-Zone Architectural Header) */}
      <header className="relative z-20 flex items-center justify-between gap-4 px-6 py-2.5 bg-white/[0.97] dark:bg-[#0B1220]/[0.97] border-b border-slate-200/90 dark:border-slate-800/90 shadow-xs dark:shadow-none">
        {/* Zone 1: Wordmark */}
        <div className="text-[15px] font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0">
          {t('appTitle')}
        </div>

        {/* Zone 2: Camera preset links */}
        <nav className="hidden lg:flex items-center gap-6 text-xs font-medium text-slate-600 dark:text-slate-400">
          <button
            type="button"
            onClick={() => focusCamera(-4, 0, 32)}
            className="hover:text-sky-600 dark:hover:text-sky-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {t('navSiteOverview')}
          </button>
          <button
            type="button"
            onClick={() => focusCamera(-12, 0, 20)}
            className="hover:text-sky-600 dark:hover:text-sky-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {t('navWarehouse')}
          </button>
          <button
            type="button"
            onClick={() => focusCamera(5, 0, 14)}
            className="hover:text-sky-600 dark:hover:text-sky-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {t('navAirlock')}
          </button>
          <button
            type="button"
            onClick={() => focusCamera(17, 0, 20)}
            className="hover:text-sky-600 dark:hover:text-sky-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {t('navProduction')}
          </button>
        </nav>

        {/* Zone 3: Theme, Language, Custom Actor Select & Primary Action */}
        <div className="flex items-center gap-2 shrink-0">
          <ModernButton
            variant="secondary"
            size="xs"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? t('themeLight') : t('themeDark')}
          >
            {theme === 'dark' ? (
              <Sun className="w-3.5 h-3.5 text-amber-400" />
            ) : (
              <Moon className="w-3.5 h-3.5 text-slate-700" />
            )}
            <span>{theme === 'dark' ? t('themeLight') : t('themeDark')}</span>
          </ModernButton>

          <ModernButton
            variant="secondary"
            size="xs"
            onClick={toggleLang}
            aria-label="Toggle language"
          >
            <Languages className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
            <span>{lang === 'fa' ? t('langEn') : t('langFa')}</span>
          </ModernButton>

          <div className="w-44">
            <ModernSelect
              size="xs"
              ariaLabel={t('activeOperatorLabel')}
              value={twin.actorId}
              onChange={(val) => twin.setActorId(val)}
              options={actorOptions}
            />
          </div>

          <ModernButton
            variant="primary"
            size="sm"
            onClick={() => {
              setActiveTab('traffic');
              setDockCollapsed(false);
            }}
          >
            {t('dispatchMoveCta')}
          </ModernButton>
        </div>
      </header>

      {/* 3A. Live Factory HUD, Object Task Inspector & Notifications (Top-Start) */}
      <div className="pointer-events-none absolute top-14 start-5 z-20 flex flex-col gap-2 max-w-[380px] max-h-[calc(100vh-5rem)]">
        {twin.snapshot && (
          <LiveFactoryHud
            snapshot={twin.snapshot}
            wsConnected={twin.wsConnected}
            hasSelection={Boolean(selected)}
            onFocusPose={focusCamera}
            onSelect={setSelected}
            onConfigureAutopilot={twin.setAutopilot}
          />
        )}

        {selected && twin.snapshot && (
          <ObjectTaskInspector
            selected={selected}
            snapshot={twin.snapshot}
            onClose={() => setSelected(null)}
            onFocusPose={focusCamera}
            onSelect={setSelected}
            actions={{
              submitMove: twin.submitMove,
              overrideMission: twin.overrideMission,
              cancelMission: twin.cancelMission,
              controlVehicle: twin.controlVehicle,
              setPalletQa: twin.setPalletQa,
              dispatchBom: twin.dispatchBom,
              setMachineState: twin.setMachineState,
              toggleMaintenance: twin.toggleMaintenance,
              createMaintenanceWindow: twin.createMaintenanceWindow,
              createTask: twin.createTask,
              updateTaskStatus: twin.updateTaskStatus,
            }}
          />
        )}

        {twin.lastError && (
          <div className="pointer-events-auto p-3 bg-red-50/[0.97] dark:bg-red-950/[0.97] border border-red-300 dark:border-red-800 rounded-xl text-xs text-red-900 dark:text-red-200 flex items-start justify-between gap-2 shadow-lg">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-mono-tabular font-semibold text-red-700 dark:text-red-300">
                  {labelErrorCode(twin.lastError.code)} ({num(twin.lastError.httpStatus)})
                </div>
                <div>{lang === 'fa' ? num(twin.lastError.message) : twin.lastError.message}</div>
              </div>
            </div>
            <button
              type="button"
              onClick={twin.clearError}
              className="text-red-600 dark:text-red-400 hover:text-red-950 dark:hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {twin.lastNotice && !twin.lastError && (
          <div className="pointer-events-auto p-2.5 bg-emerald-50/[0.97] dark:bg-[#0B1220]/[0.97] border border-emerald-300 dark:border-emerald-800/70 rounded-xl text-xs text-emerald-900 dark:text-emerald-200 flex items-start justify-between gap-2 shadow-lg">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <span>{translateNotice(twin.lastNotice)}</span>
            </div>
            <button
              type="button"
              onClick={twin.clearNotice}
              className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* 3B. Dedicated 3D Viewport Layers Panel (Top-End, separated from bottom dock) */}
      <div className="pointer-events-auto absolute top-14 end-5 z-20 w-52 bg-white/[0.97] dark:bg-[#0B1220]/[0.97] border border-slate-200/90 dark:border-slate-800/90 rounded-xl shadow-[0_14px_34px_-12px_rgba(15,23,42,0.18)] dark:shadow-[0_18px_40px_-12px_rgba(2,6,23,0.75)] overflow-hidden">
        <button
          type="button"
          onClick={() => setLayersOpen((o) => !o)}
          className="w-full px-3 py-2 flex items-center justify-between gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900/70 transition-colors cursor-pointer"
        >
          <span className="flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
            <span>{t('layersPanelTitle')}</span>
          </span>
          {layersOpen ? (
            <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          )}
        </button>

        {layersOpen && (
          <div className="px-3 pb-2.5 pt-1 border-t border-slate-200/75 dark:border-slate-800/75 space-y-0.5">
            {overlayItems.map((item) => (
              <ModernCheckbox
                key={item.key}
                checked={overlays[item.key]}
                onChange={(checked) =>
                  setOverlays((prev) => ({ ...prev, [item.key]: checked }))
                }
                label={item.label}
              />
            ))}
          </div>
        )}
      </div>

      {/* 4. Collapsible Bottom Operations Dock */}
      {twin.snapshot ? (
        <OperationsDock
          snapshot={twin.snapshot}
          events={twin.events}
          actors={twin.actors}
          actorId={twin.actorId}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          collapsed={dockCollapsed}
          setCollapsed={setDockCollapsed}
          overlays={overlays}
          setOverlays={setOverlays}
          onFocusPose={focusCamera}
          onSelect={setSelected}
          actions={{
            submitMove: twin.submitMove,
            toggleEdgeClosure: twin.toggleEdgeClosure,
            controlVehicle: twin.controlVehicle,
            cancelMission: twin.cancelMission,
            setPalletQa: twin.setPalletQa,
            searchWms: twin.searchWms,
            dispatchBom: twin.dispatchBom,
            setMachineState: twin.setMachineState,
            toggleMaintenance: twin.toggleMaintenance,
            validateGmp: twin.validateGmp,
            patchConfig: twin.patchConfig,
            patchFlags: twin.patchFlags,
            setActuationMode: twin.setActuationMode,
            explainMission: twin.explainMission,
            overrideMission: twin.overrideMission,
            releaseReservation: twin.releaseReservation,
          }}
        />
      ) : (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-20 px-4 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-xs text-slate-700 dark:text-slate-300 shadow-lg">
          {t('connectingBanner')}
        </div>
      )}
    </div>
  );
}
