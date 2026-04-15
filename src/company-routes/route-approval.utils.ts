import { createHash } from 'crypto';
import { RouteDirection } from '@prisma/client';

type RouteStopLike = {
  direction: RouteDirection | string;
  stopOrder?: number | null;
  sequence?: number | null;
  stopName?: string | null;
  locationName?: string | null;
  isActive?: boolean | null;
};

type RouteLike = {
  id?: string;
  companyId?: string | null;
  routeCode?: string | null;
  routeName: string;
  startLocation: string;
  endLocation: string;
  description?: string | null;
  distanceKm?: { toNumber?: () => number } | number | string | null;
  downIsReverseOfUp?: boolean | null;
  sourceType?: string | null;
  approvalStatus?: string | null;
  adminNotes?: string | null;
  rejectionReason?: string | null;
  requestedAt?: Date | null;
  reviewedAt?: Date | null;
  approvedAt?: Date | null;
  lastSubmittedAt?: Date | null;
  lastApprovedAt?: Date | null;
  approvedSnapshotHash?: string | null;
  globalRouteId?: string | null;
  stops: RouteStopLike[];
};

function normalizeText(value: string | null | undefined) {
  return (value ?? '').trim();
}

function decimalOrNull(
  value: { toNumber?: () => number } | number | string | null | undefined,
): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  if (typeof value.toNumber === 'function') return value.toNumber();
  return Number(value);
}

function orderedStops(route: RouteLike, direction: RouteDirection): string[] {
  const stops = route.stops
    .filter((stop) => (stop.isActive ?? true) && stop.direction === direction)
    .sort((left, right) => {
      const leftOrder = left.stopOrder ?? left.sequence ?? 0;
      const rightOrder = right.stopOrder ?? right.sequence ?? 0;
      return leftOrder - rightOrder;
    })
    .map((stop) => normalizeText(stop.stopName ?? stop.locationName));

  if (direction === RouteDirection.DOWN) {
    if (stops.length > 0) {
      return stops;
    }

    if (route.downIsReverseOfUp) {
      return [...orderedStops(route, RouteDirection.UP)].reverse();
    }
  }

  return stops;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => stableValue(item));
  }

  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        result[key] = stableValue((value as Record<string, unknown>)[key]);
        return result;
      }, {});
  }

  return value;
}

export function stableStringify(value: unknown) {
  return JSON.stringify(stableValue(value));
}

export function buildApprovalSnapshot(route: RouteLike) {
  return {
    routeNumber: normalizeText(route.routeCode),
    name: normalizeText(route.routeName),
    startLocation: normalizeText(route.startLocation),
    endLocation: normalizeText(route.endLocation),
    scopeType: route.sourceType === 'GLOBAL' ? 'GLOBAL' : 'COMPANY',
    upStops: orderedStops(route, RouteDirection.UP),
    downStops: orderedStops(route, RouteDirection.DOWN),
  };
}

export function buildApprovalSnapshotHash(route: RouteLike) {
  return createHash('sha256')
    .update(stableStringify(buildApprovalSnapshot(route)))
    .digest('hex');
}

export function buildRouteHistorySnapshot(route: RouteLike) {
  return {
    routeId: route.id ?? null,
    companyId: route.companyId ?? null,
    routeNumber: normalizeText(route.routeCode),
    routeName: normalizeText(route.routeName),
    startLocation: normalizeText(route.startLocation),
    endLocation: normalizeText(route.endLocation),
    description: route.description?.trim() || null,
    distanceKm: decimalOrNull(route.distanceKm),
    downIsReverseOfUp: route.downIsReverseOfUp ?? true,
    sourceType: route.sourceType ?? null,
    approvalStatus: route.approvalStatus ?? null,
    globalRouteId: route.globalRouteId ?? null,
    approvedSnapshotHash: route.approvedSnapshotHash ?? null,
    lastSubmittedAt: route.lastSubmittedAt?.toISOString() ?? null,
    lastApprovedAt: route.lastApprovedAt?.toISOString() ?? null,
    requestedAt: route.requestedAt?.toISOString() ?? null,
    reviewedAt: route.reviewedAt?.toISOString() ?? null,
    approvedAt: route.approvedAt?.toISOString() ?? null,
    adminNotes: route.adminNotes?.trim() || null,
    rejectionReason: route.rejectionReason?.trim() || null,
    upStops: orderedStops(route, RouteDirection.UP),
    downStops: orderedStops(route, RouteDirection.DOWN),
    approvalSnapshot: buildApprovalSnapshot(route),
  };
}

export function isApprovalUpdateNeeded(route: Pick<RouteLike, 'approvedSnapshotHash' | 'stops' | 'routeCode' | 'routeName' | 'startLocation' | 'endLocation' | 'sourceType' | 'downIsReverseOfUp'>) {
  if (!route.approvedSnapshotHash) {
    return false;
  }

  return buildApprovalSnapshotHash(route as RouteLike) !== route.approvedSnapshotHash;
}