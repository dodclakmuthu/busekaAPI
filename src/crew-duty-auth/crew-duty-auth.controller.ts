import { Body, Controller, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { CrewDutyLoginDto } from './dto/crew-duty-login.dto';
import { CrewDutyAuthService } from './crew-duty-auth.service';
import { LoginAttemptService } from '../common/login-attempt.service';
import { CrewDutyJwtAuthGuard } from './crew-duty-jwt-auth.guard';
import type { CrewDutySession } from './crew-duty-auth.types';

@Controller('crew-duty-auth')
export class CrewDutyAuthController {
  constructor(
    private readonly crewDutyAuth: CrewDutyAuthService,
    private readonly loginAttempts: LoginAttemptService,
  ) {}

  @Post('login')
  async login(@Req() req: Request, @Body() dto: CrewDutyLoginDto) {
    const key = `crew-duty:${req.ip ?? 'unknown'}:${dto.registrationNumber}`;
    this.loginAttempts.assertAllowed(key);

    try {
      const result = await this.crewDutyAuth.login(dto);
      this.loginAttempts.reset(key);
      return result;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        this.loginAttempts.recordFailure(key, { maxAttempts: 5, windowMs: 10 * 60 * 1000, blockMs: 10 * 60 * 1000 });
      }
      throw error;
    }
  }

  @Post('logout')
  @UseGuards(CrewDutyJwtAuthGuard)
  logout(@Req() req: { user: CrewDutySession }) {
    return this.crewDutyAuth.logout(req.user.busId, req.user.sessionId);
  }
}
