// Group data access. Every call goes through RLS; nothing here trusts the client.
import { sb } from '../../core/supa.js';

export const G = { group: null, members: [], expenses: [], settlements: [], me: null, isOwner: false, uid: null, loaded: false };
const listeners = new Set();
export const onChange = fn => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => listeners.forEach(f => f());

let channel = null, reloadTimer = null;

/** Find the group this user belongs to (owner first, then membership). */
export async function findMyGroupId() {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const own = await sb.from('groups').select('id').eq('owner_id', user.id).order('created_at').limit(1);
  if (own.data?.length) return own.data[0].id;
  const mem = await sb.from('group_members').select('group_id').eq('user_id', user.id).eq('active', true).limit(1);
  return mem.data?.[0]?.group_id || null;
}

export async function load(gid) {
  const { data: { user } } = await sb.auth.getUser();
  G.uid = user?.id || null;
  const [g, m, e, s] = await Promise.all([
    sb.from('groups').select('*').eq('id', gid).single(),
    sb.from('group_members').select('id,name,user_id,is_owner,sort,active').eq('group_id', gid).order('sort').order('created_at'),
    sb.from('expenses').select('*').eq('group_id', gid).order('date', { ascending: false }).order('created_at', { ascending: false }).limit(2000),
    sb.from('settlements').select('*').eq('group_id', gid).order('date', { ascending: false }).limit(1000),
  ]);
  const err = g.error || m.error || e.error || s.error;
  if (err) throw err;
  G.group = g.data; G.members = (m.data || []).filter(x => x.active);
  G.expenses = e.data || []; G.settlements = s.data || [];
  G.isOwner = G.group.owner_id === G.uid;
  G.me = G.members.find(x => x.user_id === G.uid) || null;
  G.loaded = true;
  emit();
}

export function subscribe(gid) {
  if (channel) sb.removeChannel(channel);
  const reload = () => { clearTimeout(reloadTimer); reloadTimer = setTimeout(() => load(gid).catch(() => {}), 400); };
  channel = sb.channel('shela-' + gid);
  for (const table of ['expenses', 'settlements', 'group_members'])
    channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `group_id=eq.${gid}` }, reload);
  channel.subscribe();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) reload(); });
}

export const mName = id => G.members.find(m => m.id === id)?.name || '—';
export const canEdit = x => G.isOwner || (x.created_by && x.created_by === G.uid);

/** Shrink photos before upload (max 1600px JPEG). PDFs and undecodable files go as-is. */
async function shrink(file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    if (k === 1 && file.size < 900_000) return file;
    const c = Object.assign(document.createElement('canvas'), { width: Math.round(bmp.width * k), height: Math.round(bmp.height * k) });
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.82));
    return blob ? new File([blob], 'receipt.jpg', { type: 'image/jpeg' }) : file;
  } catch { return file; }
}

export async function uploadReceipt(file) {
  const f = await shrink(file);
  const ext = f.type === 'application/pdf' ? 'pdf' : f.type === 'image/png' ? 'png' : f.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${G.group.id}/${crypto.randomUUID()}.${ext}`;
  const { error } = await sb.storage.from('receipts').upload(path, f, { contentType: f.type || 'application/octet-stream' });
  if (error) throw error;
  return path;
}
export async function receiptUrl(path) {
  const { data, error } = await sb.storage.from('receipts').createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}

export async function saveExpense(id, e) {
  if (id) {
    const { error } = await sb.from('expenses').update({ ...e, edited_at: new Date().toISOString(), edited_by_member: G.me?.id || null }).eq('id', id);
    if (error) throw error;
  } else {
    const { error } = await sb.from('expenses').insert({ ...e, group_id: G.group.id, created_by: G.uid, created_by_member: G.me?.id });
    if (error) throw error;
  }
  await load(G.group.id);
}
export async function setDeleted(table, id, deleted) {
  const patch = deleted ? { deleted: true, deleted_at: new Date().toISOString() } : { deleted: false, deleted_at: null };
  if (table === 'expenses' && deleted) patch.deleted_by_member = G.me?.id || null;
  const { error } = await sb.from(table).update(patch).eq('id', id);
  if (error) throw error;
  await load(G.group.id);
}
export async function addSettlement(s) {
  const { error } = await sb.from('settlements').insert({ ...s, group_id: G.group.id, created_by: G.uid, created_by_member: G.me?.id });
  if (error) throw error;
  await load(G.group.id);
}

// owner management
export async function createGroup(name, ownerName) {
  const { data, error } = await sb.rpc('create_group', { p_name: name, p_owner_name: ownerName });
  if (error) throw error;
  return data;
}
export async function addMember(name) {
  const sort = Math.max(0, ...G.members.map(m => m.sort || 0)) + 1;
  const { data, error } = await sb.from('group_members').insert({ group_id: G.group.id, name, sort }).select('id').single();
  if (error) throw error;
  await load(G.group.id);
  return data.id;
}
export async function renameMember(id, name) {
  const { error } = await sb.from('group_members').update({ name }).eq('id', id); if (error) throw error;
}
export async function unbindMember(id) {
  const { error } = await sb.from('group_members').update({ user_id: null }).eq('id', id); if (error) throw error;
  await load(G.group.id);
}
export async function setPin(memberId, pin) {
  const { error } = await sb.rpc('set_member_pin', { p_member: memberId, p_pin: pin }); if (error) throw error;
}
export async function newInvite() {
  const { data, error } = await sb.rpc('regenerate_invite', { p_group: G.group.id }); if (error) throw error;
  await load(G.group.id); return data;
}
export async function updateGroup(patch) {
  const { error } = await sb.from('groups').update(patch).eq('id', G.group.id); if (error) throw error;
  await load(G.group.id);
}
export function inviteLink(code = G.group?.invite_code) {
  const base = location.href.replace(/[#?].*$/, '').replace(/[^/]*$/, '');
  return `${base}shela.html#/join/${code}`;
}

// join flow (friends, no account)
export async function preview(code) {
  const { data, error } = await sb.rpc('group_preview', { p_code: code });
  if (error) throw error;
  return data;
}
export async function join(code, memberId, pin) {
  const { data: s } = await sb.auth.getSession();
  if (!s.session) { const { error } = await sb.auth.signInAnonymously(); if (error) throw error; }
  const { data, error } = await sb.rpc('join_group', { p_code: code, p_member: memberId, p_pin: pin });
  if (error) throw error;
  return data;
}
