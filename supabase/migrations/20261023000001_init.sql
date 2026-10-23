-- Masar — initial schema
-- Personal data: one owner per row, visible only to that signed-in (non-anonymous) user.
-- Group data ("الشلة"): visible to the group's owner and to members bound to the group,
-- including anonymous users who joined with an invite code + PIN.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------------
create or replace function public.is_real_user() returns boolean
language sql stable as $$
  select auth.uid() is not null
     and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
$$;

-- ---------------------------------------------------------------------------
-- personal tables
-- ---------------------------------------------------------------------------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  area text not null default 'work' check (area in ('work','growth','business','personal')),
  sort int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null,
  dod text not null default '',
  project_id uuid references public.projects on delete set null,
  due date,
  priority smallint not null default 1 check (priority between 1 and 3),
  status text not null default 'todo' check (status in ('todo','done')),
  focus_date date,
  rolled int not null default 0,
  done_at timestamptz,
  created_at timestamptz not null default now()
);
create index tasks_owner_status on public.tasks (owner_id, status);

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  kind text not null default 'note' check (kind in ('idea','note','learn')),
  text text not null,
  source text not null default '',
  project_id uuid references public.projects on delete set null,
  created_at timestamptz not null default now()
);

create table public.wins (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  text text not null,
  project_id uuid references public.projects on delete set null,
  date date not null default current_date,
  created_at timestamptz not null default now()
);

create table public.money_entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  kind text not null check (kind in ('in','out')),
  amount numeric(14,2) not null check (amount > 0),
  currency text not null default 'SAR' check (currency in ('SAR','EGP')),
  category text not null default 'أخرى',
  note text not null default '',
  date date not null default current_date,
  created_at timestamptz not null default now()
);
create index money_owner_date on public.money_entries (owner_id, date);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null,
  area text not null default 'growth' check (area in ('work','growth','business','personal')),
  progress int not null default 0 check (progress between 0 and 100),
  next_step text not null default '',
  deadline date,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

create table public.weeks (
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  start date not null,
  focus text[] not null default '{}',
  review text not null default '',
  reviewed_at timestamptz,
  primary key (owner_id, start)
);

-- one row per day: mood check-in, prayers, medication doses, qada made up
create table public.day_logs (
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  date date not null,
  mood smallint check (mood between 1 and 5),
  energy smallint check (energy between 1 and 5),
  word text not null default '',
  highlight text not null default '',
  prayers jsonb not null default '{}'::jsonb,   -- {"fajr":"ontime"|"late"|"missed", ...}
  meds jsonb not null default '{}'::jsonb,      -- {"<medication_id>@HH:MM":"taken"|"skipped"}
  qada int not null default 0 check (qada >= 0),
  updated_at timestamptz not null default now(),
  primary key (owner_id, date)
);

create table public.settings (
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  key text not null,
  value jsonb not null default '{}'::jsonb,
  primary key (owner_id, key)
);

create table public.medications (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  times text[] not null check (cardinality(times) between 1 and 6),  -- 'HH:MM' local
  timezone text not null default 'Asia/Riyadh',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['projects','tasks','notes','wins','money_entries','goals','weeks',
                           'day_logs','settings','medications'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (owner_id = auth.uid() and public.is_real_user())
         with check (owner_id = auth.uid() and public.is_real_user())',
      t || '_owner_all', t);
  end loop;
end $$;

-- web push
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text not null default '',
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
create policy push_own on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- service-role only (no policies): dedupe for reminders
create table public.reminder_log (
  id bigint generated always as identity primary key,
  medication_id uuid not null references public.medications on delete cascade,
  for_date date not null,
  dose_time text not null,
  kind text not null check (kind in ('due','followup')),
  sent_at timestamptz not null default now(),
  unique (medication_id, for_date, dose_time, kind)
);
alter table public.reminder_log enable row level security;

-- ---------------------------------------------------------------------------
-- group expenses ("الشلة")
-- ---------------------------------------------------------------------------
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  currency text not null default 'ريال',
  invite_code text not null unique default upper(encode(extensions.gen_random_bytes(4), 'hex')),
  created_at timestamptz not null default now()
);

create table public.group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups on delete cascade,
  name text not null,
  user_id uuid references auth.users on delete set null,
  is_owner boolean not null default false,
  sort int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (group_id, user_id)
);

-- PIN hashes live apart from members so no client query can ever read them
create table public.member_pins (
  member_id uuid primary key references public.group_members on delete cascade,
  pin_hash text not null,
  failed int not null default 0,
  locked_until timestamptz
);
alter table public.member_pins enable row level security;

