import crypto from 'node:crypto';
import type {
  PhysicalControllerGateway,
  PhysicalIntentAudit,
} from '../shared/p1-contracts.ts';

/**
 * [P1-CONTRACT] Safety Boundary Implementation:
 * Approved Fleet Controller Gateway stub.
 * Enforces the safety boundary invariant: twin planning/orchestration intents
 * never drive physical vehicle I/O or PLC actuators directly.
 */
export class ApprovedFleetControllerGateway implements PhysicalControllerGateway {
  public readonly gatewayId = 'gw-gradian-fleet-interlock-v2';
  private readonly intentLog: PhysicalIntentAudit[] = [];

  submitOrchestrationIntent(
    intent: Omit<PhysicalIntentAudit, 'intentId' | 'interlockVerified' | 'physicalIoActuated' | 'gatewayName' | 'timestampIso'>
  ): PhysicalIntentAudit {
    const record: PhysicalIntentAudit = {
      ...intent,
      intentId: `int_${crypto.randomUUID().slice(0, 10)}`,
      interlockVerified: true,
      physicalIoActuated: false, // Hard invariant: twin never actuates physical I/O
      gatewayName: this.gatewayId,
      timestampIso: new Date().toISOString(),
    };

    this.intentLog.unshift(record);
    if (this.intentLog.length > 200) {
      this.intentLog.length = 200;
    }

    return record;
  }

  getRecentIntents(tenantId: string, siteId: string): PhysicalIntentAudit[] {
    return this.intentLog
      .filter((r) => r.tenantId === tenantId && r.siteId === siteId)
      .slice(0, 50);
  }
}
