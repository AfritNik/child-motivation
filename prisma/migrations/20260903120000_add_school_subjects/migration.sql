INSERT INTO "Subject" ("id", "name", "priority", "isActive", "sortOrder", "updatedAt")
VALUES
    ('10000000-0000-4000-8000-000000000004', 'Биология', 'NORMAL', true, 5, CURRENT_TIMESTAMP),
    ('10000000-0000-4000-8000-000000000005', 'Физкультура', 'LOW', true, 8, CURRENT_TIMESTAMP),
    ('10000000-0000-4000-8000-000000000006', 'Литература', 'NORMAL', true, 3, CURRENT_TIMESTAMP),
    ('10000000-0000-4000-8000-000000000007', 'Труд', 'LOW', true, 9, CURRENT_TIMESTAMP),
    ('10000000-0000-4000-8000-000000000008', 'ИЗО', 'LOW', true, 10, CURRENT_TIMESTAMP),
    ('10000000-0000-4000-8000-000000000009', 'История', 'NORMAL', true, 7, CURRENT_TIMESTAMP),
    ('10000000-0000-4000-8000-000000000010', 'География', 'NORMAL', true, 6, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

UPDATE "Subject"
SET "sortOrder" = CASE "name"
    WHEN 'Математика' THEN 1
    WHEN 'Русский язык' THEN 2
    WHEN 'Литература' THEN 3
    WHEN 'Английский язык' THEN 4
    WHEN 'Биология' THEN 5
    WHEN 'География' THEN 6
    WHEN 'История' THEN 7
    WHEN 'Физкультура' THEN 8
    WHEN 'Труд' THEN 9
    WHEN 'ИЗО' THEN 10
END
WHERE "name" IN (
    'Математика', 'Русский язык', 'Литература', 'Английский язык', 'Биология',
    'География', 'История', 'Физкультура', 'Труд', 'ИЗО'
);
