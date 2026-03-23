create extension if not exists pgcrypto;

create table if not exists chats (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  title text not null default 'New Chat',
  mode text not null default 'general',
  created_at timestamptz not null default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references chats(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists usage_counts (
  owner_id text primary key,
  chat_count integer not null default 0,
  image_count integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists usage_daily (
  owner_id text not null,
  usage_date date not null default current_date,
  chat_count integer not null default 0,
  image_count integer not null default 0,
  primary key (owner_id, usage_date)
);

create table if not exists user_preferences (
  owner_id text primary key,
  memory text not null default '',
  prefers_direct_answers boolean not null default true,
  web_search_enabled boolean not null default true,
  code_mode_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists shared_chats (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references chats(id) on delete cascade,
  owner_id text not null,
  created_at timestamptz not null default now()
);

create table if not exists analytics_events (
  id uuid primary key default gen_random_uuid(),
  owner_id text,
  event_name text not null,
  chat_id uuid references chats(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists observability_events (
  id uuid primary key default gen_random_uuid(),
  owner_id text,
  chat_id uuid references chats(id) on delete set null,
  severity text not null default 'info',
  source text not null default 'server',
  message text not null default '',
  request_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists memory_items (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null,
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists rate_limit_events (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null,
  route text not null,
  created_at timestamptz not null default now()
);

create table if not exists file_extractions (
  owner_id text not null,
  file_hash text not null,
  mime_type text not null default '',
  extracted_text text not null default '',
  extraction_status text not null default 'NO_TEXT_EXTRACTED',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, file_hash)
);

create table if not exists file_extraction_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null,
  file_hash text not null,
  chat_id uuid references chats(id) on delete set null,
  message_id uuid references messages(id) on delete set null,
  mime_type text not null default '',
  status text not null default 'queued',
  storage_path text not null default '',
  preview_image_data text not null default '',
  attempts integer not null default 0,
  error_message text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists messages_chat_id_created_at_idx
on messages (chat_id, created_at);

create index if not exists analytics_events_created_at_idx
on analytics_events (created_at);

create index if not exists analytics_events_owner_id_idx
on analytics_events (owner_id);

create index if not exists observability_events_created_at_idx
on observability_events (created_at desc);

create index if not exists observability_events_severity_created_at_idx
on observability_events (severity, created_at desc);

create index if not exists memory_items_owner_id_idx
on memory_items (owner_id, created_at desc);

create index if not exists rate_limit_events_owner_route_created_at_idx
on rate_limit_events (owner_id, route, created_at desc);

create index if not exists file_extractions_owner_updated_at_idx
on file_extractions (owner_id, updated_at desc);

create index if not exists file_extraction_jobs_owner_status_updated_at_idx
on file_extraction_jobs (owner_id, status, updated_at desc);

alter table chats enable row level security;
alter table messages enable row level security;

drop policy if exists "Users can read own chats" on chats;
create policy "Users can read own chats"
on chats for select
using (auth.uid()::text = user_id);

drop policy if exists "Users can insert own chats" on chats;
create policy "Users can insert own chats"
on chats for insert
with check (auth.uid()::text = user_id);

drop policy if exists "Users can update own chats" on chats;
create policy "Users can update own chats"
on chats for update
using (auth.uid()::text = user_id);

drop policy if exists "Users can delete own chats" on chats;
create policy "Users can delete own chats"
on chats for delete
using (auth.uid()::text = user_id);

drop policy if exists "Users can read own messages" on messages;
create policy "Users can read own messages"
on messages for select
using (
  exists (
    select 1 from chats
    where chats.id = messages.chat_id and chats.user_id = auth.uid()::text
  )
);

drop policy if exists "Users can insert own messages" on messages;
create policy "Users can insert own messages"
on messages for insert
with check (
  exists (
    select 1 from chats
    where chats.id = messages.chat_id and chats.user_id = auth.uid()::text
  )
);

drop policy if exists "Users can delete own messages" on messages;
create policy "Users can delete own messages"
on messages for delete
using (
  exists (
    select 1 from chats
    where chats.id = messages.chat_id and chats.user_id = auth.uid()::text
  )
);
