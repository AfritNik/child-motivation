ALTER TYPE "DailyCheckStatus" RENAME TO "ReviewStatus";

ALTER TYPE "PointReason" ADD VALUE 'CHORE';
ALTER TYPE "PointReason" ADD VALUE 'NEW_PRODUCT';

CREATE TABLE "Chore" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "instruction" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT "Chore_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChoreCompletion" (
  "id" UUID NOT NULL,
  "date" DATE NOT NULL,
  "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
  "childId" UUID NOT NULL,
  "choreId" UUID NOT NULL,
  "decidedById" UUID,
  "decidedAt" TIMESTAMPTZ(3),
  "rejectionReason" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "ChoreCompletion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NewProductEntry" (
  "id" UUID NOT NULL,
  "date" DATE NOT NULL,
  "name" TEXT NOT NULL,
  "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
  "childId" UUID NOT NULL,
  "decidedById" UUID,
  "decidedAt" TIMESTAMPTZ(3),
  "rejectionReason" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "NewProductEntry_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PointTransaction"
ALTER COLUMN "dailyCheckId" DROP NOT NULL,
ADD COLUMN "choreCompletionId" UUID,
ADD COLUMN "newProductEntryId" UUID;

CREATE UNIQUE INDEX "Chore_name_key" ON "Chore"("name");
CREATE INDEX "Chore_isActive_sortOrder_idx" ON "Chore"("isActive", "sortOrder");
CREATE UNIQUE INDEX "ChoreCompletion_childId_date_choreId_key" ON "ChoreCompletion"("childId", "date", "choreId");
CREATE INDEX "ChoreCompletion_date_status_idx" ON "ChoreCompletion"("date", "status");
CREATE INDEX "ChoreCompletion_choreId_idx" ON "ChoreCompletion"("choreId");
CREATE INDEX "ChoreCompletion_decidedById_idx" ON "ChoreCompletion"("decidedById");
CREATE UNIQUE INDEX "NewProductEntry_childId_date_key" ON "NewProductEntry"("childId", "date");
CREATE INDEX "NewProductEntry_date_status_idx" ON "NewProductEntry"("date", "status");
CREATE INDEX "NewProductEntry_decidedById_idx" ON "NewProductEntry"("decidedById");
CREATE UNIQUE INDEX "PointTransaction_choreCompletionId_key" ON "PointTransaction"("choreCompletionId");
CREATE UNIQUE INDEX "PointTransaction_newProductEntryId_key" ON "PointTransaction"("newProductEntryId");

ALTER TABLE "ChoreCompletion"
ADD CONSTRAINT "ChoreCompletion_childId_fkey"
FOREIGN KEY ("childId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ChoreCompletion"
ADD CONSTRAINT "ChoreCompletion_choreId_fkey"
FOREIGN KEY ("choreId") REFERENCES "Chore"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ChoreCompletion"
ADD CONSTRAINT "ChoreCompletion_decidedById_fkey"
FOREIGN KEY ("decidedById") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "NewProductEntry"
ADD CONSTRAINT "NewProductEntry_childId_fkey"
FOREIGN KEY ("childId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "NewProductEntry"
ADD CONSTRAINT "NewProductEntry_decidedById_fkey"
FOREIGN KEY ("decidedById") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PointTransaction"
ADD CONSTRAINT "PointTransaction_choreCompletionId_fkey"
FOREIGN KEY ("choreCompletionId") REFERENCES "ChoreCompletion"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PointTransaction"
ADD CONSTRAINT "PointTransaction_newProductEntryId_fkey"
FOREIGN KEY ("newProductEntryId") REFERENCES "NewProductEntry"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PointTransaction"
ADD CONSTRAINT "PointTransaction_exactly_one_source_check"
CHECK (num_nonnulls("dailyCheckId", "choreCompletionId", "newProductEntryId") = 1);
