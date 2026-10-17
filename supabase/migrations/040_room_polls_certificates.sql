-- 040: Room polls votes + certificates (A/B/C pack)
CREATE TABLE IF NOT EXISTS public.room_poll_votes (
  poll_id UUID NOT NULL REFERENCES public.room_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  option_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (poll_id, user_id)
);
CREATE TABLE IF NOT EXISTS public.room_certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  percent INT NOT NULL DEFAULT 0,
  code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (room_id, user_id)
);
ALTER TABLE public.room_poll_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_certificates ENABLE ROW LEVEL SECURITY;
