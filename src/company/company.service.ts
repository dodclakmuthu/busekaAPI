import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';

@Injectable()
export class CompanyService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolve the active company owned by this user.
   * Throws ForbiddenException when none exists.
   *
   * This is the shared helper imported by BusService, StaffService, etc.
   * The CompanyGuard also uses PrismaService directly for a lightweight
   * HTTP-layer check — services call this method to get the companyId for
   * scoping their own queries.
   */
  async resolveActiveCompany(userId: string): Promise<{ id: string }> {
    const company = await this.prisma.company.findFirst({
      where: { ownerUserId: userId, isActive: true },
      select: { id: true },
    });
    if (!company) {
      throw new ForbiddenException(
        'No active company found for this user. Create a company first.',
      );
    }
    return company;
  }

  /** POST /companies — create a company for the authenticated user (MVP: one per user) */
  async create(userId: string, dto: CreateCompanyDto) {
    const existing = await this.prisma.company.findFirst({
      where: { ownerUserId: userId, isActive: true },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(
        'You already have an active company. Update it via PATCH /companies/my.',
      );
    }

    const owner = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { mobileNumber: true },
    });

    const company = await this.prisma.company.create({
      data: {
        name: dto.name,
        ownerUserId: userId,
        businessType: dto.businessType ?? 'individual_owner',
        mobileNumber: dto.mobileNumber ?? owner?.mobileNumber ?? null,
        address: dto.address ?? null,
        isActive: true,
      },
    });

    return { company };
  }

  /** GET /companies/my */
  async findMine(userId: string) {
    const company = await this.prisma.company.findFirst({
      where: { ownerUserId: userId, isActive: true },
    });
    if (!company) {
      throw new NotFoundException(
        'No active company found. Create one via POST /companies.',
      );
    }
    return { company };
  }

  /** PATCH /companies/my */
  async updateMine(userId: string, dto: UpdateCompanyDto) {
    const existing = await this.prisma.company.findFirst({
      where: { ownerUserId: userId, isActive: true },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException(
        'No active company found. Create one via POST /companies.',
      );
    }

    const company = await this.prisma.company.update({
      where: { id: existing.id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.businessType !== undefined && { businessType: dto.businessType }),
        ...(dto.mobileNumber !== undefined && { mobileNumber: dto.mobileNumber }),
        ...(dto.address !== undefined && { address: dto.address }),
      },
    });

    return { company };
  }
}
