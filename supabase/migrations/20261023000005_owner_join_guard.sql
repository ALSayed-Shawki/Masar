-- Bug fix: if the group owner opened a friend's invite link and entered that friend's PIN,
-- join_group moved the owner's account onto the friend's name and unlinked the owner's own name.
-- 1) The owner can no longer join through an invite link.
-- 2) relink_owner() puts the owner back on their own name (the app calls it automatically).

create or replace function public.join_group(p_code text, p_member uuid, p_pin text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare g groups; m group_members; pr member_pins;
begin
  if auth.uid() is null then return json_build_object('ok', false, 'error', 'not_signed_in'); end if;
  select * into g from groups where invite_code = upper(trim(p_code));
  if not found then return json_build_object('ok', false, 'error', 'bad_code'); end if;
  if g.owner_id = auth.uid() then return json_build_object('ok', false, 'error', 'owner'); end if;
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

create or replace function public.relink_owner(p_group uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_group_owner(p_group) then raise exception 'not allowed'; end if;
  -- free any friend's name the owner was accidentally bound to
  update group_members set user_id = null where group_id = p_group and user_id = auth.uid() and not is_owner;
  update group_members set user_id = auth.uid(), active = true where group_id = p_group and is_owner;
end $$;
revoke all on function public.relink_owner(uuid) from public, anon;
grant execute on function public.relink_owner(uuid) to authenticated;
