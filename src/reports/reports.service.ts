import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  PERFORMANCE_METRICS,
  type PerformanceMetric,
  type PerformanceCategory,
  type PerformanceReportQueryDto,
} from './dto/performance-report-query.dto';
import { ReportQueryDto } from './dto/report-query.dto';
import { decimalToNumber, mapExpenseCategoryToDashboard } from '../common/finance';
import {
  getBusinessDayRangeUtc,
  getSriLankaTodayYmd,
  parseYmd,
} from '../common/business-day';

// ─── Shared date-range helper ─────────────────────────────────────────────────

export interface DateRange {
  start: Date;
  end: Date;
  label: string; // "YYYY-MM-DD" or "YYYY-MM-DD – YYYY-MM-DD"
}

export function resolveDateRange(query: ReportQueryDto): DateRange {
  if ((query.startDate && !query.endDate) || (!query.startDate && query.endDate)) {
    throw new BadRequestException('startDate and endDate must be provided together');
  }

  if (query.startDate && query.endDate) {
    const s = parseYmd(query.startDate);
    const e = parseYmd(query.endDate);
    const start = new Date(Date.UTC(s.year, s.month - 1, s.day));
    const end = new Date(Date.UTC(e.year, e.month - 1, e.day + 1)); // exclusive
    if (end <= start) {
      throw new BadRequestException('endDate must be after startDate');
    }
    return { start, end, label: `${query.startDate} – ${query.endDate}` };
  }

  const ymd = query.date ?? getSriLankaTodayYmd();
  const range = getBusinessDayRangeUtc({ date: ymd });
  if (!range) throw new BadRequestException('Invalid date');
  return { start: range.start, end: range.end, label: ymd };
}

const DASHBOARD_EXPENSE_CATEGORIES = [
  'diesel',
  'expressway',
  'runner',
  'parking',
  'meals',
  'repairs',
  'other',
] as const;

type DashboardExpenseCategory = (typeof DASHBOARD_EXPENSE_CATEGORIES)[number];

type DashboardAlertType = 'maintenance' | 'trip_in_progress';

type DashboardAlertSeverity = 'info' | 'warning' | 'critical';

type DashboardFleetBadge = 'On Trip' | 'Active' | 'Maintenance' | 'Inactive';

function buildEmptyExpenseBreakdown() {
  return DASHBOARD_EXPENSE_CATEGORIES.map((category) => ({ category, amount: 0 }));
}

// ─── Salary calculation (mirrors settlements logic) ──────────────────────────

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

const MAX_PERFORMANCE_CHART_ENTITIES = 8;

function formatDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function buildDateLabels(range: DateRange): string[] {
  const labels: string[] = [];
  for (let cursor = new Date(range.start); cursor < range.end; cursor = new Date(cursor.getTime() + 86_400_000)) {
    labels.push(formatDayKey(cursor));
  }
  return labels;
}

function metricLabel(metric: PerformanceMetric): string {
  switch (metric) {
    case 'income':
      return 'Income';
    case 'salary':
      return 'Salary';
    case 'expenses':
      return 'Expenses';
  }
}

