import { resolvePrincipal } from './auth-rbac.ts';
import type { TwinSiteOrchestrator } from './mission-orchestrator.ts';
import type { AutopilotStatus, ObjectTaskCategory, ObjectTaskPriority } from '../shared/p2-contracts.ts';

interface FleetCircuitStep {
  locations: string[];
  preferredCostProfile: 'fastest' | 'safest' | 'shortest';
}

const VEHICLE_CIRCUITS: Record<string, FleetCircuitStep> = {
  // Forklift patrols warehouse docks, selective racks, and outbound staging
  'VEH-FLT-03': {
    locations: ['DOCK-IN-01', 'BIN-A1-01', 'BIN-A2-01', 'BIN-B1-02', 'STAGE-OUT-01', 'DOCK-OUT-01'],
    preferredCostProfile: 'safest',
  },
  // Heavy Pallet AGV runs main warehouse <-> Grade C prep buffer & outbound staging
  'VEH-AGV-02': {
    locations: ['BIN-A1-02', 'BIN-A2-01', 'STAGE-OUT-01', 'DOCK-OUT-01', 'BUF-IN-01'],
    preferredCostProfile: 'fastest',
  },
  // Cleanroom AMR transfers through GMP Airlock across Grade C and Grade B suites
  'VEH-AMR-01': {
    locations: ['BIN-A2-01', 'BUF-IN-01', 'MCH-MIXER-01', 'MCH-COATER-01', 'BUF-FILL-01', 'STAGE-OUT-01'],
    preferredCostProfile: 'safest',
  },
};

const AUTO_TASK_TEMPLATES: Array<{
  targetKind: 'asset' | 'location';
  targetId: string;
  title: string;
  titleFa: string;
  category: ObjectTaskCategory;
  priority: ObjectTaskPriority;
}> = [
  {
    targetKind: 'asset',
    targetId: 'MCH-MIXER-01',
    title: 'High-shear granulation cycle — Batch 2611-A',
    titleFa: 'چرخه گرانولاسیون پرسرعت — بچ ۲۶۱۱-الف',
    category: 'material_prep',
    priority: 'high',
  },
  {
    targetKind: 'asset',
    targetId: 'MCH-COATER-01',
    title: 'Fluid-bed polymer film coating & warm air cure',
    titleFa: 'روکش‌دهی پلیمری بستر سیال و خشک‌کن حرارتی',
    category: 'material_prep',
    priority: 'high',
  },
  {
    targetKind: 'asset',
    targetId: 'AIRLOCK-01',
    title: 'Automated VHP decontamination & +15 Pa cascade lock',
    titleFa: 'ضدعفونی خودکار VHP و تثبیت اختلاف فشار +۱۵ پاسکال',
    category: 'sanitation',
    priority: 'critical',
  },
  {
    targetKind: 'asset',
    targetId: 'BUF-IN-01',
    title: 'Inline barcode scan & conveyor buffer staging',
    titleFa: 'اسکن بارکد خط تولید و انتقال روی نوار نقاله بافر',
    category: 'inspection',
    priority: 'medium',
  },
  {
    targetKind: 'asset',
    targetId: 'BUF-FILL-01',
    title: 'Grade B vial tray sterilization & buffer feed',
    titleFa: 'استریل‌سازی سینی ویال کلاس ب و تغذیه خط پرکنی',
    category: 'sanitation',
    priority: 'high',
  },
  {
    targetKind: 'location',
    targetId: 'LOC-DOCK-IN-01',
    title: 'Inbound dock GS1 SSCC manifest verification',
    titleFa: 'تطبیق خودکار بارنامه GS1 در اسکله ورودی',
    category: 'cycle_count',
    priority: 'medium',
  },
  {
    targetKind: 'location',
    targetId: 'LOC-STAGE-OUT-01',
    title: 'Outbound pallet weight & seal verification',
    titleFa: 'کنترل وزن و پلمب پالت آماده ارسال در استیج خروجی',
    category: 'qa_sampling',
    priority: 'high',
  },
];

export class AutonomousFactoryDirector {
  private enabled = true;
  private speedMultiplier: 1 | 2 | 4 = 1;
  private cyclesCompleted = 0;
  private lastActionIso: string | null = null;

  private vehicleIdleDwellSec = new Map<string, number>();
  private vehicleRouteCursor = new Map<string, number>();
  private machineOeeClock = 0;
  private taskClock = 0;
  private taskTemplateCursor = 0;

  private readonly actor = resolvePrincipal({ actorId: 'DISP-01' });

  private readonly orchestrator: TwinSiteOrchestrator;

  constructor(orchestrator: TwinSiteOrchestrator) {
    this.orchestrator = orchestrator;
  }

  public getStatus(): AutopilotStatus {
    return {
      enabled: this.enabled,
      speedMultiplier: this.speedMultiplier,
      cyclesCompleted: this.cyclesCompleted,
      lastActionIso: this.lastActionIso,
    };
  }

