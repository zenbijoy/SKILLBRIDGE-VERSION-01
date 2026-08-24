import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

export interface CachedFeedItem {
  id: string;
  author_name: string;
  author_avatar?: string | null;
  content: string;
  media_urls?: string[];
  post_type: string;
  likes_count: number;
  comments_count: number;
  created_at: string;
  updated_at: string;
}

export interface CachedMessageItem {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  attachment_url?: string | null;
  attachment_type?: string | null;
  created_at: string;
  status: "pending" | "sent" | "failed";
}

export interface OutboxTask {
  id: string; // uuid
  action: "SEND_MESSAGE" | "CREATE_POST" | "SUBMIT_QUIZ" | "SAVE_CT_NOTE" | "UPDATE_PROFILE";
  payload: Record<string, any>;
  createdAt: number;
  retryCount: number;
  status: "pending" | "processing" | "failed";
  lastError?: string;
}

export interface CachedDraft {
  key: string;
  content: string;
  updatedAt: number;
}

export interface CachedCallHistory {
  callId: string;
  peerName: string;
  type: "audio" | "video";
  durationSeconds: number;
  timestamp: number;
  status: "completed" | "missed" | "declined";
}

const STORAGE_KEYS = {
  FEED: "@sb_local_feed",
  MESSAGES: (convId: string) => `@sb_local_messages_${convId}`,
  OUTBOX: "@sb_local_outbox",
  CT_PLANS: "@sb_local_ct_plans",
  QUIZZES: "@sb_local_quizzes",
  DRAFTS: (key: string) => `@sb_draft_${key}`,
  CALL_HISTORY: "@sb_call_history",
  SETTINGS: "@sb_user_settings",
};

/**
 * Universal Persistence Storage Driver
 * Android: SQLite / Native AsyncStorage
 * Web: IndexedDB with localStorage fallback
 */
class UniversalStorageDriver {
  private idbName = "SkillBridgeDB";
  private storeName = "kv_store";
  private dbPromise: Promise<IDBDatabase> | null = null;

  constructor() {
    if (Platform.OS === "web" && typeof window !== "undefined" && "indexedDB" in window) {
      this.initIndexedDB();
    }
  }

  private initIndexedDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.idbName, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return this.dbPromise;
  }

  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === "web" && typeof window !== "undefined" && "indexedDB" in window) {
      try {
        const db = await this.initIndexedDB();
        return new Promise((resolve) => {
          const tx = db.transaction(this.storeName, "readonly");
          const store = tx.objectStore(this.storeName);
          const req = store.get(key);
          req.onsuccess = () => resolve(req.result ?? window.localStorage.getItem(key));
          req.onerror = () => resolve(window.localStorage.getItem(key));
        });
      } catch {
        return window.localStorage.getItem(key);
      }
    }
    return AsyncStorage.getItem(key);
  }

  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === "web" && typeof window !== "undefined" && "indexedDB" in window) {
      try {
        const db = await this.initIndexedDB();
        return new Promise((resolve, reject) => {
          const tx = db.transaction(this.storeName, "readwrite");
          const store = tx.objectStore(this.storeName);
          const req = store.put(value, key);
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
        });
      } catch {
        window.localStorage.setItem(key, value);
        return;
      }
    }
    return AsyncStorage.setItem(key, value);
  }

  async removeItem(key: string): Promise<void> {
    if (Platform.OS === "web" && typeof window !== "undefined" && "indexedDB" in window) {
      try {
        const db = await this.initIndexedDB();
        return new Promise((resolve) => {
          const tx = db.transaction(this.storeName, "readwrite");
          const store = tx.objectStore(this.storeName);
          const req = store.delete(key);
          req.onsuccess = () => {
            window.localStorage.removeItem(key);
            resolve();
          };
          req.onerror = () => {
            window.localStorage.removeItem(key);
            resolve();
          };
        });
      } catch {
        window.localStorage.removeItem(key);
        return;
      }
    }
    return AsyncStorage.removeItem(key);
  }
}

const storage = new UniversalStorageDriver();

/**
 * SkillBridge Cross-Platform Local Storage & Database Adapter
 * Provides instant sub-50ms rendering with resilient offline caching and task queues.
 */
