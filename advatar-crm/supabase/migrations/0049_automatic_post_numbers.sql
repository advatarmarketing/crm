-- 0049 - Post numbers that fill themselves in
--
-- A video's "where it's posted" numbers are now copied every day from
-- the client's connected Instagram, TikTok or Facebook account (0048).
-- This lets those rows say so: metrics_source = 'platform'.
--
-- Safe to run twice. Needs 0046.

alter table public.video_posts drop constraint if exists video_posts_metrics_source_check;
alter table public.video_posts
  add constraint video_posts_metrics_source_check
  check (metrics_source is null or metrics_source in ('typed', 'screenshot', 'youtube', 'platform'));
