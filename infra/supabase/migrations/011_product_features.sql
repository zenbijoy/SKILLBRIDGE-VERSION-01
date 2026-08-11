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
CREATE POLICY research_members_select ON public.research_members FOR SELECT USING (true);
CREATE POLICY research_members_insert ON public.research_members FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.research_projects WHERE id = project_id AND owner_id = auth.uid())
);
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
CREATE POLICY saved_research_projects_select ON public.saved_research_projects FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY saved_research_projects_insert ON public.saved_research_projects FOR INSERT WITH CHECK (auth.uid() = user_id);
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
CREATE POLICY research_publications_select ON public.research_publications FOR SELECT USING (true);
CREATE POLICY research_publications_insert ON public.research_publications FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.research_projects WHERE id = project_id AND owner_id = auth.uid())
);
CREATE POLICY research_publications_delete ON public.research_publications FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.research_projects WHERE id = project_id AND owner_id = auth.uid())
);
