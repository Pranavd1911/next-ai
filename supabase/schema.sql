create extension if not exists pgcrypto;

create table if not exists chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New Chat',
  mode text not null default 'general',
  created_at timestamptz not null default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references chats(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

alter table chats enable row level security;
alter table messages enable row level security;

drop policy if exists "Users can read own chats" on chats;
create policy "Users can read own chats"
on chats for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own chats" on chats;
create policy "Users can insert own chats"
on chats for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own chats" on chats;
create policy "Users can update own chats"
on chats for update
using (auth.uid() = user_id);

drop policy if exists "Users can delete own chats" on chats;
create policy "Users can delete own chats"
on chats for delete
using (auth.uid() = user_id);

drop policy if exists "Users can read own messages" on messages;
create policy "Users can read own messages"
on messages for select
using (
  exists (
    select 1 from chats
    where chats.id = messages.chat_id and chats.user_id = auth.uid()
  )
);

drop policy if exists "Users can insert own messages" on messages;
create policy "Users can insert own messages"
on messages for insert
with check (
  exists (
    select 1 from chats
    where chats.id = messages.chat_id and chats.user_id = auth.uid()
  )
);

drop policy if exists "Users can delete own messages" on messages;
create policy "Users can delete own messages"
on messages for delete
using (
  exists (
    select 1 from chats
    where chats.id = messages.chat_id and chats.user_id = auth.uid()
  )
);
