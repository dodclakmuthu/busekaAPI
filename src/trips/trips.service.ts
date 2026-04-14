import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ListTripsQueryDto } from './dto/list-trips-query.dto';
import { TripSummaryQueryDto } from './dto/trip-summary-query.dto';
import { StartTripDto, TripDirectionDto } from './dto/start-trip.dto';
import { CreateTripExpenseDto } from './dto/create-trip-expense.dto';
import { EndTripDto } from './dto/end-trip.dto';
import { Prisma } from '@prisma/client';
import {
  formatHHMMInSriLanka,
  getBusinessDayRangeUtc,
} from '../common/business-day';
import {
  decimalToNumber,
  mapExpenseCategoryToDashboard,
  mapExtraIncomeCategoryToDashboard,
  normalizeExpenseCategory,
  normalizeExtraIncomeCategory,
} from '../common/finance';
import { CreateExtraIncomeDto } from './dto/create-extra-income.dto';
import { NotificationsService } from '../notifications/notifications.service';

const DRIVER_ROLES = ['DRIVER', 'DRIVER_CONDUCTOR'] as const;
const CONDUCTOR_ROLES = ['CONDUCTOR', 'DRIVER_CONDUCTOR'] as const;

type DashboardExpenseEntry = {
  id: string;
  tripId: string | null;
  busId: string;
  date: string;
  category: string;
  amount: number;
  description: string | null;
  enteredBy: string;
  timestamp: string;
};

type DashboardIncomeEntry = {
  id: string;
  tripId: string | null;
  busId: string;
  date: string;
  category: string;
  amount: number;
  description: string | null;
  enteredBy: string;
  timestamp: string;
};

function dateToYmdUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function mapTripStatus(status: string): string {
  switch (status) {
    case 'IN_PROGRESS':
      return 'in-progress';
    case 'COMPLETED':
      return 'completed';
    case 'CANCELLED':
      return 'cancelled';
    case 'NOT_STARTED':
    default:
      return 'scheduled';
  }
}


