-- skillbridge_production_v2/infra/supabase/baseline/001_skillbridge_baseline.sql
-- Baseline schema version 012

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-------------------------------------------------------------------------------
-- TABLES
-------------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default 'New member',
  username text unique,
  avatar_url text,
  bio text,
  university text,
  department text,
  batch text,
  roles text[] not null default array['student']::text[],
  research_interests text[] not null default '{}',
  reputation int not null default 0 check (reputation >= 0),
  profile_visibility text not null default 'public' check (profile_visibility in ('public','connections','private')),
  account_status text not null default 'active' check (account_status in ('active','deactivated','suspended','banned')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  fts tsvector generated always as (
    to_tsvector('english', coalesce(full_name, '') || ' ' || coalesce(username, '') || ' ' || coalesce(bio, ''))
  ) stored
);
create index profiles_name_trgm on public.profiles using gin (full_name gin_trgm_ops);
create index profiles_username_trgm on public.profiles using gin (username gin_trgm_ops);
create index profiles_fts_idx on public.profiles using gin (fts);

create table public.skills (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  category text not null default 'general',
  created_at timestamptz not null default now(),
  fts tsvector generated always as (
    to_tsvector('english', coalesce(name, ''))
  ) stored
);
create index skills_name_trgm on public.skills using gin (name gin_trgm_ops);
create index skills_fts_idx on public.skills using gin (fts);

create table public.user_skills (
  user_id uuid not null references public.profiles(id) on delete cascade,
  skill_id uuid not null references public.skills(id) on delete cascade,
  kind text not null check (kind in ('known','wanted','research')),
  proficiency int not null default 1 check (proficiency between 1 and 5),
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  primary key(user_id, skill_id, kind)
);

create table public.connection_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check(status in ('pending','accepted','declined','cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique(requester_id, recipient_id),
  check(requester_id <> recipient_id)
);

create table public.connections (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references public.profiles(id) on delete cascade,
  user_b uuid not null references public.profiles(id) on delete cascade,
  user_ids uuid[] not null,
  created_at timestamptz not null default now(),
  unique(user_a, user_b),
  check(user_a <> user_b)
);
create index connections_users_idx on public.connections using gin(user_ids);

create table public.blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(blocker_id, blocked_id),
  check(blocker_id <> blocked_id)
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  kind text not null check(kind in ('dm','group','room')),
  title text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check(char_length(body)<=5000),
  reply_to uuid references public.messages(id) on delete set null,
  attachment jsonb,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  client_message_id uuid,
  reply_to_message_id uuid references public.messages(id) on delete set null,
  delivery_status text default 'sent',
  soft_deleted boolean default false,
  unique (sender_id, client_message_id)
);
create index messages_conv_created_idx on public.messages(conversation_id, created_at desc);

create table public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member',
  last_read_at timestamptz,
  created_at timestamptz not null default now(),
  last_read_message_id uuid references public.messages(id) on delete set null,
  primary key(conversation_id, user_id)
);

create table public.message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reaction text not null,
  created_at timestamptz not null default now(),
  unique (message_id, user_id, reaction)
);

create table public.message_delivery_receipts (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  delivered_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  primary key(message_id, user_id)
);

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  title text not null,
  description text not null default '',
  topic text not null,
  tags text[] not null default '{}',
  rules text not null default '',
  visibility text not null default 'public' check(visibility in ('public','private','invite_only')),
  mode text not null default 'hybrid' check(mode in ('online','offline','hybrid')),
  capacity int not null default 30 check(capacity between 2 and 250),
  member_count int not null default 1 check(member_count>=0),
  scheduled_at timestamptz,
  campus_location text,
  status text not null default 'open' check(status in ('open','scheduled','live','completed','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  fts tsvector generated always as (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(topic, '') || ' ' || coalesce(description, ''))
  ) stored
);
create index rooms_search_title on public.rooms using gin(title gin_trgm_ops);
create index rooms_tags_idx on public.rooms using gin(tags);
create index rooms_fts_idx on public.rooms using gin(fts);

create table public.room_members (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check(role in ('owner','teacher','moderator','member')),
  joined_at timestamptz not null default now(),
  primary key(room_id, user_id)
);

create table public.teaching_requests (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  volunteer_id uuid not null references public.profiles(id) on delete cascade,
  note text,
  status text not null default 'pending' check(status in ('pending','accepted','rejected','withdrawn')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  unique(room_id, volunteer_id)
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz,
  mode text not null check(mode in ('online','offline','hybrid')),
  meeting_url text,
  campus_location text,
  status text not null default 'scheduled' check(status in ('draft','scheduled','live','completed','cancelled')),
  created_at timestamptz not null default now()
);
create index sessions_starts_idx on public.sessions(starts_at);

create table public.session_participants (
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'invited',
  attendance_status text,
  created_at timestamptz not null default now(),
  primary key(session_id, user_id)
);

create table public.livekit_attendance (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  duration_seconds integer default 0
);
create unique index livekit_attendance_one_open_segment on public.livekit_attendance(session_id, user_id) where left_at is null;

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete cascade,
  reviewee_id uuid not null references public.profiles(id) on delete cascade,
  rating int not null check(rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  unique(session_id, reviewer_id)
);

create table public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  description text,
  university text,
  verified boolean not null default false,
  logo_url text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  fts tsvector generated always as (
    to_tsvector('english', coalesce(name, '') || ' ' || coalesce(description, ''))
  ) stored
);
create index clubs_fts_idx on public.clubs using gin(fts);

create table public.club_members (
  club_id uuid not null references public.clubs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check(role in ('owner','admin','member')),
  status text,
  joined_at timestamptz not null default now(),
  primary key(club_id, user_id)
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  title text not null,
  description text not null default '',
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text,
  online_url text,
  capacity int,
  application_required boolean not null default true,
  status text not null default 'published' check(status in ('draft','published','open','closed','completed','cancelled')),
  form_schema jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  fts tsvector generated always as (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, ''))
  ) stored
);
create index events_fts_idx on public.events using gin(fts);

