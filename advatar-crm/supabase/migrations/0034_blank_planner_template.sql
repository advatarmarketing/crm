-- 0034_blank_planner_template.sql
--
-- Clears the seeded example out of content plans that nobody has
-- written in yet, and leaves every plan that has been worked on
-- exactly as it is.
--
-- Why: the plans were seeded from Advatar's own worked example, so
-- every client's document opened full of somebody else's answers.
-- Text that is already there has to be deleted before it can be
-- replaced, which makes leaving it the path of least resistance. The
-- blank template puts a greyed prompt behind each empty field
-- instead, so the document asks to be filled in rather than edited.
--
-- WHAT THIS DOES NOT DO: it does not touch a plan anybody has
-- written in. The update at the bottom only matches plans still
-- carrying ALL FOUR fingerprints of the untouched example -- the
-- pull quote, the overview heading, the first pillar's name and the
-- guarantee. Change any one of them and this migration passes that
-- plan by. A half-finished plan is somebody's work in progress, and
-- the point of this change was to stop the template getting in the
-- way of that, not to throw it away.
--
-- Step 1 still copies every plan first, so even the ones it does
-- replace are recoverable. The restore statement is at the bottom of
-- this file and in VERIFY_0034.sql.
--
-- Safe to run more than once. The backup is only taken the first
-- time, so a second run cannot overwrite the backup with the blanks
-- the first run already wrote -- and a plan that has already been
-- blanked no longer carries the fingerprints, so it is left alone
-- from then on.
--
-- To see what WOULD change before changing anything, run this on its
-- own first:
--
--   select c.name, 'will be blanked' as what
--   from public.planners p join public.clients c on c.id = p.client_id
--   where p.content->'thesis'->>'quote' like '%trending audio%'
--     and p.content->'overview'->>'heading' = 'Three jobs, one feed'
--     and p.content->'pillars'->'items'->0->>'name' = 'Client Work'
--     and p.content->'guarantee'->>'body' like '%inbound DMs%';

-- 1. Keep what is there now.
create table if not exists public.planners_backup_0034 as
  select id, client_id, content, now() as backed_up_at from public.planners;

-- Nobody but the service role reads this. It is a safety copy, not
-- part of the app, and it holds every client's plan in one table.
alter table public.planners_backup_0034 enable row level security;
revoke all on public.planners_backup_0034 from anon;
revoke all on public.planners_backup_0034 from authenticated;

