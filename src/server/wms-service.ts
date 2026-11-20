import type { WorldModel } from '../shared/p1-contracts.ts';
import { TwinDomainError } from '../shared/p2-contracts.ts';
import type {
  BinOccupancy,
  Gs1Pallet,
  HeatmapCell,
  QaStatus,
  SlottingOpportunity,
  WarehouseFlowRecord,
} from '../shared/p2-contracts.ts';
import type { TwinEventBus } from './event-bus.ts';
import {
  createSeedHeatmaps,
  createSeedPallets,
  createSeedSlottingOpportunities,
  createSeedWarehouseFlows,
} from './seed-data.ts';

export interface TraceabilitySearchMatch {
  pallet: Gs1Pallet;
  matchedOn: 'gtin' | 'lot' | 'serial' | 'sscc' | 'sku';
  matchedValue: string;
  locationId: string;
  binCode: string;
  pose: { x: number; y: number; z: number };
}

export class WmsService {
  private pallets: Gs1Pallet[] = createSeedPallets();
  private flows: WarehouseFlowRecord[] = createSeedWarehouseFlows();
  private heatmaps: HeatmapCell[] = createSeedHeatmaps();
  private opportunities: SlottingOpportunity[] = createSeedSlottingOpportunities();

  private readonly world: WorldModel;
  private readonly eventBus: TwinEventBus;

  constructor(world: WorldModel, eventBus: TwinEventBus) {
    this.world = world;
    this.eventBus = eventBus;
  }

  public getPallets(): Gs1Pallet[] {
    return this.pallets;
  }

  public getFlows(): WarehouseFlowRecord[] {
    return this.flows;
  }

  public getHeatmaps(): HeatmapCell[] {
    return this.heatmaps;
  }

  public getOpportunities(): SlottingOpportunity[] {
    return this.opportunities;
  }

  public getPalletById(palletId: string): Gs1Pallet | undefined {
    return this.pallets.find((p) => p.id === palletId || p.sscc === palletId);
  }

  public computeBinOccupancy(): BinOccupancy[] {
    const binLocations = this.world.locations.filter(
      (l) => l.kind === 'bin' || l.kind === 'staging' || l.kind === 'buffer'
    );

    return binLocations.map((loc) => {
      const assigned = this.pallets.filter(
        (p) => p.locationId === loc.id && !p.inTransitVehicleId
      );
      const cap = loc.capacity ?? 2;
      const used = assigned.length;
      const utilizationPct = Math.min(100, Math.round((used / cap) * 100));

      let qaStatusSummary: BinOccupancy['qaStatusSummary'] = 'empty';
      if (used > 0) {
        const statuses = new Set(assigned.map((p) => p.qaStatus));
        qaStatusSummary = statuses.size === 1 ? assigned[0].qaStatus : 'mixed';
      }

      return {
        locationId: loc.id,
        binCode: loc.code,
        zoneId: loc.zoneId,
        capacityPallets: cap,
        usedPallets: used,
        utilizationPct,
        qaStatusSummary,
        palletIds: assigned.map((p) => p.id),
      };
    });
  }

  public searchTraceability(query: string): TraceabilitySearchMatch[] {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const locMap = new Map(this.world.locations.map((l) => [l.id, l]));
    const results: TraceabilitySearchMatch[] = [];

    for (const pallet of this.pallets) {
      const loc = locMap.get(pallet.locationId);
      const pose = loc?.pose ?? { x: 0, y: 0, z: 0 };

      if (pallet.sscc.toLowerCase().includes(q) || pallet.id.toLowerCase().includes(q)) {
        results.push({
          pallet,
          matchedOn: 'sscc',
          matchedValue: pallet.sscc,
          locationId: pallet.locationId,
          binCode: pallet.binCode,
          pose,
        });
        continue;
      }

      let matched = false;
      for (const carton of pallet.cartons) {
        if (carton.gtin.toLowerCase().includes(q)) {
          results.push({
            pallet,
            matchedOn: 'gtin',
            matchedValue: carton.gtin,
            locationId: pallet.locationId,
            binCode: pallet.binCode,
            pose,
          });
          matched = true;
          break;
        }
        if (carton.lot.toLowerCase().includes(q)) {
          results.push({
            pallet,
            matchedOn: 'lot',
            matchedValue: carton.lot,
            locationId: pallet.locationId,
            binCode: pallet.binCode,
            pose,
          });
          matched = true;
          break;
        }
        for (const item of carton.items) {
          if (
            item.serial.toLowerCase().includes(q) ||
            item.sku.toLowerCase().includes(q) ||
            item.gtin.toLowerCase().includes(q) ||
            item.lot.toLowerCase().includes(q)
          ) {
            const matchedOn = item.serial.toLowerCase().includes(q)
              ? 'serial'
              : item.lot.toLowerCase().includes(q)
                ? 'lot'
                : item.gtin.toLowerCase().includes(q)
                  ? 'gtin'
                  : 'sku';
            results.push({
              pallet,
              matchedOn,
              matchedValue:
                matchedOn === 'serial'
                  ? item.serial
                  : matchedOn === 'lot'
                    ? item.lot
                    : matchedOn === 'gtin'
                      ? item.gtin
                      : item.sku,
              locationId: pallet.locationId,
              binCode: pallet.binCode,
              pose,
            });
            matched = true;
            break;
          }
        }
        if (matched) break;
      }
    }

    return results;
  }

