ALTER TYPE "PointReason" ADD VALUE 'REWARD';

CREATE TYPE "RewardRequestStatus" AS ENUM (
  'PENDING',
  'FULFILLED',
  'CANCELLED'
);

ALTER TABLE "User"
ADD COLUMN "pointBalanceLimit" INTEGER NOT NULL DEFAULT 100;

CREATE TABLE "Reward" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "cost" INTEGER NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT "Reward_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RewardRequest" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "rewardId" UUID NOT NULL,
  "cost" INTEGER NOT NULL,
  "status" "RewardRequestStatus" NOT NULL DEFAULT 'PENDING',
  "decidedById" UUID,
  "decidedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "RewardRequest_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PointTransaction"
DROP CONSTRAINT "PointTransaction_exactly_one_source_check",
ADD COLUMN "rewardRequestId" UUID;

CREATE UNIQUE INDEX "Reward_name_key" ON "Reward"("name");
CREATE INDEX "Reward_isActive_sortOrder_idx" ON "Reward"("isActive", "sortOrder");
CREATE INDEX "RewardRequest_userId_status_createdAt_idx" ON "RewardRequest"("userId", "status", "createdAt");
CREATE INDEX "RewardRequest_rewardId_idx" ON "RewardRequest"("rewardId");
CREATE INDEX "RewardRequest_decidedById_idx" ON "RewardRequest"("decidedById");
CREATE UNIQUE INDEX "PointTransaction_rewardRequestId_key" ON "PointTransaction"("rewardRequestId");

ALTER TABLE "RewardRequest"
ADD CONSTRAINT "RewardRequest_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RewardRequest"
ADD CONSTRAINT "RewardRequest_rewardId_fkey"
FOREIGN KEY ("rewardId") REFERENCES "Reward"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RewardRequest"
ADD CONSTRAINT "RewardRequest_decidedById_fkey"
FOREIGN KEY ("decidedById") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PointTransaction"
ADD CONSTRAINT "PointTransaction_rewardRequestId_fkey"
FOREIGN KEY ("rewardRequestId") REFERENCES "RewardRequest"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PointTransaction"
ADD CONSTRAINT "PointTransaction_exactly_one_source_check"
CHECK (num_nonnulls("dailyCheckId", "choreCompletionId", "newProductEntryId", "rewardRequestId") = 1);

ALTER TABLE "Reward"
ADD CONSTRAINT "Reward_cost_positive_check" CHECK ("cost" > 0);

ALTER TABLE "User"
ADD CONSTRAINT "User_pointBalanceLimit_positive_check" CHECK ("pointBalanceLimit" > 0);
