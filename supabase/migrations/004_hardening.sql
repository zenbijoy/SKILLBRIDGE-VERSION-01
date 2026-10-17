create table if not exists public.user_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  notification_preferences jsonb not null default '{"messages":true,"connections":true,"sessions":true,"events":true}'::jsonb,
  locale text not null default 'en', theme text not null default 'system', updated_at timestamptz not null default now()
);
create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null, target_type text not null, target_id text,
  metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
alter table public.user_settings enable row level security;
alter table public.audit_logs enable row level security;
create policy settings_self on public.user_settings for all using(user_id=auth.uid()) with check(user_id=auth.uid());
-- Audit logs are service-role/admin only; no direct client policy.

create or replace function public.mutual_connection_count(p_user_a uuid,p_user_b uuid)
returns int language sql stable security definer set search_path=public as $$
with a as (
 select case when user_a=p_user_a then user_b else user_a end u from public.connections where p_user_a in(user_a,user_b)
), b as (
 select case when user_a=p_user_b then user_b else user_a end u from public.connections where p_user_b in(user_a,user_b)
)
select count(*)::int from a join b using(u);
$$;
