type CachedMessagesByChat = Record<string, Array<{ role: string; content: string }>>;

const CACHE_KEY = "nexa_chat_cache_v1";

function safeRead(): CachedMessagesByChat {
  if (typeof window === "undefined") return {};

  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as CachedMessagesByChat) : {};
  } catch {
    return {};
  }
}

export function loadCachedMessages(chatKey: string) {
  return safeRead()[chatKey] || [];
}

export function saveCachedMessages(
  chatKey: string,
  messages: Array<{ role: string; content: string }>
) {
  if (typeof window === "undefined") return;

  const cache = safeRead();
  cache[chatKey] = messages;
  localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
}

export function removeCachedMessages(chatKey: string) {
  if (typeof window === "undefined") return;

  const cache = safeRead();
  delete cache[chatKey];
  localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
}
