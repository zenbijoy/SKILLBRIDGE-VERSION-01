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
begin
  insert into public.profiles(id, full_name, username)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name','New member'), 'user_'||substr(replace(new.id::text,'-',''),1,10));
  return new;
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

-- Baseline config info
create table if not exists public.schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);
insert into public.schema_migrations (version) values ('016_experience_expansion') on conflict do nothing;