create table public.event_applications (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  answers jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check(status in ('pending','approved','rejected','waitlisted','cancelled')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(event_id, user_id)
);

create table public.resources (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references public.rooms(id) on delete cascade,
  uploader_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  url text not null,
  storage_path text,
  kind text not null default 'file' check(kind in ('note','slide','link','file','image')),
  created_at timestamptz not null default now(),
  fts tsvector generated always as (
    to_tsvector('english', coalesce(title, ''))
  ) stored
);
create index resources_fts_idx on public.resources using gin(fts);

create table public.saved_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  entity_type text not null check(entity_type in ('room','event','resource','profile')),
  entity_id uuid not null,
  created_at timestamptz not null default now(),
  unique(user_id, entity_type, entity_id)
);

create table public.points_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null,
  points int not null check(points between -500 and 500),
  reference_type text,
  reference_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint points_ledger_unique_event unique (user_id, event_type, reference_type, reference_id)
);
create index points_ledger_user_idx on public.points_ledger(user_id, created_at desc);

create table public.achievements (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  title text not null,
  description text not null,
  icon text,
  created_at timestamptz not null default now()
);

create table public.user_achievements (
  user_id uuid not null references public.profiles(id) on delete cascade,
  achievement_id uuid not null references public.achievements(id) on delete cascade,
  earned_at timestamptz not null default now(),
  primary key(user_id, achievement_id)
);

create table public.quizzes (
  id uuid primary key default gen_random_uuid(),
  skill_id uuid references public.skills(id) on delete set null,
  title text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  prompt text not null,
  options jsonb not null,
  correct_answer int not null,
  explanation text,
  position int not null default 0
);

create table public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  answers jsonb not null,
  score int not null check(score between 0 and 100),
  passed boolean not null,
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null default 'general',
  title text not null,
  body text not null,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications(user_id, created_at desc);

create table public.device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  token text not null,
  token_fingerprint text not null,
  platform text,
  enabled boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  provider text default 'expo',
  device_id text,
  app_version text,
  unique(user_id, token_fingerprint)
);

create table public.push_receipts (
  id uuid primary key default gen_random_uuid(),
  ticket_id text not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  device_token text not null,
  status text not null,
  error_details jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check(target_type in ('user','message','room','event','resource')),
  target_id uuid not null,
  target_user_id uuid references public.profiles(id) on delete set null,
  reason text not null,
  details text,
  status text not null default 'open' check(status in ('open','reviewing','resolved','dismissed')),
  action text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

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
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  fts tsvector generated always as (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, ''))
  ) stored
);
create index research_fts_idx on public.research_projects using gin(fts);

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