  public configure(opts: { enabled?: boolean; speedMultiplier?: 1 | 2 | 4 }): AutopilotStatus {
    if (typeof opts.enabled === 'boolean') {
      this.enabled = opts.enabled;
    }
    if (opts.speedMultiplier === 1 || opts.speedMultiplier === 2 || opts.speedMultiplier === 4) {
      this.speedMultiplier = opts.speedMultiplier;
    }
    this.lastActionIso = new Date().toISOString();
    return this.getStatus();
  }

  /**
   * Dispatches initial live traffic across Forklift, AGV, and AMR plus an active coating task
   * so the digital twin opens as a living, moving factory from the first frame.
   */
  public seedInitialLiveOperations(): void {
    this.dispatchVehicleMission('VEH-FLT-03', 'DOCK-IN-01', 'BIN-A2-01', 'safest');
    this.dispatchVehicleMission('VEH-AGV-02', 'BIN-A1-02', 'STAGE-OUT-01', 'fastest', 'PLT-1002');
    this.dispatchVehicleMission('VEH-AMR-01', 'BIN-A1-01', 'BUF-IN-01', 'safest', 'PLT-1001');

    // EnsureFluid-Bed Coater and Mixer show live factory processing
    try {
      this.orchestrator.mes.updateMachineState('MCH-COATER-01', 'run', 'SUP-01');
      this.orchestrator.createObjectTask(
        {
          targetKind: 'asset',
          targetId: 'MCH-COATER-01',
          title: 'Fluid-bed polymer film coating — Batch 2611-A',
          titleFa: 'روکش‌دهی بستر سیال — بچ ۲۶۱۱-الف',
          category: 'material_prep',
          priority: 'high',
          startImmediately: true,
        },
        this.actor
      );
      this.orchestrator.createObjectTask(
        {
          targetKind: 'asset',
          targetId: 'BUF-IN-01',
          title: 'Active roller feed to granulation mixer',
          titleFa: 'تغذیه خودکار مواد روی نوار نقاله گرانولاسیون',
          category: 'material_prep',
          priority: 'medium',
          startImmediately: true,
        },
        this.actor
      );
    } catch {
      // Non-fatal if seed state differs
    }

    this.lastActionIso = new Date().toISOString();
  }

  public step(dtSec: number): void {
    const simDt = dtSec * this.speedMultiplier;
    this.orchestrator.tick(simDt);

    if (!this.enabled) return;

    this.stepFleetCirculation(simDt);
    this.stepProductionTelemetryAndTasks(simDt);
  }

  private stepFleetCirculation(simDt: number): void {
    for (const v of this.orchestrator.getVehicles()) {
      // Respect operator safety/pause overrides completely
      if (v.eStopActive || v.isStale || v.status === 'paused' || v.status === 'e_stopped') {
        this.vehicleIdleDwellSec.set(v.id, 0);
        continue;
      }

      if (v.activeMissionId || v.queuedMissionIds.length > 0) {
        this.vehicleIdleDwellSec.set(v.id, 0);
        continue;
      }

      // Auto-recharge smoothly during dwell so continuous demo fleet never hits battery lockout
      if (v.batteryPct < 35) {
        v.batteryPct = Math.min(96, Number((v.batteryPct + simDt * 6).toFixed(1)));
      } else if (v.batteryPct < 92) {
        v.batteryPct = Math.min(92, Number((v.batteryPct + simDt * 0.6).toFixed(2)));
      }

      const dwell = (this.vehicleIdleDwellSec.get(v.id) ?? 0) + simDt;
      this.vehicleIdleDwellSec.set(v.id, dwell);

      if (dwell >= 2.4) {
        this.vehicleIdleDwellSec.set(v.id, 0);
        this.dispatchNextCircuitLeg(v.id);
      }
    }

    // Keep mission history bounded so WebSocket snapshots stay lightweight & responsive
    const missions = this.orchestrator.getMissions();
    if (missions.length > 18) {
      const terminalIndices: number[] = [];
      for (let i = missions.length - 1; i >= 0; i--) {
        if (missions[i].state === 'completed' || missions[i].state === 'failed') {
          terminalIndices.push(i);
        }
      }
      for (const idx of terminalIndices) {
        if (missions.length <= 14) break;
        missions.splice(idx, 1);
      }
    }
  }

