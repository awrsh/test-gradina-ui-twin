import type { TwinEventEnvelope, TwinEventTopic } from '../shared/p1-contracts.ts';
import { P2_CONTRACT_VERSION } from '../shared/p2-contracts.ts';
import type { TwinMetricsSnapshot } from '../shared/p2-contracts.ts';
import crypto from 'node:crypto';

export type EventSubscriber = (event: TwinEventEnvelope<unknown>) => void;

export class TwinEventBus {
  private readonly outbox: TwinEventEnvelope<unknown>[] = [];
  private readonly subscribers = new Set<{
    tenantId: string;
    siteId: string;
    cb: EventSubscriber;
  }>();

  public readonly metrics: TwinMetricsSnapshot = {
    commandsAccepted: 0,
    commandsRejected: 0,
    routingFailures: 0,
    replansTriggered: 0,
    deadlocksResolved: 0,
    staleVehiclesCount: 0,
    eStopsActiveCount: 0,
    activeMissionsCount: 0,
    completedMissionsCount: 0,
  };

  publish<T>(params: {
    topic: TwinEventTopic;
    tenantId: string;
    siteId: string;
    worldRevision: string;
    actorId: string;
    payload: T;
    correlationId?: string;
  }): TwinEventEnvelope<T> {
    const envelope: TwinEventEnvelope<T> = {
      eventId: `evt_${crypto.randomUUID().slice(0, 12)}`,
      topic: params.topic,
      schemaVersion: P2_CONTRACT_VERSION,
      tenantId: params.tenantId,
      siteId: params.siteId,
      worldRevision: params.worldRevision,
      actorId: params.actorId,
      timestampIso: new Date().toISOString(),
      correlationId: params.correlationId,
      payload: params.payload,
    };

    this.outbox.unshift(envelope);
    if (this.outbox.length > 250) {
      this.outbox.length = 250;
    }

    for (const sub of this.subscribers) {
      if (sub.tenantId === params.tenantId && sub.siteId === params.siteId) {
        try {
          sub.cb(envelope);
        } catch {
          // Subscriber errors do not break event backbone
        }
      }
    }

    return envelope;
  }

  subscribe(tenantId: string, siteId: string, cb: EventSubscriber): () => void {
    const entry = { tenantId, siteId, cb };
    this.subscribers.add(entry);
    return () => {
      this.subscribers.delete(entry);
    };
  }

  getOutbox(tenantId: string, siteId: string, limit = 60): TwinEventEnvelope<unknown>[] {
    return this.outbox
      .filter((e) => e.tenantId === tenantId && e.siteId === siteId)
      .slice(0, limit);
  }
}
