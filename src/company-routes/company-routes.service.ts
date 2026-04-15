import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, RouteDirection, RouteHistoryActionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCompanyRouteDto } from './dto/create-company-route.dto';
import { UpdateCompanyRouteDto } from './dto/update-company-route.dto';
import { StopInputDto } from './dto/stop-input.dto';
import { ListCompanyRoutesQueryDto } from './dto/list-company-routes-query.dto';
import { NotificationsService } from '../notifications/notifications.service';
import {
  buildApprovalSnapshotHash,
  buildRouteHistorySnapshot,
  isApprovalUpdateNeeded,
} from './route-approval.utils';

const ROUTE_INCLUDE: Prisma.RouteInclude = {
  stops: {
    where: { isActive: true },
    orderBy: [{ direction: 'asc' }, { stopOrder: 'asc' }],
  },
  company: { select: { id: true, name: true } },
  globalRoute: {
    select: {
      id: true,
      routeCode: true,
      routeName: true,
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
export class CompanyRoutesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  private decimalOrNull(value: Prisma.Decimal | number | string | null | undefined): number | null {
    if (value == null) return null;
    if (typeof value === 'number') return value;
    if (typeof value === 'string') return Number(value);
    if (typeof (value as any).toNumber === 'function') return (value as any).toNumber();
    return Number(value);
  }

  private mapStops(route: any) {
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

    return { upStops, downStops };
  }

  private mapRoute(route: any) {
    const { upStops, downStops } = this.mapStops(route);

    return {
      id: route.id,
      companyId: route.companyId,
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
      isActive: route.isActive,
      upStops,
      downStops,
      company: route.company,
      createdAt: route.createdAt,
      updatedAt: route.updatedAt,
    };
  }

  private mapGlobalRoute(route: any) {
    const { upStops, downStops } = this.mapStops(route);

    return {
      id: route.id,
      routeNumber: route.routeCode,
      routeCode: route.routeCode,
      routeName: route.routeName,
      startLocation: route.startLocation,
      endLocation: route.endLocation,
      distanceKm: this.decimalOrNull(route.distanceKm),
      description: route.description,
      downIsReverseOfUp: route.downIsReverseOfUp,
      sourceType: 'GLOBAL',
      approvalStatus: 'APPROVED',
      isActive: route.isActive,
      upStops,
      downStops,
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

  private async findCompanyRouteOrThrow(companyId: string, id: string) {
    const route = await this.prisma.route.findFirst({
      where: { id, companyId },
      include: ROUTE_INCLUDE,
    });

    if (!route) {
      throw new NotFoundException('Route not found');
    }

    return route;
  }

  async listGlobal() {
    const routes = await this.prisma.route.findMany({
      where: {
        sourceType: 'GLOBAL',
        isActive: true,
      },
      orderBy: [{ routeCode: 'asc' }, { routeName: 'asc' }],
      include: ROUTE_INCLUDE,
    });

    return { routes: routes.map((route) => this.mapGlobalRoute(route)) };
  }

  private async ensureUniqueRouteNumber(
    companyId: string,
    routeNumber: string,
    excludeRouteId?: string,
  ) {
    const conflict = await this.prisma.route.findFirst({
      where: {
        companyId,
        routeCode: routeNumber,
        ...(excludeRouteId ? { id: { not: excludeRouteId } } : {}),
      },
      select: { id: true },
    });

    if (conflict) {
      throw new ConflictException(`Route number "${routeNumber}" already exists in your company`);
    }
  }

  private async replaceStops(
    tx: Prisma.TransactionClient,
    routeId: string,
    upStops: StopInputDto[],
    downStops: StopInputDto[] | null,
  ) {
    await tx.routeStop.updateMany({ where: { routeId }, data: { isActive: false } });

    const rows = [
      ...upStops.map((stop, index) => ({
        routeId,
        direction: RouteDirection.UP,
        stopName: stop.locationName,
        stopOrder: index + 1,
        isActive: true,
      })),
      ...(downStops ?? []).map((stop, index) => ({
        routeId,
        direction: RouteDirection.DOWN,
        stopName: stop.locationName,
        stopOrder: index + 1,
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

  async list(companyId: string, query: ListCompanyRoutesQueryDto) {
    const routes = await this.prisma.route.findMany({
      where: {
        companyId,
        ...(query.approvalStatus ? { approvalStatus: query.approvalStatus as any } : {}),
      },
      orderBy: [{ updatedAt: 'desc' }, { routeName: 'asc' }],
      include: ROUTE_INCLUDE,
    });

    return { routes: routes.map((route) => this.mapRoute(route)) };
  }

  async getById(companyId: string, id: string) {
    const route = await this.findCompanyRouteOrThrow(companyId, id);
    return { route: this.mapRoute(route) };
  }

  async create(companyId: string, userId: string, dto: CreateCompanyRouteDto) {
    await this.ensureUniqueRouteNumber(companyId, dto.routeNumber);

    const downIsReverseOfUp = dto.downIsReverseOfUp ?? true;

    const route = await this.prisma.$transaction(async (tx) => {
      const created = await tx.route.create({
        data: {
          companyId,
          createdByUserId: userId,
          routeCode: dto.routeNumber,
          routeName: dto.routeName,
          startLocation: dto.startLocation,
          endLocation: dto.endLocation,
          distanceKm: dto.distanceKm != null ? new Prisma.Decimal(dto.distanceKm) : null,
          description: dto.description?.trim() || null,
          downIsReverseOfUp,
          sourceType: 'COMPANY_PRIVATE',
          approvalStatus: 'PRIVATE_ACTIVE',
          isActive: true,
        },
      });

      await this.replaceStops(
        tx,
        created.id,
        dto.upStops,
        downIsReverseOfUp ? null : dto.downStops ?? [],
      );

      const routeWithStops = await tx.route.findUniqueOrThrow({
        where: { id: created.id },
        include: ROUTE_INCLUDE,
      });

      await this.createRouteHistory(tx, routeWithStops, RouteHistoryActionType.CREATED, userId);

      return routeWithStops;
    });

    return { route: this.mapRoute(route) };
  }

  async update(companyId: string, id: string, userId: string, dto: UpdateCompanyRouteDto) {
    const existing = await this.findCompanyRouteOrThrow(companyId, id);

    if (
      existing.approvalStatus === 'PENDING_APPROVAL' ||
      existing.approvalStatus === 'PENDING_UPDATE_APPROVAL'
    ) {
      throw new BadRequestException('Route is currently pending admin approval');
    }

    if (dto.routeNumber) {
      await this.ensureUniqueRouteNumber(companyId, dto.routeNumber, id);
    }

    const shouldRewriteStops =
      dto.upStops !== undefined ||
      dto.downStops !== undefined ||
      dto.downIsReverseOfUp !== undefined;

    const approvedBaselineHash =
      existing.approvalStatus === 'APPROVED'
        ? existing.approvedSnapshotHash ?? buildApprovalSnapshotHash(existing)
        : null;

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.route.update({
        where: { id },
        data: {
          ...(dto.routeNumber !== undefined ? { routeCode: dto.routeNumber } : {}),
          ...(dto.routeName !== undefined ? { routeName: dto.routeName } : {}),
          ...(dto.startLocation !== undefined ? { startLocation: dto.startLocation } : {}),
          ...(dto.endLocation !== undefined ? { endLocation: dto.endLocation } : {}),
          ...(dto.distanceKm !== undefined
            ? {
                distanceKm:
                  dto.distanceKm != null ? new Prisma.Decimal(dto.distanceKm) : null,
              }
            : {}),
          ...(dto.description !== undefined
            ? { description: dto.description?.trim() || null }
            : {}),
          ...(dto.downIsReverseOfUp !== undefined
            ? { downIsReverseOfUp: dto.downIsReverseOfUp }
            : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
      });

      if (shouldRewriteStops) {
        const route = await tx.route.findUniqueOrThrow({
          where: { id },
          include: ROUTE_INCLUDE,
        });

        const upStops =
          dto.upStops ??
          route.stops
            .filter((stop) => stop.direction === RouteDirection.UP)
            .sort((left, right) => left.stopOrder - right.stopOrder)
            .map((stop) => ({ locationName: stop.stopName }));

        const resolvedReverse = dto.downIsReverseOfUp ?? route.downIsReverseOfUp;
        const downStops = resolvedReverse
          ? null
          : dto.downStops ??
            route.stops
              .filter((stop) => stop.direction === RouteDirection.DOWN)
              .sort((left, right) => left.stopOrder - right.stopOrder)
              .map((stop) => ({ locationName: stop.stopName }));

        await this.replaceStops(tx, id, upStops, downStops);
      }

      let route = await tx.route.findUniqueOrThrow({
        where: { id },
        include: ROUTE_INCLUDE,
      });

      if (
        existing.approvalStatus === 'APPROVED' &&
        approvedBaselineHash &&
        buildApprovalSnapshotHash(route) !== approvedBaselineHash
      ) {
        route = await tx.route.update({
          where: { id },
          data: {
            approvalStatus: 'DRAFT',
            reviewedByUserId: null,
            reviewedAt: null,
            approvedAt: null,
            requestedAt: null,
            rejectionReason: null,
          },
          include: ROUTE_INCLUDE,
        });

        await this.notificationsService.createCompanyNotificationOnce(
          {
            companyId,
            type: 'ROUTE_UPDATE_APPROVAL_REQUIRED',
            title: 'Route Needs Re-Approval',
            message: `Changes to route ${route.routeCode ?? route.routeName} require admin approval before it can be approved again.`,
            severity: 'WARNING',
            relatedEntityType: 'ROUTE',
            relatedEntityId: route.id,
            targetUrl: '/routes',
            metadata: {
              routeId: route.id,
              routeCode: route.routeCode,
              routeName: route.routeName,
              approvalStatus: route.approvalStatus,
            },
            dedupeWhere: {
              companyId,
              userId: null,
              type: 'ROUTE_UPDATE_APPROVAL_REQUIRED',
              relatedEntityType: 'ROUTE',
              relatedEntityId: route.id,
              isRead: false,
            },
          },
          tx,
        );
      }

      await this.createRouteHistory(tx, route, RouteHistoryActionType.UPDATED, userId);

      return route;
    });

    return { route: this.mapRoute(updated) };
  }

  async submitForApproval(companyId: string, id: string, userId: string) {
    const route = await this.findCompanyRouteOrThrow(companyId, id);

    if (
      route.approvalStatus === 'PENDING_APPROVAL' ||
      route.approvalStatus === 'PENDING_UPDATE_APPROVAL'
    ) {
      throw new ConflictException('Route is already pending admin approval');
    }

    if (route.approvalStatus === 'APPROVED' && !isApprovalUpdateNeeded(route)) {
      throw new ConflictException('Route is already approved');
    }

    const nextApprovalStatus =
      route.lastApprovedAt || route.approvedSnapshotHash
        ? 'PENDING_UPDATE_APPROVAL'
        : 'PENDING_APPROVAL';

    const updated = await this.prisma.$transaction(async (tx) => {
      const submittedAt = new Date();
      const submitted = await tx.route.update({
        where: { id },
        data: {
          sourceType: 'COMPANY_REQUEST',
          approvalStatus: nextApprovalStatus,
          requestedAt: submittedAt,
          lastSubmittedAt: submittedAt,
          reviewedByUserId: null,
          reviewedAt: null,
          approvedAt: null,
          rejectionReason: null,
          adminNotes: null,
          createdByUserId: route.createdByUserId ?? userId,
        },
        include: ROUTE_INCLUDE,
      });

      await this.createRouteHistory(
        tx,
        submitted,
        RouteHistoryActionType.SUBMITTED_FOR_APPROVAL,
        userId,
      );

      return submitted;
    });

    return { route: this.mapRoute(updated) };
  }

  async getHistory(companyId: string, id: string) {
    await this.findCompanyRouteOrThrow(companyId, id);

    const history = await this.prisma.routeHistory.findMany({
      where: { routeId: id },
      orderBy: [{ versionNumber: 'desc' }, { createdAt: 'desc' }],
      include: ROUTE_HISTORY_INCLUDE,
    });

    return { history: history.map((entry) => this.mapHistory(entry)) };
  }

  async getApprovalStatus(companyId: string, id: string) {
    const route = await this.findCompanyRouteOrThrow(companyId, id);
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
      latestApprovedVersion: latestApprovedVersion
        ? this.mapHistory(latestApprovedVersion)
        : null,
    };
  }
}
