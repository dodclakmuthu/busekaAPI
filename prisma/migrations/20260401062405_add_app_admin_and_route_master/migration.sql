-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isAppAdmin" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "RouteMaster" (
    "id" TEXT NOT NULL,
    "routeCode" TEXT NOT NULL,
    "routeName" TEXT NOT NULL,
    "startLocation" TEXT NOT NULL,
    "endLocation" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RouteMaster_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RouteMaster_routeCode_key" ON "RouteMaster"("routeCode");
