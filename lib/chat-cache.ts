type CachedMessagesByChat = Record<string, Array<{ role: string; content: string }>>;

const CACHE_KEY = "nexa_chat_cache_v1";
const MAX_CACHED_CHATS = 12;
const MAX_CACHED_MESSAGES_PER_CHAT = 30;
const MAX_CACHED_MESSAGE_CHARS = 4000;

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

function compactMessages(messages: Array<{ role: string; content: string }>) {
  return messages
    .slice(-MAX_CACHED_MESSAGES_PER_CHAT)
    .map((message) => ({
      role: message.role,
      content: String(message.content || "").slice(0, MAX_CACHED_MESSAGE_CHARS)
    }));
}

function orderedEntries(cache: CachedMessagesByChat) {
  return Object.entries(cache);
}

function writeWithEviction(chatKey: string, nextMessages: Array<{ role: string; content: string }>) {
  const baseEntries = orderedEntries(safeRead()).filter(([key]) => key !== chatKey);
  let entries: Array<[string, Array<{ role: string; content: string }>]> = [
    ...baseEntries,
    [chatKey, nextMessages]
  ];

  while (entries.length > 0) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(entries)));
      return;
    } catch (error) {
      if (!(error instanceof DOMException) || error.name !== "QuotaExceededError") {
        return;
      }

      if (entries.length === 1) {
        const [currentKey, currentMessages] = entries[0];
        if (currentMessages.length <= 1 && currentMessages[0]?.content.length <= 1000) {
          return;
        }

        entries = [
          [
            currentKey,
            currentMessages
              .slice(-Math.max(1, Math.floor(currentMessages.length / 2)))
              .map((message) => ({
                role: message.role,
                content: message.content.slice(0, Math.max(1000, Math.floor(message.content.length / 2)))
              }))
          ]
        ];
        continue;
      }

      entries.shift();
    }
  }
}

export function saveCachedMessages(
  chatKey: string,
  messages: Array<{ role: string; content: string }>
) {
  if (typeof window === "undefined") return;

  writeWithEviction(chatKey, compactMessages(messages));
}

export function removeCachedMessages(chatKey: string) {
  if (typeof window === "undefined") return;

  try {
    const cache = safeRead();
    delete cache[chatKey];

    const trimmedEntries = orderedEntries(cache).slice(-MAX_CACHED_CHATS);
    localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(trimmedEntries)));
  } catch {}
}
