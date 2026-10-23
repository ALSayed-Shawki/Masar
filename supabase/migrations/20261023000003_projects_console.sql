-- Project scopes, daily requests with done-notes, per-project AI threads.

alter table public.projects
  add column client text not null default '',
  add column status text not null default 'active' check (status in ('active','prospect','paused','done')),
  add column scope text not null default '',
  add column next_step text not null default '',
  add column ai_summary text not null default '',
  add column updated_at timestamptz not null default now();

-- kind: 'request' = something asked of him today at work (meant to close the same day)
alter table public.tasks
  add column kind text not null default 'task' check (kind in ('task','request')),
  add column done_note text not null default '';

-- null = the general companion chat; otherwise the AI thread about one project
alter table public.chat_messages
  add column project_id uuid references public.projects on delete cascade;
create index chat_project_time on public.chat_messages (project_id, created_at desc);