create table public.research_members (
  project_id uuid references public.research_projects(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  role text not null check (role in ('owner', 'collaborator')),
  joined_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create table public.saved_research_projects (
  project_id uuid references public.research_projects(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  saved_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create table public.research_publications (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.research_projects(id) on delete cascade,
  title text not null,
  url text,
  published_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.user_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  notification_preferences jsonb not null default '{"messages":true,"connections":true,"sessions":true,"events":true}'::jsonb,
  locale text not null default 'en',
  theme text not null default 'system',
  updated_at timestamptz not null default now()
);

create table public.notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  messages boolean not null default true,
  connections boolean not null default true,
  rooms boolean not null default true,
  sessions boolean not null default true,
  teaching boolean not null default true,
  system boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.admin_roles (
  id text primary key,
  description text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.admin_permissions (
  id text primary key,
  description text not null,
  created_at timestamptz not null default now()
);

create table public.admin_role_permissions (
  role_id text not null references public.admin_roles(id) on delete cascade,
  permission_id text not null references public.admin_permissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(role_id, permission_id)
);

create table public.admin_assignments (
  user_id uuid not null references public.profiles(id) on delete cascade,
  role_id text not null references public.admin_roles(id) on delete cascade,
  assigned_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key(user_id, role_id)
);

-------------------------------------------------------------------------------
-- ROW LEVEL SECURITY (RLS)
-------------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.skills enable row level security;
alter table public.user_skills enable row level security;
alter table public.connection_requests enable row level security;
alter table public.connections enable row level security;
alter table public.blocks enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.message_reactions enable row level security;
alter table public.message_delivery_receipts enable row level security;
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.teaching_requests enable row level security;
alter table public.sessions enable row level security;
alter table public.session_participants enable row level security;
alter table public.livekit_attendance enable row level security;
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
alter table public.notification_preferences enable row level security;
alter table public.device_tokens enable row level security;
alter table public.reports enable row level security;
alter table public.research_projects enable row level security;
alter table public.research_collaboration_requests enable row level security;
alter table public.research_members enable row level security;
alter table public.saved_research_projects enable row level security;
alter table public.research_publications enable row level security;
alter table public.user_settings enable row level security;
alter table public.audit_logs enable row level security;
alter table public.admin_roles enable row level security;
alter table public.admin_permissions enable row level security;
alter table public.admin_role_permissions enable row level security;
alter table public.admin_assignments enable row level security;

create policy profile_public_read on public.profiles for select using (profile_visibility='public' or id=auth.uid());
create policy profile_self_update on public.profiles for update using(id=auth.uid()) with check(id=auth.uid());
create policy skills_read on public.skills for select using(true);
create policy user_skills_read on public.user_skills for select using(user_id=auth.uid() or exists(select 1 from public.profiles p where p.id=user_id and p.profile_visibility='public'));
create policy user_skills_self on public.user_skills for all using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy connection_request_involved on public.connection_requests for select using(auth.uid() in(requester_id,recipient_id));
create policy connections_involved on public.connections for select using(auth.uid() in(user_a,user_b));
create policy blocks_owner on public.blocks for all using(blocker_id=auth.uid()) with check(blocker_id=auth.uid());

create policy "Users can read conversation messages" on public.messages for select using (
  soft_deleted = false and exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = messages.conversation_id and cm.user_id = auth.uid()
  )
);
create policy "Senders can see their soft_deleted messages" on public.messages for select using (
  soft_deleted = true and sender_id = auth.uid()
);

create policy "Users can see reactions in their conversations" on public.message_reactions for select using (
  exists (
    select 1 from public.messages m
    join public.conversation_members cm on cm.conversation_id = m.conversation_id
    where m.id = message_reactions.message_id and cm.user_id = auth.uid()
  )
);

create policy message_delivery_receipts_self_read on public.message_delivery_receipts for select using(user_id=auth.uid());
revoke insert, update, delete on table public.message_delivery_receipts from anon, authenticated;

create policy room_public_read on public.rooms for select using(visibility='public' or owner_id=auth.uid() or exists(select 1 from public.room_members rm where rm.room_id=id and rm.user_id=auth.uid()));
create policy room_members_self_read on public.room_members for select using(user_id=auth.uid());
create policy sessions_member_read on public.sessions for select using(teacher_id=auth.uid() or exists(select 1 from public.session_participants sp where sp.session_id=id and sp.user_id=auth.uid()));

create policy "Users can view attendance for their sessions" on public.livekit_attendance for select using (
  exists (
    select 1 from public.sessions s
    join public.room_members rm on rm.room_id = s.room_id
    where s.id = livekit_attendance.session_id and rm.user_id = auth.uid()
  )
);

create policy reviews_public_read on public.reviews for select using(true);
create policy clubs_public_read on public.clubs for select using(true);
create policy club_members_public_read on public.club_members for select using(true);
create policy events_public_read on public.events for select using(status in ('published','open','completed'));
create policy applications_self_read on public.event_applications for select using(user_id=auth.uid());
create policy resources_room_read on public.resources for select using(room_id is null or exists(select 1 from public.room_members rm where rm.room_id=room_id and rm.user_id=auth.uid()));
create policy saved_self on public.saved_items for all using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy ledger_self_read on public.points_ledger for select using(user_id=auth.uid());
create policy achievements_read on public.achievements for select using(true);
create policy user_achievements_read on public.user_achievements for select using(true);
create policy quizzes_read on public.quizzes for select using(active=true);
create policy attempts_self_read on public.quiz_attempts for select using(user_id=auth.uid());
create policy notifications_self on public.notifications for select using(user_id=auth.uid());

create policy "Users can read their own notification preferences" on public.notification_preferences for select using (auth.uid() = user_id);

create policy device_tokens_self on public.device_tokens for all using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy reports_self_insert on public.reports for insert with check(reporter_id=auth.uid());
create policy reports_self_read on public.reports for select using(reporter_id=auth.uid());

create policy "Public projects are visible to all" on public.research_projects for select using (visibility = 'public');
create policy "Owners can manage their projects" on public.research_projects using (auth.uid() = owner_id);
create policy "Users can see their own requests" on public.research_collaboration_requests for select using (auth.uid() = requester_id);
create policy "Project owners can see requests for their project" on public.research_collaboration_requests for select using (
  exists (select 1 from public.research_projects p where p.id = project_id and p.owner_id = auth.uid())
);

create policy research_members_select on public.research_members for select using (true);
create policy research_members_insert on public.research_members for insert with check (
  exists (select 1 from public.research_projects where id = project_id and owner_id = auth.uid())
);
create policy research_members_delete on public.research_members for delete using (
  exists (select 1 from public.research_projects where id = project_id and owner_id = auth.uid()) or auth.uid() = user_id
);

create policy saved_research_projects_select on public.saved_research_projects for select using (auth.uid() = user_id);
create policy saved_research_projects_insert on public.saved_research_projects for insert with check (auth.uid() = user_id);
create policy saved_research_projects_delete on public.saved_research_projects for delete using (auth.uid() = user_id);

create policy research_publications_select on public.research_publications for select using (true);
create policy research_publications_insert on public.research_publications for insert with check (
  exists (select 1 from public.research_projects where id = project_id and owner_id = auth.uid())
);
create policy research_publications_delete on public.research_publications for delete using (
  exists (select 1 from public.research_projects where id = project_id and owner_id = auth.uid())
);

create policy settings_self on public.user_settings for all using(user_id=auth.uid()) with check(user_id=auth.uid());

create policy admin_roles_read on public.admin_roles for select using (true);
create policy admin_permissions_read on public.admin_permissions for select using (true);
create policy admin_role_permissions_read on public.admin_role_permissions for select using (true);
create policy admin_assignments_read on public.admin_assignments for select using (true);

revoke all on table public.admin_roles from anon, authenticated;
revoke all on table public.admin_permissions from anon, authenticated;
revoke all on table public.admin_role_permissions from anon, authenticated;
revoke all on table public.admin_assignments from anon, authenticated;
grant select on table public.admin_roles to authenticated;
grant select on table public.admin_permissions to authenticated;
grant select on table public.admin_role_permissions to authenticated;
grant select on table public.admin_assignments to authenticated;

revoke update on table public.profiles from authenticated;
grant update (
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
) on table public.profiles to authenticated;

-------------------------------------------------------------------------------
-- STORAGE
-------------------------------------------------------------------------------
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types) values
  ('avatars', 'avatars', true, 5242880, array['image/jpeg','image/png','image/webp']),
  ('resources', 'resources', false, 26214400, array['application/pdf','image/jpeg','image/png','image/webp','application/vnd.openxmlformats-officedocument.presentationml.presentation','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict(id) do nothing;

create policy avatars_public_read on storage.objects for select using(bucket_id='avatars');
create policy avatars_self_insert on storage.objects for insert to authenticated with check(bucket_id='avatars' and (storage.foldername(name))[1]=auth.uid()::text);
create policy avatars_self_update on storage.objects for update to authenticated using(bucket_id='avatars' and (storage.foldername(name))[1]=auth.uid()::text);

create policy resources_member_read on storage.objects for select to authenticated using(
  bucket_id='resources' and exists(select 1 from public.room_members rm where rm.user_id=auth.uid() and rm.room_id::text=(storage.foldername(name))[2])
);
create policy resources_member_write on storage.objects for insert to authenticated with check(
  bucket_id='resources' and (storage.foldername(name))[1]=auth.uid()::text and exists(select 1 from public.room_members rm where rm.user_id=auth.uid() and rm.room_id::text=(storage.foldername(name))[2])
);

-------------------------------------------------------------------------------
-- FUNCTIONS & TRIGGERS
-------------------------------------------------------------------------------

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
declare
  v_base_username text;
  v_final_username text;
  v_suffix integer := 0;
  v_full_name text;
begin
  v_full_name := coalesce(nullif(btrim(NEW.raw_user_meta_data->>'full_name'), ''), 'New member');
  v_base_username := 'user_' || substr(replace(NEW.id::text, '-', ''), 1, 10);
  v_final_username := v_base_username;

  while exists (
    select 1 from public.profiles 
    where lower(username) = lower(v_final_username) and id <> NEW.id
  ) loop
    v_suffix := v_suffix + 1;
    v_final_username := substr(v_base_username, 1, 24) || '_' || v_suffix::text;
  end loop;

  insert into public.profiles (
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
  values (
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
  on conflict (id) do update set
    full_name = case when public.profiles.full_name is null or public.profiles.full_name = 'New member' then EXCLUDED.full_name else public.profiles.full_name end;

  return NEW;
exception when others then
  return NEW;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create or replace function public.recompute_reputation(p_user_id uuid) returns void language sql security definer set search_path=public as $$
  update public.profiles set reputation=greatest(0, coalesce((select sum(points) from public.points_ledger where user_id=p_user_id), 0)) where id=p_user_id;
$$;
revoke execute on function public.recompute_reputation(uuid) from public, anon, authenticated;
grant execute on function public.recompute_reputation(uuid) to service_role;

create or replace function public.points_after_change() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if TG_OP='DELETE' then perform public.recompute_reputation(old.user_id); return old; end if;
  perform public.recompute_reputation(new.user_id); return new;
end $$;
create trigger points_reputation_after after insert or update or delete on public.points_ledger for each row execute procedure public.points_after_change();

create or replace function public.find_dm_conversation(p_user_a uuid, p_user_b uuid)
returns table(id uuid, title text, kind text, updated_at timestamptz) language sql security definer set search_path=public as $$
  select c.id, c.title, c.kind, c.updated_at from public.conversations c
  where c.kind='dm'
    and exists(select 1 from public.conversation_members m where m.conversation_id=c.id and m.user_id=p_user_a)
    and exists(select 1 from public.conversation_members m where m.conversation_id=c.id and m.user_id=p_user_b)
    and (select count(*) from public.conversation_members m where m.conversation_id=c.id)=2
  limit 1;
$$;
revoke execute on function public.find_dm_conversation(uuid, uuid) from public, anon, authenticated;
grant execute on function public.find_dm_conversation(uuid, uuid) to service_role;

create or replace function public.recommend_people(p_user_id uuid, p_limit int default 20)
returns setof public.profiles language sql stable security definer set search_path=public as $$
  with mine as (select skill_id, kind from public.user_skills where user_id=p_user_id),
  scored as (
    select p.id,
      count(*) filter(where us.skill_id in(select skill_id from mine where kind in ('wanted','research'))) * 3 +
      count(*) filter(where us.skill_id in(select skill_id from mine where kind='known')) as score
    from public.profiles p
    left join public.user_skills us on us.user_id=p.id
    where p.id <> p_user_id and p.profile_visibility <> 'private' and p.account_status = 'active'
      and not exists(select 1 from public.blocks b where (b.blocker_id=p_user_id and b.blocked_id=p.id) or (b.blocker_id=p.id and b.blocked_id=p_user_id))
    group by p.id
  )
  select p.* from scored s join public.profiles p on p.id=s.id order by s.score desc, p.reputation desc limit greatest(1, least(p_limit, 50));
$$;
revoke execute on function public.recommend_people(uuid, int) from public, anon, authenticated;
grant execute on function public.recommend_people(uuid, int) to service_role;

create or replace function public.suggest_connections(p_user_id uuid, p_limit int default 10)
returns setof public.profiles language sql stable security definer set search_path=public as $$
  select p.* from public.recommend_people(p_user_id, p_limit*3) p
  where not exists(select 1 from public.connections c where (c.user_a=p_user_id and c.user_b=p.id) or (c.user_b=p_user_id and c.user_a=p.id))
  limit greatest(1, least(p_limit, 30));
$$;
revoke execute on function public.suggest_connections(uuid, int) from public, anon, authenticated;
grant execute on function public.suggest_connections(uuid, int) to service_role;

create or replace function public.mutual_connection_count(p_user_a uuid, p_user_b uuid)
returns int language sql stable security definer set search_path=public as $$
  with a as (
    select case when user_a=p_user_a then user_b else user_a end u from public.connections where p_user_a in(user_a, user_b)
  ), b as (
    select case when user_a=p_user_b then user_b else user_a end u from public.connections where p_user_b in(user_a, user_b)
  )
  select count(*)::int from a join b using(u);
$$;
revoke execute on function public.mutual_connection_count(uuid, uuid) from public, anon, authenticated;
grant execute on function public.mutual_connection_count(uuid, uuid) to service_role;

create or replace function public.block_user_atomic(p_blocker_id uuid, p_blocked_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin
  if p_blocker_id = p_blocked_id then
    raise exception 'Cannot block yourself';
  end if;

  insert into public.blocks (blocker_id, blocked_id)
  values (p_blocker_id, p_blocked_id)
  on conflict do nothing;

  delete from public.connections
  where (user_a = p_blocker_id and user_b = p_blocked_id) or (user_a = p_blocked_id and user_b = p_blocker_id);

  delete from public.connection_requests
  where (requester_id = p_blocker_id and recipient_id = p_blocked_id) or (requester_id = p_blocked_id and recipient_id = p_blocker_id);
end;
$$;
revoke all on function public.block_user_atomic(uuid, uuid) from public, anon, authenticated;
grant execute on function public.block_user_atomic(uuid, uuid) to service_role;

create or replace function public.submit_review_atomic(
  p_reviewer_id uuid,
  p_reviewee_id uuid,
  p_session_id uuid,
  p_rating int,
  p_comment text
) returns uuid language plpgsql security definer set search_path=public as $$
declare
  v_review_id uuid;
  v_session public.sessions;
  v_reviewer_part boolean;
  v_reviewee_part boolean;
begin
  if p_reviewer_id = p_reviewee_id then
    raise exception 'Reviewer cannot be the same as reviewee';
  end if;

  select * into v_session from public.sessions where id = p_session_id for update;
  if not found then raise exception 'Session not found'; end if;
  if v_session.status <> 'completed' then raise exception 'Session is not completed'; end if;

  select exists(select 1 from public.session_participants where session_id = p_session_id and user_id = p_reviewer_id and attendance_status = 'attended') or v_session.teacher_id = p_reviewer_id into v_reviewer_part;
  if not v_reviewer_part then raise exception 'Reviewer did not participate in this session'; end if;

  select exists(select 1 from public.session_participants where session_id = p_session_id and user_id = p_reviewee_id) or v_session.teacher_id = p_reviewee_id into v_reviewee_part;
  if not v_reviewee_part then raise exception 'Reviewee did not participate in this session'; end if;

  insert into public.reviews (session_id, reviewer_id, reviewee_id, rating, comment)
  values (p_session_id, p_reviewer_id, p_reviewee_id, p_rating, p_comment)
  returning id into v_review_id;

  insert into public.points_ledger (user_id, event_type, points, reference_type, reference_id)
  values (p_reviewee_id, 'received_review', 5, 'session', p_session_id)
  on conflict on constraint points_ledger_unique_event do nothing;

  return v_review_id;
end;
$$;
revoke all on function public.submit_review_atomic(uuid, uuid, uuid, int, text) from public, anon, authenticated;
grant execute on function public.submit_review_atomic(uuid, uuid, uuid, int, text) to service_role;

create or replace function public.create_room_atomic(
  p_title text,
  p_description text,
  p_visibility text,
  p_capacity int,
  p_rules text,
  p_tags text[],
  p_owner_id uuid
) returns uuid language plpgsql security definer set search_path=public as $$
declare
  v_conversation_id uuid;
  v_room_id uuid;
begin
  insert into public.conversations (kind, title, created_by)
  values ('room', p_title, p_owner_id)
  returning id into v_conversation_id;

  insert into public.rooms (
    title, description, visibility, capacity, rules, tags,
    owner_id, conversation_id, member_count
  )
  values (
    p_title, p_description, p_visibility, p_capacity, p_rules, p_tags,
    p_owner_id, v_conversation_id, 1
  )
  returning id into v_room_id;

  insert into public.room_members (room_id, user_id, role)
  values (v_room_id, p_owner_id, 'owner');

  insert into public.conversation_members (conversation_id, user_id, role)
  values (v_conversation_id, p_owner_id, 'owner');

  return v_room_id;
end;
$$;
revoke all on function public.create_room_atomic(text, text, text, int, text, text[], uuid) from public, anon, authenticated;
grant execute on function public.create_room_atomic(text, text, text, int, text, text[], uuid) to service_role;

create or replace function public.accept_teaching_request(
  p_room_id uuid,
  p_request_id uuid
) returns void language plpgsql security definer set search_path=public as $$
declare
  v_volunteer_id uuid;
begin
  select volunteer_id into v_volunteer_id
  from public.teaching_requests
  where id = p_request_id and room_id = p_room_id and status = 'pending'
  for update;

  if v_volunteer_id is null then
    raise exception 'Teaching request not found or already decided';
  end if;

  update public.teaching_requests
  set status = 'accepted', decided_at = now()
  where id = p_request_id;

  insert into public.room_members (room_id, user_id, role)
  values (p_room_id, v_volunteer_id, 'teacher')
  on conflict (room_id, user_id) do update set role = 'teacher';
end;
$$;
revoke all on function public.accept_teaching_request(uuid, uuid) from public, anon, authenticated;
grant execute on function public.accept_teaching_request(uuid, uuid) to service_role;

create or replace function public.join_room_atomic(
  p_room_id uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_user_id uuid := auth.uid();
  r public.rooms;
  existing boolean;
begin
  if v_user_id is null then raise exception 'Not authenticated'; end if;

  select * into r from public.rooms where id = p_room_id for update;
  if not found then raise exception 'Room not found'; end if;
  if r.status not in ('open','scheduled','live') then raise exception 'Room closed'; end if;

  select exists(select 1 from public.room_members where room_id = p_room_id and user_id = v_user_id) into existing;
  if existing then
    return jsonb_build_object('already_member', true, 'member_count', r.member_count);
  end if;

  if r.member_count >= r.capacity then raise exception 'Room full'; end if;
  if r.visibility = 'invite_only' then raise exception 'Invite required'; end if;

  insert into public.room_members(room_id, user_id, role)
  values (p_room_id, v_user_id, 'member');

  insert into public.conversation_members(conversation_id, user_id, role)
  values (r.conversation_id, v_user_id, 'member')
  on conflict (conversation_id, user_id) do nothing;

  update public.rooms set member_count = member_count + 1, updated_at = now() where id = p_room_id;
  return jsonb_build_object('joined', true, 'member_count', r.member_count + 1);
end;
$$;
grant execute on function public.join_room_atomic(uuid) to authenticated;

create or replace function public.leave_room_atomic(
  p_room_id uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_user_id uuid := auth.uid();
  r public.rooms;
  v_role text;
begin
  if v_user_id is null then raise exception 'Not authenticated'; end if;

  select * into r from public.rooms where id = p_room_id for update;
  if not found then raise exception 'Room not found'; end if;

  select role into v_role from public.room_members where room_id = p_room_id and user_id = v_user_id;
  if not found then
    return jsonb_build_object('already_left', true, 'member_count', r.member_count);
  end if;

  if v_role = 'owner' then
    raise exception 'Owner cannot simply leave. Must transfer ownership or archive/delete room.';
  end if;

  delete from public.room_members where room_id = p_room_id and user_id = v_user_id;
  delete from public.conversation_members where conversation_id = r.conversation_id and user_id = v_user_id;

  update public.rooms
  set member_count = greatest(0, member_count - 1), updated_at = now()
  where id = p_room_id;

  return jsonb_build_object('left', true, 'member_count', greatest(0, r.member_count - 1));
end;
$$;
grant execute on function public.leave_room_atomic(uuid) to authenticated;

create or replace function public.record_livekit_join(
  p_session_id uuid,
  p_user_id uuid
) returns void language plpgsql security definer set search_path=public as $$
begin
  insert into public.livekit_attendance(session_id, user_id, joined_at)
  select p_session_id, p_user_id, now()
  where not exists(
    select 1 from public.livekit_attendance
    where session_id = p_session_id and user_id = p_user_id and left_at is null
  );
end;
$$;
revoke all on function public.record_livekit_join(uuid, uuid) from public, anon, authenticated;
grant execute on function public.record_livekit_join(uuid, uuid) to service_role;

create or replace function public.record_livekit_leave(
  p_session_id uuid,
  p_user_id uuid
) returns void language plpgsql security definer set search_path=public as $$
declare
  v_id uuid;
  v_joined timestamptz;
begin
  select id, joined_at into v_id, v_joined
  from public.livekit_attendance
  where session_id = p_session_id and user_id = p_user_id and left_at is null
  order by joined_at desc limit 1 for update;

  if v_id is null then return; end if;

  update public.livekit_attendance
  set left_at = now(),
      duration_seconds = greatest(0, floor(extract(epoch from(now() - v_joined)))::int)
  where id = v_id;
end;
$$;
revoke all on function public.record_livekit_leave(uuid, uuid) from public, anon, authenticated;
grant execute on function public.record_livekit_leave(uuid, uuid) to service_role;

create or replace function public.decide_event_application_atomic(
  p_application_id uuid,
  p_decision text,
  p_reviewer_id uuid
) returns boolean language plpgsql security definer set search_path=public as $$
declare
  v_event_id uuid;
  v_capacity int;
  v_approved_count int;
  v_current_status text;
begin
  if p_decision not in ('approved', 'rejected', 'waitlisted') then
    raise exception 'Invalid decision';
  end if;

  select e.id, e.capacity, a.status
  into v_event_id, v_capacity, v_current_status
  from public.event_applications a
  join public.events e on e.id = a.event_id
  where a.id = p_application_id for update of e;

  if not found then raise exception 'Application not found'; end if;
  if v_current_status != 'pending' and v_current_status != 'waitlisted' then
    raise exception 'Application is already processed';
  end if;

  if p_decision = 'approved' then
    select count(*) into v_approved_count from public.event_applications
    where event_id = v_event_id and status = 'approved';

    if v_approved_count >= v_capacity then
      raise exception 'Event capacity reached';
    end if;
  end if;

  update public.event_applications
  set status = p_decision, updated_at = now()
  where id = p_application_id;

  return true;
end;
$$;
revoke all on function public.decide_event_application_atomic(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.decide_event_application_atomic(uuid, text, uuid) to service_role;

create or replace function public.create_club_atomic(
  p_name text,
  p_description text,
  p_university text,
  p_owner_id uuid
) returns uuid language plpgsql security definer set search_path=public as $$
declare
  v_club_id uuid;
begin
  insert into public.clubs(name, description, university, created_by)
  values(p_name, p_description, p_university, p_owner_id)
  returning id into v_club_id;

  insert into public.club_members(club_id, user_id, role, status)
  values(v_club_id, p_owner_id, 'owner', 'approved');

  return v_club_id;
end;
$$;
revoke all on function public.create_club_atomic(text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.create_club_atomic(text, text, text, uuid) to service_role;

-- Room invitations
create table if not exists public.room_invitations (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  inviter_id uuid not null references public.profiles(id) on delete cascade,
  invitee_id uuid references public.profiles(id) on delete cascade,
  token_hash text,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'revoked', 'expired', 'consumed')),
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  accepted_at timestamptz,
  metadata jsonb default '{}'::jsonb,
  constraint chk_invitation_target check (invitee_id is not null or token_hash is not null),
  constraint chk_no_self_invite check (inviter_id != invitee_id)
);

create index if not exists idx_room_invitations_room_id on public.room_invitations(room_id);
create index if not exists idx_room_invitations_invitee on public.room_invitations(invitee_id) where status = 'pending';
create unique index if not exists uq_active_room_invitee on public.room_invitations(room_id, invitee_id) where status = 'pending';

alter table public.room_invitations enable row level security;
create policy room_invitations_select on public.room_invitations for select using (
  auth.uid() = inviter_id or auth.uid() = invitee_id or
  exists (select 1 from public.room_members where room_id = room_invitations.room_id and user_id = auth.uid() and role in ('owner', 'moderator'))
);
create policy room_invitations_insert on public.room_invitations for insert with check (
  auth.uid() = inviter_id and
  exists (select 1 from public.room_members where room_id = room_invitations.room_id and user_id = auth.uid() and role in ('owner', 'moderator'))
);
create policy room_invitations_update on public.room_invitations for update using (
  auth.uid() = invitee_id or auth.uid() = inviter_id or
  exists (select 1 from public.room_members where room_id = room_invitations.room_id and user_id = auth.uid() and role in ('owner', 'moderator'))
);

create or replace function public.join_room_service_atomic(
    p_room_id uuid,
    p_user_id uuid
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
    r public.rooms;
    v_actual_count integer;
    v_existing boolean;
    v_invite_id uuid;
begin
    if p_user_id is null then raise exception 'User ID required'; end if;
    select * into r from public.rooms where id = p_room_id for update;
    if not found then raise exception 'Room not found'; end if;
    if r.status not in ('open','scheduled','live') then raise exception 'Room is not active'; end if;
    
    select exists(select 1 from public.room_members where room_id = p_room_id and user_id = p_user_id) into v_existing;
    if v_existing then return jsonb_build_object('already_member', true, 'member_count', r.member_count); end if;
    
    select count(*) into v_actual_count from public.room_members where room_id = p_room_id;
    if v_actual_count >= r.capacity then raise exception 'Room is at maximum capacity'; end if;
    if r.visibility = 'private' then raise exception 'This room is private'; end if;

    if r.visibility = 'invite_only' then
        select id into v_invite_id from public.room_invitations 
        where room_id = p_room_id and invitee_id = p_user_id and status in ('pending', 'accepted') and expires_at > now()
        order by created_at desc limit 1;
        if v_invite_id is null then raise exception 'This room requires an invitation to join'; end if;
        update public.room_invitations set status = 'consumed', accepted_at = now(), updated_at = now() where id = v_invite_id;
    end if;
    
    insert into public.room_members(room_id, user_id, role) values (p_room_id, p_user_id, 'member');
    if r.conversation_id is not null then
        insert into public.conversation_members(conversation_id, user_id, role) values (r.conversation_id, p_user_id, 'member')
        on conflict (conversation_id, user_id) do nothing;
    end if;
    
    v_actual_count := v_actual_count + 1;
    update public.rooms set member_count = v_actual_count, updated_at = now() where id = p_room_id;
    return jsonb_build_object('joined', true, 'member_count', v_actual_count);
end;
$$;
revoke all on function public.join_room_service_atomic(uuid, uuid) from public, anon, authenticated;
grant execute on function public.join_room_service_atomic(uuid, uuid) to service_role;

create or replace function public.leave_room_service_atomic(
    p_room_id uuid,
    p_user_id uuid
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
    r public.rooms;
    v_actual_count integer;
begin
    select * into r from public.rooms where id = p_room_id for update;
    if not found then raise exception 'Room not found'; end if;
    if r.owner_id = p_user_id then raise exception 'Room owner cannot leave without transferring ownership'; end if;

    delete from public.room_members where room_id = p_room_id and user_id = p_user_id;
    if r.conversation_id is not null then
        delete from public.conversation_members where conversation_id = r.conversation_id and user_id = p_user_id;
    end if;

    select count(*) into v_actual_count from public.room_members where room_id = p_room_id;
    update public.rooms set member_count = v_actual_count, updated_at = now() where id = p_room_id;
    return jsonb_build_object('left', true, 'member_count', v_actual_count);
end;
$$;
revoke all on function public.leave_room_service_atomic(uuid, uuid) from public, anon, authenticated;
grant execute on function public.leave_room_service_atomic(uuid, uuid) to service_role;

create or replace function public.admin_mutate_user_status_atomic(
    p_admin_id uuid,
    p_target_id uuid,
    p_new_status text,
    p_reason text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_admin public.profiles;
    v_target public.profiles;
begin
    select * into v_admin from public.profiles where id = p_admin_id;
    if not found then raise exception 'Admin profile not found'; end if;
    if not ('admin' = any(v_admin.roles) or 'moderator' = any(v_admin.roles)) then raise exception 'Unauthorized: elevated role required'; end if;

    select * into v_target from public.profiles where id = p_target_id for update;
    if not found then raise exception 'Target user not found'; end if;
    if 'admin' = any(v_target.roles) and not ('admin' = any(v_admin.roles)) then raise exception 'Moderators cannot modify administrator accounts'; end if;
    if p_admin_id = p_target_id and p_new_status != 'active' then raise exception 'Cannot suspend or ban your own administrator account'; end if;

    update public.profiles set account_status = p_new_status, updated_at = now() where id = p_target_id;
    insert into public.audit_logs (actor_id, action, target_type, target_id, metadata)
    values (p_admin_id, 'moderation.user.status', 'user', p_target_id, jsonb_build_object('status', p_new_status, 'previous_status', v_target.account_status, 'reason', p_reason));
    return jsonb_build_object('success', true, 'user_id', p_target_id, 'status', p_new_status);
end;
$$;
revoke all on function public.admin_mutate_user_status_atomic(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.admin_mutate_user_status_atomic(uuid, uuid, text, text) to service_role;

create or replace function public.award_reputation_atomic(
    p_user_id uuid,
    p_event_type text,
    p_points integer,
    p_reference_type text default null,
    p_reference_id uuid default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
    v_existing_id uuid;
    v_new_rep integer;
begin
    if p_reference_type is not null and p_reference_id is not null then
        select id into v_existing_id from public.points_ledger 
        where user_id = p_user_id and event_type = p_event_type and reference_type = p_reference_type and reference_id = p_reference_id;
        if v_existing_id is not null then
            select reputation into v_new_rep from public.profiles where id = p_user_id;
            return jsonb_build_object('awarded', false, 'reason', 'already_awarded', 'reputation', v_new_rep);
        end if;
    end if;

    insert into public.points_ledger (user_id, event_type, points, reference_type, reference_id)
    values (p_user_id, p_event_type, p_points, p_reference_type, p_reference_id);

    select coalesce(sum(points), 0) into v_new_rep from public.points_ledger where user_id = p_user_id;
    update public.profiles set reputation = greatest(0, v_new_rep), updated_at = now() where id = p_user_id;
    return jsonb_build_object('awarded', true, 'points', p_points, 'new_reputation', v_new_rep);
end;
$$;
revoke all on function public.award_reputation_atomic(uuid, text, integer, text, uuid) from public, anon, authenticated;
grant execute on function public.award_reputation_atomic(uuid, text, integer, text, uuid) to service_role;

-- Extended profiles columns
alter table public.profiles
  add column if not exists onboarding_version integer default 1,
  add column if not exists onboarding_status text default 'not_started' check (onboarding_status in ('not_started', 'in_progress', 'completed', 'skipped')),
  add column if not exists onboarding_step text default 'language',
  add column if not exists profile_completion_percent integer default 0 check (profile_completion_percent between 0 and 100),
  add column if not exists profile_missing_fields text[] default array[]::text[],
  add column if not exists guided_tour_version integer default 1,
  add column if not exists guided_tour_status text default 'pending' check (guided_tour_status in ('pending', 'in_progress', 'completed', 'skipped')),
  add column if not exists guided_tour_last_step text default 'start',
  add column if not exists preferred_locale text default 'en' check (preferred_locale in ('en', 'bn')),
  add column if not exists quiet_hours_start text default '22:00',
  add column if not exists quiet_hours_end text default '07:00';

-- Dashboard Configs
create table if not exists public.dashboard_configs (
  id uuid primary key default gen_random_uuid(),
  widget_key text not null unique,
  title_en text not null,
  title_bn text not null,
  default_order integer not null default 0,
  is_required boolean default false,
  is_enabled boolean default true,
  target_roles text[] default array['student', 'tutor', 'moderator', 'admin'],
  target_campus text,
  min_app_version text default '2.0.0',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- User Dashboard Layouts
create table if not exists public.user_dashboard_layouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  density text default 'comfortable' check (density in ('compact', 'comfortable', 'spacious')),
  preset text default 'balanced' check (preset in ('learner', 'tutor', 'researcher', 'community', 'balanced', 'custom')),
  widgets jsonb not null default '[]'::jsonb,
  updated_at timestamptz default now(),
  constraint user_dashboard_layouts_user_id_key unique (user_id)
);

-- Announcements
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title_en text not null,
  title_bn text not null,
  body_en text not null,
  body_bn text not null,
  tone text default 'info' check (tone in ('info', 'warning', 'success', 'accent')),
  action_url text,
  action_label_en text,
  action_label_bn text,
  is_active boolean default true,
  starts_at timestamptz default now(),
  ends_at timestamptz,
  created_at timestamptz default now()
);

-- Feature Flags
create table if not exists public.feature_flags (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  description text,
  is_enabled boolean default true,
  rollout_percentage integer default 100 check (rollout_percentage between 0 and 100),
  target_roles text[] default array['student', 'tutor', 'moderator', 'admin'],
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.dashboard_configs enable row level security;
alter table public.user_dashboard_layouts enable row level security;
alter table public.announcements enable row level security;
alter table public.feature_flags enable row level security;

create policy "Anyone can read dashboard configs" on public.dashboard_configs for select using (true);
create policy "Users can read own layout" on public.user_dashboard_layouts for select using (auth.uid() = user_id);
create policy "Users can update own layout" on public.user_dashboard_layouts for all using (auth.uid() = user_id);
create policy "Anyone can read active announcements" on public.announcements for select using (is_active = true and (ends_at is null or ends_at > now()));
create policy "Anyone can read feature flags" on public.feature_flags for select using (true);

create or replace function public.save_user_dashboard_layout_atomic(
  p_user_id uuid,
  p_preset text,
  p_density text,
  p_widgets jsonb
) returns jsonb as $$
declare
  v_result jsonb;
begin
  insert into public.user_dashboard_layouts (user_id, preset, density, widgets, updated_at)
  values (p_user_id, p_preset, p_density, p_widgets, now())
  on conflict (user_id) do update set
    preset = excluded.preset,
    density = excluded.density,
    widgets = excluded.widgets,
    updated_at = now();

  select jsonb_build_object(
    'user_id', user_id,
    'preset', preset,
    'density', density,
    'widgets', widgets,
    'updated_at', updated_at
  ) into v_result
  from public.user_dashboard_layouts
  where user_id = p_user_id;

  return v_result;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function public.complete_guided_tour_step_atomic(
  p_user_id uuid,
  p_step text,
  p_is_last boolean
) returns jsonb as $$
declare
  v_status text;
  v_reward jsonb;
begin
  if p_is_last then
    v_status := 'completed';
    v_reward := public.award_reputation_atomic(p_user_id, 'tour_completed', 5, 'tour', p_user_id);
  else
    v_status := 'in_progress';
  end if;

  update public.profiles
  set
    guided_tour_last_step = p_step,
    guided_tour_status = v_status,
    updated_at = now()
  where id = p_user_id;

  return jsonb_build_object(
    'step', p_step,
    'status', v_status,
    'reward', v_reward
  );
end;
$$ language plpgsql security definer set search_path = public;

revoke all on function public.save_user_dashboard_layout_atomic(uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.save_user_dashboard_layout_atomic(uuid, text, text, jsonb) to service_role;

revoke all on function public.complete_guided_tour_step_atomic(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.complete_guided_tour_step_atomic(uuid, text, boolean) to service_role;

-- BEGIN MIGRATION 017 BASELINE SYNC
-- Keep this section byte-for-byte equivalent in behavior to migration 017.
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
CREATE POLICY announcement_dismissals_self_read
  ON public.announcement_dismissals FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS experience_content_sets_active_read ON public.experience_content_sets;
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
  v_base_username text;
  v_final_username text;
  v_suffix integer := 0;
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

-- END MIGRATION 017 BASELINE SYNC

-- ============================================================================
-- START MIGRATION 018 BASELINE SYNC (Learning & Growth Hub)
-- ============================================================================

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

-- ENABLE RLS
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

-- POLICIES
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

-- BASELINE RPCs
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

    v_reward_idempotency := 'goal_completion:' || v_milestone.goal_id::text;
    INSERT INTO public.points_ledger (user_id, points, action, reference_id, created_at)
    VALUES (p_user_id, v_reward_points, v_reward_idempotency, v_milestone.goal_id, now())
    ON CONFLICT (action) DO NOTHING;

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

  SELECT id INTO v_tutor_status
  FROM public.profiles
  WHERE id = p_tutor_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tutor profile not found' USING ERRCODE = 'P0002';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_existing_booking
    FROM public.session_bookings
    WHERE idempotency_key = p_idempotency_key;

    IF FOUND THEN
      RETURN jsonb_build_object('booking_id', v_existing_booking.id, 'status', v_existing_booking.status, 'idempotent', true);
    END IF;
  END IF;

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

  v_tutor_key := 'booking_taught:' || p_booking_id::text;
  INSERT INTO public.points_ledger (user_id, points, action, reference_id, created_at)
  VALUES (v_booking.tutor_id, v_tutor_reward, v_tutor_key, p_booking_id, now())
  ON CONFLICT (action) DO NOTHING;

  v_learner_key := 'booking_attended:' || p_booking_id::text;
  INSERT INTO public.points_ledger (user_id, points, action, reference_id, created_at)
  VALUES (v_booking.learner_id, v_learner_reward, v_learner_key, p_booking_id, now())
  ON CONFLICT (action) DO NOTHING;

  UPDATE public.profiles
  SET reputation_score = (SELECT coalesce(sum(points), 0) FROM public.points_ledger WHERE user_id = v_booking.tutor_id)
  WHERE id = v_booking.tutor_id;

  UPDATE public.profiles
  SET reputation_score = (SELECT coalesce(sum(points), 0) FROM public.points_ledger WHERE user_id = v_booking.learner_id)
  WHERE id = v_booking.learner_id;

  INSERT INTO public.user_activity_events (user_id, event_type, event_title, metadata, is_verified)
  VALUES 
    (v_booking.tutor_id, 'booking_completed', 'Completed Tutoring Session', jsonb_build_object('booking_id', p_booking_id, 'duration', v_booking.duration_minutes), true),
    (v_booking.learner_id, 'booking_completed', 'Completed Learning Session', jsonb_build_object('booking_id', p_booking_id, 'duration', v_booking.duration_minutes), true);

  RETURN jsonb_build_object('success', true, 'status', 'completed');
END;
$$;

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

-- REVOKES & GRANTS
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

-- ============================================================================
-- END MIGRATION 018 BASELINE SYNC
-- ============================================================================

-- Baseline config info
create table if not exists public.schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);
insert into public.schema_migrations (version) values ('018_learning_growth_hub') on conflict do nothing;
