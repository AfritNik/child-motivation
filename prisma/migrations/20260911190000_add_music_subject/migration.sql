INSERT INTO "Subject" ("id", "name", "priority", "isActive", "sortOrder", "updatedAt")
VALUES ('10000000-0000-4000-8000-000000000011', 'Музыка', 'LOW', true, 8, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO UPDATE
SET "priority" = EXCLUDED."priority",
    "isActive" = true,
    "sortOrder" = EXCLUDED."sortOrder",
    "updatedAt" = CURRENT_TIMESTAMP;

UPDATE "Subject"
SET "sortOrder" = CASE "name"
    WHEN 'Музыка' THEN 8
    WHEN 'Физкультура' THEN 9
    WHEN 'Труд' THEN 10
    WHEN 'ИЗО' THEN 11
END
WHERE "name" IN ('Музыка', 'Физкультура', 'Труд', 'ИЗО');
