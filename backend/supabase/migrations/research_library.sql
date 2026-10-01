-- Research Hub Library Tables
-- Run this in your Supabase SQL editor

-- ─── Saved Papers ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS saved_papers (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  paper_id    text NOT NULL,
  paper_data  jsonb NOT NULL DEFAULT '{}',
  saved_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, paper_id)
);
ALTER TABLE saved_papers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own saved papers"
  ON saved_papers FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS saved_papers_user_idx ON saved_papers(user_id, saved_at DESC);

-- ─── Research Collections ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS research_collections (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  description text CHECK (length(description) <= 300),
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE research_collections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own collections"
  ON research_collections FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS collections_user_idx ON research_collections(user_id, created_at DESC);

-- ─── Collection Papers ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS collection_papers (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  collection_id uuid NOT NULL REFERENCES research_collections(id) ON DELETE CASCADE,
  paper_id      text NOT NULL,
  paper_data    jsonb NOT NULL DEFAULT '{}',
  added_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (collection_id, paper_id)
);
ALTER TABLE collection_papers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Collection papers visible to collection owner"
  ON collection_papers FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM research_collections c
      WHERE c.id = collection_papers.collection_id AND c.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM research_collections c
      WHERE c.id = collection_papers.collection_id AND c.user_id = auth.uid()
    )
  );
CREATE INDEX IF NOT EXISTS collection_papers_col_idx ON collection_papers(collection_id, added_at DESC);

-- ─── Research Notes ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS research_notes (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       text NOT NULL DEFAULT '' CHECK (length(title) <= 200),
  body        text NOT NULL DEFAULT '' CHECK (length(body) <= 50000),
  paper_id    text,
  paper_title text CHECK (length(paper_title) <= 300),
  tags        text[] NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE research_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own notes"
  ON research_notes FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS notes_user_idx ON research_notes(user_id, updated_at DESC);

-- ─── Paper Reading History ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS paper_reading_history (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  paper_id      text NOT NULL,
  paper_title   text NOT NULL DEFAULT '',
  paper_year    integer,
  paper_authors text[] NOT NULL DEFAULT '{}',
  read_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, paper_id)
);
ALTER TABLE paper_reading_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own reading history"
  ON paper_reading_history FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS reading_history_user_idx ON paper_reading_history(user_id, read_at DESC);
