export function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function titleFromMessage(text: string) {
  return text.trim().slice(0, 50) || "New Chat";
}