-- 2. Blank every plan.
update public.planners
set content = '{"logoUrl":null,"hero":{"scene":"","take":"","director":"","roll":"","brand":"","sub":""},"thesis":{"quote":"","caption":""},"overview":{"tag":"","heading":"","desc":""},"branding":{"tag":"Brand DNA","heading":"Branding & positioning","desc":"","rows":[{"id":"brand-1","label":"Brand essence (3 words)","value":"","ph":"Three words that describe the brand"},{"id":"brand-2","label":"Mission statement (1 line)","value":"","ph":"Why this account exists, in one sentence \u2014 what changes for someone after they watch it."},{"id":"brand-3","label":"Tone of voice","value":"","ph":"Three words for how the brand talks"},{"id":"brand-4","label":"Fonts","value":"","ph":"Primary: [font name] \u00b7 Secondary: [font name]"},{"id":"brand-5","label":"Colour palette","value":"","ph":"e.g. Navy, cream, gold accent"},{"id":"brand-6","label":"Design style","value":"","ph":"How it should look and feel on the grid"},{"id":"brand-7","label":"Sound design","value":"","ph":"Music, voice, SFX \u2014 and what''s off-limits"},{"id":"brand-8","label":"Backgrounds / set style","value":"","ph":"Where this gets filmed and how consistent it stays"},{"id":"brand-9","label":"Faces of the brand","value":"","ph":"Who''s on camera \u2014 founder, team, community, or a mix"}]},"pillars":{"tag":"The shot list","heading":"Content pillars","desc":"","items":[{"id":"pillar-10","name":"","pct":0,"subtitle":"","description":"","tags":[""],"color":"var(--red)"},{"id":"pillar-11","name":"","pct":0,"subtitle":"","description":"","tags":[""],"color":"var(--ink)"},{"id":"pillar-12","name":"","pct":0,"subtitle":"","description":"","tags":[""],"color":"var(--gold)"},{"id":"pillar-13","name":"","pct":0,"subtitle":"","description":"","tags":[""],"color":"var(--red-deep)"}]},"format":{"tag":"Cadence","heading":"Format mix, weekly","desc":"","stats":[{"value":"","label":"Posts / week","ph":"5\u20136"},{"value":"","label":"Reels","ph":"65%"},{"value":"","label":"Carousels","ph":"25%"},{"value":"","label":"Static / announcement","ph":"10%"},{"value":"","label":"Stories","ph":"Daily"}]},"workflow":{"tag":"Production line","heading":"Weekly workflow","desc":"","steps":[{"id":"wf-14","num":"01","title":"","description":""},{"id":"wf-15","num":"02","title":"","description":""},{"id":"wf-16","num":"03","title":"","description":""},{"id":"wf-17","num":"04","title":"","description":""}]},"metrics":{"tag":"What actually matters","heading":"Metrics to track","desc":"","items":[{"id":"metric-18","label":"","value":""},{"id":"metric-19","label":"","value":""},{"id":"metric-20","label":"","value":""},{"id":"metric-21","label":"","value":""}]},"competitors":{"tag":"Competitive scan","heading":"What competitors are posting","desc":"","links":[{"id":"link-22","title":"","url":""},{"id":"link-23","title":"","url":""},{"id":"link-24","title":"","url":""}]},"producing":{"tag":"Proof of work","heading":"What we''re producing","desc":"","links":[{"id":"link-25","title":"","url":""},{"id":"link-26","title":"","url":""},{"id":"link-27","title":"","url":""}]},"slots":{"tag":"Monthly output","heading":"Video slot planner","desc":"Set how many finished videos you''re committing to this month. Each slot carries its own brief \u2014 hook, body, CTA, WMS and scenery \u2014 plus the shoot it belongs to and a spot for the link once it''s done.","items":[{"id":"slot-28","title":"","description":"","pillar":"","link":"","hook":"","body":"","cta":"","wms":"","scenery":"","set":""},{"id":"slot-29","title":"","description":"","pillar":"","link":"","hook":"","body":"","cta":"","wms":"","scenery":"","set":""},{"id":"slot-30","title":"","description":"","pillar":"","link":"","hook":"","body":"","cta":"","wms":"","scenery":"","set":""},{"id":"slot-31","title":"","description":"","pillar":"","link":"","hook":"","body":"","cta":"","wms":"","scenery":"","set":""},{"id":"slot-32","title":"","description":"","pillar":"","link":"","hook":"","body":"","cta":"","wms":"","scenery":"","set":""},{"id":"slot-33","title":"","description":"","pillar":"","link":"","hook":"","body":"","cta":"","wms":"","scenery":"","set":""},{"id":"slot-34","title":"","description":"","pillar":"","link":"","hook":"","body":"","cta":"","wms":"","scenery":"","set":""},{"id":"slot-35","title":"","description":"","pillar":"","link":"","hook":"","body":"","cta":"","wms":"","scenery":"","set":""},{"id":"slot-36","title":"","description":"","pillar":"","link":"","hook":"","body":"","cta":"","wms":"","scenery":"","set":""},{"id":"slot-37","title":"","description":"","pillar":"","link":"","hook":"","body":"","cta":"","wms":"","scenery":"","set":""},{"id":"slot-38","title":"","description":"","pillar":"","link":"","hook":"","body":"","cta":"","wms":"","scenery":"","set":""},{"id":"slot-39","title":"","description":"","pillar":"","link":"","hook":"","body":"","cta":"","wms":"","scenery":"","set":""}]},"timeline":{"tag":"How it rolls out","heading":"Client timeline","desc":"","items":[{"id":"tl-40","date":"","title":"","description":"","done":false},{"id":"tl-41","date":"","title":"","description":"","done":false},{"id":"tl-42","date":"","title":"","description":"","done":false},{"id":"tl-43","date":"","title":"","description":"","done":false},{"id":"tl-44","date":"","title":"","description":"","done":false}]},"guarantee":{"tag":"","heading":"","body":"","terms":[{"id":"term-45","text":""},{"id":"term-46","text":""},{"id":"term-47","text":""}]}}'::jsonb
-- Only plans still carrying every fingerprint of the untouched
-- example. All four, not any one of them: a plan where somebody has
-- rewritten the pull quote but not yet reached the pillars is a plan
-- being worked on, and it is left alone.
where content->'thesis'->>'quote' like '%trending audio%'
  and content->'overview'->>'heading' = 'Three jobs, one feed'
  and content->'pillars'->'items'->0->>'name' = 'Client Work'
  and content->'guarantee'->>'body' like '%inbound DMs%';

-- To undo, run this on its own:
--
--   update public.planners p
--   set content = b.content
--   from public.planners_backup_0034 b
--   where b.id = p.id;