export const LocalDB = {
  // Feed Operations
  async getCachedFeed(): Promise<CachedFeedItem[]> {
    try {
      const raw = await storage.getItem(STORAGE_KEYS.FEED);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  async setCachedFeed(items: CachedFeedItem[]): Promise<void> {
    try {
      await storage.setItem(STORAGE_KEYS.FEED, JSON.stringify(items.slice(0, 50)));
    } catch (err) {
      console.warn("Failed to cache feed locally:", err);
    }
  },

  // Message Operations
  async getCachedMessages(conversationId: string): Promise<CachedMessageItem[]> {
    try {
      const raw = await storage.getItem(STORAGE_KEYS.MESSAGES(conversationId));
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  async setCachedMessages(conversationId: string, messages: CachedMessageItem[]): Promise<void> {
    try {
      await storage.setItem(STORAGE_KEYS.MESSAGES(conversationId), JSON.stringify(messages.slice(-100)));
    } catch (err) {
      console.warn("Failed to cache messages locally:", err);
    }
  },

  async appendCachedMessage(conversationId: string, message: CachedMessageItem): Promise<void> {
    try {
      const existing = await this.getCachedMessages(conversationId);
      const filtered = existing.filter((m) => m.id !== message.id);
      await this.setCachedMessages(conversationId, [...filtered, message]);
    } catch (err) {
      console.warn("Failed to append local message:", err);
    }
  },

  // Outbox Queue Operations
  async getOutbox(): Promise<OutboxTask[]> {
    try {
      const raw = await storage.getItem(STORAGE_KEYS.OUTBOX);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  async queueOutboxTask(action: OutboxTask["action"], payload: Record<string, any>, id?: string): Promise<OutboxTask> {
    const taskId = id || `task_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const task: OutboxTask = {
      id: taskId,
      action,
      payload,
      createdAt: Date.now(),
      retryCount: 0,
      status: "pending",
    };

    try {
      const outbox = await this.getOutbox();
      await storage.setItem(STORAGE_KEYS.OUTBOX, JSON.stringify([...outbox, task]));
    } catch (err) {
      console.error("Failed to enqueue outbox task:", err);
    }

    return task;
  },

  async removeOutboxTask(id: string): Promise<void> {
    try {
      const outbox = await this.getOutbox();
      const updated = outbox.filter((t) => t.id !== id);
      await storage.setItem(STORAGE_KEYS.OUTBOX, JSON.stringify(updated));
    } catch (err) {
      console.error("Failed to remove outbox task:", err);
    }
  },

  async updateOutboxTask(id: string, updates: Partial<OutboxTask>): Promise<void> {
    try {
      const outbox = await this.getOutbox();
      const updated = outbox.map((t) => (t.id === id ? { ...t, ...updates } : t));
      await storage.setItem(STORAGE_KEYS.OUTBOX, JSON.stringify(updated));
    } catch (err) {
      console.error("Failed to update outbox task:", err);
    }
  },

  // CT Plans & Quizzes
  async getCachedCTPlans(): Promise<any[]> {
    try {
      const raw = await storage.getItem(STORAGE_KEYS.CT_PLANS);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  async setCachedCTPlans(plans: any[]): Promise<void> {
    try {
      await storage.setItem(STORAGE_KEYS.CT_PLANS, JSON.stringify(plans));
    } catch (err) {
      console.warn("Failed to cache CT plans:", err);
    }
  },

  async getCachedQuizzes(): Promise<any[]> {
    try {
      const raw = await storage.getItem(STORAGE_KEYS.QUIZZES);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  async setCachedQuizzes(quizzes: any[]): Promise<void> {
    try {
      await storage.setItem(STORAGE_KEYS.QUIZZES, JSON.stringify(quizzes));
    } catch (err) {
      console.warn("Failed to cache quizzes:", err);
    }
  },

  // Drafts
  async getDraft(key: string): Promise<string> {
    try {
      return (await storage.getItem(STORAGE_KEYS.DRAFTS(key))) || "";
    } catch {
      return "";
    }
  },

  async setDraft(key: string, content: string): Promise<void> {
    try {
      if (!content) {
        await storage.removeItem(STORAGE_KEYS.DRAFTS(key));
      } else {
        await storage.setItem(STORAGE_KEYS.DRAFTS(key), content);
      }
    } catch (err) {
      console.warn("Failed to save draft:", err);
    }
  },

  // Call History
  async getCachedCallHistory(): Promise<CachedCallHistory[]> {
    try {
      const raw = await storage.getItem(STORAGE_KEYS.CALL_HISTORY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  async appendCallHistory(record: CachedCallHistory): Promise<void> {
    try {
      const existing = await this.getCachedCallHistory();
      const updated = [record, ...existing.filter((r) => r.callId !== record.callId)].slice(0, 50);
      await storage.setItem(STORAGE_KEYS.CALL_HISTORY, JSON.stringify(updated));
    } catch (err) {
      console.warn("Failed to save call history:", err);
    }
  },
};
