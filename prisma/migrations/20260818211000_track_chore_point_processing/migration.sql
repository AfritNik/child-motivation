ALTER TABLE "ChoreCompletion"
ADD COLUMN "pointsProcessedAt" TIMESTAMPTZ(3);

UPDATE "ChoreCompletion"
SET "pointsProcessedAt" = COALESCE("decidedAt", "updatedAt")
WHERE "status" = 'APPROVED'
  AND EXISTS (
    SELECT 1
    FROM "PointTransaction"
    WHERE "PointTransaction"."choreCompletionId" = "ChoreCompletion"."id"
  );
