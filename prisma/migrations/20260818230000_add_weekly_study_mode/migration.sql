CREATE TYPE "ScreenMode" AS ENUM ('FULL', 'STANDARD', 'RECOVERY');

CREATE TABLE "ScreenModeSetting" (
  "mode" "ScreenMode" NOT NULL,
  "dailyLimitMinutes" INTEGER NOT NULL,

  CONSTRAINT "ScreenModeSetting_pkey" PRIMARY KEY ("mode")
);

CREATE TABLE "WeekDecision" (
  "id" UUID NOT NULL,
  "startsOn" DATE NOT NULL,
  "endsOn" DATE NOT NULL,
  "mode" "ScreenMode" NOT NULL,
  "dailyLimitMinutes" INTEGER NOT NULL,
  "explanation" TEXT NOT NULL,
  "quarterId" UUID NOT NULL,
  "isStale" BOOLEAN NOT NULL DEFAULT false,
  "calculatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "WeekDecision_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WeekDecision_startsOn_key" ON "WeekDecision"("startsOn");
CREATE INDEX "WeekDecision_startsOn_isStale_idx" ON "WeekDecision"("startsOn", "isStale");
CREATE INDEX "WeekDecision_quarterId_idx" ON "WeekDecision"("quarterId");

ALTER TABLE "WeekDecision"
ADD CONSTRAINT "WeekDecision_quarterId_fkey"
FOREIGN KEY ("quarterId") REFERENCES "AcademicQuarter"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ScreenModeSetting"
ADD CONSTRAINT "ScreenModeSetting_dailyLimitMinutes_positive_check"
CHECK ("dailyLimitMinutes" > 0);

ALTER TABLE "WeekDecision"
ADD CONSTRAINT "WeekDecision_dailyLimitMinutes_positive_check"
CHECK ("dailyLimitMinutes" > 0);

ALTER TABLE "WeekDecision"
ADD CONSTRAINT "WeekDecision_date_order_check"
CHECK ("endsOn" >= "startsOn");
