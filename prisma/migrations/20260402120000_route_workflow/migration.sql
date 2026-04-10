-- CreateEnum
CREATE TYPE "RouteSourceType" AS ENUM ('GLOBAL', 'COMPANY_PRIVATE', 'COMPANY_REQUEST');

-- CreateEnum
CREATE TYPE "RouteApprovalStatus" AS ENUM ('DRAFT', 'PRIVATE_ACTIVE', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "Route"
ADD COLUMN "description" TEXT,
ADD COLUMN "distanceKm" DECIMAL(8,2),
ADD COLUMN "downIsReverseOfUp" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "sourceType" "RouteSourceType" NOT NULL DEFAULT 'COMPANY_PRIVATE',
ADD COLUMN "approvalStatus" "RouteApprovalStatus" NOT NULL DEFAULT 'PRIVATE_ACTIVE',
ADD COLUMN "createdByUserId" TEXT,
ADD COLUMN "reviewedByUserId" TEXT,
ADD COLUMN "requestedAt" TIMESTAMP(3),
ADD COLUMN "reviewedAt" TIMESTAMP(3),
ADD COLUMN "approvedAt" TIMESTAMP(3),
ADD COLUMN "adminNotes" TEXT,
ADD COLUMN "rejectionReason" TEXT;

-- AlterTable
ALTER TABLE "RouteMaster"
ADD COLUMN "distanceKm" DECIMAL(8,2);

-- CreateIndex
CREATE INDEX "Route_createdByUserId_idx" ON "Route"("createdByUserId");

-- CreateIndex
CREATE INDEX "Route_reviewedByUserId_idx" ON "Route"("reviewedByUserId");

-- CreateIndex
CREATE INDEX "Route_sourceType_idx" ON "Route"("sourceType");

-- CreateIndex
CREATE INDEX "Route_approvalStatus_idx" ON "Route"("approvalStatus");

-- AddForeignKey
ALTER TABLE "Route" ADD CONSTRAINT "Route_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Route" ADD CONSTRAINT "Route_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
