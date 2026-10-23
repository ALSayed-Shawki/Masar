-- Daily AI call counter per person, so a shared app can't run up the API bill.
create table public.ai_usage (
  owner_id uuid not null references auth.users on delete cascade,
  day date not null,
  calls int not null default 0,
  primary key (owner_id, day)
);
alter table public.ai_usage enable row level security;
create policy ai_usage_read_own on public.ai_usage for select to authenticated using (owner_id = auth.uid());
grant select on public.ai_usage to authenticated;

-- Count one call for the caller today; returns false when the limit is already reached.
create or replace function public.bump_ai_usage(p_limit int)
returns boolean language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is null then return false; end if;
  insert into ai_usage (owner_id, day, calls) values (auth.uid(), (now() at time zone 'Asia/Riyadh')::date, 1)
  on conflict (owner_id, day) do update set calls = ai_usage.calls + 1
  returning calls into n;
  return n <= p_limit;
end $$;
revoke all on function public.bump_ai_usage(int) from public, anon;
grant execute on function public.bump_ai_usage(int) to authenticated;
