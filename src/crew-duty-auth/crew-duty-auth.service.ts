import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CrewDutyLoginDto } from './dto/crew-duty-login.dto';
import type { CrewDutyJwtPayload } from './crew-duty-auth.types';

function getCrewDutySessionLeaseMs(config: ConfigService): number {
  const seconds = Number(config.get<string>('CREW_DUTY_SESSION_LOCK_SECONDS') ?? '120');
  return Math.max(30, seconds) * 1000;
}

@Injectable()
export class CrewDutyAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
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
        crewDutySessionId: true,
        crewDutySessionExpiresAt: true,
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

    const now = new Date();
    const leaseMs = getCrewDutySessionLeaseMs(this.config);
    const hasActiveRecentSession =
      bus.crewDutySessionId &&
      bus.crewDutySessionExpiresAt &&
      bus.crewDutySessionExpiresAt > now &&
      bus.crewDutySessionExpiresAt.getTime() - now.getTime() <= leaseMs;

    if (hasActiveRecentSession) {
      throw new ConflictException({
        message: 'Log out from other device to continue',
        code: 'CREW_DUTY_SESSION_ACTIVE',
      });
    }

    const sessionId = randomUUID();
    const sessionExpiresAt = new Date(now.getTime() + leaseMs);

    await this.prisma.bus.update({
      where: { id: bus.id },
      data: {
        crewDutySessionId: sessionId,
        crewDutySessionExpiresAt: sessionExpiresAt,
      },
      select: { id: true },
    });

    const payload: CrewDutyJwtPayload = {
      typ: 'crew-duty',
      sub: `bus:${bus.id}`,
      busId: bus.id,
      companyId: bus.companyId,
      registrationNumber: bus.registrationNumber,
      sessionId,
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

  async logout(busId: string, sessionId?: string): Promise<{ success: true }> {
    if (!sessionId) {
      return { success: true };
    }

    await this.prisma.bus.updateMany({
      where: {
        id: busId,
        crewDutySessionId: sessionId,
      },
      data: {
        crewDutySessionId: null,
        crewDutySessionExpiresAt: null,
      },
    });

    return { success: true };
  }
}
