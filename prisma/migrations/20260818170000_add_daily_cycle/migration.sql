CREATE TYPE "DailyCheckType" AS ENUM (
  'SELF_DIRECTED_STUDY',
  'PERSONAL_ROUTINE'
);

CREATE TYPE "DailyCheckStatus" AS ENUM (
  'PENDING',
  'APPROVED',
  'REJECTED'
);

CREATE TYPE "PointReason" AS ENUM (
  'SELF_DIRECTED_STUDY',
  'PERSONAL_ROUTINE'
);

CREATE TABLE "DailyCheck" (
  "id" UUID NOT NULL,
  "date" DATE NOT NULL,
  "type" "DailyCheckType" NOT NULL,
  "status" "DailyCheckStatus" NOT NULL DEFAULT 'PENDING',
  "childId" UUID NOT NULL,
  "decidedById" UUID,
  "decidedAt" TIMESTAMPTZ(3),
  "rejectionReason" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "DailyCheck_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PointTransaction" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "dailyCheckId" UUID NOT NULL,
  "amount" INTEGER NOT NULL,
  "reason" "PointReason" NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PointTransaction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DailyCheck_date_status_idx"
ON "DailyCheck"("date", "status");

CREATE INDEX "DailyCheck_decidedById_idx"
ON "DailyCheck"("decidedById");

CREATE UNIQUE INDEX "DailyCheck_childId_date_type_key"
ON "DailyCheck"("childId", "date", "type");

CREATE INDEX "PointTransaction_userId_createdAt_idx"
ON "PointTransaction"("userId", "createdAt");

CREATE UNIQUE INDEX "PointTransaction_dailyCheckId_key"
ON "PointTransaction"("dailyCheckId");

ALTER TABLE "DailyCheck"
ADD CONSTRAINT "DailyCheck_childId_fkey"
FOREIGN KEY ("childId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DailyCheck"
ADD CONSTRAINT "DailyCheck_decidedById_fkey"
FOREIGN KEY ("decidedById") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PointTransaction"
ADD CONSTRAINT "PointTransaction_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PointTransaction"
ADD CONSTRAINT "PointTransaction_dailyCheckId_fkey"
FOREIGN KEY ("dailyCheckId") REFERENCES "DailyCheck"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
