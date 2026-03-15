-- AlterTable
ALTER TABLE "Bus" ADD COLUMN     "defaultConductorStaffId" TEXT,
ADD COLUMN     "defaultDriverStaffId" TEXT;

-- CreateIndex
CREATE INDEX "Bus_defaultDriverStaffId_idx" ON "Bus"("defaultDriverStaffId");

-- CreateIndex
CREATE INDEX "Bus_defaultConductorStaffId_idx" ON "Bus"("defaultConductorStaffId");

-- AddForeignKey
ALTER TABLE "Bus" ADD CONSTRAINT "Bus_defaultDriverStaffId_fkey" FOREIGN KEY ("defaultDriverStaffId") REFERENCES "StaffProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bus" ADD CONSTRAINT "Bus_defaultConductorStaffId_fkey" FOREIGN KEY ("defaultConductorStaffId") REFERENCES "StaffProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
