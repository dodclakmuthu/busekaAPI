import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TripsService } from '../trips/trips.service';
import { StartTripDto, TripDirectionDto } from './dto/start-trip.dto';
import { CreateExtraIncomeDto } from './dto/create-extra-income.dto';
import { CreateCrewTripExpenseDto } from './dto/create-crew-trip-expense.dto';
import { EndCrewTripDto } from './dto/end-crew-trip.dto';
import { StaffRoleFilter } from './dto/staff-options-query.dto';
import { getBusinessDayRangeUtc } from '../common/business-day';

export type ResolvedCrewSource =
  | 'TODAY_ASSIGNMENT'
  | 'DEFAULT_CREW'
  | 'MANUAL_SELECTION_REQUIRED';

const STAFF_FIELDS = {
  id: true,
  fullName: true,
  roleType: true,
  employmentType: true,
} as const;

const DRIVER_ROLES = ['DRIVER', 'DRIVER_CONDUCTOR'] as const;
const CONDUCTOR_ROLES = ['CONDUCTOR', 'DRIVER_CONDUCTOR'] as const;

@Injectable()
export class CrewDutyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tripsService: TripsService,
  ) {}

  // ── Duty Context ─────────────────────────────────────────────────
  async getDutyContext(busId: string, companyId: string) {
    const dayRange = getBusinessDayRangeUtc({ today: true });
    if (!dayRange) throw new BadRequestException('Invalid date');
    const todayStart = dayRange.start;
    const todayEnd = dayRange.end;

    const [bus, assignment] = await Promise.all([
      this.prisma.bus.findFirst({
        where: { id: busId, companyId, isActive: true },
        select: {
          id: true,
          registrationNumber: true,
          busName: true,
          route: {
            select: {
              id: true,
              routeCode: true,
              routeName: true,
              startLocation: true,
              endLocation: true,
            },
          },
          defaultDriver: { select: STAFF_FIELDS },
          defaultConductor: { select: STAFF_FIELDS },
        },
      }),
      this.prisma.busAssignment.findFirst({
        where: {
          busId,
          companyId,
          assignmentDate: { gte: todayStart, lt: todayEnd },
          status: { not: 'CANCELLED' },
        },
        select: {
          id: true,
          assignmentDate: true,
          status: true,
          driver: { select: STAFF_FIELDS },
          conductor: { select: STAFF_FIELDS },
        },
      }),
    ]);

    if (!bus) throw new NotFoundException('Bus not found');

    const hasAssignmentCrew = !!(assignment?.driver && assignment.conductor);
    const hasDefaultCrew = !!(bus.defaultDriver && bus.defaultConductor);

    let resolvedCrewSource: ResolvedCrewSource;
    let resolvedDriver: (typeof STAFF_FIELDS extends object ? typeof bus.defaultDriver : never) | null;
    let resolvedConductor: typeof resolvedDriver;

    if (hasAssignmentCrew) {
      resolvedCrewSource = 'TODAY_ASSIGNMENT';
      resolvedDriver = assignment!.driver;
      resolvedConductor = assignment!.conductor;
    } else if (hasDefaultCrew) {
      resolvedCrewSource = 'DEFAULT_CREW';
      resolvedDriver = bus.defaultDriver;
      resolvedConductor = bus.defaultConductor;
    } else {
      resolvedCrewSource = 'MANUAL_SELECTION_REQUIRED';
      resolvedDriver = null;
      resolvedConductor = null;
    }

    return {
      bus: {
        id: bus.id,
        registrationNumber: bus.registrationNumber,
        busName: bus.busName ?? null,
        route: bus.route ?? null,
      },
      assignment: assignment
        ? {
            id: assignment.id,
            assignmentDate: assignment.assignmentDate.toISOString(),
            status: assignment.status,
            driver: assignment.driver ?? null,
            conductor: assignment.conductor ?? null,
          }
        : null,
      defaultCrew: {
        driver: bus.defaultDriver ?? null,
        conductor: bus.defaultConductor ?? null,
      },
      resolvedCrew: {
        driver: resolvedDriver ?? null,
        conductor: resolvedConductor ?? null,
      },
      resolvedCrewSource,
      requiresManualSelection: resolvedCrewSource === 'MANUAL_SELECTION_REQUIRED',
    };
  }

  // ── Staff Options ────────────────────────────────────────────────
  async getStaffOptions(companyId: string, role?: StaffRoleFilter) {
    type RoleType = 'DRIVER' | 'CONDUCTOR' | 'DRIVER_CONDUCTOR';
    let roleIn: RoleType[] | undefined;

    if (role === StaffRoleFilter.DRIVER) {
      roleIn = [...DRIVER_ROLES];
    } else if (role === StaffRoleFilter.CONDUCTOR) {
      roleIn = [...CONDUCTOR_ROLES];
    }

    const staff = await this.prisma.staffProfile.findMany({
      where: {
        companyId,
        isActive: true,
        ...(roleIn ? { roleType: { in: roleIn } } : {}),
      },
      select: { ...STAFF_FIELDS, isActive: true },
      orderBy: [{ roleType: 'asc' }, { fullName: 'asc' }],
    });

    return { staff };
  }

  // ── Start Trip ───────────────────────────────────────────────────
  async startTrip(busId: string, companyId: string, dto: StartTripDto) {
    const dayRange = getBusinessDayRangeUtc({ today: true });
    if (!dayRange) throw new BadRequestException('Invalid date');
    const todayStart = dayRange.start;
    const todayEnd = dayRange.end;
    // Enforce single active trip per bus per day
    const existingActive = await this.prisma.trip.findFirst({
      where: {
        companyId,
        busId,
        tripDate: { gte: todayStart, lt: todayEnd },
        status: 'IN_PROGRESS',
      },
      select: { id: true },
    });
    if (existingActive) {
      throw new ConflictException('An active trip already exists for this bus today');
    }

    const [bus, assignment] = await Promise.all([
      this.prisma.bus.findFirst({
        where: { id: busId, companyId, isActive: true },
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
          busId,
          companyId,
          assignmentDate: { gte: todayStart, lt: todayEnd },
          status: { not: 'CANCELLED' },
        },
        select: {
          id: true,
          driverStaffId: true,
          conductorStaffId: true,
        },
      }),
    ]);

    if (!bus) throw new NotFoundException('Bus not found');
    if (bus.status === 'SOLD' || bus.status === 'INACTIVE') {
      throw new BadRequestException('Bus is not currently operational');
    }

    // ── Crew Resolution ──────────────────────────────────────────
    let resolvedDriverId: string;
    let resolvedConductorId: string;

    if (assignment?.driverStaffId && assignment.conductorStaffId) {
      // Assignment takes priority
      resolvedDriverId = assignment.driverStaffId;
      resolvedConductorId = assignment.conductorStaffId;
    } else if (bus.defaultDriverStaffId && bus.defaultConductorStaffId) {
      // Fall back to bus defaults
      resolvedDriverId = bus.defaultDriverStaffId;
      resolvedConductorId = bus.defaultConductorStaffId;
    } else {
      // Manual selection required
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

      if (!driver) {
        throw new BadRequestException('Selected driver not found or inactive');
      }
      if (!(DRIVER_ROLES as readonly string[]).includes(driver.roleType)) {
        throw new BadRequestException('Selected staff member cannot serve as driver');
      }
      if (!conductor) {
        throw new BadRequestException('Selected conductor not found or inactive');
      }
      if (!(CONDUCTOR_ROLES as readonly string[]).includes(conductor.roleType)) {
        throw new BadRequestException('Selected staff member cannot serve as conductor');
      }

      resolvedDriverId = dto.driverStaffId;
      resolvedConductorId = dto.conductorStaffId;
    }

    // ── Create Trip ──────────────────────────────────────────────
    const tripCount = await this.prisma.trip.count({
      where: { busId, tripDate: { gte: todayStart, lt: todayEnd } },
    });

    const now = new Date();
    const trip = await this.prisma.trip.create({
      data: {
        companyId,
        busId,
        assignmentId: assignment?.id ?? null,
        routeId: dto.routeId ?? bus.routeId ?? null,
        tripDate: todayStart,
        tripNumber: tripCount + 1,
        direction: (dto.direction ?? TripDirectionDto.UP) as 'UP' | 'DOWN',
        startStopId: dto.startStopId ?? null,
        driverStaffId: resolvedDriverId,
        conductorStaffId: resolvedConductorId,
        startedAt: now,
        status: 'IN_PROGRESS',
        createdVia: 'crew_duty_app',
      },
      select: {
        id: true,
        tripNumber: true,
        status: true,
        direction: true,
        startedAt: true,
        driverStaffId: true,
        conductorStaffId: true,
      },
    });

    // Mark assignment as STARTED
    if (assignment?.id) {
      await this.prisma.busAssignment.update({
        where: { id: assignment.id },
        data: { status: 'STARTED' },
      });
    }

    return {
      trip: {
        id: trip.id,
        tripNumber: trip.tripNumber,
        status: trip.status,
        direction: trip.direction,
        startedAt: trip.startedAt?.toISOString() ?? null,
        driverStaffId: trip.driverStaffId,
        conductorStaffId: trip.conductorStaffId,
      },
    };
  }

  // ── Extra Incomes ───────────────────────────────────────────────
  async addExtraIncome(tripId: string, companyId: string, dto: CreateExtraIncomeDto) {
    // ensure trip exists and belongs to company
    const trip = await this.prisma.trip.findFirst({ where: { id: tripId, companyId }, select: { id: true } });
    if (!trip) throw new NotFoundException('Trip not found');

    const amountNum = Number(dto.amount);
    if (!isFinite(amountNum) || amountNum <= 0) {
      throw new BadRequestException('Amount must be a positive number');
    }

    const extra = await this.prisma.extraIncome.create({
      data: {
        tripId,
        category: dto.category as any,
        amount: dto.amount,
        note: dto.note?.trim() ?? null,
        enteredByType: 'crew_duty_app',
      },
      select: {
        id: true,
        category: true,
        amount: true,
        note: true,
        createdAt: true,
      },
    });

    return { extraIncome: extra };
  }

  async listTripIncomes(tripId: string, companyId: string) {
    const trip = await this.prisma.trip.findFirst({ where: { id: tripId, companyId } });
    if (!trip) throw new NotFoundException('Trip not found');

    const [incomes, extraIncomes] = await Promise.all([
      this.prisma.tripIncome.findMany({ where: { tripId }, select: { id: true, amount: true, note: true, createdAt: true } }),
      this.prisma.extraIncome.findMany({ where: { tripId }, select: { id: true, category: true, amount: true, note: true, createdAt: true } }),
    ]);

    return { incomes, extraIncomes };
  }

  // ── Trip Expenses (Crew) ───────────────────────────────────────
  async addTripExpense(busId: string, companyId: string, tripId: string, dto: CreateCrewTripExpenseDto) {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, companyId, busId },
      select: { id: true },
    });
    if (!trip) throw new NotFoundException('Trip not found');

    // Reuse the dashboard TripsService logic for validation + category normalization.
    return this.tripsService.addExpense(companyId, tripId, dto);
  }

  // ── End Trip (Crew) ────────────────────────────────────────────
  async endTrip(busId: string, companyId: string, tripId: string, dto: EndCrewTripDto) {
    const trip = await this.prisma.trip.findFirst({
      where: { id: tripId, companyId, busId },
      select: { id: true },
    });
    if (!trip) throw new NotFoundException('Trip not found');

    // Reuse the TripsService endTrip implementation (creates main trip income).
    return this.tripsService.endTrip(companyId, tripId, dto);
  }
}
