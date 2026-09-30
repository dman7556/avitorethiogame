-- ─────────────────────────────────────────────────────────────────────────────
-- REPAIR: Deposit columns the application writes but no migration creates
-- ─────────────────────────────────────────────────────────────────────────────
--
-- WHY THIS FILE EXISTS
--
-- prisma/schema.prisma declares these Deposit columns, and the running code
-- writes/reads them:
--
--   * screenshotPublicId      — written on EVERY createDeposit() insert
--   * overrideRequestedBy     —    the H1 dual-control approval envelope
--   * overrideRequestedAt     —    (deposit.service.approveDeposit reads
--   * overrideAmount          —     overrideRequestedBy before crediting)
--   * overrideReason          —
--   * overrideApprovedBy      —
--   * overrideApprovedAt      —
--
-- ...but prisma/migrations contains NO `ALTER TABLE` for any of them (the
-- Deposit table created by 20260906120516_init has only the original 12
-- columns). Any database provisioned by replaying prisma/migrations is
-- therefore missing them.
--
-- WHAT BREAKS WITHOUT THEM (this is the deposit-evidence failure):
--   1. POST /api/deposits → prisma.deposit.create() includes screenshotPublicId
--      → P2022 "column does not exist" → 500 → NO deposit row is stored, so the
--      user sees an upload but nothing ever reaches the Admin Dashboard.
--   2. GET /api/admin/deposits → prisma.deposit.findMany() selects every scalar
--      column, including the override* ones → same P2022 → the admin list fails
--      to load instead of showing pending deposits.
--   3. POST /api/admin/deposits/:id/approve → reads overrideRequestedBy first
--      → same P2022 → approval fails.
--
-- HOW TO RUN
--   Supabase → SQL Editor → paste → Run. Safe to run more than once, and safe
--   on a database that already has some of the columns (IF NOT EXISTS).
--
--   Alternative (recommended once, on a dev branch first): let Prisma generate
--   the exact diff for your database —  npx prisma db push
--   That also creates the six analytics tables that no migration defines
--   (ActivityEvent, UserSession, RiskEvent, AdminAlert, PlatformMetricSnapshot,
--   ServerSeedArchive), which this focused script deliberately does not touch.
-- ─────────────────────────────────────────────────────────────────────────────

-- Evidence asset reference (Cloudinary public_id, used for deletes)
ALTER TABLE "Deposit" ADD COLUMN IF NOT EXISTS "screenshotPublicId" TEXT;

-- H1 dual-control envelope: out-of-envelope credit requests
ALTER TABLE "Deposit" ADD COLUMN IF NOT EXISTS "overrideRequestedBy" TEXT;
ALTER TABLE "Deposit" ADD COLUMN IF NOT EXISTS "overrideRequestedAt" TIMESTAMP(3);
ALTER TABLE "Deposit" ADD COLUMN IF NOT EXISTS "overrideAmount" DECIMAL(65,30);
ALTER TABLE "Deposit" ADD COLUMN IF NOT EXISTS "overrideReason" TEXT;
ALTER TABLE "Deposit" ADD COLUMN IF NOT EXISTS "overrideApprovedBy" TEXT;
ALTER TABLE "Deposit" ADD COLUMN IF NOT EXISTS "overrideApprovedAt" TIMESTAMP(3);

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFY (expect all seven column names to be returned)
-- ─────────────────────────────────────────────────────────────────────────────
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'Deposit'
--   AND column_name IN (
--     'screenshotPublicId',
--     'overrideRequestedBy', 'overrideRequestedAt', 'overrideAmount',
--     'overrideReason', 'overrideApprovedBy', 'overrideApprovedAt'
--   )
-- ORDER BY column_name;

-- Sanity check: the evidence column every deposit row must populate.
-- SELECT count(*) FILTER (WHERE "screenshotUrl" IS NULL) AS missing_evidence,
--        count(*)                                        AS total_deposits
-- FROM "Deposit";
