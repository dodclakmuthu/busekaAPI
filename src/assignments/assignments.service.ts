import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { UpdateAssignmentDto } from './dto/update-assignment.dto';

function startOfDayUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function nextDayUtc(d: Date): Date {
  const s = startOfDayUtc(d);
  return new Date(s.getTime() + 24 * 60 * 60 * 1000);
}

@Injectable()
export class AssignmentsService {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveBus(companyId: string, busId: string) {
    const bus = await this.prisma.bus.findFirst({
      where: { id: busId, companyId, isActive: true },
      select: {
        id: true,
        status: true,
        defaultDriverStaffId: true,
        defaultConductorStaffId: true,
      },
    });
    if (!bus) throw new NotFoundException(`Bus ${busId} not found`);
    if (bus.status === 'SOLD') {
      throw new BadRequestException('Cannot assign crew to a SOLD bus');
    }
    return bus;
  }

  private async resolveActiveStaff(companyId: string, staffId: string) {
    const staff = await this.prisma.staffProfile.findFirst({
      where: { id: staffId, companyId, isActive: true },
      select: { id: true, roleType: true, fullName: true },
    });
    if (!staff) throw new NotFoundException(`Staff ${staffId} not found or inactive`);
    return staff;
  }

  private assertRoleCompatibility(driverRoleType: string, conductorRoleType: string, driverId?: string, conductorId?: string) {
    const driverOk = driverRoleType === 'DRIVER' || driverRoleType === 'DRIVER_CONDUCTOR';
    const conductorOk = conductorRoleType === 'CONDUCTOR' || conductorRoleType === 'DRIVER_CONDUCTOR';

    if (!driverOk) throw new ConflictException('Selected driver is not compatible with DRIVER role');
    if (!conductorOk) throw new ConflictException('Selected conductor is not compatible with CONDUCTOR role');

    if (driverId && conductorId && driverId === conductorId) {
      // Only allowed when the staff member is DRIVER_CONDUCTOR.
      if (driverRoleType !== 'DRIVER_CONDUCTOR') {
        throw new ConflictException('Same staff member can be both roles only when roleType is DRIVER_CONDUCTOR');
      }
    }
  }

  async create(companyId: string, assignedByUserId: string, dto: CreateAssignmentDto) {
    const bus = await this.resolveBus(companyId, dto.busId);

    const requestedDate = new Date(dto.assignmentDate);
    if (Number.isNaN(requestedDate.getTime())) {
      throw new BadRequestException('Invalid assignmentDate');
    }
    const assignmentDate = startOfDayUtc(requestedDate);

    const driverStaffId = dto.driverStaffId ?? bus.defaultDriverStaffId ?? undefined;
    const conductorStaffId = dto.conductorStaffId ?? bus.defaultConductorStaffId ?? undefined;

    if (!driverStaffId || !conductorStaffId) {
      throw new BadRequestException('Driver and conductor must be provided (or set as default crew on the bus)');
    }

    const driver = await this.resolveActiveStaff(companyId, driverStaffId);
    const conductor = await this.resolveActiveStaff(companyId, conductorStaffId);

    this.assertRoleCompatibility(driver.roleType, conductor.roleType, driverStaffId, conductorStaffId);

    try {
      const assignment = await this.prisma.busAssignment.create({
        data: {
          companyId,
          busId: dto.busId,
          assignmentDate,
          driverStaffId,
          conductorStaffId,
          assignedByUserId,
          notes: dto.notes?.trim() ?? null,
        },
        include: {
          bus: { select: { id: true, registrationNumber: true, status: true } },
          driver: { select: { id: true, fullName: true, roleType: true } },
          conductor: { select: { id: true, fullName: true, roleType: true } },
        },
      });
      return { assignment };
    } catch (err: any) {
      // Unique constraint: @@unique([busId, assignmentDate])
      if (typeof err?.code === 'string' && err.code === 'P2002') {
        throw new ConflictException('An assignment already exists for this bus on that date');
      }
      throw err;
    }
  }

  async findAll(companyId: string, date?: string, busId?: string) {
    const where: any = { companyId };

    if (busId) where.busId = busId;

    if (date) {
      const d = new Date(date);
      if (Number.isNaN(d.getTime())) throw new BadRequestException('Invalid date');
      const start = startOfDayUtc(d);
      const end = nextDayUtc(d);
      where.assignmentDate = { gte: start, lt: end };
    }

    const assignments = await this.prisma.busAssignment.findMany({
      where,
      orderBy: [{ assignmentDate: 'desc' }, { createdAt: 'desc' }],
      include: {
        bus: { select: { id: true, registrationNumber: true, status: true } },
        driver: { select: { id: true, fullName: true, roleType: true } },
        conductor: { select: { id: true, fullName: true, roleType: true } },
      },
    });
    return { assignments };
  }

  async findOne(companyId: string, assignmentId: string) {
    const assignment = await this.prisma.busAssignment.findFirst({
      where: { id: assignmentId, companyId },
      include: {
        bus: { select: { id: true, registrationNumber: true, status: true } },
        driver: { select: { id: true, fullName: true, roleType: true } },
        conductor: { select: { id: true, fullName: true, roleType: true } },
      },
    });
    if (!assignment) throw new NotFoundException(`Assignment ${assignmentId} not found`);
    return { assignment };
  }

  async update(companyId: string, assignmentId: string, dto: UpdateAssignmentDto) {
    const existing = await this.prisma.busAssignment.findFirst({
      where: { id: assignmentId, companyId },
      select: { id: true, busId: true },
    });
    if (!existing) throw new NotFoundException(`Assignment ${assignmentId} not found`);

    // If changing the date or bus, ensure bus is operational and normalize date.
    let assignmentDate: Date | undefined;
    if (dto.assignmentDate !== undefined) {
      const d = new Date(dto.assignmentDate);
      if (Number.isNaN(d.getTime())) throw new BadRequestException('Invalid assignmentDate');
      assignmentDate = startOfDayUtc(d);
    }

    // Staff validation (only when provided)
    let driverRoleType: string | undefined;
    let conductorRoleType: string | undefined;

    if (dto.driverStaffId) {
      const driver = await this.resolveActiveStaff(companyId, dto.driverStaffId);
      driverRoleType = driver.roleType;
    }
    if (dto.conductorStaffId) {
      const conductor = await this.resolveActiveStaff(companyId, dto.conductorStaffId);
      conductorRoleType = conductor.roleType;
    }

    // If both are being updated, validate compatibility.
    if (dto.driverStaffId && dto.conductorStaffId) {
      this.assertRoleCompatibility(driverRoleType!, conductorRoleType!, dto.driverStaffId, dto.conductorStaffId);
    }

    try {
      const assignment = await this.prisma.busAssignment.update({
        where: { id: assignmentId },
        data: {
          ...(assignmentDate !== undefined && { assignmentDate }),
          ...(dto.driverStaffId !== undefined && { driverStaffId: dto.driverStaffId }),
          ...(dto.conductorStaffId !== undefined && { conductorStaffId: dto.conductorStaffId }),
          ...(dto.status !== undefined && { status: dto.status }),
          ...(dto.notes !== undefined && { notes: dto.notes?.trim() ?? null }),
        },
        include: {
          bus: { select: { id: true, registrationNumber: true, status: true } },
          driver: { select: { id: true, fullName: true, roleType: true } },
          conductor: { select: { id: true, fullName: true, roleType: true } },
        },
      });
      return { assignment };
    } catch (err: any) {
      if (typeof err?.code === 'string' && err.code === 'P2002') {
        throw new ConflictException('An assignment already exists for this bus on that date');
      }
      throw err;
    }
  }
}