create or replace function public.my_member_id(gid uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select id from group_members
   where group_id = gid and user_id = auth.uid() and active
   limit 1
$$;

create or replace function public.is_group_owner(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from groups where id = gid and owner_id = auth.uid())
$$;

create or replace function public.is_group_member(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from group_members where group_id = gid and user_id = auth.uid() and active)
      or exists (select 1 from groups where id = gid and owner_id = auth.uid())
$$;

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups on delete cascade,
  title text not null,
  amount_c bigint not null check (amount_c > 0),          -- halalas
  date date not null default current_date,
  payer_id uuid not null references public.group_members,
  split_type text not null check (split_type in ('equal','one','shares','amounts','personal')),
  participants uuid[] not null default '{}',
  weights jsonb not null default '{}'::jsonb,              -- {member_id: weight}
  amounts jsonb not null default '{}'::jsonb,              -- {member_id: halalas}
  category text not null default 'أخرى',
  note text not null default '',
  receipt_path text,
  created_by uuid not null default auth.uid(),
  created_by_member uuid references public.group_members,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  edited_by_member uuid references public.group_members,
  deleted boolean not null default false,
  deleted_at timestamptz,
  deleted_by_member uuid references public.group_members
);
create index expenses_group_date on public.expenses (group_id, date desc);

create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups on delete cascade,
  from_member uuid not null references public.group_members,
  to_member uuid not null references public.group_members,
  amount_c bigint not null check (amount_c > 0),
  date date not null default current_date,
  note text not null default '',
  created_by uuid not null default auth.uid(),
  created_by_member uuid references public.group_members,
  created_at timestamptz not null default now(),
  deleted boolean not null default false,
  deleted_at timestamptz,
  check (from_member <> to_member)
);

-- integrity: everyone referenced must belong to the same group; split must add up
create or replace function public.validate_expense() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int; s bigint;
begin
  if tg_op = 'UPDATE' then
    new.group_id := old.group_id;
    new.created_by := old.created_by;
    new.created_by_member := old.created_by_member;
    new.created_at := old.created_at;
  end if;
  if not exists (select 1 from group_members where id = new.payer_id and group_id = new.group_id) then
    raise exception 'payer is not in this group';
  end if;
  select count(*) into n from group_members where group_id = new.group_id and id = any(new.participants);
  if n <> cardinality(new.participants) then raise exception 'participant is not in this group'; end if;
  if new.split_type <> 'personal' and cardinality(new.participants) = 0 then
    raise exception 'expense needs participants';
  end if;
  if new.split_type = 'amounts' then
    select coalesce(sum((value)::bigint), 0) into s from jsonb_each_text(new.amounts);
    if s <> new.amount_c then raise exception 'split amounts must add up to the total'; end if;
  end if;
  return new;
end $$;
create trigger expenses_validate before insert or update on public.expenses
  for each row execute function public.validate_expense();

create or replace function public.validate_settlement() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    new.group_id := old.group_id; new.created_by := old.created_by;
    new.created_by_member := old.created_by_member; new.created_at := old.created_at;
  end if;
  if (select count(*) from group_members where group_id = new.group_id and id in (new.from_member, new.to_member)) <> 2 then
    raise exception 'members are not in this group';
  end if;
  return new;
end $$;
create trigger settlements_validate before insert or update on public.settlements
  for each row execute function public.validate_settlement();

alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.expenses enable row level security;
alter table public.settlements enable row level security;

create policy groups_read on public.groups for select to authenticated using (public.is_group_member(id));
create policy groups_insert on public.groups for insert to authenticated
  with check (owner_id = auth.uid() and public.is_real_user());
create policy groups_owner_update on public.groups for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy groups_owner_delete on public.groups for delete to authenticated using (owner_id = auth.uid());

create policy members_read on public.group_members for select to authenticated using (public.is_group_member(group_id));
create policy members_owner_write on public.group_members for all to authenticated
  using (public.is_group_owner(group_id)) with check (public.is_group_owner(group_id));

create policy expenses_read on public.expenses for select to authenticated using (public.is_group_member(group_id));
create policy expenses_insert on public.expenses for insert to authenticated
  with check (public.is_group_member(group_id) and created_by = auth.uid()
              and created_by_member = public.my_member_id(group_id));
create policy expenses_update on public.expenses for update to authenticated
  using (public.is_group_owner(group_id) or created_by = auth.uid())
  with check (public.is_group_member(group_id));
-- no delete policy: deletion is a soft flag so the history stays auditable

create policy settlements_read on public.settlements for select to authenticated using (public.is_group_member(group_id));
create policy settlements_insert on public.settlements for insert to authenticated
  with check (public.is_group_member(group_id) and created_by = auth.uid()
              and created_by_member = public.my_member_id(group_id));
create policy settlements_update on public.settlements for update to authenticated
  using (public.is_group_owner(group_id) or created_by = auth.uid())
  with check (public.is_group_member(group_id));

