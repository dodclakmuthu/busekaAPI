-- AlterEnum
ALTER TYPE "RouteApprovalStatus" ADD VALUE IF NOT EXISTS 'PENDING_UPDATE_APPROVAL';

-- AlterEnum
ALTER TYPE "RouteApprovalStatus" ADD VALUE IF NOT EXISTS 'UPDATE_REJECTED';

-- CreateEnum
CREATE TYPE "RouteHistoryActionType" AS ENUM (
    'CREATED',
    'UPDATED',
    'SUBMITTED_FOR_APPROVAL',
    'APPROVED',
    'REJECTED'
);

-- AlterTable
ALTER TABLE "Route"
ADD COLUMN "globalRouteId" TEXT,
ADD COLUMN "approvedSnapshotHash" TEXT,
ADD COLUMN "lastSubmittedAt" TIMESTAMP(3),
ADD COLUMN "lastApprovedAt" TIMESTAMP(3);

-- Backfill existing timestamps into the new lifecycle fields where possible
UPDATE "Route"
SET
    "lastSubmittedAt" = COALESCE("lastSubmittedAt", "requestedAt"),
    "lastApprovedAt" = COALESCE("lastApprovedAt", "approvedAt");

-- CreateTable
CREATE TABLE "RouteHistory" (
    "id" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "snapshotJson" JSONB NOT NULL,
    "snapshotHash" TEXT NOT NULL,
    "actionType" "RouteHistoryActionType" NOT NULL,
    "approvalStatus" "RouteApprovalStatus" NOT NULL,
    "changedByUserId" TEXT,
    "reviewByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RouteHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Route_globalRouteId_idx" ON "Route"("globalRouteId");

-- CreateIndex
CREATE INDEX "RouteHistory_routeId_idx" ON "RouteHistory"("routeId");

-- CreateIndex
CREATE INDEX "RouteHistory_changedByUserId_idx" ON "RouteHistory"("changedByUserId");

-- CreateIndex
CREATE INDEX "RouteHistory_reviewByUserId_idx" ON "RouteHistory"("reviewByUserId");

-- CreateIndex
CREATE INDEX "RouteHistory_actionType_idx" ON "RouteHistory"("actionType");

-- CreateIndex
CREATE INDEX "RouteHistory_approvalStatus_idx" ON "RouteHistory"("approvalStatus");

-- CreateIndex
CREATE INDEX "RouteHistory_createdAt_idx" ON "RouteHistory"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RouteHistory_routeId_versionNumber_key" ON "RouteHistory"("routeId", "versionNumber");

-- AddForeignKey
ALTER TABLE "Route" ADD CONSTRAINT "Route_globalRouteId_fkey" FOREIGN KEY ("globalRouteId") REFERENCES "RouteMaster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouteHistory" ADD CONSTRAINT "RouteHistory_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouteHistory" ADD CONSTRAINT "RouteHistory_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouteHistory" ADD CONSTRAINT "RouteHistory_reviewByUserId_fkey" FOREIGN KEY ("reviewByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;