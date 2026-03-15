import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { SetBusPinDto } from './dto/set-bus-pin.dto';

@Injectable()
export class BusPinService {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveBus(companyId: string, busId: string) {
    const bus = await this.prisma.bus.findFirst({
      where: { id: busId, companyId, isActive: true },
      select: { id: true, status: true },
    });
    if (!bus) throw new NotFoundException(`Bus ${busId} not found`);
    return bus;
  }

  private async assertBusOperational(companyId: string, busId: string) {
    const bus = await this.resolveBus(companyId, busId);
    if (bus.status === 'SOLD') {
      throw new BadRequestException('Cannot set or reset a PIN for a SOLD bus');
    }
    return bus;
  }

  async setPin(companyId: string, busId: string, userId: string, dto: SetBusPinDto) {
    await this.assertBusOperational(companyId, busId);

    const existingActive = await this.prisma.busAccessPin.findFirst({
      where: { busId, isActive: true },
      select: { id: true },
    });
    if (existingActive) {
      throw new ConflictException(
        'A PIN is already set for this bus. Use the reset endpoint to change it.',
      );
    }

    const pinHash = await bcrypt.hash(dto.pin, 10);
    const now = new Date();

    const pin = await this.prisma.$transaction(async (tx) => {
      // Defensive: ensure no other PIN remains active.
      await tx.busAccessPin.updateMany({
        where: { busId, isActive: true },
        data: { isActive: false, validUntil: now },
      });

      return tx.busAccessPin.create({
        data: {
          busId,
          assignmentId: null,
          pinHash,
          isActive: true,
          validFrom: now,
          validUntil: null,
          createdByUserId: userId,
        },
        select: {
          id: true,
          busId: true,
          isActive: true,
          validFrom: true,
          validUntil: true,
          createdAt: true,
        },
      });
    });

    return { pin };
  }

  async resetPin(companyId: string, busId: string, userId: string, dto: SetBusPinDto) {
    await this.assertBusOperational(companyId, busId);

    const pinHash = await bcrypt.hash(dto.pin, 10);
    const now = new Date();

    const pin = await this.prisma.$transaction(async (tx) => {
      await tx.busAccessPin.updateMany({
        where: { busId, isActive: true },
        data: { isActive: false, validUntil: now },
      });

      return tx.busAccessPin.create({
        data: {
          busId,
          assignmentId: null,
          pinHash,
          isActive: true,
          validFrom: now,
          validUntil: null,
          createdByUserId: userId,
        },
        select: {
          id: true,
          busId: true,
          isActive: true,
          validFrom: true,
          validUntil: true,
          createdAt: true,
        },
      });
    });

    return { pin };
  }
}
