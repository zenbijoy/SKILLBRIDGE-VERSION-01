-- =========================================
-- MIGRATION: 001_schema.sql
-- =========================================

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default 'New member', username text unique,
  avatar_url text, bio text, university text, department text, batch text,
  roles text[] not null default array['student']::text[],
  research_interests text[] not null default '{}',
  reputation int not null default 0 check (reputation >= 0),
  profile_visibility text not null default 'public' check (profile_visibility in ('public','connections','private')),
  account_status text not null default 'active' check (account_status in ('active','suspended','banned')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index profiles_name_trgm on public.profiles using gin (full_name gin_trgm_ops);
create index profiles_username_trgm on public.profiles using gin (username gin_trgm_ops);

create table public.skills (
  id uuid primary key default gen_random_uuid(), name text unique not null, category text not null default 'general', created_at timestamptz not null default now()
);
create index skills_name_trgm on public.skills using gin (name gin_trgm_ops);
create table public.user_skills (
  user_id uuid not null references public.profiles(id) on delete cascade,
  skill_id uuid not null references public.skills(id) on delete cascade,
  kind text not null check (kind in ('known','wanted','research')),
  proficiency int not null default 1 check (proficiency between 1 and 5), verified boolean not null default false,
  created_at timestamptz not null default now(), primary key(user_id,skill_id,kind)
);

create table public.connection_requests (
  id uuid primary key default gen_random_uuid(), requester_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check(status in ('pending','accepted','declined','cancelled')),
  created_at timestamptz not null default now(), responded_at timestamptz,
  unique(requester_id,recipient_id), check(requester_id<>recipient_id)
);
create table public.connections (
  id uuid primary key default gen_random_uuid(), user_a uuid not null references public.profiles(id) on delete cascade,
  user_b uuid not null references public.profiles(id) on delete cascade, user_ids uuid[] not null,
  created_at timestamptz not null default now(), unique(user_a,user_b), check(user_a<>user_b)
);
create index connections_users_idx on public.connections using gin(user_ids);
create table public.blocks (
  id uuid primary key default gen_random_uuid(), blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade, created_at timestamptz not null default now(),
  unique(blocker_id,blocked_id), check(blocker_id<>blocked_id)
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(), kind text not null check(kind in ('dm','group','room')), title text,
  created_by uuid references public.profiles(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member', last_read_at timestamptz, created_at timestamptz not null default now(),
  primary key(conversation_id,user_id)
);
create table public.messages (
  id uuid primary key default gen_random_uuid(), conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade, body text not null check(char_length(body)<=5000),
  reply_to uuid references public.messages(id) on delete set null, attachment jsonb,
  created_at timestamptz not null default now(), edited_at timestamptz, deleted_at timestamptz
);
create index messages_conv_created_idx on public.messages(conversation_id,created_at desc);

create table public.rooms (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  title text not null, description text not null default '', topic text not null, tags text[] not null default '{}',
  visibility text not null default 'public' check(visibility in ('public','private','invite_only')),
  mode text not null default 'hybrid' check(mode in ('online','offline','hybrid')),
  capacity int not null default 30 check(capacity between 2 and 250), member_count int not null default 1 check(member_count>=0),
  scheduled_at timestamptz, campus_location text,
  status text not null default 'open' check(status in ('open','scheduled','live','completed','cancelled')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index rooms_search_title on public.rooms using gin(title gin_trgm_ops);
create index rooms_tags_idx on public.rooms using gin(tags);
create table public.room_members (
  room_id uuid not null references public.rooms(id) on delete cascade, user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check(role in ('owner','teacher','moderator','member')),
  joined_at timestamptz not null default now(), primary key(room_id,user_id)
);
create table public.teaching_requests (
  id uuid primary key default gen_random_uuid(), room_id uuid not null references public.rooms(id) on delete cascade,
  volunteer_id uuid not null references public.profiles(id) on delete cascade, note text,
  status text not null default 'pending' check(status in ('pending','accepted','rejected','withdrawn')),
  created_at timestamptz not null default now(), decided_at timestamptz, unique(room_id,volunteer_id)
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(), room_id uuid not null references public.rooms(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  starts_at timestamptz not null, ends_at timestamptz,
  mode text not null check(mode in ('online','offline','hybrid')), meeting_url text, campus_location text,
  status text not null default 'scheduled' check(status in ('draft','scheduled','live','completed','cancelled')),
  created_at timestamptz not null default now()
);
create index sessions_starts_idx on public.sessions(starts_at);
create table public.session_participants (
  session_id uuid not null references public.sessions(id) on delete cascade, user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'invited', attendance_status text, created_at timestamptz not null default now(), primary key(session_id,user_id)
);
create table public.reviews (
  id uuid primary key default gen_random_uuid(), session_id uuid not null references public.sessions(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete cascade, reviewee_id uuid not null references public.profiles(id) on delete cascade,
  rating int not null check(rating between 1 and 5), comment text, created_at timestamptz not null default now(), unique(session_id,reviewer_id)
);

create table public.clubs (
  id uuid primary key default gen_random_uuid(), name text unique not null, description text, university text,
  verified boolean not null default false, logo_url text, created_by uuid references public.profiles(id) on delete set null, created_at timestamptz not null default now()
);
create table public.club_members (
  club_id uuid not null references public.clubs(id) on delete cascade, user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check(role in ('owner','admin','member')), joined_at timestamptz not null default now(), primary key(club_id,user_id)
);
create table public.events (
  id uuid primary key default gen_random_uuid(), club_id uuid not null references public.clubs(id) on delete cascade,
  title text not null, description text not null default '', starts_at timestamptz not null, ends_at timestamptz,
  location text, online_url text, capacity int, application_required boolean not null default true,
  status text not null default 'published' check(status in ('draft','published','open','closed','completed','cancelled')),
  form_schema jsonb not null default '{}'::jsonb, created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create table public.event_applications (
  id uuid primary key default gen_random_uuid(), event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade, answers jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check(status in ('pending','approved','rejected','waitlisted','cancelled')),
  reviewed_by uuid references public.profiles(id) on delete set null, reviewed_at timestamptz, created_at timestamptz not null default now(), unique(event_id,user_id)
);

create table public.resources (
  id uuid primary key default gen_random_uuid(), room_id uuid references public.rooms(id) on delete cascade,
  uploader_id uuid not null references public.profiles(id) on delete cascade, title text not null, description text, url text not null, storage_path text,
  kind text not null default 'file' check(kind in ('note','slide','link','file','image')), created_at timestamptz not null default now()
);
create table public.saved_items (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  entity_type text not null check(entity_type in ('room','event','resource','profile')), entity_id uuid not null,
  created_at timestamptz not null default now(), unique(user_id,entity_type,entity_id)
);

create table public.points_ledger (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null, points int not null check(points between -500 and 500), reference_type text, reference_id uuid,
  metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index points_ledger_user_idx on public.points_ledger(user_id,created_at desc);
create table public.achievements (
  id uuid primary key default gen_random_uuid(), code text unique not null, title text not null, description text not null, icon text,
  created_at timestamptz not null default now()
);
create table public.user_achievements (
  user_id uuid not null references public.profiles(id) on delete cascade, achievement_id uuid not null references public.achievements(id) on delete cascade,
  earned_at timestamptz not null default now(), primary key(user_id,achievement_id)
);

create table public.quizzes (
  id uuid primary key default gen_random_uuid(), skill_id uuid references public.skills(id) on delete set null, title text not null,
  active boolean not null default true, created_at timestamptz not null default now()
);
create table public.quiz_questions (
  id uuid primary key default gen_random_uuid(), quiz_id uuid not null references public.quizzes(id) on delete cascade,
  prompt text not null, options jsonb not null, correct_answer int not null, explanation text, position int not null default 0
);
create table public.quiz_attempts (
  id uuid primary key default gen_random_uuid(), quiz_id uuid not null references public.quizzes(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade, answers jsonb not null, score int not null check(score between 0 and 100),
  passed boolean not null, created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null default 'general', title text not null, body text not null, data jsonb not null default '{}'::jsonb,
  read_at timestamptz, created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications(user_id,created_at desc);
create table public.device_tokens (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  token text not null, token_fingerprint text not null, platform text, enabled boolean not null default true,
  last_seen_at timestamptz not null default now(), created_at timestamptz not null default now(), unique(user_id,token_fingerprint)
);
create table public.reports (
  id uuid primary key default gen_random_uuid(), reporter_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check(target_type in ('user','message','room','event','resource')), target_id uuid not null,
  target_user_id uuid references public.profiles(id) on delete set null, reason text not null, details text,
  status text not null default 'open' check(status in ('open','reviewing','resolved','dismissed')), action text,
  reviewed_by uuid references public.profiles(id) on delete set null, reviewed_at timestamptz, created_at timestamptz not null default now()
);


-- =========================================
-- MIGRATION: 002_functions_rls.sql
-- =========================================

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles(id,full_name,username)
  values(new.id,coalesce(new.raw_user_meta_data->>'full_name','New member'),'user_'||substr(replace(new.id::text,'-',''),1,10));
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create or replace function public.join_room_atomic(p_room_id uuid,p_user_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.rooms; existing boolean;
begin
  select * into r from public.rooms where id=p_room_id for update;
  if not found then raise exception 'Room not found'; end if;
  if r.status not in ('open','scheduled','live') then raise exception 'Room closed'; end if;
  select exists(select 1 from public.room_members where room_id=p_room_id and user_id=p_user_id) into existing;
  if existing then return jsonb_build_object('already_member',true,'member_count',r.member_count); end if;
  if r.member_count>=r.capacity then raise exception 'Room full'; end if;
  if r.visibility='invite_only' then raise exception 'Invite required'; end if;
  insert into public.room_members(room_id,user_id,role) values(p_room_id,p_user_id,'member');
  update public.rooms set member_count=member_count+1,updated_at=now() where id=p_room_id;
  return jsonb_build_object('joined',true,'member_count',r.member_count+1);
end $$;

create or replace function public.recompute_reputation(p_user_id uuid) returns void language sql security definer set search_path=public as $$
  update public.profiles set reputation=greatest(0,coalesce((select sum(points) from public.points_ledger where user_id=p_user_id),0)) where id=p_user_id;
$$;
create or replace function public.points_after_change() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if TG_OP='DELETE' then perform public.recompute_reputation(old.user_id); return old; end if;
  perform public.recompute_reputation(new.user_id); return new;
end $$;
drop trigger if exists points_reputation_after on public.points_ledger;
create trigger points_reputation_after after insert or update or delete on public.points_ledger for each row execute procedure public.points_after_change();

create or replace function public.find_dm_conversation(p_user_a uuid,p_user_b uuid)
returns table(id uuid,title text,kind text,updated_at timestamptz) language sql security definer set search_path=public as $$
select c.id,c.title,c.kind,c.updated_at from public.conversations c
where c.kind='dm' and exists(select 1 from public.conversation_members m where m.conversation_id=c.id and m.user_id=p_user_a)
and exists(select 1 from public.conversation_members m where m.conversation_id=c.id and m.user_id=p_user_b)
and (select count(*) from public.conversation_members m where m.conversation_id=c.id)=2 limit 1;
$$;

create or replace function public.recommend_people(p_user_id uuid,p_limit int default 20)
returns setof public.profiles language sql stable security definer set search_path=public as $$
with mine as (select skill_id,kind from public.user_skills where user_id=p_user_id), scored as (
 select p.id,
   count(*) filter(where us.skill_id in(select skill_id from mine where kind in ('wanted','research'))) * 3 +
   count(*) filter(where us.skill_id in(select skill_id from mine where kind='known')) as score
 from public.profiles p left join public.user_skills us on us.user_id=p.id
 where p.id<>p_user_id and p.profile_visibility<>'private' and p.account_status='active'
 and not exists(select 1 from public.blocks b where (b.blocker_id=p_user_id and b.blocked_id=p.id) or (b.blocker_id=p.id and b.blocked_id=p_user_id))
 group by p.id
)
select p.* from scored s join public.profiles p on p.id=s.id order by s.score desc,p.reputation desc limit greatest(1,least(p_limit,50));
$$;
create or replace function public.suggest_connections(p_user_id uuid,p_limit int default 10)
returns setof public.profiles language sql stable security definer set search_path=public as $$
select p.* from public.recommend_people(p_user_id,p_limit*3) p
where not exists(select 1 from public.connections c where (c.user_a=p_user_id and c.user_b=p.id) or (c.user_b=p_user_id and c.user_a=p.id))
limit greatest(1,least(p_limit,30));
$$;

alter table public.profiles enable row level security;
alter table public.skills enable row level security;
alter table public.user_skills enable row level security;
alter table public.connection_requests enable row level security;
alter table public.connections enable row level security;
alter table public.blocks enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.teaching_requests enable row level security;
alter table public.sessions enable row level security;
alter table public.session_participants enable row level security;
alter table public.reviews enable row level security;
alter table public.clubs enable row level security;
alter table public.club_members enable row level security;
alter table public.events enable row level security;
alter table public.event_applications enable row level security;
alter table public.resources enable row level security;
alter table public.saved_items enable row level security;
alter table public.points_ledger enable row level security;
alter table public.achievements enable row level security;
alter table public.user_achievements enable row level security;
alter table public.quizzes enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.notifications enable row level security;
alter table public.device_tokens enable row level security;
alter table public.reports enable row level security;

drop policy if exists profile_public_read on public.profiles;
create policy profile_public_read on public.profiles for select using (profile_visibility='public' or id=auth.uid());
drop policy if exists profile_self_update on public.profiles;
create policy profile_self_update on public.profiles for update using(id=auth.uid()) with check(id=auth.uid());
drop policy if exists skills_read on public.skills;
create policy skills_read on public.skills for select using(true);
drop policy if exists user_skills_read on public.user_skills;
create policy user_skills_read on public.user_skills for select using(user_id=auth.uid() or exists(select 1 from public.profiles p where p.id=user_id and p.profile_visibility='public'));
drop policy if exists user_skills_self on public.user_skills;
create policy user_skills_self on public.user_skills for all using(user_id=auth.uid()) with check(user_id=auth.uid());
drop policy if exists connection_request_involved on public.connection_requests;
create policy connection_request_involved on public.connection_requests for select using(auth.uid() in(requester_id,recipient_id));
drop policy if exists connections_involved on public.connections;
create policy connections_involved on public.connections for select using(auth.uid() in(user_a,user_b));
drop policy if exists blocks_owner on public.blocks;
create policy blocks_owner on public.blocks for all using(blocker_id=auth.uid()) with check(blocker_id=auth.uid());
drop policy if exists room_public_read on public.rooms;
create policy room_public_read on public.rooms for select using(visibility='public' or owner_id=auth.uid() or exists(select 1 from public.room_members rm where rm.room_id=id and rm.user_id=auth.uid()));
drop policy if exists room_members_self_read on public.room_members;
create policy room_members_self_read on public.room_members for select using(user_id=auth.uid());
drop policy if exists sessions_member_read on public.sessions;
create policy sessions_member_read on public.sessions for select using(teacher_id=auth.uid() or exists(select 1 from public.session_participants sp where sp.session_id=id and sp.user_id=auth.uid()));
drop policy if exists reviews_public_read on public.reviews;
create policy reviews_public_read on public.reviews for select using(true);
drop policy if exists clubs_public_read on public.clubs;
create policy clubs_public_read on public.clubs for select using(true);
drop policy if exists club_members_public_read on public.club_members;
create policy club_members_public_read on public.club_members for select using(true);
drop policy if exists events_public_read on public.events;
create policy events_public_read on public.events for select using(status in ('published','open','completed'));
drop policy if exists applications_self_read on public.event_applications;
create policy applications_self_read on public.event_applications for select using(user_id=auth.uid());
drop policy if exists resources_room_read on public.resources;
create policy resources_room_read on public.resources for select using(room_id is null or exists(select 1 from public.room_members rm where rm.room_id=room_id and rm.user_id=auth.uid()));
drop policy if exists saved_self on public.saved_items;
create policy saved_self on public.saved_items for all using(user_id=auth.uid()) with check(user_id=auth.uid());
drop policy if exists ledger_self_read on public.points_ledger;
create policy ledger_self_read on public.points_ledger for select using(user_id=auth.uid());
drop policy if exists achievements_read on public.achievements;
create policy achievements_read on public.achievements for select using(true);
drop policy if exists user_achievements_read on public.user_achievements;
create policy user_achievements_read on public.user_achievements for select using(true);
drop policy if exists quizzes_read on public.quizzes;
create policy quizzes_read on public.quizzes for select using(active=true);
-- Intentionally no client SELECT policy on quiz_questions: correct_answer must never be exposed. API service role returns safe fields only.
drop policy if exists attempts_self_read on public.quiz_attempts;
create policy attempts_self_read on public.quiz_attempts for select using(user_id=auth.uid());
drop policy if exists notifications_self on public.notifications;
create policy notifications_self on public.notifications for select using(user_id=auth.uid());
drop policy if exists device_tokens_self on public.device_tokens;
create policy device_tokens_self on public.device_tokens for all using(user_id=auth.uid()) with check(user_id=auth.uid());
drop policy if exists reports_self_insert on public.reports;
create policy reports_self_insert on public.reports for insert with check(reporter_id=auth.uid());
drop policy if exists reports_self_read on public.reports;
create policy reports_self_read on public.reports for select using(reporter_id=auth.uid());

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('avatars','avatars',true,5242880,array['image/jpeg','image/png','image/webp']),
 ('resources','resources',false,26214400,array['application/pdf','image/jpeg','image/png','image/webp','application/vnd.openxmlformats-officedocument.presentationml.presentation','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict(id) do nothing;
drop policy if exists avatars_public_read on storage.objects;
create policy avatars_public_read on storage.objects for select using(bucket_id='avatars');
drop policy if exists avatars_self_insert on storage.objects;
create policy avatars_self_insert on storage.objects for insert to authenticated with check(bucket_id='avatars' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists avatars_self_update on storage.objects;
create policy avatars_self_update on storage.objects for update to authenticated using(bucket_id='avatars' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists resources_member_read on storage.objects;
create policy resources_member_read on storage.objects for select to authenticated using(bucket_id='resources' and exists(select 1 from public.room_members rm where rm.user_id=auth.uid() and rm.room_id::text=(storage.foldername(name))[2]));
drop policy if exists resources_member_write on storage.objects;
create policy resources_member_write on storage.objects for insert to authenticated with check(bucket_id='resources' and (storage.foldername(name))[1]=auth.uid()::text and exists(select 1 from public.room_members rm where rm.user_id=auth.uid() and rm.room_id::text=(storage.foldername(name))[2]));


-- =========================================
-- MIGRATION: 003_research.sql
-- =========================================

create table public.research_projects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  owner_id uuid references public.profiles(id) on delete cascade not null,
  status text not null check (status in ('draft', 'active', 'completed', 'archived')) default 'active',
  research_areas text[] not null default '{}',
  methods text[] not null default '{}',
  tools text[] not null default '{}',
  looking_for_collaborators boolean default false,
  collaboration_requirements text,
  visibility text not null check (visibility in ('public', 'private')) default 'public',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table public.research_collaboration_requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.research_projects(id) on delete cascade not null,
  requester_id uuid references public.profiles(id) on delete cascade not null,
  message text,
  status text not null check (status in ('pending', 'accepted', 'rejected', 'cancelled')) default 'pending',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(project_id, requester_id)
);

alter table public.research_projects enable row level security;
alter table public.research_collaboration_requests enable row level security;

-- Only owner can manage projects, public can read public projects
create policy "Public projects are visible to all" on public.research_projects for select using (visibility = 'public');
create policy "Owners can manage their projects" on public.research_projects using (auth.uid() = owner_id);

-- Collaboration requests
create policy "Users can see their own requests" on public.research_collaboration_requests for select using (auth.uid() = requester_id);
create policy "Project owners can see requests for their project" on public.research_collaboration_requests for select using (
  exists (select 1 from public.research_projects p where p.id = project_id and p.owner_id = auth.uid())
);
-- Backend handles creation and updates


-- =========================================
-- MIGRATION: 003_seed.sql
-- =========================================

insert into public.skills(name,category) values
('Calculus','Mathematics'),('Linear Algebra','Mathematics'),('Physics','Science'),('Chemistry','Science'),('Programming','CSE'),('Data Structures','CSE'),('Algorithms','CSE'),('Machine Learning','Research'),('Deep Learning','Research'),('Thermodynamics','Engineering'),('CAD','Engineering'),('Public Speaking','Professional'),('Research Writing','Research')
on conflict(name) do nothing;
insert into public.achievements(code,title,description,icon) values
('first_help','First Bridge','Complete your first peer-learning session','bridge'),
('teacher_5','Campus Mentor','Teach five completed sessions','school'),
('verified_skill','Verified Skill','Pass a server-scored skill verification','verified')
on conflict(code) do nothing;


-- =========================================
-- MIGRATION: 004_hardening.sql
-- =========================================

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
drop policy if exists settings_self on public.user_settings;
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


-- =========================================
-- MIGRATION: 004_transactions.sql
-- =========================================

-- 004_transactions.sql

-- 1. Idempotency Constraint on points_ledger
ALTER TABLE public.points_ledger 
ADD CONSTRAINT points_ledger_unique_event UNIQUE (user_id, event_type, reference_type, reference_id);

-- 2. Transaction for accepting a teaching request
CREATE OR REPLACE FUNCTION accept_teaching_request(
    p_room_id uuid,
    p_request_id uuid,
    p_volunteer_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Update the teaching request status
    UPDATE public.teaching_requests
    SET status = 'accepted', decided_at = now()
    WHERE id = p_request_id AND room_id = p_room_id;

    -- Upsert the room_members role to 'teacher'
    INSERT INTO public.room_members (room_id, user_id, role)
    VALUES (p_room_id, p_volunteer_id, 'teacher')
    ON CONFLICT (room_id, user_id) 
    DO UPDATE SET role = 'teacher';
END;
$$;

-- 3. Transaction for blocking a user
CREATE OR REPLACE FUNCTION block_user_atomic(
    p_blocker_id uuid,
    p_blocked_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Insert into blocks
    INSERT INTO public.blocks (blocker_id, blocked_id)
    VALUES (p_blocker_id, p_blocked_id)
    ON CONFLICT (blocker_id, blocked_id) DO NOTHING;

    -- Delete connections between the two users
    DELETE FROM public.connections
    WHERE (user_a = p_blocker_id AND user_b = p_blocked_id)
       OR (user_a = p_blocked_id AND user_b = p_blocker_id);

    -- Delete pending connection requests between the two users
    DELETE FROM public.connection_requests
    WHERE (requester_id = p_blocker_id AND recipient_id = p_blocked_id)
       OR (requester_id = p_blocked_id AND recipient_id = p_blocker_id);
END;
$$;

-- 4. Transaction for submitting a review and awarding reputation
CREATE OR REPLACE FUNCTION submit_review_atomic(
    p_reviewer_id uuid,
    p_reviewee_id uuid,
    p_session_id uuid,
    p_rating int,
    p_comment text,
    p_points_awarded int
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_review_id uuid;
BEGIN
    -- Insert the review
    INSERT INTO public.reviews (session_id, reviewer_id, reviewee_id, rating, comment)
    VALUES (p_session_id, p_reviewer_id, p_reviewee_id, p_rating, p_comment)
    RETURNING id INTO v_review_id;

    -- If points should be awarded, add to ledger. 
    -- The unique constraint will prevent duplicate awards for the same session/reviewee.
    IF p_points_awarded <> 0 THEN
        INSERT INTO public.points_ledger (user_id, event_type, points, reference_type, reference_id)
        VALUES (p_reviewee_id, 'received_review', p_points_awarded, 'session', p_session_id)
        ON CONFLICT ON CONSTRAINT points_ledger_unique_event DO NOTHING;

        -- Update the materialized reputation on the profile
        -- Note: in a high-scale environment this would be done via triggers or batch jobs
        UPDATE public.profiles
        SET reputation = reputation + p_points_awarded
        WHERE id = p_reviewee_id;
    END IF;

    RETURN v_review_id;
END;
$$;


-- =========================================
-- MIGRATION: 005_rpc_security_hardening.sql
-- =========================================

-- 005_rpc_security_hardening.sql

-- 1. REVOKE EXECUTE FROM PUBLIC on Backend-only functions
REVOKE EXECUTE ON FUNCTION public.recompute_reputation(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_reputation(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.block_user_atomic(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.block_user_atomic(uuid, uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.submit_review_atomic(uuid, uuid, uuid, int, text, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_review_atomic(uuid, uuid, uuid, int, text, int) TO service_role;

REVOKE EXECUTE ON FUNCTION public.accept_teaching_request(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_teaching_request(uuid, uuid, uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.find_dm_conversation(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_dm_conversation(uuid, uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.recommend_people(uuid, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recommend_people(uuid, int) TO service_role;

REVOKE EXECUTE ON FUNCTION public.suggest_connections(uuid, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.suggest_connections(uuid, int) TO service_role;

REVOKE EXECUTE ON FUNCTION public.mutual_connection_count(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mutual_connection_count(uuid, uuid) TO service_role;


-- 2. Harden accept_teaching_request by dropping p_volunteer_id and reading from DB
-- First, drop the old function to avoid overload conflicts if signature changes
DROP FUNCTION IF EXISTS public.accept_teaching_request(uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION public.accept_teaching_request(
    p_room_id uuid,
    p_request_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_volunteer_id uuid;
BEGIN
    -- Read volunteer_id with row-level lock
    SELECT volunteer_id INTO v_volunteer_id
    FROM public.teaching_requests
    WHERE id = p_request_id 
      AND room_id = p_room_id 
      AND status = 'pending'
    FOR UPDATE;

    IF v_volunteer_id IS NULL THEN
        RAISE EXCEPTION 'Teaching request not found or already decided';
    END IF;

    -- Update the teaching request status
    UPDATE public.teaching_requests
    SET status = 'accepted', decided_at = now()
    WHERE id = p_request_id;

    -- Upsert the room_members role to 'teacher'
    INSERT INTO public.room_members (room_id, user_id, role)
    VALUES (p_room_id, v_volunteer_id, 'teacher')
    ON CONFLICT (room_id, user_id) 
    DO UPDATE SET role = 'teacher';
END;
$$;

-- Secure the new accept_teaching_request
REVOKE EXECUTE ON FUNCTION public.accept_teaching_request(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_teaching_request(uuid, uuid) TO service_role;


-- 3. Redefine submit_review_atomic to remove duplicate reputation points update
CREATE OR REPLACE FUNCTION submit_review_atomic(
    p_reviewer_id uuid,
    p_reviewee_id uuid,
    p_session_id uuid,
    p_rating int,
    p_comment text,
    p_points_awarded int
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_review_id uuid;
BEGIN
    -- Insert the review
    INSERT INTO public.reviews (session_id, reviewer_id, reviewee_id, rating, comment)
    VALUES (p_session_id, p_reviewer_id, p_reviewee_id, p_rating, p_comment)
    RETURNING id INTO v_review_id;

    -- If points should be awarded, add to ledger. 
    -- The unique constraint will prevent duplicate awards for the same session/reviewee.
    IF p_points_awarded <> 0 THEN
        INSERT INTO public.points_ledger (user_id, event_type, points, reference_type, reference_id)
        VALUES (p_reviewee_id, 'received_review', p_points_awarded, 'session', p_session_id)
        ON CONFLICT ON CONSTRAINT points_ledger_unique_event DO NOTHING;
        
        -- REMOVED: UPDATE public.profiles SET reputation = reputation + p_points_awarded ...
        -- This is now exclusively handled by the `points_after_change` trigger to prevent double-counting.
    END IF;

    RETURN v_review_id;
END;
$$;


-- =========================================
-- MIGRATION: 006_room_transactions.sql
-- =========================================

-- 006_room_transactions.sql

-- 1. create_room_atomic
CREATE OR REPLACE FUNCTION public.create_room_atomic(
    p_title text,
    p_description text,
    p_visibility text,
    p_capacity int,
    p_rules text,
    p_tags text[],
    p_owner_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_conversation_id uuid;
    v_room_id uuid;
BEGIN
    -- Create conversation
    INSERT INTO public.conversations (kind, title, created_by)
    VALUES ('room', p_title, p_owner_id)
    RETURNING id INTO v_conversation_id;

    -- Create room
    INSERT INTO public.rooms (
        title, description, visibility, capacity, rules, tags, 
        owner_id, conversation_id, member_count
    )
    VALUES (
        p_title, p_description, p_visibility::public.room_visibility, p_capacity, p_rules, p_tags, 
        p_owner_id, v_conversation_id, 1
    )
    RETURNING id INTO v_room_id;

    -- Add owner to room_members
    INSERT INTO public.room_members (room_id, user_id, role)
    VALUES (v_room_id, p_owner_id, 'owner');

    -- Add owner to conversation_members
    INSERT INTO public.conversation_members (conversation_id, user_id, role)
    VALUES (v_conversation_id, p_owner_id, 'owner');

    RETURN v_room_id;
EXCEPTION WHEN OTHERS THEN
    -- Transaction implicitly rolls back
    RAISE;
END;
$$;

-- Secure create_room_atomic
REVOKE EXECUTE ON FUNCTION public.create_room_atomic(text, text, text, int, text, text[], uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_room_atomic(text, text, text, int, text, text[], uuid) TO service_role;


-- 2. Modify join_room_atomic to use auth.uid() and handle conversation_members
DROP FUNCTION IF EXISTS public.join_room_atomic(uuid, uuid);

CREATE OR REPLACE FUNCTION public.join_room_atomic(
    p_room_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    r public.rooms;
    existing boolean;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT * INTO r FROM public.rooms WHERE id = p_room_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Room not found'; END IF;
    IF r.status NOT IN ('open','scheduled','live') THEN RAISE EXCEPTION 'Room closed'; END IF;
    
    SELECT EXISTS(SELECT 1 FROM public.room_members WHERE room_id = p_room_id AND user_id = v_user_id) INTO existing;
    IF existing THEN 
        RETURN jsonb_build_object('already_member', true, 'member_count', r.member_count); 
    END IF;
    
    IF r.member_count >= r.capacity THEN RAISE EXCEPTION 'Room full'; END IF;
    IF r.visibility = 'invite_only' THEN RAISE EXCEPTION 'Invite required'; END IF;
    
    -- Insert into room_members
    INSERT INTO public.room_members(room_id, user_id, role) 
    VALUES (p_room_id, v_user_id, 'member');

    -- Upsert into conversation_members
    INSERT INTO public.conversation_members(conversation_id, user_id, role)
    VALUES (r.conversation_id, v_user_id, 'member')
    ON CONFLICT (conversation_id, user_id) DO NOTHING;
    
    UPDATE public.rooms SET member_count = member_count + 1, updated_at = now() WHERE id = p_room_id;
    RETURN jsonb_build_object('joined', true, 'member_count', r.member_count + 1);
END;
$$;

-- Secure join_room_atomic (client-callable)
GRANT EXECUTE ON FUNCTION public.join_room_atomic(uuid) TO authenticated;


-- 3. create leave_room_atomic
CREATE OR REPLACE FUNCTION public.leave_room_atomic(
    p_room_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    r public.rooms;
    v_role text;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT * INTO r FROM public.rooms WHERE id = p_room_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Room not found'; END IF;

    SELECT role INTO v_role FROM public.room_members WHERE room_id = p_room_id AND user_id = v_user_id;
    IF NOT FOUND THEN 
        RETURN jsonb_build_object('already_left', true, 'member_count', r.member_count); 
    END IF;

    IF v_role = 'owner' THEN
        RAISE EXCEPTION 'Owner cannot simply leave. Must transfer ownership or archive/delete room.';
    END IF;

    -- Remove room membership
    DELETE FROM public.room_members WHERE room_id = p_room_id AND user_id = v_user_id;
    
    -- Remove conversation membership
    DELETE FROM public.conversation_members WHERE conversation_id = r.conversation_id AND user_id = v_user_id;

    -- Decrement member count safely
    UPDATE public.rooms 
    SET member_count = GREATEST(0, member_count - 1), updated_at = now() 
    WHERE id = p_room_id;

    RETURN jsonb_build_object('left', true, 'member_count', GREATEST(0, r.member_count - 1));
END;
$$;

-- Secure leave_room_atomic (client-callable)
GRANT EXECUTE ON FUNCTION public.leave_room_atomic(uuid) TO authenticated;


-- =========================================
-- MIGRATION: 007_phase12_final_fixes.sql
-- =========================================

-- 007_phase12_final_fixes.sql

-- A. Account Deactivation Semantics
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_account_status_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_account_status_check CHECK (account_status in ('active','deactivated','suspended','banned'));

-- B. Block Transaction Security
CREATE OR REPLACE FUNCTION public.block_user_atomic(
    p_blocker_id uuid,
    p_blocked_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF p_blocker_id = p_blocked_id THEN
        RAISE EXCEPTION 'Cannot block yourself';
    END IF;

    -- Insert block
    INSERT INTO public.blocks(blocker_id, blocked_id)
    VALUES (p_blocker_id, p_blocked_id)
    ON CONFLICT DO NOTHING;

    -- Delete connections between these two users
    DELETE FROM public.connections
    WHERE (user_a = p_blocker_id AND user_b = p_blocked_id)
       OR (user_a = p_blocked_id AND user_b = p_blocker_id);

    -- Delete pending requests between these two users
    DELETE FROM public.connection_requests
    WHERE (requester_id = p_blocker_id AND recipient_id = p_blocked_id)
       OR (requester_id = p_blocked_id AND recipient_id = p_blocker_id);
END;
$$;

REVOKE ALL ON FUNCTION public.block_user_atomic(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.block_user_atomic(uuid, uuid) TO service_role;


-- C. Review Transaction Validation
-- Drop previous versions with different signatures
DROP FUNCTION IF EXISTS public.submit_review_atomic(uuid, uuid, uuid, int, text, int);

CREATE OR REPLACE FUNCTION public.submit_review_atomic(
    p_reviewer_id uuid,
    p_reviewee_id uuid,
    p_session_id uuid,
    p_rating int,
    p_comment text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_review_id uuid;
    v_session public.sessions;
    v_reviewer_part boolean;
    v_reviewee_part boolean;
BEGIN
    IF p_reviewer_id = p_reviewee_id THEN
        RAISE EXCEPTION 'Reviewer cannot be the same as reviewee';
    END IF;

    SELECT * INTO v_session FROM public.sessions WHERE id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Session not found'; END IF;
    IF v_session.status <> 'completed' THEN RAISE EXCEPTION 'Session is not completed'; END IF;

    -- Check participation
    SELECT EXISTS(SELECT 1 FROM public.session_participants WHERE session_id = p_session_id AND user_id = p_reviewer_id AND attendance_status = 'attended') OR v_session.teacher_id = p_reviewer_id INTO v_reviewer_part;
    IF NOT v_reviewer_part THEN RAISE EXCEPTION 'Reviewer did not participate in this session'; END IF;

    SELECT EXISTS(SELECT 1 FROM public.session_participants WHERE session_id = p_session_id AND user_id = p_reviewee_id) OR v_session.teacher_id = p_reviewee_id INTO v_reviewee_part;
    IF NOT v_reviewee_part THEN RAISE EXCEPTION 'Reviewee did not participate in this session'; END IF;

    -- Insert the review
    INSERT INTO public.reviews (session_id, reviewer_id, reviewee_id, rating, comment)
    VALUES (p_session_id, p_reviewer_id, p_reviewee_id, p_rating, p_comment)
    RETURNING id INTO v_review_id;

    -- Calculate reward inside trusted backend (e.g. 5 points per review received)
    INSERT INTO public.points_ledger (user_id, event_type, points, reference_type, reference_id)
    VALUES (p_reviewee_id, 'received_review', 5, 'session', p_session_id)
    ON CONFLICT ON CONSTRAINT points_ledger_unique_event DO NOTHING;

    RETURN v_review_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_review_atomic(uuid, uuid, uuid, int, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_review_atomic(uuid, uuid, uuid, int, text) TO service_role;


-- D. Secure other functions properly with SET search_path = public and REVOKE ALL

-- create_room_atomic
CREATE OR REPLACE FUNCTION public.create_room_atomic(
    p_title text,
    p_description text,
    p_visibility text,
    p_capacity int,
    p_rules text,
    p_tags text[],
    p_owner_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_conversation_id uuid;
    v_room_id uuid;
BEGIN
    INSERT INTO public.conversations (kind, title, created_by)
    VALUES ('room', p_title, p_owner_id)
    RETURNING id INTO v_conversation_id;

    INSERT INTO public.rooms (
        title, description, visibility, capacity, rules, tags, 
        owner_id, conversation_id, member_count
    )
    VALUES (
        p_title, p_description, p_visibility::public.room_visibility, p_capacity, p_rules, p_tags, 
        p_owner_id, v_conversation_id, 1
    )
    RETURNING id INTO v_room_id;

    INSERT INTO public.room_members (room_id, user_id, role)
    VALUES (v_room_id, p_owner_id, 'owner');

    INSERT INTO public.conversation_members (conversation_id, user_id, role)
    VALUES (v_conversation_id, p_owner_id, 'owner');

    RETURN v_room_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_room_atomic(text, text, text, int, text, text[], uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_room_atomic(text, text, text, int, text, text[], uuid) TO service_role;


-- accept_teaching_request
CREATE OR REPLACE FUNCTION public.accept_teaching_request(
    p_room_id uuid,
    p_request_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_volunteer_id uuid;
BEGIN
    SELECT volunteer_id INTO v_volunteer_id
    FROM public.teaching_requests
    WHERE id = p_request_id 
      AND room_id = p_room_id 
      AND status = 'pending'
    FOR UPDATE;

    IF v_volunteer_id IS NULL THEN
        RAISE EXCEPTION 'Teaching request not found or already decided';
    END IF;

    UPDATE public.teaching_requests
    SET status = 'accepted', decided_at = now()
    WHERE id = p_request_id;

    INSERT INTO public.room_members (room_id, user_id, role)
    VALUES (p_room_id, v_volunteer_id, 'teacher')
    ON CONFLICT (room_id, user_id) 
    DO UPDATE SET role = 'teacher';
END;
$$;

REVOKE ALL ON FUNCTION public.accept_teaching_request(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_teaching_request(uuid, uuid) TO service_role;


-- E. Client-callable atomic room joins and leaves
-- join_room_atomic
CREATE OR REPLACE FUNCTION public.join_room_atomic(
    p_room_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    r public.rooms;
    existing boolean;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT * INTO r FROM public.rooms WHERE id = p_room_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Room not found'; END IF;
    IF r.status NOT IN ('open','scheduled','live') THEN RAISE EXCEPTION 'Room closed'; END IF;
    
    SELECT EXISTS(SELECT 1 FROM public.room_members WHERE room_id = p_room_id AND user_id = v_user_id) INTO existing;
    IF existing THEN 
        RETURN jsonb_build_object('already_member', true, 'member_count', r.member_count); 
    END IF;
    
    IF r.member_count >= r.capacity THEN RAISE EXCEPTION 'Room full'; END IF;
    IF r.visibility = 'invite_only' THEN RAISE EXCEPTION 'Invite required'; END IF;
    
    INSERT INTO public.room_members(room_id, user_id, role) 
    VALUES (p_room_id, v_user_id, 'member');

    INSERT INTO public.conversation_members(conversation_id, user_id, role)
    VALUES (r.conversation_id, v_user_id, 'member')
    ON CONFLICT (conversation_id, user_id) DO NOTHING;
    
    UPDATE public.rooms SET member_count = member_count + 1, updated_at = now() WHERE id = p_room_id;
    RETURN jsonb_build_object('joined', true, 'member_count', r.member_count + 1);
END;
$$;

-- leave_room_atomic
CREATE OR REPLACE FUNCTION public.leave_room_atomic(
    p_room_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    r public.rooms;
    v_role text;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT * INTO r FROM public.rooms WHERE id = p_room_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Room not found'; END IF;

    SELECT role INTO v_role FROM public.room_members WHERE room_id = p_room_id AND user_id = v_user_id;
    IF NOT FOUND THEN 
        RETURN jsonb_build_object('already_left', true, 'member_count', r.member_count); 
    END IF;

    IF v_role = 'owner' THEN
        RAISE EXCEPTION 'Owner cannot simply leave. Must transfer ownership or archive/delete room.';
    END IF;

    DELETE FROM public.room_members WHERE room_id = p_room_id AND user_id = v_user_id;
    DELETE FROM public.conversation_members WHERE conversation_id = r.conversation_id AND user_id = v_user_id;

    UPDATE public.rooms 
    SET member_count = GREATEST(0, member_count - 1), updated_at = now() 
    WHERE id = p_room_id;

    RETURN jsonb_build_object('left', true, 'member_count', GREATEST(0, r.member_count - 1));
END;
$$;


-- =========================================
-- MIGRATION: 008_phase_2_realtime.sql
-- =========================================

-- Phase 2 Realtime Schema Migrations

-- 1. Idempotency and Reference for Messages
ALTER TABLE messages
ADD COLUMN IF NOT EXISTS client_message_id UUID,
ADD COLUMN IF NOT EXISTS reply_to_message_id UUID REFERENCES messages(id) ON DELETE SET NULL;

-- Make client_message_id unique per sender to prevent duplicate sends on retry
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_client_message_id_sender_id_key;
ALTER TABLE messages ADD CONSTRAINT messages_client_message_id_sender_id_key UNIQUE (sender_id, client_message_id);

-- 2. Message Reactions
CREATE TABLE IF NOT EXISTS message_reactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    reaction TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (message_id, user_id, reaction)
);

ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can see reactions in their conversations"
ON message_reactions FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM messages m
        JOIN conversation_members cm ON cm.conversation_id = m.conversation_id
        WHERE m.id = message_reactions.message_id
        AND cm.user_id = auth.uid()
    )
);

-- Note: In this architecture, all inserts to message_reactions will be handled via RPC or backend API to ensure strict validation.

-- 3. Notification Preferences
CREATE TABLE IF NOT EXISTS notification_preferences (
    user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    messages BOOLEAN NOT NULL DEFAULT true,
    connections BOOLEAN NOT NULL DEFAULT true,
    rooms BOOLEAN NOT NULL DEFAULT true,
    sessions BOOLEAN NOT NULL DEFAULT true,
    teaching BOOLEAN NOT NULL DEFAULT true,
    system BOOLEAN NOT NULL DEFAULT true,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own notification preferences"
ON notification_preferences FOR SELECT
USING (auth.uid() = user_id);

-- 4. LiveKit Attendance
CREATE TABLE IF NOT EXISTS livekit_attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    left_at TIMESTAMPTZ,
    duration_seconds INTEGER DEFAULT 0
);

ALTER TABLE livekit_attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view attendance for their sessions"
ON livekit_attendance FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM sessions s
        JOIN room_members rm ON rm.room_id = s.room_id
        WHERE s.id = livekit_attendance.session_id
        AND rm.user_id = auth.uid()
    )
);


-- =========================================
-- MIGRATION: 009_phase_2_1_completion.sql
-- =========================================

-- Phase 2.1 Schema Additions

-- 1. Push Tokens enhancements
-- Current table is:
-- create table public.device_tokens (
--   user_id uuid references public.profiles(id) on delete cascade not null,
--   token text not null,
--   token_fingerprint text not null,
--   platform text,
--   enabled boolean default true,
--   last_seen_at timestamptz default now(),
--   created_at timestamptz default now(),
--   primary key (user_id, token_fingerprint)
-- );

ALTER TABLE public.device_tokens 
ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'expo',
ADD COLUMN IF NOT EXISTS device_id TEXT,
ADD COLUMN IF NOT EXISTS app_version TEXT;

-- 2. Message Delivery States
ALTER TABLE public.messages
ADD COLUMN IF NOT EXISTS delivery_status TEXT DEFAULT 'sent',
ADD COLUMN IF NOT EXISTS soft_deleted BOOLEAN DEFAULT false;

-- 3. Conversation Read State (Scalable)
ALTER TABLE public.conversation_members
ADD COLUMN IF NOT EXISTS last_read_message_id UUID REFERENCES messages(id) ON DELETE SET NULL;

-- 4. Push Receipts Table
CREATE TABLE IF NOT EXISTS public.push_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id TEXT NOT NULL,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    device_token TEXT NOT NULL,
    status TEXT NOT NULL, -- 'pending', 'delivered', 'error'
    error_details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.push_receipts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS push_receipts_service_role ON public.push_receipts;
CREATE POLICY push_receipts_service_role ON public.push_receipts TO service_role USING (true) WITH CHECK (true);

-- Note: No RLS needed for push_receipts since it's backend-only

-- 5. Add idempotency and soft-delete policies for messages
DROP POLICY IF EXISTS "Users can read conversation messages" ON messages;
CREATE POLICY "Users can read conversation messages"
ON messages FOR SELECT
USING (
    soft_deleted = false AND
    EXISTS (
        SELECT 1 FROM conversation_members cm 
        WHERE cm.conversation_id = messages.conversation_id 
        AND cm.user_id = auth.uid()
    )
);

-- Allow senders to see their soft_deleted messages (to show "Message deleted")
CREATE POLICY "Senders can see their soft_deleted messages"
ON messages FOR SELECT
USING (
    soft_deleted = true AND sender_id = auth.uid()
);


-- =========================================
-- MIGRATION: 010_critical_security_consistency.sql
-- =========================================

-- 010_critical_security_consistency.sql

ALTER TABLE public.rooms
ADD COLUMN IF NOT EXISTS rules text NOT NULL DEFAULT '';

REVOKE UPDATE ON TABLE public.profiles FROM authenticated;

GRANT UPDATE (
  full_name,
  username,
  avatar_url,
  bio,
  university,
  department,
  batch,
  research_interests,
  profile_visibility,
  updated_at
) ON TABLE public.profiles TO authenticated;

CREATE UNIQUE INDEX IF NOT EXISTS livekit_attendance_one_open_segment
ON public.livekit_attendance(session_id,user_id)
WHERE left_at IS NULL;

CREATE OR REPLACE FUNCTION public.record_livekit_join(
  p_session_id uuid,
  p_user_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
BEGIN
  INSERT INTO public.livekit_attendance(session_id,user_id,joined_at)
  SELECT p_session_id,p_user_id,now()
  WHERE NOT EXISTS(
    SELECT 1 FROM public.livekit_attendance
    WHERE session_id=p_session_id
      AND user_id=p_user_id
      AND left_at IS NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.record_livekit_leave(
  p_session_id uuid,
  p_user_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE
  v_id uuid;
  v_joined timestamptz;
BEGIN
  SELECT id,joined_at INTO v_id,v_joined
  FROM public.livekit_attendance
  WHERE session_id=p_session_id
    AND user_id=p_user_id
    AND left_at IS NULL
  ORDER BY joined_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_id IS NULL THEN RETURN; END IF;

  UPDATE public.livekit_attendance
  SET left_at=now(),
      duration_seconds=GREATEST(
        0,
        FLOOR(EXTRACT(EPOCH FROM(now()-v_joined)))::int
      )
  WHERE id=v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_livekit_join(uuid,uuid)
FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.record_livekit_leave(uuid,uuid)
FROM PUBLIC,anon,authenticated;

GRANT EXECUTE ON FUNCTION public.record_livekit_join(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_livekit_leave(uuid,uuid) TO service_role;

CREATE TABLE IF NOT EXISTS public.message_delivery_receipts (
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  delivered_at timestamptz,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(message_id,user_id)
);

ALTER TABLE public.message_delivery_receipts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS message_delivery_receipts_self_read
ON public.message_delivery_receipts;

drop policy if exists message_delivery_receipts_self_read on public.message_delivery_receipts;
CREATE POLICY message_delivery_receipts_self_read
ON public.message_delivery_receipts
FOR SELECT
USING(user_id=auth.uid());

REVOKE INSERT,UPDATE,DELETE
ON TABLE public.message_delivery_receipts
FROM anon,authenticated;

-- RBAC Tables
CREATE TABLE IF NOT EXISTS public.admin_roles (
    id text PRIMARY KEY,
    description text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.admin_permissions (
    id text PRIMARY KEY,
    description text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.admin_role_permissions (
    role_id text NOT NULL REFERENCES public.admin_roles(id) ON DELETE CASCADE,
    permission_id text NOT NULL REFERENCES public.admin_permissions(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS public.admin_assignments (
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role_id text NOT NULL REFERENCES public.admin_roles(id) ON DELETE CASCADE,
    assigned_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(user_id, role_id)
);

-- Basic Seed for RBAC
INSERT INTO public.admin_roles (id, description) VALUES
('SUPER_ADMIN', 'Super Administrator'),
('PLATFORM_ADMIN', 'Platform Administrator'),
('SECURITY_ADMIN', 'Security Administrator'),
('SUPPORT_MANAGER', 'Support Manager'),
('SUPPORT_AGENT', 'Support Agent'),
('MODERATION_MANAGER', 'Moderation Manager'),
('MODERATOR', 'Moderator'),
('CONTENT_MANAGER', 'Content Manager'),
('INSTITUTION_MANAGER', 'Institution Manager'),
('DATABASE_OPERATOR', 'Database Operator'),
('API_OPERATOR', 'API Operator'),
('ANALYST', 'Analyst'),
('AUDITOR', 'Auditor'),
('READ_ONLY_ADMIN', 'Read-Only Admin')
ON CONFLICT (id) DO NOTHING;

-- RLS for RBAC Tables
ALTER TABLE public.admin_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_assignments ENABLE ROW LEVEL SECURITY;

drop policy if exists admin_roles_read on public.admin_roles;
CREATE POLICY admin_roles_read ON public.admin_roles FOR SELECT USING (true);
drop policy if exists admin_permissions_read on public.admin_permissions;
CREATE POLICY admin_permissions_read ON public.admin_permissions FOR SELECT USING (true);
drop policy if exists admin_role_permissions_read on public.admin_role_permissions;
CREATE POLICY admin_role_permissions_read ON public.admin_role_permissions FOR SELECT USING (true);
drop policy if exists admin_assignments_read on public.admin_assignments;
CREATE POLICY admin_assignments_read ON public.admin_assignments FOR SELECT USING (true);

REVOKE ALL ON TABLE public.admin_roles FROM anon,authenticated;
REVOKE ALL ON TABLE public.admin_permissions FROM anon,authenticated;
REVOKE ALL ON TABLE public.admin_role_permissions FROM anon,authenticated;
REVOKE ALL ON TABLE public.admin_assignments FROM anon,authenticated;
GRANT SELECT ON TABLE public.admin_roles TO authenticated;
GRANT SELECT ON TABLE public.admin_permissions TO authenticated;
GRANT SELECT ON TABLE public.admin_role_permissions TO authenticated;
GRANT SELECT ON TABLE public.admin_assignments TO authenticated;


-- =========================================
-- MIGRATION: 011_product_features.sql
-- =========================================

-- 011_product_features.sql

-- 12. Search Upgrade (deterministic FTS via RPC or views, wait, we can do FTS in backend query with `to_tsvector` or just create indexes)
-- Let's just create an RPC for unified search or create indexes for it.
-- Actually, the backend can just use `.textSearch()` from Supabase, which uses `@@ to_tsquery`.
-- We should add tsvector indexes to tables to support it efficiently.

-- Indexes for profiles FTS
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS fts tsvector GENERATED ALWAYS AS (
  to_tsvector('english', coalesce(full_name, '') || ' ' || coalesce(username, '') || ' ' || coalesce(bio, ''))
) STORED;
CREATE INDEX IF NOT EXISTS profiles_fts_idx ON public.profiles USING GIN (fts);

-- Indexes for rooms FTS
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS fts tsvector GENERATED ALWAYS AS (
  to_tsvector('english', coalesce(title, '') || ' ' || coalesce(topic, '') || ' ' || coalesce(description, ''))
) STORED;
CREATE INDEX IF NOT EXISTS rooms_fts_idx ON public.rooms USING GIN (fts);

-- Indexes for events FTS
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS fts tsvector GENERATED ALWAYS AS (
  to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, ''))
) STORED;
CREATE INDEX IF NOT EXISTS events_fts_idx ON public.events USING GIN (fts);

-- Indexes for skills FTS
ALTER TABLE public.skills ADD COLUMN IF NOT EXISTS fts tsvector GENERATED ALWAYS AS (
  to_tsvector('english', coalesce(name, ''))
) STORED;
CREATE INDEX IF NOT EXISTS skills_fts_idx ON public.skills USING GIN (fts);

-- Indexes for clubs FTS
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS fts tsvector GENERATED ALWAYS AS (
  to_tsvector('english', coalesce(name, '') || ' ' || coalesce(description, ''))
) STORED;
CREATE INDEX IF NOT EXISTS clubs_fts_idx ON public.clubs USING GIN (fts);

-- Indexes for research_projects FTS
ALTER TABLE public.research_projects ADD COLUMN IF NOT EXISTS fts tsvector GENERATED ALWAYS AS (
  to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, ''))
) STORED;
CREATE INDEX IF NOT EXISTS research_fts_idx ON public.research_projects USING GIN (fts);

ALTER TABLE public.resources ADD COLUMN IF NOT EXISTS description text;
-- Indexes for resources FTS
ALTER TABLE public.resources ADD COLUMN IF NOT EXISTS fts tsvector GENERATED ALWAYS AS (
  to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, ''))
) STORED;
CREATE INDEX IF NOT EXISTS resources_fts_idx ON public.resources USING GIN (fts);

-- 13. Event Capacity Transaction
CREATE OR REPLACE FUNCTION public.decide_event_application_atomic(
    p_application_id uuid,
    p_decision text, -- 'approved', 'rejected', 'waitlisted'
    p_reviewer_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_event_id uuid;
    v_capacity int;
    v_approved_count int;
    v_current_status text;
BEGIN
    IF p_decision NOT IN ('approved', 'rejected', 'waitlisted') THEN
        RAISE EXCEPTION 'Invalid decision';
    END IF;

    -- Lock the event row via application
    SELECT e.id, e.capacity, a.status 
    INTO v_event_id, v_capacity, v_current_status
    FROM public.event_applications a
    JOIN public.events e ON e.id = a.event_id
    WHERE a.id = p_application_id
    FOR UPDATE OF e;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Application not found';
    END IF;

    IF v_current_status != 'pending' AND v_current_status != 'waitlisted' THEN
        RAISE EXCEPTION 'Application is already processed';
    END IF;

    IF p_decision = 'approved' THEN
        -- Check current approved count
        SELECT COUNT(*) INTO v_approved_count
        FROM public.event_applications
        WHERE event_id = v_event_id AND status = 'approved';

        IF v_approved_count >= v_capacity THEN
            -- Cannot approve, fallback to waitlisted if they tried to approve?
            -- Or just raise an error
            RAISE EXCEPTION 'Event capacity reached';
        END IF;
    END IF;

    UPDATE public.event_applications
    SET status = p_decision,
        updated_at = now()
    WHERE id = p_application_id;

    RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.decide_event_application_atomic(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decide_event_application_atomic(uuid, text, uuid) TO service_role;

-- 14. Club Create Transaction
CREATE OR REPLACE FUNCTION public.create_club_atomic(
    p_name text,
    p_description text,
    p_university text,
    p_owner_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_club_id uuid;
BEGIN
    INSERT INTO public.clubs(name, description, university, created_by)
    VALUES(p_name, p_description, p_university, p_owner_id)
    RETURNING id INTO v_club_id;

    INSERT INTO public.club_members(club_id, user_id, role, status)
    VALUES(v_club_id, p_owner_id, 'owner', 'approved');

    RETURN v_club_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_club_atomic(text, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_club_atomic(text, text, text, uuid) TO service_role;

-- 15. Research / Resources product completion
CREATE TABLE IF NOT EXISTS public.research_members (
  project_id uuid REFERENCES public.research_projects(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'collaborator')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id)
);
ALTER TABLE public.research_members ENABLE ROW LEVEL SECURITY;
drop policy if exists research_members_select on public.research_members;
CREATE POLICY research_members_select ON public.research_members FOR SELECT USING (true);
drop policy if exists research_members_insert on public.research_members;
CREATE POLICY research_members_insert ON public.research_members FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.research_projects WHERE id = project_id AND owner_id = auth.uid())
);
drop policy if exists research_members_delete on public.research_members;
CREATE POLICY research_members_delete ON public.research_members FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.research_projects WHERE id = project_id AND owner_id = auth.uid()) OR auth.uid() = user_id
);

CREATE TABLE IF NOT EXISTS public.saved_research_projects (
  project_id uuid REFERENCES public.research_projects(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  saved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id)
);
ALTER TABLE public.saved_research_projects ENABLE ROW LEVEL SECURITY;
drop policy if exists saved_research_projects_select on public.saved_research_projects;
CREATE POLICY saved_research_projects_select ON public.saved_research_projects FOR SELECT USING (auth.uid() = user_id);
drop policy if exists saved_research_projects_insert on public.saved_research_projects;
CREATE POLICY saved_research_projects_insert ON public.saved_research_projects FOR INSERT WITH CHECK (auth.uid() = user_id);
drop policy if exists saved_research_projects_delete on public.saved_research_projects;
CREATE POLICY saved_research_projects_delete ON public.saved_research_projects FOR DELETE USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.research_publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.research_projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  url text,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.research_publications ENABLE ROW LEVEL SECURITY;
drop policy if exists research_publications_select on public.research_publications;
CREATE POLICY research_publications_select ON public.research_publications FOR SELECT USING (true);
drop policy if exists research_publications_insert on public.research_publications;
CREATE POLICY research_publications_insert ON public.research_publications FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.research_projects WHERE id = project_id AND owner_id = auth.uid())
);
drop policy if exists research_publications_delete on public.research_publications;
CREATE POLICY research_publications_delete ON public.research_publications FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.research_projects WHERE id = project_id AND owner_id = auth.uid())
);


-- =========================================
-- MIGRATION: 012_upgrade_corrections.sql
-- =========================================

-- 012_upgrade_corrections.sql

-- 1. Defensively add the 'rules' column to 'rooms' which was mistakenly edited inline in 001_schema.sql
ALTER TABLE public.rooms ADD COLUMN IF NOT EXISTS rules text not null default '';

-- 2. Apply proper execution privileges to recompute_reputation(uuid)
-- 005_rpc_security_hardening.sql mistakenly used recompute_reputation() without args
REVOKE EXECUTE ON FUNCTION public.recompute_reputation(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_reputation(uuid) TO service_role;

-- Re-affirming block_user_atomic as well (defensive)
REVOKE EXECUTE ON FUNCTION public.block_user_atomic(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.block_user_atomic(uuid, uuid) TO service_role;

-- 3. Update create_room_atomic to include new parameters (topic, mode, campus_location)
-- This was incorrectly inlined into 006_room_transactions.sql and 007_phase12_final_fixes.sql
CREATE OR REPLACE FUNCTION public.create_room_atomic(
    p_title text,
    p_description text,
    p_topic text,
    p_visibility text,
    p_mode text,
    p_capacity int,
    p_rules text,
    p_tags text[],
    p_campus_location text,
    p_owner_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_conversation_id uuid;
    v_room_id uuid;
BEGIN
    IF p_visibility NOT IN ('public','private','invite_only') THEN
        RAISE EXCEPTION 'Invalid room visibility';
    END IF;

    IF p_mode NOT IN ('online','offline','hybrid') THEN
        RAISE EXCEPTION 'Invalid room mode';
    END IF;

    IF p_capacity < 2 OR p_capacity > 250 THEN
        RAISE EXCEPTION 'Invalid room capacity';
    END IF;

    INSERT INTO public.conversations (kind, title, created_by)
    VALUES ('room', p_title, p_owner_id)
    RETURNING id INTO v_conversation_id;

    INSERT INTO public.rooms (
        title, description, topic, visibility, mode, capacity, rules, tags,
        campus_location, owner_id, conversation_id, member_count
    )
    VALUES (
        p_title, p_description, p_topic, p_visibility, p_mode, p_capacity,
        COALESCE(p_rules, ''), COALESCE(p_tags, '{}'), p_campus_location,
        p_owner_id, v_conversation_id, 1
    )
    RETURNING id INTO v_room_id;

    INSERT INTO public.room_members (room_id, user_id, role)
    VALUES (v_room_id, p_owner_id, 'owner');

    INSERT INTO public.conversation_members (conversation_id, user_id, role)
    VALUES (v_conversation_id, p_owner_id, 'owner');

    RETURN v_room_id;
END;
$$;

-- Secure the redefined create_room_atomic
REVOKE ALL ON FUNCTION public.create_room_atomic(
    text, text, text, text, text, int, text, text[], text, uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_room_atomic(
    text, text, text, text, text, int, text, text[], text, uuid
) TO service_role;


-- =========================================
-- MIGRATION: 013_hardening.sql
-- =========================================

-- 013_hardening.sql
-- Ensure all SECURITY DEFINER functions have search_path set to public

DO $$
DECLARE
    rec record;
BEGIN
    FOR rec IN 
        SELECT p.proname, pg_get_function_identity_arguments(p.oid) as args
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' 
        AND p.prosecdef = true 
        AND (p.proconfig IS NULL OR NOT ('search_path=public' = ANY(p.proconfig)))
    LOOP
        EXECUTE 'ALTER FUNCTION public.' || quote_ident(rec.proname) || '(' || rec.args || ') SET search_path = public';
    END LOOP;
END;
$$;


-- =========================================
-- MIGRATION: 014_atomic_room_service_and_membership.sql
-- =========================================

-- Migration 014: Atomic Room Service RPC and Research Members Table
-- Enables secure atomic room joins and leaves with service role support and invite checks

CREATE OR REPLACE FUNCTION public.join_room_service_atomic(
    p_room_id uuid,
    p_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    r public.rooms;
    existing boolean;
    v_invited boolean;
BEGIN
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'User ID required';
    END IF;

    -- Lock room row for update to eliminate concurrency race condition
    SELECT * INTO r FROM public.rooms WHERE id = p_room_id FOR UPDATE;
    IF NOT FOUND THEN 
        RAISE EXCEPTION 'Room not found'; 
    END IF;
    
    IF r.status NOT IN ('open','scheduled','live') THEN 
        RAISE EXCEPTION 'Room is not active'; 
    END IF;
    
    SELECT EXISTS(SELECT 1 FROM public.room_members WHERE room_id = p_room_id AND user_id = p_user_id) INTO existing;
    IF existing THEN 
        RETURN jsonb_build_object('already_member', true, 'member_count', r.member_count); 
    END IF;
    
    IF r.member_count >= r.capacity THEN 
        RAISE EXCEPTION 'Room is at maximum capacity'; 
    END IF;
    
    IF r.visibility = 'private' THEN
        RAISE EXCEPTION 'This room is private';
    END IF;

    IF r.visibility = 'invite_only' THEN
        SELECT EXISTS(
            SELECT 1 FROM public.room_invitations 
            WHERE room_id = p_room_id AND invitee_id = p_user_id AND status = 'accepted'
        ) INTO v_invited;
        IF NOT v_invited THEN
            RAISE EXCEPTION 'This room requires an invitation to join';
        END IF;
    END IF;
    
    INSERT INTO public.room_members(room_id, user_id, role) 
    VALUES (p_room_id, p_user_id, 'learner');

    IF r.conversation_id IS NOT NULL THEN
        INSERT INTO public.conversation_members(conversation_id, user_id, role)
        VALUES (r.conversation_id, p_user_id, 'member')
        ON CONFLICT (conversation_id, user_id) DO NOTHING;
    END IF;
    
    UPDATE public.rooms SET member_count = member_count + 1, updated_at = now() WHERE id = p_room_id;
    RETURN jsonb_build_object('joined', true, 'member_count', r.member_count + 1);
END;
$$;

-- Atomic leave
CREATE OR REPLACE FUNCTION public.leave_room_service_atomic(
    p_room_id uuid,
    p_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    r public.rooms;
BEGIN
    SELECT * INTO r FROM public.rooms WHERE id = p_room_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Room not found'; END IF;
    IF r.owner_id = p_user_id THEN RAISE EXCEPTION 'Room owner cannot leave their own room'; END IF;

    DELETE FROM public.room_members WHERE room_id = p_room_id AND user_id = p_user_id;

    IF r.conversation_id IS NOT NULL THEN
        DELETE FROM public.conversation_members WHERE conversation_id = r.conversation_id AND user_id = p_user_id;
    END IF;

    UPDATE public.rooms SET member_count = GREATEST(1, member_count - 1), updated_at = now() WHERE id = p_room_id;
    RETURN jsonb_build_object('left', true, 'member_count', GREATEST(1, r.member_count - 1));
END;
$$;


-- =========================================
-- MIGRATION: 015_complete_domain_hardening.sql
-- =========================================

-- Migration 015: Complete Domain Hardening & Transactional Guarantees
-- 1. Room Invitations Table with Strict Lifecycle and Uniqueness
-- 2. Corrected join_room_service_atomic (inserts 'member', calculates true capacity, consumes invites)
-- 3. Transactional Admin Mutations (mutate status + audit log in single transaction)
-- 4. Transactional Report Decisions
-- 5. Idempotent Reputation Rewards (points_ledger as single source of truth)
-- 6. Strict Security Definer Permissions (Revoke Public/Anon, Grant Service Role)

-- 1. Create Room Invitations Table
CREATE TABLE IF NOT EXISTS public.room_invitations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
    inviter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    invitee_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
    token_hash text,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'revoked', 'expired', 'consumed')),
    expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    accepted_at timestamptz,
    metadata jsonb DEFAULT '{}'::jsonb,
    CONSTRAINT chk_invitation_target CHECK (invitee_id IS NOT NULL OR token_hash IS NOT NULL),
    CONSTRAINT chk_no_self_invite CHECK (inviter_id != invitee_id)
);

CREATE INDEX IF NOT EXISTS idx_room_invitations_room_id ON public.room_invitations(room_id);
CREATE INDEX IF NOT EXISTS idx_room_invitations_invitee ON public.room_invitations(invitee_id) WHERE status = 'pending';
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_room_invitee ON public.room_invitations(room_id, invitee_id) WHERE status = 'pending';

ALTER TABLE public.room_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS room_invitations_select ON public.room_invitations;
drop policy if exists room_invitations_select on public.room_invitations;
CREATE POLICY room_invitations_select ON public.room_invitations FOR SELECT USING (
    auth.uid() = inviter_id OR auth.uid() = invitee_id OR
    EXISTS (SELECT 1 FROM public.room_members WHERE room_id = room_invitations.room_id AND user_id = auth.uid() AND role IN ('owner', 'moderator'))
);

DROP POLICY IF EXISTS room_invitations_insert ON public.room_invitations;
drop policy if exists room_invitations_insert on public.room_invitations;
CREATE POLICY room_invitations_insert ON public.room_invitations FOR INSERT WITH CHECK (
    auth.uid() = inviter_id AND
    EXISTS (SELECT 1 FROM public.room_members WHERE room_id = room_invitations.room_id AND user_id = auth.uid() AND role IN ('owner', 'moderator'))
);

DROP POLICY IF EXISTS room_invitations_update ON public.room_invitations;
drop policy if exists room_invitations_update on public.room_invitations;
CREATE POLICY room_invitations_update ON public.room_invitations FOR UPDATE USING (
    auth.uid() = invitee_id OR auth.uid() = inviter_id OR
    EXISTS (SELECT 1 FROM public.room_members WHERE room_id = room_invitations.room_id AND user_id = auth.uid() AND role IN ('owner', 'moderator'))
);

-- 2. Hardened Atomic Room Join with Service Role
CREATE OR REPLACE FUNCTION public.join_room_service_atomic(
    p_room_id uuid,
    p_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    r public.rooms;
    v_actual_count integer;
    v_existing boolean;
    v_invite_id uuid;
BEGIN
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'User ID required';
    END IF;

    -- Lock room row for update to eliminate race condition
    SELECT * INTO r FROM public.rooms WHERE id = p_room_id FOR UPDATE;
    IF NOT FOUND THEN 
        RAISE EXCEPTION 'Room not found'; 
    END IF;
    
    IF r.status NOT IN ('open','scheduled','live') THEN 
        RAISE EXCEPTION 'Room is not active'; 
    END IF;
    
    SELECT EXISTS(SELECT 1 FROM public.room_members WHERE room_id = p_room_id AND user_id = p_user_id) INTO v_existing;
    IF v_existing THEN 
        RETURN jsonb_build_object('already_member', true, 'member_count', r.member_count); 
    END IF;
    
    -- Transactional authoritative capacity count
    SELECT COUNT(*) INTO v_actual_count FROM public.room_members WHERE room_id = p_room_id;
    IF v_actual_count >= r.capacity THEN 
        RAISE EXCEPTION 'Room is at maximum capacity'; 
    END IF;
    
    IF r.visibility = 'private' THEN
        RAISE EXCEPTION 'This room is private';
    END IF;

    IF r.visibility = 'invite_only' THEN
        SELECT id INTO v_invite_id FROM public.room_invitations 
        WHERE room_id = p_room_id 
          AND invitee_id = p_user_id 
          AND status IN ('pending', 'accepted')
          AND expires_at > now()
        ORDER BY created_at DESC LIMIT 1;
        
        IF v_invite_id IS NULL THEN
            RAISE EXCEPTION 'This room requires an invitation to join';
        END IF;
        
        -- Consume the invitation
        UPDATE public.room_invitations 
        SET status = 'consumed', accepted_at = now(), updated_at = now() 
        WHERE id = v_invite_id;
    END IF;
    
    -- Insert role as 'member' (valid enum value)
    INSERT INTO public.room_members(room_id, user_id, role) 
    VALUES (p_room_id, p_user_id, 'member');

    IF r.conversation_id IS NOT NULL THEN
        INSERT INTO public.conversation_members(conversation_id, user_id, role)
        VALUES (r.conversation_id, p_user_id, 'member')
        ON CONFLICT (conversation_id, user_id) DO NOTHING;
    END IF;
    
    v_actual_count := v_actual_count + 1;
    UPDATE public.rooms SET member_count = v_actual_count, updated_at = now() WHERE id = p_room_id;
    RETURN jsonb_build_object('joined', true, 'member_count', v_actual_count);
END;
$$;

-- 3. Hardened Atomic Room Leave with Service Role
CREATE OR REPLACE FUNCTION public.leave_room_service_atomic(
    p_room_id uuid,
    p_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    r public.rooms;
    v_actual_count integer;
BEGIN
    SELECT * INTO r FROM public.rooms WHERE id = p_room_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Room not found'; END IF;
    IF r.owner_id = p_user_id THEN 
        RAISE EXCEPTION 'Room owner cannot leave without transferring ownership'; 
    END IF;

    DELETE FROM public.room_members WHERE room_id = p_room_id AND user_id = p_user_id;

    IF r.conversation_id IS NOT NULL THEN
        DELETE FROM public.conversation_members WHERE conversation_id = r.conversation_id AND user_id = p_user_id;
    END IF;

    SELECT COUNT(*) INTO v_actual_count FROM public.room_members WHERE room_id = p_room_id;
    UPDATE public.rooms SET member_count = v_actual_count, updated_at = now() WHERE id = p_room_id;
    RETURN jsonb_build_object('left', true, 'member_count', v_actual_count);
END;
$$;

-- 4. Transactional Admin User Status Mutation
CREATE OR REPLACE FUNCTION public.admin_mutate_user_status_atomic(
    p_admin_id uuid,
    p_target_id uuid,
    p_new_status text,
    p_reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_admin public.profiles;
    v_target public.profiles;
BEGIN
    SELECT * INTO v_admin FROM public.profiles WHERE id = p_admin_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Admin profile not found'; END IF;
    IF NOT ('admin' = ANY(v_admin.roles) OR 'moderator' = ANY(v_admin.roles)) THEN
        RAISE EXCEPTION 'Unauthorized: elevated role required';
    END IF;

    SELECT * INTO v_target FROM public.profiles WHERE id = p_target_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Target user not found'; END IF;

    IF 'admin' = ANY(v_target.roles) AND NOT ('admin' = ANY(v_admin.roles)) THEN
        RAISE EXCEPTION 'Moderators cannot modify administrator accounts';
    END IF;

    IF p_admin_id = p_target_id AND p_new_status != 'active' THEN
        RAISE EXCEPTION 'Cannot suspend or ban your own administrator account';
    END IF;

    UPDATE public.profiles 
    SET account_status = p_new_status, updated_at = now() 
    WHERE id = p_target_id;

    INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, metadata)
    VALUES (
        p_admin_id,
        'moderation.user.status',
        'user',
        p_target_id,
        jsonb_build_object('status', p_new_status, 'previous_status', v_target.account_status, 'reason', p_reason)
    );

    RETURN jsonb_build_object('success', true, 'user_id', p_target_id, 'status', p_new_status);
END;
$$;

-- 5. Transactional Admin Report Decision
CREATE OR REPLACE FUNCTION public.admin_decide_report_atomic(
    p_admin_id uuid,
    p_report_id uuid,
    p_status text,
    p_action text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_admin public.profiles;
    v_report public.reports;
    v_action text;
BEGIN
    SELECT * INTO v_admin FROM public.profiles WHERE id = p_admin_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Admin profile not found'; END IF;
    IF NOT ('admin' = ANY(v_admin.roles) OR 'moderator' = ANY(v_admin.roles)) THEN
        RAISE EXCEPTION 'Unauthorized: elevated role required';
    END IF;

    SELECT * INTO v_report FROM public.reports WHERE id = p_report_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Report not found'; END IF;

    v_action := COALESCE(p_action, 'Report marked ' || p_status);

    UPDATE public.reports
    SET status = p_status,
        action = v_action,
        reviewed_by = p_admin_id,
        reviewed_at = now()
    WHERE id = p_report_id;

    INSERT INTO public.audit_logs (actor_id, action, target_type, target_id, metadata)
    VALUES (
        p_admin_id,
        'moderation.report.update',
        'report',
        p_report_id,
        jsonb_build_object('status', p_status, 'action', v_action)
    );

    RETURN jsonb_build_object('success', true, 'report_id', p_report_id, 'status', p_status, 'action', v_action);
END;
$$;

-- 6. Idempotent Atomic Reputation Award
CREATE OR REPLACE FUNCTION public.award_reputation_atomic(
    p_user_id uuid,
    p_event_type text,
    p_points integer,
    p_reference_type text DEFAULT NULL,
    p_reference_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_existing_id uuid;
    v_new_rep integer;
BEGIN
    IF p_reference_type IS NOT NULL AND p_reference_id IS NOT NULL THEN
        SELECT id INTO v_existing_id 
        FROM public.points_ledger 
        WHERE user_id = p_user_id 
          AND event_type = p_event_type 
          AND reference_type = p_reference_type 
          AND reference_id = p_reference_id;
          
        IF v_existing_id IS NOT NULL THEN
            SELECT reputation INTO v_new_rep FROM public.profiles WHERE id = p_user_id;
            RETURN jsonb_build_object('awarded', false, 'reason', 'already_awarded', 'reputation', v_new_rep);
        END IF;
    END IF;

    INSERT INTO public.points_ledger (user_id, event_type, points, reference_type, reference_id)
    VALUES (p_user_id, p_event_type, p_points, p_reference_type, p_reference_id);

    SELECT COALESCE(SUM(points), 0) INTO v_new_rep 
    FROM public.points_ledger 
    WHERE user_id = p_user_id;

    UPDATE public.profiles 
    SET reputation = GREATEST(0, v_new_rep), updated_at = now() 
    WHERE id = p_user_id;

    RETURN jsonb_build_object('awarded', true, 'points', p_points, 'new_reputation', v_new_rep);
END;
$$;

-- 7. Security Hardening: Revoke from Public and Grant to Service Role
REVOKE ALL ON FUNCTION public.join_room_service_atomic(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.join_room_service_atomic(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.leave_room_service_atomic(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.leave_room_service_atomic(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.admin_mutate_user_status_atomic(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_mutate_user_status_atomic(uuid, uuid, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.admin_decide_report_atomic(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_decide_report_atomic(uuid, uuid, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.award_reputation_atomic(uuid, text, integer, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.award_reputation_atomic(uuid, text, integer, text, uuid) TO service_role;


-- =========================================
-- MIGRATION: 016_experience_expansion.sql
-- =========================================

-- Migration 016: Dynamic Dashboard, Progressive Onboarding, Guided Tour, and Product Experience Expansion
-- Sets up schema for server-driven widgets, user layout preferences, announcements, feature flags, and tour lifecycle.

-- 1. Extend profiles with onboarding, tour, and quiet hours fields
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_version integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS onboarding_status text DEFAULT 'not_started' CHECK (onboarding_status IN ('not_started', 'in_progress', 'completed', 'skipped')),
  ADD COLUMN IF NOT EXISTS onboarding_step text DEFAULT 'language',
  ADD COLUMN IF NOT EXISTS profile_completion_percent integer DEFAULT 0 CHECK (profile_completion_percent BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS profile_missing_fields text[] DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS guided_tour_version integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS guided_tour_status text DEFAULT 'pending' CHECK (guided_tour_status IN ('pending', 'in_progress', 'completed', 'skipped')),
  ADD COLUMN IF NOT EXISTS guided_tour_last_step text DEFAULT 'start',
  ADD COLUMN IF NOT EXISTS preferred_locale text DEFAULT 'en' CHECK (preferred_locale IN ('en', 'bn')),
  ADD COLUMN IF NOT EXISTS quiet_hours_start text DEFAULT '22:00',
  ADD COLUMN IF NOT EXISTS quiet_hours_end text DEFAULT '07:00';

-- 2. Create dashboard_configs table (Admin-configurable server-driven widgets)
CREATE TABLE IF NOT EXISTS public.dashboard_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  widget_key text NOT NULL UNIQUE,
  title_en text NOT NULL,
  title_bn text NOT NULL,
  default_order integer NOT NULL DEFAULT 0,
  is_required boolean DEFAULT false,
  is_enabled boolean DEFAULT true,
  target_roles text[] DEFAULT ARRAY['student', 'tutor', 'moderator', 'admin'],
  target_campus text,
  min_app_version text DEFAULT '2.0.0',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Seed default standard widgets if not present
INSERT INTO public.dashboard_configs (widget_key, title_en, title_bn, default_order, is_required, is_enabled)
VALUES
  ('announcements', 'Announcements', 'ঘোষণা', 1, true, true),
  ('greeting_hero', 'Greeting & Hero', 'শুভেচ্ছা ও হিরো', 2, true, true),
  ('profile_quest', 'Profile Completion Quest', 'প্রোফাইল সম্পূর্ণ করার মিশন', 3, false, true),
  ('momentum_stats', 'Learning Momentum', 'শেখার অগ্রগতি', 4, false, true),
  ('quick_actions', 'Quick Actions', 'দ্রুত অ্যাকশন', 5, false, true),
  ('live_and_upcoming', 'Live & Upcoming Sessions', 'লাইভ ও আসন্ন সেশন', 6, false, true),
  ('urgent_rooms', 'Urgent Study Rooms', 'জরুরি স্টাডি রুম', 7, false, true),
  ('recommended_peers', 'Recommended Peers', 'প্রস্তাবিত সহপাঠী', 8, false, true),
  ('campus_events', 'Campus Events', 'ক্যাম্পাস ইভেন্ট', 9, false, true),
  ('research_opportunities', 'Research Projects', 'গবেষণা প্রকল্প', 10, false, true),
  ('leaderboard_preview', 'Leaderboard Podium', 'লিডারবোর্ড পডিয়াম', 11, false, true)
ON CONFLICT (widget_key) DO NOTHING;

-- 3. Create user_dashboard_layouts table (User personalized layout preferences)
CREATE TABLE IF NOT EXISTS public.user_dashboard_layouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  density text DEFAULT 'comfortable' CHECK (density IN ('compact', 'comfortable', 'spacious')),
  preset text DEFAULT 'balanced' CHECK (preset IN ('learner', 'tutor', 'researcher', 'community', 'balanced', 'custom')),
  widgets jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT user_dashboard_layouts_user_id_key UNIQUE (user_id)
);

-- 4. Create announcements table (Platform service broadcasts)
CREATE TABLE IF NOT EXISTS public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title_en text NOT NULL,
  title_bn text NOT NULL,
  body_en text NOT NULL,
  body_bn text NOT NULL,
  tone text DEFAULT 'info' CHECK (tone IN ('info', 'warning', 'success', 'accent')),
  action_url text,
  action_label_en text,
  action_label_bn text,
  is_active boolean DEFAULT true,
  starts_at timestamptz DEFAULT now(),
  ends_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- 5. Create feature_flags table (Staged rollouts and kill switches)
CREATE TABLE IF NOT EXISTS public.feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  description text,
  is_enabled boolean DEFAULT true,
  rollout_percentage integer DEFAULT 100 CHECK (rollout_percentage BETWEEN 0 AND 100),
  target_roles text[] DEFAULT ARRAY['student', 'tutor', 'moderator', 'admin'],
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 6. Enable RLS on newly created tables
ALTER TABLE public.dashboard_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_dashboard_layouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

-- 7. Define RLS Policies
DROP POLICY IF EXISTS "Anyone can read dashboard configs" ON public.dashboard_configs;
CREATE POLICY "Anyone can read dashboard configs"
  ON public.dashboard_configs FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Users can read own layout" ON public.user_dashboard_layouts;
CREATE POLICY "Users can read own layout"
  ON public.user_dashboard_layouts FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own layout" ON public.user_dashboard_layouts;
CREATE POLICY "Users can update own layout"
  ON public.user_dashboard_layouts FOR ALL
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Anyone can read active announcements" ON public.announcements;
CREATE POLICY "Anyone can read active announcements"
  ON public.announcements FOR SELECT
  USING (is_active = true AND (ends_at IS NULL OR ends_at > now()));

DROP POLICY IF EXISTS "Anyone can read feature flags" ON public.feature_flags;
CREATE POLICY "Anyone can read feature flags"
  ON public.feature_flags FOR SELECT
  USING (true);

-- 8. Atomic Stored Procedures

-- Save/Upsert user dashboard layout
CREATE OR REPLACE FUNCTION public.save_user_dashboard_layout_atomic(
  p_user_id uuid,
  p_preset text,
  p_density text,
  p_widgets jsonb
) RETURNS jsonb AS $$
DECLARE
  v_result jsonb;
BEGIN
  INSERT INTO public.user_dashboard_layouts (user_id, preset, density, widgets, updated_at)
  VALUES (p_user_id, p_preset, p_density, p_widgets, now())
  ON CONFLICT (user_id) DO UPDATE SET
    preset = EXCLUDED.preset,
    density = EXCLUDED.density,
    widgets = EXCLUDED.widgets,
    updated_at = now();

  SELECT jsonb_build_object(
    'user_id', user_id,
    'preset', preset,
    'density', density,
    'widgets', widgets,
    'updated_at', updated_at
  ) INTO v_result
  FROM public.user_dashboard_layouts
  WHERE user_id = p_user_id;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Complete guided tour step & idempotent completion reward
CREATE OR REPLACE FUNCTION public.complete_guided_tour_step_atomic(
  p_user_id uuid,
  p_step text,
  p_is_last boolean
) RETURNS jsonb AS $$
DECLARE
  v_status text;
  v_reward jsonb;
BEGIN
  IF p_is_last THEN
    v_status := 'completed';
    -- Award +5 reputation for completing product tour exactly once
    v_reward := public.award_reputation_atomic(p_user_id, 'tour_completed', 5, 'tour', p_user_id);
  ELSE
    v_status := 'in_progress';
  END IF;

  UPDATE public.profiles
  SET
    guided_tour_last_step = p_step,
    guided_tour_status = v_status,
    updated_at = now()
  WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'step', p_step,
    'status', v_status,
    'reward', v_reward
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Revoke execute from public/anon/authenticated and grant to service_role
REVOKE ALL ON FUNCTION public.save_user_dashboard_layout_atomic(uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_user_dashboard_layout_atomic(uuid, text, text, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.complete_guided_tour_step_atomic(uuid, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_guided_tour_step_atomic(uuid, text, boolean) TO service_role;


-- =========================================
-- MIGRATION: 017_experience_integrity_and_admin_content.sql
-- =========================================

-- 017_experience_integrity_and_admin_content.sql
-- Forward-only corrections for the experience-expansion implementation.

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS study_mode_preference text NOT NULL DEFAULT 'hybrid'
    CHECK (study_mode_preference IN ('online', 'offline', 'hybrid')),
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS onboarding_mission text NOT NULL DEFAULT 'both'
    CHECK (onboarding_mission IN ('learn', 'teach', 'both', 'research')),
  ADD COLUMN IF NOT EXISTS onboarding_push_opt_in boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Asia/Dhaka';

ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS is_dismissible boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS target_roles text[] NOT NULL DEFAULT ARRAY['student', 'tutor', 'peer_tutor', 'club_admin', 'researcher', 'moderator', 'admin']::text[],
  ADD COLUMN IF NOT EXISTS target_campus text;

ALTER TABLE public.dashboard_configs
  ALTER COLUMN target_roles SET DEFAULT ARRAY['student', 'tutor', 'peer_tutor', 'club_admin', 'researcher', 'moderator', 'admin']::text[];
ALTER TABLE public.feature_flags
  ALTER COLUMN target_roles SET DEFAULT ARRAY['student', 'tutor', 'peer_tutor', 'club_admin', 'researcher', 'moderator', 'admin']::text[];
ALTER TABLE public.announcements
  ALTER COLUMN target_roles SET DEFAULT ARRAY['student', 'tutor', 'peer_tutor', 'club_admin', 'researcher', 'moderator', 'admin']::text[];

UPDATE public.dashboard_configs
SET target_roles = coalesce(
  nullif(ARRAY(SELECT role FROM unnest(dashboard_configs.target_roles) AS role WHERE role = ANY(ARRAY['student', 'tutor', 'peer_tutor', 'club_admin', 'researcher', 'moderator', 'admin']::text[])), ARRAY[]::text[]),
  ARRAY['student', 'tutor', 'peer_tutor', 'club_admin', 'researcher', 'moderator', 'admin']::text[]
)
WHERE target_roles IS NOT NULL;
UPDATE public.feature_flags
SET target_roles = coalesce(
  nullif(ARRAY(SELECT role FROM unnest(feature_flags.target_roles) AS role WHERE role = ANY(ARRAY['student', 'tutor', 'peer_tutor', 'club_admin', 'researcher', 'moderator', 'admin']::text[])), ARRAY[]::text[]),
  ARRAY['student', 'tutor', 'peer_tutor', 'club_admin', 'researcher', 'moderator', 'admin']::text[]
)
WHERE target_roles IS NOT NULL;
UPDATE public.announcements
SET target_roles = coalesce(
  nullif(ARRAY(SELECT role FROM unnest(announcements.target_roles) AS role WHERE role = ANY(ARRAY['student', 'tutor', 'peer_tutor', 'club_admin', 'researcher', 'moderator', 'admin']::text[])), ARRAY[]::text[]),
  ARRAY['student', 'tutor', 'peer_tutor', 'club_admin', 'researcher', 'moderator', 'admin']::text[]
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dashboard_configs_target_roles_valid' AND conrelid = 'public.dashboard_configs'::regclass) THEN
    ALTER TABLE public.dashboard_configs ADD CONSTRAINT dashboard_configs_target_roles_valid
      CHECK (target_roles IS NULL OR (cardinality(target_roles) > 0 AND target_roles <@ ARRAY['student', 'tutor', 'peer_tutor', 'club_admin', 'researcher', 'moderator', 'admin']::text[]));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'feature_flags_target_roles_valid' AND conrelid = 'public.feature_flags'::regclass) THEN
    ALTER TABLE public.feature_flags ADD CONSTRAINT feature_flags_target_roles_valid
      CHECK (target_roles IS NULL OR (cardinality(target_roles) > 0 AND target_roles <@ ARRAY['student', 'tutor', 'peer_tutor', 'club_admin', 'researcher', 'moderator', 'admin']::text[]));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'announcements_target_roles_valid' AND conrelid = 'public.announcements'::regclass) THEN
    ALTER TABLE public.announcements ADD CONSTRAINT announcements_target_roles_valid
      CHECK (cardinality(target_roles) > 0 AND target_roles <@ ARRAY['student', 'tutor', 'peer_tutor', 'club_admin', 'researcher', 'moderator', 'admin']::text[]);
  END IF;
END;
$$;

UPDATE public.announcements
SET ends_at = NULL
WHERE ends_at IS NOT NULL AND ends_at <= starts_at;
UPDATE public.announcements
SET action_url = NULL,
    action_label_en = NULL,
    action_label_bn = NULL
WHERE action_url IS NOT NULL
  AND NOT ((left(action_url, 1) = '/' AND left(action_url, 2) <> '//') OR left(action_url, 8) = 'https://');
UPDATE public.announcements
SET action_label_en = coalesce(action_label_en, title_en),
    action_label_bn = coalesce(action_label_bn, title_bn)
WHERE action_url IS NOT NULL;
UPDATE public.announcements
SET action_label_en = NULL,
    action_label_bn = NULL
WHERE action_url IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'announcements_time_order'
      AND conrelid = 'public.announcements'::regclass
  ) THEN
    ALTER TABLE public.announcements
      ADD CONSTRAINT announcements_time_order CHECK (ends_at IS NULL OR ends_at > starts_at);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'announcements_action_complete'
      AND conrelid = 'public.announcements'::regclass
  ) THEN
    ALTER TABLE public.announcements
      ADD CONSTRAINT announcements_action_complete CHECK (
        (action_url IS NULL AND action_label_en IS NULL AND action_label_bn IS NULL)
        OR (action_url IS NOT NULL AND action_label_en IS NOT NULL AND action_label_bn IS NOT NULL)
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'announcements_action_url_safe'
      AND conrelid = 'public.announcements'::regclass
  ) THEN
    ALTER TABLE public.announcements
      ADD CONSTRAINT announcements_action_url_safe CHECK (
        action_url IS NULL
        OR (left(action_url, 1) = '/' AND left(action_url, 2) <> '//')
        OR left(action_url, 8) = 'https://'
      );
  END IF;
END;
$$;

UPDATE public.profiles
SET onboarding_completed = onboarding_status IN ('completed', 'skipped')
WHERE onboarding_completed IS DISTINCT FROM (onboarding_status IN ('completed', 'skipped'));

CREATE TABLE IF NOT EXISTS public.announcement_dismissals (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  announcement_id uuid NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, announcement_id)
);

CREATE TABLE IF NOT EXISTS public.experience_content_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type text NOT NULL CHECK (content_type IN ('welcome', 'onboarding', 'tour')),
  locale text NOT NULL CHECK (locale IN ('en', 'bn')),
  version integer NOT NULL CHECK (version > 0),
  content jsonb NOT NULL CHECK (jsonb_typeof(content) IN ('array', 'object')),
  is_active boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (content_type, locale, version)
);

CREATE UNIQUE INDEX IF NOT EXISTS experience_content_sets_one_active
  ON public.experience_content_sets(content_type, locale)
  WHERE is_active;

ALTER TABLE public.announcement_dismissals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.experience_content_sets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS announcement_dismissals_self_read ON public.announcement_dismissals;
drop policy if exists announcement_dismissals_self_read on public.announcement_dismissals;
CREATE POLICY announcement_dismissals_self_read
  ON public.announcement_dismissals FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS experience_content_sets_active_read ON public.experience_content_sets;
drop policy if exists experience_content_sets_active_read on public.experience_content_sets;
CREATE POLICY experience_content_sets_active_read
  ON public.experience_content_sets FOR SELECT
  USING (is_active);

DROP POLICY IF EXISTS "Anyone can read active announcements" ON public.announcements;
CREATE POLICY "Anyone can read active announcements"
  ON public.announcements FOR SELECT
  USING (
    is_active = true
    AND starts_at <= now()
    AND (ends_at IS NULL OR ends_at > now())
  );

-- Experience mutations are backend-only. RLS is defense in depth, not the
-- authorization boundary for service-role API calls.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.user_dashboard_layouts FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.announcement_dismissals FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.experience_content_sets FROM anon, authenticated;
REVOKE SELECT ON TABLE public.dashboard_configs FROM anon, authenticated;
REVOKE SELECT ON TABLE public.feature_flags FROM anon, authenticated;
REVOKE SELECT ON TABLE public.announcements FROM anon, authenticated;

DROP POLICY IF EXISTS "Users can update own layout" ON public.user_dashboard_layouts;
DROP POLICY IF EXISTS "Anyone can read feature flags" ON public.feature_flags;

INSERT INTO public.feature_flags (key, description, is_enabled, rollout_percentage)
VALUES
  ('dashboard_customization', 'Allow users to customize dashboard widgets and density.', true, 100),
  ('guided_tour', 'Enable the versioned guided product tour.', true, 100),
  ('progressive_onboarding', 'Enable resumable progressive onboarding.', true, 100)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.experience_content_sets (content_type, locale, version, content)
VALUES
  (
    'welcome',
    'en',
    1,
    '[{"id":"discover","title":"Your learning journey, your way","body":"Discover campus skills, study rooms, mentors, and research opportunities."},{"id":"connect","title":"Learn better, together","body":"Connect with peers, chat in groups, and join live classes."},{"id":"level_up","title":"Turn progress into momentum","body":"Earn verified badges, build reputation, and climb the leaderboard."},{"id":"launch","title":"Launch your SkillBridge journey","body":"Build a trusted skill passport and reach your academic goals."}]'::jsonb
  ),
  (
    'welcome',
    'bn',
    1,
    '[{"id":"discover","title":"আপনার শেখার যাত্রা, আপনার মতো করে","body":"ক্যাম্পাসের স্কিল, স্টাডি রুম, মেন্টর ও গবেষণার সুযোগ খুঁজুন।"},{"id":"connect","title":"একসাথে শিখুন, আরও ভালোভাবে","body":"সহপাঠীদের সাথে যুক্ত হোন, গ্রুপে চ্যাট করুন এবং লাইভ ক্লাসে যোগ দিন।"},{"id":"level_up","title":"অগ্রগতিকে শক্তিতে পরিণত করুন","body":"ভেরিফায়েড ব্যাজ অর্জন করুন, রেপুটেশন গড়ুন এবং লিডারবোর্ডে এগিয়ে যান।"},{"id":"launch","title":"SkillBridge যাত্রা শুরু করুন","body":"একটি বিশ্বস্ত স্কিল পাসপোর্ট তৈরি করে একাডেমিক লক্ষ্য অর্জন করুন।"}]'::jsonb
  ),
  (
    'onboarding',
    'en',
    1,
    '{"language":{"title":"Language & region","body":"Choose your app language and confirm your timezone."},"identity":{"title":"Your identity","body":"Set your display name and a unique username."},"academic":{"title":"Academic profile","body":"Add your university, department, and batch."},"mission":{"title":"Learning mission","body":"Tell us how you plan to use SkillBridge."},"skills":{"title":"Skills & expertise","body":"Choose what you can teach and what you want to learn."},"preferences":{"title":"Study preferences","body":"Choose online, offline, or hybrid collaboration."},"privacy":{"title":"Privacy & safety","body":"Control who can discover your profile."},"notifications":{"title":"Notification alerts","body":"Choose whether to receive study-room and live-class alerts."},"review":{"title":"Review & launch","body":"Confirm your details and enter SkillBridge."}}'::jsonb
  ),
  (
    'onboarding',
    'bn',
    1,
    '{"language":{"title":"ভাষা ও অঞ্চল","body":"অ্যাপের ভাষা বেছে নিয়ে টাইমজোন নিশ্চিত করুন।"},"identity":{"title":"আপনার পরিচয়","body":"পূর্ণ নাম ও একটি অনন্য ইউজারনেম নির্ধারণ করুন।"},"academic":{"title":"একাডেমিক প্রোফাইল","body":"বিশ্ববিদ্যালয়, বিভাগ ও ব্যাচ যোগ করুন।"},"mission":{"title":"শেখার উদ্দেশ্য","body":"SkillBridge কীভাবে ব্যবহার করতে চান তা জানান।"},"skills":{"title":"স্কিল ও দক্ষতা","body":"যা শেখাতে পারেন এবং যা শিখতে চান তা বেছে নিন।"},"preferences":{"title":"পড়ার ধরন","body":"অনলাইন, অফলাইন বা হাইব্রিড মাধ্যম বেছে নিন।"},"privacy":{"title":"প্রাইভেসি ও নিরাপত্তা","body":"কারা আপনার প্রোফাইল খুঁজে পাবে তা নিয়ন্ত্রণ করুন।"},"notifications":{"title":"নোটিফিকেশন সতর্কতা","body":"স্টাডি রুম ও লাইভ ক্লাসের সতর্কতা বেছে নিন।"},"review":{"title":"পর্যালোচনা ও শুরু","body":"তথ্য নিশ্চিত করে SkillBridge শুরু করুন।"}}'::jsonb
  ),
  (
    'tour',
    'en',
    1,
    '[{"id":"dashboard","route":"/(tabs)","title":"Dynamic dashboard","body":"Reorder widgets and focus the home screen on your goals."},{"id":"search","route":"/search","title":"Universal search","body":"Find peers, rooms, events, skills, and research."},{"id":"rooms","route":"/rooms","title":"Study rooms","body":"Learn in groups and join live sessions."},{"id":"chat","route":"/(tabs)/inbox","title":"Persistent chat","body":"Message peers and stay connected when your network is unreliable."},{"id":"livekit","route":"/schedule","title":"Live classrooms","body":"Join video classes and participate with role-aware controls."},{"id":"quests","route":"/leaderboard","title":"Quests and leaderboards","body":"Build verified skills and reputation through real activity."},{"id":"settings","route":"/settings","title":"Settings and replay","body":"Adjust the app and replay this tour whenever you need it."}]'::jsonb
  ),
  (
    'tour',
    'bn',
    1,
    '[{"id":"dashboard","route":"/(tabs)","title":"ডাইনামিক ড্যাশবোর্ড","body":"নিজের লক্ষ্য অনুযায়ী হোম স্ক্রিনের উইজেট সাজান।"},{"id":"search","route":"/search","title":"সার্বজনীন অনুসন্ধান","body":"সহপাঠী, রুম, ইভেন্ট, স্কিল ও গবেষণা খুঁজুন।"},{"id":"rooms","route":"/rooms","title":"স্টাডি রুম","body":"গ্রুপে শিখুন এবং লাইভ সেশনে যোগ দিন।"},{"id":"chat","route":"/(tabs)/inbox","title":"নিরবচ্ছিন্ন চ্যাট","body":"দুর্বল নেটওয়ার্কেও সহপাঠীদের সাথে যুক্ত থাকুন।"},{"id":"livekit","route":"/schedule","title":"লাইভ ক্লাসরুম","body":"ভিডিও ক্লাসে যোগ দিয়ে ভূমিকা অনুযায়ী অংশ নিন।"},{"id":"quests","route":"/leaderboard","title":"কোয়েস্ট ও লিডারবোর্ড","body":"বাস্তব কার্যক্রমে ভেরিফায়েড স্কিল ও রেপুটেশন গড়ুন।"},{"id":"settings","route":"/settings","title":"সেটিংস ও রিপ্লে","body":"অ্যাপ নিজের মতো সাজান এবং প্রয়োজন হলে ট্যুর আবার দেখুন।"}]'::jsonb
  )
ON CONFLICT (content_type, locale, version) DO NOTHING;

DROP FUNCTION IF EXISTS public.create_room_atomic(text, text, text, integer, text, text[], uuid);

CREATE OR REPLACE FUNCTION public.create_room_atomic(
  p_title text,
  p_description text,
  p_topic text,
  p_visibility text,
  p_mode text,
  p_capacity integer,
  p_rules text,
  p_tags text[],
  p_campus_location text,
  p_owner_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conversation_id uuid;
  v_room_id uuid;
BEGIN
  IF p_visibility NOT IN ('public', 'private', 'invite_only') THEN
    RAISE EXCEPTION 'Invalid room visibility';
  END IF;
  IF p_mode NOT IN ('online', 'offline', 'hybrid') THEN
    RAISE EXCEPTION 'Invalid room mode';
  END IF;
  IF p_capacity < 2 OR p_capacity > 250 THEN
    RAISE EXCEPTION 'Invalid room capacity';
  END IF;

  INSERT INTO public.conversations(kind, title, created_by)
  VALUES ('room', p_title, p_owner_id)
  RETURNING id INTO v_conversation_id;

  INSERT INTO public.rooms(
    title, description, topic, visibility, mode, capacity, rules, tags,
    campus_location, owner_id, conversation_id, member_count
  ) VALUES (
    p_title, p_description, p_topic, p_visibility, p_mode, p_capacity,
    coalesce(p_rules, ''), coalesce(p_tags, '{}'::text[]), p_campus_location,
    p_owner_id, v_conversation_id, 1
  )
  RETURNING id INTO v_room_id;

  INSERT INTO public.room_members(room_id, user_id, role)
  VALUES (v_room_id, p_owner_id, 'owner');

  INSERT INTO public.conversation_members(conversation_id, user_id, role)
  VALUES (v_conversation_id, p_owner_id, 'owner');

  RETURN v_room_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_room_atomic(text, text, text, text, text, integer, text, text[], text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_room_atomic(text, text, text, text, text, integer, text, text[], text, uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.save_onboarding_progress_atomic(
  p_user_id uuid,
  p_profile jsonb,
  p_teach_skills text[],
  p_learn_skills text[]
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_skill_name text;
  v_skill_id uuid;
  v_missing text[] := ARRAY[]::text[];
  v_completed integer := 0;
  v_percent integer;
  v_profile public.profiles%ROWTYPE;
  v_known_count integer;
  v_wanted_count integer;
  v_was_completed boolean;
  v_existing_status text;
  v_requested_status text;
BEGIN
  IF p_profile IS NULL OR jsonb_typeof(p_profile) <> 'object' THEN
    RAISE EXCEPTION 'Profile payload must be a JSON object';
  END IF;

  SELECT onboarding_completed OR onboarding_status IN ('completed', 'skipped'), onboarding_status
  INTO v_was_completed, v_existing_status
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  v_requested_status := p_profile->>'onboarding_status';

  IF p_profile ? 'username' AND EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE lower(username) = lower(btrim(p_profile->>'username'))
      AND id <> p_user_id
  ) THEN
    RAISE EXCEPTION 'Username is already taken' USING ERRCODE = '23505';
  END IF;

  UPDATE public.profiles
  SET
    full_name = CASE WHEN p_profile ? 'full_name' THEN btrim(p_profile->>'full_name') ELSE full_name END,
    username = CASE WHEN p_profile ? 'username' THEN lower(btrim(p_profile->>'username')) ELSE username END,
    bio = CASE WHEN p_profile ? 'bio' THEN nullif(btrim(p_profile->>'bio'), '') ELSE bio END,
    university = CASE WHEN p_profile ? 'university' THEN nullif(btrim(p_profile->>'university'), '') ELSE university END,
    department = CASE WHEN p_profile ? 'department' THEN nullif(btrim(p_profile->>'department'), '') ELSE department END,
    batch = CASE WHEN p_profile ? 'batch' THEN nullif(btrim(p_profile->>'batch'), '') ELSE batch END,
    study_mode_preference = CASE WHEN p_profile ? 'study_mode_preference' THEN p_profile->>'study_mode_preference' ELSE study_mode_preference END,
    profile_visibility = CASE WHEN p_profile ? 'profile_visibility' THEN p_profile->>'profile_visibility' ELSE profile_visibility END,
    preferred_locale = CASE WHEN p_profile ? 'preferred_locale' THEN p_profile->>'preferred_locale' ELSE preferred_locale END,
    onboarding_step = CASE WHEN p_profile ? 'onboarding_step' THEN p_profile->>'onboarding_step' ELSE onboarding_step END,
    onboarding_version = CASE WHEN p_profile ? 'onboarding_version' THEN (p_profile->>'onboarding_version')::integer ELSE onboarding_version END,
    onboarding_mission = CASE WHEN p_profile ? 'onboarding_mission' THEN p_profile->>'onboarding_mission' ELSE onboarding_mission END,
    onboarding_push_opt_in = CASE WHEN p_profile ? 'onboarding_push_opt_in' THEN (p_profile->>'onboarding_push_opt_in')::boolean ELSE onboarding_push_opt_in END,
    timezone = CASE WHEN p_profile ? 'timezone' THEN p_profile->>'timezone' ELSE timezone END,
    updated_at = now()
  WHERE id = p_user_id;

  IF p_teach_skills IS NOT NULL THEN
    DELETE FROM public.user_skills us
    USING public.skills s
    WHERE us.user_id = p_user_id
      AND us.kind = 'known'
      AND us.skill_id = s.id
      AND NOT us.verified
      AND NOT EXISTS (
        SELECT 1 FROM unnest(p_teach_skills) item
        WHERE lower(btrim(item)) = lower(s.name)
      );

    FOR v_skill_name IN
      SELECT min(btrim(item))
      FROM unnest(p_teach_skills) item
      WHERE char_length(btrim(item)) BETWEEN 1 AND 60
      GROUP BY lower(btrim(item))
    LOOP
      PERFORM pg_advisory_xact_lock(hashtext('skill:' || lower(v_skill_name)));
      v_skill_id := NULL;
      SELECT id INTO v_skill_id
      FROM public.skills
      WHERE lower(name) = lower(v_skill_name)
      ORDER BY created_at, id
      LIMIT 1;
      IF v_skill_id IS NULL THEN
        INSERT INTO public.skills(name, category)
        VALUES (v_skill_name, 'General')
        ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
        RETURNING id INTO v_skill_id;
      END IF;

      INSERT INTO public.user_skills(user_id, skill_id, kind, proficiency)
      VALUES (p_user_id, v_skill_id, 'known', 4)
      ON CONFLICT (user_id, skill_id, kind)
      DO UPDATE SET proficiency = GREATEST(public.user_skills.proficiency, EXCLUDED.proficiency);
    END LOOP;
  END IF;

  IF p_learn_skills IS NOT NULL THEN
    DELETE FROM public.user_skills us
    USING public.skills s
    WHERE us.user_id = p_user_id
      AND us.kind = 'wanted'
      AND us.skill_id = s.id
      AND NOT EXISTS (
        SELECT 1 FROM unnest(p_learn_skills) item
        WHERE lower(btrim(item)) = lower(s.name)
      );

    FOR v_skill_name IN
      SELECT min(btrim(item))
      FROM unnest(p_learn_skills) item
      WHERE char_length(btrim(item)) BETWEEN 1 AND 60
      GROUP BY lower(btrim(item))
    LOOP
      PERFORM pg_advisory_xact_lock(hashtext('skill:' || lower(v_skill_name)));
      v_skill_id := NULL;
      SELECT id INTO v_skill_id
      FROM public.skills
      WHERE lower(name) = lower(v_skill_name)
      ORDER BY created_at, id
      LIMIT 1;
      IF v_skill_id IS NULL THEN
        INSERT INTO public.skills(name, category)
        VALUES (v_skill_name, 'General')
        ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
        RETURNING id INTO v_skill_id;
      END IF;

      INSERT INTO public.user_skills(user_id, skill_id, kind, proficiency)
      VALUES (p_user_id, v_skill_id, 'wanted', 1)
      ON CONFLICT (user_id, skill_id, kind) DO NOTHING;
    END LOOP;
  END IF;

  SELECT count(*)::integer INTO v_known_count
  FROM public.user_skills WHERE user_id = p_user_id AND kind = 'known';
  SELECT count(*)::integer INTO v_wanted_count
  FROM public.user_skills WHERE user_id = p_user_id AND kind = 'wanted';
  SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id;

  IF nullif(btrim(v_profile.full_name), '') IS NOT NULL AND lower(btrim(v_profile.full_name)) <> 'new member' THEN v_completed := v_completed + 1; ELSE v_missing := array_append(v_missing, 'full_name'); END IF;
  IF nullif(btrim(v_profile.username), '') IS NOT NULL AND v_profile.username !~ '^user_[0-9a-f]{10}$' THEN v_completed := v_completed + 1; ELSE v_missing := array_append(v_missing, 'username'); END IF;
  IF nullif(btrim(v_profile.university), '') IS NOT NULL THEN v_completed := v_completed + 1; ELSE v_missing := array_append(v_missing, 'university'); END IF;
  IF nullif(btrim(v_profile.department), '') IS NOT NULL THEN v_completed := v_completed + 1; ELSE v_missing := array_append(v_missing, 'department'); END IF;
  IF v_profile.study_mode_preference IS NOT NULL THEN v_completed := v_completed + 1; ELSE v_missing := array_append(v_missing, 'study_mode_preference'); END IF;
  IF v_known_count > 0 THEN v_completed := v_completed + 1; ELSE v_missing := array_append(v_missing, 'teach_skills'); END IF;
  IF v_wanted_count > 0 THEN v_completed := v_completed + 1; ELSE v_missing := array_append(v_missing, 'learn_skills'); END IF;

  v_percent := round((v_completed::numeric / 7::numeric) * 100)::integer;

  UPDATE public.profiles
  SET profile_completion_percent = v_percent,
      profile_missing_fields = v_missing,
      onboarding_status = CASE
        WHEN v_was_completed THEN CASE WHEN v_existing_status = 'skipped' THEN 'skipped' ELSE 'completed' END
        WHEN v_requested_status IN ('completed', 'skipped')
          AND p_profile->>'onboarding_step' = 'completed'
          AND nullif(btrim(v_profile.full_name), '') IS NOT NULL AND lower(btrim(v_profile.full_name)) <> 'new member'
          AND nullif(btrim(v_profile.username), '') IS NOT NULL AND v_profile.username !~ '^user_[0-9a-f]{10}$'
          THEN v_requested_status
        WHEN v_requested_status IN ('not_started', 'in_progress') THEN v_requested_status
        ELSE onboarding_status
      END,
      onboarding_completed = CASE
        WHEN v_was_completed THEN true
        WHEN v_requested_status IN ('completed', 'skipped')
          AND p_profile->>'onboarding_step' = 'completed'
          AND nullif(btrim(v_profile.full_name), '') IS NOT NULL AND lower(btrim(v_profile.full_name)) <> 'new member'
          AND nullif(btrim(v_profile.username), '') IS NOT NULL AND v_profile.username !~ '^user_[0-9a-f]{10}$'
          THEN true
        WHEN v_requested_status IN ('not_started', 'in_progress') THEN false
        ELSE onboarding_completed
      END,
      updated_at = now()
  WHERE id = p_user_id
  RETURNING * INTO v_profile;

  RETURN jsonb_build_object(
    'profile', to_jsonb(v_profile),
    'completion_percent', v_percent,
    'missing_fields', to_jsonb(v_missing),
    'skills_known', (
      SELECT coalesce(jsonb_agg(s.name ORDER BY s.name), '[]'::jsonb)
      FROM public.user_skills us JOIN public.skills s ON s.id = us.skill_id
      WHERE us.user_id = p_user_id AND us.kind = 'known'
    ),
    'skills_wanted', (
      SELECT coalesce(jsonb_agg(s.name ORDER BY s.name), '[]'::jsonb)
      FROM public.user_skills us JOIN public.skills s ON s.id = us.skill_id
      WHERE us.user_id = p_user_id AND us.kind = 'wanted'
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.save_notification_preferences_atomic(
  p_user_id uuid,
  p_patch jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_preferences public.notification_preferences%ROWTYPE;
BEGIN
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION 'Preference patch must be a JSON object';
  END IF;
  IF (p_patch ? 'quiet_hours_start' AND (p_patch->>'quiet_hours_start') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
    OR (p_patch ? 'quiet_hours_end' AND (p_patch->>'quiet_hours_end') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') THEN
    RAISE EXCEPTION 'Quiet hours must use HH:MM 24-hour format';
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  INSERT INTO public.notification_preferences(
    user_id, messages, connections, rooms, sessions, teaching, system, updated_at
  ) VALUES (
    p_user_id,
    coalesce((p_patch->>'messages')::boolean, true),
    coalesce((p_patch->>'connections')::boolean, true),
    coalesce((p_patch->>'rooms')::boolean, true),
    coalesce((p_patch->>'sessions')::boolean, true),
    coalesce((p_patch->>'teaching')::boolean, true),
    coalesce((p_patch->>'system')::boolean, true),
    now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    messages = coalesce((p_patch->>'messages')::boolean, public.notification_preferences.messages),
    connections = coalesce((p_patch->>'connections')::boolean, public.notification_preferences.connections),
    rooms = coalesce((p_patch->>'rooms')::boolean, public.notification_preferences.rooms),
    sessions = coalesce((p_patch->>'sessions')::boolean, public.notification_preferences.sessions),
    teaching = coalesce((p_patch->>'teaching')::boolean, public.notification_preferences.teaching),
    system = coalesce((p_patch->>'system')::boolean, public.notification_preferences.system),
    updated_at = now()
  RETURNING * INTO v_preferences;

  UPDATE public.profiles
  SET quiet_hours_start = CASE WHEN p_patch ? 'quiet_hours_start' THEN p_patch->>'quiet_hours_start' ELSE quiet_hours_start END,
      quiet_hours_end = CASE WHEN p_patch ? 'quiet_hours_end' THEN p_patch->>'quiet_hours_end' ELSE quiet_hours_end END,
      onboarding_push_opt_in = CASE WHEN p_patch ? 'push_enabled' THEN (p_patch->>'push_enabled')::boolean ELSE onboarding_push_opt_in END,
      updated_at = now()
  WHERE id = p_user_id
  RETURNING * INTO v_profile;

  RETURN jsonb_build_object(
    'preferences', to_jsonb(v_preferences) - 'user_id' - 'updated_at',
    'quietHours', jsonb_build_object(
      'start', v_profile.quiet_hours_start,
      'end', v_profile.quiet_hours_end,
      'timezone', v_profile.timezone
    ),
    'onboardingPushOptIn', v_profile.onboarding_push_opt_in
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_guided_tour_step_atomic(
  p_user_id uuid,
  p_step text,
  p_is_last boolean,
  p_version integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_reward jsonb;
BEGIN
  IF p_version < 1 THEN
    RAISE EXCEPTION 'Invalid guided tour version';
  END IF;

  IF p_is_last THEN
    v_status := 'completed';
    v_reward := public.award_reputation_atomic(p_user_id, 'tour_completed', 5, 'tour', p_user_id);
  ELSE
    v_status := 'in_progress';
  END IF;

  UPDATE public.profiles
  SET guided_tour_version = p_version,
      guided_tour_last_step = p_step,
      guided_tour_status = v_status,
      updated_at = now()
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  RETURN jsonb_build_object('step', p_step, 'status', v_status, 'version', p_version, 'reward', v_reward);
END;
$$;

CREATE OR REPLACE FUNCTION public.publish_experience_content_atomic(
  p_actor_id uuid,
  p_content_type text,
  p_locale text,
  p_content jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_version integer;
  v_row public.experience_content_sets%ROWTYPE;
BEGIN
  IF p_content_type NOT IN ('welcome', 'onboarding', 'tour') THEN
    RAISE EXCEPTION 'Invalid content type';
  END IF;
  IF p_locale NOT IN ('en', 'bn') THEN
    RAISE EXCEPTION 'Invalid locale';
  END IF;
  IF p_content IS NULL OR jsonb_typeof(p_content) NOT IN ('array', 'object') THEN
    RAISE EXCEPTION 'Content must be a JSON array or object';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_content_type || ':' || p_locale));
  SELECT coalesce(max(version), 0) + 1 INTO v_version
  FROM public.experience_content_sets
  WHERE content_type = p_content_type AND locale = p_locale;

  UPDATE public.experience_content_sets
  SET is_active = false, updated_at = now()
  WHERE content_type = p_content_type AND locale = p_locale AND is_active;

  INSERT INTO public.experience_content_sets(content_type, locale, version, content, is_active, updated_by)
  VALUES (p_content_type, p_locale, v_version, p_content, true, p_actor_id)
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$$;

REVOKE ALL ON FUNCTION public.save_onboarding_progress_atomic(uuid, jsonb, text[], text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_onboarding_progress_atomic(uuid, jsonb, text[], text[]) TO service_role;

REVOKE ALL ON FUNCTION public.save_notification_preferences_atomic(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_notification_preferences_atomic(uuid, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.complete_guided_tour_step_atomic(uuid, text, boolean, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_guided_tour_step_atomic(uuid, text, boolean, integer) TO service_role;

REVOKE ALL ON FUNCTION public.publish_experience_content_atomic(uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_experience_content_atomic(uuid, text, text, jsonb) TO service_role;

COMMIT;


-- =========================================
-- MIGRATION: 018_learning_growth_hub.sql
-- =========================================

-- 018_learning_growth_hub.sql
-- Learning & Growth Hub: Personal Goals, Study Planner, Calendar, Booking, Saved Collections, Challenges, Achievements, and Activity Analytics.

BEGIN;

-- 1. LEARNING GOALS & MILESTONES
CREATE TABLE IF NOT EXISTS public.learning_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  skill_id uuid REFERENCES public.skills(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  goal_type text NOT NULL DEFAULT 'learn'
    CHECK (goal_type IN ('learn', 'teach', 'verify', 'research', 'project')),
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  target_date date NOT NULL,
  weekly_target_minutes integer NOT NULL DEFAULT 120
    CHECK (weekly_target_minutes >= 15 AND weekly_target_minutes <= 2400),
  preferred_study_modes text[] NOT NULL DEFAULT ARRAY['online', 'offline', 'hybrid']::text[],
  priority text NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  visibility text NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('private', 'connections', 'public')),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'paused', 'completed', 'abandoned')),
  progress_percent integer NOT NULL DEFAULT 0
    CHECK (progress_percent >= 0 AND progress_percent <= 100),
  reflection text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT learning_goals_dates_valid CHECK (target_date >= start_date)
);

CREATE TABLE IF NOT EXISTS public.goal_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id uuid NOT NULL REFERENCES public.learning_goals(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  weight integer NOT NULL CHECK (weight >= 1 AND weight <= 100),
  order_index integer NOT NULL DEFAULT 0,
  is_completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  is_verified boolean NOT NULL DEFAULT false,
  verified_activity_type text,
  verified_activity_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. STUDY PLANNER PREFERENCES & BLOCKS
CREATE TABLE IF NOT EXISTS public.study_planner_preferences (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  preferred_days integer[] NOT NULL DEFAULT ARRAY[1, 2, 3, 4, 5]::integer[],
  preferred_daily_minutes integer NOT NULL DEFAULT 60
    CHECK (preferred_daily_minutes >= 15 AND preferred_daily_minutes <= 720),
  preferred_modes text[] NOT NULL DEFAULT ARRAY['online', 'hybrid']::text[],
  quiet_hours_start text NOT NULL DEFAULT '22:00',
  quiet_hours_end text NOT NULL DEFAULT '07:00',
  auto_reschedule boolean NOT NULL DEFAULT true,
  timezone text NOT NULL DEFAULT 'Asia/Dhaka',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.study_plan_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  goal_id uuid REFERENCES public.learning_goals(id) ON DELETE SET NULL,
  skill_id uuid REFERENCES public.skills(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  duration_minutes integer NOT NULL
    CHECK (duration_minutes >= 15 AND duration_minutes <= 480),
  study_mode text NOT NULL DEFAULT 'online'
    CHECK (study_mode IN ('online', 'offline', 'hybrid')),
  reason text,
  is_completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  is_skipped boolean NOT NULL DEFAULT false,
  is_custom boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT study_plan_blocks_time_valid CHECK (end_time > start_time)
);

-- 3. CALENDAR REMINDERS
CREATE TABLE IF NOT EXISTS public.calendar_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  entity_type text NOT NULL
    CHECK (entity_type IN ('room_session', 'booking', 'event', 'club_event', 'research_deadline', 'goal_milestone', 'study_block')),
  entity_id uuid NOT NULL,
  reminder_time timestamptz NOT NULL,
  is_dismissed boolean NOT NULL DEFAULT false,
  is_snoozed boolean NOT NULL DEFAULT false,
  snooze_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 4. TUTOR AVAILABILITY & SESSION BOOKINGS
CREATE TABLE IF NOT EXISTS public.tutor_availability_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  day_of_week integer NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  start_time_utc text NOT NULL,
  end_time_utc text NOT NULL,
  slot_duration_minutes integer NOT NULL DEFAULT 60
    CHECK (slot_duration_minutes IN (30, 45, 60, 90, 120)),
  buffer_minutes integer NOT NULL DEFAULT 15
    CHECK (buffer_minutes >= 0 AND buffer_minutes <= 60),
  mode text NOT NULL DEFAULT 'online'
    CHECK (mode IN ('online', 'offline', 'hybrid')),
  offline_location text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tutor_availability_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  exception_date date NOT NULL,
  start_time_utc text,
  end_time_utc text,
  is_blackout boolean NOT NULL DEFAULT true,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.session_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tutor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  skill_id uuid REFERENCES public.skills(id) ON DELETE SET NULL,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  duration_minutes integer NOT NULL
    CHECK (duration_minutes >= 15 AND duration_minutes <= 240),
  mode text NOT NULL DEFAULT 'online'
    CHECK (mode IN ('online', 'offline', 'hybrid')),
  offline_location text,
  status text NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'accepted', 'confirmed', 'completed', 'declined', 'cancelled', 'expired', 'reschedule_requested')),
  learner_note text,
  tutor_note text,
  cancellation_reason text,
  idempotency_key text UNIQUE,
  room_id uuid REFERENCES public.rooms(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT session_bookings_time_valid CHECK (end_time > start_time),
  CONSTRAINT session_bookings_parties_distinct CHECK (learner_id <> tutor_id)
);

CREATE TABLE IF NOT EXISTS public.booking_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.session_bookings(id) ON DELETE CASCADE,
  from_status text NOT NULL,
  to_status text NOT NULL,
  changed_by_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 5. SAVED COLLECTIONS & ITEMS ENHANCEMENT
CREATE TABLE IF NOT EXISTS public.saved_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  color text NOT NULL DEFAULT '#2563EB',
  icon text NOT NULL DEFAULT 'bookmark',
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Ensure saved_items has collection_id, note, and tags
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'saved_items' AND column_name = 'collection_id') THEN
    ALTER TABLE public.saved_items ADD COLUMN collection_id uuid REFERENCES public.saved_collections(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'saved_items' AND column_name = 'note') THEN
    ALTER TABLE public.saved_items ADD COLUMN note text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'saved_items' AND column_name = 'tags') THEN
    ALTER TABLE public.saved_items ADD COLUMN tags text[] NOT NULL DEFAULT ARRAY[]::text[];
  END IF;
END;
$$;

-- 6. CHALLENGES & QUESTS
CREATE TABLE IF NOT EXISTS public.challenge_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL,
  challenge_type text NOT NULL DEFAULT 'weekly'
    CHECK (challenge_type IN ('daily', 'weekly', 'campus', 'skill', 'room', 'event', 'research', 'tutor', 'learner', 'onboarding')),
  target_activity_type text NOT NULL,
  target_count integer NOT NULL DEFAULT 1 CHECK (target_count >= 1),
  points_reward integer NOT NULL DEFAULT 25 CHECK (points_reward >= 0 AND points_reward <= 1000),
  badge_reward text,
  start_at timestamptz NOT NULL DEFAULT now(),
  end_at timestamptz NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  target_roles text[] NOT NULL DEFAULT ARRAY['student', 'tutor', 'peer_tutor', 'club_admin', 'researcher']::text[],
  target_campuses text[],
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT challenge_definitions_dates_valid CHECK (end_at > start_at)
);

CREATE TABLE IF NOT EXISTS public.challenge_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  challenge_id uuid NOT NULL REFERENCES public.challenge_definitions(id) ON DELETE CASCADE,
  current_count integer NOT NULL DEFAULT 0 CHECK (current_count >= 0),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('upcoming', 'active', 'completed_unclaimed', 'claimed', 'expired', 'revoked')),
  completed_at timestamptz,
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, challenge_id)
);

-- 7. ACHIEVEMENTS & VERIFICATION
CREATE TABLE IF NOT EXISTS public.achievement_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL,
  category text NOT NULL DEFAULT 'skill'
    CHECK (category IN ('skill', 'goal', 'tutoring', 'learning', 'research', 'challenge', 'community')),
  icon text NOT NULL DEFAULT 'trophy',
  criteria_description text NOT NULL,
  points_reward integer NOT NULL DEFAULT 50 CHECK (points_reward >= 0 AND points_reward <= 2000),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Upgrade legacy achievements table if present
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'achievements') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'achievements' AND column_name = 'category') THEN
      ALTER TABLE public.achievements ADD COLUMN category text NOT NULL DEFAULT 'skill';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'achievements' AND column_name = 'criteria_description') THEN
      ALTER TABLE public.achievements ADD COLUMN criteria_description text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'achievements' AND column_name = 'points_reward') THEN
      ALTER TABLE public.achievements ADD COLUMN points_reward integer NOT NULL DEFAULT 50;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'achievements' AND column_name = 'is_active') THEN
      ALTER TABLE public.achievements ADD COLUMN is_active boolean NOT NULL DEFAULT true;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'achievements' AND column_name = 'updated_at') THEN
      ALTER TABLE public.achievements ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
    END IF;
  END IF;
END;
$$;

-- Upgrade legacy user_achievements table
CREATE TABLE IF NOT EXISTS public.user_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  achievement_id uuid NOT NULL,
  verification_code text NOT NULL UNIQUE,
  is_public boolean NOT NULL DEFAULT true,
  is_revoked boolean NOT NULL DEFAULT false,
  revocation_reason text,
  issued_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, achievement_id)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_achievements' AND column_name = 'verification_code') THEN
    ALTER TABLE public.user_achievements ADD COLUMN verification_code text;
    UPDATE public.user_achievements SET verification_code = 'SB-ACH-' || upper(substr(md5(random()::text || user_id::text), 1, 8)) || '-' || upper(substr(md5(achievement_id::text), 1, 8)) WHERE verification_code IS NULL;
    ALTER TABLE public.user_achievements ALTER COLUMN verification_code SET NOT NULL;
    ALTER TABLE public.user_achievements ADD CONSTRAINT uq_user_achievements_verification_code UNIQUE (verification_code);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_achievements' AND column_name = 'is_public') THEN
    ALTER TABLE public.user_achievements ADD COLUMN is_public boolean NOT NULL DEFAULT true;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_achievements' AND column_name = 'is_revoked') THEN
    ALTER TABLE public.user_achievements ADD COLUMN is_revoked boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_achievements' AND column_name = 'revocation_reason') THEN
    ALTER TABLE public.user_achievements ADD COLUMN revocation_reason text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_achievements' AND column_name = 'issued_at') THEN
    ALTER TABLE public.user_achievements ADD COLUMN issued_at timestamptz NOT NULL DEFAULT now();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_achievements' AND column_name = 'created_at') THEN
    ALTER TABLE public.user_achievements ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_achievements' AND column_name = 'id') THEN
    ALTER TABLE public.user_achievements ADD COLUMN id uuid DEFAULT gen_random_uuid();
  END IF;
END;
$$;

-- 8. USER ACTIVITY EVENTS
CREATE TABLE IF NOT EXISTS public.user_activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_type text NOT NULL
    CHECK (event_type IN ('goal_milestone', 'study_session', 'room_join', 'session_taught', 'session_attended', 'quiz_completed', 'skill_verified', 'research_update', 'booking_completed', 'achievement_earned', 'challenge_claimed')),
  event_title text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_verified boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_learning_goals_user ON public.learning_goals(user_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_goal_milestones_goal ON public.goal_milestones(goal_id, order_index);
CREATE INDEX IF NOT EXISTS idx_study_plan_blocks_user_time ON public.study_plan_blocks(user_id, start_time);
CREATE INDEX IF NOT EXISTS idx_calendar_reminders_user_time ON public.calendar_reminders(user_id, reminder_time) WHERE NOT is_dismissed;
CREATE INDEX IF NOT EXISTS idx_tutor_avail_rules_tutor ON public.tutor_availability_rules(tutor_id, day_of_week) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_session_bookings_learner ON public.session_bookings(learner_id, start_time);
CREATE INDEX IF NOT EXISTS idx_session_bookings_tutor ON public.session_bookings(tutor_id, start_time);
CREATE INDEX IF NOT EXISTS idx_session_bookings_active_slots ON public.session_bookings(tutor_id, start_time, end_time) WHERE status IN ('requested', 'accepted', 'confirmed');
CREATE INDEX IF NOT EXISTS idx_saved_collections_user ON public.saved_collections(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_items_collection ON public.saved_items(collection_id);
CREATE INDEX IF NOT EXISTS idx_challenge_defs_active ON public.challenge_definitions(is_active, start_at, end_at);
CREATE INDEX IF NOT EXISTS idx_challenge_progress_user ON public.challenge_progress(user_id, status);
CREATE INDEX IF NOT EXISTS idx_user_achievements_user ON public.user_achievements(user_id);
CREATE INDEX IF NOT EXISTS idx_user_achievements_code ON public.user_achievements(verification_code);
CREATE INDEX IF NOT EXISTS idx_user_activity_events_user ON public.user_activity_events(user_id, created_at DESC);

-- ENABLE ROW LEVEL SECURITY
ALTER TABLE public.learning_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goal_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_planner_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_plan_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tutor_availability_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tutor_availability_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenge_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenge_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.achievement_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_activity_events ENABLE ROW LEVEL SECURITY;

-- DROP EXISTING POLICIES IF PRESENT
DO $$
BEGIN
  -- Goals
  DROP POLICY IF EXISTS "Users can manage their own goals" ON public.learning_goals;
  DROP POLICY IF EXISTS "Public and connections can view permitted goals" ON public.learning_goals;
  DROP POLICY IF EXISTS "Users can manage milestones for their goals" ON public.goal_milestones;
  
  -- Planner & Calendar
  DROP POLICY IF EXISTS "Users can manage their planner preferences" ON public.study_planner_preferences;
  DROP POLICY IF EXISTS "Users can manage their study plan blocks" ON public.study_plan_blocks;
  DROP POLICY IF EXISTS "Users can manage their calendar reminders" ON public.calendar_reminders;

  -- Availability & Booking
  DROP POLICY IF EXISTS "Tutors can manage their availability rules" ON public.tutor_availability_rules;
  DROP POLICY IF EXISTS "Anyone can view active tutor availability" ON public.tutor_availability_rules;
  DROP POLICY IF EXISTS "Tutors can manage availability exceptions" ON public.tutor_availability_exceptions;
  DROP POLICY IF EXISTS "Anyone can view tutor availability exceptions" ON public.tutor_availability_exceptions;
  DROP POLICY IF EXISTS "Participants can view and manage their bookings" ON public.session_bookings;
  DROP POLICY IF EXISTS "Participants can view booking status history" ON public.booking_status_history;

  -- Saved Collections
  DROP POLICY IF EXISTS "Users can manage their saved collections" ON public.saved_collections;

  -- Challenges & Achievements
  DROP POLICY IF EXISTS "Anyone can view active challenge definitions" ON public.challenge_definitions;
  DROP POLICY IF EXISTS "Admins can manage challenge definitions" ON public.challenge_definitions;
  DROP POLICY IF EXISTS "Users can view and update their challenge progress" ON public.challenge_progress;
  DROP POLICY IF EXISTS "Anyone can view achievement definitions" ON public.achievement_definitions;
  DROP POLICY IF EXISTS "Admins can manage achievement definitions" ON public.achievement_definitions;
  DROP POLICY IF EXISTS "Users can view their own achievements and public ones" ON public.user_achievements;
  DROP POLICY IF EXISTS "Users can manage their own achievement visibility" ON public.user_achievements;
  DROP POLICY IF EXISTS "user_achievements_read" ON public.user_achievements;

  -- Activity Events
  DROP POLICY IF EXISTS "Users can view their own activity events" ON public.user_activity_events;
END;
$$;

-- RLS POLICIES
CREATE POLICY "Users can manage their own goals"
  ON public.learning_goals FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Public and connections can view permitted goals"
  ON public.learning_goals FOR SELECT
  USING (
    visibility = 'public'
    OR (visibility = 'connections' AND EXISTS (
      SELECT 1 FROM public.connections
      WHERE (user_a = auth.uid() AND user_b = user_id)
         OR (user_b = auth.uid() AND user_a = user_id)
    ))
  );

CREATE POLICY "Users can manage milestones for their goals"
  ON public.goal_milestones FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage their planner preferences"
  ON public.study_planner_preferences FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage their study plan blocks"
  ON public.study_plan_blocks FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage their calendar reminders"
  ON public.calendar_reminders FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Tutors can manage their availability rules"
  ON public.tutor_availability_rules FOR ALL
  USING (auth.uid() = tutor_id)
  WITH CHECK (auth.uid() = tutor_id);

CREATE POLICY "Anyone can view active tutor availability"
  ON public.tutor_availability_rules FOR SELECT
  USING (is_active = true);

CREATE POLICY "Tutors can manage availability exceptions"
  ON public.tutor_availability_exceptions FOR ALL
  USING (auth.uid() = tutor_id)
  WITH CHECK (auth.uid() = tutor_id);

CREATE POLICY "Anyone can view tutor availability exceptions"
  ON public.tutor_availability_exceptions FOR SELECT
  USING (true);

CREATE POLICY "Participants can view and manage their bookings"
  ON public.session_bookings FOR ALL
  USING (auth.uid() = learner_id OR auth.uid() = tutor_id)
  WITH CHECK (auth.uid() = learner_id OR auth.uid() = tutor_id);

CREATE POLICY "Participants can view booking status history"
  ON public.booking_status_history FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.session_bookings b
    WHERE b.id = booking_id AND (b.learner_id = auth.uid() OR b.tutor_id = auth.uid())
  ));

CREATE POLICY "Users can manage their saved collections"
  ON public.saved_collections FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Anyone can view active challenge definitions"
  ON public.challenge_definitions FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins can manage challenge definitions"
  ON public.challenge_definitions FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND 'admin' = ANY(p.roles)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND 'admin' = ANY(p.roles)
  ));

CREATE POLICY "Users can view and update their challenge progress"
  ON public.challenge_progress FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Anyone can view achievement definitions"
  ON public.achievement_definitions FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins can manage achievement definitions"
  ON public.achievement_definitions FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND 'admin' = ANY(p.roles)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND 'admin' = ANY(p.roles)
  ));

CREATE POLICY "Users can view their own achievements and public ones"
  ON public.user_achievements FOR SELECT
  USING (auth.uid() = user_id OR is_public = true);

CREATE POLICY "Users can manage their own achievement visibility"
  ON public.user_achievements FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own activity events"
  ON public.user_activity_events FOR SELECT
  USING (auth.uid() = user_id);

-- ============================================================================
-- ATOMIC STORED PROCEDURES (SECURITY DEFINER, FIXED SEARCH PATH)
-- ============================================================================

-- 1. ACTIVATE LEARNING GOAL ATOMIC
CREATE OR REPLACE FUNCTION public.activate_learning_goal_atomic(
  p_goal_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_goal record;
  v_total_weight integer;
BEGIN
  SELECT * INTO v_goal
  FROM public.learning_goals
  WHERE id = p_goal_id AND user_id = p_user_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Goal not found or unauthorized' USING ERRCODE = 'P0002';
  END IF;

  IF v_goal.status = 'active' THEN
    RETURN jsonb_build_object('success', true, 'status', 'active', 'message', 'Goal is already active');
  END IF;

  IF v_goal.target_date < v_goal.start_date THEN
    RAISE EXCEPTION 'Target date cannot precede start date' USING ERRCODE = '22000';
  END IF;

  SELECT coalesce(sum(weight), 0) INTO v_total_weight
  FROM public.goal_milestones
  WHERE goal_id = p_goal_id;

  IF v_total_weight <> 100 THEN
    RAISE EXCEPTION 'Total milestone weight must equal exactly 100 before activating (current: %)', v_total_weight USING ERRCODE = '22000';
  END IF;

  UPDATE public.learning_goals
  SET status = 'active', updated_at = now()
  WHERE id = p_goal_id;

  INSERT INTO public.user_activity_events (user_id, event_type, event_title, metadata, is_verified)
  VALUES (p_user_id, 'goal_milestone', 'Activated Goal: ' || v_goal.title, jsonb_build_object('goal_id', p_goal_id), true);

  RETURN jsonb_build_object('success', true, 'status', 'active');
END;
$$;

-- 2. COMPLETE GOAL MILESTONE ATOMIC
CREATE OR REPLACE FUNCTION public.complete_goal_milestone_atomic(
  p_milestone_id uuid,
  p_user_id uuid,
  p_verified_type text DEFAULT NULL,
  p_verified_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_milestone record;
  v_goal record;
  v_total_progress integer;
  v_reward_points integer := 50;
  v_reward_idempotency text;
BEGIN
  SELECT * INTO v_milestone
  FROM public.goal_milestones
  WHERE id = p_milestone_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Milestone not found or unauthorized' USING ERRCODE = 'P0002';
  END IF;

  IF v_milestone.is_completed THEN
    RETURN jsonb_build_object('success', true, 'is_completed', true, 'already_completed', true);
  END IF;

  UPDATE public.goal_milestones
  SET is_completed = true,
      completed_at = now(),
      is_verified = (p_verified_type IS NOT NULL),
      verified_activity_type = p_verified_type,
      verified_activity_id = p_verified_id,
      updated_at = now()
  WHERE id = p_milestone_id;

  -- Recalculate goal progress
  SELECT coalesce(sum(weight), 0) INTO v_total_progress
  FROM public.goal_milestones
  WHERE goal_id = v_milestone.goal_id AND is_completed = true;

  v_total_progress := least(100, v_total_progress);

  SELECT * INTO v_goal
  FROM public.learning_goals
  WHERE id = v_milestone.goal_id;

  IF v_total_progress >= 100 AND v_goal.status <> 'completed' THEN
    UPDATE public.learning_goals
    SET progress_percent = 100,
        status = 'completed',
        completed_at = now(),
        updated_at = now()
    WHERE id = v_milestone.goal_id;

    -- Award idempotent reputation reward
    v_reward_idempotency := 'goal_completion:' || v_milestone.goal_id::text;
    INSERT INTO public.points_ledger (user_id, points, action, reference_id, created_at)
    VALUES (p_user_id, v_reward_points, v_reward_idempotency, v_milestone.goal_id, now())
    ON CONFLICT (action) DO NOTHING;

    -- Aggregate reputation to profile
    UPDATE public.profiles
    SET reputation_score = (
      SELECT coalesce(sum(points), 0) FROM public.points_ledger WHERE user_id = p_user_id
    )
    WHERE id = p_user_id;

    INSERT INTO public.user_activity_events (user_id, event_type, event_title, metadata, is_verified)
    VALUES (p_user_id, 'goal_milestone', 'Completed Goal: ' || v_goal.title, jsonb_build_object('goal_id', v_goal.id, 'points', v_reward_points), true);
  ELSE
    UPDATE public.learning_goals
    SET progress_percent = v_total_progress,
        updated_at = now()
    WHERE id = v_milestone.goal_id;

    INSERT INTO public.user_activity_events (user_id, event_type, event_title, metadata, is_verified)
    VALUES (p_user_id, 'goal_milestone', 'Completed Milestone: ' || v_milestone.title, jsonb_build_object('goal_id', v_milestone.goal_id, 'milestone_id', p_milestone_id), p_verified_type IS NOT NULL);
  END IF;

  RETURN jsonb_build_object('success', true, 'progress_percent', v_total_progress, 'goal_completed', (v_total_progress >= 100));
END;
$$;

-- 3. REQUEST SESSION BOOKING ATOMIC
CREATE OR REPLACE FUNCTION public.request_session_booking_atomic(
  p_learner_id uuid,
  p_tutor_id uuid,
  p_skill_id uuid,
  p_start_time timestamptz,
  p_end_time timestamptz,
  p_mode text,
  p_note text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_booking record;
  v_booking_id uuid;
  v_duration integer;
  v_conflict_count integer;
  v_tutor_status text;
BEGIN
  IF p_learner_id = p_tutor_id THEN
    RAISE EXCEPTION 'Cannot book a session with yourself' USING ERRCODE = '22000';
  END IF;

  IF p_end_time <= p_start_time THEN
    RAISE EXCEPTION 'End time must be after start time' USING ERRCODE = '22000';
  END IF;

  -- Check if tutor exists
  SELECT id INTO v_tutor_status
  FROM public.profiles
  WHERE id = p_tutor_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tutor profile not found' USING ERRCODE = 'P0002';
  END IF;

  -- Idempotency check
  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_existing_booking
    FROM public.session_bookings
    WHERE idempotency_key = p_idempotency_key;

    IF FOUND THEN
      RETURN jsonb_build_object('booking_id', v_existing_booking.id, 'status', v_existing_booking.status, 'idempotent', true);
    END IF;
  END IF;

  -- Concurrency check: prevent double booking using table lock on session_bookings for overlapping active bookings
  PERFORM pg_advisory_xact_lock(hashtext('booking_' || p_tutor_id::text));

  SELECT count(*) INTO v_conflict_count
  FROM public.session_bookings
  WHERE tutor_id = p_tutor_id
    AND status IN ('requested', 'accepted', 'confirmed')
    AND tstzrange(start_time, end_time) && tstzrange(p_start_time, p_end_time);

  IF v_conflict_count > 0 THEN
    RAISE EXCEPTION 'The tutor has a conflicting booking during this requested time window' USING ERRCODE = '23505';
  END IF;

  v_duration := EXTRACT(EPOCH FROM (p_end_time - p_start_time)) / 60;

  INSERT INTO public.session_bookings (
    learner_id, tutor_id, skill_id, start_time, end_time, duration_minutes,
    mode, status, learner_note, idempotency_key, created_at, updated_at
  )
  VALUES (
    p_learner_id, p_tutor_id, p_skill_id, p_start_time, p_end_time, v_duration,
    p_mode, 'requested', p_note, p_idempotency_key, now(), now()
  )
  RETURNING id INTO v_booking_id;

  INSERT INTO public.booking_status_history (booking_id, from_status, to_status, changed_by_user_id, note)
  VALUES (v_booking_id, 'none', 'requested', p_learner_id, p_note);

  RETURN jsonb_build_object('booking_id', v_booking_id, 'status', 'requested');
END;
$$;

-- 4. UPDATE BOOKING STATUS ATOMIC
CREATE OR REPLACE FUNCTION public.update_booking_status_atomic(
  p_booking_id uuid,
  p_user_id uuid,
  p_new_status text,
  p_note text DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking record;
BEGIN
  SELECT * INTO v_booking
  FROM public.session_bookings
  WHERE id = p_booking_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found' USING ERRCODE = 'P0002';
  END IF;

  IF p_user_id <> v_booking.learner_id AND p_user_id <> v_booking.tutor_id THEN
    RAISE EXCEPTION 'Unauthorized to modify this booking' USING ERRCODE = '42501';
  END IF;

  -- State machine validation
  IF p_new_status = 'accepted' AND p_user_id <> v_booking.tutor_id THEN
    RAISE EXCEPTION 'Only the tutor can accept a booking request' USING ERRCODE = '42501';
  END IF;

  IF p_new_status = 'declined' AND p_user_id <> v_booking.tutor_id THEN
    RAISE EXCEPTION 'Only the tutor can decline a booking request' USING ERRCODE = '42501';
  END IF;

  IF v_booking.status IN ('completed', 'declined', 'cancelled', 'expired') THEN
    RAISE EXCEPTION 'Cannot transition booking from terminal state %', v_booking.status USING ERRCODE = '22000';
  END IF;

  UPDATE public.session_bookings
  SET status = p_new_status,
      tutor_note = CASE WHEN p_user_id = v_booking.tutor_id AND p_note IS NOT NULL THEN p_note ELSE tutor_note END,
      cancellation_reason = CASE WHEN p_new_status IN ('declined', 'cancelled') THEN coalesce(p_reason, p_note) ELSE cancellation_reason END,
      updated_at = now()
  WHERE id = p_booking_id;

  INSERT INTO public.booking_status_history (booking_id, from_status, to_status, changed_by_user_id, note)
  VALUES (p_booking_id, v_booking.status, p_new_status, p_user_id, coalesce(p_reason, p_note));

  RETURN jsonb_build_object('success', true, 'from_status', v_booking.status, 'to_status', p_new_status);
END;
$$;

-- 5. COMPLETE BOOKING ATOMIC
CREATE OR REPLACE FUNCTION public.complete_booking_atomic(
  p_booking_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking record;
  v_tutor_reward integer := 30;
  v_learner_reward integer := 15;
  v_tutor_key text;
  v_learner_key text;
BEGIN
  SELECT * INTO v_booking
  FROM public.session_bookings
  WHERE id = p_booking_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found' USING ERRCODE = 'P0002';
  END IF;

  IF p_user_id <> v_booking.tutor_id AND p_user_id <> v_booking.learner_id THEN
    RAISE EXCEPTION 'Unauthorized to complete this booking' USING ERRCODE = '42501';
  END IF;

  IF v_booking.status = 'completed' THEN
    RETURN jsonb_build_object('success', true, 'status', 'completed', 'already_completed', true);
  END IF;

  IF v_booking.status NOT IN ('accepted', 'confirmed') THEN
    RAISE EXCEPTION 'Cannot complete booking in % status', v_booking.status USING ERRCODE = '22000';
  END IF;

  UPDATE public.session_bookings
  SET status = 'completed', updated_at = now()
  WHERE id = p_booking_id;

  INSERT INTO public.booking_status_history (booking_id, from_status, to_status, changed_by_user_id, note)
  VALUES (p_booking_id, v_booking.status, 'completed', p_user_id, 'Session marked completed');

  -- Tutor reward
  v_tutor_key := 'booking_taught:' || p_booking_id::text;
  INSERT INTO public.points_ledger (user_id, points, action, reference_id, created_at)
  VALUES (v_booking.tutor_id, v_tutor_reward, v_tutor_key, p_booking_id, now())
  ON CONFLICT (action) DO NOTHING;

  -- Learner reward
  v_learner_key := 'booking_attended:' || p_booking_id::text;
  INSERT INTO public.points_ledger (user_id, points, action, reference_id, created_at)
  VALUES (v_booking.learner_id, v_learner_reward, v_learner_key, p_booking_id, now())
  ON CONFLICT (action) DO NOTHING;

  -- Update profiles reputation scores
  UPDATE public.profiles
  SET reputation_score = (SELECT coalesce(sum(points), 0) FROM public.points_ledger WHERE user_id = v_booking.tutor_id)
  WHERE id = v_booking.tutor_id;

  UPDATE public.profiles
  SET reputation_score = (SELECT coalesce(sum(points), 0) FROM public.points_ledger WHERE user_id = v_booking.learner_id)
  WHERE id = v_booking.learner_id;

  -- Log activity
  INSERT INTO public.user_activity_events (user_id, event_type, event_title, metadata, is_verified)
  VALUES 
    (v_booking.tutor_id, 'booking_completed', 'Completed Tutoring Session', jsonb_build_object('booking_id', p_booking_id, 'duration', v_booking.duration_minutes), true),
    (v_booking.learner_id, 'booking_completed', 'Completed Learning Session', jsonb_build_object('booking_id', p_booking_id, 'duration', v_booking.duration_minutes), true);

  RETURN jsonb_build_object('success', true, 'status', 'completed');
END;
$$;

-- 6. CLAIM CHALLENGE REWARD ATOMIC
CREATE OR REPLACE FUNCTION public.claim_challenge_reward_atomic(
  p_challenge_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_challenge record;
  v_progress record;
  v_action_key text;
BEGIN
  SELECT * INTO v_challenge
  FROM public.challenge_definitions
  WHERE id = p_challenge_id AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Challenge definition not found or inactive' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_progress
  FROM public.challenge_progress
  WHERE challenge_id = p_challenge_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No challenge progress found for user' USING ERRCODE = 'P0002';
  END IF;

  IF v_progress.status = 'claimed' THEN
    RETURN jsonb_build_object('success', true, 'status', 'claimed', 'already_claimed', true);
  END IF;

  IF v_progress.current_count < v_challenge.target_count THEN
    RAISE EXCEPTION 'Challenge requirements not yet met (current: %, required: %)', v_progress.current_count, v_challenge.target_count USING ERRCODE = '22000';
  END IF;

  UPDATE public.challenge_progress
  SET status = 'claimed', claimed_at = now(), updated_at = now()
  WHERE challenge_id = p_challenge_id AND user_id = p_user_id;

  v_action_key := 'challenge_claim:' || p_challenge_id::text || ':' || p_user_id::text;
  INSERT INTO public.points_ledger (user_id, points, action, reference_id, created_at)
  VALUES (p_user_id, v_challenge.points_reward, v_action_key, p_challenge_id, now())
  ON CONFLICT (action) DO NOTHING;

  UPDATE public.profiles
  SET reputation_score = (SELECT coalesce(sum(points), 0) FROM public.points_ledger WHERE user_id = p_user_id)
  WHERE id = p_user_id;

  INSERT INTO public.user_activity_events (user_id, event_type, event_title, metadata, is_verified)
  VALUES (p_user_id, 'challenge_claimed', 'Completed Challenge: ' || v_challenge.title, jsonb_build_object('challenge_id', p_challenge_id, 'points', v_challenge.points_reward), true);

  RETURN jsonb_build_object('success', true, 'status', 'claimed', 'points_awarded', v_challenge.points_reward);
END;
$$;

-- 7. ISSUE ACHIEVEMENT ATOMIC
CREATE OR REPLACE FUNCTION public.issue_achievement_atomic(
  p_user_id uuid,
  p_achievement_id uuid,
  p_issued_by uuid,
  p_is_public boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_achievement record;
  v_existing record;
  v_code text;
  v_action_key text;
BEGIN
  SELECT * INTO v_achievement
  FROM public.achievement_definitions
  WHERE id = p_achievement_id AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Achievement definition not found or inactive' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_existing
  FROM public.user_achievements
  WHERE user_id = p_user_id AND achievement_id = p_achievement_id;

  IF FOUND THEN
    RETURN jsonb_build_object('success', true, 'id', v_existing.id, 'verification_code', v_existing.verification_code, 'already_issued', true);
  END IF;

  -- Generate non-guessable verification code
  v_code := 'SB-ACH-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8)) || '-' || upper(substr(md5(random()::text || p_user_id::text), 1, 8));

  INSERT INTO public.user_achievements (
    user_id, achievement_id, verification_code, is_public, issued_at, created_at
  )
  VALUES (
    p_user_id, p_achievement_id, v_code, p_is_public, now(), now()
  );

  v_action_key := 'achievement_issued:' || p_achievement_id::text || ':' || p_user_id::text;
  IF v_achievement.points_reward > 0 THEN
    INSERT INTO public.points_ledger (user_id, points, action, reference_id, created_at)
    VALUES (p_user_id, v_achievement.points_reward, v_action_key, p_achievement_id, now())
    ON CONFLICT (action) DO NOTHING;

    UPDATE public.profiles
    SET reputation_score = (SELECT coalesce(sum(points), 0) FROM public.points_ledger WHERE user_id = p_user_id)
    WHERE id = p_user_id;
  END IF;

  INSERT INTO public.user_activity_events (user_id, event_type, event_title, metadata, is_verified)
  VALUES (p_user_id, 'achievement_earned', 'Earned Achievement: ' || v_achievement.title, jsonb_build_object('achievement_id', p_achievement_id, 'verification_code', v_code), true);

  RETURN jsonb_build_object('success', true, 'verification_code', v_code, 'points_reward', v_achievement.points_reward);
END;
$$;

-- REVOKE EXECUTE ON RPCs FROM PUBLIC / ANON
REVOKE EXECUTE ON FUNCTION public.activate_learning_goal_atomic(uuid, uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.complete_goal_milestone_atomic(uuid, uuid, text, uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.request_session_booking_atomic(uuid, uuid, uuid, timestamptz, timestamptz, text, text, text) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.update_booking_status_atomic(uuid, uuid, text, text, text) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.complete_booking_atomic(uuid, uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.claim_challenge_reward_atomic(uuid, uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.issue_achievement_atomic(uuid, uuid, uuid, boolean) FROM public, anon;

GRANT EXECUTE ON FUNCTION public.activate_learning_goal_atomic(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_goal_milestone_atomic(uuid, uuid, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.request_session_booking_atomic(uuid, uuid, uuid, timestamptz, timestamptz, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_booking_status_atomic(uuid, uuid, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_booking_atomic(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_challenge_reward_atomic(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.issue_achievement_atomic(uuid, uuid, uuid, boolean) TO service_role;

COMMIT;


-- =========================================
-- MIGRATION: 019_session_recordings.sql
-- =========================================

-- Migration 019: Session Local Recordings & YouTube Replay Integration

ALTER TABLE public.sessions
ADD COLUMN IF NOT EXISTS recording_url TEXT,
ADD COLUMN IF NOT EXISTS recording_video_id TEXT,
ADD COLUMN IF NOT EXISTS recording_provider TEXT DEFAULT 'youtube',
ADD COLUMN IF NOT EXISTS recording_status TEXT DEFAULT 'none',
ADD COLUMN IF NOT EXISTS recording_duration_seconds INTEGER DEFAULT 0;

-- Ensure constraint on recording_provider and recording_status
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sessions_recording_provider_check'
  ) THEN
    ALTER TABLE public.sessions
    ADD CONSTRAINT sessions_recording_provider_check
    CHECK (recording_provider IN ('youtube', 'google_drive', 'r2', 'custom'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sessions_recording_status_check'
  ) THEN
    ALTER TABLE public.sessions
    ADD CONSTRAINT sessions_recording_status_check
    CHECK (recording_status IN ('none', 'recording', 'uploading', 'ready', 'failed'));
  END IF;
END $$;

COMMENT ON COLUMN public.sessions.recording_url IS 'Public or unlisted URL to the session recording (e.g., YouTube unlisted embed link).';
COMMENT ON COLUMN public.sessions.recording_video_id IS 'Unique video ID from YouTube or the underlying media provider.';
COMMENT ON COLUMN public.sessions.recording_status IS 'Lifecycle status of the session recording (none, recording, uploading, ready, failed).';


-- =========================================
-- MIGRATION: 020_calls_p2p_hybrid.sql
-- =========================================

-- ============================================================================
-- Migration 020: P2P Calls Hybrid Architecture Schema & RLS
-- Description: Dedicated table and state machine for 1:1 WebRTC audio/video calls
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.calls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    caller_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    callee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('audio', 'video')),
    status TEXT NOT NULL CHECK (
        status IN (
            'initiating',
            'ringing',
            'accepted',
            'connecting',
            'connected',
            'reconnecting',
            'declined',
            'busy',
            'missed',
            'failed',
            'ended'
        )
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ringing_at TIMESTAMPTZ,
    answered_at TIMESTAMPTZ,
    connected_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    duration_seconds INTEGER NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
    end_reason TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT chk_caller_callee_different CHECK (caller_id <> callee_id)
);

-- Optimized Composite Indexes
CREATE INDEX IF NOT EXISTS idx_calls_caller ON public.calls(caller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_calls_callee ON public.calls(callee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_calls_status ON public.calls(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_calls_active ON public.calls(caller_id, callee_id, status)
    WHERE status IN ('initiating', 'ringing', 'accepted', 'connecting', 'connected', 'reconnecting');

-- Row Level Security (RLS)
ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;

-- Select Policy: Call participants and elevated admins
CREATE POLICY "Call participants can view their call records"
ON public.calls FOR SELECT
USING (
    caller_id = auth.uid() OR
    callee_id = auth.uid() OR
    EXISTS (
        SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND ('admin' = ANY(profiles.roles) OR 'moderator' = ANY(profiles.roles))
    )
);

-- Insert Policy: Authenticated users can only initiate calls where they are the caller
CREATE POLICY "Authenticated users can initiate calls"
ON public.calls FOR INSERT
WITH CHECK (
    auth.uid() = caller_id AND
    caller_id <> callee_id
);

-- Update Policy: Call participants can update call state
CREATE POLICY "Call participants can update call state"
ON public.calls FOR UPDATE
USING (
    caller_id = auth.uid() OR
    callee_id = auth.uid()
);


-- =========================================
-- MIGRATION: 021_room_atomic_security.sql
-- =========================================

-- Migration 021: Clean up obsolete RPCs and secure atomic room functions

-- 1. Revoke all from PUBLIC, anon, and authenticated
REVOKE ALL ON FUNCTION public.create_room_atomic FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_room_atomic FROM anon;
REVOKE ALL ON FUNCTION public.create_room_atomic FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_room_atomic TO service_role;

REVOKE ALL ON FUNCTION public.join_room_service_atomic FROM PUBLIC;
REVOKE ALL ON FUNCTION public.join_room_service_atomic FROM anon;
REVOKE ALL ON FUNCTION public.join_room_service_atomic FROM authenticated;
GRANT EXECUTE ON FUNCTION public.join_room_service_atomic TO service_role;

REVOKE ALL ON FUNCTION public.leave_room_service_atomic FROM PUBLIC;
REVOKE ALL ON FUNCTION public.leave_room_service_atomic FROM anon;
REVOKE ALL ON FUNCTION public.leave_room_service_atomic FROM authenticated;
GRANT EXECUTE ON FUNCTION public.leave_room_service_atomic TO service_role;

-- 2. Drop obsolete overloads of create_room_atomic if they exist
-- (The most up-to-date has p_campus_location as text)
-- Drop previous versions missing parameters to avoid ambiguous function calls

DO $$
BEGIN
  -- We use dynamic SQL or try-catch for dropping if exists since function arguments changed over time
  -- Previous version without campus_location
  DROP FUNCTION IF EXISTS public.create_room_atomic(
    text, text, text, text, integer, text, text[], text, uuid
  );
  
  -- Version without topic, mode, campus_location
  DROP FUNCTION IF EXISTS public.create_room_atomic(
    text, text, text, integer, text[], text, uuid
  );
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;


-- =========================================
-- MIGRATION: 022_admin_access_management.sql
-- =========================================

-- Enum Types
CREATE TYPE admin_role AS ENUM ('owner', 'admin', 'co_admin', 'auditor');
CREATE TYPE admin_status AS ENUM ('pending', 'active', 'suspended', 'revoked');
CREATE TYPE admin_invitation_status AS ENUM ('pending', 'accepted', 'expired', 'revoked');
CREATE TYPE admin_bootstrap_status AS ENUM ('pending', 'provisioned', 'consumed', 'disabled');

-- Admin Accounts
CREATE TABLE admin_accounts (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role admin_role NOT NULL DEFAULT 'co_admin',
  status admin_status NOT NULL DEFAULT 'pending',
  must_change_credentials BOOLEAN NOT NULL DEFAULT true,
  mfa_required BOOLEAN NOT NULL DEFAULT true,
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  activated_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Admin Invitations
CREATE TABLE admin_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  role admin_role NOT NULL DEFAULT 'co_admin',
  token_hash TEXT NOT NULL,
  status admin_invitation_status NOT NULL DEFAULT 'pending',
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique index to prevent multiple active invitations for the same email
CREATE UNIQUE INDEX idx_admin_invitations_email_active ON admin_invitations(email) WHERE status = 'pending';

-- Admin Bootstrap State
CREATE TABLE admin_bootstrap_state (
  id UUID PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  status admin_bootstrap_status NOT NULL DEFAULT 'pending',
  provisioned_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  provisioned_at TIMESTAMPTZ,
  consumed_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1
);
-- Ensure it remains a singleton
ALTER TABLE admin_bootstrap_state ADD CONSTRAINT admin_bootstrap_state_singleton_check CHECK (id = '00000000-0000-0000-0000-000000000001'::uuid);

-- Admin Audit Logs (append-only)
CREATE TABLE admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  metadata JSONB,
  result TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  correlation_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION update_admin_accounts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

drop trigger if exists update_admin_accounts_timestamp on admin_accounts;
CREATE TRIGGER update_admin_accounts_timestamp
BEFORE UPDATE ON admin_accounts
FOR EACH ROW
EXECUTE FUNCTION update_admin_accounts_updated_at();

-- RLS Configuration
ALTER TABLE admin_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_bootstrap_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_audit_logs ENABLE ROW LEVEL SECURITY;

-- Block browser clients from modifying authorization tables directly
-- Only service_role can perform writes
drop policy if exists admin_accounts_read_self on admin_accounts;
CREATE POLICY admin_accounts_read_self ON admin_accounts
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

drop policy if exists admin_accounts_service_all on admin_accounts;
CREATE POLICY admin_accounts_service_all ON admin_accounts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

drop policy if exists admin_invitations_service_all on admin_invitations;
CREATE POLICY admin_invitations_service_all ON admin_invitations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

drop policy if exists admin_bootstrap_state_service_all on admin_bootstrap_state;
CREATE POLICY admin_bootstrap_state_service_all ON admin_bootstrap_state
  FOR ALL TO service_role USING (true) WITH CHECK (true);

drop policy if exists admin_audit_logs_service_all on admin_audit_logs;
CREATE POLICY admin_audit_logs_service_all ON admin_audit_logs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- End of migration


-- =========================================
-- MIGRATION: 023_onboarding_resilience_and_profile_repair.sql
-- =========================================

-- Migration 023: Onboarding Resilience, Profile Provisioning Self-Healing & Race Protection
-- Ensures all profile columns exist, hardens handle_new_user against username collisions and races,
-- upgrades save_onboarding_progress_atomic to self-heal missing profile rows, and repairs existing orphaned auth users.

BEGIN;

-- 1. Ensure all required profile columns exist idempotently
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferred_locale text DEFAULT 'en' CHECK (preferred_locale IN ('en', 'bn')),
  ADD COLUMN IF NOT EXISTS onboarding_step text DEFAULT 'language',
  ADD COLUMN IF NOT EXISTS onboarding_status text DEFAULT 'not_started' CHECK (onboarding_status IN ('not_started', 'in_progress', 'completed', 'skipped')),
  ADD COLUMN IF NOT EXISTS onboarding_version integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS onboarding_mission text DEFAULT 'both' CHECK (onboarding_mission IN ('learn', 'teach', 'both', 'research')),
  ADD COLUMN IF NOT EXISTS onboarding_push_opt_in boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS study_mode_preference text DEFAULT 'hybrid' CHECK (study_mode_preference IN ('online', 'offline', 'hybrid')),
  ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'Asia/Dhaka',
  ADD COLUMN IF NOT EXISTS profile_completion_percent integer DEFAULT 0 CHECK (profile_completion_percent BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS profile_missing_fields text[] DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean DEFAULT false;

-- 2. Upgrade handle_new_user with collision resistance and race safety
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base_username text;
  v_final_username text;
  v_suffix integer := 0;
  v_full_name text;
BEGIN
  v_full_name := coalesce(nullif(btrim(NEW.raw_user_meta_data->>'full_name'), ''), 'New member');
  v_base_username := 'user_' || substr(replace(NEW.id::text, '-', ''), 1, 10);
  v_final_username := v_base_username;

  -- Ensure username collision safety
  WHILE EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE lower(username) = lower(v_final_username) AND id <> NEW.id
  ) LOOP
    v_suffix := v_suffix + 1;
    v_final_username := substr(v_base_username, 1, 24) || '_' || v_suffix::text;
  END LOOP;

  INSERT INTO public.profiles (
    id,
    full_name,
    username,
    preferred_locale,
    study_mode_preference,
    onboarding_step,
    onboarding_status,
    onboarding_version,
    onboarding_mission,
    onboarding_push_opt_in,
    timezone,
    profile_completion_percent,
    profile_missing_fields,
    onboarding_completed
  )
  VALUES (
    NEW.id,
    v_full_name,
    v_final_username,
    'en',
    'hybrid',
    'language',
    'not_started',
    1,
    'both',
    true,
    'Asia/Dhaka',
    0,
    ARRAY['full_name', 'username', 'university', 'department', 'study_mode_preference', 'teach_skills', 'learn_skills']::text[],
    false
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = CASE WHEN public.profiles.full_name IS NULL OR public.profiles.full_name = 'New member' THEN EXCLUDED.full_name ELSE public.profiles.full_name END;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Prevent auth signup blocking on profile provisioning failure
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
drop trigger if exists on_auth_user_created on auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_new_user();

-- 3. Upgrade save_onboarding_progress_atomic with self-healing and atomic synchronization
CREATE OR REPLACE FUNCTION public.save_onboarding_progress_atomic(
  p_user_id uuid,
  p_profile jsonb,
  p_teach_skills text[],
  p_learn_skills text[]
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_skill_name text;
  v_skill_id uuid;
  v_missing text[] := ARRAY[]::text[];
  v_completed integer := 0;
  v_percent integer;
  v_profile public.profiles%ROWTYPE;
  v_known_count integer;
  v_wanted_count integer;
  v_was_completed boolean;
  v_existing_status text;
  v_requested_status text;
  v_base_username text;
  v_final_username text;
  v_suffix integer := 0;
BEGIN
  IF p_profile IS NULL OR jsonb_typeof(p_profile) <> 'object' THEN
    RAISE EXCEPTION 'Profile payload must be a JSON object';
  END IF;

  -- 3.1 Fetch existing profile with lock or self-heal missing record
  SELECT onboarding_completed OR onboarding_status IN ('completed', 'skipped'), onboarding_status
  INTO v_was_completed, v_existing_status
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    v_base_username := 'user_' || substr(replace(p_user_id::text, '-', ''), 1, 10);
    v_final_username := v_base_username;

    WHILE EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE lower(username) = lower(v_final_username) AND id <> p_user_id
    ) LOOP
      v_suffix := v_suffix + 1;
      v_final_username := substr(v_base_username, 1, 24) || '_' || v_suffix::text;
    END LOOP;

    INSERT INTO public.profiles (
      id,
      full_name,
      username,
      preferred_locale,
      study_mode_preference,
      onboarding_step,
      onboarding_status,
      onboarding_version,
      onboarding_mission,
      onboarding_push_opt_in,
      timezone,
      profile_completion_percent,
      profile_missing_fields,
      onboarding_completed
    )
    VALUES (
      p_user_id,
      coalesce(nullif(btrim(p_profile->>'full_name'), ''), 'New member'),
      coalesce(nullif(lower(btrim(p_profile->>'username')), ''), v_final_username),
      coalesce(p_profile->>'preferred_locale', 'en'),
      coalesce(p_profile->>'study_mode_preference', 'hybrid'),
      coalesce(p_profile->>'onboarding_step', 'language'),
      coalesce(p_profile->>'onboarding_status', 'in_progress'),
      coalesce((p_profile->>'onboarding_version')::integer, 1),
      coalesce(p_profile->>'onboarding_mission', 'both'),
      coalesce((p_profile->>'onboarding_push_opt_in')::boolean, true),
      coalesce(p_profile->>'timezone', 'Asia/Dhaka'),
      0,
      ARRAY[]::text[],
      false
    )
    ON CONFLICT (id) DO NOTHING;

    SELECT onboarding_completed OR onboarding_status IN ('completed', 'skipped'), onboarding_status
    INTO v_was_completed, v_existing_status
    FROM public.profiles
    WHERE id = p_user_id
    FOR UPDATE;
  END IF;

  v_requested_status := p_profile->>'onboarding_status';

  -- 3.2 Check username conflict if explicitly supplied
  IF p_profile ? 'username' AND EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE lower(username) = lower(btrim(p_profile->>'username'))
      AND id <> p_user_id
  ) THEN
    RAISE EXCEPTION 'Username is already taken' USING ERRCODE = '23505';
  END IF;

  -- 3.3 Update profile fields
  UPDATE public.profiles
  SET
    full_name = CASE WHEN p_profile ? 'full_name' THEN btrim(p_profile->>'full_name') ELSE full_name END,
    username = CASE WHEN p_profile ? 'username' THEN lower(btrim(p_profile->>'username')) ELSE username END,
    bio = CASE WHEN p_profile ? 'bio' THEN nullif(btrim(p_profile->>'bio'), '') ELSE bio END,
    university = CASE WHEN p_profile ? 'university' THEN nullif(btrim(p_profile->>'university'), '') ELSE university END,
    department = CASE WHEN p_profile ? 'department' THEN nullif(btrim(p_profile->>'department'), '') ELSE department END,
    batch = CASE WHEN p_profile ? 'batch' THEN nullif(btrim(p_profile->>'batch'), '') ELSE batch END,
    study_mode_preference = CASE WHEN p_profile ? 'study_mode_preference' THEN p_profile->>'study_mode_preference' ELSE study_mode_preference END,
    profile_visibility = CASE WHEN p_profile ? 'profile_visibility' THEN p_profile->>'profile_visibility' ELSE profile_visibility END,
    preferred_locale = CASE WHEN p_profile ? 'preferred_locale' THEN p_profile->>'preferred_locale' ELSE preferred_locale END,
    onboarding_step = CASE WHEN p_profile ? 'onboarding_step' THEN p_profile->>'onboarding_step' ELSE onboarding_step END,
    onboarding_version = CASE WHEN p_profile ? 'onboarding_version' THEN (p_profile->>'onboarding_version')::integer ELSE onboarding_version END,
    onboarding_mission = CASE WHEN p_profile ? 'onboarding_mission' THEN p_profile->>'onboarding_mission' ELSE onboarding_mission END,
    onboarding_push_opt_in = CASE WHEN p_profile ? 'onboarding_push_opt_in' THEN (p_profile->>'onboarding_push_opt_in')::boolean ELSE onboarding_push_opt_in END,
    timezone = CASE WHEN p_profile ? 'timezone' THEN p_profile->>'timezone' ELSE timezone END,
    updated_at = now()
  WHERE id = p_user_id;

  -- 3.4 Synchronize teach skills only when p_teach_skills is explicitly provided (not null)
  IF p_teach_skills IS NOT NULL THEN
    DELETE FROM public.user_skills us
    USING public.skills s
    WHERE us.user_id = p_user_id
      AND us.kind = 'known'
      AND us.skill_id = s.id
      AND NOT us.verified
      AND NOT EXISTS (
        SELECT 1 FROM unnest(p_teach_skills) item
        WHERE lower(btrim(item)) = lower(s.name)
      );

    FOR v_skill_name IN
      SELECT min(btrim(item))
      FROM unnest(p_teach_skills) item
      WHERE char_length(btrim(item)) BETWEEN 1 AND 60
      GROUP BY lower(btrim(item))
    LOOP
      PERFORM pg_advisory_xact_lock(hashtext('skill:' || lower(v_skill_name)));
      v_skill_id := NULL;
      SELECT id INTO v_skill_id
      FROM public.skills
      WHERE lower(name) = lower(v_skill_name)
      ORDER BY created_at, id
      LIMIT 1;
      IF v_skill_id IS NULL THEN
        INSERT INTO public.skills(name, category)
        VALUES (v_skill_name, 'General')
        ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
        RETURNING id INTO v_skill_id;
      END IF;

      INSERT INTO public.user_skills(user_id, skill_id, kind, proficiency)
      VALUES (p_user_id, v_skill_id, 'known', 4)
      ON CONFLICT (user_id, skill_id, kind)
      DO UPDATE SET proficiency = GREATEST(public.user_skills.proficiency, EXCLUDED.proficiency);
    END LOOP;
  END IF;

  -- 3.5 Synchronize learn skills only when p_learn_skills is explicitly provided (not null)
  IF p_learn_skills IS NOT NULL THEN
    DELETE FROM public.user_skills us
    USING public.skills s
    WHERE us.user_id = p_user_id
      AND us.kind = 'wanted'
      AND us.skill_id = s.id
      AND NOT EXISTS (
        SELECT 1 FROM unnest(p_learn_skills) item
        WHERE lower(btrim(item)) = lower(s.name)
      );

    FOR v_skill_name IN
      SELECT min(btrim(item))
      FROM unnest(p_learn_skills) item
      WHERE char_length(btrim(item)) BETWEEN 1 AND 60
      GROUP BY lower(btrim(item))
    LOOP
      PERFORM pg_advisory_xact_lock(hashtext('skill:' || lower(v_skill_name)));
      v_skill_id := NULL;
      SELECT id INTO v_skill_id
      FROM public.skills
      WHERE lower(name) = lower(v_skill_name)
      ORDER BY created_at, id
      LIMIT 1;
      IF v_skill_id IS NULL THEN
        INSERT INTO public.skills(name, category)
        VALUES (v_skill_name, 'General')
        ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
        RETURNING id INTO v_skill_id;
      END IF;

      INSERT INTO public.user_skills(user_id, skill_id, kind, proficiency)
      VALUES (p_user_id, v_skill_id, 'wanted', 1)
      ON CONFLICT (user_id, skill_id, kind) DO NOTHING;
    END LOOP;
  END IF;

  -- 3.6 Recompute completeness metrics
  SELECT count(*)::integer INTO v_known_count
  FROM public.user_skills WHERE user_id = p_user_id AND kind = 'known';
  SELECT count(*)::integer INTO v_wanted_count
  FROM public.user_skills WHERE user_id = p_user_id AND kind = 'wanted';
  SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id;

  IF nullif(btrim(v_profile.full_name), '') IS NOT NULL AND lower(btrim(v_profile.full_name)) <> 'new member' THEN v_completed := v_completed + 1; ELSE v_missing := array_append(v_missing, 'full_name'); END IF;
  IF nullif(btrim(v_profile.username), '') IS NOT NULL AND v_profile.username !~ '^user_[0-9a-f]{10}$' THEN v_completed := v_completed + 1; ELSE v_missing := array_append(v_missing, 'username'); END IF;
  IF nullif(btrim(v_profile.university), '') IS NOT NULL THEN v_completed := v_completed + 1; ELSE v_missing := array_append(v_missing, 'university'); END IF;
  IF nullif(btrim(v_profile.department), '') IS NOT NULL THEN v_completed := v_completed + 1; ELSE v_missing := array_append(v_missing, 'department'); END IF;
  IF v_profile.study_mode_preference IS NOT NULL THEN v_completed := v_completed + 1; ELSE v_missing := array_append(v_missing, 'study_mode_preference'); END IF;
  IF v_known_count > 0 THEN v_completed := v_completed + 1; ELSE v_missing := array_append(v_missing, 'teach_skills'); END IF;
  IF v_wanted_count > 0 THEN v_completed := v_completed + 1; ELSE v_missing := array_append(v_missing, 'learn_skills'); END IF;

  v_percent := round((v_completed::numeric / 7::numeric) * 100)::integer;

  UPDATE public.profiles
  SET profile_completion_percent = v_percent,
      profile_missing_fields = v_missing,
      onboarding_status = CASE
        WHEN v_was_completed THEN CASE WHEN v_existing_status = 'skipped' THEN 'skipped' ELSE 'completed' END
        WHEN v_requested_status IN ('completed', 'skipped')
          AND p_profile->>'onboarding_step' = 'completed'
          AND nullif(btrim(v_profile.full_name), '') IS NOT NULL AND lower(btrim(v_profile.full_name)) <> 'new member'
          AND nullif(btrim(v_profile.username), '') IS NOT NULL AND v_profile.username !~ '^user_[0-9a-f]{10}$'
          THEN v_requested_status
        WHEN v_requested_status IN ('not_started', 'in_progress') THEN v_requested_status
        ELSE onboarding_status
      END,
      onboarding_completed = CASE
        WHEN v_was_completed THEN true
        WHEN v_requested_status IN ('completed', 'skipped')
          AND p_profile->>'onboarding_step' = 'completed'
          AND nullif(btrim(v_profile.full_name), '') IS NOT NULL AND lower(btrim(v_profile.full_name)) <> 'new member'
          AND nullif(btrim(v_profile.username), '') IS NOT NULL AND v_profile.username !~ '^user_[0-9a-f]{10}$'
          THEN true
        WHEN v_requested_status IN ('not_started', 'in_progress') THEN false
        ELSE onboarding_completed
      END,
      updated_at = now()
  WHERE id = p_user_id
  RETURNING * INTO v_profile;

  RETURN jsonb_build_object(
    'profile', to_jsonb(v_profile),
    'completion_percent', v_percent,
    'missing_fields', to_jsonb(v_missing),
    'skills_known', (
      SELECT coalesce(jsonb_agg(s.name ORDER BY s.name), '[]'::jsonb)
      FROM public.user_skills us JOIN public.skills s ON s.id = us.skill_id
      WHERE us.user_id = p_user_id AND us.kind = 'known'
    ),
    'skills_wanted', (
      SELECT coalesce(jsonb_agg(s.name ORDER BY s.name), '[]'::jsonb)
      FROM public.user_skills us JOIN public.skills s ON s.id = us.skill_id
      WHERE us.user_id = p_user_id AND us.kind = 'wanted'
    )
  );
END;
$$;

-- 4. Set secure RPC permissions
REVOKE ALL ON FUNCTION public.save_onboarding_progress_atomic(uuid, jsonb, text[], text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_onboarding_progress_atomic(uuid, jsonb, text[], text[]) TO service_role;

-- 5. Safe idempotent repair of existing auth users without a profile row
INSERT INTO public.profiles (
  id,
  full_name,
  username,
  preferred_locale,
  study_mode_preference,
  onboarding_step,
  onboarding_status,
  onboarding_version,
  onboarding_mission,
  onboarding_push_opt_in,
  timezone,
  profile_completion_percent,
  profile_missing_fields,
  onboarding_completed
)
SELECT
  u.id,
  coalesce(nullif(btrim(u.raw_user_meta_data->>'full_name'), ''), 'New member'),
  'user_' || substr(replace(u.id::text, '-', ''), 1, 10),
  'en',
  'hybrid',
  'language',
  'not_started',
  1,
  'both',
  true,
  'Asia/Dhaka',
  0,
  ARRAY['full_name', 'username', 'university', 'department', 'study_mode_preference', 'teach_skills', 'learn_skills']::text[],
  false
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

COMMIT;


-- =========================================
-- MIGRATION: 024_google_oauth_metadata_and_avatar_resilience.sql
-- =========================================

-- Migration 024: Google OAuth Metadata, Avatar & Username Resilience
-- Hardens public.handle_new_user() to support both 'full_name' and 'name' as well as 'avatar_url' and 'picture' from OAuth providers.

BEGIN;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base_username text;
  v_final_username text;
  v_suffix integer := 0;
  v_full_name text;
  v_avatar_url text;
BEGIN
  -- Safe extraction of full name across email/password and OAuth providers (Google, Facebook, etc.)
  v_full_name := coalesce(
    nullif(btrim(NEW.raw_user_meta_data->>'full_name'), ''),
    nullif(btrim(NEW.raw_user_meta_data->>'name'), ''),
    'New member'
  );

  -- Safe extraction of avatar URL
  v_avatar_url := coalesce(
    nullif(btrim(NEW.raw_user_meta_data->>'avatar_url'), ''),
    nullif(btrim(NEW.raw_user_meta_data->>'picture'), ''),
    null
  );

  -- Collision-resistant base username
  v_base_username := 'user_' || substr(replace(NEW.id::text, '-', ''), 1, 10);
  v_final_username := v_base_username;

  -- Ensure username uniqueness
  WHILE EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE lower(username) = lower(v_final_username) AND id <> NEW.id
  ) LOOP
    v_suffix := v_suffix + 1;
    v_final_username := substr(v_base_username, 1, 24) || '_' || v_suffix::text;
  END LOOP;

  INSERT INTO public.profiles (
    id,
    full_name,
    avatar_url,
    username,
    preferred_locale,
    study_mode_preference,
    onboarding_step,
    onboarding_status,
    onboarding_version,
    onboarding_mission,
    onboarding_push_opt_in,
    timezone,
    profile_completion_percent,
    profile_missing_fields,
    onboarding_completed
  )
  VALUES (
    NEW.id,
    v_full_name,
    v_avatar_url,
    v_final_username,
    'en',
    'hybrid',
    'language',
    'not_started',
    1,
    'both',
    true,
    'Asia/Dhaka',
    0,
    ARRAY['full_name', 'username', 'university', 'department', 'study_mode_preference', 'teach_skills', 'learn_skills']::text[],
    false
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = CASE
      WHEN public.profiles.full_name IS NULL OR public.profiles.full_name = 'New member'
      THEN EXCLUDED.full_name
      ELSE public.profiles.full_name
    END,
    avatar_url = CASE
      WHEN public.profiles.avatar_url IS NULL
      THEN EXCLUDED.avatar_url
      ELSE public.profiles.avatar_url
    END;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Prevent auth signup blocking on profile provisioning failure
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
drop trigger if exists on_auth_user_created on auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_new_user();

COMMIT;


-- =========================================
-- MIGRATION: 025_profile_provisioning_and_progressive_onboarding.sql
-- =========================================

-- Migration 025: Profile Provisioning, Onboarding 500 Repair & Progressive Setup
-- Adds 'deferred' status, hardens save_onboarding_progress_atomic for partial payloads & skill omission,
-- and ensures robust initial profile creation for all auth methods.

BEGIN;

-- 1. Update onboarding_status constraint to support 'deferred'
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_onboarding_status_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_onboarding_status_check
  CHECK (onboarding_status IN ('not_started', 'in_progress', 'deferred', 'completed', 'skipped'));

-- 2. Upgrade handle_new_user function with complete OAuth metadata resilience
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base_username text;
  v_final_username text;
  v_suffix integer := 0;
  v_full_name text;
  v_avatar_url text;
BEGIN
  -- Extract display name from full_name or name
  v_full_name := coalesce(
    nullif(btrim(NEW.raw_user_meta_data->>'full_name'), ''),
    nullif(btrim(NEW.raw_user_meta_data->>'name'), ''),
    'New member'
  );

  -- Extract avatar from avatar_url or picture
  v_avatar_url := coalesce(
    nullif(btrim(NEW.raw_user_meta_data->>'avatar_url'), ''),
    nullif(btrim(NEW.raw_user_meta_data->>'picture'), ''),
    null
  );

  -- Generate unique base username
  v_base_username := 'user_' || substr(replace(NEW.id::text, '-', ''), 1, 10);
  v_final_username := v_base_username;

  -- Ensure username collision safety
  WHILE EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE lower(username) = lower(v_final_username) AND id <> NEW.id
  ) LOOP
    v_suffix := v_suffix + 1;
    v_final_username := substr(v_base_username, 1, 24) || '_' || v_suffix::text;
  END LOOP;

  INSERT INTO public.profiles (
    id,
    full_name,
    avatar_url,
    username,
    preferred_locale,
    study_mode_preference,
    onboarding_step,
    onboarding_status,
    onboarding_version,
    onboarding_mission,
    onboarding_push_opt_in,
    timezone,
    profile_completion_percent,
    profile_missing_fields,
    onboarding_completed
  )
  VALUES (
    NEW.id,
    v_full_name,
    v_avatar_url,
    v_final_username,
    'en',
    'hybrid',
    'language',
    'not_started',
    1,
    'both',
    true,
    'Asia/Dhaka',
    0,
    ARRAY['full_name', 'username', 'university', 'department', 'study_mode_preference', 'teach_skills', 'learn_skills']::text[],
    false
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = CASE
      WHEN public.profiles.full_name IS NULL OR public.profiles.full_name = 'New member'
      THEN EXCLUDED.full_name
      ELSE public.profiles.full_name
    END,
    avatar_url = CASE
      WHEN public.profiles.avatar_url IS NULL
      THEN EXCLUDED.avatar_url
      ELSE public.profiles.avatar_url
    END;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Prevent auth signup blocking on profile provisioning failure
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
drop trigger if exists on_auth_user_created on auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_new_user();

-- 3. Upgrade save_onboarding_progress_atomic with partial update support and deferred status
CREATE OR REPLACE FUNCTION public.save_onboarding_progress_atomic(
  p_user_id uuid,
  p_profile jsonb,
  p_teach_skills text[],
  p_learn_skills text[]
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_skill_name text;
  v_skill_id uuid;
  v_missing text[] := ARRAY[]::text[];
  v_completed integer := 0;
  v_percent integer;
  v_profile public.profiles%ROWTYPE;
  v_known_count integer;
  v_wanted_count integer;
  v_was_completed boolean;
  v_existing_status text;
  v_requested_status text;
  v_base_username text;
  v_final_username text;
  v_suffix integer := 0;
BEGIN
  IF p_profile IS NULL OR jsonb_typeof(p_profile) <> 'object' THEN
    RAISE EXCEPTION 'Profile payload must be a JSON object';
  END IF;

  -- 3.1 Fetch existing profile with lock or self-heal missing record
  SELECT onboarding_completed OR onboarding_status IN ('completed', 'skipped'), onboarding_status
  INTO v_was_completed, v_existing_status
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    v_base_username := 'user_' || substr(replace(p_user_id::text, '-', ''), 1, 10);
    v_final_username := v_base_username;

    WHILE EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE lower(username) = lower(v_final_username) AND id <> p_user_id
    ) LOOP
      v_suffix := v_suffix + 1;
      v_final_username := substr(v_base_username, 1, 24) || '_' || v_suffix::text;
    END LOOP;

    INSERT INTO public.profiles (
      id,
      full_name,
      username,
      preferred_locale,
      study_mode_preference,
      onboarding_step,
      onboarding_status,
      onboarding_version,
      onboarding_mission,
      onboarding_push_opt_in,
      timezone,
      profile_completion_percent,
      profile_missing_fields,
      onboarding_completed
    )
    VALUES (
      p_user_id,
      coalesce(nullif(btrim(p_profile->>'full_name'), ''), 'New member'),
      coalesce(nullif(lower(btrim(p_profile->>'username')), ''), v_final_username),
      coalesce(p_profile->>'preferred_locale', 'en'),
      coalesce(p_profile->>'study_mode_preference', 'hybrid'),
      coalesce(p_profile->>'onboarding_step', 'language'),
      coalesce(p_profile->>'onboarding_status', 'in_progress'),
      coalesce((p_profile->>'onboarding_version')::integer, 1),
      coalesce(p_profile->>'onboarding_mission', 'both'),
      coalesce((p_profile->>'onboarding_push_opt_in')::boolean, true),
      coalesce(p_profile->>'timezone', 'Asia/Dhaka'),
      0,
      ARRAY[]::text[],
      false
    )
    ON CONFLICT (id) DO NOTHING;

    SELECT onboarding_completed OR onboarding_status IN ('completed', 'skipped'), onboarding_status
    INTO v_was_completed, v_existing_status
    FROM public.profiles
    WHERE id = p_user_id
    FOR UPDATE;
  END IF;

  v_requested_status := p_profile->>'onboarding_status';

  -- 3.2 Check username conflict if explicitly supplied
  IF p_profile ? 'username' AND EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE lower(username) = lower(btrim(p_profile->>'username'))
      AND id <> p_user_id
  ) THEN
    RAISE EXCEPTION 'Username is already taken' USING ERRCODE = '23505';
  END IF;

  -- 3.3 Update profile fields partially (only update fields present in p_profile JSON object)
  UPDATE public.profiles
  SET
    full_name = CASE WHEN p_profile ? 'full_name' THEN btrim(p_profile->>'full_name') ELSE full_name END,
    username = CASE WHEN p_profile ? 'username' THEN lower(btrim(p_profile->>'username')) ELSE username END,
    avatar_url = CASE WHEN p_profile ? 'avatar_url' THEN nullif(btrim(p_profile->>'avatar_url'), '') ELSE avatar_url END,
    bio = CASE WHEN p_profile ? 'bio' THEN nullif(btrim(p_profile->>'bio'), '') ELSE bio END,
    university = CASE WHEN p_profile ? 'university' THEN nullif(btrim(p_profile->>'university'), '') ELSE university END,
    department = CASE WHEN p_profile ? 'department' THEN nullif(btrim(p_profile->>'department'), '') ELSE department END,
    batch = CASE WHEN p_profile ? 'batch' THEN nullif(btrim(p_profile->>'batch'), '') ELSE batch END,
    study_mode_preference = CASE WHEN p_profile ? 'study_mode_preference' THEN p_profile->>'study_mode_preference' ELSE study_mode_preference END,
    profile_visibility = CASE WHEN p_profile ? 'profile_visibility' THEN p_profile->>'profile_visibility' ELSE profile_visibility END,
    preferred_locale = CASE WHEN p_profile ? 'preferred_locale' THEN p_profile->>'preferred_locale' ELSE preferred_locale END,
    onboarding_step = CASE WHEN p_profile ? 'onboarding_step' THEN p_profile->>'onboarding_step' ELSE onboarding_step END,
    onboarding_version = CASE WHEN p_profile ? 'onboarding_version' THEN (p_profile->>'onboarding_version')::integer ELSE onboarding_version END,
    onboarding_mission = CASE WHEN p_profile ? 'onboarding_mission' THEN p_profile->>'onboarding_mission' ELSE onboarding_mission END,
    onboarding_push_opt_in = CASE WHEN p_profile ? 'onboarding_push_opt_in' THEN (p_profile->>'onboarding_push_opt_in')::boolean ELSE onboarding_push_opt_in END,
    timezone = CASE WHEN p_profile ? 'timezone' THEN p_profile->>'timezone' ELSE timezone END,
    updated_at = now()
  WHERE id = p_user_id;

  -- 3.4 Synchronize teach skills only when p_teach_skills is explicitly provided (not null)
  IF p_teach_skills IS NOT NULL THEN
    DELETE FROM public.user_skills us
    USING public.skills s
    WHERE us.user_id = p_user_id
      AND us.kind = 'known'
      AND us.skill_id = s.id
      AND NOT us.verified
      AND NOT EXISTS (
        SELECT 1 FROM unnest(p_teach_skills) item
        WHERE lower(btrim(item)) = lower(s.name)
      );

    FOR v_skill_name IN
      SELECT min(btrim(item))
      FROM unnest(p_teach_skills) item
      WHERE char_length(btrim(item)) BETWEEN 1 AND 60
      GROUP BY lower(btrim(item))
    LOOP
      PERFORM pg_advisory_xact_lock(hashtext('skill:' || lower(v_skill_name)));
      v_skill_id := NULL;
      SELECT id INTO v_skill_id
      FROM public.skills
      WHERE lower(name) = lower(v_skill_name)
      ORDER BY created_at, id
      LIMIT 1;
      IF v_skill_id IS NULL THEN
        INSERT INTO public.skills(name, category)
        VALUES (v_skill_name, 'General')
        ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
        RETURNING id INTO v_skill_id;
      END IF;

      INSERT INTO public.user_skills(user_id, skill_id, kind, proficiency)
      VALUES (p_user_id, v_skill_id, 'known', 4)
      ON CONFLICT (user_id, skill_id, kind)
      DO UPDATE SET proficiency = GREATEST(public.user_skills.proficiency, EXCLUDED.proficiency);
    END LOOP;
  END IF;

  -- 3.5 Synchronize learn skills only when p_learn_skills is explicitly provided (not null)
  IF p_learn_skills IS NOT NULL THEN
    DELETE FROM public.user_skills us
    USING public.skills s
    WHERE us.user_id = p_user_id
      AND us.kind = 'wanted'
      AND us.skill_id = s.id
      AND NOT EXISTS (
        SELECT 1 FROM unnest(p_learn_skills) item
        WHERE lower(btrim(item)) = lower(s.name)
      );

    FOR v_skill_name IN
      SELECT min(btrim(item))
      FROM unnest(p_learn_skills) item
      WHERE char_length(btrim(item)) BETWEEN 1 AND 60
      GROUP BY lower(btrim(item))
    LOOP
      PERFORM pg_advisory_xact_lock(hashtext('skill:' || lower(v_skill_name)));
      v_skill_id := NULL;
      SELECT id INTO v_skill_id
      FROM public.skills
      WHERE lower(name) = lower(v_skill_name)
      ORDER BY created_at, id
      LIMIT 1;
      IF v_skill_id IS NULL THEN
        INSERT INTO public.skills(name, category)
        VALUES (v_skill_name, 'General')
        ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
        RETURNING id INTO v_skill_id;
      END IF;

      INSERT INTO public.user_skills(user_id, skill_id, kind, proficiency)
      VALUES (p_user_id, v_skill_id, 'wanted', 1)
      ON CONFLICT (user_id, skill_id, kind) DO NOTHING;
    END LOOP;
  END IF;

  -- 3.6 Recompute completeness metrics across the 7 canonical profile indicators
  SELECT count(*)::integer INTO v_known_count
  FROM public.user_skills WHERE user_id = p_user_id AND kind = 'known';
  SELECT count(*)::integer INTO v_wanted_count
  FROM public.user_skills WHERE user_id = p_user_id AND kind = 'wanted';
  SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id;

  IF nullif(btrim(v_profile.full_name), '') IS NOT NULL AND lower(btrim(v_profile.full_name)) <> 'new member' THEN v_completed := v_completed + 1; ELSE v_missing := array_append(v_missing, 'full_name'); END IF;
  IF nullif(btrim(v_profile.username), '') IS NOT NULL AND v_profile.username !~ '^user_[0-9a-f]{10}$' THEN v_completed := v_completed + 1; ELSE v_missing := array_append(v_missing, 'username'); END IF;
  IF nullif(btrim(v_profile.university), '') IS NOT NULL THEN v_completed := v_completed + 1; ELSE v_missing := array_append(v_missing, 'university'); END IF;
  IF nullif(btrim(v_profile.department), '') IS NOT NULL THEN v_completed := v_completed + 1; ELSE v_missing := array_append(v_missing, 'department'); END IF;
  IF v_profile.study_mode_preference IS NOT NULL THEN v_completed := v_completed + 1; ELSE v_missing := array_append(v_missing, 'study_mode_preference'); END IF;
  IF v_known_count > 0 THEN v_completed := v_completed + 1; ELSE v_missing := array_append(v_missing, 'teach_skills'); END IF;
  IF v_wanted_count > 0 THEN v_completed := v_completed + 1; ELSE v_missing := array_append(v_missing, 'learn_skills'); END IF;

  v_percent := round((v_completed::numeric / 7::numeric) * 100)::integer;

  UPDATE public.profiles
  SET profile_completion_percent = v_percent,
      profile_missing_fields = v_missing,
      onboarding_status = CASE
        WHEN v_was_completed THEN CASE WHEN v_existing_status = 'skipped' THEN 'skipped' ELSE 'completed' END
        WHEN v_requested_status IN ('completed', 'skipped')
          AND p_profile->>'onboarding_step' = 'completed'
          AND nullif(btrim(v_profile.full_name), '') IS NOT NULL AND lower(btrim(v_profile.full_name)) <> 'new member'
          AND nullif(btrim(v_profile.username), '') IS NOT NULL AND v_profile.username !~ '^user_[0-9a-f]{10}$'
          THEN v_requested_status
        WHEN v_requested_status IN ('not_started', 'in_progress', 'deferred') THEN v_requested_status
        ELSE onboarding_status
      END,
      onboarding_completed = CASE
        WHEN v_was_completed THEN true
        WHEN v_requested_status IN ('completed', 'skipped')
          AND p_profile->>'onboarding_step' = 'completed'
          AND nullif(btrim(v_profile.full_name), '') IS NOT NULL AND lower(btrim(v_profile.full_name)) <> 'new member'
          AND nullif(btrim(v_profile.username), '') IS NOT NULL AND v_profile.username !~ '^user_[0-9a-f]{10}$'
          THEN true
        WHEN v_requested_status IN ('not_started', 'in_progress', 'deferred') THEN false
        ELSE onboarding_completed
      END,
      updated_at = now()
  WHERE id = p_user_id
  RETURNING * INTO v_profile;

  RETURN jsonb_build_object(
    'profile', to_jsonb(v_profile),
    'completion_percent', v_percent,
    'missing_fields', to_jsonb(v_missing),
    'skills_known', (
      SELECT coalesce(jsonb_agg(s.name ORDER BY s.name), '[]'::jsonb)
      FROM public.user_skills us JOIN public.skills s ON s.id = us.skill_id
      WHERE us.user_id = p_user_id AND us.kind = 'known'
    ),
    'skills_wanted', (
      SELECT coalesce(jsonb_agg(s.name ORDER BY s.name), '[]'::jsonb)
      FROM public.user_skills us JOIN public.skills s ON s.id = us.skill_id
      WHERE us.user_id = p_user_id AND us.kind = 'wanted'
    )
  );
END;
$$;

-- 4. Set secure RPC permissions
REVOKE ALL ON FUNCTION public.save_onboarding_progress_atomic(uuid, jsonb, text[], text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_onboarding_progress_atomic(uuid, jsonb, text[], text[]) TO service_role;

-- 5. Safe idempotent repair of existing auth users without a profile row
INSERT INTO public.profiles (
  id,
  full_name,
  avatar_url,
  username,
  preferred_locale,
  study_mode_preference,
  onboarding_step,
  onboarding_status,
  onboarding_version,
  onboarding_mission,
  onboarding_push_opt_in,
  timezone,
  profile_completion_percent,
  profile_missing_fields,
  onboarding_completed
)
SELECT
  u.id,
  coalesce(nullif(btrim(u.raw_user_meta_data->>'full_name'), ''), nullif(btrim(u.raw_user_meta_data->>'name'), ''), 'New member'),
  coalesce(nullif(btrim(u.raw_user_meta_data->>'avatar_url'), ''), nullif(btrim(u.raw_user_meta_data->>'picture'), ''), null),
  'user_' || substr(replace(u.id::text, '-', ''), 1, 10),
  'en',
  'hybrid',
  'language',
  'not_started',
  1,
  'both',
  true,
  'Asia/Dhaka',
  0,
  ARRAY['full_name', 'username', 'university', 'department', 'study_mode_preference', 'teach_skills', 'learn_skills']::text[],
  false
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- =========================================
-- MIGRATION: 027_admin_v4_operations_suite.sql
-- =========================================

-- 1. Moderation / Trust & Safety Cases
CREATE TABLE IF NOT EXISTS public.moderation_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid REFERENCES public.reports(id) ON DELETE SET NULL,
  subject_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  subject_content_type text NOT NULL CHECK (subject_content_type IN ('user', 'message', 'room', 'event', 'resource', 'club', 'quiz')),
  subject_content_id text NOT NULL,
  title text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')) DEFAULT 'medium',
  status text NOT NULL CHECK (status IN ('open', 'investigating', 'actioned', 'dismissed', 'closed')) DEFAULT 'open',
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  internal_notes jsonb NOT NULL DEFAULT '[]'::jsonb,
  action_taken text,
  action_metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_moderation_cases_status ON public.moderation_cases(status, severity);
CREATE INDEX IF NOT EXISTS idx_moderation_cases_subject ON public.moderation_cases(subject_user_id);
CREATE INDEX IF NOT EXISTS idx_moderation_cases_assigned ON public.moderation_cases(assigned_to);

ALTER TABLE public.moderation_cases ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'moderation_cases' AND policyname = 'moderation_cases_service_role_all'
  ) THEN
    CREATE POLICY moderation_cases_service_role_all ON public.moderation_cases FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;


-- 2. Notification Campaign Center
CREATE TABLE IF NOT EXISTS public.notification_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  title text NOT NULL,
  body text NOT NULL,
  action_url text,
  target_role text,
  target_campus text,
  target_skill text,
  channel text NOT NULL CHECK (channel IN ('in_app', 'push', 'all')) DEFAULT 'all',
  status text NOT NULL CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'cancelled')) DEFAULT 'draft',
  scheduled_at timestamptz,
  sent_at timestamptz,
  stats jsonb NOT NULL DEFAULT '{"targeted": 0, "queued": 0, "sent": 0, "failed": 0}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_campaigns_status ON public.notification_campaigns(status, created_at DESC);

ALTER TABLE public.notification_campaigns ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'notification_campaigns' AND policyname = 'notification_campaigns_service_role_all'
  ) THEN
    CREATE POLICY notification_campaigns_service_role_all ON public.notification_campaigns FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;


-- 3. Privacy-Preserving Search Analytics Events
CREATE TABLE IF NOT EXISTS public.search_analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  search_query_normalized text NOT NULL,
  result_count int NOT NULL DEFAULT 0,
  category text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_search_analytics_query ON public.search_analytics_events(search_query_normalized);
CREATE INDEX IF NOT EXISTS idx_search_analytics_created ON public.search_analytics_events(created_at DESC);

ALTER TABLE public.search_analytics_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'search_analytics_events' AND policyname = 'search_analytics_service_role_all'
  ) THEN
    CREATE POLICY search_analytics_service_role_all ON public.search_analytics_events FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;


-- 4. App Version and Release Operations Control
CREATE TABLE IF NOT EXISTS public.app_version_control (
  id text PRIMARY KEY DEFAULT 'default',
  min_supported_version text NOT NULL DEFAULT '2.0.0',
  recommended_version text NOT NULL DEFAULT '2.1.0',
  maintenance_mode boolean NOT NULL DEFAULT false,
  maintenance_message text NOT NULL DEFAULT 'SkillBridge is currently undergoing scheduled platform maintenance. Please check back shortly.',
  update_prompt_enabled boolean NOT NULL DEFAULT true,
  update_title text NOT NULL DEFAULT 'New Version Available',
  update_message text NOT NULL DEFAULT 'A new version of SkillBridge is ready with performance upgrades and new collaboration tools.',
  store_url_android text,
  store_url_ios text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

INSERT INTO public.app_version_control (id, min_supported_version, recommended_version)
VALUES ('default', '2.0.0', '2.1.0')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.app_version_control ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'app_version_control' AND policyname = 'app_version_control_service_role_all'
  ) THEN
    CREATE POLICY app_version_control_service_role_all ON public.app_version_control FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'app_version_control' AND policyname = 'app_version_control_public_read'
  ) THEN
    CREATE POLICY app_version_control_public_read ON public.app_version_control FOR SELECT USING (true);
  END IF;
END $$;



