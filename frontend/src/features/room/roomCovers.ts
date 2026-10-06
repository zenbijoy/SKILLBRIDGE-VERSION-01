export interface RoomCoverPreset {
  id: string;
  name: string;
  category: "tech" | "academic" | "creative" | "science" | "chill" | "global";
  url: string;
  accentColor: string;
}

export const ROOM_COVER_PRESETS: RoomCoverPreset[] = [
  {
    id: "tech_lab",
    name: "Code & AI Lab",
    category: "tech",
    url: "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=1200&auto=format&fit=crop&q=80",
    accentColor: "#00E5FF",
  },
  {
    id: "library_classic",
    name: "Grand Library",
    category: "academic",
    url: "https://images.unsplash.com/photo-1507842229451-79b1be886a20?w=1200&auto=format&fit=crop&q=80",
    accentColor: "#E6AF2E",
  },
  {
    id: "modern_campus",
    name: "Modern Campus Hall",
    category: "academic",
    url: "https://images.unsplash.com/photo-1541339907198-e08756dedf3f?w=1200&auto=format&fit=crop&q=80",
    accentColor: "#4E73DF",
  },
  {
    id: "study_cafe",
    name: "Cozy Study Café",
    category: "chill",
    url: "https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=1200&auto=format&fit=crop&q=80",
    accentColor: "#F39C12",
  },
  {
    id: "deep_space",
    name: "Deep Space & Quantum",
    category: "science",
    url: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1200&auto=format&fit=crop&q=80",
    accentColor: "#8E44AD",
  },
  {
    id: "design_studio",
    name: "Creative Design Studio",
    category: "creative",
    url: "https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=1200&auto=format&fit=crop&q=80",
    accentColor: "#FF4081",
  },
  {
    id: "cyberpunk_neon",
    name: "Neon Hacker Space",
    category: "tech",
    url: "https://images.unsplash.com/photo-1518770660439-4636190af475?w=1200&auto=format&fit=crop&q=80",
    accentColor: "#00FF88",
  },
  {
    id: "lecture_theatre",
    name: "Auditorium & Lecture",
    category: "academic",
    url: "https://images.unsplash.com/photo-1497633762265-9d179a990aa6?w=1200&auto=format&fit=crop&q=80",
    accentColor: "#2ECC71",
  },
  {
    id: "minimalist_desk",
    name: "Zen Minimalist Desk",
    category: "chill",
    url: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=1200&auto=format&fit=crop&q=80",
    accentColor: "#3498DB",
  },
];

/**
 * Returns the cover image URL for a room.
 * If the room has a custom cover set in `cover_image_url` or `appearance.cover_image_url`, it returns that.
 * Otherwise, generates a deterministic, beautiful preset based on the room's title, topic, or id.
 */
export function getRoomCover(room?: {
  id?: string;
  title?: string;
  topic?: string;
  cover_image_url?: string | null;
  appearance?: Record<string, any> | null;
} | null): string {
  if (!room) {
    return ROOM_COVER_PRESETS[0].url;
  }

  const explicitCover = room.cover_image_url || room.appearance?.cover_image_url;
  if (explicitCover && typeof explicitCover === "string" && explicitCover.trim().length > 0) {
    return explicitCover.trim();
  }

  // Deterministic fallback based on title/topic
  const str = `${room.topic || ""}_${room.title || ""}_${room.id || ""}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % ROOM_COVER_PRESETS.length;
  return ROOM_COVER_PRESETS[index].url;
}

/**
 * Returns accent color based on room cover or topic
 */
export function getRoomAccentColor(room?: {
  id?: string;
  title?: string;
  topic?: string;
  cover_image_url?: string | null;
  appearance?: Record<string, any> | null;
  is_teacher_mode?: boolean;
} | null): string {
  if (room?.is_teacher_mode) {
    return "#10B981"; // Emerald green for teacher mode
  }
  const coverUrl = getRoomCover(room);
  const matched = ROOM_COVER_PRESETS.find((p) => p.url === coverUrl);
  return matched?.accentColor || "#6366F1";
}
