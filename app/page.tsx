"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type SVGProps
} from "react";
import ReactMarkdown from "react-markdown";
import { getGuestId } from "@/lib/guest";
import { supabaseBrowser } from "@/lib/supabase-browser";
import {
  loadCachedMessages,
  removeCachedMessages,
  saveCachedMessages
} from "@/lib/chat-cache";

declare global {
  interface Window {
    webkitSpeechRecognition?: any;
    SpeechRecognition?: any;
  }
}

type Msg = {
  role: string;
  content: string;
};

type ToastItem = {
  id: string;
  kind: "error" | "success";
  message: string;
};

type StreamChunkEvent =
  | { type: "meta"; chatId?: string; liveDataUsed?: boolean }
  | { type: "delta"; delta?: string }
  | { type: "done"; reply?: string; chatId?: string; liveDataUsed?: boolean }
  | { type: "error"; error?: string };

type ChatItem = {
  id: string;
  title: string;
};

type Segment =
  | { type: "markdown"; content: string }
  | { type: "code"; content: string };

type ParsedFileMessage = {
  fileName: string;
  fileUrl: string;
  mimeType: string;
  extractedText: string;
  extractionStatus: string;
};

type SelectedModel = "auto" | "openai" | "claude";
type ResolvedRoute = "openai" | "claude" | "image";

type VoiceOption = {
  name: string;
  lang: string;
  voiceURI: string;
};

type VoiceLanguage =
  | "en-US"
  | "en-IN"
  | "hi-IN"
  | "te-IN"
  | "ta-IN"
  | "kn-IN"
  | "ja-JP";

function IconBase(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      width="20"
      height="20"
      aria-hidden="true"
      {...props}
    />
  );
}

function MenuIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M4 6h16" />
      <path d="M4 12h16" />
      <path d="M4 18h16" />
    </IconBase>
  );
}

function SendIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22l-4-9-9-4 20-7Z" />
    </IconBase>
  );
}

function StopIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </IconBase>
  );
}

function PaperclipIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="m21.44 11.05-8.49 8.49a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.82-2.82l8.49-8.48" />
    </IconBase>
  );
}

function CameraIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M4 7h3l2-3h6l2 3h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z" />
      <circle cx="12" cy="13" r="4" />
    </IconBase>
  );
}

function MicIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <path d="M12 19v3" />
      <path d="M8 22h8" />
    </IconBase>
  );
}

function SettingsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.65 1.65 0 0 0 15 19.4a1.65 1.65 0 0 0-1 .6 1.65 1.65 0 0 0-.33 1V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-.33-1 1.65 1.65 0 0 0-1-.6 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-.6-1 1.65 1.65 0 0 0-1-.33H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1-.33 1.65 1.65 0 0 0 .6-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-.6 1.65 1.65 0 0 0 .33-1V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 .33 1 1.65 1.65 0 0 0 1 .6 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.26.3.47.65.6 1 .09.32.12.65.09 1 .03.35 0 .68-.09 1-.13.35-.34.7-.6 1Z" />
    </IconBase>
  );
}

function UserIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M20 21a8 8 0 0 0-16 0" />
      <circle cx="12" cy="8" r="4" />
    </IconBase>
  );
}

function ChevronDownIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="m6 9 6 6 6-6" />
    </IconBase>
  );
}

function VolumeOnIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M11 5 6 9H3v6h3l5 4V5Z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M17.8 6.2a8.5 8.5 0 0 1 0 11.6" />
    </IconBase>
  );
}

function VolumeOffIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M11 5 6 9H3v6h3l5 4V5Z" />
      <path d="m16 9 5 5" />
      <path d="m21 9-5 5" />
    </IconBase>
  );
}

function SparklesIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="m12 3 1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8L12 3Z" />
      <path d="M5 16l.9 2.1L8 19l-2.1.9L5 22l-.9-2.1L2 19l2.1-.9L5 16Z" />
      <path d="M19 14l1.2 2.8L23 18l-2.8 1.2L19 22l-1.2-2.8L15 18l2.8-1.2L19 14Z" />
    </IconBase>
  );
}

function PlusIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </IconBase>
  );
}

function sanitizeTextForSpeech(text: string) {
  let clean = text;

  while (clean.includes("```")) {
    const start = clean.indexOf("```");
    const end = clean.indexOf("```", start + 3);
    if (end === -1) {
      clean = clean.slice(0, start) + " code block omitted ";
      break;
    }
    clean = clean.slice(0, start) + " code block omitted " + clean.slice(end + 3);
  }

  clean = clean.replaceAll("`", "");
  clean = clean.replaceAll("#", " ");
  clean = clean.replaceAll("*", " ");
  clean = clean.replaceAll("_", " ");
  clean = clean.replaceAll(">", " ");
  clean = clean.replaceAll("[", " ");
  clean = clean.replaceAll("]", " ");
  clean = clean.replaceAll("(", " ");
  clean = clean.replaceAll(")", " ");

  return clean.replace(/\s+/g, " ").trim();
}

function getLanguageLabel(lang: VoiceLanguage) {
  const labels: Record<VoiceLanguage, string> = {
    "en-US": "English (US)",
    "en-IN": "English (India)",
    "hi-IN": "Hindi",
    "te-IN": "Telugu",
    "ta-IN": "Tamil",
    "kn-IN": "Kannada",
    "ja-JP": "Japanese"
  };
  return labels[lang];
}

