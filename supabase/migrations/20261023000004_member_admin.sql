-- Owner tools for group members: which members have a PIN, and removing a member.

-- Which members of my group already have a PIN (the hashes themselves stay unreadable).
create or replace function public.member_pin_status(p_group uuid)
returns table (member_id uuid, has_pin boolean, locked boolean)
language sql stable security definer set search_path = public as $$
  select m.id, p.member_id is not null, coalesce(p.locked_until > now(), false)
    from group_members m left join member_pins p on p.member_id = m.id
   where m.group_id = p_group and public.is_group_owner(p_group)
$$;

-- Remove a member. If they appear in any expense or settlement they are archived instead,
-- so balances and history stay correct.
create or replace function public.remove_member(p_member uuid)
returns text language plpgsql security definer set search_path = public as $$
declare gid uuid; used boolean;
begin
  select group_id into gid from group_members where id = p_member;
  if gid is null or not public.is_group_owner(gid) then raise exception 'not allowed'; end if;
  if exists (select 1 from group_members where id = p_member and is_owner) then raise exception 'cannot remove the owner'; end if;
  select exists (
    select 1 from expenses where group_id = gid and (payer_id = p_member or p_member = any(participants) or amounts ? p_member::text
                                                     or created_by_member = p_member or edited_by_member = p_member or deleted_by_member = p_member)
    union all select 1 from settlements where group_id = gid and (from_member = p_member or to_member = p_member or created_by_member = p_member)
  ) into used;
  if used then
    update group_members set active = false, user_id = null where id = p_member;
    delete from member_pins where member_id = p_member;
    return 'archived';
  end if;
  delete from group_members where id = p_member;
  return 'deleted';
end $$;

revoke all on function public.member_pin_status(uuid) from public, anon;
revoke all on function public.remove_member(uuid) from public, anon;
grant execute on function public.member_pin_status(uuid) to authenticated;
grant execute on function public.remove_member(uuid) to authenticated;