-- ---------------------------------------------------------------------------
-- group RPCs
-- ---------------------------------------------------------------------------
create or replace function public.create_group(p_name text, p_owner_name text, p_currency text default 'ريال')
returns uuid language plpgsql security definer set search_path = public as $$
declare gid uuid;
begin
  if not public.is_real_user() then raise exception 'sign in first'; end if;
  insert into groups (owner_id, name, currency) values (auth.uid(), p_name, coalesce(p_currency, 'ريال'))
    returning id into gid;
  insert into group_members (group_id, name, user_id, is_owner, sort) values (gid, p_owner_name, auth.uid(), true, 0);
  return gid;
end $$;

create or replace function public.set_member_pin(p_member uuid, p_pin text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare gid uuid;
begin
  select group_id into gid from group_members where id = p_member;
  if gid is null or not public.is_group_owner(gid) then raise exception 'not allowed'; end if;
  if p_pin !~ '^[0-9]{4,8}$' then raise exception 'PIN must be 4 to 8 digits'; end if;
  insert into member_pins (member_id, pin_hash) values (p_member, extensions.crypt(p_pin, extensions.gen_salt('bf')))
    on conflict (member_id) do update set pin_hash = excluded.pin_hash, failed = 0, locked_until = null;
end $$;

create or replace function public.regenerate_invite(p_group uuid)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare c text;
begin
  if not public.is_group_owner(p_group) then raise exception 'not allowed'; end if;
  c := upper(encode(extensions.gen_random_bytes(4), 'hex'));
  update groups set invite_code = c where id = p_group;
  return c;
end $$;

-- what the join screen needs, nothing more
create or replace function public.group_preview(p_code text)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'id', g.id, 'name', g.name,
    'members', coalesce((
      select json_agg(json_build_object('id', m.id, 'name', m.name, 'claimed', m.user_id is not null) order by m.sort, m.created_at)
        from group_members m
       where m.group_id = g.id and m.active and not m.is_owner
         and exists (select 1 from member_pins p where p.member_id = m.id)
    ), '[]'::json))
  from groups g where g.invite_code = upper(trim(p_code))
$$;

create or replace function public.join_group(p_code text, p_member uuid, p_pin text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare g groups; m group_members; pr member_pins;
begin
  if auth.uid() is null then return json_build_object('ok', false, 'error', 'not_signed_in'); end if;
  select * into g from groups where invite_code = upper(trim(p_code));
  if not found then return json_build_object('ok', false, 'error', 'bad_code'); end if;
  select * into m from group_members where id = p_member and group_id = g.id and active and not is_owner;
  if not found then return json_build_object('ok', false, 'error', 'bad_member'); end if;
  select * into pr from member_pins where member_id = m.id for update;
  if not found then return json_build_object('ok', false, 'error', 'no_pin'); end if;
  if pr.locked_until is not null and pr.locked_until > now() then
    return json_build_object('ok', false, 'error', 'locked', 'until', pr.locked_until);
  end if;
  if pr.pin_hash <> extensions.crypt(p_pin, pr.pin_hash) then
    update member_pins
       set failed = failed + 1,
           locked_until = case when failed + 1 >= 5 then now() + interval '15 minutes' else null end
     where member_id = m.id;
    return json_build_object('ok', false, 'error', 'bad_pin', 'left', greatest(0, 4 - pr.failed));
  end if;
  update member_pins set failed = 0, locked_until = null where member_id = m.id;
  update group_members set user_id = null where group_id = g.id and user_id = auth.uid() and id <> m.id;
  update group_members set user_id = auth.uid() where id = m.id;
  return json_build_object('ok', true, 'group_id', g.id, 'member_id', m.id);
end $$;

revoke all on function public.create_group(text, text, text) from public, anon;
revoke all on function public.set_member_pin(uuid, text) from public, anon;
revoke all on function public.regenerate_invite(uuid) from public, anon;
revoke all on function public.join_group(text, uuid, text) from public, anon;
grant execute on function public.create_group(text, text, text) to authenticated;
grant execute on function public.set_member_pin(uuid, text) to authenticated;
grant execute on function public.regenerate_invite(uuid) to authenticated;
grant execute on function public.join_group(text, uuid, text) to authenticated;
grant execute on function public.group_preview(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- receipts storage: receipts/<group_id>/<file>
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 10485760,
        array['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf'])
on conflict (id) do nothing;

create policy receipts_read on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and public.is_group_member(((storage.foldername(name))[1])::uuid));
create policy receipts_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and public.is_group_member(((storage.foldername(name))[1])::uuid));

-- live updates for the group screens
alter publication supabase_realtime add table public.expenses, public.settlements, public.group_members;
