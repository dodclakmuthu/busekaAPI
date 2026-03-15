import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBusDto } from './dto/create-bus.dto';
import { UpdateBusDto } from './dto/update-bus.dto';
import { BusStatus } from '@prisma/client';

@Injectable()
export class BusService {
  constructor(private readonly prisma: PrismaService) {}

  // ── helpers ────────────────────────────────────────────────────────────────

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
      where: { id: routeId, companyId, isActive: true },
      select: { id: true },
    });
    if (!route) {
      throw new NotFoundException(`Route ${routeId} not found in your company`);
    }
  }

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
        routeId: dto.routeId ?? null,
        seatCount: dto.seatCount ?? null,
        status: dto.status ?? 'ACTIVE',
      },
      include: { route: { select: { id: true, routeName: true, routeCode: true } } },
    });

    return { bus };
  }

  async findAll(companyId: string) {
    const buses = await this.prisma.bus.findMany({
      where: { companyId, isActive: true },
      orderBy: { createdAt: 'desc' },
      include: { route: { select: { id: true, routeName: true, routeCode: true } } },
    });
    return { buses };
  }

  async findOne(companyId: string, busId: string) {
    const bus = await this.prisma.bus.findFirst({
      where: { id: busId, companyId, isActive: true },
      include: { route: { select: { id: true, routeName: true, routeCode: true } } },
    });
    if (!bus) throw new NotFoundException(`Bus ${busId} not found`);
    return { bus };
  }

  async update(companyId: string, busId: string, dto: UpdateBusDto) {
    await this.resolveBus(busId, companyId);

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
      ...(dto.routeId !== undefined && { routeId: dto.routeId }),
      ...(dto.seatCount !== undefined && { seatCount: dto.seatCount }),
      ...(dto.status !== undefined && { status: dto.status }),
      ...(dto.defaultDriverStaffId !== undefined && { defaultDriverStaffId: dto.defaultDriverStaffId }),
      ...(dto.defaultConductorStaffId !== undefined && { defaultConductorStaffId: dto.defaultConductorStaffId }),
    };

    const include = { route: { select: { id: true, routeName: true, routeCode: true } } };

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

    return { bus };
  }

  /** PATCH /buses/:id/status */
  async updateStatus(companyId: string, busId: string, status: BusStatus) {
    await this.resolveBus(busId, companyId);

    const now = new Date();

    const bus = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.bus.update({
        where: { id: busId },
        data: { status },
        include: {
          route: { select: { id: true, routeName: true, routeCode: true } },
        },
      });

      if (status === 'SOLD') {
        await tx.busAccessPin.updateMany({
          where: { busId, isActive: true },
          data: { isActive: false, validUntil: now },
        });
      }

      return updated;
    });

    return { bus };
  }
}
