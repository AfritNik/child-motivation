CREATE TYPE "AccessRole" AS ENUM ('CHILD', 'ADMIN', 'ADULT');
CREATE TYPE "SubjectPriority" AS ENUM ('HIGH', 'NORMAL', 'LOW');

CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "displayName" TEXT NOT NULL,
    "role" "AccessRole" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AcademicQuarter" (
    "id" UUID NOT NULL,
    "schoolYear" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE NOT NULL,
    CONSTRAINT "AcademicQuarter_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AcademicQuarter_number_check" CHECK ("number" BETWEEN 1 AND 4),
    CONSTRAINT "AcademicQuarter_dates_check" CHECK ("startsOn" <= "endsOn")
);

CREATE TABLE "Subject" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "priority" "SubjectPriority" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "currentAverage" DECIMAL(3,2),
    "quarterId" UUID,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "Subject_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Subject_currentAverage_value_check"
      CHECK ("currentAverage" IS NULL OR "currentAverage" BETWEEN 1 AND 5),
    CONSTRAINT "Subject_currentAverage_complete_check" CHECK (
      ("currentAverage" IS NULL AND "quarterId" IS NULL)
      OR
      ("currentAverage" IS NOT NULL AND "quarterId" IS NOT NULL)
    )
);

CREATE INDEX "User_role_isActive_idx" ON "User"("role", "isActive");
CREATE INDEX "AcademicQuarter_startsOn_endsOn_idx" ON "AcademicQuarter"("startsOn", "endsOn");
CREATE UNIQUE INDEX "AcademicQuarter_schoolYear_number_key" ON "AcademicQuarter"("schoolYear", "number");
CREATE UNIQUE INDEX "Subject_name_key" ON "Subject"("name");
CREATE INDEX "Subject_isActive_sortOrder_idx" ON "Subject"("isActive", "sortOrder");

ALTER TABLE "Subject"
    ADD CONSTRAINT "Subject_quarterId_fkey"
    FOREIGN KEY ("quarterId") REFERENCES "AcademicQuarter"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