  private dispatchNextCircuitLeg(vehicleId: string): void {
    const vehicle = this.orchestrator.getVehicleById(vehicleId);
    const circuit = VEHICLE_CIRCUITS[vehicleId];
    if (!vehicle || !circuit) return;

    // Find closest location to current vehicle pose as origin
    let originLoc = this.orchestrator.world.locations[0];
    let bestDist = Infinity;
    for (const loc of this.orchestrator.world.locations) {
      const d = Math.hypot(loc.pose.x - vehicle.pose.x, loc.pose.z - vehicle.pose.z);
      if (d < bestDist) {
        bestDist = d;
        originLoc = loc;
      }
    }

    const startCursor = (this.vehicleRouteCursor.get(vehicleId) ?? 0) % circuit.locations.length;

    // Try up to circuit length destinations until a conflict-free route succeeds
    for (let offset = 0; offset < circuit.locations.length; offset++) {
      const idx = (startCursor + offset) % circuit.locations.length;
      const destCode = circuit.locations[idx];
      if (destCode === originLoc.code) continue;

      // Pick a released pallet sitting at origin if any
      const availablePallet = this.orchestrator.wms
        .getPallets()
        .find(
          (p) =>
            p.locationId === originLoc.id &&
            !p.inTransitVehicleId &&
            p.qaStatus === 'released'
        );

      const ok = this.dispatchVehicleMission(
        vehicleId,
        originLoc.code,
        destCode,
        circuit.preferredCostProfile,
        availablePallet?.id
      );

      if (ok) {
        this.vehicleRouteCursor.set(vehicleId, (idx + 1) % circuit.locations.length);
        this.cyclesCompleted += 1;
        this.lastActionIso = new Date().toISOString();
        return;
      }
    }
  }

  private dispatchVehicleMission(
    vehicleId: string,
    originId: string,
    destinationId: string,
    costProfile: 'fastest' | 'safest' | 'shortest',
    loadId?: string
  ): boolean {
    try {
      this.orchestrator.submitMoveCommand(
        {
          idempotencyKey: `auto-${vehicleId}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          originId,
          destinationId,
          vehicleId,
          costProfile,
          priority: 5,
          payloadKg: 180,
          loadId,
        },
        this.actor
      );
      return true;
    } catch {
      return false;
    }
  }

  private stepProductionTelemetryAndTasks(simDt: number): void {
    this.machineOeeClock += simDt;
    this.taskClock += simDt;

    // Subtle live OEE telemetry oscillation for running production assets
    if (this.machineOeeClock >= 2.5) {
      this.machineOeeClock = 0;
      const t = Date.now() / 1000;
      for (let i = 0; i < this.orchestrator.mes.getAssets().length; i++) {
        const asset = this.orchestrator.mes.getAssets()[i];
        if (asset.machineState === 'run') {
          const jitterA = 0.93 + 0.05 * Math.sin(t * 0.35 + i * 1.4);
          const jitterP = 0.89 + 0.07 * Math.cos(t * 0.28 + i * 0.9);
          asset.oee.availability = Number(jitterA.toFixed(2));
          asset.oee.performance = Number(jitterP.toFixed(2));
          asset.oee.overall = Number(
            (asset.oee.availability * asset.oee.performance * asset.oee.quality).toFixed(2)
          );
        }
      }
    }

    // Periodically rotate automated tasks on machines/locations so the factory keeps cycling
    if (this.taskClock >= 9.0) {
      this.taskClock = 0;
      const tasks = this.orchestrator.getTasks();
      const nowMs = Date.now();

      // Complete older auto tasks that have been in_progress > 20s
      const runningAutoTasks = tasks.filter(
        (tk) => tk.status === 'in_progress' && nowMs - Date.parse(tk.updatedAtIso) > 20_000
      );
      if (runningAutoTasks.length > 2) {
        const oldest = runningAutoTasks[runningAutoTasks.length - 1];
        try {
          this.orchestrator.updateObjectTaskStatus(oldest.id, 'completed', this.actor);
        } catch {
          // ignore
        }
      }

      // Promote a pending task or spawn a fresh active task if fewer than 3 are in_progress
      const activeCount = tasks.filter((tk) => tk.status === 'in_progress').length;
      if (activeCount < 3) {
        const pending = tasks.find((tk) => tk.status === 'pending');
        if (pending) {
          try {
            this.orchestrator.updateObjectTaskStatus(pending.id, 'in_progress', this.actor);
          } catch {
            // ignore
          }
        } else {
          const tpl = AUTO_TASK_TEMPLATES[this.taskTemplateCursor % AUTO_TASK_TEMPLATES.length];
          this.taskTemplateCursor += 1;
          try {
            this.orchestrator.createObjectTask(
              {
                ...tpl,
                startImmediately: true,
              },
              this.actor
            );
            this.lastActionIso = new Date().toISOString();
          } catch {
            // ignore
          }
        }
      }

      // Keep completed task history tidy
      while (tasks.length > 16) {
        let idx = -1;
        for (let i = tasks.length - 1; i >= 0; i--) {
          if (tasks[i].status === 'completed' || tasks[i].status === 'cancelled') {
            idx = i;
            break;
          }
        }
        if (idx === -1) break;
        tasks.splice(idx, 1);
      }
    }
  }
}
