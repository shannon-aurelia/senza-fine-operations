create table if not exists public.sf_auth_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null unique,
  department text not null default 'Staff' check (department in ('Owner','Floor','Kitchen','Utilities','Staff')),
  role text not null default 'staff' check (role in ('owner','reviewer','staff')),
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sf_auth_profiles enable row level security;
revoke all on public.sf_auth_profiles from anon;
grant select on public.sf_auth_profiles to authenticated;

create policy "Users can read their own Senza Fine profile"
on public.sf_auth_profiles for select to authenticated
using ((select auth.uid()) = id);

create or replace function public.create_senza_fine_profile()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  staff_name text;
  staff_email text;
  initial_department text;
  is_initial_owner boolean;
begin
  staff_email := lower(coalesce(new.email, ''));
  staff_name := trim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(staff_email, '@', 1)));
  initial_department := coalesce(nullif(new.raw_user_meta_data ->> 'department', ''), 'Staff');
  if initial_department not in ('Owner','Floor','Kitchen','Utilities','Staff') then initial_department := 'Staff'; end if;
  is_initial_owner := staff_email = 'aureliawwshan@gmail.com';
  insert into public.sf_auth_profiles (id, name, email, department, role, active)
  values (new.id, staff_name, staff_email, case when is_initial_owner then 'Owner' else initial_department end, case when is_initial_owner then 'owner' else 'staff' end, is_initial_owner)
  on conflict (id) do update set name = excluded.name, email = excluded.email, updated_at = now();
  return new;
end;
$$;

revoke all on function public.create_senza_fine_profile() from public, anon, authenticated;
create trigger on_senza_fine_auth_user_created
after insert or update of email, raw_user_meta_data on auth.users
for each row execute function public.create_senza_fine_profile();
