import { Injectable, NotFoundException } from '@nestjs/common';
import { NotificationSeverity, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';

type PrismaExecutor = PrismaService | Prisma.TransactionClient;

type CreateNotificationInput = {
  companyId: string;
  userId?: string | null;
  type: string;
  title: string;
  message: string;
  severity?: NotificationSeverity;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
  targetUrl?: string | null;
  metadata?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;
};

type CreateNotificationOnceInput = CreateNotificationInput & {
  dedupeWhere?: Prisma.NotificationWhereInput;
};

const PERMIT_EXPIRY_THRESHOLD_DAYS = 40;
const INSURANCE_EXPIRY_THRESHOLD_DAYS = 40;

function formatYmd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function isMissingColumnError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2022'
  );
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  private buildScopeWhere(companyId: string, userId: string): Prisma.NotificationWhereInput {
    return {
      companyId,
      OR: [{ userId: null }, { userId }],
    };
  }

  private mapNotification(notification: {
    id: string;
    type: string;
    title: string;
    message: string;
    severity: NotificationSeverity;
    relatedEntityType: string | null;
    relatedEntityId: string | null;
    targetUrl: string | null;
    isRead: boolean;
    readAt: Date | null;
    metadata: Prisma.JsonValue | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      severity: notification.severity,
      relatedEntityType: notification.relatedEntityType,
      relatedEntityId: notification.relatedEntityId,
      targetUrl: notification.targetUrl,
      isRead: notification.isRead,
      readAt: notification.readAt?.toISOString() ?? null,
      metadata: notification.metadata,
      createdAt: notification.createdAt.toISOString(),
      updatedAt: notification.updatedAt.toISOString(),
    };
  }

  private async ensureMvpGeneratedNotifications(companyId: string) {
    const today = new Date();
    const todayStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    const permitThreshold = new Date(todayStart.getTime() + PERMIT_EXPIRY_THRESHOLD_DAYS * 86_400_000);
    const insuranceThreshold = new Date(todayStart.getTime() + INSURANCE_EXPIRY_THRESHOLD_DAYS * 86_400_000);

    let buses: Array<{
      id: string;
      registrationNumber: string;
      permitExpiry: Date | null;
      insuranceExpiry: Date | null;
    }>;

    try {
      buses = await this.prisma.bus.findMany({
        where: {
          companyId,
          isActive: true,
          OR: [
            {
              permitExpiry: {
                gte: todayStart,
                lte: permitThreshold,
              },
            },
            {
              insuranceExpiry: {
                gte: todayStart,
                lte: insuranceThreshold,
              },
            },
          ],
        },
        select: {
          id: true,
          registrationNumber: true,
          permitExpiry: true,
          insuranceExpiry: true,
        },
      });
    } catch (error) {
      if (isMissingColumnError(error)) {
        return;
      }

      throw error;
    }

    for (const bus of buses) {
      if (bus.permitExpiry) {
        const permitDate = formatYmd(bus.permitExpiry);
        const message = `Bus ${bus.registrationNumber} permit expires on ${permitDate}. Renew within ${PERMIT_EXPIRY_THRESHOLD_DAYS} days.`;
        await this.createCompanyNotificationOnce({
          companyId,
          type: 'PERMIT_EXPIRY',
          title: 'Permit Expiry Alert',
          message,
          severity: 'WARNING',
          relatedEntityType: 'BUS',
          relatedEntityId: bus.id,
          targetUrl: '/buses',
          metadata: { expiryDate: permitDate, thresholdDays: PERMIT_EXPIRY_THRESHOLD_DAYS },
        });
      }

      if (bus.insuranceExpiry) {
        const insuranceDate = formatYmd(bus.insuranceExpiry);
        const message = `Bus ${bus.registrationNumber} insurance expires on ${insuranceDate}. Plan renewal.`;
        await this.createCompanyNotificationOnce({
          companyId,
          type: 'INSURANCE_EXPIRY',
          title: 'Insurance Expiry',
          message,
          severity: 'INFO',
          relatedEntityType: 'BUS',
          relatedEntityId: bus.id,
          targetUrl: '/buses',
          metadata: { expiryDate: insuranceDate, thresholdDays: INSURANCE_EXPIRY_THRESHOLD_DAYS },
        });
      }
    }
  }

  async list(companyId: string, userId: string, query: ListNotificationsQueryDto) {
    await this.ensureMvpGeneratedNotifications(companyId);

    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;

    const notifications = await this.prisma.notification.findMany({
      where: {
        ...this.buildScopeWhere(companyId, userId),
        ...(query.unreadOnly ? { isRead: false } : {}),
      },
      orderBy: { createdAt: 'desc' },
      skip: offset,
      take: limit,
    });

    return { data: notifications.map((notification) => this.mapNotification(notification)) };
  }

  async unreadCount(companyId: string, userId: string) {
    await this.ensureMvpGeneratedNotifications(companyId);

    const unreadCount = await this.prisma.notification.count({
      where: {
        ...this.buildScopeWhere(companyId, userId),
        isRead: false,
      },
    });

    return { data: { unreadCount } };
  }

  async markRead(companyId: string, userId: string, notificationId: string) {
    const notification = await this.prisma.notification.findFirst({
      where: {
        id: notificationId,
        ...this.buildScopeWhere(companyId, userId),
      },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    const updated = await this.prisma.notification.update({
      where: { id: notificationId },
      data: {
        isRead: true,
        readAt: notification.readAt ?? new Date(),
      },
    });

    return { data: this.mapNotification(updated) };
  }

  async markAllRead(companyId: string, userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: {
        ...this.buildScopeWhere(companyId, userId),
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    return { data: { updatedCount: result.count } };
  }

  async createNotification(input: CreateNotificationInput, prisma: PrismaExecutor = this.prisma) {
    return prisma.notification.create({
      data: {
        companyId: input.companyId,
        userId: input.userId ?? null,
        type: input.type,
        title: input.title,
        message: input.message,
        severity: input.severity ?? 'INFO',
        relatedEntityType: input.relatedEntityType ?? null,
        relatedEntityId: input.relatedEntityId ?? null,
        targetUrl: input.targetUrl ?? null,
        metadata: input.metadata,
      },
    });
  }

  async createNotificationOnce(
    input: CreateNotificationOnceInput,
    prisma: PrismaExecutor = this.prisma,
  ) {
    const existing = await prisma.notification.findFirst({
      where: input.dedupeWhere ?? {
        companyId: input.companyId,
        userId: input.userId ?? null,
        type: input.type,
        title: input.title,
        message: input.message,
        relatedEntityType: input.relatedEntityType ?? null,
        relatedEntityId: input.relatedEntityId ?? null,
      },
      select: { id: true },
    });

    if (existing) return existing;
    return this.createNotification(input, prisma);
  }

  async createCompanyNotification(input: Omit<CreateNotificationInput, 'userId'>, prisma: PrismaExecutor = this.prisma) {
    return this.createNotification({ ...input, userId: null }, prisma);
  }

  async createCompanyNotificationOnce(
    input: Omit<CreateNotificationOnceInput, 'userId'>,
    prisma: PrismaExecutor = this.prisma,
  ) {
    return this.createNotificationOnce({ ...input, userId: null }, prisma);
  }

  async createUserNotification(input: CreateNotificationInput, prisma: PrismaExecutor = this.prisma) {
    return this.createNotification(input, prisma);
  }
}