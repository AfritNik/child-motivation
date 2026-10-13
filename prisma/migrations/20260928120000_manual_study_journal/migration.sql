ALTER TABLE "StudyMark" ALTER COLUMN "date" DROP NOT NULL;
ALTER TABLE "StudyMark" ADD COLUMN "deletedAt" TIMESTAMPTZ(3);

CREATE TABLE "ScreenTimeState" (
  "id" INTEGER PRIMARY KEY DEFAULT 1 CHECK ("id" = 1),
  "dailyLimitMinutes" INTEGER NOT NULL CHECK ("dailyLimitMinutes" BETWEEN 0 AND 120),
  "explanation" TEXT NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Preserve the previously active limit, not a scheduled future decision.
INSERT INTO "ScreenTimeState" ("id", "dailyLimitMinutes", "explanation")
SELECT 1, "dailyLimitMinutes", "explanation" FROM "WeekDecision"
WHERE "startsOn" <= (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Moscow')::date AND NOT "isStale"
ORDER BY "startsOn" DESC LIMIT 1;
INSERT INTO "ScreenTimeState" ("id", "dailyLimitMinutes", "explanation")
VALUES (1, 60, 'Стартовое время. Новая рекомендация применяется вручную.')
ON CONFLICT ("id") DO NOTHING;
