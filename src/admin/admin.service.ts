import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, RouteDirection, RouteHistoryActionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRouteMasterDto, StopInput } from './dto/create-route-master.dto';
import { UpdateRouteMasterDto } from './dto/update-route-master.dto';
import { ListRouteRequestsQueryDto } from './dto/list-route-requests-query.dto';
import { UpdateRouteRequestDto } from './dto/update-route-request.dto';
import { ApproveRouteRequestDto } from './dto/approve-route-request.dto';
import { RejectRouteRequestDto } from './dto/reject-route-request.dto';
import {
  buildApprovalSnapshotHash,
  buildRouteHistorySnapshot,
  isApprovalUpdateNeeded,
} from '../company-routes/route-approval.utils';

const GLOBAL_ROUTE_INCLUDE: Prisma.RouteInclude = {
  stops: {
    where: { isActive: true },
    orderBy: [{ direction: 'asc' }, { stopOrder: 'asc' }],
  },
};

const COMPANY_ROUTE_INCLUDE: Prisma.RouteInclude = {
  stops: {
    where: { isActive: true },
    orderBy: [{ direction: 'asc' }, { stopOrder: 'asc' }],
  },
  globalRoute: {
    select: {
      id: true,
      routeCode: true,
      routeName: true,
    },
  },
  company: {
    select: {
      id: true,
      name: true,
    },
  },
  createdBy: {
    select: {
      id: true,
      fullName: true,
      mobileNumber: true,
    },
  },
  reviewedBy: {
    select: {
      id: true,
      fullName: true,
      mobileNumber: true,
    },
  },
};

