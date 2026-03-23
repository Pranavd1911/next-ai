import type { StoredChat } from "./types";

const KEY = "nexa_guest_chats_v1";
const MAX_GUEST_CHATS = 25;
const MAX_CONTENT_CHARS = 4000;

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

  const compactChats = chats.slice(-MAX_GUEST_CHATS).map((chat) => ({
    ...chat,
    messages: Array.isArray(chat.messages)
      ? chat.messages.slice(-30).map((message) => ({
          ...message,
          content:
            typeof message.content === "string"
              ? message.content.slice(0, MAX_CONTENT_CHARS)
              : message.content
        }))
      : chat.messages
  }));

  try {
    localStorage.setItem(KEY, JSON.stringify(compactChats));
  } catch {}
}
