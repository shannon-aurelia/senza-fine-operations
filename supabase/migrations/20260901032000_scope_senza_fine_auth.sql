alter table public.sf_auth_profiles add column if not exists app_scope text;
update public.sf_auth_profiles set app_scope = 'senza-fine' where email = 'aureliawwshan@gmail.com';

grant insert (id, name, email, department, role, active, app_scope) on public.sf_auth_profiles to authenticated;
grant update (name, email, department, role, active, app_scope, updated_at) on public.sf_auth_profiles to authenticated;

create policy "Staff can create their own pending Senza Fine profile"
on public.sf_auth_profiles for insert to authenticated
with check ((select auth.uid()) = id and role = 'staff' and active = false and app_scope = 'senza-fine');

create policy "Staff can update their own pending Senza Fine profile"
on public.sf_auth_profiles for update to authenticated
using ((select auth.uid()) = id and role = 'staff' and active = false)
with check ((select auth.uid()) = id and role = 'staff' and active = false and app_scope = 'senza-fine');
