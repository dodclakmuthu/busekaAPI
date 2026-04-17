import { Body, Controller, Get, Post, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ResendSignupOtpDto } from './dto/resend-signup-otp.dto';
import { SignupDto } from './dto/signup.dto';
import { VerifySignupOtpDto } from './dto/verify-signup-otp.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { SafeUser } from './auth.types';
import { DASHBOARD_AUTH_COOKIE, getAuthCookieOptions } from './auth-cookie';
import { LoginAttemptService } from '../common/login-attempt.service';
import { normalizeAuthMobileNumber } from './phone.util';

type AuthedRequest = Request & { user?: SafeUser };

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly loginAttempts: LoginAttemptService,
  ) {}

  @Post('signup')
  async signup(@Body() dto: SignupDto) {
    return this.authService.signup(dto);
  }

  @Post('signup/start')
  async signupStart(@Body() dto: SignupDto) {
    return this.authService.signup(dto);
  }

  @Post('signup/verify')
  async verifySignup(
    @Res({ passthrough: true }) res: Response,
    @Body() dto: VerifySignupOtpDto,
  ) {
    const result = await this.authService.verifySignupOtp(dto);
    res.cookie(DASHBOARD_AUTH_COOKIE, result.accessToken, getAuthCookieOptions());
    return { user: result.user };
  }

  @Post('signup/resend')
  async resendSignupOtp(@Body() dto: ResendSignupOtpDto) {
    return this.authService.resendSignupOtp(dto);
  }

  @Post('login')
  async login(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() dto: LoginDto,
  ) {
    const normalizedMobileKey = normalizeAuthMobileNumber(dto.mobileNumber) ?? dto.mobileNumber.trim();
    const key = `dashboard:${req.ip ?? 'unknown'}:${normalizedMobileKey}`;
    this.loginAttempts.assertAllowed(key);

    try {
      const result = await this.authService.login(dto);
      this.loginAttempts.reset(key);
      res.cookie(DASHBOARD_AUTH_COOKIE, result.accessToken, getAuthCookieOptions());
      return { user: result.user };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        this.loginAttempts.recordFailure(key);
      }
      throw error;
    }
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(DASHBOARD_AUTH_COOKIE, getAuthCookieOptions());
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@Req() req: AuthedRequest) {
    return { user: req.user };
  }
}
