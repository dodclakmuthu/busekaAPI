import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBusDto } from './dto/create-bus.dto';
import { UpdateBusDto } from './dto/update-bus.dto';

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

    const bus = await this.prisma.bus.update({
      where: { id: busId },
      data: {
        ...(dto.registrationNumber !== undefined && { registrationNumber: dto.registrationNumber }),
        ...(dto.busName !== undefined && { busName: dto.busName }),
        ...(dto.ntcPermitNumber !== undefined && { ntcPermitNumber: dto.ntcPermitNumber }),
        ...(dto.routeId !== undefined && { routeId: dto.routeId }),
        ...(dto.seatCount !== undefined && { seatCount: dto.seatCount }),
        ...(dto.status !== undefined && { status: dto.status }),
      },
      include: { route: { select: { id: true, routeName: true, routeCode: true } } },
    });

    return { bus };
  }
}
