import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OtpPurpose, UserAccountStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomInt } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { ResendSignupOtpDto } from './dto/resend-signup-otp.dto';
import { SignupDto } from './dto/signup.dto';
import { VerifySignupOtpDto } from './dto/verify-signup-otp.dto';
import { JwtPayload, SafeUser, SignupChallengeSummary } from './auth.types';
import { getAuthMobileLookupVariants, INVALID_SRI_LANKAN_PHONE_MESSAGE, normalizeAuthMobileNumber } from './phone.util';
import { TextlkSmsService } from './textlk-sms.service';

const OTP_EXPIRY_MS = 5 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 30 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_MAX_RESENDS = 5;

function tooManyRequests(message: string): HttpException {
  return new HttpException({ message }, HttpStatus.TOO_MANY_REQUESTS);
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly textlkSmsService: TextlkSmsService,
  ) {}

  private toSafeUser(user: {
    id: string;
    fullName: string;
    mobileNumber: string;
    email: string | null;
    status: UserAccountStatus;
    isMobileVerified: boolean;
    mobileVerifiedAt: Date | null;
    isActive: boolean;
    isAppAdmin: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): SafeUser {
    return {
      id: user.id,
      fullName: user.fullName,
      mobileNumber: user.mobileNumber,
      email: user.email,
      status: user.status,
      isMobileVerified: user.isMobileVerified,
      mobileVerifiedAt: user.mobileVerifiedAt,
      isActive: user.isActive,
      isAppAdmin: user.isAppAdmin,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private issueAccessToken(user: { id: string; mobileNumber: string }): Promise<string> {
    const payload: JwtPayload = { sub: user.id, mobileNumber: user.mobileNumber };
    return this.jwt.signAsync(payload);
  }

  private maskMobileNumber(mobileNumber: string): string {
    if (mobileNumber.length <= 4) return mobileNumber;
    return `${mobileNumber.slice(0, 3)}****${mobileNumber.slice(-3)}`;
  }

  private buildChallengeSummary(challenge: {
    id: string;
    expiresAt: Date;
    lastSentAt: Date;
    mobileNumber: string;
  }): SignupChallengeSummary {
    return {
      challengeId: challenge.id,
      expiresAt: challenge.expiresAt,
      resendAvailableAt: new Date(challenge.lastSentAt.getTime() + OTP_RESEND_COOLDOWN_MS),
      maskedMobile: this.maskMobileNumber(challenge.mobileNumber),
    };
  }

  private generateOtpCode(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }

  private async createSignupChallenge(userId: string, mobileNumber: string, resendCount = 0): Promise<SignupChallengeSummary> {
    const otp = this.generateOtpCode();
    const otpHash = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);
    const now = new Date();

    await this.prisma.otpChallenge.updateMany({
      where: {
        userId,
        purpose: OtpPurpose.SIGNUP,
        consumedAt: null,
      },
      data: { consumedAt: now },
    });

    const challenge = await this.prisma.otpChallenge.create({
      data: {
        userId,
        mobileNumber,
        purpose: OtpPurpose.SIGNUP,
        otpHash,
        expiresAt,
        lastSentAt: now,
        resendCount,
      },
      select: {
        id: true,
        expiresAt: true,
        lastSentAt: true,
        mobileNumber: true,
      },
    });

    try {
      await this.textlkSmsService.sendSignupOtp(mobileNumber, otp);
    } catch (error) {
      await this.prisma.otpChallenge.delete({ where: { id: challenge.id } }).catch(() => undefined);
      throw error;
    }

    return this.buildChallengeSummary(challenge);
  }

  private async getActiveSignupChallenge(userId: string): Promise<SignupChallengeSummary | null> {
    const challenge = await this.prisma.otpChallenge.findFirst({
      where: {
        userId,
        purpose: OtpPurpose.SIGNUP,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        expiresAt: true,
        lastSentAt: true,
        mobileNumber: true,
      },
    });

    return challenge ? this.buildChallengeSummary(challenge) : null;
  }

  private async getOrCreateSignupChallenge(userId: string, mobileNumber: string): Promise<SignupChallengeSummary> {
    const existing = await this.getActiveSignupChallenge(userId);
    if (existing) {
      return existing;
    }

    return this.createSignupChallenge(userId, mobileNumber);
  }

  async signup(dto: SignupDto): Promise<{ challenge: SignupChallengeSummary }> {
    const normalizedMobileNumber = normalizeAuthMobileNumber(dto.mobileNumber);
    if (!normalizedMobileNumber) {
      throw new BadRequestException({ message: INVALID_SRI_LANKAN_PHONE_MESSAGE });
    }

    const existingByMobile = await this.prisma.user.findFirst({
      where: { mobileNumber: { in: getAuthMobileLookupVariants(dto.mobileNumber) } },
      select: {
        id: true,
        mobileNumber: true,
        email: true,
        status: true,
        isMobileVerified: true,
        isActive: true,
      },
    });

    if (dto.email) {
      const existingByEmail = await this.prisma.user.findUnique({
        where: { email: dto.email },
        select: { id: true },
      });
      if (existingByEmail && existingByEmail.id !== existingByMobile?.id) {
        throw new ConflictException({
          message: 'Email already registered',
        });
      }
    }

    if (existingByMobile?.status === UserAccountStatus.ACTIVE && existingByMobile.isMobileVerified) {
      throw new ConflictException({
        message: 'Mobile number already registered',
      });
    }

    if (existingByMobile && existingByMobile.status === UserAccountStatus.SUSPENDED) {
      throw new ForbiddenException({ message: 'This account is suspended. Contact support.' });
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = existingByMobile
      ? await this.prisma.user.update({
          where: { id: existingByMobile.id },
          data: {
            fullName: dto.fullName,
            mobileNumber: normalizedMobileNumber,
            email: dto.email ?? null,
            passwordHash,
            status: UserAccountStatus.PENDING_VERIFICATION,
            isMobileVerified: false,
            mobileVerifiedAt: null,
            isActive: true,
          },
          select: {
            id: true,
            mobileNumber: true,
          },
        })
      : await this.prisma.user.create({
          data: {
            fullName: dto.fullName,
            mobileNumber: normalizedMobileNumber,
            email: dto.email ?? null,
            passwordHash,
            status: UserAccountStatus.PENDING_VERIFICATION,
            isMobileVerified: false,
            mobileVerifiedAt: null,
            isActive: true,
          },
          select: {
            id: true,
            mobileNumber: true,
          },
        });

    const challenge = await this.createSignupChallenge(user.id, user.mobileNumber);
    return { challenge };
  }

  async verifySignupOtp(dto: VerifySignupOtpDto): Promise<{ accessToken: string; user: SafeUser }> {
    const challenge = await this.prisma.otpChallenge.findUnique({
      where: { id: dto.challengeId },
      select: {
        id: true,
        userId: true,
        otpHash: true,
        expiresAt: true,
        consumedAt: true,
        attemptCount: true,
        mobileNumber: true,
        user: {
          select: {
            id: true,
            fullName: true,
            mobileNumber: true,
            email: true,
            status: true,
            isMobileVerified: true,
            mobileVerifiedAt: true,
            isActive: true,
            isAppAdmin: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    if (!challenge || challenge.user.status === UserAccountStatus.SUSPENDED) {
      throw new BadRequestException({ message: 'Invalid verification request' });
    }

    if (challenge.consumedAt) {
      throw new BadRequestException({ message: 'This OTP has already been used. Request a new code.' });
    }

    if (challenge.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException({ message: 'OTP expired. Request a new code.' });
    }

    if (challenge.attemptCount >= OTP_MAX_ATTEMPTS) {
      throw tooManyRequests('Too many invalid OTP attempts. Request a new code.');
    }

    const valid = await bcrypt.compare(dto.otp, challenge.otpHash);

    if (!valid) {
      await this.prisma.otpChallenge.update({
        where: { id: challenge.id },
        data: { attemptCount: { increment: 1 } },
      });

      if (challenge.attemptCount + 1 >= OTP_MAX_ATTEMPTS) {
        throw tooManyRequests('Too many invalid OTP attempts. Request a new code.');
      }

      throw new BadRequestException({ message: 'Invalid OTP code' });
    }

    const now = new Date();
    const user = await this.prisma.$transaction(async (tx) => {
      await tx.otpChallenge.updateMany({
        where: {
          userId: challenge.userId,
          purpose: OtpPurpose.SIGNUP,
          consumedAt: null,
        },
        data: { consumedAt: now },
      });

      return tx.user.update({
        where: { id: challenge.userId },
        data: {
          status: UserAccountStatus.ACTIVE,
          isMobileVerified: true,
          mobileVerifiedAt: now,
          isActive: true,
        },
        select: {
          id: true,
          fullName: true,
          mobileNumber: true,
          email: true,
          status: true,
          isMobileVerified: true,
          mobileVerifiedAt: true,
          isActive: true,
          isAppAdmin: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    });

    const accessToken = await this.issueAccessToken(user);
    return { accessToken, user: this.toSafeUser(user) };
  }

  async resendSignupOtp(dto: ResendSignupOtpDto): Promise<{ challenge: SignupChallengeSummary }> {
    const challenge = await this.prisma.otpChallenge.findUnique({
      where: { id: dto.challengeId },
      select: {
        id: true,
        userId: true,
        mobileNumber: true,
        lastSentAt: true,
        resendCount: true,
        consumedAt: true,
        user: {
          select: {
            status: true,
            isMobileVerified: true,
            isActive: true,
          },
        },
      },
    });

    if (!challenge || !challenge.user.isActive) {
      throw new BadRequestException({ message: 'Invalid verification request' });
    }

    if (challenge.user.status === UserAccountStatus.ACTIVE && challenge.user.isMobileVerified) {
      throw new ConflictException({ message: 'Account already verified. Please sign in.' });
    }

    const resendAvailableAt = challenge.lastSentAt.getTime() + OTP_RESEND_COOLDOWN_MS;
    if (resendAvailableAt > Date.now()) {
      const waitSeconds = Math.ceil((resendAvailableAt - Date.now()) / 1000);
      throw tooManyRequests(`Please wait ${waitSeconds} second${waitSeconds === 1 ? '' : 's'} before requesting a new code.`);
    }

    if (challenge.resendCount >= OTP_MAX_RESENDS) {
      throw tooManyRequests('OTP resend limit reached. Restart signup.');
    }

    const nextChallenge = await this.createSignupChallenge(
      challenge.userId,
      challenge.mobileNumber,
      challenge.resendCount + 1,
    );

    return { challenge: nextChallenge };
  }

  async login(dto: LoginDto): Promise<{ accessToken: string; user: SafeUser }> {
    const normalizedMobileNumber = normalizeAuthMobileNumber(dto.mobileNumber);
    if (!normalizedMobileNumber) {
      throw new BadRequestException({ message: INVALID_SRI_LANKAN_PHONE_MESSAGE });
    }

    const user = await this.prisma.user.findFirst({
      where: { mobileNumber: { in: getAuthMobileLookupVariants(dto.mobileNumber) } },
      select: {
        id: true,
        fullName: true,
        mobileNumber: true,
        email: true,
        passwordHash: true,
        status: true,
        isMobileVerified: true,
        mobileVerifiedAt: true,
        isActive: true,
        isAppAdmin: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException({ message: 'Invalid credentials' });
    }

    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException({ message: 'Invalid credentials' });
    }

    if (user.status !== UserAccountStatus.ACTIVE || !user.isMobileVerified) {
      const challenge = await this.getOrCreateSignupChallenge(user.id, user.mobileNumber);
      throw new ForbiddenException({
        message: 'Account not verified. Enter the OTP sent to your mobile number.',
        code: 'ACCOUNT_NOT_VERIFIED',
        challenge,
      });
    }

    if (user.mobileNumber !== normalizedMobileNumber) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { mobileNumber: normalizedMobileNumber },
      });
      user.mobileNumber = normalizedMobileNumber;
    }

    const accessToken = await this.issueAccessToken(user);

    const { passwordHash: _ph, ...safe } = user;
    return { accessToken, user: this.toSafeUser(safe) };
  }

  async getUserByIdOrThrow(id: string): Promise<SafeUser> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        fullName: true,
        mobileNumber: true,
        email: true,
        status: true,
        isMobileVerified: true,
        mobileVerifiedAt: true,
        isActive: true,
        isAppAdmin: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user || !user.isActive || user.status !== UserAccountStatus.ACTIVE || !user.isMobileVerified) {
      throw new UnauthorizedException({ message: 'Unauthorized' });
    }

    return this.toSafeUser(user);
  }
}
