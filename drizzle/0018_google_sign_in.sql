-- Google sign-in: an account no longer needs a password.
--
-- Everyone signs in with a Designally Workspace account, so `upsertUser`
-- creates rows with no password_hash at all. The column stays for the day
-- password accounts return for outside testers.
--
-- Hand-trimmed. drizzle-kit generated this alongside a re-emission of the
-- whole of 0016 (CREATE TABLE pillars, categories.pillar_id, sort_order),
-- because 0016 and 0017 were written by hand and its snapshot had not seen
-- them — the last generated snapshot was 0015. Those statements are already
-- applied everywhere and would fail here. 0018's snapshot does include them,
-- so the drift is closed from this migration on.

ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;
