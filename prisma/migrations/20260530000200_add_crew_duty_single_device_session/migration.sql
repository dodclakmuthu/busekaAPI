ALTER TABLE "busapp"."Bus"
  ADD COLUMN "crewDutySessionId" TEXT,
  ADD COLUMN "crewDutySessionExpiresAt" TIMESTAMP(3);

CREATE INDEX "Bus_crewDutySessionId_idx" ON "busapp"."Bus"("crewDutySessionId");
