import type { CleanlinessGrade, WorldModel } from '../shared/p1-contracts.ts';
import { CreateMaintenanceWindowSchema, TwinDomainError } from '../shared/p2-contracts.ts';
import type {
  BatchGenealogy,
  BomDemand,
  GmpTransferRule,
  MachineRunState,
  MaintenanceWindow,
  ProductionAsset,
} from '../shared/p2-contracts.ts';
import type { TwinEventBus } from './event-bus.ts';
import {
  createSeedBatches,
  createSeedBomDemands,
  createSeedGmpRules,
  createSeedMaintenanceWindows,
  createSeedProductionAssets,
} from './seed-data.ts';

export class MesService {
  private assets: ProductionAsset[];
  private bomDemands: BomDemand[] = createSeedBomDemands();
  private batches: BatchGenealogy[] = createSeedBatches();
  private gmpRules: GmpTransferRule[] = createSeedGmpRules();
  private maintenanceWindows: MaintenanceWindow[] = createSeedMaintenanceWindows();

  private readonly world: WorldModel;
  private readonly eventBus: TwinEventBus;

  constructor(world: WorldModel, eventBus: TwinEventBus) {
    this.world = world;
    this.eventBus = eventBus;
    this.assets = createSeedProductionAssets(world);
  }

  public getAssets(): ProductionAsset[] {
    return this.assets;
  }

  public getBomDemands(): BomDemand[] {
    return this.bomDemands;
  }

  public getBatches(): BatchGenealogy[] {
    return this.batches;
  }

  public getGmpRules(): GmpTransferRule[] {
    return this.gmpRules;
  }

  public getMaintenanceWindows(): MaintenanceWindow[] {
    return this.maintenanceWindows;
  }

  public assertLocationAvailableForDispatch(locationId: string): void {
    const blockingWindow = this.maintenanceWindows.find(
      (w) => w.locationId === locationId && w.active && w.blocksDispatch
    );
    if (blockingWindow) {
      throw new TwinDomainError(
        'MAINTENANCE_CONFLICT',
        `Dispatch blocked: ${blockingWindow.assetCode} has active maintenance window '${blockingWindow.title}' (${blockingWindow.id})`,
        409,
        {
          maintenanceId: blockingWindow.id,
          assetId: blockingWindow.assetId,
          locationId,
          windowType: blockingWindow.type,
        }
      );
    }

    const asset = this.assets.find((a) => a.locationId === locationId);
    if (asset && (asset.machineState === 'maintenance' || asset.calibrationStatus === 'expired')) {
      throw new TwinDomainError(
        'MAINTENANCE_CONFLICT',
        `Asset ${asset.code} is unavailable (state=${asset.machineState}, calibration=${asset.calibrationStatus})`,
        409,
        { assetId: asset.id, machineState: asset.machineState, calibrationStatus: asset.calibrationStatus }
      );
    }
  }

  public checkGmpTransferGate(params: {
    fromGrade: CleanlinessGrade;
    toGrade: CleanlinessGrade;
    passesAirlockId?: string;
    qaReleased: boolean;
  }): { allowed: boolean; rule?: GmpTransferRule; reason?: string } {
    if (params.fromGrade === params.toGrade) {
      return { allowed: true };
    }
    const rule = this.gmpRules.find(
      (r) => r.fromGrade === params.fromGrade && r.toGrade === params.toGrade
    );
    if (!rule) {
      return { allowed: true };
    }
    if (rule.requiresQaRelease && !params.qaReleased) {
      return {
        allowed: false,
        rule,
        reason: `GMP rule ${rule.id} requires QA-released material before entering ${params.toGrade}`,
      };
    }
    if (params.passesAirlockId !== rule.requiredAirlockId) {
      return {
        allowed: false,
        rule,
        reason: `GMP rule ${rule.id} requires passage through airlock ${rule.requiredAirlockId}`,
      };
    }
    return { allowed: true, rule };
  }

  public updateMachineState(
    assetId: string,
    machineState: MachineRunState,
    actorId: string
  ): ProductionAsset {
    const asset = this.assets.find((a) => a.id === assetId);
    if (!asset) {
      throw new TwinDomainError('RESOURCE_NOT_FOUND', `Production asset ${assetId} not found`, 404);
    }

    asset.machineState = machineState;
    if (machineState === 'run') {
      asset.oee.availability = Math.min(0.98, Number((asset.oee.availability + 0.08).toFixed(2)));
    } else if (machineState === 'down' || machineState === 'maintenance') {
      asset.oee.availability = Math.max(0.35, Number((asset.oee.availability - 0.15).toFixed(2)));
    }
    asset.oee.overall = Number(
      (asset.oee.availability * asset.oee.performance * asset.oee.quality).toFixed(2)
    );

    this.eventBus.publish({
      topic: 'twin.mes.line',
      tenantId: this.world.tenantId,
      siteId: this.world.siteId,
      worldRevision: this.world.worldRevision,
      actorId,
      payload: {
        assetId: asset.id,
        machineState: asset.machineState,
        oee: asset.oee,
      },
    });

    return asset;
  }

