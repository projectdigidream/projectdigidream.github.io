-- The website's feedback: anyone may post (no account), everyone may read,
-- and replies are written by you in Supabase's Table Editor (the `reply`
-- column), shown publicly under the message.
--
-- Run once: Supabase dashboard -> SQL Editor -> paste this -> Run.
-- To hide a message (spam, abuse), tick its `hidden` box in the Table Editor.

create table if not exists public.feedback (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  name       text check (name is null or char_length(name) <= 40),
  message    text not null check (char_length(btrim(message)) between 3 and 2000),
  reply      text,
  replied_at timestamptz,
  hidden     boolean not null default false
);

alter table public.feedback enable row level security;

-- Visitors (the "anon" key in the page) may read what is not hidden...
drop policy if exists "read visible" on public.feedback;
create policy "read visible" on public.feedback for select to anon using (not hidden);

-- ...and post a message, but not set a reply, a date or the hidden flag.
drop policy if exists "post" on public.feedback;
create policy "post" on public.feedback for insert to anon
  with check (reply is null and replied_at is null and not hidden);
revoke insert on public.feedback from anon;
grant insert (name, message) on public.feedback to anon;
grant select (id, created_at, name, message, reply, replied_at) on public.feedback to anon;

-- Writing a reply stamps when it was written.
create or replace function public.feedback_replied() returns trigger language plpgsql as $$
begin
  if new.reply is distinct from old.reply then
    new.replied_at := case when new.reply is null or btrim(new.reply) = '' then null else now() end;
  end if;
  return new;
end $$;
drop trigger if exists feedback_replied on public.feedback;
create trigger feedback_replied before update on public.feedback
  for each row execute function public.feedback_replied();

-- A flood guard: at most 20 posts a minute from everyone together.
-- ponytail: global limit, not per visitor; Supabase sees no client IP in SQL.
create or replace function public.feedback_flood() returns trigger language plpgsql security definer as $$
begin
  if (select count(*) from public.feedback where created_at > now() - interval '1 minute') >= 20 then
    raise exception 'too many messages just now, try again in a minute';
  end if;
  return new;
end $$;
drop trigger if exists feedback_flood on public.feedback;
create trigger feedback_flood before insert on public.feedback
  for each row execute function public.feedback_flood();
