export type Mode = "general" | "startup" | "student" | "image";

export type UIMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  imageUrl?: string | null;
};

export type StoredChat = {
  id: string;
  title: string;
  mode: Mode;
  messages: UIMessage[];
  createdAt: string;
};
