import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SettlementQueryDto } from './dto/settlement-query.dto';
import { LockSettlementDto } from './dto/lock-settlement.dto';
import {
  decimalToNumber,
  mapExpenseCategoryToDashboard,
} from '../common/finance';
import {
  formatHHMMInSriLanka,
  getBusinessDayRangeUtc,
  getSriLankaTodayYmd,
} from '../common/business-day';
import { NotificationsService } from '../notifications/notifications.service';

// ── Types ─────────────────────────────────────────────────────────────────────

export type BusSettlementCard = {
  busId: string;
  registrationNumber: string;
  busName: string | null;
  route: { id: string; routeName: string; routeCode: string | null } | null;
  date: string;
  /** 'percentage' | 'fixed' */
  wageType: string;
  totalIncome: number;
  totalExpenses: number;
  /** Daily Total Income = totalIncome - totalExpenses */
  dti: number;
  driverSalary: number;
  conductorSalary: number;
  netProfit: number;
  driverPercentage: number | null;
  conductorPercentage: number | null;
  fixedDriverWage: number | null;
  fixedConductorWage: number | null;
  isLocked: boolean;
};

export type BusSettlementDetail = BusSettlementCard & {
  breakdown: {
    tripIncome: number;
    extraIncome: number;
    operationalIncome: number;
    tripExpenses: number;
    operationalExpenses: number;
  };
  trips: Array<{
    id: string;
    tripNumber: number;
    direction: string;
    startTime: string | null;
    endTime: string | null;
    status: string;
    income: number;
  }>;
  expenses: Array<{
    id: string;
    tripId: string | null;
    category: string;
    amount: number;
    description: string | null;
  }>;
};

// ── Calculation helpers ────────────────────────────────────────────────────────

function mapTripStatus(status: string): string {
  switch (status) {
    case 'IN_PROGRESS':
      return 'in-progress';
    case 'COMPLETED':
      return 'completed';
    case 'CANCELLED':
      return 'cancelled';
    default:
      return 'scheduled';
  }
}