function metricSortValue(values: Record<PerformanceMetric, number>, metric: PerformanceMetric): number {
  return values[metric] ?? 0;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async getPerformanceReport(companyId: string, query: PerformanceReportQueryDto) {
    const range = resolveDateRange(query);
    const metric = query.metric ?? 'income';
    const selectedEntityIds = query.entityIds?.length ? query.entityIds : undefined;
    const dateLabels = buildDateLabels(range);

    if (query.category === 'BUSES' && metric === 'salary') {
      throw new BadRequestException('salary metric is only supported for DRIVERS and CONDUCTORS');
    }

    const buses = await this.prisma.bus.findMany({
      where: {
        companyId,
        isActive: true,
        ...(query.category === 'BUSES' && selectedEntityIds?.length
          ? { id: { in: selectedEntityIds } }
          : {}),
      },
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

    if (query.category === 'BUSES' && selectedEntityIds?.length && buses.length === 0) {
      throw new NotFoundException('No matching buses found');
    }

    const busIds = buses.map((bus) => bus.id);
    if (busIds.length === 0) {
      return {
        data: {
          filters: {
            category: query.category,
            startDate: formatDayKey(range.start),
            endDate: formatDayKey(new Date(range.end.getTime() - 86_400_000)),
            metric,
            entityIds: selectedEntityIds ?? [],
          },
          summary: [],
          chart: { labels: dateLabels, series: [] },
        },
      };
    }

    const selectedStaff =
      selectedEntityIds?.length && (query.category === 'DRIVERS' || query.category === 'CONDUCTORS')
        ? await this.prisma.staffProfile.findMany({
            where: {
              companyId,
              id: { in: selectedEntityIds },
              isActive: true,
            },
            select: {
              id: true,
              fullName: true,
              roleType: true,
            },
          })
        : [];

    if ((query.category === 'DRIVERS' || query.category === 'CONDUCTORS') && selectedEntityIds?.length) {
      if (selectedStaff.length === 0) {
        throw new NotFoundException('No matching staff members found');
      }

      const invalidStaff = selectedStaff.find((staff) => {
        if (query.category === 'DRIVERS') {
          return staff.roleType !== 'DRIVER' && staff.roleType !== 'DRIVER_CONDUCTOR';
        }

        return staff.roleType !== 'CONDUCTOR' && staff.roleType !== 'DRIVER_CONDUCTOR';
      });

      if (invalidStaff) {
        throw new BadRequestException(
          `Selected staff member ${invalidStaff.fullName} is not compatible with ${query.category} category`,
        );
      }
    }

    const assignmentsWhere: Prisma.BusAssignmentWhereInput = {
      companyId,
      busId: { in: busIds },
      assignmentDate: { gte: range.start, lt: range.end },
      status: { not: 'CANCELLED' },
      ...(query.category === 'DRIVERS' && selectedEntityIds?.length
        ? { driverStaffId: { in: selectedEntityIds } }
        : {}),
      ...(query.category === 'CONDUCTORS' && selectedEntityIds?.length
        ? { conductorStaffId: { in: selectedEntityIds } }
        : {}),
    };

    const [assignments, lockedSummaries, trips, opExpGroups, opIncGroups] = await Promise.all([
      this.prisma.busAssignment.findMany({
        where: assignmentsWhere,
        select: {
          id: true,
          busId: true,
          assignmentDate: true,
          driverStaffId: true,
          conductorStaffId: true,
          driver: { select: { id: true, fullName: true, roleType: true } },
          conductor: { select: { id: true, fullName: true, roleType: true } },
        },
      }),
      this.prisma.dailySummary.findMany({
        where: {
          companyId,
          busId: { in: busIds },
          summaryDate: { gte: range.start, lt: range.end },
          status: 'APPROVED',
        },
        select: {
          busId: true,
          assignmentId: true,
          summaryDate: true,
          totalTrips: true,
          totalIncome: true,
          totalExpenses: true,
          dti: true,
          driverSalary: true,
          conductorSalary: true,
        },
      }),
      this.prisma.trip.findMany({
        where: {
          companyId,
          busId: { in: busIds },
          tripDate: { gte: range.start, lt: range.end },
          status: { not: 'CANCELLED' },
        },
        select: {
          id: true,
          busId: true,
          tripDate: true,
          route: { select: { routeName: true, routeCode: true } },
        },
      }),
      this.prisma.operationalExpense.groupBy({
        by: ['busId', 'recordDate'],
        where: {
          companyId,
          busId: { in: busIds },
          recordDate: { gte: range.start, lt: range.end },
        },
        _sum: { amount: true },
      }),
      this.prisma.operationalIncome.groupBy({
        by: ['busId', 'recordDate'],
        where: {
          companyId,
          busId: { in: busIds },
          recordDate: { gte: range.start, lt: range.end },
        },
        _sum: { amount: true },
      }),
    ]);

    const allTripIds = trips.map((trip) => trip.id);
    const [incomeGroups, extraGroups, tripExpenseGroups] = allTripIds.length
      ? await Promise.all([
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
        ])
      : [[], [], []];

    const busById = new Map(buses.map((bus) => [bus.id, bus]));
    const assignmentById = new Map(assignments.map((assignment) => [assignment.id, assignment]));
    const assignmentByBusDate = new Map(assignments.map((assignment) => [`${assignment.busId}|${formatDayKey(assignment.assignmentDate)}`, assignment]));
    const incomeByTripId = new Map(incomeGroups.map((group) => [group.tripId, decimalToNumber(group._sum.amount)]));
    const extraIncomeByTripId = new Map(extraGroups.map((group) => [group.tripId, decimalToNumber(group._sum.amount)]));
    const tripExpenseByTripId = new Map(tripExpenseGroups.map((group) => [group.tripId, decimalToNumber(group._sum.amount)]));
    const opExpenseByBusDate = new Map(opExpGroups.map((group) => [`${group.busId}|${formatDayKey(group.recordDate)}`, decimalToNumber(group._sum.amount)]));
    const opIncomeByBusDate = new Map(opIncGroups.map((group) => [`${group.busId}|${formatDayKey(group.recordDate)}`, decimalToNumber(group._sum.amount)]));

    const liveBusDayMap = new Map<string, {
      busId: string;
      date: string;
      tripCount: number;
      tripIncome: number;
      extraIncome: number;
      tripExpenses: number;
      routeName: string | null;
      routeCode: string | null;
    }>();

    for (const trip of trips) {
      const date = formatDayKey(trip.tripDate);
      const key = `${trip.busId}|${date}`;
      const existing = liveBusDayMap.get(key) ?? {
        busId: trip.busId,
        date,
        tripCount: 0,
        tripIncome: 0,
        extraIncome: 0,
        tripExpenses: 0,
        routeName: null,
        routeCode: null,
      };

      existing.tripCount += 1;
      existing.tripIncome += incomeByTripId.get(trip.id) ?? 0;
      existing.extraIncome += extraIncomeByTripId.get(trip.id) ?? 0;
      existing.tripExpenses += tripExpenseByTripId.get(trip.id) ?? 0;
      existing.routeName = existing.routeName ?? trip.route?.routeName ?? null;
      existing.routeCode = existing.routeCode ?? trip.route?.routeCode ?? null;
      liveBusDayMap.set(key, existing);
    }

    const busDayKeys = new Set<string>();
    for (const assignment of assignments) busDayKeys.add(`${assignment.busId}|${formatDayKey(assignment.assignmentDate)}`);
    for (const summary of lockedSummaries) busDayKeys.add(`${summary.busId}|${formatDayKey(summary.summaryDate)}`);
    for (const key of liveBusDayMap.keys()) busDayKeys.add(key);
    for (const key of opExpenseByBusDate.keys()) busDayKeys.add(key);
    for (const key of opIncomeByBusDate.keys()) busDayKeys.add(key);

    const busDayMap = new Map<string, {
      busId: string;
      date: string;
      registrationNumber: string;
      routeName: string | null;
      routeCode: string | null;
      tripCount: number;
      totalIncome: number;
      totalExpenses: number;
      netDTI: number;
      driverSalary: number;
      conductorSalary: number;
      assignment: (typeof assignments)[number] | null;
    }>();

    const lockedSummaryByBusDate = new Map(lockedSummaries.map((summary) => [`${summary.busId}|${formatDayKey(summary.summaryDate)}`, summary]));

    for (const key of busDayKeys) {
      const [busId, date] = key.split('|');
      const bus = busById.get(busId);
      if (!bus) continue;

      const locked = lockedSummaryByBusDate.get(key);
      const live = liveBusDayMap.get(key);
      const assignment =
        (locked?.assignmentId ? assignmentById.get(locked.assignmentId) : undefined) ??
        assignmentByBusDate.get(key) ??
        null;

      let totalIncome = 0;
      let totalExpenses = 0;
      let netDTI = 0;
      let tripCount = 0;
      let driverSalary = 0;
      let conductorSalary = 0;

      if (locked) {
        totalIncome = decimalToNumber(locked.totalIncome);
        totalExpenses = decimalToNumber(locked.totalExpenses);
        netDTI = decimalToNumber(locked.dti);
        tripCount = locked.totalTrips;
        driverSalary = decimalToNumber(locked.driverSalary);
        conductorSalary = decimalToNumber(locked.conductorSalary);
      } else {
        totalIncome = (live?.tripIncome ?? 0) + (live?.extraIncome ?? 0) + (opIncomeByBusDate.get(key) ?? 0);
        totalExpenses = (live?.tripExpenses ?? 0) + (opExpenseByBusDate.get(key) ?? 0);
        netDTI = totalIncome - totalExpenses;
        tripCount = live?.tripCount ?? 0;

        const { driverSalary: liveDriverSalary, conductorSalary: liveConductorSalary } = computeSalaries(
          netDTI,
          bus.wageModel,
          decimalToNumber(bus.driverPercentage),
          decimalToNumber(bus.conductorPercentage),
          decimalToNumber(bus.fixedDriverWage),
          decimalToNumber(bus.fixedConductorWage),
        );
        driverSalary = liveDriverSalary;
        conductorSalary = liveConductorSalary;
      }

      busDayMap.set(key, {
        busId,
        date,
        registrationNumber: bus.registrationNumber,
        routeName: live?.routeName ?? bus.route?.routeName ?? null,
        routeCode: live?.routeCode ?? bus.route?.routeCode ?? null,
        tripCount,
        totalIncome,
        totalExpenses,
        netDTI,
        driverSalary,
        conductorSalary,
        assignment,
      });
    }

    const filters = {
      category: query.category,
      startDate: formatDayKey(range.start),
      endDate: formatDayKey(new Date(range.end.getTime() - 86_400_000)),
      metric,
      entityIds: selectedEntityIds ?? [],
    };

    if (query.category === 'BUSES') {
      const summaryMap = new Map<string, {
        id: string;
        registrationNumber: string;
        routeName: string | null;
        activeDays: number;
        totalIncome: number;
        totalExpenses: number;
        netDTI: number;
        tripCount: number;
        dailyValues: Map<string, Record<PerformanceMetric, number>>;
      }>();

      for (const bus of buses) {
        summaryMap.set(bus.id, {
          id: bus.id,
          registrationNumber: bus.registrationNumber,
          routeName: bus.route?.routeName ?? null,
          activeDays: 0,
          totalIncome: 0,
          totalExpenses: 0,
          netDTI: 0,
          tripCount: 0,
          dailyValues: new Map(),
        });
      }

      for (const row of busDayMap.values()) {
        const summary = summaryMap.get(row.busId);
        if (!summary) continue;

        summary.activeDays += 1;
        summary.totalIncome += row.totalIncome;
        summary.totalExpenses += row.totalExpenses;
        summary.netDTI += row.netDTI;
        summary.tripCount += row.tripCount;
        summary.routeName = summary.routeName ?? row.routeName ?? null;
        summary.dailyValues.set(row.date, {
          income: (summary.dailyValues.get(row.date)?.income ?? 0) + row.totalIncome,
          salary: 0,
          expenses: (summary.dailyValues.get(row.date)?.expenses ?? 0) + row.totalExpenses,
        });
      }

      let summary = Array.from(summaryMap.values()).filter((row) => {
        if (selectedEntityIds?.length) return selectedEntityIds.includes(row.id);
        return row.activeDays > 0 || row.totalIncome > 0 || row.totalExpenses > 0 || row.tripCount > 0;
      });

      summary.sort((left, right) =>
        metricSortValue(
          { income: right.totalIncome, salary: 0, expenses: right.totalExpenses },
          metric,
        ) -
        metricSortValue(
          { income: left.totalIncome, salary: 0, expenses: left.totalExpenses },
          metric,
        ),
      );

      const chartRows = selectedEntityIds?.length
        ? summary
        : summary.slice(0, MAX_PERFORMANCE_CHART_ENTITIES);
      const chart = {
        labels: dateLabels,
        series: chartRows.map((row) => ({
          key: `bus_${row.id}_${metric}`,
          label: `${row.registrationNumber} - ${metricLabel(metric)}`,
          metric,
          entityId: row.id,
          values: dateLabels.map((date) => row.dailyValues.get(date)?.[metric] ?? 0),
        })),
      };

      return {
        data: {
          filters,
          summary: summary.map(({ dailyValues, ...row }) => row),
          chart,
        },
      };
    }

    const summaryMap = new Map<string, {
      id: string;
      name: string;
      role: string;
      workingDays: number;
      incomeOnWorkingDays: number;
      salary: number;
      expensesOnWorkingDays: number;
      workingDayKeys: Set<string>;
      dailyValues: Map<string, Record<PerformanceMetric, number>>;
    }>();

    for (const assignment of assignments) {
      const staffId = query.category === 'DRIVERS' ? assignment.driverStaffId : assignment.conductorStaffId;
      const staff = query.category === 'DRIVERS' ? assignment.driver : assignment.conductor;
      if (!staffId || !staff) continue;

      const dayKey = formatDayKey(assignment.assignmentDate);
      const busDay = busDayMap.get(`${assignment.busId}|${dayKey}`);
      const income = busDay?.totalIncome ?? 0;
      const salary = query.category === 'DRIVERS' ? (busDay?.driverSalary ?? 0) : (busDay?.conductorSalary ?? 0);
      const expenses = busDay?.totalExpenses ?? 0;

      if (!summaryMap.has(staffId)) {
        summaryMap.set(staffId, {
          id: staff.id,
          name: staff.fullName,
          role: staff.roleType,
          workingDays: 0,
          incomeOnWorkingDays: 0,
          salary: 0,
          expensesOnWorkingDays: 0,
          workingDayKeys: new Set(),
          dailyValues: new Map(),
        });
      }

      const summary = summaryMap.get(staffId)!;
      if (!summary.workingDayKeys.has(dayKey)) {
        summary.workingDayKeys.add(dayKey);
        summary.workingDays += 1;
      }

      summary.incomeOnWorkingDays += income;
      summary.salary += salary;
      summary.expensesOnWorkingDays += expenses;

      const daily = summary.dailyValues.get(dayKey) ?? { income: 0, salary: 0, expenses: 0 };
      daily.income += income;
      daily.salary += salary;
      daily.expenses += expenses;
      summary.dailyValues.set(dayKey, daily);
    }

    for (const staff of selectedStaff) {
      if (summaryMap.has(staff.id)) continue;

      summaryMap.set(staff.id, {
        id: staff.id,
        name: staff.fullName,
        role: staff.roleType,
        workingDays: 0,
        incomeOnWorkingDays: 0,
        salary: 0,
        expensesOnWorkingDays: 0,
        workingDayKeys: new Set(),
        dailyValues: new Map(),
      });
    }

    let summary = Array.from(summaryMap.values()).filter((row) => {
      if (selectedEntityIds?.length) return selectedEntityIds.includes(row.id);
      return row.workingDays > 0 || row.incomeOnWorkingDays > 0 || row.salary > 0 || row.expensesOnWorkingDays > 0;
    });

    summary.sort((left, right) =>
      metricSortValue(
        { income: right.incomeOnWorkingDays, salary: right.salary, expenses: right.expensesOnWorkingDays },
        metric,
      ) -
      metricSortValue(
        { income: left.incomeOnWorkingDays, salary: left.salary, expenses: left.expensesOnWorkingDays },
        metric,
      ),
    );

    const entityPrefix = query.category === 'DRIVERS' ? 'driver' : 'conductor';
    const chartRows = selectedEntityIds?.length
      ? summary
      : summary.slice(0, MAX_PERFORMANCE_CHART_ENTITIES);
    const chart = {
      labels: dateLabels,
      series: chartRows.map((row) => ({
        key: `${entityPrefix}_${row.id}_${metric}`,
        label: `${row.name} - ${metricLabel(metric)}`,
        metric,
        entityId: row.id,
        values: dateLabels.map((date) => row.dailyValues.get(date)?.[metric] ?? 0),
      })),
    };

    return {
      data: {
        filters,
        summary: summary.map(({ workingDayKeys, dailyValues, ...row }) => row),
        chart,
      },
    };
  }

  async getDashboardReport(companyId: string, query: ReportQueryDto) {
    const range = resolveDateRange(query);

    const [buses, staff, trips, operationalExpenses, operationalIncomes] = await Promise.all([
      this.prisma.bus.findMany({
        where: { companyId, isActive: true },
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
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.staffProfile.findMany({
        where: { companyId, isActive: true },
        select: { roleType: true },
      }),
      this.prisma.trip.findMany({
        where: {
          companyId,
          tripDate: { gte: range.start, lt: range.end },
        },
        select: {
          id: true,
          busId: true,
          tripNumber: true,
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
        orderBy: [{ tripDate: 'asc' }, { tripNumber: 'asc' }],
      }),
      this.prisma.operationalExpense.findMany({
        where: {
          companyId,
          recordDate: { gte: range.start, lt: range.end },
        },
        select: {
          busId: true,
          category: true,
          amount: true,
        },
      }),
      this.prisma.operationalIncome.findMany({
        where: {
          companyId,
          recordDate: { gte: range.start, lt: range.end },
        },
        select: {
          busId: true,
          amount: true,
        },
      }),
    ]);

    const tripIds = trips.map((trip) => trip.id);
    const [tripIncomeSums, tripExtraIncomeSums, tripExpenses] = tripIds.length
      ? await Promise.all([
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
          this.prisma.tripExpense.findMany({
            where: { tripId: { in: tripIds } },
            select: {
              tripId: true,
              expenseCategory: true,
              amount: true,
            },
          }),
        ])
      : [[], [], []];

    const tripIncomeByTripId = new Map<string, number>(
      tripIncomeSums.map((row) => [row.tripId, decimalToNumber(row._sum.amount)]),
    );
    const tripExtraIncomeByTripId = new Map<string, number>(
      tripExtraIncomeSums.map((row) => [row.tripId, decimalToNumber(row._sum.amount)]),
    );
    const tripExpenseByTripId = new Map<string, number>();
    const expenseBreakdown = new Map<DashboardExpenseCategory, number>(
      buildEmptyExpenseBreakdown().map((row) => [row.category, 0]),
    );

    for (const expense of tripExpenses) {
      const amount = decimalToNumber(expense.amount);
      tripExpenseByTripId.set(
        expense.tripId,
        (tripExpenseByTripId.get(expense.tripId) ?? 0) + amount,
      );

      const category = mapExpenseCategoryToDashboard(expense.expenseCategory) as DashboardExpenseCategory;
      expenseBreakdown.set(category, (expenseBreakdown.get(category) ?? 0) + amount);
    }

    const operationalExpenseByBusId = new Map<string, number>();
    for (const expense of operationalExpenses) {
      const amount = decimalToNumber(expense.amount);
      operationalExpenseByBusId.set(
        expense.busId,
        (operationalExpenseByBusId.get(expense.busId) ?? 0) + amount,
      );

      const category = mapExpenseCategoryToDashboard(expense.category) as DashboardExpenseCategory;
      expenseBreakdown.set(category, (expenseBreakdown.get(category) ?? 0) + amount);
    }

    const operationalIncomeByBusId = new Map<string, number>();
    for (const income of operationalIncomes) {
      const amount = decimalToNumber(income.amount);
      operationalIncomeByBusId.set(
        income.busId,
        (operationalIncomeByBusId.get(income.busId) ?? 0) + amount,
      );
    }

    const fleetByBusId = new Map(
      buses.map((bus) => [
        bus.id,
        {
          busId: bus.id,
          registrationNumber: bus.registrationNumber,
          routeName: bus.route?.routeName ?? null,
          routeCode: bus.route?.routeCode ?? null,
          status: bus.status,
          route: bus.route,
          currentTripStatus: null as 'IN_PROGRESS' | null,
          tripCount: 0,
          income: 0,
          expense: operationalExpenseByBusId.get(bus.id) ?? 0,
          badges: [] as DashboardFleetBadge[],
          hasInProgressTrip: false,
        },
      ]),
    );

    for (const trip of trips) {
      const tripIncome = tripIncomeByTripId.get(trip.id) ?? 0;
      const tripExtraIncome = tripExtraIncomeByTripId.get(trip.id) ?? 0;
      const tripExpense = tripExpenseByTripId.get(trip.id) ?? 0;
      const fleetItem = fleetByBusId.get(trip.busId);

      if (fleetItem) {
        fleetItem.tripCount += 1;
        fleetItem.income += tripIncome + tripExtraIncome;
        fleetItem.expense += tripExpense;
        if (!fleetItem.route && trip.route) fleetItem.route = trip.route;
        if (trip.route) {
          fleetItem.routeName = trip.route.routeName;
          fleetItem.routeCode = trip.route.routeCode ?? null;
        }
        if (trip.status === 'IN_PROGRESS') {
          fleetItem.hasInProgressTrip = true;
          fleetItem.currentTripStatus = 'IN_PROGRESS';
        }
      }
    }

    const completedTrips = trips.filter((trip) => trip.status === 'COMPLETED').length;
    const inProgressTrips = trips.filter((trip) => trip.status === 'IN_PROGRESS').length;
    const totalTripIncome = Array.from(tripIncomeByTripId.values()).reduce((sum, amount) => sum + amount, 0);
    const totalExtraIncome = Array.from(tripExtraIncomeByTripId.values()).reduce((sum, amount) => sum + amount, 0);
    const totalTripExpenses = Array.from(tripExpenseByTripId.values()).reduce((sum, amount) => sum + amount, 0);
    const totalOperationalExpenses = Array.from(operationalExpenseByBusId.values()).reduce((sum, amount) => sum + amount, 0);
    const totalOperationalIncome = Array.from(operationalIncomeByBusId.values()).reduce((sum, amount) => sum + amount, 0);

    const alerts: Array<{
      id: string;
      type: DashboardAlertType;
      severity: DashboardAlertSeverity;
      title: string;
      message: string;
      targetPage: string;
      targetPath: string;
    }> = [];

    for (const fleetItem of fleetByBusId.values()) {
      if (fleetItem.hasInProgressTrip) {
        alerts.push({
          id: `trip-${fleetItem.busId}`,
          type: 'trip_in_progress',
          severity: 'info',
          title: `${fleetItem.registrationNumber} trip still in progress`,
          message: 'Awaiting completion and income entry.',
          targetPage: '/trips',
          targetPath: '/trips',
        });
      }

      if (fleetItem.status === 'MAINTENANCE') {
        alerts.push({
          id: `maintenance-${fleetItem.busId}`,
          type: 'maintenance',
          severity: 'warning',
          title: `${fleetItem.registrationNumber} in maintenance`,
          message: 'No trips can be scheduled until the bus is available again.',
          targetPage: '/buses',
          targetPath: '/buses',
        });
      }

      if (fleetItem.hasInProgressTrip) fleetItem.badges.push('On Trip');
      if (fleetItem.status === 'ACTIVE') fleetItem.badges.push('Active');
      if (fleetItem.status === 'MAINTENANCE') fleetItem.badges.push('Maintenance');
      if (fleetItem.status === 'INACTIVE') fleetItem.badges.push('Inactive');

      fleetItem.income += operationalIncomeByBusId.get(fleetItem.busId) ?? 0;
    }

    const activeBuses = buses.filter((bus) => bus.status === 'ACTIVE').length;
    const drivers = staff.filter(
      (member) => member.roleType === 'DRIVER' || member.roleType === 'DRIVER_CONDUCTOR',
    ).length;
    const conductors = staff.filter(
      (member) => member.roleType === 'CONDUCTOR' || member.roleType === 'DRIVER_CONDUCTOR',
    ).length;

    return {
      dateRange: {
        startDate: range.start.toISOString().slice(0, 10),
        endDate: new Date(range.end.getTime() - 86_400_000).toISOString().slice(0, 10),
        label: range.label,
        isSingleDay: range.label.includes('–') === false,
      },
      summary: {
        totalIncome: totalTripIncome + totalExtraIncome + totalOperationalIncome,
        totalExpenses: totalTripExpenses + totalOperationalExpenses,
        netDTI:
          totalTripIncome +
          totalExtraIncome +
          totalOperationalIncome -
          totalTripExpenses -
          totalOperationalExpenses,
        tripsCompleted: completedTrips,
        totalTrips: trips.length,
        activeTrips: inProgressTrips,
        inProgressTrips,
        dtiLabel: 'Net DTI',
        dtiDescription: 'Daily Total Income after deducting expenses',
      },
      fleetStatus: {
        items: Array.from(fleetByBusId.values()),
        viewAllPath: '/buses',
      },
      quickStats: {
        activeBuses,
        drivers,
        conductors,
        passengersToday: null,
      },
      alerts,
      expenseBreakdown: Array.from(expenseBreakdown.entries()).map(([category, amount]) => ({
        category,
        amount,
      })),
    };
  }

  // ── 1. Income report ───────────────────────────────────────────────────────

  async getIncomeReport(companyId: string, query: ReportQueryDto) {
    const range = resolveDateRange(query);

    const trips = await this.prisma.trip.findMany({
      where: {
        companyId,
        tripDate: { gte: range.start, lt: range.end },
      },
      select: {
        id: true,
        busId: true,
        tripDate: true,
        tripNumber: true,
        direction: true,
        status: true,
        bus: {
          select: {
            registrationNumber: true,
            busName: true,
            route: { select: { routeName: true, routeCode: true } },
          },
        },
        incomes: { select: { id: true, amount: true, note: true } },
        extraIncomes: { select: { id: true, category: true, amount: true, note: true } },
      },
      orderBy: [{ tripDate: 'asc' }, { busId: 'asc' }, { tripNumber: 'asc' }],
    });

    // Operational incomes for the period
    const opIncomes = await this.prisma.operationalIncome.findMany({
      where: {
        companyId,
        recordDate: { gte: range.start, lt: range.end },
      },
      select: {
        id: true,
        busId: true,
        recordDate: true,
        category: true,
        amount: true,
        note: true,
        bus: { select: { registrationNumber: true, busName: true } },
      },
      orderBy: { recordDate: 'asc' },
    });

    // Build per-bus aggregation
    const busMap = new Map<
      string,
      {
        busId: string;
        registrationNumber: string;
        busName: string | null;
        route: { routeName: string; routeCode: string | null } | null;
        tripCount: number;
        tripIncome: number;
        extraIncome: number;
        operationalIncome: number;
        totalIncome: number;
        trips: Array<{
          tripId: string;
          date: string;
          tripNumber: number;
          direction: string;
          status: string;
          tripIncome: number;
          extraIncome: number;
          totalIncome: number;
          extraIncomeBreakdown: Array<{
            id: string;
            category: string;
            amount: number;
            note: string | null;
          }>;
        }>;
      }
    >();

    for (const trip of trips) {
      if (!busMap.has(trip.busId)) {
        busMap.set(trip.busId, {
          busId: trip.busId,
          registrationNumber: trip.bus.registrationNumber,
          busName: trip.bus.busName,
          route: trip.bus.route,
          tripCount: 0,
          tripIncome: 0,
          extraIncome: 0,
          operationalIncome: 0,
          totalIncome: 0,
          trips: [],
        });
      }
      const entry = busMap.get(trip.busId)!;

      const tIncome = trip.incomes.reduce(
        (s, i) => s + decimalToNumber(i.amount),
        0,
      );
      const eIncome = trip.extraIncomes.reduce(
        (s, i) => s + decimalToNumber(i.amount),
        0,
      );

      entry.tripCount += 1;
      entry.tripIncome += tIncome;
      entry.extraIncome += eIncome;
      entry.trips.push({
        tripId: trip.id,
        date: trip.tripDate.toISOString().slice(0, 10),
        tripNumber: trip.tripNumber,
        direction: trip.direction.toLowerCase(),
        status: trip.status.toLowerCase(),
        tripIncome: tIncome,
        extraIncome: eIncome,
        totalIncome: tIncome + eIncome,
        extraIncomeBreakdown: trip.extraIncomes.map((ei) => ({
          id: ei.id,
          category: ei.category.toLowerCase(),
          amount: decimalToNumber(ei.amount),
          note: ei.note,
        })),
      });
    }

    // Attach operational incomes per bus
    const opIncByBus = new Map<
      string,
      Array<{
        id: string;
        date: string;
        category: string;
        amount: number;
        note: string | null;
      }>
    >();
    let grandOpInc = 0;
    for (const oi of opIncomes) {
      if (!opIncByBus.has(oi.busId)) opIncByBus.set(oi.busId, []);
      opIncByBus.get(oi.busId)!.push({
        id: oi.id,
        date: oi.recordDate.toISOString().slice(0, 10),
        category: oi.category.toLowerCase(),
        amount: decimalToNumber(oi.amount),
        note: oi.note,
      });
      grandOpInc += decimalToNumber(oi.amount);
    }

    // Ensure buses with only operational income are included
    for (const oi of opIncomes) {
      if (!busMap.has(oi.busId)) {
        busMap.set(oi.busId, {
          busId: oi.busId,
          registrationNumber: oi.bus.registrationNumber,
          busName: oi.bus.busName,
          route: null,
          tripCount: 0,
          tripIncome: 0,
          extraIncome: 0,
          operationalIncome: 0,
          totalIncome: 0,
          trips: [],
        });
      }
    }

    const buses = Array.from(busMap.values()).map((entry) => {
      const opInc = (opIncByBus.get(entry.busId) ?? []).reduce(
        (s, o) => s + o.amount,
        0,
      );
      entry.operationalIncome = opInc;
      entry.totalIncome = entry.tripIncome + entry.extraIncome + opInc;
      return {
        ...entry,
        operationalIncomes: opIncByBus.get(entry.busId) ?? [],
      };
    });

    const grandTripIncome = buses.reduce((s, b) => s + b.tripIncome, 0);
    const grandExtraIncome = buses.reduce((s, b) => s + b.extraIncome, 0);
    const grandTotal = buses.reduce((s, b) => s + b.totalIncome, 0);

    const incomeRows = buses.map((b) => ({
      bus: b.registrationNumber,
      busName: b.busName ?? '',
      route: b.route?.routeName ?? '',
      tripCount: b.tripCount,
      tripIncome: b.tripIncome,
      extraIncome: b.extraIncome,
      operationalIncome: b.operationalIncome,
      totalIncome: b.totalIncome,
    }));

    return {
      period: range.label,
      summary: {
        totalBuses: buses.length,
        totalTrips: buses.reduce((s, b) => s + b.tripCount, 0),
        tripIncome: grandTripIncome,
        extraIncome: grandExtraIncome,
        operationalIncome: grandOpInc,
        totalIncome: grandTotal,
      },
      buses,
      rows: incomeRows,
    };
  }

  // ── 2. Expenses report ─────────────────────────────────────────────────────

  async getExpensesReport(companyId: string, query: ReportQueryDto) {
    const range = resolveDateRange(query);

    const [tripExpenses, opExpenses] = await Promise.all([
      this.prisma.tripExpense.findMany({
        where: {
          trip: {
            companyId,
            tripDate: { gte: range.start, lt: range.end },
          },
        },
        select: {
          id: true,
          expenseCategory: true,
          amount: true,
          note: true,
          trip: {
            select: {
              id: true,
              busId: true,
              tripDate: true,
              tripNumber: true,
              bus: {
                select: {
                  registrationNumber: true,
                  busName: true,
                  route: { select: { routeName: true, routeCode: true } },
                },
              },
            },
          },
        },
        orderBy: { trip: { tripDate: 'asc' } },
      }),
      this.prisma.operationalExpense.findMany({
        where: {
          companyId,
          recordDate: { gte: range.start, lt: range.end },
        },
        select: {
          id: true,
          busId: true,
          recordDate: true,
          category: true,
          amount: true,
          note: true,
          bus: {
            select: {
              registrationNumber: true,
              busName: true,
              route: { select: { routeName: true, routeCode: true } },
            },
          },
        },
        orderBy: { recordDate: 'asc' },
      }),
    ]);

    // Category totals
    const categoryTotals = new Map<string, number>();
    // Per-bus breakdown
    const busExpenseMap = new Map<
      string,
      {
        busId: string;
        registrationNumber: string;
        busName: string | null;
        route: { routeName: string; routeCode: string | null } | null;
        total: number;
        byCategory: Record<string, number>;
        items: Array<{
          id: string;
          source: 'trip' | 'operational';
          date: string;
          tripId: string | null;
          tripNumber: number | null;
          category: string;
          amount: number;
          note: string | null;
        }>;
      }
    >();

    const upsertBus = (
      busId: string,
      registrationNumber: string,
      busName: string | null,
      route: { routeName: string; routeCode: string | null } | null,
    ) => {
      if (!busExpenseMap.has(busId)) {
        busExpenseMap.set(busId, {
          busId,
          registrationNumber,
          busName,
          route,
          total: 0,
          byCategory: {},
          items: [],
        });
      }
      return busExpenseMap.get(busId)!;
    };

    for (const te of tripExpenses) {
      const cat = mapExpenseCategoryToDashboard(te.expenseCategory);
      const amt = decimalToNumber(te.amount);
      categoryTotals.set(cat, (categoryTotals.get(cat) ?? 0) + amt);

      const entry = upsertBus(
        te.trip.busId,
        te.trip.bus.registrationNumber,
        te.trip.bus.busName,
        te.trip.bus.route,
      );
      entry.total += amt;
      entry.byCategory[cat] = (entry.byCategory[cat] ?? 0) + amt;
      entry.items.push({
        id: te.id,
        source: 'trip',
        date: te.trip.tripDate.toISOString().slice(0, 10),
        tripId: te.trip.id,
        tripNumber: te.trip.tripNumber,
        category: cat,
        amount: amt,
        note: te.note,
      });
    }

    for (const oe of opExpenses) {
      const cat = mapExpenseCategoryToDashboard(oe.category);
      const amt = decimalToNumber(oe.amount);
      categoryTotals.set(cat, (categoryTotals.get(cat) ?? 0) + amt);

      const entry = upsertBus(
        oe.busId,
        oe.bus.registrationNumber,
        oe.bus.busName,
        oe.bus.route,
      );
      entry.total += amt;
      entry.byCategory[cat] = (entry.byCategory[cat] ?? 0) + amt;
      entry.items.push({
        id: oe.id,
        source: 'operational',
        date: oe.recordDate.toISOString().slice(0, 10),
        tripId: null,
        tripNumber: null,
        category: cat,
        amount: amt,
        note: oe.note,
      });
    }

    const grandTotal = Array.from(categoryTotals.values()).reduce((s, v) => s + v, 0);
    const allCategories = [
      'diesel',
      'expressway',
      'runner',
      'parking',
      'meals',
      'repairs',
      'other',
    ];

    const categoryBreakdown = allCategories.map((cat) => {
      const amount = categoryTotals.get(cat) ?? 0;
      return {
        category: cat,
        amount,
        percentage: grandTotal > 0 ? Math.round((amount / grandTotal) * 10000) / 100 : 0,
      };
    });

    const buses = Array.from(busExpenseMap.values()).sort(
      (a, b) => b.total - a.total,
    );

    const expenseRows = buses.flatMap((b) =>
      b.items.map((item) => ({
        bus: b.registrationNumber,
        busName: b.busName ?? '',
        route: b.route?.routeName ?? '',
        date: item.date,
        source: item.source,
        tripNumber: item.tripNumber ?? '',
        category: item.category,
        amount: item.amount,
        note: item.note ?? '',
      })),
    );

    return {
      period: range.label,
      summary: {
        totalExpenses: grandTotal,
        byCategory: categoryBreakdown,
      },
      buses,
      rows: expenseRows,
    };
  }

  // ── 3. Profitability report ────────────────────────────────────────────────

  async getProfitabilityReport(companyId: string, query: ReportQueryDto) {
    const range = resolveDateRange(query);

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
        period: range.label,
        summary: {
          totalIncome: 0,
          totalExpenses: 0,
          totalDti: 0,
          totalSalaries: 0,
          totalProfit: 0,
          totalTrips: 0,
        },
        buses: [],
      };
    }

    const busIds = buses.map((b) => b.id);

    // Locked summaries covering the range — we prefer them when available (single-day)
    const lockedSummaries = await this.prisma.dailySummary.findMany({
      where: {
        companyId,
        busId: { in: busIds },
        summaryDate: { gte: range.start, lt: range.end },
        status: 'APPROVED',
      },
    });
    // key: `${busId}|${summaryDate.toISOString()}`
    const lockedMap = new Map(
      lockedSummaries.map((s) => [`${s.busId}|${s.summaryDate.toISOString()}`, s]),
    );

    // Trips for live calculation
    const trips = await this.prisma.trip.findMany({
      where: {
        companyId,
        busId: { in: busIds },
        tripDate: { gte: range.start, lt: range.end },
      },
      select: { id: true, busId: true, tripDate: true },
    });
    const tripsByBus: Record<string, string[]> = {};
    for (const t of trips) (tripsByBus[t.busId] ??= []).push(t.id);
    const allTripIds = trips.map((t) => t.id);

    const [incomeGroups, extraGroups, tripExpGroups, opExpGroups, opIncGroups] =
      await Promise.all([
        allTripIds.length
          ? this.prisma.tripIncome.groupBy({
              by: ['tripId'],
              where: { tripId: { in: allTripIds } },
              _sum: { amount: true },
            })
          : [],
        allTripIds.length
          ? this.prisma.extraIncome.groupBy({
              by: ['tripId'],
              where: { tripId: { in: allTripIds } },
              _sum: { amount: true },
            })
          : [],
        allTripIds.length
          ? this.prisma.tripExpense.groupBy({
              by: ['tripId'],
              where: { tripId: { in: allTripIds } },
              _sum: { amount: true },
            })
          : [],
        this.prisma.operationalExpense.groupBy({
          by: ['busId'],
          where: {
            companyId,
            busId: { in: busIds },
            recordDate: { gte: range.start, lt: range.end },
          },
          _sum: { amount: true },
        }),
        this.prisma.operationalIncome.groupBy({
          by: ['busId'],
          where: {
            companyId,
            busId: { in: busIds },
            recordDate: { gte: range.start, lt: range.end },
          },
          _sum: { amount: true },
        }),
      ]);

    const incomeSumByTrip: Record<string, number> = {};
    const extraSumByTrip: Record<string, number> = {};
    const expSumByTrip: Record<string, number> = {};
    for (const g of incomeGroups as any[]) incomeSumByTrip[g.tripId] = decimalToNumber(g._sum.amount);
    for (const g of extraGroups as any[]) extraSumByTrip[g.tripId] = decimalToNumber(g._sum.amount);
    for (const g of tripExpGroups as any[]) expSumByTrip[g.tripId] = decimalToNumber(g._sum.amount);

    const opExpByBus: Record<string, number> = {};
    const opIncByBus: Record<string, number> = {};
    for (const g of opExpGroups) opExpByBus[g.busId] = decimalToNumber(g._sum.amount);
    for (const g of opIncGroups) opIncByBus[g.busId] = decimalToNumber(g._sum.amount);

    // Count trips per bus (only non-cancelled)
    const tripCountByBus: Record<string, number> = {};
    for (const t of trips) tripCountByBus[t.busId] = (tripCountByBus[t.busId] ?? 0) + 1;

    const result = buses.map((bus) => {
      // For single-day reports, try to use locked summary first
      // For ranges, always use live calculation
      const busTripIds = tripsByBus[bus.id] ?? [];

      const tripIncome = busTripIds.reduce((s, id) => s + (incomeSumByTrip[id] ?? 0), 0);
      const extraIncome = busTripIds.reduce((s, id) => s + (extraSumByTrip[id] ?? 0), 0);
      const opInc = opIncByBus[bus.id] ?? 0;
      const tripExp = busTripIds.reduce((s, id) => s + (expSumByTrip[id] ?? 0), 0);
      const opExp = opExpByBus[bus.id] ?? 0;

      const totalIncome = tripIncome + extraIncome + opInc;
      const totalExpenses = tripExp + opExp;
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

      const totalSalaries = driverSalary + conductorSalary;
      const profit = dti - totalSalaries;

      return {
        busId: bus.id,
        registrationNumber: bus.registrationNumber,
        busName: bus.busName,
        route: bus.route,
        tripCount: tripCountByBus[bus.id] ?? 0,
        totalIncome,
        totalExpenses,
        dti,
        driverSalary,
        conductorSalary,
        totalSalaries,
        profit,
        wageModel: bus.wageModel.toLowerCase(),
        incomeBreakdown: {
          tripIncome,
          extraIncome,
          operationalIncome: opInc,
        },
        expenseBreakdown: {
          tripExpenses: tripExp,
          operationalExpenses: opExp,
        },
      };
    });

    // Filter buses that had activity
    const activeBuses = result.filter(
      (b) => b.totalIncome > 0 || b.totalExpenses > 0,
    );

    const totals = activeBuses.reduce(
      (acc, b) => ({
        totalIncome: acc.totalIncome + b.totalIncome,
        totalExpenses: acc.totalExpenses + b.totalExpenses,
        totalDti: acc.totalDti + b.dti,
        totalSalaries: acc.totalSalaries + b.totalSalaries,
        totalProfit: acc.totalProfit + b.profit,
        totalTrips: acc.totalTrips + b.tripCount,
      }),
      {
        totalIncome: 0,
        totalExpenses: 0,
        totalDti: 0,
        totalSalaries: 0,
        totalProfit: 0,
        totalTrips: 0,
      },
    );

    const profitRows = activeBuses.map((b) => ({
      bus: b.registrationNumber,
      busName: b.busName ?? '',
      route: b.route?.routeName ?? '',
      tripCount: b.tripCount,
      income: b.totalIncome,
      expenses: b.totalExpenses,
      dti: b.dti,
      driverSalary: b.driverSalary,
      conductorSalary: b.conductorSalary,
      totalSalaries: b.totalSalaries,
      profit: b.profit,
      wageModel: b.wageModel,
    }));

    return {
      period: range.label,
      summary: totals,
      buses: activeBuses,
      rows: profitRows,
    };
  }

  // ── 4. Salaries report ─────────────────────────────────────────────────────

  async getSalariesReport(companyId: string, query: ReportQueryDto) {
    const range = resolveDateRange(query);

    // Get all buses with wage configuration
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
        route: { select: { routeName: true, routeCode: true } },
      },
    });

    const busIds = buses.map((b) => b.id);

    // Get all trips in range with assigned driver/conductor
    const trips = await this.prisma.trip.findMany({
      where: {
        companyId,
        busId: { in: busIds },
        tripDate: { gte: range.start, lt: range.end },
        status: { not: 'CANCELLED' },
      },
      select: {
        id: true,
        busId: true,
        tripDate: true,
        driverStaffId: true,
        conductorStaffId: true,
        driver: { select: { id: true, fullName: true, roleType: true } },
        conductor: { select: { id: true, fullName: true, roleType: true } },
      },
    });

    const allTripIds = trips.map((t) => t.id);

    // Aggregate incomes/expenses per trip for salary base calculation
    const [incomeGroups, extraGroups, tripExpGroups, opExpGroups, opIncGroups] =
      await Promise.all([
        allTripIds.length
          ? this.prisma.tripIncome.groupBy({
              by: ['tripId'],
              where: { tripId: { in: allTripIds } },
              _sum: { amount: true },
            })
          : [],
        allTripIds.length
          ? this.prisma.extraIncome.groupBy({
              by: ['tripId'],
              where: { tripId: { in: allTripIds } },
              _sum: { amount: true },
            })
          : [],
        allTripIds.length
          ? this.prisma.tripExpense.groupBy({
              by: ['tripId'],
              where: { tripId: { in: allTripIds } },
              _sum: { amount: true },
            })
          : [],
        this.prisma.operationalExpense.groupBy({
          by: ['busId'],
          where: {
            companyId,
            busId: { in: busIds },
            recordDate: { gte: range.start, lt: range.end },
          },
          _sum: { amount: true },
        }),
        this.prisma.operationalIncome.groupBy({
          by: ['busId'],
          where: {
            companyId,
            busId: { in: busIds },
            recordDate: { gte: range.start, lt: range.end },
          },
          _sum: { amount: true },
        }),
      ]);

    const incomeSumByTrip: Record<string, number> = {};
    const extraSumByTrip: Record<string, number> = {};
    const expSumByTrip: Record<string, number> = {};
    for (const g of incomeGroups as any[]) incomeSumByTrip[g.tripId] = decimalToNumber(g._sum.amount);
    for (const g of extraGroups as any[]) extraSumByTrip[g.tripId] = decimalToNumber(g._sum.amount);
    for (const g of tripExpGroups as any[]) expSumByTrip[g.tripId] = decimalToNumber(g._sum.amount);

    const opExpByBus: Record<string, number> = {};
    const opIncByBus: Record<string, number> = {};
    for (const g of opExpGroups) opExpByBus[g.busId] = decimalToNumber(g._sum.amount);
    for (const g of opIncGroups) opIncByBus[g.busId] = decimalToNumber(g._sum.amount);

    const busWageMap = new Map(buses.map((b) => [b.id, b]));

    // Compute per-bus salary for the period (aggregated across days)
    type BusDay = {
      busId: string;
      date: string;
      dti: number;
      driverSalary: number;
      conductorSalary: number;
    };

    // Group trips by busId + date for per-day DTI calc when using percentage model
    const tripsByBusDate: Record<
      string,
      { tripIds: string[]; busId: string; date: string }
    > = {};
    for (const t of trips) {
      const dateKey = t.tripDate.toISOString().slice(0, 10);
      const key = `${t.busId}|${dateKey}`;
      if (!tripsByBusDate[key]) {
        tripsByBusDate[key] = { tripIds: [], busId: t.busId, date: dateKey };
      }
      tripsByBusDate[key].tripIds.push(t.id);
    }

    // Staff salary accumulator
    const staffSalaryMap = new Map<
      string,
      {
        staffId: string;
        fullName: string;
        roleType: string;
        role: 'driver' | 'conductor';
        totalTrips: number;
        totalDaysWorked: number;
        totalPayable: number;
        assignments: Array<{
          busId: string;
          registrationNumber: string;
          busName: string | null;
          date: string;
          tripCount: number;
          dti: number;
          salary: number;
          wageModel: string;
          calculationDetail: string;
        }>;
      }
    >();

    const uniqueDaysPerStaff = new Map<string, Set<string>>();

    // Per-bus-day calculation
    for (const [, group] of Object.entries(tripsByBusDate)) {
      const bus = busWageMap.get(group.busId);
      if (!bus) continue;

      const tripIncome = group.tripIds.reduce(
        (s, id) => s + (incomeSumByTrip[id] ?? 0),
        0,
      );
      const extraIncome = group.tripIds.reduce(
        (s, id) => s + (extraSumByTrip[id] ?? 0),
        0,
      );
      const opInc = opIncByBus[group.busId] ?? 0;
      const tripExp = group.tripIds.reduce(
        (s, id) => s + (expSumByTrip[id] ?? 0),
        0,
      );
      const opExp = opExpByBus[group.busId] ?? 0;

      const totalIncome = tripIncome + extraIncome + opInc;
      const totalExpenses = tripExp + opExp;
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

      // Find staff for this bus on this day
      const dayTrips = trips.filter(
        (t) =>
          t.busId === group.busId &&
          t.tripDate.toISOString().slice(0, 10) === group.date,
      );

      const driverIds = new Set(
        dayTrips.map((t) => t.driverStaffId).filter(Boolean) as string[],
      );
      const conductorIds = new Set(
        dayTrips.map((t) => t.conductorStaffId).filter(Boolean) as string[],
      );

      const driverTrips = dayTrips.filter((t) => t.driverStaffId);
      const conductorTrips = dayTrips.filter((t) => t.conductorStaffId);

      // Distribute driver salary equally if multiple drivers (edge case)
      const numDrivers = driverIds.size || 1;
      const numConductors = conductorIds.size || 1;

      for (const driverId of driverIds) {
        const staffTrips = driverTrips.filter((t) => t.driverStaffId === driverId);
        const driverTrip = staffTrips[0];
        const staff = driverTrip?.driver;
        if (!staff) continue;

        if (!staffSalaryMap.has(driverId)) {
          staffSalaryMap.set(driverId, {
            staffId: driverId,
            fullName: staff.fullName,
            roleType: staff.roleType.toLowerCase(),
            role: 'driver',
            totalTrips: 0,
            totalDaysWorked: 0,
            totalPayable: 0,
            assignments: [],
          });
          uniqueDaysPerStaff.set(driverId, new Set());
        }
        const entry = staffSalaryMap.get(driverId)!;
        const daysSet = uniqueDaysPerStaff.get(driverId)!;

        const perDriverSalary = Math.round(driverSalary / numDrivers);
        entry.totalTrips += staffTrips.length;
        entry.totalPayable += perDriverSalary;
        if (!daysSet.has(group.date)) {
          daysSet.add(group.date);
          entry.totalDaysWorked += 1;
        }

        const calcDetail =
          bus.wageModel === 'PERCENTAGE'
            ? `${driverPct}% of DTI ${dti.toLocaleString('en-LK')}`
            : `Fixed: Rs. ${fixedDriver.toLocaleString('en-LK')}`;

        entry.assignments.push({
          busId: bus.id,
          registrationNumber: bus.registrationNumber,
          busName: bus.busName,
          date: group.date,
          tripCount: staffTrips.length,
          dti,
          salary: perDriverSalary,
          wageModel: bus.wageModel.toLowerCase(),
          calculationDetail: calcDetail,
        });
      }

      for (const conductorId of conductorIds) {
        const staffTrips = conductorTrips.filter(
          (t) => t.conductorStaffId === conductorId,
        );
        const conductorTrip = staffTrips[0];
        const staff = conductorTrip?.conductor;
        if (!staff) continue;

        if (!staffSalaryMap.has(conductorId)) {
          staffSalaryMap.set(conductorId, {
            staffId: conductorId,
            fullName: staff.fullName,
            roleType: staff.roleType.toLowerCase(),
            role: 'conductor',
            totalTrips: 0,
            totalDaysWorked: 0,
            totalPayable: 0,
            assignments: [],
          });
          uniqueDaysPerStaff.set(conductorId, new Set());
        }
        const entry = staffSalaryMap.get(conductorId)!;
        const daysSet = uniqueDaysPerStaff.get(conductorId)!;

        const perConductorSalary = Math.round(conductorSalary / numConductors);
        entry.totalTrips += staffTrips.length;
        entry.totalPayable += perConductorSalary;
        if (!daysSet.has(group.date)) {
          daysSet.add(group.date);
          entry.totalDaysWorked += 1;
        }

        const calcDetail =
          bus.wageModel === 'PERCENTAGE'
            ? `${conductorPct}% of DTI ${dti.toLocaleString('en-LK')}`
            : `Fixed: Rs. ${fixedConductor.toLocaleString('en-LK')}`;

        entry.assignments.push({
          busId: bus.id,
          registrationNumber: bus.registrationNumber,
          busName: bus.busName,
          date: group.date,
          tripCount: staffTrips.length,
          dti,
          salary: perConductorSalary,
          wageModel: bus.wageModel.toLowerCase(),
          calculationDetail: calcDetail,
        });
      }
    }

    const staffList = Array.from(staffSalaryMap.values()).sort(
      (a, b) => b.totalPayable - a.totalPayable,
    );

    const totalDriverPayable = staffList
      .filter((s) => s.role === 'driver')
      .reduce((s, v) => s + v.totalPayable, 0);
    const totalConductorPayable = staffList
      .filter((s) => s.role === 'conductor')
      .reduce((s, v) => s + v.totalPayable, 0);

    const salaryRows = staffList.flatMap((s) =>
      s.assignments.map((a) => ({
        staffName: s.fullName,
        role: s.role,
        bus: a.registrationNumber,
        busName: a.busName ?? '',
        date: a.date,
        tripCount: a.tripCount,
        dti: a.dti,
        salary: a.salary,
        wageModel: a.wageModel,
        calculationDetail: a.calculationDetail,
      })),
    );

    return {
      period: range.label,
      summary: {
        totalStaff: staffList.length,
        totalDriverPayable,
        totalConductorPayable,
        totalPayable: totalDriverPayable + totalConductorPayable,
      },
      staff: staffList,
      rows: salaryRows,
    };
  }

  // ── 5. By Route report ─────────────────────────────────────────────────────

  async getRouteReport(companyId: string, query: ReportQueryDto) {
    const range = resolveDateRange(query);

    const routes = await this.prisma.route.findMany({
      where: { companyId, isActive: true },
      select: {
        id: true,
        routeName: true,
        routeCode: true,
        startLocation: true,
        endLocation: true,
        buses: {
          where: { isActive: true },
          select: {
            id: true,
            registrationNumber: true,
            busName: true,
            wageModel: true,
            driverPercentage: true,
            conductorPercentage: true,
            fixedDriverWage: true,
            fixedConductorWage: true,
          },
        },
      },
      orderBy: { routeName: 'asc' },
    });

    const allBusIds = routes.flatMap((r) => r.buses.map((b) => b.id));

    if (allBusIds.length === 0) {
      return {
        period: range.label,
        summary: {
          totalRoutes: 0,
          totalBuses: 0,
          totalTrips: 0,
          totalIncome: 0,
          totalExpenses: 0,
          totalProfit: 0,
        },
        routes: [],
      };
    }

    const trips = await this.prisma.trip.findMany({
      where: {
        companyId,
        busId: { in: allBusIds },
        tripDate: { gte: range.start, lt: range.end },
      },
      select: { id: true, busId: true },
    });

    const tripsByBus: Record<string, string[]> = {};
    for (const t of trips) (tripsByBus[t.busId] ??= []).push(t.id);
    const allTripIds = trips.map((t) => t.id);

    const [incomeGroups, extraGroups, tripExpGroups, opExpGroups, opIncGroups] =
      await Promise.all([
        allTripIds.length
          ? this.prisma.tripIncome.groupBy({
              by: ['tripId'],
              where: { tripId: { in: allTripIds } },
              _sum: { amount: true },
            })
          : [],
        allTripIds.length
          ? this.prisma.extraIncome.groupBy({
              by: ['tripId'],
              where: { tripId: { in: allTripIds } },
              _sum: { amount: true },
            })
          : [],
        allTripIds.length
          ? this.prisma.tripExpense.groupBy({
              by: ['tripId'],
              where: { tripId: { in: allTripIds } },
              _sum: { amount: true },
            })
          : [],
        this.prisma.operationalExpense.groupBy({
          by: ['busId'],
          where: {
            companyId,
            busId: { in: allBusIds },
            recordDate: { gte: range.start, lt: range.end },
          },
          _sum: { amount: true },
        }),
        this.prisma.operationalIncome.groupBy({
          by: ['busId'],
          where: {
            companyId,
            busId: { in: allBusIds },
            recordDate: { gte: range.start, lt: range.end },
          },
          _sum: { amount: true },
        }),
      ]);

    const incomeSumByTrip: Record<string, number> = {};
    const extraSumByTrip: Record<string, number> = {};
    const expSumByTrip: Record<string, number> = {};
    for (const g of incomeGroups as any[]) incomeSumByTrip[g.tripId] = decimalToNumber(g._sum.amount);
    for (const g of extraGroups as any[]) extraSumByTrip[g.tripId] = decimalToNumber(g._sum.amount);
    for (const g of tripExpGroups as any[]) expSumByTrip[g.tripId] = decimalToNumber(g._sum.amount);

    const opExpByBus: Record<string, number> = {};
    const opIncByBus: Record<string, number> = {};
    for (const g of opExpGroups) opExpByBus[g.busId] = decimalToNumber(g._sum.amount);
    for (const g of opIncGroups) opIncByBus[g.busId] = decimalToNumber(g._sum.amount);

    const routeResults = routes.map((route) => {
      const busDetails = route.buses.map((bus) => {
        const busTripIds = tripsByBus[bus.id] ?? [];
        const tripIncome = busTripIds.reduce((s, id) => s + (incomeSumByTrip[id] ?? 0), 0);
        const extraIncome = busTripIds.reduce((s, id) => s + (extraSumByTrip[id] ?? 0), 0);
        const opInc = opIncByBus[bus.id] ?? 0;
        const tripExp = busTripIds.reduce((s, id) => s + (expSumByTrip[id] ?? 0), 0);
        const opExp = opExpByBus[bus.id] ?? 0;

        const totalIncome = tripIncome + extraIncome + opInc;
        const totalExpenses = tripExp + opExp;
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

        const totalSalaries = driverSalary + conductorSalary;
        const profit = dti - totalSalaries;

        return {
          busId: bus.id,
          registrationNumber: bus.registrationNumber,
          busName: bus.busName,
          tripCount: busTripIds.length,
          totalIncome,
          totalExpenses,
          dti,
          driverSalary,
          conductorSalary,
          profit,
        };
      });

      const totalIncome = busDetails.reduce((s, b) => s + b.totalIncome, 0);
      const totalExpenses = busDetails.reduce((s, b) => s + b.totalExpenses, 0);
      const totalProfit = busDetails.reduce((s, b) => s + b.profit, 0);
      const totalTrips = busDetails.reduce((s, b) => s + b.tripCount, 0);

      return {
        routeId: route.id,
        routeName: route.routeName,
        routeCode: route.routeCode,
        startLocation: route.startLocation,
        endLocation: route.endLocation,
        busCount: route.buses.length,
        totalTrips,
        totalIncome,
        totalExpenses,
        dti: totalIncome - totalExpenses,
        totalProfit,
        buses: busDetails,
      };
    });

    // Only include routes with activity
    const activeRoutes = routeResults.filter(
      (r) => r.totalIncome > 0 || r.totalExpenses > 0 || r.totalTrips > 0,
    );

    const grandTotals = activeRoutes.reduce(
      (acc, r) => ({
        totalRoutes: acc.totalRoutes + 1,
        totalBuses: acc.totalBuses + r.busCount,
        totalTrips: acc.totalTrips + r.totalTrips,
        totalIncome: acc.totalIncome + r.totalIncome,
        totalExpenses: acc.totalExpenses + r.totalExpenses,
        totalProfit: acc.totalProfit + r.totalProfit,
      }),
      {
        totalRoutes: 0,
        totalBuses: 0,
        totalTrips: 0,
        totalIncome: 0,
        totalExpenses: 0,
        totalProfit: 0,
      },
    );

    const routeRows = activeRoutes.flatMap((r) =>
      r.buses.map((b) => ({
        routeName: r.routeName,
        routeCode: r.routeCode ?? '',
        bus: b.registrationNumber,
        busName: b.busName ?? '',
        tripCount: b.tripCount,
        income: b.totalIncome,
        expenses: b.totalExpenses,
        dti: b.dti,
        driverSalary: b.driverSalary,
        conductorSalary: b.conductorSalary,
        profit: b.profit,
      })),
    );

    return {
      period: range.label,
      summary: grandTotals,
      routes: activeRoutes,
      rows: routeRows,
    };
  }
}
