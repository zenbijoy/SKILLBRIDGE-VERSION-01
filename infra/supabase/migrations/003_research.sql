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
