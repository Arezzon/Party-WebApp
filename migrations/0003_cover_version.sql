ALTER TABLE Events ADD COLUMN cover_version TEXT NOT NULL DEFAULT '';
UPDATE Events SET cover_version = created_at WHERE cover_blob IS NOT NULL AND cover_version = '';