function computeSalaries(
  dti: number,
  wageModel: 'PERCENTAGE' | 'FIXED',
  driverPct: number,
  conductorPct: number,
  fixedDriver: number,
  fixedConductor: number,
): { driverSalary: number; conductorSalary: number } {
  if (wageModel === 'PERCENTAGE') {
    if (dti > 0) {
      return {
        driverSalary: Math.round((dti * driverPct) / 100),
        conductorSalary: Math.round((dti * conductorPct) / 100),
      };
    }
    return { driverSalary: 0, conductorSalary: 0 };
  }
  return { driverSalary: fixedDriver, conductorSalary: fixedConductor };
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class SettlementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * GET /settlements?date=YYYY-MM-DD
   * Company-level summary + bus settlement cards.
   */
  async listSettlements(companyId: string, query: SettlementQueryDto) {
    const ymd = query.date ?? getSriLankaTodayYmd();
    const dayRange = getBusinessDayRangeUtc({ date: ymd });
    if (!dayRange) throw new BadRequestException('Invalid date');

    const buses = await this.prisma.bus.findMany({
      where: { companyId, isActive: true },
      select: {
        id: true,
        registrationNumber: true,
        busName: true,
        wageModel: true,
        driverPercentage: true,
        conductorPercentage: true,
        fixedDriverWage: true,
        fixedConductorWage: true,
        route: { select: { id: true, routeName: true, routeCode: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    if (buses.length === 0) {
      return {
        date: ymd,
        summary: { totalIncome: 0, totalExpenses: 0, totalSalaries: 0, netProfit: 0 },
        buses: [],
      };
    }

    const busIds = buses.map((b) => b.id);

    // Locked summaries for this date
    const lockedRecords = await this.prisma.dailySummary.findMany({
      where: {
        companyId,
        busId: { in: busIds },
        summaryDate: dayRange.start,
        status: 'APPROVED',
      },
    });
    const lockedMap = new Map(lockedRecords.map((s) => [s.busId, s]));

    // All trips for these buses on this date
    const trips = await this.prisma.trip.findMany({
      where: {
        companyId,
        busId: { in: busIds },
        tripDate: { gte: dayRange.start, lt: dayRange.end },
      },
      select: { id: true, busId: true },
    });
    const tripsByBusId: Record<string, string[]> = {};
    for (const t of trips) {
      (tripsByBusId[t.busId] ??= []).push(t.id);
    }
    const allTripIds = trips.map((t) => t.id);

    // Aggregate trip income / extra income / expenses per tripId
    const incomeSumByTrip: Record<string, number> = {};
    const extraSumByTrip: Record<string, number> = {};
    const expenseSumByTrip: Record<string, number> = {};

    if (allTripIds.length > 0) {
      const [incomeGroups, extraGroups, expenseGroups] = await Promise.all([
        this.prisma.tripIncome.groupBy({
          by: ['tripId'],
          where: { tripId: { in: allTripIds } },
          _sum: { amount: true },
        }),
        this.prisma.extraIncome.groupBy({
          by: ['tripId'],
          where: { tripId: { in: allTripIds } },
          _sum: { amount: true },
        }),
        this.prisma.tripExpense.groupBy({
          by: ['tripId'],
          where: { tripId: { in: allTripIds } },
          _sum: { amount: true },
        }),
      ]);
      for (const g of incomeGroups) incomeSumByTrip[g.tripId] = decimalToNumber(g._sum.amount);
      for (const g of extraGroups) extraSumByTrip[g.tripId] = decimalToNumber(g._sum.amount);
      for (const g of expenseGroups) expenseSumByTrip[g.tripId] = decimalToNumber(g._sum.amount);
    }

    // Operational expenses / incomes per busId
    const [opExpGroups, opIncGroups] = await Promise.all([
      this.prisma.operationalExpense.groupBy({
        by: ['busId'],
        where: {
          companyId,
          busId: { in: busIds },
          recordDate: { gte: dayRange.start, lt: dayRange.end },
        },
        _sum: { amount: true },
      }),
      this.prisma.operationalIncome.groupBy({
        by: ['busId'],
        where: {
          companyId,
          busId: { in: busIds },
          recordDate: { gte: dayRange.start, lt: dayRange.end },
        },
        _sum: { amount: true },
      }),
    ]);
    const opExpByBus: Record<string, number> = {};
    for (const g of opExpGroups) opExpByBus[g.busId] = decimalToNumber(g._sum.amount);
    const opIncByBus: Record<string, number> = {};
    for (const g of opIncGroups) opIncByBus[g.busId] = decimalToNumber(g._sum.amount);

    const busCards: BusSettlementCard[] = [];

    for (const bus of buses) {
      const locked = lockedMap.get(bus.id);

      if (locked) {
        busCards.push({
          busId: bus.id,
          registrationNumber: bus.registrationNumber,
          busName: bus.busName,
          route: bus.route,
          date: ymd,
          wageType: (locked.wageModelSnapshot ?? 'PERCENTAGE').toLowerCase(),
          totalIncome: decimalToNumber(locked.totalIncome),
          totalExpenses: decimalToNumber(locked.totalExpenses),
          dti: decimalToNumber(locked.dti),
          driverSalary: decimalToNumber(locked.driverSalary),
          conductorSalary: decimalToNumber(locked.conductorSalary),
          netProfit: decimalToNumber(locked.netAmount),
          driverPercentage: decimalToNumber(locked.driverPctSnapshot) || null,
          conductorPercentage: decimalToNumber(locked.conductorPctSnapshot) || null,
          fixedDriverWage: null,
          fixedConductorWage: null,
          isLocked: true,
        });
        continue;
      }

      // Live calculation
      const busTripIds = tripsByBusId[bus.id] ?? [];
      const tripIncome = busTripIds.reduce((s, id) => s + (incomeSumByTrip[id] ?? 0), 0);
      const extraIncome = busTripIds.reduce((s, id) => s + (extraSumByTrip[id] ?? 0), 0);
      const opInc = opIncByBus[bus.id] ?? 0;
      const tripExp = busTripIds.reduce((s, id) => s + (expenseSumByTrip[id] ?? 0), 0);
      const opExp = opExpByBus[bus.id] ?? 0;

      const totalIncome = tripIncome + extraIncome + opInc;
      const totalExpenses = tripExp + opExp;

      if (totalIncome === 0 && totalExpenses === 0) continue;

      const dti = totalIncome - totalExpenses;
      const driverPct = decimalToNumber(bus.driverPercentage);
      const conductorPct = decimalToNumber(bus.conductorPercentage);
      const fixedDriver = decimalToNumber(bus.fixedDriverWage);
      const fixedConductor = decimalToNumber(bus.fixedConductorWage);

      const { driverSalary, conductorSalary } = computeSalaries(
        dti,
        bus.wageModel,
        driverPct,
        conductorPct,
        fixedDriver,
        fixedConductor,
      );

      busCards.push({
        busId: bus.id,
        registrationNumber: bus.registrationNumber,
        busName: bus.busName,
        route: bus.route,
        date: ymd,
        wageType: bus.wageModel === 'PERCENTAGE' ? 'percentage' : 'fixed',
        totalIncome,
        totalExpenses,
        dti,
        driverSalary,
        conductorSalary,
        netProfit: dti - driverSalary - conductorSalary,
        driverPercentage: driverPct || null,
        conductorPercentage: conductorPct || null,
        fixedDriverWage: fixedDriver || null,
        fixedConductorWage: fixedConductor || null,
        isLocked: false,
      });
    }

    const summary = {
      totalIncome: busCards.reduce((s, b) => s + b.totalIncome, 0),
      totalExpenses: busCards.reduce((s, b) => s + b.totalExpenses, 0),
      totalSalaries: busCards.reduce((s, b) => s + b.driverSalary + b.conductorSalary, 0),
      netProfit: busCards.reduce((s, b) => s + b.netProfit, 0),
    };

    return { date: ymd, summary, buses: busCards };
  }

  /**
   * GET /settlements/:busId?date=YYYY-MM-DD
   * Full expanded settlement detail for a single bus.
   */
  async getBusSettlementDetail(
    companyId: string,
    busId: string,
    query: SettlementQueryDto,
  ): Promise<BusSettlementDetail> {
    const ymd = query.date ?? getSriLankaTodayYmd();
    const dayRange = getBusinessDayRangeUtc({ date: ymd });
    if (!dayRange) throw new BadRequestException('Invalid date');

    const bus = await this.prisma.bus.findFirst({
      where: { id: busId, companyId, isActive: true },
      select: {
        id: true,
        registrationNumber: true,
        busName: true,
        wageModel: true,
        driverPercentage: true,
        conductorPercentage: true,
        fixedDriverWage: true,
        fixedConductorWage: true,
        route: { select: { id: true, routeName: true, routeCode: true } },
      },
    });
    if (!bus) throw new NotFoundException(`Bus ${busId} not found`);

    // Check locked record
    const locked = await this.prisma.dailySummary.findUnique({
      where: { busId_summaryDate: { busId, summaryDate: dayRange.start } },
    });
    const isLocked = locked?.status === 'APPROVED';

    // Trips for this bus on this date
    const trips = await this.prisma.trip.findMany({
      where: {
        companyId,
        busId,
        tripDate: { gte: dayRange.start, lt: dayRange.end },
      },
      select: {
        id: true,
        tripNumber: true,
        direction: true,
        startedAt: true,
        endedAt: true,
        status: true,
      },
      orderBy: { tripNumber: 'asc' },
    });
    const tripIds = trips.map((t) => t.id);

    // Income / expense aggregates per trip
    const incomeSumByTrip: Record<string, number> = {};
    const extraSumByTrip: Record<string, number> = {};
    const expenseSumByTrip: Record<string, number> = {};
    let tripExpenseRows: Array<{
      id: string;
      tripId: string;
      expenseCategory: any;
      amount: any;
      note: string | null;
    }> = [];

    if (tripIds.length > 0) {
      const [incomeGroups, extraGroups, expenseGroups, expRows] = await Promise.all([
        this.prisma.tripIncome.groupBy({
          by: ['tripId'],
          where: { tripId: { in: tripIds } },
          _sum: { amount: true },
        }),
        this.prisma.extraIncome.groupBy({
          by: ['tripId'],
          where: { tripId: { in: tripIds } },
          _sum: { amount: true },
        }),
        this.prisma.tripExpense.groupBy({
          by: ['tripId'],
          where: { tripId: { in: tripIds } },
          _sum: { amount: true },
        }),
        this.prisma.tripExpense.findMany({
          where: { tripId: { in: tripIds } },
          select: { id: true, tripId: true, expenseCategory: true, amount: true, note: true },
          orderBy: { createdAt: 'asc' },
        }),
      ]);
      for (const g of incomeGroups) incomeSumByTrip[g.tripId] = decimalToNumber(g._sum.amount);
      for (const g of extraGroups) extraSumByTrip[g.tripId] = decimalToNumber(g._sum.amount);
      for (const g of expenseGroups) expenseSumByTrip[g.tripId] = decimalToNumber(g._sum.amount);
      tripExpenseRows = expRows;
    }

    // Operational expenses / incomes
    const [opExpRows, opIncRows] = await Promise.all([
      this.prisma.operationalExpense.findMany({
        where: {
          companyId,
          busId,
          recordDate: { gte: dayRange.start, lt: dayRange.end },
        },
        select: { id: true, category: true, amount: true, note: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.operationalIncome.findMany({
        where: {
          companyId,
          busId,
          recordDate: { gte: dayRange.start, lt: dayRange.end },
        },
        select: { id: true, category: true, amount: true, note: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    // Aggregate financials
    const tripIncome = tripIds.reduce((s, id) => s + (incomeSumByTrip[id] ?? 0), 0);
    const extraIncome = tripIds.reduce((s, id) => s + (extraSumByTrip[id] ?? 0), 0);
    const opInc = opIncRows.reduce((s, r) => s + decimalToNumber(r.amount), 0);
    const tripExp = tripIds.reduce((s, id) => s + (expenseSumByTrip[id] ?? 0), 0);
    const opExp = opExpRows.reduce((s, r) => s + decimalToNumber(r.amount), 0);

    let totalIncome: number;
    let totalExpenses: number;
    let dti: number;
    let driverSalary: number;
    let conductorSalary: number;
    let netProfit: number;
    let wageType: string;
    let driverPercentage: number | null;
    let conductorPercentage: number | null;
    let fixedDriverWage: number | null;
    let fixedConductorWage: number | null;

    if (isLocked && locked) {
      totalIncome = decimalToNumber(locked.totalIncome);
      totalExpenses = decimalToNumber(locked.totalExpenses);
      dti = decimalToNumber(locked.dti);
      driverSalary = decimalToNumber(locked.driverSalary);
      conductorSalary = decimalToNumber(locked.conductorSalary);
      netProfit = decimalToNumber(locked.netAmount);
      wageType = (locked.wageModelSnapshot ?? 'PERCENTAGE').toLowerCase();
      driverPercentage = decimalToNumber(locked.driverPctSnapshot) || null;
      conductorPercentage = decimalToNumber(locked.conductorPctSnapshot) || null;
      fixedDriverWage = null;
      fixedConductorWage = null;
    } else {
      totalIncome = tripIncome + extraIncome + opInc;
      totalExpenses = tripExp + opExp;
      dti = totalIncome - totalExpenses;

      const dPct = decimalToNumber(bus.driverPercentage);
      const cPct = decimalToNumber(bus.conductorPercentage);
      const fDriver = decimalToNumber(bus.fixedDriverWage);
      const fConductor = decimalToNumber(bus.fixedConductorWage);

      ({ driverSalary, conductorSalary } = computeSalaries(
        dti,
        bus.wageModel,
        dPct,
        cPct,
        fDriver,
        fConductor,
      ));
      netProfit = dti - driverSalary - conductorSalary;
      wageType = bus.wageModel === 'PERCENTAGE' ? 'percentage' : 'fixed';
      driverPercentage = dPct || null;
      conductorPercentage = cPct || null;
      fixedDriverWage = fDriver || null;
      fixedConductorWage = fConductor || null;
    }

    // Build trips list
    const tripList = trips.map((t) => ({
      id: t.id,
      tripNumber: t.tripNumber,
      direction: t.direction.toLowerCase(),
      startTime: t.startedAt ? formatHHMMInSriLanka(t.startedAt) : null,
      endTime: t.endedAt ? formatHHMMInSriLanka(t.endedAt) : null,
      status: mapTripStatus(t.status),
      income: incomeSumByTrip[t.id] ?? 0,
    }));

    // Build expenses list (trip-level + operational)
    const expenseList: BusSettlementDetail['expenses'] = [
      ...tripExpenseRows.map((e) => ({
        id: e.id,
        tripId: e.tripId as string | null,
        category: mapExpenseCategoryToDashboard(e.expenseCategory),
        amount: decimalToNumber(e.amount),
        description: e.note ?? null,
      })),
      ...opExpRows.map((e) => ({
        id: e.id,
        tripId: null as string | null,
        category: mapExpenseCategoryToDashboard(e.category as any),
        amount: decimalToNumber(e.amount),
        description: e.note ?? null,
      })),
    ];

    return {
      busId: bus.id,
      registrationNumber: bus.registrationNumber,
      busName: bus.busName,
      route: bus.route,
      date: ymd,
      wageType,
      totalIncome,
      totalExpenses,
      dti,
      driverSalary,
      conductorSalary,
      netProfit,
      driverPercentage,
      conductorPercentage,
      fixedDriverWage,
      fixedConductorWage,
      isLocked,
      breakdown: {
        tripIncome,
        extraIncome,
        operationalIncome: opInc,
        tripExpenses: tripExp,
        operationalExpenses: opExp,
      },
      trips: tripList,
      expenses: expenseList,
    };
  }

  /**
   * POST /settlements/:busId/lock
   * Calculates and locks the settlement for a single bus+date.
   */
  async lockBusSettlement(
    companyId: string,
    busId: string,
    dto: LockSettlementDto,
    lockedByUserId: string,
  ): Promise<BusSettlementDetail> {
    const dayRange = getBusinessDayRangeUtc({ date: dto.date });
    if (!dayRange) throw new BadRequestException('Invalid date');

    const bus = await this.prisma.bus.findFirst({
      where: { id: busId, companyId, isActive: true },
      select: { id: true, registrationNumber: true },
    });
    if (!bus) throw new NotFoundException(`Bus ${busId} not found`);

    // Calculate current live values
    const detail = await this.getBusSettlementDetail(companyId, busId, { date: dto.date });

    // Find existing assignment for this date
    const assignment = await this.prisma.busAssignment.findFirst({
      where: {
        companyId,
        busId,
        assignmentDate: { gte: dayRange.start, lt: dayRange.end },
        status: { not: 'CANCELLED' },
      },
      select: { id: true },
    });

    const now = new Date();
    const sharedData = {
      totalTrips: detail.trips.length,
      totalIncome: new Prisma.Decimal(detail.totalIncome),
      totalExpenses: new Prisma.Decimal(detail.totalExpenses),
      dti: new Prisma.Decimal(detail.dti),
      driverSalary: new Prisma.Decimal(detail.driverSalary),
      conductorSalary: new Prisma.Decimal(detail.conductorSalary),
      netAmount: new Prisma.Decimal(detail.netProfit),
      wageModelSnapshot: detail.wageType.toUpperCase(),
      driverPctSnapshot:
        detail.driverPercentage != null ? new Prisma.Decimal(detail.driverPercentage) : null,
      conductorPctSnapshot:
        detail.conductorPercentage != null
          ? new Prisma.Decimal(detail.conductorPercentage)
          : null,
      status: 'APPROVED' as const,
      approvedAt: now,
      approvedByUserId: lockedByUserId,
    };

    await this.prisma.$transaction(async (tx) => {
      await tx.dailySummary.upsert({
        where: { busId_summaryDate: { busId, summaryDate: dayRange.start } },
        create: {
          companyId,
          busId,
          assignmentId: assignment?.id ?? null,
          summaryDate: dayRange.start,
          ...sharedData,
        },
        update: sharedData,
      });

      await this.notificationsService.createCompanyNotification(
        {
          companyId,
          type: 'SETTLEMENT_LOCKED',
          title: 'Settlement Locked',
          message: `Settlement locked for ${bus.registrationNumber} on ${dto.date}. Net amount: Rs. ${detail.netProfit.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          severity: 'SUCCESS',
          relatedEntityType: 'SETTLEMENT',
          relatedEntityId: `${busId}:${dto.date}`,
          targetUrl: '/settlement',
          metadata: { date: dto.date, busId, netProfit: detail.netProfit },
        },
        tx,
      );
    });

    // Re-fetch so isLocked = true in the response
    return this.getBusSettlementDetail(companyId, busId, { date: dto.date });
  }

  /**
   * POST /settlements/lock-all?date=YYYY-MM-DD
   * Locks settlements for all unlocked buses with activity.
   */
  async lockAllSettlements(
    companyId: string,
    query: SettlementQueryDto,
    lockedByUserId: string,
  ) {
    const ymd = query.date ?? getSriLankaTodayYmd();
    const list = await this.listSettlements(companyId, { date: ymd });

    const results = await Promise.allSettled(
      list.buses
        .filter((b) => !b.isLocked)
        .map((b) =>
          this.lockBusSettlement(companyId, b.busId, { date: ymd }, lockedByUserId),
        ),
    );

    return {
      date: ymd,
      locked: results.filter((r) => r.status === 'fulfilled').length,
      failed: results.filter((r) => r.status === 'rejected').length,
    };
  }
}
