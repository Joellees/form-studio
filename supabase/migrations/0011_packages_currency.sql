-- `packages.currency` — choose the currency the package's
-- `price_usd` column represents.
--
-- Why this exists:
--
-- The original schema only stored a USD price (`price_usd`). Trainers
-- in the UAE and Saudi setups want to price in AED / SAR instead. The
-- migration adds a `currency` enum-check column to the packages table
-- and treats `price_usd` from here on as "the price in the chosen
-- currency" — same numeric column, currency label varies. Renaming
-- the column to a generic `price` is a bigger change for a later
-- migration; the in-app `formatPrice` helper already handles
-- per-currency display, so the rename is cosmetic.
--
-- Defaults to `usd` so existing rows keep working without backfill.
-- `add column if not exists` makes the migration idempotent so it's
-- safe to re-run.
--
-- App reads are tolerant of the column being missing (form falls
-- back to "usd"); reads here just become real after the migration is
-- applied.

alter table public.packages
  add column if not exists currency text not null default 'usd'
    check (currency in ('usd', 'aed', 'sar'));

comment on column public.packages.currency is
  'Currency the price_usd column represents (legacy column name kept until a generic rename). One of usd, aed, sar. Defaults to usd for back-compat.';
