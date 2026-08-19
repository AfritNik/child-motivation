ALTER TYPE "PointReason" ADD VALUE 'CORRECTION';

CREATE TABLE "PointCorrection" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "createdById" UUID NOT NULL,
  "amount" INTEGER NOT NULL,
  "note" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PointCorrection_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PointTransaction"
DROP CONSTRAINT "PointTransaction_exactly_one_source_check",
ADD COLUMN "pointCorrectionId" UUID;

CREATE UNIQUE INDEX "PointTransaction_pointCorrectionId_key" ON "PointTransaction"("pointCorrectionId");
CREATE INDEX "PointCorrection_userId_createdAt_idx" ON "PointCorrection"("userId", "createdAt");
CREATE INDEX "PointCorrection_createdById_idx" ON "PointCorrection"("createdById");

ALTER TABLE "PointCorrection"
ADD CONSTRAINT "PointCorrection_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PointCorrection"
ADD CONSTRAINT "PointCorrection_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PointTransaction"
ADD CONSTRAINT "PointTransaction_pointCorrectionId_fkey"
FOREIGN KEY ("pointCorrectionId") REFERENCES "PointCorrection"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PointTransaction"
ADD CONSTRAINT "PointTransaction_exactly_one_source_check"
CHECK (num_nonnulls("dailyCheckId", "choreCompletionId", "newProductEntryId", "rewardRequestId", "pointCorrectionId") = 1);

ALTER TABLE "PointCorrection"
ADD CONSTRAINT "PointCorrection_amount_nonzero_check" CHECK ("amount" <> 0);

ALTER TABLE "PointCorrection"
ADD CONSTRAINT "PointCorrection_note_length_check" CHECK (char_length("note") BETWEEN 2 AND 200);
