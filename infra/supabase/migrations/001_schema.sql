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
  uploader_id uuid not null references public.profiles(id) on delete cascade, title text not null, url text not null, storage_path text,
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
