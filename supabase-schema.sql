-- Supabase Schema for Chat Application

-- 1. Users table (extends auth.users)
create table public.users (
  id uuid references auth.users not null primary key,
  username text unique not null,
  is_online boolean default false,
  is_typing_to uuid references public.users(id),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Conversations table
create table public.conversations (
  id text primary key, -- e.g., sorted user IDs joined by '_'
  participants uuid[] not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Messages table
create table public.messages (
  id uuid default gen_random_uuid() primary key,
  conversation_id text references public.conversations(id) on delete cascade not null,
  sender_id uuid references public.users(id) on delete cascade not null,
  content text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Turn on RLS
alter table public.users enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

-- Policies for users
create policy "Users can view other users" on public.users
  for select using (true);
create policy "Users can insert their own profile" on public.users
  for insert with check (auth.uid() = id);
create policy "Users can update their own profile" on public.users
  for update using (auth.uid() = id);

-- Policies for conversations
create policy "Users can view conversations they are part of" on public.conversations
  for select using (auth.uid() = any(participants));
create policy "Users can insert conversations they are part of" on public.conversations
  for insert with check (auth.uid() = any(participants));
create policy "Users can update conversations they are part of" on public.conversations
  for update using (auth.uid() = any(participants));

-- Policies for messages
create policy "Users can view messages in their conversations" on public.messages
  for select using (
    exists (
      select 1 from public.conversations c 
      where c.id = messages.conversation_id 
      and auth.uid() = any(c.participants)
    )
  );
create policy "Users can insert messages in their conversations" on public.messages
  for insert with check (
    auth.uid() = sender_id and
    exists (
      select 1 from public.conversations c 
      where c.id = messages.conversation_id 
      and auth.uid() = any(c.participants)
    )
  );

-- Helper function to sync auth.users with public.users
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, username)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

-- Trigger to call the function when a new user is created
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
