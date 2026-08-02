create type public.staff_role as enum ('system_admin', 'owner', 'manager', 'purchasing', 'kitchen', 'staff');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text,
  role public.staff_role not null default 'staff',
  location text default 'All',
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id),
  user_email text not null,
  action text not null,
  entity_type text not null,
  entity_reference text,
  location text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.audit_logs enable row level security;

create or replace function public.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and active
      and role in ('system_admin', 'owner')
  );
$$;

create policy "users read own profile"
on public.profiles for select
using (auth.uid() = id);

create policy "admins read profiles"
on public.profiles for select
using (public.current_user_is_admin());

create policy "admins update profiles"
on public.profiles for update
using (public.current_user_is_admin());

create policy "active users read audit log"
on public.audit_logs for select
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.active
  )
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'));
  return new;
end;
$$;

create or replace function public.promote_first_administrator(target_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.profiles where role = 'system_admin' and active) then
    raise exception 'A system administrator already exists';
  end if;
  update public.profiles
  set role = 'system_admin', active = true, updated_at = now()
  where lower(email) = lower(target_email);
  if not found then
    raise exception 'Sign in once with this Google account before promoting it';
  end if;
end;
$$;

revoke execute on function public.promote_first_administrator(text) from public, anon, authenticated;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();
