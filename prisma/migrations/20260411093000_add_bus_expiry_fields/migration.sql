-- AlterTable
ALTER TABLE "Bus"
ADD COLUMN     "permitExpiry" TIMESTAMP(3),
ADD COLUMN     "insuranceExpiry" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Bus_permitExpiry_idx" ON "Bus"("permitExpiry");

-- CreateIndex
CREATE INDEX "Bus_insuranceExpiry_idx" ON "Bus"("insuranceExpiry");