CREATE TABLE "StudyMark" (
  "id" UUID NOT NULL,
  "subjectId" UUID NOT NULL,
  "quarterId" UUID NOT NULL,
  "date" DATE NOT NULL,
  "position" INTEGER NOT NULL,
  "value" INTEGER NOT NULL CHECK ("value" BETWEEN 1 AND 5),
  "source" TEXT NOT NULL,
  CONSTRAINT "StudyMark_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StudyMark_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StudyMark_quarterId_fkey" FOREIGN KEY ("quarterId") REFERENCES "AcademicQuarter"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "StudyMark_subjectId_quarterId_date_position_key" ON "StudyMark"("subjectId", "quarterId", "date", "position");
CREATE INDEX "StudyMark_quarterId_date_idx" ON "StudyMark"("quarterId", "date");

UPDATE "Reward" SET "name" = 'Дополнительные 30 минут игры в компьютер',
  "description" = '30 дополнительных минут игры в компьютер. День заранее согласовать со взрослым.'
WHERE "id" = '40000000-0000-4000-8000-000000000001';

INSERT INTO "Reward" ("id", "name", "description", "cost", "isActive", "sortOrder") VALUES
('40000000-0000-4000-8000-000000000004', 'Дополнительные 15 минут игры в телефоне', '15 дополнительных минут игры в телефоне. День заранее согласовать со взрослым.', 10, true, 4),
('40000000-0000-4000-8000-000000000005', 'Сладкое из пекарни', 'Одна сладость из пекарни на выбор. Покупку согласовать со взрослым.', 25, true, 5),
('40000000-0000-4000-8000-000000000006', 'Чипсы или другая вкусность', 'Одна упаковка чипсов или другая согласованная вкусность. Размер порции согласовать со взрослым.', 40, true, 6);
