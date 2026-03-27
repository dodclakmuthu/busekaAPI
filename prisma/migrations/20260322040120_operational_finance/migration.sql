-- CreateEnum
CREATE TYPE "ExtraIncomeCategory" AS ENUM ('PARCEL', 'BAGGAGE', 'OTHER');

-- CreateTable
CREATE TABLE "OperationalExpense" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "busId" TEXT NOT NULL,
    "recordDate" TIMESTAMP(3) NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "note" TEXT,
    "enteredByType" TEXT NOT NULL DEFAULT 'dashboard',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperationalExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationalIncome" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "busId" TEXT NOT NULL,
    "recordDate" TIMESTAMP(3) NOT NULL,
    "category" "ExtraIncomeCategory" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "note" TEXT,
    "enteredByType" TEXT NOT NULL DEFAULT 'dashboard',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperationalIncome_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtraIncome" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "category" "ExtraIncomeCategory" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "note" TEXT,
    "enteredByType" TEXT NOT NULL DEFAULT 'bus_app',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExtraIncome_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OperationalExpense_companyId_idx" ON "OperationalExpense"("companyId");

-- CreateIndex
CREATE INDEX "OperationalExpense_busId_idx" ON "OperationalExpense"("busId");

-- CreateIndex
CREATE INDEX "OperationalExpense_recordDate_idx" ON "OperationalExpense"("recordDate");

-- CreateIndex
CREATE INDEX "OperationalExpense_category_idx" ON "OperationalExpense"("category");

-- CreateIndex
CREATE INDEX "OperationalIncome_companyId_idx" ON "OperationalIncome"("companyId");

-- CreateIndex
CREATE INDEX "OperationalIncome_busId_idx" ON "OperationalIncome"("busId");

-- CreateIndex
CREATE INDEX "OperationalIncome_recordDate_idx" ON "OperationalIncome"("recordDate");

-- CreateIndex
CREATE INDEX "OperationalIncome_category_idx" ON "OperationalIncome"("category");

-- CreateIndex
CREATE INDEX "ExtraIncome_tripId_idx" ON "ExtraIncome"("tripId");

-- CreateIndex
CREATE INDEX "ExtraIncome_category_idx" ON "ExtraIncome"("category");

-- AddForeignKey
ALTER TABLE "OperationalExpense" ADD CONSTRAINT "OperationalExpense_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalExpense" ADD CONSTRAINT "OperationalExpense_busId_fkey" FOREIGN KEY ("busId") REFERENCES "Bus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalIncome" ADD CONSTRAINT "OperationalIncome_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalIncome" ADD CONSTRAINT "OperationalIncome_busId_fkey" FOREIGN KEY ("busId") REFERENCES "Bus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtraIncome" ADD CONSTRAINT "ExtraIncome_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
