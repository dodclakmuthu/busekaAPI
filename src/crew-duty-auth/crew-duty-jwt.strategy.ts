import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';
import type { CrewDutyJwtPayload, CrewDutySession } from './crew-duty-auth.types';

function getCrewDutySessionLeaseMs(config: ConfigService): number {
  const seconds = Number(config.get<string>('CREW_DUTY_SESSION_LOCK_SECONDS') ?? '120');
  return Math.max(30, seconds) * 1000;
}

@Injectable()
export class CrewDutyJwtStrategy extends PassportStrategy(Strategy, 'crew-duty-jwt') {
  private readonly sessionLeaseMs: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    const secret =
      config.get<string>('JWT_CREW_DUTY_SECRET') ?? config.get<string>('JWT_ACCESS_SECRET');
    if (!secret) {
      throw new Error('JWT_CREW_DUTY_SECRET (or JWT_ACCESS_SECRET fallback) is not set');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
      audience: 'crew-duty',
    });

    this.sessionLeaseMs = getCrewDutySessionLeaseMs(config);
  }

  async validate(payload: CrewDutyJwtPayload): Promise<CrewDutySession> {
    if (!payload || payload.typ !== 'crew-duty') {
      throw new UnauthorizedException({ message: 'Unauthorized' });
    }
    if (!payload.sub?.startsWith('bus:') || !payload.busId) {
      throw new UnauthorizedException({ message: 'Unauthorized' });
    }

    // Ensure bus is still operational for crew-duty sessions.
    const bus = await this.prisma.bus.findFirst({
      where: {
        id: payload.busId,
        companyId: payload.companyId,
        isActive: true,
        status: 'ACTIVE',
      },
      select: {
        id: true,
        crewDutySessionId: true,
        crewDutySessionExpiresAt: true,
      },
    });

    if (!bus) {
      throw new UnauthorizedException({ message: 'Unauthorized' });
    }

    const now = new Date();

    // The lease controls when another device may take over. It must not expire
    // the current device's otherwise-valid JWT while the app is idle.
    if (payload.sessionId && bus.crewDutySessionId !== payload.sessionId) {
      throw new UnauthorizedException({
        message: 'Log out from other device to continue',
        code: 'CREW_DUTY_SESSION_ACTIVE',
      });
    }

    if (payload.sessionId) {
      await this.prisma.bus.updateMany({
        where: {
          id: payload.busId,
          crewDutySessionId: payload.sessionId,
        },
        data: {
          crewDutySessionExpiresAt: new Date(now.getTime() + this.sessionLeaseMs),
        },
      });
    }

    return {
      busId: payload.busId,
      companyId: payload.companyId,
      registrationNumber: payload.registrationNumber,
      sessionId: payload.sessionId,
    };
  }
}
