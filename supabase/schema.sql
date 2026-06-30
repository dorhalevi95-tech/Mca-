-- Run this in your Supabase SQL editor to set up the database

create table if not exists checks (
  id          bigserial primary key,
  checked_at  timestamptz not null default now(),
  slots_found text[]      not null default '{}',
  slot_count  int         not null default 0,
  error       text,
  page_snapshot text
);

create table if not exists notifications (
  id           bigserial primary key,
  slot_label   text        not null,
  notified_at  timestamptz not null default now()
);

-- Index for fast duplicate-notification lookup
create index if not exists notifications_slot_label_idx on notifications (slot_label);

-- View for the dashboard: last 50 checks
create or replace view recent_checks as
  select id, checked_at, slot_count, slots_found, error
  from checks
  order by checked_at desc
  limit 50;

-- Enable Row Level Security (read-only for anon/dashboard)
alter table checks enable row level security;
alter table notifications enable row level security;

create policy "public read checks"
  on checks for select using (true);

create policy "public read notifications"
  on notifications for select using (true);
