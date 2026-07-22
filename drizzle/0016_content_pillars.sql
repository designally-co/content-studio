-- Content Core Pillars: introduce a pillars table and nest content directions
-- (categories) under it. Retires the old flat editorial categories.

CREATE TABLE IF NOT EXISTS "pillars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"tagline" text DEFAULT '' NOT NULL,
	"purpose" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "pillars_slug_unique" UNIQUE("slug")
);

ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "pillar_id" uuid REFERENCES "pillars"("id");
ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "sort_order" integer DEFAULT 0 NOT NULL;

-- Retire every existing content direction; the four pillars fully replace them.
-- Existing projects keep their category_id (rows stay, just inactive).
UPDATE "categories" SET "active" = false;

-- Seed the four pillars.
INSERT INTO "pillars" ("slug", "name", "tagline", "purpose", "sort_order")
SELECT v."slug", v."name", v."tagline", v."purpose", v."sort_order"
FROM (
	VALUES
		('design', 'Design', 'Everything starts with a strong foundation.',
			'Share design knowledge that helps audiences understand the principles behind design, building a strong foundation for better thinking — not just better outcomes.', 1),
		('new-update', 'New Update', 'Things worth paying attention to.',
			'Curate and explain industry news, trends, and emerging changes, helping audiences understand why they matter for brands and businesses.', 2),
		('creative-things', 'Creative Things', 'Why creative decisions work.',
			'Break down the thinking behind creative work, campaigns, and ideas to show that great creativity is always driven by purpose and strategy.', 3),
		('ai-with-design', 'AI with Design', 'AI applied to creative thinking.',
			'Explore how AI can be applied to design and strategy, enabling smarter workflows, greater efficiency, and long-term value creation.', 4)
) AS v("slug", "name", "tagline", "purpose", "sort_order")
WHERE NOT EXISTS (SELECT 1 FROM "pillars" p WHERE p."slug" = v."slug");

-- Seed content directions, each linked to its pillar and ordered as in the doc.
INSERT INTO "categories" ("name", "pillar_id", "sort_order", "active")
SELECT v."name", p."id", v."sort_order", true
FROM (
	VALUES
		('Branding Systems', 'design', 1),
		('Visual Identity', 'design', 2),
		('UX/UI', 'design', 3),
		('Design Process', 'design', 4),
		('Grid Systems', 'design', 5),
		('Typography', 'design', 6),
		('Design Psychology', 'design', 7),
		('Case Study', 'design', 8),
		('Design Critique', 'design', 9),
		('Before / After', 'design', 10),
		('Industry Trends', 'new-update', 1),
		('New Technology', 'new-update', 2),
		('Marketing Shift', 'new-update', 3),
		('Consumer Behavior', 'new-update', 4),
		('Brand Launch', 'new-update', 5),
		('Product Update', 'new-update', 6),
		('Design Tools', 'new-update', 7),
		('Industry Report', 'new-update', 8),
		('Campaign Breakdown', 'creative-things', 1),
		('Packaging', 'creative-things', 2),
		('Motion', 'creative-things', 3),
		('Creative Direction', 'creative-things', 4),
		('Photography', 'creative-things', 5),
		('Brand Film', 'creative-things', 6),
		('Storytelling', 'creative-things', 7),
		('Creative Review', 'creative-things', 8),
		('AI Workflow', 'ai-with-design', 1),
		('Strategy + AI', 'ai-with-design', 2),
		('Research', 'ai-with-design', 3),
		('Brand Audit', 'ai-with-design', 4),
		('Productivity', 'ai-with-design', 5),
		('Automation', 'ai-with-design', 6),
		('AI Design', 'ai-with-design', 7),
		('Future of Design', 'ai-with-design', 8)
) AS v("name", "pillar_slug", "sort_order")
JOIN "pillars" p ON p."slug" = v."pillar_slug"
WHERE NOT EXISTS (
	SELECT 1 FROM "categories" c WHERE c."name" = v."name" AND c."pillar_id" = p."id"
);