  public setPalletQaStatus(palletId: string, qaStatus: QaStatus, actorId: string): Gs1Pallet {
    const pallet = this.pallets.find((p) => p.id === palletId);
    if (!pallet) {
      throw new TwinDomainError('RESOURCE_NOT_FOUND', `Pallet ${palletId} not found`, 404);
    }

    pallet.qaStatus = qaStatus;

    // Update any blocked flows for this pallet
    for (const flow of this.flows) {
      if (flow.palletId === pallet.id) {
        flow.status = qaStatus === 'quarantine' ? 'blocked_qa' : 'in_progress';
        flow.updatedAtIso = new Date().toISOString();
      }
    }

    this.eventBus.publish({
      topic: 'twin.wms.inventory',
      tenantId: this.world.tenantId,
      siteId: this.world.siteId,
      worldRevision: this.world.worldRevision,
      actorId,
      payload: {
        palletId: pallet.id,
        qaStatus,
        locationId: pallet.locationId,
        binCode: pallet.binCode,
      },
    });

    return pallet;
  }

  public markPalletInTransit(palletId: string, vehicleId: string, actorId: string): void {
    const pallet = this.pallets.find((p) => p.id === palletId);
    if (!pallet) return;
    pallet.inTransitVehicleId = vehicleId;

    this.eventBus.publish({
      topic: 'twin.wms.inventory',
      tenantId: this.world.tenantId,
      siteId: this.world.siteId,
      worldRevision: this.world.worldRevision,
      actorId,
      payload: { palletId: pallet.id, inTransitVehicleId: vehicleId, state: 'in_transit' },
    });
  }

  public markPalletDropped(
    palletId: string,
    destinationLocationId: string,
    destinationCode: string,
    actorId: string
  ): void {
    const pallet = this.pallets.find((p) => p.id === palletId);
    if (!pallet) return;
    pallet.inTransitVehicleId = null;
    pallet.locationId = destinationLocationId;
    pallet.binCode = destinationCode;

    // Record or update flow
    const existing = this.flows.find(
      (f) => f.palletId === pallet.id && f.toLocationId === destinationLocationId
    );
    if (existing) {
      existing.status = 'completed';
      existing.updatedAtIso = new Date().toISOString();
    } else {
      const kind: WarehouseFlowRecord['kind'] = destinationCode.startsWith('DOCK-OUT')
        ? 'outbound_loading'
        : destinationCode.startsWith('STAGE')
          ? 'outbound_staging'
          : 'inbound_putaway';
      this.flows.unshift({
        id: `FLOW-${Date.now().toString().slice(-4)}`,
        kind,
        palletId: pallet.id,
        sscc: pallet.sscc,
        fromLocationId: pallet.locationId,
        toLocationId: destinationLocationId,
        status: 'completed',
        updatedAtIso: new Date().toISOString(),
      });
    }

    this.eventBus.publish({
      topic: 'twin.wms.inventory',
      tenantId: this.world.tenantId,
      siteId: this.world.siteId,
      worldRevision: this.world.worldRevision,
      actorId,
      payload: {
        palletId: pallet.id,
        inTransitVehicleId: null,
        locationId: destinationLocationId,
        binCode: destinationCode,
        state: 'stocked',
      },
    });
  }

  public recordTraversalAt(x: number, z: number): void {
    for (const cell of this.heatmaps) {
      const insideX = Math.abs(x - cell.x) <= cell.width / 2;
      const insideZ = Math.abs(z - cell.z) <= cell.depth / 2;
      if (insideX && insideZ) {
        cell.traversalCount += 1;
        cell.travelIntensity = Math.min(1, Number((cell.travelIntensity + 0.015).toFixed(2)));
        cell.congestionScore = Math.min(1, Number((cell.congestionScore + 0.01).toFixed(2)));
      }
    }
  }
}
