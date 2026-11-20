import type { ActorPrincipal, ActorRole, CleanlinessGrade } from '../shared/p1-contracts.ts';
import { TwinDomainError } from '../shared/p2-contracts.ts';
import { DEFAULT_SITE_ID, DEFAULT_TENANT_ID } from './seed-data.ts';

const ALL_GRADES: CleanlinessGrade[] = ['Warehouse', 'Grade D', 'Grade C', 'Grade B', 'Grade A'];

export const ACTOR_DIRECTORY: Record<string, ActorPrincipal> = {
  'OP-01': {
    actorId: 'OP-01',
    displayName: 'Sara Rahimi (Senior Operator)',
    role: 'operator',
    tenantId: DEFAULT_TENANT_ID,
    siteId: DEFAULT_SITE_ID,
    allowedZones: ['WH-MAIN', 'WH-QUARANTINE', 'AIRLOCK-ZONE', 'ROOM-PREP-01', 'ROOM-FILL-01'],
    allowedCleanlinessGrades: ['Warehouse', 'Grade D', 'Grade C', 'Grade B'],
    permissions: {
      issueMove: true,
      controlVehicle: true,
      ackEstop: false, // Operators cannot clear/ack E-Stop; requires Supervisor or Dispatcher
      manageQa: false,
      manageClosures: true,
      manageMes: true,
      manageMaintenance: false,
      manageControlPlane: false,
      manageSafetyMode: false,
    },
  },
  'DISP-01': {
    actorId: 'DISP-01',
    displayName: 'Reza Karimi (Traffic Dispatcher)',
    role: 'dispatcher',
    tenantId: DEFAULT_TENANT_ID,
    siteId: DEFAULT_SITE_ID,
    allowedZones: ['*'],
    allowedCleanlinessGrades: ALL_GRADES,
    permissions: {
      issueMove: true,
      controlVehicle: true,
      ackEstop: true,
      manageQa: false,
      manageClosures: true,
      manageMes: true,
      manageMaintenance: true,
      manageControlPlane: true,
      manageSafetyMode: true,
    },
  },
  'SUP-01': {
    actorId: 'SUP-01',
    displayName: 'Dr. Mina Alavi (Plant Supervisor)',
    role: 'supervisor',
    tenantId: DEFAULT_TENANT_ID,
    siteId: DEFAULT_SITE_ID,
    allowedZones: ['*'],
    allowedCleanlinessGrades: ALL_GRADES,
    permissions: {
      issueMove: true,
      controlVehicle: true,
      ackEstop: true,
      manageQa: true,
      manageClosures: true,
      manageMes: true,
      manageMaintenance: true,
      manageControlPlane: true,
      manageSafetyMode: true,
    },
  },
  'QA-01': {
    actorId: 'QA-01',
    displayName: 'Nima Tehrani (QA Lead)',
    role: 'qa_lead',
    tenantId: DEFAULT_TENANT_ID,
    siteId: DEFAULT_SITE_ID,
    allowedZones: ['WH-MAIN', 'WH-QUARANTINE', 'AIRLOCK-ZONE', 'ROOM-PREP-01', 'ROOM-FILL-01'],
    allowedCleanlinessGrades: ALL_GRADES,
    permissions: {
      issueMove: false,
      controlVehicle: false,
      ackEstop: false,
      manageQa: true,
      manageClosures: false,
      manageMes: true,
      manageMaintenance: false,
      manageControlPlane: false,
      manageSafetyMode: false,
    },
  },
  'VIEW-01': {
    actorId: 'VIEW-01',
    displayName: 'Audit Observer (Read-Only)',
    role: 'viewer',
    tenantId: DEFAULT_TENANT_ID,
    siteId: DEFAULT_SITE_ID,
    allowedZones: ['WH-MAIN'], // Restricted Spatial ABAC: cannot access cleanroom zones
    allowedCleanlinessGrades: ['Warehouse'],
    permissions: {
      issueMove: false,
      controlVehicle: false,
      ackEstop: false,
      manageQa: false,
      manageClosures: false,
      manageMes: false,
      manageMaintenance: false,
      manageControlPlane: false,
      manageSafetyMode: false,
    },
  },
};

export function resolvePrincipal(params: {
  actorId?: string;
  role?: ActorRole;
  tenantId?: string;
  siteId?: string;
}): ActorPrincipal {
  const tenantId = params.tenantId || DEFAULT_TENANT_ID;
  const siteId = params.siteId || DEFAULT_SITE_ID;
  const actorId = params.actorId || 'DISP-01';

  const base = ACTOR_DIRECTORY[actorId];
  if (base) {
    if (base.tenantId !== tenantId || base.siteId !== siteId) {
      throw new TwinDomainError(
        'UNAUTHORIZED_RBAC',
        `Actor ${actorId} is not provisioned for tenant ${tenantId} / site ${siteId}`,
        403,
        { actorId, tenantId, siteId }
      );
    }
    return base;
  }

  // Allow dynamic principal lookup by role if actorId is a test user
  const role = params.role || 'viewer';
  const template = Object.values(ACTOR_DIRECTORY).find((a) => a.role === role) ?? ACTOR_DIRECTORY['VIEW-01'];
  return {
    ...template,
    actorId,
    tenantId,
    siteId,
  };
}

export function assertPermission(
  principal: ActorPrincipal,
  permission: keyof ActorPrincipal['permissions'],
  actionLabel: string
): void {
  if (!principal.permissions[permission]) {
    throw new TwinDomainError(
      'UNAUTHORIZED_RBAC',
      `Role '${principal.role}' (${principal.actorId}) lacks '${permission}' permission to ${actionLabel}`,
      403,
      { actorId: principal.actorId, role: principal.role, requiredPermission: permission }
    );
  }
}

export function assertSpatialAbac(
  principal: ActorPrincipal,
  zoneId: string,
  cleanlinessGrade: CleanlinessGrade,
  locationCode: string
): void {
  const zoneAllowed =
    principal.allowedZones.includes('*') || principal.allowedZones.includes(zoneId);
  const gradeAllowed = principal.allowedCleanlinessGrades.includes(cleanlinessGrade);

  if (!zoneAllowed || !gradeAllowed) {
    throw new TwinDomainError(
      'UNAUTHORIZED_SPATIAL_ABAC',
      `Actor ${principal.actorId} is not authorized for spatial zone '${zoneId}' (${cleanlinessGrade}) at ${locationCode}`,
      403,
      { actorId: principal.actorId, zoneId, cleanlinessGrade, locationCode }
    );
  }
}