  public toggleMaintenanceWindow(windowId: string, active: boolean, actorId: string): MaintenanceWindow {
    const win = this.maintenanceWindows.find((w) => w.id === windowId);
    if (!win) {
      throw new TwinDomainError('RESOURCE_NOT_FOUND', `Maintenance window ${windowId} not found`, 404);
    }
    win.active = active;
    win.blocksDispatch = active;

    const asset = this.assets.find((a) => a.id === win.assetId);
    if (asset) {
      asset.machineState = active ? 'maintenance' : 'idle';
      if (!active && asset.calibrationStatus === 'expired') {
        asset.calibrationStatus = 'calibrated';
      }
    }

    this.eventBus.publish({
      topic: 'twin.mes.maintenance',
      tenantId: this.world.tenantId,
      siteId: this.world.siteId,
      worldRevision: this.world.worldRevision,
      actorId,
      payload: {
        windowId: win.id,
        assetId: win.assetId,
        active: win.active,
        blocksDispatch: win.blocksDispatch,
      },
    });

    return win;
  }

  public createMaintenanceWindow(rawInput: unknown, actorId: string): MaintenanceWindow {
    const parsed = CreateMaintenanceWindowSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new TwinDomainError(
        'VALIDATION_ERROR',
        'Invalid maintenance window payload',
        400,
        { issues: parsed.error.issues }
      );
    }
    const input = parsed.data;
    const asset = this.assets.find((a) => a.id === input.assetId);
    if (!asset) {
      throw new TwinDomainError('RESOURCE_NOT_FOUND', `Production asset ${input.assetId} not found`, 404);
    }
    const now = Date.now();
    const win: MaintenanceWindow = {
      id: `${input.type === 'calibration' ? 'CAL' : input.type === 'production_run' ? 'RUN' : 'PM'}-${Math.floor(100 + Math.random() * 900)}`,
      assetId: asset.id,
      assetCode: asset.code,
      locationId: asset.locationId,
      type: input.type,
      title: input.title,
      startIso: new Date(now).toISOString(),
      endIso: new Date(now + 4 * 3600 * 1000).toISOString(),
      active: input.active,
      blocksDispatch: input.active ? input.blocksDispatch : false,
    };
    this.maintenanceWindows.unshift(win);

    if (input.active && input.type !== 'production_run') {
      asset.machineState = 'maintenance';
    } else if (input.active && input.type === 'production_run') {
      asset.machineState = 'run';
    }

    this.eventBus.publish({
      topic: 'twin.mes.maintenance',
      tenantId: this.world.tenantId,
      siteId: this.world.siteId,
      worldRevision: this.world.worldRevision,
      actorId,
      payload: {
        windowId: win.id,
        assetId: win.assetId,
        type: win.type,
        active: win.active,
        blocksDispatch: win.blocksDispatch,
      },
    });

    return win;
  }

  public linkBomDemandToMission(bomId: string, missionId: string, actorId: string): BomDemand {
    const bom = this.bomDemands.find((b) => b.id === bomId);
    if (!bom) {
      throw new TwinDomainError('RESOURCE_NOT_FOUND', `BOM demand ${bomId} not found`, 404);
    }
    bom.linkedMissionId = missionId;
    bom.handoffState = 'in_transit';

    this.eventBus.publish({
      topic: 'twin.mes.bom_handoff',
      tenantId: this.world.tenantId,
      siteId: this.world.siteId,
      worldRevision: this.world.worldRevision,
      actorId,
      payload: {
        bomId: bom.id,
        workOrderId: bom.workOrderId,
        missionId,
        handoffState: bom.handoffState,
      },
    });

    return bom;
  }

  public completeBomHandoff(missionId: string, actorId: string): void {
    const bom = this.bomDemands.find((b) => b.linkedMissionId === missionId);
    if (!bom) return;
    bom.handoffState = 'handed_off';

    this.eventBus.publish({
      topic: 'twin.mes.bom_handoff',
      tenantId: this.world.tenantId,
      siteId: this.world.siteId,
      worldRevision: this.world.worldRevision,
      actorId,
      payload: {
        bomId: bom.id,
        workOrderId: bom.workOrderId,
        missionId,
        handoffState: 'handed_off',
      },
    });
  }
}
