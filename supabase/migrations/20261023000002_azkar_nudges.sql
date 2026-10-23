-- Azkar reminders + AI check-ins ("nudges") + conversation history.

-- Conversation with the AI companion: nudges it sends and Sayed's replies.
create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  role text not null check (role in ('assistant','user')),
  text text not null,
  source text not null default 'chat' check (source in ('chat','nudge')),
  created_at timestamptz not null default now()
);
create index chat_owner_time on public.chat_messages (owner_id, created_at desc);
alter table public.chat_messages enable row level security;
create policy chat_messages_owner_all on public.chat_messages for all to authenticated
  using (owner_id = auth.uid() and public.is_real_user())
  with check (owner_id = auth.uid() and public.is_real_user());
grant select, insert, update, delete on public.chat_messages to authenticated;

-- Generic dedupe log for scheduled notifications (azkar, nudges). Service role only.
create table public.notify_log (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users on delete cascade,
  key text not null,              -- 'azkar:morning', 'azkar:evening', 'nudge:14'
  for_date date not null,
  sent_at timestamptz not null default now(),
  unique (owner_id, key, for_date)
);
alter table public.notify_log enable row level security;
revoke all on public.notify_log from anon, authenticated;

-- which azkar sets were completed each day: {"morning": true, "evening": true}
alter table public.day_logs add column azkar jsonb not null default '{}'::jsonb;
