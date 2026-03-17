import type { StoredChat } from "./types";

const KEY = "nexa_guest_chats_v1";

export function loadGuestChats(): StoredChat[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveGuestChats(chats: StoredChat[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(chats));
}
