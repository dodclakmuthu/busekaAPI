-- AlterTable
ALTER TABLE "RouteMaster" ADD COLUMN     "downIsReverseOfUp" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "RouteMasterStop" (
    "id" TEXT NOT NULL,
    "routeMasterId" TEXT NOT NULL,
    "direction" "RouteDirection" NOT NULL,
    "sequence" INTEGER NOT NULL,
    "locationName" TEXT NOT NULL,

    CONSTRAINT "RouteMasterStop_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RouteMasterStop_routeMasterId_idx" ON "RouteMasterStop"("routeMasterId");

-- CreateIndex
CREATE INDEX "RouteMasterStop_direction_idx" ON "RouteMasterStop"("direction");

-- CreateIndex
CREATE UNIQUE INDEX "RouteMasterStop_routeMasterId_direction_sequence_key" ON "RouteMasterStop"("routeMasterId", "direction", "sequence");

-- AddForeignKey
ALTER TABLE "RouteMasterStop" ADD CONSTRAINT "RouteMasterStop_routeMasterId_fkey" FOREIGN KEY ("routeMasterId") REFERENCES "RouteMaster"("id") ON DELETE CASCADE ON UPDATE CASCADE;