@Injectable()
export class TripsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ── Queries ────────────────────────────────────────────────────────────────

  async listTrips(companyId: string, query: ListTripsQueryDto) {
    const dayRange = getBusinessDayRangeUtc(query);

    const trips = await this.prisma.trip.findMany({
      where: {
        companyId,
        ...(query.busId ? { busId: query.busId } : {}),
        ...(dayRange ? { tripDate: { gte: dayRange.start, lt: dayRange.end } } : {}),
      },
      select: {
        id: true,
        busId: true,
        routeId: true,
        tripDate: true,
        tripNumber: true,
        startStopId: true,
        endStopId: true,
        driverStaffId: true,
        conductorStaffId: true,
        startedAt: true,
        endedAt: true,
        status: true,
      },
      orderBy: [{ tripDate: 'desc' }, { tripNumber: 'asc' }],
      take: 200,
    });

    const tripIds = trips.map((t) => t.id);

    const [incomeSums, expenseSums] = await Promise.all([
      this.sumTripIncome(tripIds),
      this.sumTripExpenses(tripIds),
    ]);

    const apiTrips = trips.map((t) => ({
      id: t.id,
      busId: t.busId,
      driverId: t.driverStaffId ?? '',
      conductorId: t.conductorStaffId ?? null,
      routeId: t.routeId ?? null,
      date: dateToYmdUtc(t.tripDate),
      tripNumber: t.tripNumber,
      startPointId: t.startStopId ?? '',
      endPointId: t.endStopId ?? null,
      startTime: t.startedAt ? formatHHMMInSriLanka(t.startedAt) : '',
      endTime: t.endedAt ? formatHHMMInSriLanka(t.endedAt) : null,
      status: mapTripStatus(t.status),
      income: incomeSums[t.id] ?? 0,
      notes: null,
      passengerCount: null,
      // Not part of ApiTrip, but handy if frontend wants it later.
      expenseTotal: expenseSums[t.id] ?? 0,
    }));

    return { trips: apiTrips };
  }

  async getBusTripSummary(companyId: string, query: TripSummaryQueryDto) {
    const dayRange = getBusinessDayRangeUtc(query) ?? getBusinessDayRangeUtc({ today: true });
    if (!dayRange) throw new BadRequestException('Invalid date');

    const bus = await this.prisma.bus.findFirst({
      where: { id: query.busId, companyId, isActive: true },
      select: {
        id: true,
        registrationNumber: true,
        busName: true,
        status: true,
        route: {
          select: {
            id: true,
            routeCode: true,
            routeName: true,
            startLocation: true,
            endLocation: true,
          },
        },
      },
    });

    if (!bus) throw new NotFoundException('Bus not found');

    const [activeTrip, todayTrips] = await Promise.all([
      this.prisma.trip.findFirst({
        where: {
          companyId,
          busId: query.busId,
          tripDate: { gte: dayRange.start, lt: dayRange.end },
          status: 'IN_PROGRESS',
        },
        select: {
          id: true,
          busId: true,
          tripDate: true,
          tripNumber: true,
          routeId: true,
          startStopId: true,
          endStopId: true,
          driverStaffId: true,
          conductorStaffId: true,
          startedAt: true,
          endedAt: true,
          status: true,
        },
      }),
      this.prisma.trip.findMany({
        where: {
          companyId,
          busId: query.busId,
          tripDate: { gte: dayRange.start, lt: dayRange.end },
        },
        select: {
          id: true,
          busId: true,
          tripDate: true,
          tripNumber: true,
          routeId: true,
          startStopId: true,
          endStopId: true,
          driverStaffId: true,
          conductorStaffId: true,
          startedAt: true,
          endedAt: true,
          status: true,
        },
        orderBy: { tripNumber: 'asc' },
      }),
    ]);

    const tripIds = todayTrips.map((t) => t.id);
    const [incomeSums, expenseSums, extraIncomeSums, expenses, tripExtraIncomes, operationalExpenses, operationalIncomes] = await Promise.all([
      this.sumTripIncome(tripIds),
      this.sumTripExpenses(tripIds),
      this.sumTripExtraIncomes(tripIds),
      this.listTripAndOperationalExpenses(companyId, query.busId, tripIds, dayRange.start, dayRange.end),
      this.listTripExtraIncomes(query.busId, tripIds, dayRange.start),
      this.listOperationalExpenses(companyId, query.busId, dayRange.start, dayRange.end),
      this.listOperationalIncomes(companyId, query.busId, dayRange.start, dayRange.end),
    ]);

    const todayTripsApi = todayTrips.map((t) => ({
      id: t.id,
      busId: t.busId,
      driverId: t.driverStaffId ?? '',
      conductorId: t.conductorStaffId ?? null,
      routeId: t.routeId ?? null,
      date: dateToYmdUtc(t.tripDate),
      tripNumber: t.tripNumber,
      startPointId: t.startStopId ?? '',
      endPointId: t.endStopId ?? null,
      startTime: t.startedAt ? formatHHMMInSriLanka(t.startedAt) : '',
      endTime: t.endedAt ? formatHHMMInSriLanka(t.endedAt) : null,
      status: mapTripStatus(t.status),
      income: incomeSums[t.id] ?? 0,
      notes: null,
      passengerCount: null,
    }));

    const tripIncomeTotal = todayTrips.reduce((sum, t) => sum + (incomeSums[t.id] ?? 0), 0);
    const tripExtraIncomeTotal = todayTrips.reduce((sum, t) => sum + (extraIncomeSums[t.id] ?? 0), 0);
    const tripExpenseTotal = todayTrips.reduce((sum, t) => sum + (expenseSums[t.id] ?? 0), 0);
    const operationalExpenseTotal = operationalExpenses.reduce((sum: number, e: DashboardExpenseEntry) => sum + (e.amount ?? 0), 0);
    const operationalIncomeTotal = operationalIncomes.reduce((sum: number, e: DashboardIncomeEntry) => sum + (e.amount ?? 0), 0);

    const totalIncome = tripIncomeTotal + tripExtraIncomeTotal + operationalIncomeTotal;
    const totalExpenses = tripExpenseTotal + operationalExpenseTotal;

    return {
      bus: {
        id: bus.id,
        registrationNumber: bus.registrationNumber,
        busName: bus.busName ?? null,
        status: bus.status,
        route: bus.route ?? null,
      },
      date: dateToYmdUtc(dayRange.start),
      tripsToday: todayTrips.length,
      totalIncome,
      totalExpenses,
      netAmount: totalIncome - totalExpenses,
      activeTrip: activeTrip
        ? {
            id: activeTrip.id,
            tripNumber: activeTrip.tripNumber,
            status: mapTripStatus(activeTrip.status),
            startedAt: activeTrip.startedAt?.toISOString() ?? null,
          }
        : null,
      todayTrips: todayTripsApi,
      todayExpenses: expenses,
      todayExtraIncomes: tripExtraIncomes,
      todayOperationalExpenses: operationalExpenses,
      todayOperationalIncomes: operationalIncomes,
    };
  }

  async listTodayExpenses(companyId: string, busId: string, dateOrToday?: { date?: string; today?: boolean }) {
    const dayRange = getBusinessDayRangeUtc(dateOrToday) ?? getBusinessDayRangeUtc({ today: true });
    if (!dayRange) throw new BadRequestException('Invalid date');

    const trips = await this.prisma.trip.findMany({
      where: { companyId, busId, tripDate: { gte: dayRange.start, lt: dayRange.end } },
      select: { id: true },
    });
    const tripIds = trips.map((t) => t.id);

    const expenses = await this.listTripAndOperationalExpenses(companyId, busId, tripIds, dayRange.start, dayRange.end);
    return { expenses };
  }

  async listTodayExtraIncomes(companyId: string, busId: string, dateOrToday?: { date?: string; today?: boolean }) {
    const dayRange = getBusinessDayRangeUtc(dateOrToday) ?? getBusinessDayRangeUtc({ today: true });
    if (!dayRange) throw new BadRequestException('Invalid date');

    const trips = await this.prisma.trip.findMany({
      where: { companyId, busId, tripDate: { gte: dayRange.start, lt: dayRange.end } },
      select: { id: true },
    });
    const tripIds = trips.map((t) => t.id);

    const [tripExtraIncomes, operationalIncomes] = await Promise.all([
      this.listTripExtraIncomes(busId, tripIds, dayRange.start),
      this.listOperationalIncomes(companyId, busId, dayRange.start, dayRange.end),
    ]);

    return { extraIncomes: tripExtraIncomes, operationalIncomes };
  }

  // ── Commands ───────────────────────────────────────────────────────────────

  async startTrip(companyId: string, dto: StartTripDto) {
    const dayRange = getBusinessDayRangeUtc({ today: true });
    if (!dayRange) throw new BadRequestException('Invalid date');

    const [bus, assignment, existingActive] = await Promise.all([
      this.prisma.bus.findFirst({
        where: { id: dto.busId, companyId, isActive: true },
        select: {
          id: true,
          routeId: true,
          status: true,
          defaultDriverStaffId: true,
          defaultConductorStaffId: true,
        },
      }),
      this.prisma.busAssignment.findFirst({
        where: {
          busId: dto.busId,
          companyId,
          assignmentDate: { gte: dayRange.start, lt: dayRange.end },
          status: { not: 'CANCELLED' },
        },
        select: { id: true, driverStaffId: true, conductorStaffId: true },
      }),
      this.prisma.trip.findFirst({
        where: {
          companyId,
          busId: dto.busId,
          tripDate: { gte: dayRange.start, lt: dayRange.end },
          status: 'IN_PROGRESS',
        },
        select: { id: true },
      }),
    ]);

    if (!bus) throw new NotFoundException('Bus not found');
    if (bus.status === 'SOLD' || bus.status === 'INACTIVE') {
      throw new BadRequestException('Bus is not currently operational');
    }
    if (existingActive) {
      throw new ConflictException('An active trip already exists for this bus today');
    }

    // Crew resolution: assignment > bus defaults > manual selection
    let resolvedDriverId: string;
    let resolvedConductorId: string;

    if (assignment?.driverStaffId && assignment.conductorStaffId) {
      resolvedDriverId = assignment.driverStaffId;
      resolvedConductorId = assignment.conductorStaffId;
    } else if (bus.defaultDriverStaffId && bus.defaultConductorStaffId) {
      resolvedDriverId = bus.defaultDriverStaffId;
      resolvedConductorId = bus.defaultConductorStaffId;
    } else {
      if (!dto.driverStaffId || !dto.conductorStaffId) {
        throw new BadRequestException(
          'No assignment or default crew configured. Provide driverStaffId and conductorStaffId.',
        );
      }

      const [driver, conductor] = await Promise.all([
        this.prisma.staffProfile.findFirst({
          where: { id: dto.driverStaffId, companyId, isActive: true },
          select: { id: true, roleType: true },
        }),
        this.prisma.staffProfile.findFirst({
          where: { id: dto.conductorStaffId, companyId, isActive: true },
          select: { id: true, roleType: true },
        }),
      ]);

      if (!driver) throw new BadRequestException('Selected driver not found or inactive');
      if (!(DRIVER_ROLES as readonly string[]).includes(driver.roleType)) {
        throw new BadRequestException('Selected staff member cannot serve as driver');
      }
      if (!conductor) throw new BadRequestException('Selected conductor not found or inactive');
      if (!(CONDUCTOR_ROLES as readonly string[]).includes(conductor.roleType)) {
        throw new BadRequestException('Selected staff member cannot serve as conductor');
      }

      resolvedDriverId = dto.driverStaffId;
      resolvedConductorId = dto.conductorStaffId;
    }

    const tripCount = await this.prisma.trip.count({
      where: {
        companyId,
        busId: dto.busId,
        tripDate: { gte: dayRange.start, lt: dayRange.end },
      },
    });

    const now = new Date();
    const trip = await this.prisma.trip.create({
      data: {
        companyId,
        busId: dto.busId,
        assignmentId: assignment?.id ?? null,
        routeId: dto.routeId ?? bus.routeId ?? null,
        tripDate: dayRange.start,
        tripNumber: tripCount + 1,
        direction: (dto.direction ?? TripDirectionDto.UP) as any,
        startStopId: dto.startStopId ?? null,
        endStopId: dto.endStopId ?? null,
        driverStaffId: resolvedDriverId,
        conductorStaffId: resolvedConductorId,
        startedAt: now,
        status: 'IN_PROGRESS',
        createdVia: 'dashboard',
      },
      select: {
        id: true,
        busId: true,
        tripDate: true,
        tripNumber: true,
        startStopId: true,
        endStopId: true,
        driverStaffId: true,
        conductorStaffId: true,
        startedAt: true,
        status: true,
      },
    });

    if (assignment?.id) {
      await this.prisma.busAssignment.update({
        where: { id: assignment.id },
        data: { status: 'STARTED' },
      });
    }

    return {
      trip: {
        id: trip.id,
        busId: trip.busId,
        driverId: trip.driverStaffId ?? '',
        conductorId: trip.conductorStaffId ?? null,
        routeId: null,
        date: dateToYmdUtc(trip.tripDate),
        tripNumber: trip.tripNumber,
        startPointId: trip.startStopId ?? '',
        endPointId: trip.endStopId ?? null,
        startTime: trip.startedAt ? formatHHMMInSriLanka(trip.startedAt) : '',
        endTime: null,
        status: mapTripStatus(trip.status),
        income: 0,
      },
    };
  }

  async addExpense(companyId: string, tripId: string, dto: CreateTripExpenseDto) {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, companyId },
      select: { id: true, status: true },
    });
    if (!trip) throw new NotFoundException('Trip not found');
    if (trip.status === 'CANCELLED') throw new BadRequestException('Cannot add expenses to a cancelled trip');

    const amount = Number(dto.amount);
    if (!isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Amount must be a positive number');
    }

    const expense = await this.prisma.tripExpense.create({
      data: {
        tripId,
        expenseCategory: normalizeExpenseCategory(dto.category),
        amount: new Prisma.Decimal(amount),
        note: dto.note?.trim() ?? null,
        enteredByType: 'dashboard',
      },
      select: {
        id: true,
        tripId: true,
        expenseCategory: true,
        amount: true,
        note: true,
        createdAt: true,
      },
    });

    return {
      expense: {
        id: expense.id,
        tripId: expense.tripId,
        category: mapExpenseCategoryToDashboard(expense.expenseCategory),
        amount: decimalToNumber(expense.amount),
        note: expense.note ?? null,
        timestamp: expense.createdAt.toISOString(),
      },
    };
  }

  async addExtraIncome(companyId: string, tripId: string, dto: CreateExtraIncomeDto) {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, companyId },
      select: { id: true, status: true },
    });
    if (!trip) throw new NotFoundException('Trip not found');
    if (trip.status === 'CANCELLED') {
      throw new BadRequestException('Cannot add extra incomes to a cancelled trip');
    }

    const amount = Number(dto.amount);
    if (!isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Amount must be a positive number');
    }

    const extra = await this.prisma.extraIncome.create({
      data: {
        tripId,
        category: normalizeExtraIncomeCategory(dto.category),
        amount: new Prisma.Decimal(amount),
        note: dto.note?.trim() ?? null,
        enteredByType: 'dashboard',
      },
      select: {
        id: true,
        tripId: true,
        category: true,
        amount: true,
        note: true,
        createdAt: true,
      },
    });

    return {
      extraIncome: {
        id: extra.id,
        tripId: extra.tripId,
        category: mapExtraIncomeCategoryToDashboard(extra.category),
        amount: decimalToNumber(extra.amount),
        note: extra.note ?? null,
        timestamp: extra.createdAt.toISOString(),
      },
    };
  }

  async endTrip(companyId: string, tripId: string, dto: EndTripDto) {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, companyId },
      select: {
        id: true,
        status: true,
      },
    });
    if (!trip) throw new NotFoundException('Trip not found');
    if (trip.status !== 'IN_PROGRESS') {
      throw new BadRequestException('Only an in-progress trip can be ended');
    }

    const amount = Number(dto.income);
    if (!isFinite(amount) || amount < 0) {
      throw new BadRequestException('Income must be a valid number');
    }

    const endedAt = dto.endedAt ? new Date(dto.endedAt) : new Date();

    const updated = await this.prisma.$transaction(async (tx) => {
      const t = await tx.trip.update({
        where: { id: tripId },
        data: {
          endedAt,
          endStopId: dto.endStopId ?? undefined,
          status: 'COMPLETED',
        },
        select: {
          id: true,
          busId: true,
          tripDate: true,
          tripNumber: true,
          routeId: true,
          startStopId: true,
          endStopId: true,
          driverStaffId: true,
          conductorStaffId: true,
          startedAt: true,
          endedAt: true,
          status: true,
          bus: {
            select: {
              registrationNumber: true,
            },
          },
          route: {
            select: {
              routeCode: true,
              routeName: true,
            },
          },
        },
      });

      await tx.tripIncome.create({
        data: {
          tripId,
          amount: new Prisma.Decimal(amount),
          note: dto.note?.trim() ?? null,
          enteredByType: 'dashboard',
        },
        select: { id: true },
      });

      const routeLabel = t.route?.routeCode
        ? ` on Route ${t.route.routeCode}`
        : t.route?.routeName
          ? ` on ${t.route.routeName}`
          : '';

      await this.notificationsService.createCompanyNotification(
        {
          companyId,
          type: 'TRIP_COMPLETED',
          title: 'Trip Completed',
          message: `Bus ${t.bus.registrationNumber} completed Trip #${t.tripNumber}${routeLabel}. Income: Rs. ${amount.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          severity: 'SUCCESS',
          relatedEntityType: 'TRIP',
          relatedEntityId: t.id,
          targetUrl: '/trips',
          metadata: { income: amount, busId: t.busId, tripNumber: t.tripNumber },
        },
        tx,
      );

      return t;
    });

    return {
      trip: {
        id: updated.id,
        busId: updated.busId,
        driverId: updated.driverStaffId ?? '',
        conductorId: updated.conductorStaffId ?? null,
        routeId: updated.routeId ?? null,
        date: dateToYmdUtc(updated.tripDate),
        tripNumber: updated.tripNumber,
        startPointId: updated.startStopId ?? '',
        endPointId: updated.endStopId ?? null,
        startTime: updated.startedAt ? formatHHMMInSriLanka(updated.startedAt) : '',
        endTime: updated.endedAt ? formatHHMMInSriLanka(updated.endedAt) : null,
        status: mapTripStatus(updated.status),
        income: amount,
      },
    };
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private async sumTripIncome(tripIds: string[]): Promise<Record<string, number>> {
    if (tripIds.length === 0) return {};
    const grouped = await this.prisma.tripIncome.groupBy({
      by: ['tripId'],
      where: { tripId: { in: tripIds } },
      _sum: { amount: true },
    });

    return Object.fromEntries(
      grouped.map((g) => [g.tripId, decimalToNumber(g._sum.amount)]),
    );
  }

  private async sumTripExpenses(tripIds: string[]): Promise<Record<string, number>> {
    if (tripIds.length === 0) return {};
    const grouped = await this.prisma.tripExpense.groupBy({
      by: ['tripId'],
      where: { tripId: { in: tripIds } },
      _sum: { amount: true },
    });

    return Object.fromEntries(
      grouped.map((g) => [g.tripId, decimalToNumber(g._sum.amount)]),
    );
  }

  private async sumTripExtraIncomes(tripIds: string[]): Promise<Record<string, number>> {
    if (tripIds.length === 0) return {};
    const grouped = await this.prisma.extraIncome.groupBy({
      by: ['tripId'],
      where: { tripId: { in: tripIds } },
      _sum: { amount: true },
    });

    return Object.fromEntries(grouped.map((g) => [g.tripId, decimalToNumber(g._sum.amount)]));
  }

  private async listTripAndOperationalExpenses(
    companyId: string,
    busId: string,
    tripIds: string[],
    dayStart: Date,
    dayEnd: Date,
  ): Promise<DashboardExpenseEntry[]> {
    const tripExpenses: Array<{
      id: string;
      tripId: string;
      expenseCategory: any;
      amount: unknown;
      note: string | null;
      createdAt: Date;
    }> = tripIds.length
      ? await this.prisma.tripExpense.findMany({
          where: { tripId: { in: tripIds } },
          select: {
            id: true,
            tripId: true,
            expenseCategory: true,
            amount: true,
            note: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'asc' },
        })
      : [];

    const operationalExpenses = await this.prisma.operationalExpense.findMany({
      where: {
        companyId,
        busId,
        recordDate: { gte: dayStart, lt: dayEnd },
      },
      select: {
        id: true,
        category: true,
        amount: true,
        note: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const ymd = dateToYmdUtc(dayStart);

    const mappedTrip: DashboardExpenseEntry[] = tripExpenses.map((e: typeof tripExpenses[number]) => ({
      id: e.id,
      tripId: e.tripId,
      busId,
      date: ymd,
      category: mapExpenseCategoryToDashboard(e.expenseCategory),
      amount: decimalToNumber(e.amount),
      description: e.note ?? null,
      enteredBy: 'system',
      timestamp: e.createdAt.toISOString(),
    }));

    const mappedOperational: DashboardExpenseEntry[] = operationalExpenses.map((e: typeof operationalExpenses[number]) => ({
      id: e.id,
      tripId: null,
      busId,
      date: ymd,
      category: mapExpenseCategoryToDashboard(e.category as any),
      amount: decimalToNumber(e.amount),
      description: e.note ?? null,
      enteredBy: 'system',
      timestamp: e.createdAt.toISOString(),
    }));

    return [...mappedTrip, ...mappedOperational];
  }

  private async listTripExtraIncomes(busId: string, tripIds: string[], dayStart: Date): Promise<DashboardIncomeEntry[]> {
    const items = tripIds.length
      ? await this.prisma.extraIncome.findMany({
          where: { tripId: { in: tripIds } },
          select: {
            id: true,
            tripId: true,
            category: true,
            amount: true,
            note: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'asc' },
        })
      : [];

    const ymd = dateToYmdUtc(dayStart);

    return items.map((e) => ({
      id: e.id,
      tripId: e.tripId,
      busId,
      date: ymd,
      category: mapExtraIncomeCategoryToDashboard(e.category),
      amount: decimalToNumber(e.amount),
      description: e.note ?? null,
      enteredBy: 'system',
      timestamp: e.createdAt.toISOString(),
    })) as DashboardIncomeEntry[];
  }

  private async listOperationalExpenses(companyId: string, busId: string, dayStart: Date, dayEnd: Date): Promise<DashboardExpenseEntry[]> {
    const items = await this.prisma.operationalExpense.findMany({
      where: {
        companyId,
        busId,
        recordDate: { gte: dayStart, lt: dayEnd },
      },
      select: {
        id: true,
        category: true,
        amount: true,
        note: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const ymd = dateToYmdUtc(dayStart);

    return items.map((e: typeof items[number]) => ({
      id: e.id,
      tripId: null,
      busId,
      date: ymd,
      category: mapExpenseCategoryToDashboard(e.category as any),
      amount: decimalToNumber(e.amount),
      description: e.note ?? null,
      enteredBy: 'system',
      timestamp: e.createdAt.toISOString(),
    }));
  }

  private async listOperationalIncomes(companyId: string, busId: string, dayStart: Date, dayEnd: Date): Promise<DashboardIncomeEntry[]> {
    const items = await this.prisma.operationalIncome.findMany({
      where: {
        companyId,
        busId,
        recordDate: { gte: dayStart, lt: dayEnd },
      },
      select: {
        id: true,
        category: true,
        amount: true,
        note: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const ymd = dateToYmdUtc(dayStart);

    return items.map((e: typeof items[number]) => ({
      id: e.id,
      tripId: null,
      busId,
      date: ymd,
      category: mapExtraIncomeCategoryToDashboard(e.category as any),
      amount: decimalToNumber(e.amount),
      description: e.note ?? null,
      enteredBy: 'system',
      timestamp: e.createdAt.toISOString(),
    }));
  }
}
