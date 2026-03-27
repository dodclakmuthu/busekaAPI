-- AlterTable
ALTER TABLE "Trip" ADD COLUMN     "conductorStaffId" TEXT,
ADD COLUMN     "driverStaffId" TEXT;

-- CreateIndex
CREATE INDEX "Trip_driverStaffId_idx" ON "Trip"("driverStaffId");

-- CreateIndex
CREATE INDEX "Trip_conductorStaffId_idx" ON "Trip"("conductorStaffId");

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_driverStaffId_fkey" FOREIGN KEY ("driverStaffId") REFERENCES "StaffProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_conductorStaffId_fkey" FOREIGN KEY ("conductorStaffId") REFERENCES "StaffProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