const ROUTE_HISTORY_INCLUDE = {
  changedByUser: {
    select: {
      id: true,
      fullName: true,
      mobileNumber: true,
    },
  },
  reviewedBy: {
    select: {
      id: true,
      fullName: true,
      mobileNumber: true,
    },
  },
} as const;

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  private decimalOrNull(value: Prisma.Decimal | number | string | null | undefined): number | null {
    if (value == null) return null;
    if (typeof value === 'number') return value;
    if (typeof value === 'string') return Number(value);
    if (typeof (value as any).toNumber === 'function') return (value as any).toNumber();
    return Number(value);
  }

  private mapRouteMaster(route: any) {
    const stops = route.stops
      .slice()
      .sort((left: any, right: any) => {
        if (left.direction !== right.direction) {
          return left.direction.localeCompare(right.direction);
        }
        return left.stopOrder - right.stopOrder;
      })
      .map((stop: any) => ({
        id: stop.id,
        direction: stop.direction,
        sequence: stop.stopOrder,
        locationName: stop.stopName,
      }));

    return {
      id: route.id,
      routeNumber: route.routeCode,
      routeCode: route.routeCode,
      routeName: route.routeName,
      startLocation: route.startLocation,
      endLocation: route.endLocation,
      distanceKm: this.decimalOrNull(route.distanceKm),
      description: route.description,
      isActive: route.isActive,
      downIsReverseOfUp: route.downIsReverseOfUp,
      stops,
      createdAt: route.createdAt,
      updatedAt: route.updatedAt,
    };
  }

  private mapRouteRequest(route: any) {
    const upStops = route.stops
      .filter((stop: any) => stop.direction === RouteDirection.UP)
      .sort((left: any, right: any) => left.stopOrder - right.stopOrder)
      .map((stop: any) => ({
        id: stop.id,
        sequence: stop.stopOrder,
        locationName: stop.stopName,
      }));

    const downStops = route.stops
      .filter((stop: any) => stop.direction === RouteDirection.DOWN)
      .sort((left: any, right: any) => left.stopOrder - right.stopOrder)
      .map((stop: any) => ({
        id: stop.id,
        sequence: stop.stopOrder,
        locationName: stop.stopName,
      }));

    return {
      id: route.id,
      companyId: route.companyId,
      company: route.company,
      routeNumber: route.routeCode,
      routeCode: route.routeCode,
      routeName: route.routeName,
      startLocation: route.startLocation,
      endLocation: route.endLocation,
      distanceKm: this.decimalOrNull(route.distanceKm),
      description: route.description,
      downIsReverseOfUp: route.downIsReverseOfUp,
      sourceType: route.sourceType,
      approvalStatus: route.approvalStatus,
      approvedSnapshotHash: route.approvedSnapshotHash,
      adminNotes: route.adminNotes,
      rejectionReason: route.rejectionReason,
      globalRouteId: route.globalRouteId,
      globalRoute: route.globalRoute
        ? {
            id: route.globalRoute.id,
            routeNumber: route.globalRoute.routeCode,
            routeCode: route.globalRoute.routeCode,
            routeName: route.globalRoute.routeName,
          }
        : null,
      updateApprovalNeeded: isApprovalUpdateNeeded(route),
      lastSubmittedAt: route.lastSubmittedAt,
      lastApprovedAt: route.lastApprovedAt,
      requestedAt: route.requestedAt,
      reviewedAt: route.reviewedAt,
      approvedAt: route.approvedAt,
      createdBy: route.createdBy,
      reviewedBy: route.reviewedBy,
      upStops,
      downStops,
      isActive: route.isActive,
      createdAt: route.createdAt,
      updatedAt: route.updatedAt,
    };
  }

  private mapHistory(history: any) {
    return {
      id: history.id,
      routeId: history.routeId,
      versionNumber: history.versionNumber,
      snapshotJson: history.snapshotJson,
      snapshotHash: history.snapshotHash,
      actionType: history.actionType,
      approvalStatus: history.approvalStatus,
      changedByUserId: history.changedByUserId,
      reviewByUserId: history.reviewByUserId,
      changedByUser: history.changedByUser,
      reviewedBy: history.reviewedBy,
      createdAt: history.createdAt,
    };
  }

  private async nextHistoryVersion(tx: Prisma.TransactionClient, routeId: string) {
    const latest = await tx.routeHistory.findFirst({
      where: { routeId },
      orderBy: { versionNumber: 'desc' },
      select: { versionNumber: true },
    });

    return (latest?.versionNumber ?? 0) + 1;
  }

  private async createRouteHistory(
    tx: Prisma.TransactionClient,
    route: any,
    actionType: RouteHistoryActionType,
    changedByUserId: string | null,
    reviewByUserId?: string | null,
  ) {
    const versionNumber = await this.nextHistoryVersion(tx, route.id);

    await tx.routeHistory.create({
      data: {
        routeId: route.id,
        versionNumber,
        snapshotJson: buildRouteHistorySnapshot(route) as Prisma.InputJsonValue,
        snapshotHash: buildApprovalSnapshotHash(route),
        actionType,
        approvalStatus: route.approvalStatus,
        changedByUserId,
        reviewByUserId: reviewByUserId ?? null,
      },
    });
  }

  private async findGlobalRouteOrThrow(id: string) {
    const route = await this.prisma.route.findFirst({
      where: {
        id,
        sourceType: 'GLOBAL',
      },
      include: GLOBAL_ROUTE_INCLUDE,
    });

    if (!route) {
      throw new NotFoundException('Global route not found');
    }

    return route;
  }

  private async ensureUniqueGlobalRouteCode(routeCode: string, excludeRouteId?: string) {
    const existing = await this.prisma.route.findFirst({
      where: {
        sourceType: 'GLOBAL',
        routeCode,
        ...(excludeRouteId ? { id: { not: excludeRouteId } } : {}),
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException(`Route code "${routeCode}" already exists`);
    }
  }

  private async replaceRouteStops(
    tx: Prisma.TransactionClient,
    routeId: string,
    upStops: StopInput[],
    downStops: StopInput[] | null,
  ) {
    await tx.routeStop.updateMany({ where: { routeId }, data: { isActive: false } });

    const rows = [
      ...upStops.map((stop, index) => ({
        routeId,
        direction: RouteDirection.UP,
        stopOrder: index + 1,
        stopName: stop.locationName,
        isActive: true,
      })),
      ...(downStops ?? []).map((stop, index) => ({
        routeId,
        direction: RouteDirection.DOWN,
        stopOrder: index + 1,
        stopName: stop.locationName,
        isActive: true,
      })),
    ];

    for (const row of rows) {
      await tx.routeStop.upsert({
        where: {
          routeId_direction_stopOrder: {
            routeId,
            direction: row.direction,
            stopOrder: row.stopOrder,
          },
        },
        update: {
          stopName: row.stopName,
          isActive: true,
        },
        create: row,
      });
    }
  }

  private async findRouteRequestOrThrow(id: string) {
    const route = await this.prisma.route.findUnique({
      where: { id },
      include: COMPANY_ROUTE_INCLUDE,
    });

    if (!route || route.sourceType !== 'COMPANY_REQUEST') {
      throw new NotFoundException('Route request not found');
    }

    return route;
  }

  async listRouteMasters(includeInactive = false) {
    const routes = await this.prisma.route.findMany({
      where: {
        sourceType: 'GLOBAL',
        ...(includeInactive ? {} : { isActive: true }),
      },
      orderBy: [{ routeCode: 'asc' }, { routeName: 'asc' }],
      include: GLOBAL_ROUTE_INCLUDE,
    });

    return routes.map((route) => this.mapRouteMaster(route));
  }

  async getRouteMaster(id: string) {
    const route = await this.findGlobalRouteOrThrow(id);
    return this.mapRouteMaster(route);
  }

  async createRouteMaster(dto: CreateRouteMasterDto) {
    const routeCode = dto.routeNumber ?? dto.routeCode;
    if (!routeCode?.trim()) {
      throw new BadRequestException('routeNumber (or routeCode) is required');
    }

    await this.ensureUniqueGlobalRouteCode(routeCode);

    const downIsReverse = dto.downIsReverseOfUp ?? true;
    const { routeNumber: _rn, upStops = [], downStops = [], downIsReverseOfUp: _dr, ...fields } = dto;

    const created = await this.prisma.$transaction(async (tx) => {
      const route = await tx.route.create({
        data: {
          ...fields,
          companyId: null,
          routeCode,
          distanceKm: dto.distanceKm != null ? new Prisma.Decimal(dto.distanceKm) : null,
          downIsReverseOfUp: downIsReverse,
          sourceType: 'GLOBAL',
          approvalStatus: 'APPROVED',
          isActive: true,
        },
      });

      await this.replaceRouteStops(tx, route.id, upStops, downIsReverse ? null : downStops);

      return tx.route.findUniqueOrThrow({
        where: { id: route.id },
        include: GLOBAL_ROUTE_INCLUDE,
      });
    });

    return this.mapRouteMaster(created);
  }

  async updateRouteMaster(id: string, dto: UpdateRouteMasterDto) {
    await this.findGlobalRouteOrThrow(id);

    const resolvedRouteCode = dto.routeNumber ?? dto.routeCode;
    if (resolvedRouteCode) {
      await this.ensureUniqueGlobalRouteCode(resolvedRouteCode, id);
    }

    const { routeNumber: _rn, upStops, downStops, downIsReverseOfUp, distanceKm, ...scalarFields } = dto;
    const stopsChanged = upStops !== undefined || downStops !== undefined || downIsReverseOfUp !== undefined;

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.route.update({
        where: { id },
        data: {
          ...scalarFields,
          ...(resolvedRouteCode !== undefined ? { routeCode: resolvedRouteCode } : {}),
          ...(distanceKm !== undefined
            ? { distanceKm: distanceKm != null ? new Prisma.Decimal(distanceKm) : null }
            : {}),
          ...(downIsReverseOfUp !== undefined ? { downIsReverseOfUp } : {}),
        },
      });

      if (stopsChanged) {
        const route = await tx.route.findUniqueOrThrow({ where: { id }, include: GLOBAL_ROUTE_INCLUDE });
        const resolvedReverse = downIsReverseOfUp ?? route.downIsReverseOfUp;
        const nextUpStops =
          upStops ??
          route.stops
            .filter((stop) => stop.direction === RouteDirection.UP)
            .sort((left, right) => left.stopOrder - right.stopOrder)
            .map((stop) => ({ locationName: stop.stopName }));
        const nextDownStops = resolvedReverse
          ? null
          : downStops ??
            route.stops
              .filter((stop) => stop.direction === RouteDirection.DOWN)
              .sort((left, right) => left.stopOrder - right.stopOrder)
              .map((stop) => ({ locationName: stop.stopName }));

        await this.replaceRouteStops(tx, id, nextUpStops, nextDownStops);
      }

      return tx.route.findUniqueOrThrow({
        where: { id },
        include: GLOBAL_ROUTE_INCLUDE,
      });
    });

    return this.mapRouteMaster(updated);
  }

  async deleteRouteMaster(id: string) {
    await this.findGlobalRouteOrThrow(id);
    await this.prisma.route.delete({ where: { id } });
    return { success: true };
  }

  private async applyRouteRequestEdits(
    tx: Prisma.TransactionClient,
    routeId: string,
    existingRoute: any,
    dto: UpdateRouteRequestDto,
    reviewerId: string,
  ) {
    const routeNumber = dto.routeNumber;
    if (routeNumber) {
      const conflict = await tx.route.findFirst({
        where: {
          id: { not: routeId },
          companyId: existingRoute.companyId,
          routeCode: routeNumber,
        },
        select: { id: true },
      });
      if (conflict) {
        throw new ConflictException(`Route number "${routeNumber}" already exists in company`);
      }
    }

    const updated = await tx.route.update({
      where: { id: routeId },
      data: {
        ...(routeNumber !== undefined ? { routeCode: routeNumber } : {}),
        ...(dto.routeName !== undefined ? { routeName: dto.routeName } : {}),
        ...(dto.startLocation !== undefined ? { startLocation: dto.startLocation } : {}),
        ...(dto.endLocation !== undefined ? { endLocation: dto.endLocation } : {}),
        ...(dto.distanceKm !== undefined
          ? {
              distanceKm: dto.distanceKm != null ? new Prisma.Decimal(dto.distanceKm) : null,
            }
          : {}),
        ...(dto.description !== undefined ? { description: dto.description?.trim() || null } : {}),
        ...(dto.downIsReverseOfUp !== undefined ? { downIsReverseOfUp: dto.downIsReverseOfUp } : {}),
        ...(dto.adminNotes !== undefined ? { adminNotes: dto.adminNotes?.trim() || null } : {}),
        reviewedByUserId: reviewerId,
        reviewedAt: new Date(),
      },
      include: COMPANY_ROUTE_INCLUDE,
    });

    const shouldRewriteStops =
      dto.upStops !== undefined ||
      dto.downStops !== undefined ||
      dto.downIsReverseOfUp !== undefined;

    if (shouldRewriteStops) {
      const nextUpStops =
        dto.upStops ??
        updated.stops
          .filter((stop) => stop.direction === RouteDirection.UP)
          .sort((left, right) => left.stopOrder - right.stopOrder)
          .map((stop) => ({ locationName: stop.stopName }));
      const resolvedReverse = dto.downIsReverseOfUp ?? updated.downIsReverseOfUp;
      const nextDownStops = resolvedReverse
        ? null
        : dto.downStops ??
          updated.stops
            .filter((stop) => stop.direction === RouteDirection.DOWN)
            .sort((left, right) => left.stopOrder - right.stopOrder)
            .map((stop) => ({ locationName: stop.stopName }));

      await this.replaceRouteStops(tx, routeId, nextUpStops, nextDownStops);
    }

    return tx.route.findUniqueOrThrow({
      where: { id: routeId },
      include: COMPANY_ROUTE_INCLUDE,
    });
  }

  async listRouteRequests(query: ListRouteRequestsQueryDto) {
    const requests = await this.prisma.route.findMany({
      where: {
        sourceType: 'COMPANY_REQUEST',
        approvalStatus: query.status
          ? (query.status as any)
          : { in: ['PENDING_APPROVAL', 'PENDING_UPDATE_APPROVAL'] },
      },
      orderBy: [{ lastSubmittedAt: 'asc' }, { requestedAt: 'asc' }, { createdAt: 'asc' }],
      include: COMPANY_ROUTE_INCLUDE,
    });

    return { requests: requests.map((route) => this.mapRouteRequest(route)) };
  }

  async getRouteRequest(id: string) {
    const route = await this.findRouteRequestOrThrow(id);
    return { request: this.mapRouteRequest(route) };
  }

  async updateRouteRequest(id: string, dto: UpdateRouteRequestDto, reviewerId: string) {
    const existing = await this.findRouteRequestOrThrow(id);

    if (
      existing.approvalStatus !== 'PENDING_APPROVAL' &&
      existing.approvalStatus !== 'PENDING_UPDATE_APPROVAL'
    ) {
      throw new BadRequestException('Only pending requests can be edited');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const route = await this.applyRouteRequestEdits(tx, id, existing, dto, reviewerId);
      await this.createRouteHistory(tx, route, RouteHistoryActionType.UPDATED, reviewerId, reviewerId);
      return route;
    });

    return { request: this.mapRouteRequest(updated) };
  }

  async approveRouteRequest(id: string, dto: ApproveRouteRequestDto, reviewerId: string) {
    const existing = await this.findRouteRequestOrThrow(id);

    if (
      existing.approvalStatus !== 'PENDING_APPROVAL' &&
      existing.approvalStatus !== 'PENDING_UPDATE_APPROVAL'
    ) {
      throw new BadRequestException('Only pending requests can be approved');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const edited = await this.applyRouteRequestEdits(tx, id, existing, dto, reviewerId);
      const editedUpStops = edited.stops
        .filter((stop) => stop.direction === RouteDirection.UP)
        .sort((left, right) => left.stopOrder - right.stopOrder)
        .map((stop) => ({ locationName: stop.stopName }));
      const editedDownStops = edited.stops
        .filter((stop) => stop.direction === RouteDirection.DOWN)
        .sort((left, right) => left.stopOrder - right.stopOrder)
        .map((stop) => ({ locationName: stop.stopName }));

      let globalRouteId = dto.globalRouteId ?? edited.globalRouteId;
      if (globalRouteId) {
        const linkedRoute = await tx.route.findFirst({
          where: {
            id: globalRouteId,
            sourceType: 'GLOBAL',
          },
          select: {
            id: true,
            isActive: true,
          },
        });

        if (!linkedRoute) {
          throw new NotFoundException('Selected global route not found');
        }

        if (!linkedRoute.isActive) {
          throw new BadRequestException('Selected global route is inactive');
        }

        const finalRouteCode = edited.routeCode;
        if (!finalRouteCode?.trim()) {
          throw new BadRequestException('Approved route must have a route number');
        }

        const conflict = await tx.route.findFirst({
          where: {
            id: { not: globalRouteId },
            sourceType: 'GLOBAL',
            routeCode: finalRouteCode,
          },
          select: { id: true },
        });
        if (conflict) {
          throw new ConflictException(`Global route number "${finalRouteCode}" already exists`);
        }

        await tx.route.update({
          where: { id: globalRouteId },
          data: {
            routeCode: finalRouteCode,
            routeName: edited.routeName,
            startLocation: edited.startLocation,
            endLocation: edited.endLocation,
            distanceKm: edited.distanceKm,
            description: edited.description,
            downIsReverseOfUp: edited.downIsReverseOfUp,
            sourceType: 'GLOBAL',
            approvalStatus: 'APPROVED',
            isActive: true,
          },
        });

        await this.replaceRouteStops(
          tx,
          globalRouteId,
          editedUpStops,
          edited.downIsReverseOfUp ? null : editedDownStops,
        );
      }

      if (!globalRouteId) {
        const finalRouteCode = edited.routeCode;
        if (!finalRouteCode?.trim()) {
          throw new BadRequestException('Approved route must have a route number');
        }

        const conflict = await tx.route.findFirst({
          where: {
            sourceType: 'GLOBAL',
            routeCode: finalRouteCode,
          },
          select: { id: true },
        });
        if (conflict) {
          throw new ConflictException(`Global route number "${finalRouteCode}" already exists`);
        }

        const globalRoute = await tx.route.create({
          data: {
            companyId: null,
            routeCode: finalRouteCode,
            routeName: edited.routeName,
            startLocation: edited.startLocation,
            endLocation: edited.endLocation,
            distanceKm: edited.distanceKm,
            description: edited.description,
            downIsReverseOfUp: edited.downIsReverseOfUp,
            sourceType: 'GLOBAL',
            approvalStatus: 'APPROVED',
            isActive: true,
          },
        });

        await this.replaceRouteStops(
          tx,
          globalRoute.id,
          editedUpStops,
          edited.downIsReverseOfUp ? null : editedDownStops,
        );

        globalRouteId = globalRoute.id;
      }

      const approvedAt = new Date();
      const approvedSnapshotHash = buildApprovalSnapshotHash(edited);
      const approvedRoute = await tx.route.update({
        where: { id },
        data: {
          approvalStatus: 'APPROVED',
          reviewedByUserId: reviewerId,
          reviewedAt: approvedAt,
          approvedAt,
          lastApprovedAt: approvedAt,
          approvedSnapshotHash,
          sourceType: 'COMPANY_REQUEST',
          rejectionReason: null,
          globalRouteId,
        },
        include: COMPANY_ROUTE_INCLUDE,
      });

      await this.createRouteHistory(tx, approvedRoute, RouteHistoryActionType.APPROVED, reviewerId, reviewerId);

      const globalRoute = globalRouteId
        ? await tx.route.findUnique({
            where: { id: globalRouteId },
            include: GLOBAL_ROUTE_INCLUDE,
          })
        : null;

      return {
        approvedRoute,
        globalRoute: globalRoute ? this.mapRouteMaster(globalRoute) : null,
      };
    });

    return {
      request: this.mapRouteRequest(result.approvedRoute),
      globalRoute: result.globalRoute,
    };
  }

  async rejectRouteRequest(id: string, dto: RejectRouteRequestDto, reviewerId: string) {
    const existing = await this.findRouteRequestOrThrow(id);

    if (
      existing.approvalStatus !== 'PENDING_APPROVAL' &&
      existing.approvalStatus !== 'PENDING_UPDATE_APPROVAL'
    ) {
      throw new BadRequestException('Only pending requests can be rejected');
    }

    const rejected = await this.prisma.$transaction(async (tx) => {
      const route = await tx.route.update({
        where: { id },
        data: {
          approvalStatus:
            existing.approvalStatus === 'PENDING_UPDATE_APPROVAL'
              ? 'UPDATE_REJECTED'
              : 'REJECTED',
          reviewedByUserId: reviewerId,
          reviewedAt: new Date(),
          approvedAt: null,
          rejectionReason: dto.rejectionReason.trim(),
          adminNotes: dto.adminNotes?.trim() || null,
        },
        include: COMPANY_ROUTE_INCLUDE,
      });

      await this.createRouteHistory(tx, route, RouteHistoryActionType.REJECTED, reviewerId, reviewerId);

      return route;
    });

    return { request: this.mapRouteRequest(rejected) };
  }

  async getRouteRequestHistory(id: string) {
    await this.findRouteRequestOrThrow(id);

    const history = await this.prisma.routeHistory.findMany({
      where: { routeId: id },
      orderBy: [{ versionNumber: 'desc' }, { createdAt: 'desc' }],
      include: ROUTE_HISTORY_INCLUDE,
    });

    return { history: history.map((entry) => this.mapHistory(entry)) };
  }

  async getRouteRequestApprovalStatus(id: string) {
    const route = await this.findRouteRequestOrThrow(id);
    const latestApprovedVersion = await this.prisma.routeHistory.findFirst({
      where: {
        routeId: id,
        actionType: RouteHistoryActionType.APPROVED,
      },
      orderBy: [{ versionNumber: 'desc' }, { createdAt: 'desc' }],
      include: ROUTE_HISTORY_INCLUDE,
    });

    return {
      routeId: route.id,
      approvalStatus: route.approvalStatus,
      updateApprovalNeeded: isApprovalUpdateNeeded(route),
      rejectionReason: route.rejectionReason,
      reviewedByUserId: route.reviewedByUserId,
      globalRouteId: route.globalRouteId,
      lastSubmittedAt: route.lastSubmittedAt,
      lastApprovedAt: route.lastApprovedAt,
      latestApprovedVersion: latestApprovedVersion ? this.mapHistory(latestApprovedVersion) : null,
    };
  }

  async getDashboardStats() {
    const [totalCompanies, activeCompanies, totalUsers, totalRoutes] = await Promise.all([
      this.prisma.company.count(),
      this.prisma.company.count({ where: { isActive: true } }),
      this.prisma.user.count({ where: { isActive: true } }),
      this.prisma.route.count({ where: { sourceType: 'GLOBAL', isActive: true } }),
    ]);

    return { totalCompanies, activeCompanies, totalUsers, totalRouteTemplates: totalRoutes };
  }
}
