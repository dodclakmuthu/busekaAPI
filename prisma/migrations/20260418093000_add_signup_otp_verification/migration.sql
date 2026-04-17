-- CreateEnum
CREATE TYPE "UserAccountStatus" AS ENUM ('PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('SIGNUP');

-- AlterTable
ALTER TABLE "User"
ADD COLUMN "status" "UserAccountStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN "isMobileVerified" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "mobileVerifiedAt" TIMESTAMP(3);

-- Backfill existing users as already verified accounts.
UPDATE "User"
SET "mobileVerifiedAt" = COALESCE("mobileVerifiedAt", "createdAt");

-- Set defaults for newly created users.
ALTER TABLE "User" ALTER COLUMN "status" SET DEFAULT 'PENDING_VERIFICATION';
ALTER TABLE "User" ALTER COLUMN "isMobileVerified" SET DEFAULT false;

-- CreateTable
CREATE TABLE "OtpChallenge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mobileNumber" TEXT NOT NULL,
    "purpose" "OtpPurpose" NOT NULL,
    "otpHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "lastSentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resendCount" INTEGER NOT NULL DEFAULT 0,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OtpChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OtpChallenge_userId_idx" ON "OtpChallenge"("userId");

-- CreateIndex
CREATE INDEX "OtpChallenge_mobileNumber_idx" ON "OtpChallenge"("mobileNumber");

-- CreateIndex
CREATE INDEX "OtpChallenge_purpose_idx" ON "OtpChallenge"("purpose");

-- CreateIndex
CREATE INDEX "OtpChallenge_expiresAt_idx" ON "OtpChallenge"("expiresAt");

-- AddForeignKey
ALTER TABLE "OtpChallenge" ADD CONSTRAINT "OtpChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;