-- 0050 - Accounts we manage, and when we started
--
-- On a client's Performance tab the team enters each platform's profile
-- link and the first day we posted for them. Their Content Hub then only
-- counts posts from that day on, links to their profiles, and warns the
-- team if an account was connected that isn't the one linked.
--
-- Safe to run twice. Needs 0048.

alter table public.clients
  add column if not exists social_urls jsonb not null default '{}'::jsonb,
  add column if not exists posting_started_on date;
