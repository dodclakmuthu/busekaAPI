-- DropForeignKey
ALTER TABLE "Route" DROP CONSTRAINT "Route_globalRouteId_fkey";

-- AlterTable
ALTER TABLE "Route" ALTER COLUMN "companyId" DROP NOT NULL;

-- Migrate RouteMaster rows into Route using the same ids so existing globalRouteId links remain valid
INSERT INTO "Route" (
    "id",
    "companyId",
    "routeCode",
    "routeName",
    "startLocation",
    "endLocation",
    "description",
    "distanceKm",
    "downIsReverseOfUp",
    "sourceType",
    "approvalStatus",
    "createdByUserId",
    "reviewedByUserId",
    "globalRouteId",
    "approvedSnapshotHash",
    "lastSubmittedAt",
    "lastApprovedAt",
    "requestedAt",
    "reviewedAt",
    "approvedAt",
    "adminNotes",
    "rejectionReason",
    "isActive",
    "createdAt",
    "updatedAt"
)
SELECT
    rm."id",
    NULL,
    rm."routeCode",
    rm."routeName",
    rm."startLocation",
    rm."endLocation",
    rm."description",
    rm."distanceKm",
    rm."downIsReverseOfUp",
    'GLOBAL'::"RouteSourceType",
    'APPROVED'::"RouteApprovalStatus",
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    rm."isActive",
    rm."createdAt",
    rm."updatedAt"
FROM "RouteMaster" rm
WHERE NOT EXISTS (
    SELECT 1 FROM "Route" r WHERE r."id" = rm."id"
);

-- Migrate RouteMasterStop rows into RouteStop using the same ids and sequence/order values
INSERT INTO "RouteStop" (
    "id",
    "routeId",
    "direction",
    "stopName",
    "stopOrder",
    "isActive",
    "createdAt",
    "updatedAt"
)
SELECT
    rms."id",
    rms."routeMasterId",
    rms."direction",
    rms."locationName",
    rms."sequence",
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "RouteMasterStop" rms
JOIN "Route" r ON r."id" = rms."routeMasterId"
WHERE NOT EXISTS (
    SELECT 1 FROM "RouteStop" rs WHERE rs."id" = rms."id"
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Route_companyId_sourceType_idx" ON "Route"("companyId", "sourceType");

-- AddForeignKey
ALTER TABLE "Route" ADD CONSTRAINT "Route_globalRouteId_fkey" FOREIGN KEY ("globalRouteId") REFERENCES "Route"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- DropTable
DROP TABLE "RouteMasterStop";

-- DropTable
DROP TABLE "RouteMaster";