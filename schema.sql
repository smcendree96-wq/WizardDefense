-- Run this once in Supabase Dashboard > SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-zA-Z0-9_]{3,18}$'),
  display_name text not null check (char_length(display_name) between 2 and 24),
  total_arrows bigint not null default 0 check (total_arrows >= 0),
  enemies_defeated bigint not null default 0 check (enemies_defeated >= 0),
  towers_defeated bigint not null default 0 check (towers_defeated >= 0),
  time_played_seconds bigint not null default 0 check (time_played_seconds >= 0),
  best_wave integer not null default 1 check (best_wave between 1 and 100),
  created_at timestamptz not null default now()
);

create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  created_at timestamptz not null default now(),
  constraint friend_request_not_self check (sender_id <> receiver_id),
  constraint friend_request_unique_pair unique (sender_id, receiver_id)
);

create index if not exists friend_requests_receiver_status_idx
  on public.friend_requests(receiver_id, status);
create index if not exists friend_requests_sender_status_idx
  on public.friend_requests(sender_id, status);

-- Create a public profile atomically with each Auth account.
create or replace function public.create_mooncap_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  chosen_username text;
  chosen_display text;
begin
  chosen_username := lower(coalesce(new.raw_user_meta_data ->> 'username', ''));
  chosen_display := trim(coalesce(new.raw_user_meta_data ->> 'display_name', ''));
  if chosen_username !~ '^[a-z0-9_]{3,18}$' then
    raise exception 'Player name must be 3–18 letters, numbers, or underscores.';
  end if;
  if char_length(chosen_display) < 2 or char_length(chosen_display) > 24 then
    raise exception 'Display name must be 2–24 characters.';
  end if;
  insert into public.profiles(id, username, display_name)
  values (new.id, chosen_username, chosen_display);
  return new;
end;
$$;

drop trigger if exists mooncap_profile_on_signup on auth.users;
create trigger mooncap_profile_on_signup
  after insert on auth.users
  for each row execute function public.create_mooncap_profile();

alter table public.profiles enable row level security;
alter table public.friend_requests enable row level security;

drop policy if exists "Profiles are visible to everyone" on public.profiles;
create policy "Profiles are visible to everyone" on public.profiles
  for select to anon, authenticated using (true);
drop policy if exists "Players can update their own profile stats" on public.profiles;
create policy "Players can update their own profile stats" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "Participants can view friend requests" on public.friend_requests;
create policy "Participants can view friend requests" on public.friend_requests
  for select to authenticated using (auth.uid() = sender_id or auth.uid() = receiver_id);
drop policy if exists "Players can send friend requests" on public.friend_requests;
create policy "Players can send friend requests" on public.friend_requests
  for insert to authenticated with check (auth.uid() = sender_id and status = 'pending');
drop policy if exists "Recipients can respond to requests" on public.friend_requests;
create policy "Recipients can respond to requests" on public.friend_requests
  for update to authenticated using (auth.uid() = receiver_id and status = 'pending')
  with check (auth.uid() = receiver_id and status in ('accepted','rejected'));
drop policy if exists "Participants can remove friend links" on public.friend_requests;
create policy "Participants can remove friend links" on public.friend_requests
  for delete to authenticated using (auth.uid() = sender_id or auth.uid() = receiver_id);

grant usage on schema public to anon, authenticated;
grant select on public.profiles to anon, authenticated;
grant update on public.profiles to authenticated;
grant select, insert, update, delete on public.friend_requests to authenticated;
