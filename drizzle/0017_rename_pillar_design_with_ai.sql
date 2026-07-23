-- Rename the fourth Content Core Pillar's display name from "AI with Design"
-- to "Design with AI" (design is the subject, AI the instrument).
-- The slug stays "ai-with-design": it's an internal identifier that links the
-- pillar to its content directions, so renaming it would buy nothing.

UPDATE "pillars"
SET "name" = 'Design with AI'
WHERE "slug" = 'ai-with-design';