export default function Home() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [history, setHistory] = useState<ChatItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedModel, setSelectedModel] = useState<SelectedModel>("auto");
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);

  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [cameraLoading, setCameraLoading] = useState(false);

  const [speechSupported, setSpeechSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceAssistantOn, setVoiceAssistantOn] = useState(true);
  const [handsFreeWakeMode, setHandsFreeWakeMode] = useState(false);
  const [voiceLanguage, setVoiceLanguage] = useState<VoiceLanguage>("en-US");
  const [availableVoices, setAvailableVoices] = useState<VoiceOption[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState("");
  const [voiceStatus, setVoiceStatus] = useState("Wake phrase: Hey Nexa");
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [retryMessages, setRetryMessages] = useState<Msg[] | null>(null);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<any>(null);
  const restartTimerRef = useRef<number | null>(null);
  const mobileActionsRef = useRef<HTMLDivElement | null>(null);

  const loadingRef = useRef(false);
  const messagesRef = useRef<Msg[]>([]);
  const activeChatIdRef = useRef<string | null>(null);
  const handsFreeRef = useRef(false);
  const voiceAssistantRef = useRef(true);
  const isSpeakingRef = useRef(false);
  const manualMicModeRef = useRef(false);
  const userStoppedRef = useRef(false);

  const guestId = typeof window !== "undefined" ? getGuestId() : null;

  function getCacheKey(chatIdArg?: string | null) {
    const ownerId = userId || guestId || "anonymous";
    return chatIdArg ? `chat:${chatIdArg}` : `draft:${ownerId}`;
  }

  function showToast(message: string, kind: "error" | "success" = "error") {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts((prev) => [...prev, { id, kind, message }]);

    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 3500);
  }

  function getFriendlyClientError(message: string) {
    const lower = message.toLowerCase();

    if (lower.includes("failed to fetch") || lower.includes("network")) {
      return "Network error. Your latest chat is kept locally. Retry when you're back online.";
    }

    if (lower.includes("daily") || lower.includes("limit")) {
      return message;
    }

    return "Something went wrong. Your latest message is safe locally, and you can retry.";
  }

  async function consumeChatStream(
    res: Response,
    nextMessages: Msg[],
    currentChatId: string | null
  ) {
    if (!res.body) {
      throw new Error("Streaming response body was empty.");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let streamedReply = "";
    let finalChatId = currentChatId;
    let liveDataUsed = false;

    const applyAssistantText = (text: string) => {
      const updated = [...nextMessages, { role: "assistant", content: text }];
      setMessages(updated);
      messagesRef.current = updated;
    };

    applyAssistantText("");

    const processBlock = (block: string) => {
      const lines = block.split("\n");
      const eventLine = lines.find((line) => line.startsWith("event: "));
      const dataLine = lines.find((line) => line.startsWith("data: "));

      if (!eventLine || !dataLine) return;

      const eventType = eventLine.slice(7).trim();
      const payload = JSON.parse(dataLine.slice(6)) as StreamChunkEvent;

      if (eventType === "meta") {
        const metaPayload = payload as Extract<StreamChunkEvent, { type: "meta" }>;

        if (metaPayload.chatId) {
          finalChatId = metaPayload.chatId;
          setActiveChatId(metaPayload.chatId);
          activeChatIdRef.current = metaPayload.chatId;
        }

        liveDataUsed = !!metaPayload.liveDataUsed;
        return;
      }

      if (eventType === "delta") {
        const deltaPayload = payload as Extract<StreamChunkEvent, { type: "delta" }>;
        streamedReply += deltaPayload.delta || "";
        applyAssistantText(streamedReply);
        return;
      }

      if (eventType === "error") {
        const errorPayload = payload as Extract<StreamChunkEvent, { type: "error" }>;
        throw new Error(errorPayload.error || "Streaming failed.");
      }

      if (eventType === "done") {
        const donePayload = payload as Extract<StreamChunkEvent, { type: "done" }>;
        streamedReply = donePayload.reply || streamedReply;
        if (donePayload.chatId) {
          finalChatId = donePayload.chatId;
          setActiveChatId(donePayload.chatId);
          activeChatIdRef.current = donePayload.chatId;
        }
        liveDataUsed = !!donePayload.liveDataUsed;
        applyAssistantText(streamedReply);
      }
    };

    while (true) {
      const { value, done } = await reader.read();

      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      while (buffer.includes("\n\n")) {
        const boundary = buffer.indexOf("\n\n");
        const block = buffer.slice(0, boundary).trim();
        buffer = buffer.slice(boundary + 2);

        if (block) {
          processBlock(block);
        }
      }
    }

    if (streamedReply.trim().length === 0) {
      throw new Error("The assistant returned an empty response.");
    }

    if (liveDataUsed) {
      setVoiceStatus("Live data used for this answer");
    } else {
      setVoiceStatus("Answer generated");
    }

    if (voiceAssistantRef.current && streamedReply) {
      speakText(streamedReply);
    } else {
      scheduleHandsFreeRestart(700);
    }

    setRetryMessages(null);
    await loadHistory();

    return {
      finalReply: streamedReply,
      finalChatId
    };
  }

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);

  useEffect(() => {
    handsFreeRef.current = handsFreeWakeMode;
  }, [handsFreeWakeMode]);

  useEffect(() => {
    voiceAssistantRef.current = voiceAssistantOn;
  }, [voiceAssistantOn]);

  const filteredVoices = useMemo(() => {
    const exact = availableVoices.filter((v) => v.lang === voiceLanguage);
    if (exact.length > 0) return exact;
    const prefix = voiceLanguage.split("-")[0];
    return availableVoices.filter((v) =>
      v.lang.toLowerCase().startsWith(prefix.toLowerCase())
    );
  }, [availableVoices, voiceLanguage]);

  function clearRestartTimer() {
    if (restartTimerRef.current) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  }

  function scheduleHandsFreeRestart(delay = 700) {
    clearRestartTimer();

    if (!handsFreeRef.current) return;
    if (loadingRef.current) return;
    if (isSpeakingRef.current) return;
    if (userStoppedRef.current) return;

    restartTimerRef.current = window.setTimeout(() => {
      if (!handsFreeRef.current) return;
      if (loadingRef.current) return;
      if (isSpeakingRef.current) return;
      if (userStoppedRef.current) return;

      try {
        manualMicModeRef.current = false;
        recognitionRef.current?.start();
      } catch {}
    }, delay);
  }

  function stopListening() {
    clearRestartTimer();
    try {
      recognitionRef.current?.stop();
    } catch {}
    setIsListening(false);
  }

  function stopSpeaking() {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    isSpeakingRef.current = false;
  }

  function speakText(text: string) {
    if (!voiceAssistantRef.current) {
      scheduleHandsFreeRestart(600);
      return;
    }

    if (typeof window === "undefined") {
      scheduleHandsFreeRestart(600);
      return;
    }

    if (!("speechSynthesis" in window)) {
      scheduleHandsFreeRestart(600);
      return;
    }

    const clean = sanitizeTextForSpeech(text);
    if (!clean) {
      scheduleHandsFreeRestart(600);
      return;
    }

    stopListening();
    stopSpeaking();

    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.lang = voiceLanguage;
    utterance.rate = 1;
    utterance.pitch = 1;

    if (selectedVoiceURI) {
      const voice = window.speechSynthesis
        .getVoices()
        .find((v) => v.voiceURI === selectedVoiceURI);

      if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang || voiceLanguage;
      }
    }

    utterance.onstart = () => {
      isSpeakingRef.current = true;
      setVoiceStatus("Speaking...");
    };

    utterance.onend = () => {
      isSpeakingRef.current = false;
      setVoiceStatus("Wake phrase: Hey Nexa");
      scheduleHandsFreeRestart(600);
    };

    utterance.onerror = () => {
      isSpeakingRef.current = false;
      setVoiceStatus("Wake phrase: Hey Nexa");
      scheduleHandsFreeRestart(600);
    };

    window.speechSynthesis.speak(utterance);
  }

  function refreshVoices() {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    const voices = window.speechSynthesis.getVoices() || [];
    const mapped: VoiceOption[] = voices.map((voice) => ({
      name: voice.name,
      lang: voice.lang,
      voiceURI: voice.voiceURI
    }));

    setAvailableVoices(mapped);
  }

  async function migrateGuestChats(currentGuestId: string, currentUserId: string) {
    try {
      await fetch("/api/migrate-guest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          guestId: currentGuestId,
          userId: currentUserId
        })
      });
    } catch {}
  }

  async function loadHistory(currentUserIdArg?: string | null) {
    const actualUserId = currentUserIdArg ?? userId;
    const params = new URLSearchParams();

    if (actualUserId) params.set("userId", actualUserId);
    else if (guestId) params.set("guestId", guestId);
    else {
      setHistory([]);
      return;
    }

    const res = await fetch(`/api/history?${params.toString()}`, {
      cache: "no-store"
    });
    const data = await res.json();
    setHistory(Array.isArray(data) ? data : []);
  }

  async function loadChat(chatId: string) {
    try {
      const params = new URLSearchParams();
      params.set("chatId", chatId);

      if (userId) params.set("userId", userId);
      else if (guestId) params.set("guestId", guestId);

      const res = await fetch(`/api/chat-messages?${params.toString()}`, {
        cache: "no-store"
      });
      const data = await res.json();

      if (Array.isArray(data)) {
        const loadedMessages = data.map((m: any) => ({
          role: m.role,
          content: m.content
        }));
        setMessages(loadedMessages);
        messagesRef.current = loadedMessages;
        setActiveChatId(chatId);
        activeChatIdRef.current = chatId;

        if (isMobile) setSidebarOpen(false);
      }
    } catch {
      const cachedMessages = loadCachedMessages(getCacheKey(chatId));
      if (cachedMessages.length > 0) {
        setMessages(cachedMessages);
        messagesRef.current = cachedMessages;
        setActiveChatId(chatId);
        activeChatIdRef.current = chatId;
        showToast("Loaded cached messages because the network request failed.");
      } else {
        showToast("Could not load this chat.");
      }
    }
  }

  useEffect(() => {
    async function init() {
      const {
        data: { user }
      } = await supabaseBrowser.auth.getUser();

      const currentUserId = user?.id || null;
      const currentUserEmail = user?.email || null;

      if (currentUserId && guestId) {
        await migrateGuestChats(guestId, currentUserId);
      }

      setUserId(currentUserId);
      setUserEmail(currentUserEmail);
      await loadHistory(currentUserId);
    }

    init();

    const {
      data: { subscription }
    } = supabaseBrowser.auth.onAuthStateChange(async (_event, session) => {
      const currentUserId = session?.user?.id || null;
      const currentUserEmail = session?.user?.email || null;

      if (currentUserId && guestId) {
        await migrateGuestChats(guestId, currentUserId);
      }

      setUserId(currentUserId);
      setUserEmail(currentUserEmail);

      if (!currentUserId) {
        setActiveChatId(null);
        activeChatIdRef.current = null;
        setMessages([]);
        messagesRef.current = [];
      }

      await loadHistory(currentUserId);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    function handleResize() {
      const mobile = window.innerWidth < 900;
      setIsMobile(mobile);
      if (mobile) setSidebarOpen(false);
      else setSidebarOpen(true);
    }

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const SpeechRecognitionCtor =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    setSpeechSupported(!!SpeechRecognitionCtor);
    if (!SpeechRecognitionCtor) return;

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = voiceLanguage;
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => {
      setIsListening(true);
      setVoiceStatus(
        handsFreeRef.current
          ? `Hands-free listening in ${getLanguageLabel(voiceLanguage)}`
          : `Listening in ${getLanguageLabel(voiceLanguage)}`
      );
    };

    recognition.onend = () => {
      setIsListening(false);

      if (manualMicModeRef.current) {
        manualMicModeRef.current = false;
        if (!handsFreeRef.current) {
          setVoiceStatus("Wake phrase: Hey Nexa");
        }
        return;
      }

      if (handsFreeRef.current) {
        scheduleHandsFreeRestart(700);
      } else {
        setVoiceStatus("Wake phrase: Hey Nexa");
      }
    };

    recognition.onerror = () => {
      setIsListening(false);

      if (manualMicModeRef.current) {
        manualMicModeRef.current = false;
        if (!handsFreeRef.current) {
          setVoiceStatus("Mic stopped");
        }
        return;
      }

      if (handsFreeRef.current) {
        setVoiceStatus("Hands-free retrying...");
        scheduleHandsFreeRestart(1200);
      } else {
        setVoiceStatus("Mic stopped");
      }
    };

    recognition.onresult = async (event: any) => {
      const result = event?.results?.[event.results.length - 1]?.[0];
      const transcript = result?.transcript || "";
      await handleTranscript(transcript);
    };

    recognitionRef.current = recognition;

    return () => {
      try {
        recognition.stop();
      } catch {}
    };
  }, [voiceLanguage]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("speechSynthesis" in window)) return;

    refreshVoices();

    const handler = () => refreshVoices();
    window.speechSynthesis.onvoiceschanged = handler;

    return () => {
      if (window.speechSynthesis.onvoiceschanged === handler) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, []);

  useEffect(() => {
    if (filteredVoices.length === 0) return;

    const exists = filteredVoices.some((v) => v.voiceURI === selectedVoiceURI);
    if (!exists) {
      setSelectedVoiceURI(filteredVoices[0].voiceURI);
    }
  }, [filteredVoices, selectedVoiceURI]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const cacheKey = getCacheKey(activeChatId);

    if (messages.length === 0) {
      removeCachedMessages(cacheKey);
      return;
    }

    saveCachedMessages(cacheKey, messages);
  }, [messages, activeChatId, userId, guestId]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        profileMenuRef.current &&
        !profileMenuRef.current.contains(event.target as Node)
      ) {
        setShowProfileMenu(false);
      }

      if (
        mobileActionsRef.current &&
        !mobileActionsRef.current.contains(event.target as Node)
      ) {
        setMobileActionsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!handsFreeWakeMode) {
      userStoppedRef.current = false;
      clearRestartTimer();
      stopListening();
      setVoiceStatus("Wake phrase: Hey Nexa");
      return;
    }

    userStoppedRef.current = false;
    if (!loadingRef.current && !isSpeakingRef.current) {
      scheduleHandsFreeRestart(300);
    }
  }, [handsFreeWakeMode]);

  useEffect(() => {
    if (!isMobile) {
      setMobileActionsOpen(false);
    }
  }, [isMobile]);

  useEffect(() => {
    return () => {
      stopCamera();
      stopGeneration();
      stopSpeaking();
      clearRestartTimer();
      stopListening();
    };
  }, []);

  const filteredHistory = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return history;
    return history.filter((h) => (h.title || "").toLowerCase().includes(q));
  }, [history, search]);

  function parseFileMessage(content: string): ParsedFileMessage | null {
    if (!content.startsWith("FILETEXT::")) return null;

    const parts = content.split("::");
    if (parts.length < 6) return null;

    return {
      fileName: decodeURIComponent(parts[1] || ""),
      fileUrl: decodeURIComponent(parts[2] || ""),
      mimeType: decodeURIComponent(parts[3] || ""),
      extractedText: decodeURIComponent(parts[4] || ""),
      extractionStatus: decodeURIComponent(parts[5] || "")
    };
  }

  function isGeneratedImageMessage(message: Msg) {
    if (message.role !== "assistant") return false;
    if (typeof message.content !== "string") return false;

    return (
      message.content.startsWith("data:image/") ||
      message.content.startsWith("http")
    );
  }

  function convertMessagesForApi(sourceMessages: Msg[]) {
    return sourceMessages.map((m) => {
      if (isGeneratedImageMessage(m)) {
        return {
          role: "assistant",
          content:
            "[The assistant previously generated an image in this chat. The image data has been omitted from context, but the user may still refer to it.]"
        };
      }

      const parsed = parseFileMessage(m.content);

      if (!parsed) return m;

      if (parsed.extractedText && parsed.extractedText.trim().length > 0) {
        const shorterText =
          parsed.extractedText.length > 15000
            ? parsed.extractedText.slice(0, 15000)
            : parsed.extractedText;

        return {
          role: m.role,
          content: [
            "The user uploaded a file.",
            `File name: ${parsed.fileName}`,
            `File type: ${parsed.mimeType}`,
            "Use the extracted file content below to answer the user's next question.",
            "",
            "BEGIN FILE CONTENT",
            shorterText,
            "END FILE CONTENT"
          ].join("\n")
        };
      }

      return {
        role: m.role,
        content: [
          "The user uploaded a file.",
          `File name: ${parsed.fileName}`,
          `File type: ${parsed.mimeType}`,
          `File URL: ${parsed.fileUrl}`
        ].join("\n")
      };
    });
  }

  function detectIntent(text: string): ResolvedRoute {
    const inputText = text.toLowerCase().trim();

    const imageKeywords = [
      "generate image",
      "create image",
      "make image",
      "draw",
      "illustration",
      "logo",
      "poster",
      "thumbnail",
      "wallpaper",
      "banner",
      "image of",
      "photo of",
      "make me an image",
      "generate a picture",
      "create a picture",
      "design a logo"
    ];

    const codingKeywords = [
      "code",
      "python",
      "javascript",
      "typescript",
      "react",
      "next.js",
      "nextjs",
      "bug",
      "debug",
      "algorithm",
      "api",
      "sql",
      "html",
      "css",
      "program",
      "function",
      "component",
      "fix this code",
      "write code",
      "build me",
      "backend",
      "frontend",
      "typescript error",
      "compile error",
      "portfolio website",
      "login page"
    ];

    if (imageKeywords.some((k) => inputText.includes(k))) return "image";
    if (codingKeywords.some((k) => inputText.includes(k))) return "claude";
    return "openai";
  }

  function resolveModel(text: string): ResolvedRoute {
    if (selectedModel === "openai") return "openai";
    if (selectedModel === "claude") return "claude";
    return detectIntent(text);
  }

  function stopCamera() {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    }
  }

  function stopGeneration() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setLoading(false);
    loadingRef.current = false;
  }

  async function submitCurrentInput() {
    if (loadingRef.current) return;
    if (!input.trim() && !selectedFile) return;
    await sendMessage();
  }

  function startMicOnce() {
    if (!recognitionRef.current) {
      alert("Speech input is not supported in this browser.");
      return;
    }

    clearRestartTimer();
    userStoppedRef.current = false;
    manualMicModeRef.current = true;

    if (loadingRef.current) {
      alert("Please wait for the current answer to finish.");
      return;
    }

    stopSpeaking();

    try {
      recognitionRef.current.lang = voiceLanguage;
      recognitionRef.current.start();
      setMobileActionsOpen(false);
    } catch {
      alert("Could not start microphone input.");
    }
  }

  function toggleHandsFree() {
    setHandsFreeWakeMode((prev) => !prev);
    if (isMobile) setMobileActionsOpen(false);
  }

  async function handleTranscript(transcript: string) {
    const spoken = transcript.trim();
    if (!spoken) return;

    const normalized = spoken.toLowerCase().trim();

    const stopCommands = [
      "stop generating",
      "stop generation",
      "stop",
      "cancel",
      "cancel it"
    ];

    if (loadingRef.current && stopCommands.some((cmd) => normalized.includes(cmd))) {
      setVoiceStatus("Stopping current response...");
      stopGeneration();
      scheduleHandsFreeRestart(700);
      return;
    }

    if (loadingRef.current) {
      setVoiceStatus("Please wait for the current answer to finish.");
      return;
    }

    const wakePhrases = ["hey nexa", "hi nexa", "hello nexa", "hey nexus"];
    const matchedWake = wakePhrases.find((phrase) => normalized.startsWith(phrase));

    if (handsFreeRef.current) {
      const finalSpoken = matchedWake
        ? spoken.slice(matchedWake.length).trim().replace(/^[:,.\-]\s*/, "")
        : spoken;

      if (!finalSpoken) {
        setVoiceStatus("Wake phrase detected. Waiting for your question.");
        speakText("Yes, how can I help you?");
        return;
      }

      setVoiceStatus(`Auto-sending: ${finalSpoken}`);
      stopListening();

      const nextMessages = [...messagesRef.current, { role: "user", content: finalSpoken }];
      setInput("");
      setMessages(nextMessages);
      messagesRef.current = nextMessages;

      await sendMessage(nextMessages);
      return;
    }

    if (manualMicModeRef.current) {
      const finalSpoken = matchedWake
        ? spoken.slice(matchedWake.length).trim().replace(/^[:,.\-]\s*/, "")
        : spoken;

      if (!finalSpoken) {
        setVoiceStatus("No question detected.");
        manualMicModeRef.current = false;
        return;
      }

      setVoiceStatus(`Auto-sending: ${finalSpoken}`);
      stopListening();

      const nextMessages = [...messagesRef.current, { role: "user", content: finalSpoken }];
      setInput("");
      setMessages(nextMessages);
      messagesRef.current = nextMessages;

      manualMicModeRef.current = false;
      await sendMessage(nextMessages);
      return;
    }

    if (matchedWake) {
      const spokenAfterWake = spoken
        .slice(matchedWake.length)
        .trim()
        .replace(/^[:,.\-]\s*/, "");

      if (!spokenAfterWake) {
        setVoiceStatus("Wake phrase detected. Say your request.");
        speakText("Yes, how can I help you?");
        return;
      }

      setInput(spokenAfterWake);
      setVoiceStatus(`Wake phrase detected: ${spokenAfterWake}`);
      return;
    }

    setInput((prev) => `${prev} ${spoken}`.trim());
    setVoiceStatus(`Heard: ${spoken}`);
  }

  async function handleLogout() {
    try {
      await supabaseBrowser.auth.signOut();
      await fetch("/api/logout", { method: "POST" });
      setShowProfileMenu(false);
      window.location.href = "/";
    } catch {
      alert("Logout failed");
    }
  }

  async function openCamera() {
    try {
      setCameraError("");
      setCameraLoading(true);
      setCameraOpen(true);
      setMobileActionsOpen(false);

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false
      });

      cameraStreamRef.current = stream;

      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      }, 50);
    } catch (error) {
      console.error(error);
      setCameraError("Could not access camera. Please allow permission and try again.");
    } finally {
      setCameraLoading(false);
    }
  }

  function closeCamera() {
    stopCamera();
    setCameraOpen(false);
    setCameraError("");
    setCameraLoading(false);
  }

  async function capturePhoto() {
    try {
      const video = videoRef.current;
      if (!video) {
        alert("Camera not ready.");
        return;
      }

      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;

      const context = canvas.getContext("2d");
      if (!context) {
        alert("Could not capture image.");
        return;
      }

      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.9)
      );

      if (!blob) {
        alert("Could not capture image.");
        return;
      }

      const capturedFile = new File([blob], `camera-capture-${Date.now()}.jpg`, {
        type: "image/jpeg"
      });

      setSelectedFile(capturedFile);
      closeCamera();
    } catch (error) {
      console.error(error);
      alert("Camera capture failed.");
    }
  }

  async function fileToDataUrl(file: File): Promise<string> {
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        if (typeof reader.result === "string") resolve(reader.result);
        else reject(new Error("Failed to read file."));
      };

      reader.onerror = () => reject(new Error("Failed to read file."));
      reader.readAsDataURL(file);
    });
  }

  async function buildOcrImageDataUrls(file: File): Promise<string[]> {
    const name = file.name.toLowerCase();
    const type = file.type || "";

    if (type.startsWith("image/")) {
      const dataUrl = await fileToDataUrl(file);
      return [dataUrl];
    }

    if (type === "application/pdf" || name.endsWith(".pdf")) {
      try {
        const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

        (pdfjsLib as any).GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${
          (pdfjsLib as any).version
        }/legacy/build/pdf.worker.min.mjs`;

        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = (pdfjsLib as any).getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;

        const maxPages = Math.min(pdf.numPages, 2);
        const images: string[] = [];

        for (let i = 1; i <= maxPages; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 1.5 });

          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");

          if (!context) continue;

          canvas.width = viewport.width;
          canvas.height = viewport.height;

          await page.render({
            canvasContext: context,
            viewport
          }).promise;

          images.push(canvas.toDataURL("image/png"));
        }

        return images;
      } catch (error) {
        console.error("PDF image generation failed:", error);
        return [];
      }
    }

    return [];
  }

  async function uploadSelectedFile(): Promise<{
    uploadedMessage: Msg | null;
    returnedChatId: string | null;
  }> {
    if (!selectedFile) {
      return { uploadedMessage: null, returnedChatId: activeChatIdRef.current };
    }

    const formData = new FormData();
    formData.append("file", selectedFile);

    if (userId) formData.append("userId", userId);
    if (guestId) formData.append("guestId", guestId);
    if (activeChatIdRef.current) formData.append("chatId", activeChatIdRef.current);

    const fileType = selectedFile.type || "";
    const fileName = selectedFile.name.toLowerCase();
    const shouldRunOcr =
      fileType.startsWith("image/") ||
      fileType === "application/pdf" ||
      fileName.endsWith(".pdf");

    if (shouldRunOcr) {
      const ocrImages = await buildOcrImageDataUrls(selectedFile);
      ocrImages.forEach((img, index) => {
        if (img && typeof img === "string") {
          formData.append(`ocrImageDataUrl_${index}`, img);
        }
      });
    }

    const res = await fetch("/api/upload", {
      method: "POST",
      body: formData
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data?.error || "File upload failed.");
    }

    const uploadedMessage: Msg = {
      role: "user",
      content: data.messageContent
    };

    setSelectedFile(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    return {
      uploadedMessage,
      returnedChatId: data.chatId || activeChatIdRef.current
    };
  }

  async function sendMessage(customMessages?: Msg[]) {
    if (loadingRef.current) return;
    if (!customMessages && !input.trim() && !selectedFile) return;

    let pendingRetryMessages: Msg[] | null = null;

    setLoading(true);
    loadingRef.current = true;
    stopListening();
    setMobileActionsOpen(false);

    try {
      let workingMessages = customMessages ? [...customMessages] : [...messagesRef.current];
      let currentChatId = activeChatIdRef.current;

      if (!customMessages && selectedFile) {
        const uploadResult = await uploadSelectedFile();

        if (uploadResult.uploadedMessage) {
          workingMessages = [...workingMessages, uploadResult.uploadedMessage];
          setMessages(workingMessages);
          messagesRef.current = workingMessages;
        }

        if (uploadResult.returnedChatId && !currentChatId) {
          currentChatId = uploadResult.returnedChatId;
          setActiveChatId(uploadResult.returnedChatId);
          activeChatIdRef.current = uploadResult.returnedChatId;
        }

        if (!input.trim()) {
          await loadHistory();
          return;
        }
      }

      const trimmedInput = customMessages
        ? customMessages[customMessages.length - 1]?.content?.trim() || ""
        : input.trim();

      const nextMessages = customMessages
        ? workingMessages
        : [...workingMessages, { role: "user", content: trimmedInput }];
      pendingRetryMessages = nextMessages;

      if (typeof navigator !== "undefined" && !navigator.onLine) {
        setRetryMessages(pendingRetryMessages);
        showToast(
          "You appear to be offline. Your latest messages were cached locally."
        );
        return;
      }

      const resolvedRoute = resolveModel(trimmedInput);

      if (!customMessages) {
        setInput("");
        setMessages(nextMessages);
        messagesRef.current = nextMessages;
      }

      if (isMobile) setSidebarOpen(false);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      if (resolvedRoute === "image") {
        const imageRes = await fetch("/api/image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            messages: convertMessagesForApi(nextMessages),
            mode: "image",
            guestId,
            userId,
            chatId: currentChatId
          })
        });

        if (!imageRes.ok) {
          let errorMessage = "Image request failed.";
          try {
            const errorData = await imageRes.json();
            errorMessage = errorData?.error || errorMessage;
          } catch {}

          const updated = [...nextMessages, { role: "assistant", content: errorMessage }];
          setMessages(updated);
          messagesRef.current = updated;
          await loadHistory();
          return;
        }

        const imageData = await imageRes.json();
        const imageReply = imageData.url || imageData.error || "...";
        const newChatId = imageData.chatId || currentChatId || activeChatIdRef.current || null;

        const updated = [...nextMessages, { role: "assistant", content: imageReply }];
        setMessages(updated);
        messagesRef.current = updated;

        if (newChatId) {
          setActiveChatId(newChatId);
          activeChatIdRef.current = newChatId;
        }

        await loadHistory();
        setRetryMessages(null);
        return;
      }

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          messages: convertMessagesForApi(nextMessages),
          mode: "general",
          model: resolvedRoute,
          guestId,
          userId,
          chatId: currentChatId
        })
      });

      const contentType = res.headers.get("content-type") || "";

      if (res.ok && contentType.includes("text/event-stream")) {
        await consumeChatStream(res, nextMessages, currentChatId);
        return;
      }

      const data = await res.json();

      if (!res.ok) {
        const errorMessage = data?.error || "Request failed.";
        const updated = [...nextMessages, { role: "assistant", content: errorMessage }];
        setMessages(updated);
        messagesRef.current = updated;
        setRetryMessages(pendingRetryMessages);
        showToast(getFriendlyClientError(errorMessage));
        await loadHistory();
        return;
      }

      const assistantReply = data?.reply || "No response.";
      const returnedChatId =
        data?.chatId || res.headers.get("X-Chat-Id") || currentChatId || null;

      if (returnedChatId) {
        setActiveChatId(returnedChatId);
        activeChatIdRef.current = returnedChatId;
      }

      const updated = [...nextMessages, { role: "assistant", content: assistantReply }];
      setMessages(updated);
      messagesRef.current = updated;

      if (data?.liveDataUsed) {
        setVoiceStatus("Live data used for this answer");
      } else {
        setVoiceStatus("Answer generated");
      }

      if (voiceAssistantRef.current && assistantReply) {
        speakText(assistantReply);
      } else {
        scheduleHandsFreeRestart(700);
      }

      setRetryMessages(null);
      await loadHistory();
    } catch (error: any) {
      if (error?.name === "AbortError") {
        setVoiceStatus("Generation stopped");
        scheduleHandsFreeRestart(700);
        return;
      }

      const friendlyMessage = getFriendlyClientError(
        error instanceof Error ? error.message : "Request failed."
      );
      const updated = [
        ...messagesRef.current,
        {
          role: "assistant",
          content: friendlyMessage
        }
      ];
      setMessages(updated);
      messagesRef.current = updated;
      setRetryMessages(pendingRetryMessages);
      showToast(friendlyMessage);
      scheduleHandsFreeRestart(700);
    } finally {
      abortControllerRef.current = null;
      setLoading(false);
      loadingRef.current = false;
    }
  }

  async function regenerateLastReply() {
    const trimmed = [...messagesRef.current];
    if (!trimmed.length) return;
    if (trimmed[trimmed.length - 1]?.role === "assistant") trimmed.pop();

    setMessages(trimmed);
    messagesRef.current = trimmed;
    await sendMessage(trimmed);
  }

  async function deleteChat(id: string) {
    const params = new URLSearchParams();
    params.set("id", id);

    if (userId) params.set("userId", userId);
    else if (guestId) params.set("guestId", guestId);

    await fetch(`/api/delete?${params.toString()}`, { method: "DELETE" });

    if (activeChatIdRef.current === id) {
      setActiveChatId(null);
      activeChatIdRef.current = null;
      setMessages([]);
      messagesRef.current = [];
    }

    removeCachedMessages(getCacheKey(id));

    await loadHistory();
  }

  async function clearAllChats() {
    const confirmed = window.confirm(
      "Are you sure you want to delete all chats? This cannot be undone."
    );
    if (!confirmed) return;

    try {
      const previousChatId = activeChatIdRef.current;
      const res = await fetch("/api/clear-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, guestId })
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data?.error || "Failed to clear chats.");
        return;
      }

      setActiveChatId(null);
      activeChatIdRef.current = null;
      setMessages([]);
      messagesRef.current = [];
      setHistory([]);
      removeCachedMessages(getCacheKey(previousChatId));
      await loadHistory();
    } catch {
      alert("Failed to clear chats.");
    }
  }

  async function renameChat(id: string, currentTitle: string) {
    const newTitle = window.prompt("Rename chat", currentTitle || "New Chat");
    if (!newTitle?.trim()) return;

    await fetch("/api/rename", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        title: newTitle.trim(),
        userId,
        guestId
      })
    });

    await loadHistory();
  }

  function newChat() {
    removeCachedMessages(getCacheKey(activeChatIdRef.current));
    setMessages([]);
    messagesRef.current = [];
    setActiveChatId(null);
    activeChatIdRef.current = null;
    setSelectedFile(null);
    stopSpeaking();
    setMobileActionsOpen(false);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    if (isMobile) setSidebarOpen(false);
    setVoiceStatus("Wake phrase: Hey Nexa");
    scheduleHandsFreeRestart(500);
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      alert("Copied");
    } catch {
      alert("Copy failed");
    }
  }

  function cleanMessageContent(content: string) {
    return content.replace(/\nCopy\s*\n/g, "\n");
  }

  function isLikelyCodeLine(line: string) {
    const trimmed = line.trim();
    if (!trimmed) return false;

    return (
      trimmed.startsWith("def ") ||
      trimmed.startsWith("class ") ||
      trimmed.startsWith("import ") ||
      trimmed.startsWith("from ") ||
      trimmed.startsWith("print(") ||
      trimmed.startsWith("return ") ||
      trimmed.startsWith("for ") ||
      trimmed.startsWith("while ") ||
      trimmed.startsWith("if ") ||
      trimmed.startsWith("elif ") ||
      trimmed === "else:" ||
      trimmed.startsWith("try:") ||
      trimmed.startsWith("except") ||
      trimmed.startsWith("finally:") ||
      trimmed.startsWith("with ") ||
      trimmed.startsWith("let ") ||
      trimmed.startsWith("const ") ||
      trimmed.startsWith("function ") ||
      trimmed.includes(" = ") ||
      trimmed.includes("=>") ||
      trimmed.endsWith("{") ||
      trimmed.endsWith("}") ||
      /^[a-zA-Z_][a-zA-Z0-9_]*\(/.test(trimmed)
    );
  }

  function splitContentIntoSegments(content: string): Segment[] {
    const cleaned = cleanMessageContent(content);

    if (cleaned.includes("```")) {
      return [{ type: "markdown", content: cleaned }];
    }

    const lines = cleaned.split("\n");
    const segments: Segment[] = [];
    let markdownBuffer: string[] = [];
    let codeBuffer: string[] = [];

    function flushMarkdown() {
      const text = markdownBuffer.join("\n").trim();
      if (text) segments.push({ type: "markdown", content: text });
      markdownBuffer = [];
    }

    function flushCode() {
      const text = codeBuffer.join("\n").trim();
      if (text) segments.push({ type: "code", content: text });
      codeBuffer = [];
    }

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === "Copy") continue;

      if (isLikelyCodeLine(line)) {
        flushMarkdown();
        codeBuffer.push(line);
      } else {
        flushCode();
        markdownBuffer.push(line);
      }
    }

    flushMarkdown();
    flushCode();

    return segments.filter((s) => s.content.length > 0);
  }

  const primaryButtonStyle: CSSProperties = {
    background: "#2b3445",
    color: "white",
    border: "1px solid #3b465a",
    borderRadius: 12,
    padding: "8px 12px",
    cursor: "pointer"
  };

  const iconButtonStyle: CSSProperties = {
    ...primaryButtonStyle,
    width: 44,
    minWidth: 44,
    height: 44,
    minHeight: 44,
    padding: 0,
    fontSize: 18,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0
  };

  const smallButtonStyle: CSSProperties = {
    background: "#2b3445",
    color: "white",
    border: "1px solid #3b465a",
    borderRadius: 8,
    padding: "4px 8px",
    cursor: "pointer",
    fontSize: 12
  };

  const dangerButtonStyle: CSSProperties = {
    background: "#3a1f1f",
    color: "white",
    border: "1px solid #5a2d2d",
    borderRadius: 8,
    padding: "8px 10px",
    cursor: "pointer",
    fontSize: 12,
    width: "100%",
    marginBottom: 12
  };

  const mobileActionCardStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    background: "#2b3445",
    color: "white",
    border: "1px solid #3b465a",
    borderRadius: 12,
    padding: "12px 14px",
    cursor: "pointer"
  };

  const sidebarStyle: CSSProperties = {
    width: isMobile ? "82vw" : 280,
    maxWidth: isMobile ? 320 : 280,
    background: "#171717",
    borderRight: "1px solid #2f2f2f",
    padding: isMobile ? 14 : 12,
    overflowY: "auto",
    flexShrink: 0,
    position: isMobile ? "fixed" : "relative",
    top: 0,
    left: isMobile ? 0 : undefined,
    height: "100vh",
    zIndex: isMobile ? 40 : "auto",
    display: "flex",
    flexDirection: "column",
    boxShadow: isMobile ? "10px 0 30px rgba(0,0,0,0.35)" : "none"
  };

  const bubbleBaseStyle: CSSProperties = {
    borderRadius: isMobile ? 16 : 18,
    boxShadow: "0 1px 2px rgba(0,0,0,0.25)"
  };

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        background: "#212121",
        color: "white",
        fontFamily: "Arial, sans-serif",
        overflow: "hidden"
      }}
    >
      {isMobile && sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            zIndex: 30
          }}
        />
      )}

      {cameraOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
            background: "rgba(0,0,0,0.75)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 760,
              background: "#171717",
              border: "1px solid #2f2f2f",
              borderRadius: 18,
              padding: 16
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 12
              }}
            >
              <div style={{ fontSize: 18, fontWeight: 700 }}>Camera</div>
              <button style={primaryButtonStyle} onClick={closeCamera}>
                Close
              </button>
            </div>

            {cameraLoading && (
              <div style={{ color: "#cbd5e1", marginBottom: 12 }}>
                Opening camera...
              </div>
            )}

            {cameraError && (
              <div style={{ color: "#fca5a5", marginBottom: 12 }}>
                {cameraError}
              </div>
            )}

            <div
              style={{
                width: "100%",
                background: "#0f0f0f",
                borderRadius: 12,
                overflow: "hidden",
                border: "1px solid #2f2f2f"
              }}
            >
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{
                  display: "block",
                  width: "100%",
                  maxHeight: "70vh",
                  objectFit: "cover",
                  background: "black"
                }}
              />
            </div>

            <div
              style={{
                display: "flex",
                gap: 12,
                marginTop: 14,
                flexWrap: "wrap"
              }}
            >
              <button
                style={primaryButtonStyle}
                onClick={capturePhoto}
                disabled={cameraLoading}
              >
                Capture
              </button>

              <button style={primaryButtonStyle} onClick={closeCamera}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        style={{
          position: "fixed",
          top: 14,
          right: 14,
          zIndex: 120,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          pointerEvents: "none"
        }}
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            style={{
              pointerEvents: "auto",
              minWidth: 240,
              maxWidth: 320,
              background: toast.kind === "error" ? "#3a1f1f" : "#183122",
              color: "white",
              border:
                toast.kind === "error"
                  ? "1px solid #7f1d1d"
                  : "1px solid #166534",
              borderRadius: 12,
              padding: "10px 12px",
              boxShadow: "0 12px 30px rgba(0,0,0,0.28)",
              fontSize: 13,
              lineHeight: 1.45
            }}
          >
            {toast.message}
          </div>
        ))}
      </div>

      {isMobile && mobileActionsOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            zIndex: 45
          }}
        />
      )}

      {sidebarOpen && (
        <div style={sidebarStyle}>
          <button
            style={{
              ...primaryButtonStyle,
              width: "100%",
              marginBottom: 14,
              background: "#2a2a2a",
              border: "1px solid #3a3a3a",
              minHeight: 44
            }}
            onClick={newChat}
          >
            + New Chat
          </button>

          <button style={dangerButtonStyle} onClick={clearAllChats}>
            Clear All Chats
          </button>

          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search chats..."
            style={{
              width: "100%",
              boxSizing: "border-box",
              marginBottom: 12,
              padding: 11,
              borderRadius: 12,
              border: "1px solid #3a3a3a",
              background: "#2a2a2a",
              color: "white",
              outline: "none"
            }}
          />

          <a
            href="/settings"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 14,
              color: "#cbd5e1",
              textDecoration: "none",
              fontSize: 14
            }}
          >
            <SettingsIcon width={18} height={18} />
            <span>Settings</span>
          </a>

          <div
            style={{
              fontSize: 13,
              color: "#bdbdbd",
              marginBottom: 10,
              fontWeight: 700
            }}
          >
            Chats
          </div>

          <div style={{ flex: 1, overflowY: "auto", paddingRight: 2 }}>
            {filteredHistory.length === 0 && (
              <div style={{ color: "#9ca3af", fontSize: 14 }}>
                {search.trim() ? "No matching chats." : "No chats yet."}
              </div>
            )}

            {filteredHistory.map((h) => (
              <div
                key={h.id}
                style={{
                  padding: 10,
                  marginBottom: 10,
                  borderRadius: 12,
                  background: activeChatId === h.id ? "#2a2a2a" : "transparent",
                  border: "1px solid #2f2f2f"
                }}
              >
                <div
                  style={{
                    cursor: "pointer",
                    marginBottom: 8,
                    color: "#f5f5f5",
                    fontWeight: 600,
                    wordBreak: "break-word",
                    fontSize: 14,
                    lineHeight: 1.4
                  }}
                  onClick={() => loadChat(h.id)}
                >
                  {h.title || "New Chat"}
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    style={smallButtonStyle}
                    onClick={() => renameChat(h.id, h.title)}
                  >
                    Rename
                  </button>
                  <button
                    style={smallButtonStyle}
                    onClick={() => deleteChat(h.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
          width: "100%"
        }}
      >
        <div
          style={{
            padding: isMobile ? "10px 12px" : "14px 18px",
            borderBottom: "1px solid #2f2f2f",
            background: "rgba(33,33,33,0.95)",
            backdropFilter: "blur(12px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            minHeight: isMobile ? 64 : "auto",
            position: "sticky",
            top: 0,
            zIndex: 20
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: isMobile ? 8 : 10,
              minWidth: 0,
              flex: 1,
              overflow: "hidden"
            }}
          >
            <button
              style={{
                ...primaryButtonStyle,
                width: 40,
                minWidth: 40,
                height: 40,
                padding: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0
              }}
              onClick={() => setSidebarOpen(!sidebarOpen)}
              title="Toggle sidebar"
            >
              <MenuIcon width={20} height={20} />
            </button>

            <div
              style={{
                fontSize: isMobile ? 17 : 20,
                fontWeight: 700,
                whiteSpace: "nowrap",
                flexShrink: 0
              }}
            >
              Nexa AI
            </div>

            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value as SelectedModel)}
              style={{
                background: "#2a2a2a",
                color: "white",
                border: "1px solid #3a3a3a",
                borderRadius: 10,
                padding: isMobile ? "8px 10px" : "8px 10px",
                minWidth: isMobile ? 78 : 96,
                maxWidth: isMobile ? 92 : 120,
                flexShrink: 1,
                fontSize: isMobile ? 13 : 14,
                height: 40
              }}
            >
              <option value="auto">Auto</option>
              <option value="openai">OpenAI</option>
              <option value="claude">Claude</option>
            </select>
          </div>

          <div
            ref={profileMenuRef}
            style={{
              position: "relative",
              flexShrink: 0
            }}
          >
            <button
              onClick={() => setShowProfileMenu((prev) => !prev)}
              style={{
                ...primaryButtonStyle,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                padding: isMobile ? "8px" : "8px 10px",
                width: 40,
                minWidth: 40,
                height: 40
              }}
              title="Profile"
            >
              <UserIcon width={18} height={18} />
              {!isMobile && <ChevronDownIcon width={16} height={16} />}
            </button>

            {showProfileMenu && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 8px)",
                  right: 0,
                  width: isMobile ? "calc(100vw - 24px)" : 320,
                  maxWidth: isMobile ? 310 : 320,
                  background: "#1f1f1f",
                  border: "1px solid #333",
                  borderRadius: 16,
                  boxShadow: "0 16px 40px rgba(0,0,0,0.4)",
                  overflow: "hidden",
                  zIndex: 80
                }}
              >
                <div
                  style={{
                    padding: "12px 14px",
                    borderBottom: "1px solid #2f2f2f",
                    background: "#191919"
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      color: "#9ca3af",
                      marginBottom: 8
                    }}
                  >
                    Voice assistant
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                    <button
                      onClick={() => {
                        if (voiceAssistantOn) stopSpeaking();
                        setVoiceAssistantOn((prev) => !prev);
                      }}
                      style={{
                        ...smallButtonStyle,
                        background: voiceAssistantOn ? "#1f4f3f" : "#2b3445",
                        border: voiceAssistantOn
                          ? "1px solid #2f7f64"
                          : "1px solid #3b465a"
                      }}
                    >
                      {voiceAssistantOn ? "Voice On" : "Voice Off"}
                    </button>

                    <button onClick={stopSpeaking} style={smallButtonStyle}>
                      Stop Voice
                    </button>
                  </div>

                  <div style={{ marginBottom: 10 }}>
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        fontSize: 13,
                        color: "white"
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={handsFreeWakeMode}
                        onChange={toggleHandsFree}
                      />
                      Optional hands-free wake mode
                    </label>
                    <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4, lineHeight: 1.45 }}>
                      New voice prompt is accepted only after the current answer finishes.
                    </div>
                  </div>

                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 4 }}>
                      Language
                    </div>
                    <select
                      value={voiceLanguage}
                      onChange={(e) => setVoiceLanguage(e.target.value as VoiceLanguage)}
                      style={{
                        width: "100%",
                        background: "#2a2a2a",
                        color: "white",
                        border: "1px solid #3a3a3a",
                        borderRadius: 8,
                        padding: "10px"
                      }}
                    >
                      <option value="en-US">English (US)</option>
                      <option value="en-IN">English (India)</option>
                      <option value="hi-IN">Hindi</option>
                      <option value="te-IN">Telugu</option>
                      <option value="ta-IN">Tamil</option>
                      <option value="kn-IN">Kannada</option>
                      <option value="ja-JP">Japanese</option>
                    </select>
                  </div>

                  <div>
                    <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 4 }}>
                      Voice
                    </div>
                    <select
                      value={selectedVoiceURI}
                      onChange={(e) => setSelectedVoiceURI(e.target.value)}
                      style={{
                        width: "100%",
                        background: "#2a2a2a",
                        color: "white",
                        border: "1px solid #3a3a3a",
                        borderRadius: 8,
                        padding: "10px"
                      }}
                    >
                      {filteredVoices.length === 0 ? (
                        <option value="">Default voice</option>
                      ) : (
                        filteredVoices.map((voice) => (
                          <option key={voice.voiceURI} value={voice.voiceURI}>
                            {voice.name} ({voice.lang})
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                </div>

                {userId ? (
                  <>
                    <div
                      style={{
                        padding: "12px 14px",
                        borderBottom: "1px solid #2f2f2f",
                        background: "#191919"
                      }}
                    >
                      <div
                        style={{
                          fontSize: 12,
                          color: "#9ca3af",
                          marginBottom: 4
                        }}
                      >
                        Logged in as
                      </div>
                      <div
                        style={{
                          fontSize: 14,
                          color: "white",
                          wordBreak: "break-word",
                          fontWeight: 600,
                          lineHeight: 1.35
                        }}
                      >
                        {userEmail || "Account"}
                      </div>
                    </div>

                    <a
                      href="/settings"
                      onClick={() => setShowProfileMenu(false)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "12px 14px",
                        color: "white",
                        textDecoration: "none",
                        borderBottom: "1px solid #2f2f2f"
                      }}
                    >
                      <SettingsIcon width={18} height={18} />
                      <span>Settings</span>
                    </a>

                    <button
                      onClick={handleLogout}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        padding: "12px 14px",
                        background: "transparent",
                        color: "#fca5a5",
                        border: "none",
                        cursor: "pointer"
                      }}
                    >
                      Logout
                    </button>
                  </>
                ) : (
                  <>
                    <a
                      href="/login"
                      onClick={() => setShowProfileMenu(false)}
                      style={{
                        display: "block",
                        padding: "12px 14px",
                        color: "white",
                        textDecoration: "none",
                        borderBottom: "1px solid #2f2f2f"
                      }}
                    >
                      Login
                    </a>

                    <a
                      href="/signup"
                      onClick={() => setShowProfileMenu(false)}
                      style={{
                        display: "block",
                        padding: "12px 14px",
                        color: "white",
                        textDecoration: "none"
                      }}
                    >
                      Sign Up
                    </a>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: isMobile ? "12px 0 18px 0" : "24px 0"
          }}
        >
          {messages.length === 0 ? (
            <div
              style={{
                maxWidth: 800,
                margin: isMobile ? "32px auto 0 auto" : "80px auto 0 auto",
                textAlign: "center",
                color: "#cbd5e1",
                padding: isMobile ? "0 16px" : "0 20px"
              }}
            >
              <div
                style={{
                  fontSize: isMobile ? 24 : 34,
                  fontWeight: 700,
                  marginBottom: 12,
                  lineHeight: 1.2
                }}
              >
                How can I help you today?
              </div>

              <div style={{ color: "#9ca3af", fontSize: isMobile ? 14 : 16, lineHeight: 1.6 }}>
                One chat for text, code, images, files, camera, voice, and live answers.
              </div>

              <div
                style={{
                  marginTop: 16,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  background: "#1f2937",
                  border: "1px solid #374151",
                  borderRadius: 999,
                  padding: "8px 14px",
                  fontSize: 13,
                  color: "#cbd5e1",
                  maxWidth: "100%"
                }}
              >
                <SparklesIcon width={16} height={16} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{voiceStatus}</span>
              </div>

              {!speechSupported && (
                <div
                  style={{
                    marginTop: 12,
                    fontSize: 13,
                    color: "#fbbf24"
                  }}
                >
                  Microphone input is not supported in this browser.
                </div>
              )}
            </div>
          ) : (
            <div style={{ maxWidth: 860, margin: "0 auto", padding: isMobile ? "0 10px" : "0 12px" }}>
              <div
                style={{
                  marginBottom: 12,
                  fontSize: 12,
                  color: "#a5b4fc",
                  padding: isMobile ? "0 4px" : 0
                }}
              >
                {voiceStatus}
              </div>

              {messages.map((m, i) => {
                const parsedFile = parseFileMessage(m.content);
                const isImage =
                  !parsedFile &&
                  typeof m.content === "string" &&
                  (m.content.startsWith("http") ||
                    m.content.startsWith("data:image"));

                const segments =
                  !isImage && !parsedFile && typeof m.content === "string"
                    ? splitContentIntoSegments(m.content)
                    : [];

                const isUser = m.role === "user";

                return (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      justifyContent: isUser ? "flex-end" : "flex-start",
                      marginBottom: isMobile ? 14 : 18
                    }}
                  >
                    <div
                      style={{
                        ...bubbleBaseStyle,
                        maxWidth: isMobile ? "95%" : isUser ? "75%" : "85%",
                        background: isUser ? "#2f6fed" : "#2a2a2a",
                        color: "white",
                        padding: isMobile ? "12px 12px" : "14px 16px"
                      }}
                    >
                      <div
                        style={{
                          fontWeight: 700,
                          color: isUser ? "#dbeafe" : "#f8fafc",
                          marginBottom: 8,
                          fontSize: 12
                        }}
                      >
                        {isUser ? "You" : "AI"}
                      </div>

                      {parsedFile ? (
                        <div>
                          <div
                            style={{
                              border: "1px solid rgba(255,255,255,0.2)",
                              borderRadius: 12,
                              padding: 12,
                              background: "rgba(0,0,0,0.15)"
                            }}
                          >
                            <div style={{ fontWeight: 700, marginBottom: 6 }}>
                              Uploaded file
                            </div>

                            <div style={{ marginBottom: 6, wordBreak: "break-word" }}>
                              {parsedFile.fileName}
                            </div>

                            <div
                              style={{
                                fontSize: 12,
                                color: "#dbeafe",
                                marginBottom: 6
                              }}
                            >
                              {parsedFile.mimeType}
                            </div>

                            <div
                              style={{
                                fontSize: 12,
                                color:
                                  parsedFile.extractionStatus === "TEXT_EXTRACTED" ||
                                  parsedFile.extractionStatus === "OCR_TEXT_EXTRACTED"
                                    ? "#86efac"
                                    : "#fca5a5",
                                marginBottom: 10
                              }}
                            >
                              {parsedFile.extractionStatus === "TEXT_EXTRACTED"
                                ? "Embedded text extracted successfully"
                                : parsedFile.extractionStatus === "OCR_TEXT_EXTRACTED"
                                  ? "OCR text extracted successfully"
                                  : "No extractable text found"}
                            </div>

                            {parsedFile.extractedText && (
                              <div
                                style={{
                                  marginTop: 10,
                                  padding: 10,
                                  borderRadius: 10,
                                  background: "rgba(255,255,255,0.06)",
                                  fontSize: 13,
                                  whiteSpace: "pre-wrap",
                                  maxHeight: 220,
                                  overflowY: "auto"
                                }}
                              >
                                {parsedFile.extractedText.slice(0, 1200)}
                                {parsedFile.extractedText.length > 1200 ? "..." : ""}
                              </div>
                            )}

                            <a
                              href={parsedFile.fileUrl}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                color: "white",
                                textDecoration: "none",
                                background: "#1e293b",
                                border: "1px solid #334155",
                                borderRadius: 8,
                                padding: "8px 10px",
                                display: "inline-block",
                                marginTop: 10
                              }}
                            >
                              Open file
                            </a>
                          </div>
                        </div>
                      ) : isImage ? (
                        <div>
                          <img
                            src={m.content}
                            alt="Generated"
                            style={{
                              maxWidth: "360px",
                              width: "100%",
                              borderRadius: 12,
                              display: "block"
                            }}
                          />
                          <button
                            style={{ ...smallButtonStyle, marginTop: 10 }}
                            onClick={() => {
                              const a = document.createElement("a");
                              a.href = m.content;
                              a.download = "image.png";
                              a.click();
                            }}
                          >
                            Download
                          </button>
                        </div>
                      ) : (
                        <div style={{ color: "#f3f4f6", lineHeight: 1.65, fontSize: isMobile ? 14 : 15 }}>
                          {segments.map((segment, index) => {
                            if (segment.type === "code") {
                              return (
                                <div
                                  key={index}
                                  style={{
                                    position: "relative",
                                    marginTop: 8,
                                    marginBottom: 8
                                  }}
                                >
                                  <button
                                    onClick={() => copyText(segment.content)}
                                    style={{
                                      position: "absolute",
                                      right: 8,
                                      top: 8,
                                      background: "#334155",
                                      color: "white",
                                      border: "none",
                                      padding: "4px 8px",
                                      borderRadius: 6,
                                      cursor: "pointer",
                                      fontSize: 12
                                    }}
                                  >
                                    Copy
                                  </button>

                                  <pre
                                    style={{
                                      background: "#111827",
                                      padding: 14,
                                      borderRadius: 12,
                                      overflowX: "auto",
                                      border: "1px solid #374151",
                                      margin: 0,
                                      whiteSpace: "pre-wrap"
                                    }}
                                  >
                                    <code>{segment.content}</code>
                                  </pre>
                                </div>
                              );
                            }

                            return (
                              <ReactMarkdown
                                key={index}
                                components={{
                                  p: ({ children }) => (
                                    <div style={{ marginBottom: 10 }}>{children}</div>
                                  ),
                                  ul: ({ children }) => (
                                    <ul style={{ paddingLeft: 20, marginBottom: 10 }}>
                                      {children}
                                    </ul>
                                  ),
                                  ol: ({ children }) => (
                                    <ol style={{ paddingLeft: 20, marginBottom: 10 }}>
                                      {children}
                                    </ol>
                                  ),
                                  li: ({ children }) => (
                                    <li style={{ marginBottom: 4 }}>{children}</li>
                                  ),
                                  h1: ({ children }) => (
                                    <h1 style={{ margin: "12px 0 8px 0", fontSize: 28 }}>
                                      {children}
                                    </h1>
                                  ),
                                  h2: ({ children }) => (
                                    <h2 style={{ margin: "12px 0 8px 0", fontSize: 24 }}>
                                      {children}
                                    </h2>
                                  ),
                                  h3: ({ children }) => (
                                    <h3 style={{ margin: "12px 0 8px 0", fontSize: 20 }}>
                                      {children}
                                    </h3>
                                  ),
                                  code(props: any) {
                                    const { inline, children } = props;
                                    const codeText = String(children).replace(/\n$/, "");

                                    if (inline) {
                                      return (
                                        <code
                                          style={{
                                            background: "#374151",
                                            padding: "2px 6px",
                                            borderRadius: 6
                                          }}
                                        >
                                          {children}
                                        </code>
                                      );
                                    }

                                    return (
                                      <pre
                                        style={{
                                          background: "#111827",
                                          padding: 14,
                                          borderRadius: 12,
                                          overflowX: "auto",
                                          border: "1px solid #374151",
                                          margin: 0
                                        }}
                                      >
                                        <code>{codeText}</code>
                                      </pre>
                                    );
                                  }
                                }}
                              >
                                {segment.content}
                              </ReactMarkdown>
                            );
                          })}

                          {i === messages.length - 1 && loading && !isUser && (
                            <span style={{ marginLeft: 4, opacity: 0.8 }}>▍</span>
                          )}
                        </div>
                      )}

                      {!isUser && !isImage && !parsedFile && (
                        <div
                          style={{
                            display: "flex",
                            gap: 8,
                            marginTop: 12,
                            flexWrap: "wrap"
                          }}
                        >
                          <button
                            style={smallButtonStyle}
                            onClick={() => copyText(m.content)}
                          >
                            Copy
                          </button>

                          <button
                            style={smallButtonStyle}
                            onClick={() => speakText(m.content)}
                          >
                            Speak
                          </button>

                          {i === messages.length - 1 && (
                            <button
                              style={smallButtonStyle}
                              onClick={regenerateLastReply}
                            >
                              Regenerate
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {loading && (
                <div style={{ color: "#9ca3af", marginTop: 8, paddingLeft: isMobile ? 4 : 0 }}>
                  Generating...
                </div>
              )}

              <div ref={bottomRef} />
            </div>
          )}
        </div>

        <div
          style={{
            borderTop: "1px solid #2f2f2f",
            background: "rgba(33,33,33,0.98)",
            backdropFilter: "blur(12px)",
            padding: isMobile ? "10px 10px calc(10px + env(safe-area-inset-bottom)) 10px" : "16px 20px 20px 20px",
            position: "relative",
            zIndex: isMobile && mobileActionsOpen ? 50 : 1
          }}
        >
          <div
            style={{
              maxWidth: 860,
              margin: "0 auto",
              position: "relative"
            }}
          >
            {selectedFile && (
              <div
                style={{
                  marginBottom: 10,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  background: "#2a2a2a",
                  border: "1px solid #3a3a3a",
                  borderRadius: 14,
                  padding: "10px 12px",
                  width: isMobile ? "100%" : "fit-content",
                  maxWidth: "100%",
                  boxSizing: "border-box"
                }}
              >
                <span
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    flex: 1
                  }}
                >
                  {selectedFile.name}
                </span>

                <button
                  onClick={() => {
                    setSelectedFile(null);
                    if (fileInputRef.current) {
                      fileInputRef.current.value = "";
                    }
                  }}
                  style={{
                    background: "transparent",
                    color: "white",
                    border: "none",
                    cursor: "pointer",
                    fontSize: 16
                  }}
                >
                  ×
                </button>
              </div>
            )}

            <div
              style={{
                marginBottom: 8,
                fontSize: 12,
                color: "#94a3b8",
                paddingLeft: isMobile ? 2 : 0
              }}
            >
              Voice language: {getLanguageLabel(voiceLanguage)}
              {selectedVoiceURI ? " • custom voice selected" : ""}
              {handsFreeWakeMode ? " • hands-free on" : " • hands-free off"}
            </div>

            {retryMessages && (
              <div
                style={{
                  marginBottom: 10,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  background: "#2a1d1d",
                  border: "1px solid #5f2b2b",
                  borderRadius: 12,
                  padding: "10px 12px",
                  color: "#fecaca",
                  fontSize: 13
                }}
              >
                <span>Last request failed. Your message is cached locally.</span>
                <button
                  type="button"
                  style={smallButtonStyle}
                  onClick={() => void sendMessage(retryMessages)}
                >
                  Retry
                </button>
              </div>
            )}

            {isMobile ? (
              <div
                style={{
                  background: "#262626",
                  border: "1px solid #343434",
                  borderRadius: 18,
                  padding: 10,
                  boxShadow: "0 10px 25px rgba(0,0,0,0.2)"
                }}
              >
                <div ref={mobileActionsRef} style={{ position: "relative" }}>
                  {mobileActionsOpen && (
                    <div
                      style={{
                        position: "absolute",
                        bottom: 60,
                        left: 0,
                        width: 220,
                        background: "#1f1f1f",
                        border: "1px solid #333",
                        borderRadius: 16,
                        padding: 10,
                        boxShadow: "0 16px 40px rgba(0,0,0,0.4)",
                        zIndex: 50,
                        display: "flex",
                        flexDirection: "column",
                        gap: 8
                      }}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        onChange={(e) => {
                          const file = e.target.files?.[0] || null;
                          setSelectedFile(file);
                          setMobileActionsOpen(false);
                        }}
                        style={{ display: "none" }}
                      />

                      <button
                        type="button"
                        style={mobileActionCardStyle}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <PaperclipIcon width={18} height={18} />
                        <span>Upload file</span>
                      </button>

                      <button
                        type="button"
                        style={{
                          ...mobileActionCardStyle,
                          background: isListening ? "#7c3aed" : "#2b3445",
                          border: isListening ? "1px solid #8b5cf6" : "1px solid #3b465a"
                        }}
                        onClick={startMicOnce}
                      >
                        <MicIcon width={18} height={18} />
                        <span>Speak</span>
                      </button>

                      <button
                        type="button"
                        style={{
                          ...mobileActionCardStyle,
                          background: voiceAssistantOn ? "#1f4f3f" : "#2b3445",
                          border: voiceAssistantOn
                            ? "1px solid #2f7f64"
                            : "1px solid #3b465a"
                        }}
                        onClick={() => {
                          if (voiceAssistantOn) stopSpeaking();
                          setVoiceAssistantOn((prev) => !prev);
                          setMobileActionsOpen(false);
                        }}
                      >
                        {voiceAssistantOn ? (
                          <VolumeOnIcon width={18} height={18} />
                        ) : (
                          <VolumeOffIcon width={18} height={18} />
                        )}
                        <span>{voiceAssistantOn ? "Voice on" : "Voice off"}</span>
                      </button>

                      <button
                        type="button"
                        style={{
                          ...mobileActionCardStyle,
                          background: handsFreeWakeMode ? "#0f766e" : "#2b3445",
                          border: handsFreeWakeMode
                            ? "1px solid #14b8a6"
                            : "1px solid #3b465a"
                        }}
                        onClick={toggleHandsFree}
                      >
                        <SparklesIcon width={18} height={18} />
                        <span>{handsFreeWakeMode ? "Hands-free on" : "Hands-free off"}</span>
                      </button>

                      <button
                        type="button"
                        style={mobileActionCardStyle}
                        onClick={openCamera}
                      >
                        <CameraIcon width={18} height={18} />
                        <span>Open camera</span>
                      </button>
                    </div>
                  )}

                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-end",
                      gap: 8
                    }}
                  >
                    <button
                      type="button"
                      style={{
                        ...iconButtonStyle,
                        width: 48,
                        minWidth: 48,
                        height: 48,
                        minHeight: 48,
                        borderRadius: 14,
                        background: mobileActionsOpen ? "#3b465a" : "#2b3445"
                      }}
                      onClick={() => setMobileActionsOpen((prev) => !prev)}
                      title="More actions"
                    >
                      <PlusIcon width={18} height={18} />
                    </button>

                    <textarea
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          void submitCurrentInput();
                        }
                      }}
                      rows={1}
                      style={{
                        flex: 1,
                        padding: "12px 14px",
                        background: "#1f1f1f",
                        color: "white",
                        border: "1px solid #383838",
                        borderRadius: 14,
                        outline: "none",
                        resize: "none",
                        minHeight: 48,
                        maxHeight: 132,
                        width: "100%",
                        boxSizing: "border-box",
                        lineHeight: 1.4,
                        fontSize: 15
                      }}
                      placeholder={
                        isListening
                          ? `Listening in ${getLanguageLabel(voiceLanguage)}...`
                          : selectedFile
                            ? "Ask about the file/photo..."
                            : "Message Nexa AI"
                      }
                    />

                    {loading ? (
                      <button
                        type="button"
                        style={{
                          ...iconButtonStyle,
                          background: "#4b1d1d",
                          border: "1px solid #7a2d2d",
                          width: 48,
                          minWidth: 48,
                          height: 48,
                          minHeight: 48,
                          borderRadius: 14
                        }}
                        onClick={stopGeneration}
                        title="Stop"
                      >
                        <StopIcon width={18} height={18} />
                      </button>
                    ) : (
                      <button
                        type="button"
                        style={{
                          ...iconButtonStyle,
                          width: 48,
                          minWidth: 48,
                          height: 48,
                          minHeight: 48,
                          borderRadius: 14
                        }}
                        onClick={() => void submitCurrentInput()}
                        title="Send"
                      >
                        <SendIcon width={18} height={18} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  gap: 12,
                  alignItems: "center"
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    setSelectedFile(file);
                  }}
                  style={{ display: "none" }}
                />

                <button
                  type="button"
                  style={iconButtonStyle}
                  onClick={() => fileInputRef.current?.click()}
                  title="Upload"
                >
                  <PaperclipIcon width={18} height={18} />
                </button>

                <button
                  type="button"
                  style={{
                    ...iconButtonStyle,
                    background: isListening ? "#7c3aed" : "#2b3445",
                    border: isListening ? "1px solid #8b5cf6" : "1px solid #3b465a"
                  }}
                  onClick={startMicOnce}
                  title="Speak"
                >
                  <MicIcon width={18} height={18} />
                </button>

                <button
                  type="button"
                  style={{
                    ...iconButtonStyle,
                    background: voiceAssistantOn ? "#1f4f3f" : "#2b3445",
                    border: voiceAssistantOn
                      ? "1px solid #2f7f64"
                      : "1px solid #3b465a"
                  }}
                  onClick={() => {
                    if (voiceAssistantOn) stopSpeaking();
                    setVoiceAssistantOn((prev) => !prev);
                  }}
                  title={voiceAssistantOn ? "Voice on" : "Voice off"}
                >
                  {voiceAssistantOn ? (
                    <VolumeOnIcon width={18} height={18} />
                  ) : (
                    <VolumeOffIcon width={18} height={18} />
                  )}
                </button>

                <button
                  type="button"
                  style={{
                    ...iconButtonStyle,
                    background: handsFreeWakeMode ? "#0f766e" : "#2b3445",
                    border: handsFreeWakeMode
                      ? "1px solid #14b8a6"
                      : "1px solid #3b465a"
                  }}
                  onClick={toggleHandsFree}
                  title="Hands-free wake mode"
                >
                  <SparklesIcon width={18} height={18} />
                </button>

                <button
                  type="button"
                  style={iconButtonStyle}
                  onClick={openCamera}
                  title="Camera"
                >
                  <CameraIcon width={18} height={18} />
                </button>

                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void submitCurrentInput();
                    }
                  }}
                  rows={1}
                  style={{
                    flex: 1,
                    padding: 14,
                    background: "#2a2a2a",
                    color: "white",
                    border: "1px solid #3a3a3a",
                    borderRadius: 16,
                    outline: "none",
                    resize: "none",
                    minHeight: 52,
                    width: "100%",
                    boxSizing: "border-box"
                  }}
                  placeholder={
                    isListening
                      ? `Listening in ${getLanguageLabel(voiceLanguage)}...`
                      : selectedFile
                        ? "Ask something about the file/photo, or press Send to upload only"
                        : "Message Nexa AI"
                  }
                />

                {loading ? (
                  <button
                    type="button"
                    style={{
                      ...iconButtonStyle,
                      background: "#4b1d1d",
                      border: "1px solid #7a2d2d"
                    }}
                    onClick={stopGeneration}
                    title="Stop"
                  >
                    <StopIcon width={18} height={18} />
                  </button>
                ) : (
                  <button
                    type="button"
                    style={iconButtonStyle}
                    onClick={() => void submitCurrentInput()}
                    title="Send"
                  >
                    <SendIcon width={18} height={18} />
                  </button>
                )}
              </div>
            )}

            {!speechSupported && (
              <div
                style={{
                  marginTop: 10,
                  fontSize: 12,
                  color: "#fbbf24"
                }}
              >
                Microphone input is not supported in this browser.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
