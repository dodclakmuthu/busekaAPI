import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CrewDutyLoginDto } from './dto/crew-duty-login.dto';
import type { CrewDutyJwtPayload } from './crew-duty-auth.types';

@Injectable()
export class CrewDutyAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(dto: CrewDutyLoginDto): Promise<{
    accessToken: string;
    bus: { id: string; companyId: string; registrationNumber: string };
  }> {
    // Do not leak which part is wrong.
    const invalidMessage = { message: 'Invalid registration number or PIN' };

    const registrationNumber = dto.registrationNumber.trim();

    const bus = await this.prisma.bus.findFirst({
      where: {
        isActive: true,
        registrationNumber: { equals: registrationNumber, mode: 'insensitive' },
      },
      select: {
        id: true,
        companyId: true,
        registrationNumber: true,
        status: true,
        isActive: true,
      },
    });

    if (!bus || !bus.isActive) {
      throw new UnauthorizedException(invalidMessage);
    }

    // Operational login: bus must be ACTIVE and not SOLD.
    if (bus.status !== 'ACTIVE') {
      throw new UnauthorizedException(invalidMessage);
    }

    const activePin = await this.prisma.busAccessPin.findFirst({
      where: { busId: bus.id, isActive: true },
      orderBy: { createdAt: 'desc' },
      select: { pinHash: true },
    });

    if (!activePin) {
      throw new UnauthorizedException(invalidMessage);
    }

    const ok = await bcrypt.compare(dto.pin, activePin.pinHash);
    if (!ok) {
      throw new UnauthorizedException(invalidMessage);
    }

    const payload: CrewDutyJwtPayload = {
      typ: 'crew-duty',
      sub: `bus:${bus.id}`,
      busId: bus.id,
      companyId: bus.companyId,
      registrationNumber: bus.registrationNumber,
    };

    const accessToken = await this.jwt.signAsync(payload, {
      audience: 'crew-duty',
    });

    return {
      accessToken,
      bus: {
        id: bus.id,
        companyId: bus.companyId,
        registrationNumber: bus.registrationNumber,
      },
    };
  }
}
