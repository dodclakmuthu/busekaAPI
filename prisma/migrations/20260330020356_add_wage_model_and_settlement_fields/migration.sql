-- CreateEnum
CREATE TYPE "WageModel" AS ENUM ('PERCENTAGE', 'FIXED');

-- AlterTable
ALTER TABLE "Bus" ADD COLUMN     "conductorPercentage" DECIMAL(5,2),
ADD COLUMN     "driverPercentage" DECIMAL(5,2),
ADD COLUMN     "fixedConductorWage" DECIMAL(12,2),
ADD COLUMN     "fixedDriverWage" DECIMAL(12,2),
ADD COLUMN     "wageModel" "WageModel" NOT NULL DEFAULT 'PERCENTAGE';

-- AlterTable
ALTER TABLE "DailySummary" ADD COLUMN     "conductorPctSnapshot" DECIMAL(5,2),
ADD COLUMN     "conductorSalary" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "driverPctSnapshot" DECIMAL(5,2),
ADD COLUMN     "driverSalary" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "dti" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "wageModelSnapshot" TEXT;
