import { UserAccountStatus } from '@prisma/client';

export type SafeUser = {
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
};

export type JwtPayload = {
  sub: string;
  mobileNumber: string;
};

export type SignupChallengeSummary = {
  challengeId: string;
  expiresAt: Date;
  resendAvailableAt: Date;
  maskedMobile: string;
};
