-- ============================================================
--  MyScheduler — Supabase Schema
--  Run this entire file in the Supabase SQL Editor once.
-- ============================================================

-- 1. MEETINGS TABLE
CREATE TABLE IF NOT EXISTS public.meetings (
  id                 UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  visitor_name       TEXT         NOT NULL,
  email              TEXT         NOT NULL,
  phone              TEXT         DEFAULT '',
  meeting_title      TEXT         NOT NULL,
  description        TEXT         NOT NULL,
  date               DATE         NOT NULL,
  start_time         TIME         NOT NULL,
  end_time           TIME         NOT NULL,
  status             TEXT         DEFAULT 'pending'
                                  CHECK (status IN ('pending','approved','rejected','cancelled','completed')),
  owner_remarks      TEXT         DEFAULT '',
  cancellation_reason TEXT        DEFAULT '',
  cancelled_by       TEXT         DEFAULT '',   -- 'owner' | 'visitor'
  reschedule_reason  TEXT         DEFAULT '',
  new_date           DATE,
  new_start_time     TIME,
  new_end_time       TIME,
  meeting_minutes    TEXT         DEFAULT '',
  action_items       TEXT         DEFAULT '',
  follow_up_date     DATE,
  visitor_message    TEXT         DEFAULT '',
  requested_at       TIMESTAMPTZ  DEFAULT NOW(),
  updated_at         TIMESTAMPTZ  DEFAULT NOW()
);

-- 2. SLOTS TABLE
CREATE TABLE IF NOT EXISTS public.slots (
  id          UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  date        DATE         NOT NULL,
  start_time  TIME         NOT NULL,
  end_time    TIME         NOT NULL,
  status      TEXT         DEFAULT 'available'
                           CHECK (status IN ('available','booked','blocked')),
  created_at  TIMESTAMPTZ  DEFAULT NOW(),
  UNIQUE (date, start_time, end_time)
);

-- 3. SETTINGS TABLE
CREATE TABLE IF NOT EXISTS public.settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- 4. ACTIVITY LOG TABLE
CREATE TABLE IF NOT EXISTS public.activity_log (
  id          UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  action      TEXT         NOT NULL,   -- 'requested'|'approved'|'rejected'|'cancelled'|'completed'|'rescheduled'
  description TEXT         NOT NULL,
  meeting_id  UUID         REFERENCES public.meetings(id) ON DELETE SET NULL,
  actor       TEXT         DEFAULT 'system',
  created_at  TIMESTAMPTZ  DEFAULT NOW()
);

-- 5. SEED SETTINGS (passcode hash = SHA-256 of "Usharama@7505")
INSERT INTO public.settings (key, value) VALUES
  ('owner_passcode_hash', 'b1b5e5dd3ec2d9171962a1d5fc9aa324850b24ea63dfbb7b92f9babd17a93f13'),
  ('owner_name', 'Vyshnavi Mannam'),
  ('owner_initials', 'VM')
ON CONFLICT (key) DO NOTHING;

-- 6. AUTO-UPDATE updated_at TRIGGER
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_meetings_updated_at ON public.meetings;
CREATE TRIGGER trg_meetings_updated_at
  BEFORE UPDATE ON public.meetings
  FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at();

-- 7. ENABLE REALTIME
ALTER TABLE public.meetings    REPLICA IDENTITY FULL;
ALTER TABLE public.slots       REPLICA IDENTITY FULL;
ALTER TABLE public.activity_log REPLICA IDENTITY FULL;

-- Add tables to the supabase_realtime publication safely
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
exception
  when others then null;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_publication_rel pr 
    join pg_publication p on p.oid = pr.prpubid 
    join pg_class c on c.oid = pr.prrelid 
    where p.pubname = 'supabase_realtime' and c.relname = 'meetings'
  ) then
    alter publication supabase_realtime add table public.meetings;
  end if;
  
  if not exists (
    select 1 from pg_publication_rel pr 
    join pg_publication p on p.oid = pr.prpubid 
    join pg_class c on c.oid = pr.prrelid 
    where p.pubname = 'supabase_realtime' and c.relname = 'slots'
  ) then
    alter publication supabase_realtime add table public.slots;
  end if;

  if not exists (
    select 1 from pg_publication_rel pr 
    join pg_publication p on p.oid = pr.prpubid 
    join pg_class c on c.oid = pr.prrelid 
    where p.pubname = 'supabase_realtime' and c.relname = 'activity_log'
  ) then
    alter publication supabase_realtime add table public.activity_log;
  end if;
exception
  when others then null;
end $$;

-- 8. DISABLE RLS (open for anon reads/writes — fine for this single-owner app)
ALTER TABLE public.meetings     DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.slots        DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings     DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_log DISABLE ROW LEVEL SECURITY;

-- 9. GRANT ANON ACCESS
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meetings     TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.slots        TO anon;
GRANT SELECT                         ON public.settings     TO anon;
GRANT SELECT, INSERT, DELETE         ON public.activity_log TO anon;
GRANT UPDATE                         ON public.settings     TO anon;