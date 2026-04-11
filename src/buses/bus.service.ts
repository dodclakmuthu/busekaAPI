import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBusDto } from './dto/create-bus.dto';
import { UpdateBusDto } from './dto/update-bus.dto';
import { BusStatus, Prisma } from '@prisma/client';
import { getBusinessDayRangeUtc } from '../common/business-day';
import {
  decimalToNumber,
  mapExpenseCategoryToDashboard,
  mapExtraIncomeCategoryToDashboard,
  normalizeExpenseCategory,
  normalizeExtraIncomeCategory,
} from '../common/finance';
import { CreateOperationalExpenseDto } from './dto/create-operational-expense.dto';
import { CreateOperationalIncomeDto } from './dto/create-operational-income.dto';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class BusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ── helpers ────────────────────────────────────────────────────────────────

  /** Convert Decimal wage fields to plain numbers for JSON serialisation. */
  private mapBus<T extends {
    driverPercentage?: Prisma.Decimal | null;
    conductorPercentage?: Prisma.Decimal | null;
    fixedDriverWage?: Prisma.Decimal | null;
    fixedConductorWage?: Prisma.Decimal | null;
  }>(bus: T) {
    return {
      ...bus,
      driverPercentage: decimalToNumber(bus.driverPercentage) || null,
      conductorPercentage: decimalToNumber(bus.conductorPercentage) || null,
      fixedDriverWage: decimalToNumber(bus.fixedDriverWage) || null,
      fixedConductorWage: decimalToNumber(bus.fixedConductorWage) || null,
    };
  }

  /** Ensure a bus belongs to the company, or throw 404. */
  private async resolveBus(busId: string, companyId: string) {
    const bus = await this.prisma.bus.findFirst({
      where: { id: busId, companyId, isActive: true },
    });
    if (!bus) throw new NotFoundException(`Bus ${busId} not found`);
    return bus;
  }

  /** Validate a routeId belongs to the same company (when supplied). */
  private async validateRoute(routeId: string, companyId: string) {
    const route = await this.prisma.route.findFirst({
      where: {
        id: routeId,
        isActive: true,
        OR: [
          {
            companyId,
            sourceType: { not: 'GLOBAL' },
          },
          {
            sourceType: 'GLOBAL',
            approvalStatus: 'APPROVED',
          },
        ],
      },
      select: { id: true },
    });
    if (!route) {
      throw new NotFoundException(`Route ${routeId} is not available for bus assignment`);
    }
  }

  private readonly routeSummarySelect = {
    id: true,
    routeName: true,
    routeCode: true,
    sourceType: true,
  } as const;

  private async validateDefaultDriver(staffId: string, companyId: string) {
    const staff = await this.prisma.staffProfile.findFirst({
      where: { id: staffId, companyId, isActive: true },
      select: { id: true, roleType: true },
    });
    if (!staff) throw new NotFoundException(`Staff ${staffId} not found in your company`);
    if (staff.roleType !== 'DRIVER' && staff.roleType !== 'DRIVER_CONDUCTOR') {
      throw new ConflictException('Default driver must be DRIVER or DRIVER_CONDUCTOR');
    }
  }

  private async validateDefaultConductor(staffId: string, companyId: string) {
    const staff = await this.prisma.staffProfile.findFirst({
      where: { id: staffId, companyId, isActive: true },
      select: { id: true, roleType: true },
    });
    if (!staff) throw new NotFoundException(`Staff ${staffId} not found in your company`);
    if (staff.roleType !== 'CONDUCTOR' && staff.roleType !== 'DRIVER_CONDUCTOR') {
      throw new ConflictException('Default conductor must be CONDUCTOR or DRIVER_CONDUCTOR');
    }
  }

  // ── CRUD ───────────────────────────────────────────────────────────────────
  // All methods receive companyId directly from CompanyGuard via the controller,
  // avoiding a redundant DB lookup.

  async create(companyId: string, dto: CreateBusDto) {
    const duplicate = await this.prisma.bus.findFirst({
      where: { companyId, registrationNumber: dto.registrationNumber, isActive: true },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException(
        `Registration number '${dto.registrationNumber}' already exists in your fleet`,
      );
    }

    if (dto.routeId) await this.validateRoute(dto.routeId, companyId);

    const bus = await this.prisma.bus.create({
      data: {
        companyId,
        registrationNumber: dto.registrationNumber,
        busName: dto.busName,
        ntcPermitNumber: dto.ntcPermitNumber,
        permitExpiry: dto.permitExpiry ? new Date(dto.permitExpiry) : null,
        insuranceExpiry: dto.insuranceExpiry ? new Date(dto.insuranceExpiry) : null,
        routeId: dto.routeId ?? null,
        seatCount: dto.seatCount ?? null,
        status: dto.status ?? 'ACTIVE',
        wageModel: dto.wageModel ?? 'PERCENTAGE',
        driverPercentage: dto.driverPercentage != null ? new Prisma.Decimal(dto.driverPercentage) : null,
        conductorPercentage: dto.conductorPercentage != null ? new Prisma.Decimal(dto.conductorPercentage) : null,
        fixedDriverWage: dto.fixedDriverWage != null ? new Prisma.Decimal(dto.fixedDriverWage) : null,
        fixedConductorWage: dto.fixedConductorWage != null ? new Prisma.Decimal(dto.fixedConductorWage) : null,
      },
      include: { route: { select: this.routeSummarySelect } },
    });

    return { bus: this.mapBus(bus) };
  }

  async findAll(companyId: string) {
    const buses = await this.prisma.bus.findMany({
      where: { companyId, isActive: true },
      orderBy: { createdAt: 'desc' },
      include: { route: { select: this.routeSummarySelect } },
    });
    return { buses: buses.map(b => this.mapBus(b)) };
  }

  /** GET /buses/active - active/available buses only (status=ACTIVE). */
  async findActive(companyId: string) {
    const buses = await this.prisma.bus.findMany({
      where: { companyId, isActive: true, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
      include: { route: { select: this.routeSummarySelect } },
    });
    return { buses: buses.map(b => this.mapBus(b)) };
  }

  async findOne(companyId: string, busId: string) {
    const bus = await this.prisma.bus.findFirst({
      where: { id: busId, companyId, isActive: true },
      include: { route: { select: this.routeSummarySelect } },
    });
    if (!bus) throw new NotFoundException(`Bus ${busId} not found`);
    return { bus: this.mapBus(bus) };
  }

  async update(companyId: string, busId: string, dto: UpdateBusDto) {
    await this.resolveBus(busId, companyId);

    if (!dto.confirmationPin?.trim()) {
      throw new BadRequestException('Bus PIN confirmation is required to edit this bus');
    }

    const activePin = await this.prisma.busAccessPin.findFirst({
      where: { busId, isActive: true },
      orderBy: { validFrom: 'desc' },
      select: { pinHash: true },
    });

    if (!activePin) {
      throw new BadRequestException('No active PIN is set for this bus');
    }

    const validPin = await bcrypt.compare(dto.confirmationPin, activePin.pinHash);
    if (!validPin) {
      throw new BadRequestException('Invalid bus PIN');
    }

    if (dto.registrationNumber) {
      const duplicate = await this.prisma.bus.findFirst({
        where: {
          companyId,
          registrationNumber: dto.registrationNumber,
          isActive: true,
          NOT: { id: busId },
        },
        select: { id: true },
      });
      if (duplicate) {
        throw new ConflictException(
          `Registration number '${dto.registrationNumber}' already exists in your fleet`,
        );
      }
    }

    if (dto.routeId) await this.validateRoute(dto.routeId, companyId);

    if (dto.defaultDriverStaffId) {
      await this.validateDefaultDriver(dto.defaultDriverStaffId, companyId);
    }

    if (dto.defaultConductorStaffId) {
      await this.validateDefaultConductor(dto.defaultConductorStaffId, companyId);
    }

    const updateData = {
      ...(dto.registrationNumber !== undefined && { registrationNumber: dto.registrationNumber }),
      ...(dto.busName !== undefined && { busName: dto.busName }),
      ...(dto.ntcPermitNumber !== undefined && { ntcPermitNumber: dto.ntcPermitNumber }),
      ...(dto.permitExpiry !== undefined && { permitExpiry: dto.permitExpiry ? new Date(dto.permitExpiry) : null }),
      ...(dto.insuranceExpiry !== undefined && { insuranceExpiry: dto.insuranceExpiry ? new Date(dto.insuranceExpiry) : null }),
      ...(dto.routeId !== undefined && { routeId: dto.routeId }),
      ...(dto.seatCount !== undefined && { seatCount: dto.seatCount }),
      ...(dto.status !== undefined && { status: dto.status }),
      ...(dto.defaultDriverStaffId !== undefined && { defaultDriverStaffId: dto.defaultDriverStaffId }),
      ...(dto.defaultConductorStaffId !== undefined && { defaultConductorStaffId: dto.defaultConductorStaffId }),
      ...(dto.wageModel !== undefined && { wageModel: dto.wageModel }),
      ...(dto.driverPercentage !== undefined && { driverPercentage: dto.driverPercentage != null ? new Prisma.Decimal(dto.driverPercentage) : null }),
      ...(dto.conductorPercentage !== undefined && { conductorPercentage: dto.conductorPercentage != null ? new Prisma.Decimal(dto.conductorPercentage) : null }),
      ...(dto.fixedDriverWage !== undefined && { fixedDriverWage: dto.fixedDriverWage != null ? new Prisma.Decimal(dto.fixedDriverWage) : null }),
      ...(dto.fixedConductorWage !== undefined && { fixedConductorWage: dto.fixedConductorWage != null ? new Prisma.Decimal(dto.fixedConductorWage) : null }),
    };

    const include = { route: { select: this.routeSummarySelect } };

    const bus = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.bus.update({
        where: { id: busId },
        data: updateData,
        include,
      });

      if (dto.status === 'SOLD') {
        await tx.busAccessPin.updateMany({
          where: { busId, isActive: true },
          data: { isActive: false, validUntil: new Date() },
        });
      }

      return updated;
    });

    return { bus: this.mapBus(bus) };
  }

  /** PATCH /buses/:id/status */
  async updateStatus(companyId: string, busId: string, status: BusStatus) {
    const existingBus = await this.resolveBus(busId, companyId);

    const now = new Date();

    const bus = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.bus.update({
        where: { id: busId },
        data: { status },
        include: {
          route: { select: this.routeSummarySelect },
        },
      });

      if (status === 'SOLD') {
        await tx.busAccessPin.updateMany({
          where: { busId, isActive: true },
          data: { isActive: false, validUntil: now },
        });
      }

      if (status === 'MAINTENANCE' && existingBus.status !== 'MAINTENANCE') {
        await this.notificationsService.createCompanyNotification(
          {
            companyId,
            type: 'BUS_MAINTENANCE',
            title: 'Bus in Maintenance',
            message: `${updated.registrationNumber} was moved to maintenance status.`,
            severity: 'INFO',
            relatedEntityType: 'BUS',
            relatedEntityId: updated.id,
            targetUrl: '/buses',
            metadata: { status },
          },
          tx,
        );
      }

      return updated;
    });

    return { bus: this.mapBus(bus) };
  }

  // ── Operational (non-trip) finance records ───────────────────────────────

  async addOperationalExpense(companyId: string, busId: string, dto: CreateOperationalExpenseDto) {
    await this.resolveBus(busId, companyId);

    const amount = Number(dto.amount);
    if (!isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Amount must be a positive number');
    }

    const dayRange = dto.date
      ? getBusinessDayRangeUtc({ date: dto.date })
      : getBusinessDayRangeUtc({ today: true });
    if (!dayRange) throw new BadRequestException('Invalid date');

    const created = await this.prisma.operationalExpense.create({
      data: {
        companyId,
        busId,
        recordDate: dayRange.start,
        category: normalizeExpenseCategory(dto.category),
        amount: new Prisma.Decimal(amount),
        note: dto.note?.trim() ?? null,
        enteredByType: 'dashboard',
      },
      select: {
        id: true,
        recordDate: true,
        category: true,
        amount: true,
        note: true,
        createdAt: true,
      },
    });

    return {
      operationalExpense: {
        id: created.id,
        busId,
        date: created.recordDate.toISOString().slice(0, 10),
        category: mapExpenseCategoryToDashboard(created.category),
        amount: decimalToNumber(created.amount),
        note: created.note ?? null,
        timestamp: created.createdAt.toISOString(),
      },
    };
  }

  async addOperationalIncome(companyId: string, busId: string, dto: CreateOperationalIncomeDto) {
    await this.resolveBus(busId, companyId);

    const amount = Number(dto.amount);
    if (!isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Amount must be a positive number');
    }

    const dayRange = dto.date
      ? getBusinessDayRangeUtc({ date: dto.date })
      : getBusinessDayRangeUtc({ today: true });
    if (!dayRange) throw new BadRequestException('Invalid date');

    const created = await this.prisma.operationalIncome.create({
      data: {
        companyId,
        busId,
        recordDate: dayRange.start,
        category: normalizeExtraIncomeCategory(dto.category),
        amount: new Prisma.Decimal(amount),
        note: dto.note?.trim() ?? null,
        enteredByType: 'dashboard',
      },
      select: {
        id: true,
        recordDate: true,
        category: true,
        amount: true,
        note: true,
        createdAt: true,
      },
    });

    return {
      operationalIncome: {
        id: created.id,
        busId,
        date: created.recordDate.toISOString().slice(0, 10),
        category: mapExtraIncomeCategoryToDashboard(created.category),
        amount: decimalToNumber(created.amount),
        note: created.note ?? null,
        timestamp: created.createdAt.toISOString(),
      },
    };
  }
}
