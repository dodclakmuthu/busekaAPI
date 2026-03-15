import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';

@Injectable()
export class StaffService {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveStaff(companyId: string, staffId: string) {
    const staff = await this.prisma.staffProfile.findFirst({
      where: { id: staffId, companyId },
    });
    if (!staff) throw new NotFoundException(`Staff ${staffId} not found`);
    return staff;
  }

  async create(companyId: string, dto: CreateStaffDto) {
    const staff = await this.prisma.staffProfile.create({
      data: {
        companyId,
        fullName: dto.fullName.trim(),
        mobileNumber: dto.mobileNumber?.trim() ?? null,
        nicNumber: dto.nicNumber?.trim() ?? null,
        roleType: dto.roleType,
        employmentType: dto.employmentType ?? 'PERMANENT',
        isActive: dto.isActive ?? true,
      },
    });

    return { staff };
  }

  async findAll(companyId: string) {
    const staff = await this.prisma.staffProfile.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    });
    return { staff };
  }

  async findOne(companyId: string, staffId: string) {
    const staff = await this.resolveStaff(companyId, staffId);
    return { staff };
  }

  async update(companyId: string, staffId: string, dto: UpdateStaffDto) {
    await this.resolveStaff(companyId, staffId);

    const staff = await this.prisma.staffProfile.update({
      where: { id: staffId },
      data: {
        ...(dto.fullName !== undefined && { fullName: dto.fullName.trim() }),
        ...(dto.mobileNumber !== undefined && { mobileNumber: dto.mobileNumber?.trim() ?? null }),
        ...(dto.nicNumber !== undefined && { nicNumber: dto.nicNumber?.trim() ?? null }),
        ...(dto.roleType !== undefined && { roleType: dto.roleType }),
        ...(dto.employmentType !== undefined && { employmentType: dto.employmentType }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });

    return { staff };
  }
}
