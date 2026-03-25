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
import { getAuthHeaders, supabaseBrowser } from "@/lib/supabase-browser";
import {
  loadCachedMessages,
  removeCachedMessages,
  saveCachedMessages
} from "@/lib/chat-cache";
import { acquireSingleFlight, releaseSingleFlight } from "@/lib/single-flight";
import {
  buildFileMessageContent,
  compactFileMessageForApi,
  parseFileMessage,
  type ParsedFileMessage
} from "@/lib/file-messages";
import {
  GOAL_OPTIONS,
  computeProgress,
  createEmptyWorkspace,
  createWorkspace,
  getDailyGoalUsage,
  getGoalQuestions,
  getWorkspaceStorageKey,
  type GoalId,
  type GoalQuestion,
  type GoalWorkspace,
  type OutputCard,
  type PersonalWorkspace
} from "@/lib/nexa-workspace";

declare global {
  interface Window {
    webkitSpeechRecognition?: any;
    SpeechRecognition?: any;
  }
}

type Msg = {
  role: string;
  content: string;
  metadata?: {
    agentProfile?: string;
    sources?: Array<{ title: string; url: string }>;
  };
};

type ToastItem = {
  id: string;
  kind: "error" | "success";
  message: string;
};

type StreamChunkEvent =
  | { type: "meta"; chatId?: string; liveDataUsed?: boolean; rememberedMemory?: string; agentProfile?: string; sources?: Array<{ title: string; url: string }> }
  | { type: "delta"; delta?: string }
  | { type: "done"; reply?: string; chatId?: string; liveDataUsed?: boolean; rememberedMemory?: string; agentProfile?: string; sources?: Array<{ title: string; url: string }> }
  | { type: "error"; error?: string };

type ChatItem = {
  id: string;
  title: string;
};

type Segment =
  | { type: "markdown"; content: string }
  | { type: "code"; content: string };

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

const PDF_OCR_RENDER_SCALE = 0.8;
const PDF_OCR_MAX_PAGES = 1;
const PDF_OCR_MAX_WIDTH = 900;
const PDF_OCR_JPEG_QUALITY = 0.45;

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

function WaveformIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <IconBase {...props}>
      <path d="M3 12h2" />
      <path d="M7 8v8" />
      <path d="M12 5v14" />
      <path d="M17 8v8" />
      <path d="M21 12h-2" />
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

function getSourceHostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "source";
  }
}

function formatSourceLabel(source: { title: string; url: string }) {
  const hostname = getSourceHostname(source.url);
  const title = (source.title || "").trim();

  if (!title || ["source", "article", "link"].includes(title.toLowerCase())) {
    return hostname;
  }

  const cleanedTitle = title
    .replace(/\s*\|\s*[^|]+$/, "")
    .replace(/\s*[-:]\s*[^-:]+$/, "")
    .trim();

  if (!cleanedTitle) return hostname;

  const shortTitle =
    cleanedTitle.length > 42 ? `${cleanedTitle.slice(0, 39).trim()}...` : cleanedTitle;

  return `${hostname} · ${shortTitle}`;
}

function extractLinks(text: string) {
  return text
    .split("\n")
    .map((line) => {
      const match = line.match(/https?:\/\/\S+/);
      if (!match) return null;
      return {
        label: line.replace(match[0], "").trim() || match[0],
        url: match[0]
      };
    })
    .filter(Boolean) as Array<{ label: string; url: string }>;
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
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
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
  const [fullVoiceMode, setFullVoiceMode] = useState(false);
  const [voiceLanguage, setVoiceLanguage] = useState<VoiceLanguage>("en-US");
  const [availableVoices, setAvailableVoices] = useState<VoiceOption[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState("");
  const [voiceStatus, setVoiceStatus] = useState("Wake phrase: Hey Nexa");
  const [rememberedMemory, setRememberedMemory] = useState("");
  const [personalWorkspace, setPersonalWorkspace] =
    useState<PersonalWorkspace>(createEmptyWorkspace());
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [selectedGoalId, setSelectedGoalId] = useState<GoalId | null>(null);
  const [goalAnswers, setGoalAnswers] = useState<Record<string, string>>({});
  const [goalAnswerDraft, setGoalAnswerDraft] = useState("");
  const [goalQuestionIndex, setGoalQuestionIndex] = useState(0);
  const [showDoItModal, setShowDoItModal] = useState(false);
  const [celebrationText, setCelebrationText] = useState("");
  const [webSearchEnabled, setWebSearchEnabled] = useState(true);
  const [codeModeEnabled, setCodeModeEnabled] = useState(false);
  const [prefersDirectAnswers, setPrefersDirectAnswers] = useState(true);
  const [activeAgentLabel, setActiveAgentLabel] = useState("General Agent");
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [retryMessages, setRetryMessages] = useState<Msg[] | null>(null);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeRequestIdRef = useRef(0);
  const canceledRequestIdsRef = useRef(new Set<number>());
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<any>(null);
  const restartTimerRef = useRef<number | null>(null);
  const mobileActionsRef = useRef<HTMLDivElement | null>(null);

  const loadingRef = useRef(false);
  const messagesRef = useRef<Msg[]>([]);
  const activeChatIdRef = useRef<string | null>(null);
  const handsFreeRef = useRef(false);
  const fullVoiceRef = useRef(false);
  const voiceAssistantRef = useRef(true);
  const isSpeakingRef = useRef(false);
  const manualMicModeRef = useRef(false);
  const userStoppedRef = useRef(false);
  const actionInFlightRef = useRef(new Set<string>());
  const historyInFlightRef = useRef(new Set<string>());

  const guestId = typeof window !== "undefined" ? getGuestId() : null;
  const workspaceOwnerId = userId || guestId || "anonymous";
  const activeGoalWorkspace = useMemo(() => {
    if (!personalWorkspace.activeGoalId) return null;
    return (
      personalWorkspace.workspaces.find(
        (workspace) => workspace.goalId === personalWorkspace.activeGoalId
      ) || null
    );
  }, [personalWorkspace]);
  const latestWorkspace = activeGoalWorkspace || personalWorkspace.workspaces[0] || null;
  const activeGoalProgress = computeProgress(activeGoalWorkspace);
  const tasksRemaining = activeGoalWorkspace
    ? activeGoalWorkspace.tasks.filter((task) => !task.completed).length
    : 0;
  const goalQuestions = selectedGoalId ? getGoalQuestions(selectedGoalId) : [];
  const currentGoalQuestion =
    goalQuestions.length > 0 ? goalQuestions[goalQuestionIndex] : null;

  const selectedFileLabel =
    selectedFiles.length === 1
      ? selectedFiles[0]?.name || ""
      : selectedFiles.length > 1
        ? `${selectedFiles.length} files selected`
        : "";

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

  function celebrate(message: string) {
    setCelebrationText(message);
    window.setTimeout(() => setCelebrationText(""), 1800);
  }

  async function apiFetch(input: string, init: RequestInit = {}) {
    const authHeaders = await getAuthHeaders();
    const headers = new Headers(init.headers);

    for (const [key, value] of Object.entries(authHeaders)) {
      headers.set(key, value);
    }

    return fetch(input, {
      ...init,
      headers
    });
  }

  async function reportClientError(params: {
    source: string;
    message: string;
    stack?: string;
  }) {
    try {
      await apiFetch("/api/client-errors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          guestId,
          source: params.source,
          message: params.message,
          stack: params.stack || "",
          href: typeof window !== "undefined" ? window.location.href : ""
        })
      });
    } catch {}
  }

  async function recordAnalyticsEvent(
    eventName: string,
    metadata: Record<string, unknown> = {}
  ) {
    try {
      await apiFetch("/api/analytics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          guestId,
          chatId: activeChatIdRef.current,
          eventName,
          metadata
        })
      });
    } catch {}
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

  function appendAssistantErrorMessage(message: string) {
    const currentMessages = [...messagesRef.current];
    const lastMessage = currentMessages[currentMessages.length - 1];

    if (
      lastMessage?.role === "assistant" &&
      typeof lastMessage.content === "string" &&
      lastMessage.content.trim() === message
    ) {
      return;
    }

    if (
      lastMessage?.role === "assistant" &&
      typeof lastMessage.content === "string" &&
      lastMessage.content.trim().length === 0
    ) {
      currentMessages.pop();
    }

    const updated = [
      ...currentMessages,
      {
        role: "assistant",
        content: message,
        metadata: { sources: [] }
      }
    ];

    setMessages(updated);
    messagesRef.current = updated;
  }

  function getAgentLabel(agentProfile?: string) {
    switch (agentProfile) {
      case "coding":
        return "Coding Agent";
      case "research":
        return "Research Agent";
      case "vision":
        return "Vision Agent";
      default:
        return "General Agent";
    }
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
    let finalAgentProfile: string | undefined;
    let finalSources: Array<{ title: string; url: string }> = [];

    const applyAssistantText = (text: string) => {
      const updated = [
        ...nextMessages,
        {
          role: "assistant",
          content: text,
          metadata: {
            agentProfile: finalAgentProfile,
            sources: finalSources
          }
        }
      ];
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
        if (typeof metaPayload.rememberedMemory === "string") {
          setRememberedMemory(metaPayload.rememberedMemory);
        }
        finalAgentProfile = metaPayload.agentProfile;
        finalSources = Array.isArray(metaPayload.sources) ? metaPayload.sources : [];
        setActiveAgentLabel(getAgentLabel(metaPayload.agentProfile));
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
        if (typeof donePayload.rememberedMemory === "string") {
          setRememberedMemory(donePayload.rememberedMemory);
        }
        finalAgentProfile = donePayload.agentProfile;
        finalSources = Array.isArray(donePayload.sources) ? donePayload.sources : [];
        setActiveAgentLabel(getAgentLabel(donePayload.agentProfile));
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
    fullVoiceRef.current = fullVoiceMode;
  }, [fullVoiceMode]);

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

  function getIdleVoiceStatus() {
    if (fullVoiceRef.current) return "Voice chat ready";
    if (handsFreeRef.current) return "Hands-free ready";
    return "Wake phrase: Hey Nexa";
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

    if (!fullVoiceMode) {
      stopListening();
    }
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
      setVoiceStatus(
        fullVoiceRef.current ? "Speaking. Tap mic to interrupt." : "Speaking..."
      );
    };

    utterance.onend = () => {
      isSpeakingRef.current = false;
      setVoiceStatus(getIdleVoiceStatus());
      scheduleHandsFreeRestart(600);
    };

    utterance.onerror = () => {
      isSpeakingRef.current = false;
      setVoiceStatus(getIdleVoiceStatus());
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
      await apiFetch("/api/migrate-guest", {
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

  async function loadPreferences(currentUserIdArg?: string | null) {
    const actualUserId = currentUserIdArg ?? userId;
    const params = new URLSearchParams();

    if (actualUserId) params.set("userId", actualUserId);
    else if (guestId) params.set("guestId", guestId);
    else return;

    try {
      const res = await apiFetch(`/api/preferences?${params.toString()}`, {
        cache: "no-store"
      });
      const data = await res.json();
      setRememberedMemory(data.memory || "");
      setWebSearchEnabled(data.web_search_enabled !== false);
      setCodeModeEnabled(data.code_mode_enabled === true);
      setPrefersDirectAnswers(data.prefers_direct_answers !== false);
    } catch {}
  }

  async function savePreferences(next?: {
    memory?: string;
    webSearchEnabled?: boolean;
    codeModeEnabled?: boolean;
    prefersDirectAnswers?: boolean;
  }) {
    const actualMemory = next?.memory ?? rememberedMemory;
    const actualWebSearchEnabled = next?.webSearchEnabled ?? webSearchEnabled;
    const actualCodeModeEnabled = next?.codeModeEnabled ?? codeModeEnabled;
    const actualPrefersDirectAnswers =
      next?.prefersDirectAnswers ?? prefersDirectAnswers;

    try {
      await apiFetch("/api/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          guestId,
          memory: actualMemory,
          webSearchEnabled: actualWebSearchEnabled,
          codeModeEnabled: actualCodeModeEnabled,
          prefersDirectAnswers: actualPrefersDirectAnswers
        })
      });
    } catch {}
  }

  async function loadHistory(currentUserIdArg?: string | null) {
    const actualUserId = currentUserIdArg ?? userId;
    const historyKey = `history:${actualUserId || guestId || "anonymous"}`;

    if (!acquireSingleFlight(historyInFlightRef.current, historyKey)) {
      return;
    }

    const params = new URLSearchParams();

    if (actualUserId) params.set("userId", actualUserId);
    else if (guestId) params.set("guestId", guestId);
    else {
      setHistory([]);
      releaseSingleFlight(historyInFlightRef.current, historyKey);
      return;
    }

    try {
      const res = await apiFetch(`/api/history?${params.toString()}`, {
        cache: "no-store"
      });
      const data = await res.json();
      setHistory(Array.isArray(data) ? data : []);
    } finally {
      releaseSingleFlight(historyInFlightRef.current, historyKey);
    }
  }

  async function loadChat(chatId: string) {
    const actionKey = `load-chat:${chatId}`;
    if (!acquireSingleFlight(actionInFlightRef.current, actionKey)) {
      return;
    }

    try {
      const params = new URLSearchParams();
      params.set("chatId", chatId);

      if (userId) params.set("userId", userId);
      else if (guestId) params.set("guestId", guestId);

      const res = await apiFetch(`/api/chat-messages?${params.toString()}`, {
        cache: "no-store"
      });
      const data = await res.json();

      if (Array.isArray(data)) {
        const loadedMessages = data.map((m: any) => ({
          role: m.role,
          content: m.content,
          metadata: m.metadata || undefined
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
    } finally {
      releaseSingleFlight(actionInFlightRef.current, actionKey);
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
      await loadPreferences(currentUserId);
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
      await loadPreferences(currentUserId);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const raw = localStorage.getItem(getWorkspaceStorageKey(workspaceOwnerId));
      if (raw) {
        const parsed = JSON.parse(raw) as PersonalWorkspace;
        setPersonalWorkspace(parsed);
      } else {
        setPersonalWorkspace(createEmptyWorkspace());
      }
    } catch {
      setPersonalWorkspace(createEmptyWorkspace());
    } finally {
      setWorkspaceReady(true);
    }
  }, [workspaceOwnerId]);

  useEffect(() => {
    if (!workspaceReady || typeof window === "undefined") return;

    try {
      localStorage.setItem(
        getWorkspaceStorageKey(workspaceOwnerId),
        JSON.stringify({
          ...personalWorkspace,
          updatedAt: new Date().toISOString()
        })
      );
    } catch {}
  }, [personalWorkspace, workspaceOwnerId, workspaceReady]);

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
        fullVoiceRef.current
          ? `Voice chat listening in ${getLanguageLabel(voiceLanguage)}`
          : handsFreeRef.current
          ? `Hands-free listening in ${getLanguageLabel(voiceLanguage)}`
          : `Listening in ${getLanguageLabel(voiceLanguage)}`
      );
    };

    recognition.onend = () => {
      setIsListening(false);

      if (manualMicModeRef.current) {
        manualMicModeRef.current = false;
        if (!handsFreeRef.current) {
          setVoiceStatus(getIdleVoiceStatus());
        }
        return;
      }

      if (handsFreeRef.current) {
        scheduleHandsFreeRestart(700);
      } else {
        setVoiceStatus(getIdleVoiceStatus());
      }
    };

    recognition.onerror = () => {
      setIsListening(false);

      if (manualMicModeRef.current) {
        manualMicModeRef.current = false;
        if (!handsFreeRef.current) {
          setVoiceStatus(getIdleVoiceStatus());
        }
        return;
      }

      if (handsFreeRef.current) {
        setVoiceStatus(fullVoiceRef.current ? "Reconnecting voice..." : "Hands-free reconnecting...");
        scheduleHandsFreeRestart(1200);
      } else {
        setVoiceStatus(getIdleVoiceStatus());
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
      setVoiceStatus(getIdleVoiceStatus());
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

  useEffect(() => {
    function handleWindowError(event: ErrorEvent) {
      void reportClientError({
        source: "window.error",
        message: event.message || "Unknown client error",
        stack: event.error instanceof Error ? event.error.stack : ""
      });
    }

    function handleUnhandledRejection(event: PromiseRejectionEvent) {
      const reason = event.reason;
      void reportClientError({
        source: "window.unhandledrejection",
        message:
          reason instanceof Error
            ? reason.message
            : typeof reason === "string"
              ? reason
              : "Unhandled rejection",
        stack: reason instanceof Error ? reason.stack : ""
      });
    }

    window.addEventListener("error", handleWindowError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    return () => {
      window.removeEventListener("error", handleWindowError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, [userId, guestId]);

  useEffect(() => {
    if (!activeChatId) return;

    const hasProcessingFile = messages.some((message) => {
      const parsed = parseFileMessage(message.content);
      return parsed?.extractionStatus === "PROCESSING";
    });

    if (!hasProcessingFile) return;

    const timer = window.setInterval(() => {
      void loadChat(activeChatId);
    }, 3000);

    return () => window.clearInterval(timer);
  }, [messages, activeChatId]);

  const filteredHistory = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return history;
    return history.filter((h) => (h.title || "").toLowerCase().includes(q));
  }, [history, search]);

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

      return {
        role: m.role,
        content: compactFileMessageForApi(parsed)
      };
    });
  }

  function sanitizeMessagesForSend(sourceMessages: Msg[]) {
    return sourceMessages.filter(
      (message) =>
        typeof message?.role === "string" &&
        typeof message?.content === "string" &&
        message.role.trim().length > 0 &&
        message.content.trim().length > 0
    );
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
    if (activeRequestIdRef.current) {
      canceledRequestIdsRef.current.add(activeRequestIdRef.current);
      activeRequestIdRef.current = 0;
    }
    setLoading(false);
    loadingRef.current = false;
  }

  async function submitCurrentInput() {
    if (!acquireSingleFlight(actionInFlightRef.current, "submit-chat")) {
      return;
    }

    try {
      if (loadingRef.current) return;
      if (!input.trim() && selectedFiles.length === 0) return;
      await sendMessage();
    } finally {
      releaseSingleFlight(actionInFlightRef.current, "submit-chat");
    }
  }

  function startMicOnce() {
    if (!recognitionRef.current) {
      alert("Speech input is not supported in this browser.");
      return;
    }

    if (isSpeakingRef.current) {
      stopSpeaking();
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

  function toggleFullVoiceMode() {
    const next = !fullVoiceMode;
    setFullVoiceMode(next);
    setVoiceAssistantOn(next ? true : voiceAssistantOn);
    setHandsFreeWakeMode(next ? true : handsFreeWakeMode);
    setVoiceStatus(next ? "Voice chat ready" : getIdleVoiceStatus());
    if (next && !loadingRef.current && !isSpeakingRef.current) {
      scheduleHandsFreeRestart(200);
    }
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
      await apiFetch("/api/logout", { method: "POST" });
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

      setSelectedFiles([capturedFile]);
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

        const maxPages = Math.min(pdf.numPages, PDF_OCR_MAX_PAGES);
        const images: string[] = [];

        for (let i = 1; i <= maxPages; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: PDF_OCR_RENDER_SCALE });
          const widthRatio =
            viewport.width > PDF_OCR_MAX_WIDTH
              ? PDF_OCR_MAX_WIDTH / viewport.width
              : 1;
          const finalViewport =
            widthRatio < 1
              ? page.getViewport({ scale: PDF_OCR_RENDER_SCALE * widthRatio })
              : viewport;

          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");

          if (!context) continue;

          canvas.width = Math.max(1, Math.round(finalViewport.width));
          canvas.height = Math.max(1, Math.round(finalViewport.height));

          await page.render({
            canvasContext: context,
            viewport: finalViewport
          }).promise;

          images.push(canvas.toDataURL("image/jpeg", PDF_OCR_JPEG_QUALITY));
        }

        return images;
      } catch (error) {
        console.error("PDF image generation failed:", error);
        return [];
      }
    }

    return [];
  }

  async function extractPdfTextLocally(file: File): Promise<string> {
    try {
      const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = (pdfjsLib as any).getDocument({
        data: arrayBuffer,
        disableWorker: true,
        useWorkerFetch: false,
        isEvalSupported: false
      });
      const pdf = await loadingTask.promise;
      const maxPages = Math.min(pdf.numPages, 5);
      const segments: string[] = [];

      for (let i = 1; i <= maxPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = (Array.isArray(textContent.items) ? textContent.items : [])
          .map((item: any) => (typeof item?.str === "string" ? item.str : ""))
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();

        if (pageText) {
          segments.push(pageText);
        }
      }

      return segments.join("\n\n").trim();
    } catch (error) {
      console.error("Local PDF text extraction failed:", error);
      return "";
    }
  }

  async function buildLocalFileMessage(
    file: File,
    ocrImages: string[]
  ): Promise<string> {
    try {
      const fileType = file.type || "application/octet-stream";
      const fileName = file.name.toLowerCase();
      let fileUrl = "";
      let extractedText = "";
      let extractionStatus = "NO_TEXT_EXTRACTED";

      if (fileType.startsWith("image/")) {
        fileUrl = ocrImages[0] || (await fileToDataUrl(file));
        extractionStatus = "IMAGE_READY";
      } else if (
        fileType === "application/pdf" ||
        fileName.endsWith(".pdf")
      ) {
        extractedText = await extractPdfTextLocally(file);
        if (extractedText) {
          extractionStatus = "TEXT_EXTRACTED";
        } else if (ocrImages[0]) {
          fileUrl = ocrImages[0];
          extractionStatus = "OCR_IMAGE_READY";
        } else {
          extractionStatus = "NO_TEXT_EXTRACTED";
        }
      } else if (
        fileType.startsWith("text/") ||
        fileName.endsWith(".txt") ||
        fileName.endsWith(".md") ||
        fileName.endsWith(".csv") ||
        fileName.endsWith(".json")
      ) {
        extractedText = (await file.text()).trim();
        extractionStatus = extractedText ? "TEXT_EXTRACTED" : "NO_TEXT_EXTRACTED";
      }

      return buildFileMessageContent({
        fileName: file.name,
        fileUrl,
        mimeType: extractionStatus === "OCR_IMAGE_READY" ? "image/jpeg" : fileType,
        extractedText: extractedText.slice(0, 20000),
        extractionStatus
      });
    } catch (error) {
      console.error("Local file fallback failed:", error);
      return buildFileMessageContent({
        fileName: file.name,
        fileUrl: "",
        mimeType: file.type || "application/octet-stream",
        extractedText: "",
        extractionStatus: "NO_TEXT_EXTRACTED"
      });
    }
  }

  async function uploadSelectedFiles(): Promise<{
    uploadedMessages: Msg[];
    returnedChatId: string | null;
  }> {
    if (selectedFiles.length === 0) {
      return { uploadedMessages: [], returnedChatId: activeChatIdRef.current };
    }

    let currentChatId = activeChatIdRef.current;
    const uploadedMessages: Msg[] = [];

    for (const selectedFile of selectedFiles) {
      const formData = new FormData();
      formData.append("file", selectedFile);

      if (userId) formData.append("userId", userId);
      if (guestId) formData.append("guestId", guestId);
      if (currentChatId) formData.append("chatId", currentChatId);

      const fileType = selectedFile.type || "";
      const fileName = selectedFile.name.toLowerCase();
      const shouldRunOcr =
        fileType.startsWith("image/") ||
        fileType === "application/pdf" ||
        fileName.endsWith(".pdf");
      let ocrImages: string[] = [];

      if (shouldRunOcr) {
        ocrImages = await buildOcrImageDataUrls(selectedFile);
        ocrImages.forEach((img, index) => {
          if (img && typeof img === "string") {
            formData.append(`ocrImageDataUrl_${index}`, img);
          }
        });
      }

      try {
        const res = await apiFetch("/api/upload", {
          method: "POST",
          body: formData
        });

        let data: any = null;
        try {
          data = await res.json();
        } catch {}

        if (!res.ok) {
          throw new Error(data?.error || "File upload failed.");
        }

        uploadedMessages.push({
          role: "user",
          content: data.messageContent
        });

        currentChatId = data.chatId || currentChatId;
      } catch (error) {
        console.error("Server file upload failed, using local fallback:", error);

        const localMessageContent = await buildLocalFileMessage(
          selectedFile,
          ocrImages
        );

        uploadedMessages.push({
          role: "user",
          content: localMessageContent
        });

        showToast(
          "File added locally because server upload failed. You can still ask questions about it.",
          "success"
        );
      }
    }

    setSelectedFiles([]);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    return {
      uploadedMessages,
      returnedChatId: currentChatId
    };
  }

  async function sendMessage(customMessages?: Msg[]) {
    if (loadingRef.current) return;
    if (!customMessages && !input.trim() && selectedFiles.length === 0) return;

    let pendingRetryMessages: Msg[] | null = null;
    let requestId = 0;

    setLoading(true);
    loadingRef.current = true;
    stopListening();
    setMobileActionsOpen(false);

    try {
      let workingMessages = sanitizeMessagesForSend(
        customMessages ? [...customMessages] : [...messagesRef.current]
      );
      let currentChatId = activeChatIdRef.current;

      if (!customMessages && selectedFiles.length > 0) {
        setRetryMessages(null);
        const uploadResult = await uploadSelectedFiles();

        if (uploadResult.uploadedMessages.length > 0) {
          workingMessages = sanitizeMessagesForSend([
            ...workingMessages,
            ...uploadResult.uploadedMessages
          ]);
          setMessages(workingMessages);
          messagesRef.current = workingMessages;
        }

        if (uploadResult.returnedChatId && !currentChatId) {
          currentChatId = uploadResult.returnedChatId;
          setActiveChatId(uploadResult.returnedChatId);
          activeChatIdRef.current = uploadResult.returnedChatId;
        }

        if (!input.trim()) {
          setRetryMessages(null);
          setVoiceStatus("File uploaded");
          await loadHistory();
          return;
        }
      }

      const trimmedInput = customMessages
        ? customMessages[customMessages.length - 1]?.content?.trim() || ""
        : input.trim();

      const nextMessages = sanitizeMessagesForSend(
        customMessages
          ? workingMessages
          : [...workingMessages, { role: "user", content: trimmedInput }]
      );

      if (nextMessages.length === 0) {
        setRetryMessages(null);
        return;
      }

      pendingRetryMessages = nextMessages;

      if (typeof navigator !== "undefined" && !navigator.onLine) {
        setRetryMessages(pendingRetryMessages);
        showToast(
          "You appear to be offline. Your latest messages were cached locally."
        );
        return;
      }

      const resolvedRoute = resolveModel(trimmedInput);
      setActiveAgentLabel(
        resolvedRoute === "image"
          ? "Image Agent"
          : codeModeEnabled
            ? "Coding Agent"
            : "General Agent"
      );

      if (!customMessages) {
        setInput("");
        setMessages(nextMessages);
        messagesRef.current = nextMessages;
      }

      if (isMobile) setSidebarOpen(false);

      requestId = activeRequestIdRef.current + 1;
      activeRequestIdRef.current = requestId;

      const controller =
        resolvedRoute === "image" ? null : new AbortController();
      abortControllerRef.current = controller;

      if (resolvedRoute === "image") {
        const imageRes = await apiFetch("/api/image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: convertMessagesForApi(nextMessages),
            mode: "image",
            guestId,
            userId,
            chatId: currentChatId
          })
        });

        if (canceledRequestIdsRef.current.has(requestId)) {
          return;
        }

        if (!imageRes.ok) {
          let errorMessage = "Image request failed.";
          try {
            const errorData = await imageRes.json();
            errorMessage = errorData?.error || errorMessage;
          } catch {}

          if (canceledRequestIdsRef.current.has(requestId)) {
            return;
          }

          const updated = [
            ...nextMessages,
            { role: "assistant", content: errorMessage, metadata: { sources: [] } }
          ];
          setMessages(updated);
          messagesRef.current = updated;
          await loadHistory();
          return;
        }

        const imageData = await imageRes.json();

        if (canceledRequestIdsRef.current.has(requestId)) {
          return;
        }

        const imageReply = imageData.url || imageData.error || "...";
        const newChatId = imageData.chatId || currentChatId || activeChatIdRef.current || null;

        const updated = [
          ...nextMessages,
          {
            role: "assistant",
            content: imageReply,
            metadata: { agentProfile: "image", sources: [] }
          }
        ];
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

      const res = await apiFetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller?.signal,
        body: JSON.stringify({
          messages: convertMessagesForApi(nextMessages),
          rawMessages: nextMessages,
          mode: "general",
          model: resolvedRoute,
          guestId,
          userId,
          chatId: currentChatId,
          memory: rememberedMemory,
          webSearchEnabled,
          codeModeEnabled,
          prefersDirectAnswers,
          fullVoiceMode
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
        appendAssistantErrorMessage(errorMessage);
        setRetryMessages(pendingRetryMessages);
        showToast(getFriendlyClientError(errorMessage));
        await loadHistory();
        return;
      }

      const assistantReply = data?.reply || "No response.";
      const returnedChatId =
        data?.chatId || res.headers.get("X-Chat-Id") || currentChatId || null;
      if (typeof data?.rememberedMemory === "string") {
        setRememberedMemory(data.rememberedMemory);
      }
      setActiveAgentLabel(getAgentLabel(data?.agentProfile));

      if (returnedChatId) {
        setActiveChatId(returnedChatId);
        activeChatIdRef.current = returnedChatId;
      }

      const updated = [
        ...nextMessages,
        {
          role: "assistant",
          content: assistantReply,
          metadata: {
            agentProfile: data?.agentProfile,
            sources: Array.isArray(data?.sources) ? data.sources : []
          }
        }
      ];
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
      appendAssistantErrorMessage(friendlyMessage);
      setRetryMessages(pendingRetryMessages);
      showToast(friendlyMessage);
      scheduleHandsFreeRestart(700);
    } finally {
      abortControllerRef.current = null;
      if (activeRequestIdRef.current === requestId) {
        activeRequestIdRef.current = 0;
      }
      canceledRequestIdsRef.current.delete(requestId);
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
    const actionKey = `delete-chat:${id}`;
    if (!acquireSingleFlight(actionInFlightRef.current, actionKey)) {
      return;
    }

    const params = new URLSearchParams();
    params.set("id", id);

    if (userId) params.set("userId", userId);
    else if (guestId) params.set("guestId", guestId);

    try {
      await apiFetch(`/api/delete?${params.toString()}`, { method: "DELETE" });

      if (activeChatIdRef.current === id) {
        setActiveChatId(null);
        activeChatIdRef.current = null;
        setMessages([]);
        messagesRef.current = [];
      }

      removeCachedMessages(getCacheKey(id));

      await loadHistory();
    } finally {
      releaseSingleFlight(actionInFlightRef.current, actionKey);
    }
  }

  async function clearAllChats() {
    if (!acquireSingleFlight(actionInFlightRef.current, "clear-all-chats")) {
      return;
    }

    const confirmed = window.confirm(
      "Are you sure you want to delete all chats? This cannot be undone."
    );
    if (!confirmed) {
      releaseSingleFlight(actionInFlightRef.current, "clear-all-chats");
      return;
    }

    try {
      const previousChatId = activeChatIdRef.current;
      const res = await apiFetch("/api/clear-all", {
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
    } finally {
      releaseSingleFlight(actionInFlightRef.current, "clear-all-chats");
    }
  }

  async function renameChat(id: string, currentTitle: string) {
    const actionKey = `rename-chat:${id}`;
    if (!acquireSingleFlight(actionInFlightRef.current, actionKey)) {
      return;
    }

    const newTitle = window.prompt("Rename chat", currentTitle || "New Chat");
    if (!newTitle?.trim()) {
      releaseSingleFlight(actionInFlightRef.current, actionKey);
      return;
    }

    try {
      await apiFetch("/api/rename", {
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
    } finally {
      releaseSingleFlight(actionInFlightRef.current, actionKey);
    }
  }

  function newChat() {
    removeCachedMessages(getCacheKey(activeChatIdRef.current));
    setMessages([]);
    messagesRef.current = [];
    setActiveChatId(null);
    activeChatIdRef.current = null;
    setSelectedFiles([]);
    stopSpeaking();
    setMobileActionsOpen(false);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    if (isMobile) setSidebarOpen(false);
    setVoiceStatus("Wake phrase: Hey Nexa");
    scheduleHandsFreeRestart(500);
  }

  async function shareCurrentChat() {
    if (!acquireSingleFlight(actionInFlightRef.current, "share-chat")) {
      return;
    }

    if (!activeChatIdRef.current) {
      showToast("Open a chat with messages before sharing.");
      releaseSingleFlight(actionInFlightRef.current, "share-chat");
      return;
    }

    try {
      const res = await apiFetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId: activeChatIdRef.current,
          userId,
          guestId
        })
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Failed to share chat.");
      }

      const shareUrl = `${window.location.origin}${data.shareUrl}`;
      await navigator.clipboard.writeText(shareUrl);
      showToast("Share link copied to clipboard.", "success");
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Failed to share chat."
      );
    } finally {
      releaseSingleFlight(actionInFlightRef.current, "share-chat");
    }
  }

  function applyQuickPrompt(template: string) {
    setInput(template);
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

  function updateWorkspace(
    updater: (current: PersonalWorkspace) => PersonalWorkspace
  ) {
    setPersonalWorkspace((current) => updater(current));
  }

  function trackWorkspaceUpdate(
    updater: (analytics: PersonalWorkspace["analytics"]) => PersonalWorkspace["analytics"]
  ) {
    updateWorkspace((current) => ({
      ...current,
      analytics: updater(current.analytics),
      updatedAt: new Date().toISOString()
    }));
  }

  async function selectGoal(goalId: GoalId) {
    const usage = getDailyGoalUsage(personalWorkspace);
    if (
      personalWorkspace.preferences.pricingPlan === "free" &&
      usage.goalsCreated >= 3
    ) {
      showToast("Free plan reached today's goal limit. Upgrade to Pro for unlimited execution.");
      void recordAnalyticsEvent("goal_limit_reached", {
        goalId,
        pricingPlan: personalWorkspace.preferences.pricingPlan
      });
      return;
    }

    const starterAnswers: Record<string, string> = {
      career: "User wants to get hired faster",
      build: "User wants to turn an idea into something real",
      make_money: "User wants the fastest income path",
      improve_self: "User wants habits that actually stick"
    } as Record<GoalId, string>;
    const workspace = createWorkspace(goalId, {
      context: starterAnswers[goalId]
    });
    const instantNextAction =
      goalId === "career"
        ? "Apply to Microsoft Strategy & Operations Internship"
        : workspace.nextAction;
    const instantWorkspace = {
      ...workspace,
      nextAction: instantNextAction
    };
    const memorySnippet = [
      `Current goal: ${instantWorkspace.goalLabel}`,
      `Pending actions: ${instantWorkspace.tasks.filter((task) => !task.completed).length}`,
      `Next action: ${instantWorkspace.nextAction}`
    ]
      .join("\n")
      .slice(0, 2000);

    setSelectedGoalId(goalId);
    setGoalAnswers({});
    setGoalAnswerDraft("");
    setGoalQuestionIndex(0);
    setRememberedMemory(memorySnippet);
    await savePreferences({ memory: memorySnippet });
    void recordAnalyticsEvent("goal_selected", {
      goalId,
      pricingPlan: personalWorkspace.preferences.pricingPlan
    });
    updateWorkspace((current) => {
      const nextUsage = getDailyGoalUsage(current);
      return {
        ...current,
        activeGoalId: goalId,
        workspaces: [
          instantWorkspace,
          ...current.workspaces.filter((item) => item.goalId !== goalId)
        ].slice(0, 8),
        usage: {
          ...nextUsage,
          goalsCreated: nextUsage.goalsCreated + 1
        },
        analytics: {
          ...current.analytics,
          goalClicks: {
            ...current.analytics.goalClicks,
            [goalId]: (current.analytics.goalClicks[goalId] || 0) + 1
          },
          lastDropOffPoint: "goal_selected"
        },
        updatedAt: new Date().toISOString()
      };
    });
    await recordAnalyticsEvent("goal_dashboard_generated", {
      goalId,
      instant: true
    });
    showToast("Here’s your work done: resume, companies, and email template are ready.", "success");
    setSelectedGoalId(null);
  }

  async function completeGoalIntake() {
    if (!selectedGoalId) return;

    const workspace = createWorkspace(selectedGoalId, goalAnswers);
    const memorySnippet = [
      `Current goal: ${workspace.goalLabel}`,
      ...Object.entries(goalAnswers).map(([key, value]) => `${key.replace(/_/g, " ")}: ${value}`)
    ]
      .join("\n")
      .slice(0, 2000);

    setRememberedMemory(memorySnippet);
    await savePreferences({ memory: memorySnippet });

    updateWorkspace((current) => {
      const usage = getDailyGoalUsage(current);
      return {
        ...current,
        activeGoalId: selectedGoalId,
        workspaces: [
          workspace,
          ...current.workspaces.filter((item) => item.goalId !== selectedGoalId)
        ].slice(0, 8),
        usage: {
          ...usage,
          goalsCreated: usage.goalsCreated + 1
        },
        analytics: {
          ...current.analytics,
          lastDropOffPoint: "plan_generated"
        },
        updatedAt: new Date().toISOString()
      };
    });

    await recordAnalyticsEvent("goal_dashboard_generated", {
      goalId: selectedGoalId
    });

    setGoalAnswerDraft("");
    setGoalQuestionIndex(0);
  }

  async function submitGoalAnswer() {
    if (!selectedGoalId || !currentGoalQuestion) return;

    const value = goalAnswerDraft.trim();
    if (!value) return;

    const nextAnswers = {
      ...goalAnswers,
      [currentGoalQuestion.id]: value
    };

    setGoalAnswers(nextAnswers);
    setGoalAnswerDraft("");

    if (goalQuestionIndex >= goalQuestions.length - 1) {
      const workspace = createWorkspace(selectedGoalId, nextAnswers);
      const memorySnippet = [
        `Current goal: ${workspace.goalLabel}`,
        ...Object.entries(nextAnswers).map(([key, answer]) => `${key.replace(/_/g, " ")}: ${answer}`)
      ]
        .join("\n")
        .slice(0, 2000);

      setRememberedMemory(memorySnippet);
      await savePreferences({ memory: memorySnippet });

      updateWorkspace((current) => {
        const usage = getDailyGoalUsage(current);
        return {
          ...current,
          activeGoalId: selectedGoalId,
          workspaces: [
            workspace,
            ...current.workspaces.filter((item) => item.goalId !== selectedGoalId)
          ].slice(0, 8),
          usage: {
            ...usage,
            goalsCreated: usage.goalsCreated + 1
          },
          analytics: {
            ...current.analytics,
            lastDropOffPoint: "plan_generated"
          },
          updatedAt: new Date().toISOString()
        };
      });
      await recordAnalyticsEvent("goal_dashboard_generated", {
        goalId: selectedGoalId,
        answerCount: Object.keys(nextAnswers).length
      });
      setGoalQuestionIndex(0);
      return;
    }

    setGoalQuestionIndex((index) => index + 1);
    trackWorkspaceUpdate((analytics) => ({
      ...analytics,
      lastDropOffPoint: `question_${goalQuestionIndex + 1}`
    }));
  }

  function setPricingPlan(plan: "free" | "pro") {
    void recordAnalyticsEvent("pricing_plan_selected", { plan });
    updateWorkspace((current) => ({
      ...current,
      preferences: {
        ...current.preferences,
        pricingPlan: plan
      },
      updatedAt: new Date().toISOString()
    }));
  }

  function toggleTaskCompletion(taskId: string) {
    if (!activeGoalWorkspace) return;

    let completed = false;
    updateWorkspace((current) => ({
      ...current,
      momentum: {
        streakDays: current.momentum.streakDays + 1,
        completedActions: current.momentum.completedActions + 1,
        lastCompletedAt: new Date().toISOString()
      },
      workspaces: current.workspaces.map((workspace) =>
        workspace.goalId === activeGoalWorkspace.goalId
          ? {
              ...workspace,
              tasks: workspace.tasks.map((task) => {
                if (task.id !== taskId) return task;
                completed = !task.completed;
                return { ...task, completed: !task.completed };
              })
            }
          : workspace
      ),
      updatedAt: new Date().toISOString()
    }));

    if (completed) {
      celebrate("Confetti: +10% progress");
      showToast("+10% progress. You're ahead of 70% of users.", "success");
      void recordAnalyticsEvent("task_completed", { taskId });
    }
  }

  function toggleMilestone(milestoneId: string) {
    if (!activeGoalWorkspace) return;

    updateWorkspace((current) => ({
      ...current,
      workspaces: current.workspaces.map((workspace) =>
        workspace.goalId === activeGoalWorkspace.goalId
          ? {
              ...workspace,
              milestones: workspace.milestones.map((milestone) =>
                milestone.id === milestoneId
                  ? { ...milestone, done: !milestone.done }
                  : milestone
              )
            }
          : workspace
      ),
      updatedAt: new Date().toISOString()
    }));
  }

  function updateOutputContent(cardId: string, content: string) {
    if (!activeGoalWorkspace) return;

    updateWorkspace((current) => ({
      ...current,
      workspaces: current.workspaces.map((workspace) =>
        workspace.goalId === activeGoalWorkspace.goalId
          ? {
              ...workspace,
              outputs: workspace.outputs.map((card) =>
                card.id === cardId ? { ...card, content } : card
              )
            }
          : workspace
      ),
      updatedAt: new Date().toISOString()
    }));
  }

  function downloadTextFile(filename: string, content: string) {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function handleOutputAction(card: OutputCard) {
    const action = card.cta.toLowerCase();
    const links = extractLinks(card.content);

    trackWorkspaceUpdate((analytics) => ({
      ...analytics,
      executeClicks: analytics.executeClicks + (action.includes("execute") ? 1 : 0),
      templateClicks: analytics.templateClicks + (action.includes("edit") ? 1 : 0),
      lastDropOffPoint: `output_${card.id}`
    }));

    if (action.includes("copy")) {
      await navigator.clipboard.writeText(card.content);
      await recordAnalyticsEvent("output_action", {
        cardId: card.id,
        action: "copy"
      });
      showToast(`${card.title} copied to clipboard.`, "success");
      return;
    }

    if (action.includes("open") && links.length > 0) {
      for (const link of links.slice(0, 3)) {
        window.open(link.url, "_blank", "noopener,noreferrer");
      }
      await recordAnalyticsEvent("output_action", {
        cardId: card.id,
        action: "open_links"
      });
      showToast(`${card.title} opened.`, "success");
      return;
    }

    if (action.includes("download")) {
      downloadTextFile(`${card.title.toLowerCase().replace(/\s+/g, "-")}.txt`, card.content);
      await recordAnalyticsEvent("output_action", {
        cardId: card.id,
        action: "download"
      });
      showToast(`${card.title} downloaded.`, "success");
      return;
    }

    if (action.includes("edit")) {
      setInput(`Refine this ${card.title.toLowerCase()}:\n${card.content}`);
      await recordAnalyticsEvent("output_action", {
        cardId: card.id,
        action: "edit"
      });
      showToast(`${card.title} loaded into the command bar.`, "success");
      return;
    }

    setInput(`Execute this for my ${activeGoalWorkspace?.goalLabel || "goal"}:\n${card.content}`);
    await recordAnalyticsEvent("output_action", {
      cardId: card.id,
      action: "execute"
    });
    showToast("Execution request prepared in the command bar.", "success");
  }

  async function shareGoalPlan() {
    if (!activeGoalWorkspace) return;

    const payload = {
      goalLabel: activeGoalWorkspace.goalLabel,
      recommendation: activeGoalWorkspace.recommendation,
      reasoning: activeGoalWorkspace.reasoning,
      nextAction: activeGoalWorkspace.nextAction,
      progress: activeGoalProgress,
      stepPlan: activeGoalWorkspace.stepPlan,
      roadmap: activeGoalWorkspace.roadmap,
      tasks: activeGoalWorkspace.tasks,
      milestones: activeGoalWorkspace.milestones
    };
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
    const shareUrl = `${window.location.origin}/share/plan?payload=${encodeURIComponent(encoded)}`;

    await navigator.clipboard.writeText(shareUrl);
    trackWorkspaceUpdate((analytics) => ({
      ...analytics,
      shareClicks: analytics.shareClicks + 1,
      lastDropOffPoint: "shared_plan"
    }));
    await recordAnalyticsEvent("goal_plan_shared", {
      goalId: activeGoalWorkspace.goalId
    });
    showToast("Share link copied to clipboard.", "success");
  }

  function markIntegrationClick() {
    void recordAnalyticsEvent("integration_click");
    trackWorkspaceUpdate((analytics) => ({
      ...analytics,
      integrationClicks: analytics.integrationClicks + 1,
      lastDropOffPoint: "integration_clicked"
    }));
    showToast("Integration mapped to the next execution step.", "success");
  }

  function markVoiceMode() {
    void recordAnalyticsEvent("voice_mode_toggle");
    trackWorkspaceUpdate((analytics) => ({
      ...analytics,
      voiceClicks: analytics.voiceClicks + 1,
      lastDropOffPoint: "voice_mode"
    }));
    toggleFullVoiceMode();
  }

  function openDoItForMe(option?: string) {
    if (option) {
      if (activeGoalWorkspace) {
        const instantOutputs: OutputCard[] = [
          {
            id: "instant-resume",
            title: "Resume",
            kind: "resume",
            cta: "Download",
            content:
              "Resume generated\n\n- Role-specific positioning\n- Strong proof of execution and measurable results\n- Ready to send for your target role"
          },
          {
            id: "instant-email",
            title: "Cold Email",
            kind: "message",
            cta: "Copy",
            content:
              "Hi [Name], I’m targeting roles in this area and noticed your path. I’ve prepared my resume and proof of work and would value 10 minutes of advice on how to stand out."
          },
          {
            id: "instant-plan",
            title: "Execution Plan",
            kind: "plan",
            cta: "Execute this",
            content:
              "Today: finalize resume\nTomorrow: apply to 5 roles\nDay 3: send 10 cold emails\nDay 4: do 2 mock case questions\nDay 5: follow up on applications"
          },
          {
            id: "instant-companies",
            title: "Target Companies",
            kind: "strategy",
            cta: "Download",
            content:
              "Microsoft\nGoogle\nAmazon\nMeta\nAdobe\nAtlassian\nNotion\nStripe\nRazorpay\nCRED\nMeesho\nSwiggy"
          }
        ];

        updateWorkspace((current) => ({
          ...current,
          workspaces: current.workspaces.map((workspace) =>
            workspace.goalId === activeGoalWorkspace.goalId
              ? {
                  ...workspace,
                  outputs: instantOutputs,
                  nextAction:
                    workspace.goalId === "career"
                      ? "Apply to Microsoft Strategy & Operations Internship"
                      : workspace.nextAction
                }
              : workspace
          ),
          updatedAt: new Date().toISOString()
        }));
      }

      setInput(`Do it for me: ${option}\nCurrent goal: ${activeGoalWorkspace?.goalLabel || "My goal"}`);
      setShowDoItModal(false);
      celebrate("Confetti: +10% progress");
      showToast(`${option} prepared instantly. 80% of the setup is done.`, "success");
      void recordAnalyticsEvent("do_it_for_me_selected", { option });
      return;
    }

    setShowDoItModal(true);
  }

  function renderDemoDashboard() {
    return (
      <div
        style={{
          marginTop: 18,
          borderRadius: 24,
          padding: 18,
          background: "rgba(9,18,32,0.82)",
          border: "1px solid rgba(126,164,206,0.12)"
        }}
      >
        <div style={{ fontSize: 12, color: "#84d9ff", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Your first goal starts here
        </div>
        <div style={{ marginTop: 10, fontSize: 24, fontWeight: 700 }}>
          Demo plan: Career
        </div>
        <div style={{ marginTop: 12, color: "#c9d9eb" }}>Progress: 20%</div>
        <div style={{ marginTop: 12, whiteSpace: "pre-wrap", lineHeight: 1.8, color: "#dfe9f7" }}>
          {"✔ Resume drafted\n✔ 10 applications sent\n⬜ Interview prep pending"}
        </div>
        <div style={{ marginTop: 14, color: "#84d9ff", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Next Action
        </div>
        <div style={{ marginTop: 8, fontSize: 18, fontWeight: 700 }}>
          → Apply to Amazon Operations role
        </div>
        <button style={{ ...primaryButtonStyle, marginTop: 16 }} onClick={() => void selectGoal("career")}>
          Start your own plan
        </button>
      </div>
    );
  }

  async function shareProgress() {
    const progressMessage = activeGoalWorkspace
      ? `I completed ${activeGoalProgress}% of my ${activeGoalWorkspace.goalLabel} journey using NEXA`
      : "I started my plan with NEXA";
    await navigator.clipboard.writeText(progressMessage);
    showToast("Progress update copied to clipboard.", "success");
    void recordAnalyticsEvent("share_progress");
  }

  function renderGoalIntake() {
    const goalMeta: Record<GoalId, { icon: string; outcome: string }> = {
      career: { icon: "💼", outcome: "Get hired faster with a structured plan" },
      build: { icon: "🚀", outcome: "Turn ideas into real products" },
      make_money: { icon: "💰", outcome: "Find and execute income opportunities" },
      improve_self: { icon: "🧠", outcome: "Build habits that actually stick" }
    };

    return (
      <div
        style={{
          maxWidth: 1080,
          margin: isMobile ? "24px auto 0 auto" : "40px auto 0 auto",
          padding: isMobile ? "0 16px 32px" : "0 20px 32px"
        }}
      >
        <div
          style={{
            borderRadius: 28,
            border: "1px solid rgba(126,164,206,0.14)",
            padding: isMobile ? 22 : 28,
            background:
              "linear-gradient(135deg, rgba(12,24,42,0.92), rgba(8,17,31,0.96))",
            boxShadow: "0 26px 60px rgba(2,8,16,0.28)"
          }}
        >
          <div
            style={{
              fontSize: isMobile ? 34 : 54,
              fontWeight: 700,
              lineHeight: 1.04,
              letterSpacing: "-0.06em",
              fontFamily: "var(--font-display)",
              maxWidth: 860
            }}
          >
            Stop thinking. Start doing. NEXA turns your goals into actions.
          </div>
          <div
            style={{
              marginTop: 12,
              maxWidth: 720,
              color: "#a8bdd5",
              fontSize: isMobile ? 14 : 17,
              lineHeight: 1.7
            }}
          >
            NEXA builds your plan, tracks your progress, and executes tasks with you.
          </div>

          <div style={{ marginTop: 18, display: "flex", gap: 10, flexWrap: "wrap" }}>
            {[
              "⚡ Get results in < 10 minutes",
              "🎯 Built for students & founders",
              "🚀 Execution, not just answers"
            ].map((badge) => (
              <div
                key={badge}
                style={{
                  ...smallButtonStyle,
                  cursor: "default",
                  padding: "8px 12px",
                  background: "rgba(14,28,47,0.86)"
                }}
              >
                {badge}
              </div>
            ))}
          </div>

          <div
            style={{
              marginTop: 22,
              borderRadius: 24,
              padding: 20,
              background: "rgba(7,15,27,0.78)",
              border: "1px solid rgba(126,164,206,0.14)"
            }}
          >
            <div style={{ fontSize: 12, color: "#84d9ff", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              See how it works
            </div>
            <div style={{ marginTop: 10, fontSize: 22, fontWeight: 700 }}>
              Sample output: Goal: Career
            </div>
            <div style={{ marginTop: 14, whiteSpace: "pre-wrap", lineHeight: 1.8, color: "#dfe9f7" }}>
              {"Week 1:\n✔ Fix resume\n✔ Apply to 15 companies\n✔ Practice 2 interviews"}
            </div>
            <div style={{ marginTop: 14, color: "#84d9ff", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Next Action
            </div>
            <div style={{ marginTop: 8, fontSize: 18, fontWeight: 700 }}>
              → Apply to Microsoft Strategy & Operations Internship
            </div>
          </div>

          <div
            style={{
              marginTop: 24,
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))",
              gap: 14
            }}
          >
            {GOAL_OPTIONS.map((goal) => (
              <button
                key={goal.id}
                onClick={() => selectGoal(goal.id)}
                style={{
                  textAlign: "left",
                  padding: isMobile ? 18 : 20,
                  borderRadius: 22,
                  border:
                    selectedGoalId === goal.id
                      ? `1px solid ${goal.accent}`
                      : "1px solid rgba(126,164,206,0.14)",
                  background:
                    selectedGoalId === goal.id
                      ? "linear-gradient(135deg, rgba(23,45,72,0.96), rgba(13,26,45,0.98))"
                      : "rgba(11,22,38,0.75)",
                  color: "white",
                  cursor: "pointer",
                  transition: "transform 160ms ease, box-shadow 160ms ease",
                  boxShadow:
                    selectedGoalId === goal.id
                      ? "0 18px 36px rgba(6,14,24,0.28)"
                      : "0 10px 24px rgba(2,8,16,0.16)"
                }}
              >
                <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
                  {goalMeta[goal.id].icon} {goal.label}
                </div>
                <div style={{ color: "#f4f7fb", lineHeight: 1.5, fontWeight: 600 }}>
                  {goalMeta[goal.id].outcome}
                </div>
                <div style={{ color: "#9cb0c8", lineHeight: 1.6, marginTop: 8 }}>{goal.blurb}</div>
                <div style={{ marginTop: 14, color: "#84d9ff", fontWeight: 700 }}>
                  Start →
                </div>
              </button>
            ))}
          </div>

          {renderDemoDashboard()}

          {selectedGoalId && currentGoalQuestion && (
            <div
              style={{
                marginTop: 24,
                padding: isMobile ? 18 : 22,
                borderRadius: 24,
                background: "rgba(7,15,27,0.7)",
                border: "1px solid rgba(126,164,206,0.14)"
              }}
            >
              <div style={{ color: "#84d9ff", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Smart Questions {goalQuestionIndex + 1}/{goalQuestions.length}
              </div>
              <div style={{ marginTop: 10, fontSize: 24, fontWeight: 700 }}>
                {currentGoalQuestion.label}
              </div>
              <div style={{ marginTop: 8, color: "#9cb0c8", lineHeight: 1.6 }}>
                Give enough detail that Nexa can recommend one best path, not ten vague options.
              </div>
              <textarea
                value={goalAnswerDraft}
                onChange={(e) => setGoalAnswerDraft(e.target.value)}
                placeholder={currentGoalQuestion.placeholder}
                style={{
                  width: "100%",
                  minHeight: 110,
                  marginTop: 16,
                  padding: 14,
                  borderRadius: 18,
                  border: "1px solid rgba(126,164,206,0.14)",
                  background: "rgba(11,22,38,0.92)",
                  color: "white",
                  resize: "vertical"
                }}
              />
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
                <button style={primaryButtonStyle} onClick={() => void submitGoalAnswer()}>
                  {goalQuestionIndex === goalQuestions.length - 1 ? "Your Plan Is Ready" : "Next question"}
                </button>
                <button
                  style={smallButtonStyle}
                  onClick={() =>
                    trackWorkspaceUpdate((analytics) => ({
                      ...analytics,
                      lastDropOffPoint: "question_skipped"
                    }))
                  }
                >
                  Keep current answer quality high
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  function renderGoalDashboard(workspace: GoalWorkspace) {
    const usage = getDailyGoalUsage(personalWorkspace);
    const visibleOutputs =
      personalWorkspace.preferences.pricingPlan === "pro"
        ? workspace.outputs
        : workspace.outputs.slice(0, 2);

    return (
      <div
        style={{
          maxWidth: 1160,
          margin: isMobile ? "18px auto 0 auto" : "24px auto 0 auto",
          padding: isMobile ? "0 16px 30px" : "0 20px 36px"
        }}
      >
        <div style={{ marginBottom: 14, fontSize: 12, color: "#84d9ff", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          🎯 Your Plan Is Ready
        </div>

        <div style={{ marginBottom: 12, color: "#d7e7f7", fontWeight: 700 }}>
          You have {workspace.tasks.filter((task) => !task.completed).length} pending actions.
        </div>

        <div
          style={{
            marginBottom: 16,
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
            gap: 12
          }}
        >
          {[
            "✔ Resume generated",
            workspace.goalId === "career" ? "✔ 20 companies found" : "✔ Action list generated",
            "✔ Email templates ready"
          ].map((item) => (
            <div
              key={item}
              style={{
                borderRadius: 18,
                padding: "14px 16px",
                background: "rgba(14,28,47,0.82)",
                border: "1px solid rgba(115,240,198,0.18)",
                fontWeight: 700
              }}
            >
              {item}
            </div>
          ))}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "1.25fr 0.75fr",
            gap: 16
          }}
        >
          <div
            style={{
              padding: isMobile ? 20 : 24,
              borderRadius: 28,
              background:
                "linear-gradient(135deg, rgba(16,32,55,0.96), rgba(9,18,31,0.98))",
              border: "1px solid rgba(126,164,206,0.14)"
            }}
          >
            <div style={{ fontSize: 12, color: "#84d9ff", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Current goal
            </div>
            <div style={{ marginTop: 10, fontSize: isMobile ? 28 : 40, fontWeight: 700, lineHeight: 1.05, letterSpacing: "-0.05em" }}>
              {workspace.goalLabel}
            </div>
            <div style={{ marginTop: 14, fontSize: isMobile ? 18 : 22, fontWeight: 700 }}>
              {workspace.recommendation}
            </div>
            <div style={{ marginTop: 8, color: "#a8bdd5", lineHeight: 1.7, maxWidth: 760 }}>
              {workspace.reasoning}
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 18 }}>
              <button style={primaryButtonStyle} onClick={() => setInput(`Execute this goal:\n${workspace.recommendation}`)}>
                Execute this
              </button>
              <button style={smallButtonStyle} onClick={() => openDoItForMe()}>
                Do it for me
              </button>
              <button style={smallButtonStyle} onClick={() => updateWorkspace((current) => ({ ...current, activeGoalId: null, updatedAt: new Date().toISOString() }))}>
                Change goal
              </button>
              <button style={smallButtonStyle} onClick={() => void shareGoalPlan()}>
                Share your plan
              </button>
              <button style={smallButtonStyle} onClick={markVoiceMode}>
                Voice mode
              </button>
            </div>

            <div
              style={{
                marginTop: 18,
                borderRadius: 24,
                padding: isMobile ? 18 : 22,
                background: "linear-gradient(135deg, rgba(70,194,255,0.16), rgba(115,240,198,0.14))",
                border: "1px solid rgba(115,240,198,0.24)"
              }}
            >
              <div style={{ fontSize: 12, color: "#dff9ef", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Do This Now
              </div>
              <div style={{ marginTop: 10, fontSize: isMobile ? 28 : 40, fontWeight: 800, lineHeight: 1.05 }}>
                → {workspace.nextAction}
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
                <button style={primaryButtonStyle} onClick={() => toggleTaskCompletion(workspace.tasks[0]?.id || "")}>
                  Mark as Done
                </button>
                <button style={smallButtonStyle} onClick={() => setInput(`Execute this next action now:\n${workspace.nextAction}`)}>
                  Execute now
                </button>
              </div>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gap: 12
            }}
          >
              <div
                style={{
                  padding: 16,
                  borderRadius: 22,
                  background: "rgba(10,20,35,0.82)",
                  border: "1px solid rgba(126,164,206,0.12)"
                }}
              >
                <div style={{ fontSize: 12, color: "#84d9ff", marginBottom: 8 }}>Progress</div>
                <div style={{ height: 10, borderRadius: 999, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                  <div
                    style={{
                      width: `${activeGoalProgress}%`,
                      height: "100%",
                      background: "linear-gradient(90deg, #46c2ff, #73f0c6)"
                    }}
                  />
                </div>
                <div style={{ marginTop: 10, fontSize: 14, fontWeight: 700 }}>
                  Goal: {workspace.goalLabel} • {activeGoalProgress}%
                </div>
                <div style={{ marginTop: 8, fontSize: 12, color: "#9cb0c8" }}>
                  Streak 🔥 {personalWorkspace.momentum.streakDays} days
                </div>
              </div>
              {[
                { label: "Progress %", value: `${activeGoalProgress}%` },
                { label: "Tasks remaining", value: String(tasksRemaining) },
                { label: "Next action", value: workspace.nextAction },
                {
                  label: "Memory",
                  value: rememberedMemory
                    ? `Based on your goal of ${Object.values(workspace.answers)[0] || workspace.goalLabel}...`
                    : "Memory warming up"
                }
              ].map((item) => (
              <div
                key={item.label}
                style={{
                  padding: 16,
                  borderRadius: 22,
                  background: "rgba(10,20,35,0.82)",
                  border: "1px solid rgba(126,164,206,0.12)"
                }}
              >
                <div style={{ fontSize: 12, color: "#84d9ff", marginBottom: 8 }}>{item.label}</div>
                <div style={{ fontSize: item.label === "Next action" || item.label === "Memory" ? 15 : 28, fontWeight: 700, lineHeight: 1.35 }}>
                  {item.value}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            marginTop: 16,
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(4, minmax(0, 1fr))",
            gap: 14
          }}
        >
          {[
            { title: "📋 Plan Card", body: workspace.stepPlan.join("\n") },
            {
              title: "📅 Weekly Plan",
              body: workspace.roadmap.map((week) => `${week.title}: ${week.focus}`).join("\n")
            },
            {
              title: "🎯 Next Action Queue",
              body: workspace.tasks.map((task) => `${task.completed ? "[x]" : "[ ]"} ${task.title}`).join("\n")
            },
            {
              title: "📊 Progress tracker",
              body: workspace.milestones.map((milestone) => `${milestone.done ? "[x]" : "[ ]"} ${milestone.label} • ${milestone.target}`).join("\n")
            }
          ].map((card) => (
            <div
              key={card.title}
              style={{
                borderRadius: 24,
                padding: 18,
                background: "rgba(9,18,32,0.82)",
                border: "1px solid rgba(126,164,206,0.12)",
                minHeight: 220
              }}
            >
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>
                {card.title}
              </div>
              <div style={{ whiteSpace: "pre-wrap", color: "#c9d9eb", lineHeight: 1.7, fontSize: 14 }}>
                {card.body}
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            marginTop: 18,
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
            gap: 14
          }}
        >
          {[
            { title: "Today's task", value: workspace.tasks.find((task) => !task.completed)?.title || workspace.nextAction },
            { title: "You're 40% done", value: `${Math.max(activeGoalProgress, 40)}% done` },
            { title: "Next step waiting", value: workspace.nextAction }
          ].map((item) => (
            <div
              key={item.title}
              style={{
                borderRadius: 22,
                padding: 16,
                background: "rgba(10,20,35,0.82)",
                border: "1px solid rgba(126,164,206,0.12)"
              }}
            >
              <div style={{ fontSize: 12, color: "#84d9ff", marginBottom: 8 }}>{item.title}</div>
              <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.45 }}>{item.value}</div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>
            Output Cards
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))",
              gap: 14
            }}
          >
            {visibleOutputs.map((card) => (
              <div
                key={card.id}
                style={{
                  borderRadius: 24,
                  padding: 18,
                  background: "linear-gradient(180deg, rgba(14,28,47,0.92), rgba(8,17,31,0.96))",
                  border: "1px solid rgba(126,164,206,0.12)"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>{card.title}</div>
                  <span style={{ ...smallButtonStyle, cursor: "default" }}>{card.kind}</span>
                </div>
                <textarea
                  value={card.content}
                  onChange={(e) => updateOutputContent(card.id, e.target.value)}
                  style={{
                    width: "100%",
                    minHeight: 160,
                    borderRadius: 16,
                    border: "1px solid rgba(126,164,206,0.12)",
                    background: "rgba(255,255,255,0.03)",
                    color: "#d3e0ef",
                    lineHeight: 1.65,
                    padding: 12,
                    resize: "vertical"
                  }}
                />
                {extractLinks(card.content).length > 0 && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                    {extractLinks(card.content).map((link) => (
                      <a
                        key={link.url}
                        href={link.url}
                        target="_blank"
                        rel="noreferrer"
                        style={{ ...smallButtonStyle, textDecoration: "none" }}
                      >
                        {link.label}
                      </a>
                    ))}
                  </div>
                )}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
                  <button style={smallButtonStyle} onClick={() => void handleOutputAction(card)}>
                    {card.cta}
                  </button>
                  <button style={smallButtonStyle} onClick={() => setInput(`Edit this ${card.title}:\n${card.content}`)}>
                    Edit
                  </button>
                  <button
                    style={smallButtonStyle}
                    onClick={() =>
                      downloadTextFile(
                        `${card.title.toLowerCase().replace(/\s+/g, "-")}.txt`,
                        card.content
                      )
                    }
                  >
                    Download
                  </button>
                </div>
              </div>
            ))}
          </div>
          {personalWorkspace.preferences.pricingPlan === "free" && workspace.outputs.length > visibleOutputs.length && (
            <div style={{ marginTop: 12, color: "#f6c65b", fontSize: 13 }}>
              Free plan shows basic outputs only. Upgrade to Pro to unlock all execution cards.
            </div>
          )}
        </div>

        <div
          style={{
            marginTop: 18,
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))",
            gap: 14
          }}
        >
          <div
            style={{
              borderRadius: 24,
              padding: 18,
              background: "rgba(10,20,35,0.82)",
              border: "1px solid rgba(126,164,206,0.12)"
            }}
          >
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Tasks Remaining</div>
            <div style={{ display: "grid", gap: 10 }}>
              {workspace.tasks.map((task) => (
                <div
                  key={task.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 12px",
                    borderRadius: 16,
                    background: "rgba(255,255,255,0.03)"
                  }}
                >
                  <span style={{ flex: 1, color: task.completed ? "#8fb3d6" : "white" }}>
                    {task.title}
                  </span>
                  <span style={{ color: "#84d9ff", fontSize: 12 }}>{task.dueLabel}</span>
                  <button style={smallButtonStyle} onClick={() => toggleTaskCompletion(task.id)}>
                    {task.completed ? "Done" : "Mark as done"}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div
            style={{
              borderRadius: 24,
              padding: 18,
              background: "rgba(10,20,35,0.82)",
              border: "1px solid rgba(126,164,206,0.12)"
            }}
          >
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Timeline & Milestones</div>
            <div style={{ display: "grid", gap: 10 }}>
              {workspace.milestones.map((milestone) => (
                <button
                  key={milestone.id}
                  onClick={() => toggleMilestone(milestone.id)}
                  style={{
                    textAlign: "left",
                    padding: "12px 14px",
                    borderRadius: 16,
                    border: "1px solid rgba(126,164,206,0.12)",
                    background: milestone.done ? "rgba(25,78,61,0.55)" : "rgba(255,255,255,0.03)",
                    color: "white",
                    cursor: "pointer"
                  }}
                >
                  <div style={{ fontWeight: 700 }}>{milestone.label}</div>
                  <div style={{ marginTop: 4, color: "#9cb0c8", fontSize: 13 }}>{milestone.target}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: 18,
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
            gap: 14
          }}
        >
          {[
            { label: "Streaks 🔥", value: `${personalWorkspace.momentum.streakDays} day streak` },
            { label: "Progress %", value: `${activeGoalProgress}% complete` },
            { label: "Leaderboard", value: "You're ahead of 70% users" }
          ].map((item) => (
            <div
              key={item.label}
              style={{
                borderRadius: 22,
                padding: 16,
                background: "rgba(10,20,35,0.82)",
                border: "1px solid rgba(126,164,206,0.12)"
              }}
            >
              <div style={{ fontSize: 12, color: "#84d9ff", marginBottom: 8 }}>{item.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{item.value}</div>
            </div>
          ))}
        </div>

        <div
          style={{
            marginTop: 18,
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
            gap: 14
          }}
        >
          {[
            {
              title: "Free Plan",
              body: "3 plans/day\nBasic outputs",
              action: () => setPricingPlan("free"),
              active: personalWorkspace.preferences.pricingPlan === "free"
            },
            {
              title: "Pro Plan",
              body: "Unlimited execution\nAdvanced templates\nFaster responses",
              action: () => setPricingPlan("pro"),
              active: personalWorkspace.preferences.pricingPlan === "pro"
            },
            {
              title: "Templates Library",
              body: "Resume builder\nStartup idea validator\nJob application kit",
              action: () =>
                trackWorkspaceUpdate((analytics) => ({
                  ...analytics,
                  templateClicks: analytics.templateClicks + 1,
                  lastDropOffPoint: "template_library"
                })),
              active: false
            }
          ].map((card) => (
            <button
              key={card.title}
              onClick={card.action}
              style={{
                textAlign: "left",
                padding: 18,
                borderRadius: 24,
                border: card.active
                  ? "1px solid rgba(115,240,198,0.55)"
                  : "1px solid rgba(126,164,206,0.12)",
                background: "rgba(9,18,32,0.82)",
                color: "white",
                cursor: "pointer"
              }}
            >
              <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 10 }}>{card.title}</div>
              <div style={{ whiteSpace: "pre-wrap", color: "#c9d9eb", lineHeight: 1.65 }}>
                {card.body}
              </div>
              {card.title === "Free Plan" && (
                <div style={{ marginTop: 10, fontSize: 12, color: "#9cb0c8" }}>
                  {`${usage.goalsCreated}/3 goals used today`}
                </div>
              )}
              {card.title === "Pro Plan" && (
                <div style={{ marginTop: 12 }}>
                  <span style={{ ...smallButtonStyle, background: "rgba(115,240,198,0.14)" }}>
                    Unlimited execution
                  </span>
                </div>
              )}
            </button>
          ))}
        </div>

        <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <span style={{ ...smallButtonStyle, cursor: "default" }}>Free → 3 plans/day</span>
          <span style={{ ...smallButtonStyle, cursor: "default" }}>Pro → Unlimited execution</span>
          <button style={primaryButtonStyle} onClick={() => setPricingPlan("pro")}>
            Unlock Pro
          </button>
        </div>

        <div
          style={{
            marginTop: 18,
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
            gap: 14
          }}
        >
          {[
            "Gmail -> send emails",
            "Notion -> save plans",
            "LinkedIn -> apply jobs"
          ].map((item) => (
            <button
              key={item}
              onClick={markIntegrationClick}
              style={{
                textAlign: "left",
                padding: 18,
                borderRadius: 22,
                border: "1px solid rgba(126,164,206,0.12)",
                background: "rgba(10,20,35,0.82)",
                color: "white",
                cursor: "pointer"
              }}
            >
              <div style={{ fontSize: 18, fontWeight: 700 }}>{item}</div>
            </button>
          ))}
        </div>

        <div
          style={{
            marginTop: 18,
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))",
            gap: 14
          }}
        >
          <div
            style={{
              borderRadius: 24,
              padding: 18,
              background: "rgba(10,20,35,0.82)",
              border: "1px solid rgba(126,164,206,0.12)"
            }}
          >
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Growth Features</div>
            <div style={{ color: "#c9d9eb", lineHeight: 1.7 }}>
              {workspace.growthPrompt}
              {"\n"}Viral loop enabled through shareable plan summaries and reusable templates.
            </div>
          </div>
          <div
            style={{
              borderRadius: 24,
              padding: 18,
              background: "rgba(10,20,35,0.82)",
              border: "1px solid rgba(126,164,206,0.12)"
            }}
          >
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Analytics</div>
            <div style={{ color: "#c9d9eb", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
              {`Most used goal clicks: Career ${personalWorkspace.analytics.goalClicks.career}, Build ${personalWorkspace.analytics.goalClicks.build}, Money ${personalWorkspace.analytics.goalClicks.make_money}, Self ${personalWorkspace.analytics.goalClicks.improve_self}
Execute clicks: ${personalWorkspace.analytics.executeClicks}
Share clicks: ${personalWorkspace.analytics.shareClicks}
Last drop-off: ${personalWorkspace.analytics.lastDropOffPoint}`}
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: 18,
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))",
            gap: 14
          }}
        >
          <div
            style={{
              borderRadius: 24,
              padding: 18,
              background: "rgba(10,20,35,0.82)",
              border: "1px solid rgba(126,164,206,0.12)"
            }}
          >
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Weekly Check-in AI</div>
            <div style={{ color: "#c9d9eb", lineHeight: 1.7 }}>
              Did you complete this? Here’s what to do today.
            </div>
            <div style={{ marginTop: 12, fontWeight: 700 }}>
              Today: {workspace.tasks.find((task) => !task.completed)?.title || workspace.nextAction}
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
              <button
                style={smallButtonStyle}
                onClick={() => toggleTaskCompletion(workspace.tasks.find((task) => !task.completed)?.id || "")}
              >
                Yes, completed
              </button>
              <button
                style={smallButtonStyle}
                onClick={() => setInput(`Weekly check-in for ${workspace.goalLabel}: tell me what to do today.`)}
              >
                Tell me today's move
              </button>
            </div>
          </div>
          <div
            style={{
              borderRadius: 24,
              padding: 18,
              background: "rgba(10,20,35,0.82)",
              border: "1px solid rgba(126,164,206,0.12)"
            }}
          >
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>Viral Feature</div>
            <div style={{ color: "#c9d9eb", lineHeight: 1.7 }}>
              Share your progress:
            </div>
            <div style={{ marginTop: 12, fontWeight: 700 }}>
              “I completed {activeGoalProgress}% of my {workspace.goalLabel} journey using NEXA”
            </div>
            <button style={{ ...primaryButtonStyle, marginTop: 14 }} onClick={() => void shareProgress()}>
              Share your progress
            </button>
          </div>
        </div>

        <div
          style={{
            marginTop: 18,
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(4, minmax(0, 1fr))",
            gap: 14
          }}
        >
          {[
            "Got 3 interviews in 2 weeks",
            "Best AI for productivity I've used",
            "Instantly clearer than normal chatbots",
            "Actually pushes me to execute"
          ].map((quote) => (
            <div
              key={quote}
              style={{
                borderRadius: 22,
                padding: 16,
                background: "rgba(10,20,35,0.82)",
                border: "1px solid rgba(126,164,206,0.12)"
              }}
            >
              <div style={{ color: "#e8f1ff", lineHeight: 1.7 }}>{quote}</div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <span style={{ ...smallButtonStyle, cursor: "default" }}>1,000+ plans generated</span>
          <span style={{ ...smallButtonStyle, cursor: "default" }}>500+ users</span>
        </div>
      </div>
    );
  }

  const primaryButtonStyle: CSSProperties = {
    background: "linear-gradient(135deg, rgba(31,74,116,0.92), rgba(18,41,66,0.96))",
    color: "#f8fbff",
    border: "1px solid rgba(120,168,214,0.24)",
    borderRadius: 14,
    padding: "9px 13px",
    cursor: "pointer",
    boxShadow: "0 10px 24px rgba(5,10,18,0.18)"
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
    background: "rgba(18,35,58,0.92)",
    color: "#e8f1ff",
    border: "1px solid rgba(120,168,214,0.18)",
    borderRadius: 999,
    padding: "6px 10px",
    cursor: "pointer",
    fontSize: 12
  };

  const dangerButtonStyle: CSSProperties = {
    background: "linear-gradient(135deg, rgba(92,31,31,0.96), rgba(65,22,22,0.96))",
    color: "white",
    border: "1px solid rgba(250,148,148,0.22)",
    borderRadius: 12,
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
    background: "rgba(17, 34, 57, 0.98)",
    color: "white",
    border: "1px solid rgba(120,168,214,0.18)",
    borderRadius: 14,
    padding: "12px 14px",
    cursor: "pointer"
  };

  const sidebarStyle: CSSProperties = {
    width: isMobile ? "82vw" : 280,
    maxWidth: isMobile ? 320 : 280,
    background:
      "linear-gradient(180deg, rgba(8,17,31,0.98), rgba(8,14,26,0.96))",
    borderRight: "1px solid rgba(126,164,206,0.14)",
    padding: isMobile ? 14 : 16,
    overflowY: "auto",
    flexShrink: 0,
    position: isMobile ? "fixed" : "relative",
    top: 0,
    left: isMobile ? 0 : undefined,
    height: "100vh",
    zIndex: isMobile ? 40 : "auto",
    display: "flex",
    flexDirection: "column",
    boxShadow: isMobile
      ? "18px 0 48px rgba(0,0,0,0.38)"
      : "inset -1px 0 0 rgba(126,164,206,0.08)"
  };

  const bubbleBaseStyle: CSSProperties = {
    borderRadius: isMobile ? 18 : 22,
    boxShadow: "0 18px 40px rgba(2,8,16,0.18)",
    border: "1px solid rgba(126,164,206,0.12)",
    backdropFilter: "blur(12px)"
  };

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        background:
          "radial-gradient(circle at top left, rgba(70,194,255,0.12), transparent 26%), radial-gradient(circle at bottom right, rgba(115,240,198,0.08), transparent 24%), linear-gradient(180deg, #08111f 0%, #050a13 100%)",
        color: "white",
        fontFamily: "var(--font-body)",
        overflow: "hidden"
      }}
    >
      <div
        style={{
          position: "fixed",
          top: -120,
          right: -80,
          width: 300,
          height: 300,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(70,194,255,0.22), transparent 68%)",
          pointerEvents: "none",
          filter: "blur(6px)"
        }}
      />
      <div
        style={{
          position: "fixed",
          bottom: -140,
          left: -120,
          width: 340,
          height: 340,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(115,240,198,0.14), transparent 70%)",
          pointerEvents: "none",
          filter: "blur(8px)"
        }}
      />
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
            data-testid="toast"
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

      {celebrationText && (
        <div
          style={{
            position: "fixed",
            left: "50%",
            top: 20,
            transform: "translateX(-50%)",
            zIndex: 130,
            padding: "12px 18px",
            borderRadius: 999,
            background: "linear-gradient(135deg, rgba(115,240,198,0.96), rgba(70,194,255,0.96))",
            color: "#042033",
            fontWeight: 800,
            boxShadow: "0 18px 42px rgba(0,0,0,0.25)"
          }}
        >
          {celebrationText}
        </div>
      )}

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

      {showDoItModal && (
        <div
          onClick={() => setShowDoItModal(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.58)",
            zIndex: 90,
            display: "grid",
            placeItems: "center",
            padding: 16
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 520,
              borderRadius: 26,
              padding: 22,
              background: "linear-gradient(180deg, rgba(14,28,47,0.98), rgba(8,17,31,0.98))",
              border: "1px solid rgba(126,164,206,0.14)"
            }}
          >
            <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
              What should I do for you?
            </div>
            <div style={{ color: "#a8bdd5", lineHeight: 1.7, marginBottom: 16 }}>
              Pick one action and Nexa will generate it instantly.
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {["Build resume", "Write cold emails", "Find companies", "Create plan"].map((option) => (
                <button
                  key={option}
                  style={{
                    textAlign: "left",
                    padding: "16px 18px",
                    borderRadius: 18,
                    border: "1px solid rgba(126,164,206,0.14)",
                    background: "rgba(12,24,42,0.78)",
                    color: "white",
                    cursor: "pointer"
                  }}
                  onClick={() => openDoItForMe(option)}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {sidebarOpen && (
        <div style={sidebarStyle}>
          <button
            data-testid="new-chat-button"
            style={{
              ...primaryButtonStyle,
              width: "100%",
              marginBottom: 14,
              background:
                "linear-gradient(135deg, rgba(55,132,196,0.22), rgba(18,35,58,0.96))",
              border: "1px solid rgba(126,164,206,0.22)",
              minHeight: 44
            }}
            onClick={newChat}
          >
            + New Chat
          </button>

          <button
            data-testid="clear-chats-button"
            style={dangerButtonStyle}
            onClick={clearAllChats}
          >
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
              padding: 12,
              borderRadius: 14,
              border: "1px solid rgba(126,164,206,0.16)",
              background: "rgba(14,28,47,0.82)",
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
              fontSize: 14,
              padding: "10px 12px",
              borderRadius: 14,
              background: "rgba(12, 24, 42, 0.7)",
              border: "1px solid rgba(126,164,206,0.08)"
            }}
          >
            <SettingsIcon width={18} height={18} />
            <span>Settings</span>
          </a>

          <div
            style={{
              marginBottom: 14,
              padding: "14px 12px",
              borderRadius: 18,
              background: "rgba(12, 24, 42, 0.72)",
              border: "1px solid rgba(126,164,206,0.1)"
            }}
          >
            <div style={{ fontSize: 12, color: "#84d9ff", marginBottom: 8 }}>
              Daily System
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.4, marginBottom: 8 }}>
              {latestWorkspace?.goalLabel || "Your first goal starts here"}
            </div>
            <div style={{ fontSize: 13, color: "#9cb0c8", lineHeight: 1.6 }}>
              {latestWorkspace
                ? `You have ${latestWorkspace.tasks.filter((task) => !task.completed).length} pending actions`
                : "Resume drafted • 10 applications sent • Next action ready."}
            </div>
            {latestWorkspace && (
              <div style={{ marginTop: 10, fontSize: 12, color: "#c9d9eb", lineHeight: 1.6 }}>
                {`Progress ${computeProgress(latestWorkspace)}% • Next step ${latestWorkspace.nextAction} • Streak ${personalWorkspace.momentum.streakDays} days`}
              </div>
            )}
            {latestWorkspace ? (
              <button
                style={{ ...smallButtonStyle, marginTop: 10 }}
                onClick={() => updateWorkspace((current) => ({ ...current, activeGoalId: latestWorkspace.goalId, updatedAt: new Date().toISOString() }))}
              >
                Continue today
              </button>
            ) : (
              <button
                style={{ ...smallButtonStyle, marginTop: 10 }}
                onClick={() => void selectGoal("career")}
              >
                Start your own plan
              </button>
            )}
          </div>

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
                data-testid="history-item"
                style={{
                  padding: 10,
                  marginBottom: 10,
                  borderRadius: 16,
                  background:
                    activeChatId === h.id
                      ? "linear-gradient(135deg, rgba(26,58,92,0.92), rgba(16,31,50,0.96))"
                      : "rgba(9, 18, 32, 0.7)",
                  border: "1px solid rgba(126,164,206,0.12)",
                  boxShadow:
                    activeChatId === h.id
                      ? "0 16px 32px rgba(2,8,16,0.22)"
                      : "none"
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: 10,
                    marginBottom: 8
                  }}
                >
                  <div
                    data-testid="history-open-button"
                    style={{
                      cursor: "pointer",
                      color: "#f5fbff",
                      fontWeight: 600,
                      wordBreak: "break-word",
                      fontSize: 14,
                      lineHeight: 1.4,
                      flex: 1
                    }}
                    onClick={() => loadChat(h.id)}
                  >
                    {h.title || "New Chat"}
                  </div>

                  {activeChatId === h.id && (
                    <span
                      style={{
                        fontSize: 10,
                        color: "#84d9ff",
                        border: "1px solid rgba(132,217,255,0.28)",
                        borderRadius: 999,
                        padding: "3px 7px",
                        whiteSpace: "nowrap",
                        textTransform: "uppercase",
                        letterSpacing: "0.08em"
                      }}
                    >
                      Open
                    </span>
                  )}
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    data-testid="history-rename-button"
                    style={smallButtonStyle}
                    onClick={() => renameChat(h.id, h.title)}
                  >
                    Rename
                  </button>
                  <button
                    data-testid="history-delete-button"
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
            borderBottom: "1px solid rgba(126,164,206,0.14)",
            background: "rgba(7, 16, 29, 0.72)",
            backdropFilter: "blur(18px)",
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
                fontSize: isMobile ? 17 : 22,
                fontWeight: 700,
                whiteSpace: "nowrap",
                flexShrink: 0,
                fontFamily: "var(--font-display)",
                letterSpacing: "-0.04em"
              }}
            >
              {activeGoalWorkspace ? `Nexa AI • ${activeGoalWorkspace.goalLabel}` : "Nexa AI"}
            </div>
            <div style={{ ...smallButtonStyle, cursor: "default", padding: "8px 12px" }}>
              Smart Mode
            </div>
            {activeGoalWorkspace && (
              <div style={{ minWidth: isMobile ? 110 : 220 }}>
                <div style={{ fontSize: 11, color: "#84d9ff", marginBottom: 6 }}>
                  Goal: {activeGoalWorkspace.goalLabel}
                </div>
                <div style={{ height: 8, borderRadius: 999, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                  <div
                    style={{
                      width: `${activeGoalProgress}%`,
                      height: "100%",
                      background: "linear-gradient(90deg, #46c2ff, #73f0c6)"
                    }}
                  />
                </div>
              </div>
            )}
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

                    <button
                      onClick={toggleFullVoiceMode}
                      style={{
                        ...smallButtonStyle,
                        background: fullVoiceMode ? "#16324f" : "#2b3445"
                      }}
                    >
                      {fullVoiceMode ? "Full Voice On" : "Full Voice Off"}
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
          {activeGoalWorkspace ? (
            renderGoalDashboard(activeGoalWorkspace)
          ) : messages.length === 0 ? (
            renderGoalIntake()
          ) : (
            <div style={{ maxWidth: 860, margin: "0 auto", padding: isMobile ? "0 10px" : "0 12px" }}>
              <div
                style={{
                  marginBottom: 12,
                  fontSize: 12,
                  color: "#84d9ff",
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
                    data-testid="chat-message"
                    data-message-role={isUser ? "user" : "assistant"}
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
                        background: isUser
                          ? "linear-gradient(135deg, rgba(43,109,196,0.96), rgba(27,80,154,0.98))"
                          : "linear-gradient(180deg, rgba(14,28,47,0.92), rgba(9,18,32,0.96))",
                        color: "white",
                        padding: isMobile ? "12px 12px" : "15px 17px"
                      }}
                    >
                      <div
                        style={{
                          fontWeight: 700,
                          color: isUser ? "#dff0ff" : "#f8fbff",
                          marginBottom: 8,
                          fontSize: 11,
                          textTransform: "uppercase",
                          letterSpacing: "0.08em"
                        }}
                      >
                        {isUser ? "You" : "AI"}
                      </div>

                      {parsedFile ? (
                        <div>
                          <div
                            data-testid="file-message-card"
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
                                  parsedFile.extractionStatus === "PROCESSING"
                                    ? "#fcd34d"
                                    :
                                  parsedFile.extractionStatus === "TEXT_EXTRACTED" ||
                                  parsedFile.extractionStatus === "OCR_TEXT_EXTRACTED"
                                    ? "#86efac"
                                    : "#fca5a5",
                                marginBottom: 10
                              }}
                            >
                              {parsedFile.extractionStatus === "PROCESSING"
                                ? "Extracting text in background..."
                                : parsedFile.extractionStatus === "TEXT_EXTRACTED"
                                ? "Embedded text extracted successfully"
                                : parsedFile.extractionStatus === "OCR_TEXT_EXTRACTED"
                                  ? "OCR text extracted successfully"
                                  : parsedFile.extractionStatus === "OCR_IMAGE_READY"
                                    ? "Document preview captured locally"
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

                            {parsedFile.fileUrl ? (
                              <a
                                data-testid="open-file-link"
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
                            ) : null}
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
                        <div style={{ color: "#edf4ff", lineHeight: 1.72, fontSize: isMobile ? 14 : 15 }}>
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
                          {Array.isArray(m.metadata?.sources) &&
                            m.metadata!.sources!.length > 0 &&
                            m.metadata!.sources!.map((source) => (
                              <a
                                key={source.url}
                                href={source.url}
                                target="_blank"
                                rel="noreferrer"
                                style={{
                                  ...smallButtonStyle,
                                  textDecoration: "none",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  maxWidth: "100%",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap"
                                }}
                                title={source.title || source.url}
                              >
                                {formatSourceLabel(source)}
                              </a>
                            ))}

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
            borderTop: "1px solid rgba(126,164,206,0.12)",
            background: "rgba(5, 12, 22, 0.78)",
            backdropFilter: "blur(20px)",
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
            {selectedFiles.length > 0 && (
              <div
                style={{
                  marginBottom: 10,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  flexWrap: "wrap",
                  background: "#2a2a2a",
                  border: "1px solid #3a3a3a",
                  borderRadius: 14,
                  padding: "10px 12px",
                  width: "100%",
                  maxWidth: "100%",
                  boxSizing: "border-box"
                }}
              >
                <span style={{ flex: 1, color: "#dbeafe" }}>{selectedFileLabel}</span>
                {selectedFiles.length > 1 &&
                  selectedFiles.slice(0, 3).map((file) => (
                    <span
                      key={file.name + file.size}
                      style={{
                        background: "#1f2937",
                        border: "1px solid #334155",
                        borderRadius: 999,
                        padding: "4px 8px",
                        fontSize: 12
                      }}
                    >
                      {file.name}
                    </span>
                  ))}

                <button
                  onClick={() => {
                    setSelectedFiles([]);
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
              {fullVoiceMode ? " • full voice on" : ""}
              {webSearchEnabled ? " • web on" : " • web off"}
              {codeModeEnabled ? " • code mode on" : ""}
              {` • ${activeAgentLabel.toLowerCase()}`}
            </div>

            <div
              style={{
                marginBottom: 10,
                display: "flex",
                gap: 8,
                flexWrap: "wrap"
              }}
            >
              <button
                type="button"
                style={{
                  ...smallButtonStyle,
                  background: webSearchEnabled ? "#16324f" : "#2b3445"
                }}
                onClick={() => {
                  const next = !webSearchEnabled;
                  setWebSearchEnabled(next);
                  void savePreferences({ webSearchEnabled: next });
                }}
              >
                Live / Web search {webSearchEnabled ? "ON" : "OFF"}
              </button>
              <button
                type="button"
                style={{
                  ...smallButtonStyle,
                  background: codeModeEnabled ? "#1f4f3f" : "#2b3445"
                }}
                onClick={() => {
                  const next = !codeModeEnabled;
                  setCodeModeEnabled(next);
                  void savePreferences({ codeModeEnabled: next });
                }}
              >
                Code Mode {codeModeEnabled ? "ON" : "OFF"}
              </button>
              <button
                type="button"
                data-testid="share-chat-button"
                style={smallButtonStyle}
                onClick={() => {
                  if (activeGoalWorkspace) {
                    void shareGoalPlan();
                    return;
                  }
                  void shareCurrentChat();
                }}
              >
                {activeGoalWorkspace ? "Share Plan" : "Share Chat"}
              </button>
            </div>

            <div
              style={{
                marginBottom: 10,
                display: "flex",
                gap: 8,
                flexWrap: "wrap"
              }}
            >
              <button
                type="button"
                style={smallButtonStyle}
                onClick={() => applyQuickPrompt("Generate the next best action for my current goal.")}
              >
                Next best action
              </button>
              <button
                type="button"
                style={smallButtonStyle}
                onClick={() => openDoItForMe()}
              >
                Do it for me
              </button>
              <button
                type="button"
                style={smallButtonStyle}
                onClick={() => applyQuickPrompt("Give one best recommendation with reasoning.")}
              >
                Smart decision
              </button>
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
                  background: "linear-gradient(180deg, rgba(11,22,38,0.94), rgba(7,15,26,0.98))",
                  border: "1px solid rgba(126,164,206,0.14)",
                  borderRadius: 22,
                  padding: 10,
                  boxShadow: "0 24px 48px rgba(2,8,16,0.26)"
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
                        background: "linear-gradient(180deg, rgba(11,22,38,0.98), rgba(8,17,31,0.98))",
                        border: "1px solid rgba(126,164,206,0.14)",
                        borderRadius: 18,
                        padding: 10,
                        boxShadow: "0 22px 44px rgba(0,0,0,0.34)",
                        zIndex: 50,
                        display: "flex",
                        flexDirection: "column",
                        gap: 8
                      }}
                    >
                      <input
                        ref={fileInputRef}
                        data-testid="composer-file-input"
                        type="file"
                        multiple
                        onChange={(e) => {
                          const files = Array.from(e.target.files || []);
                          setSelectedFiles(files);
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
                          background: isListening || isSpeakingRef.current ? "#7c3aed" : "#2b3445",
                          border:
                            isListening || isSpeakingRef.current
                              ? "1px solid #8b5cf6"
                              : "1px solid #3b465a"
                        }}
                        onClick={startMicOnce}
                      >
                        <MicIcon width={18} height={18} />
                        <span>{isSpeakingRef.current ? "Interrupt + Speak" : "Speak"}</span>
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
                        style={{
                          ...mobileActionCardStyle,
                          background: fullVoiceMode ? "#16324f" : "#2b3445",
                          border: fullVoiceMode ? "1px solid #46c2ff" : "1px solid #3b465a"
                        }}
                        onClick={toggleFullVoiceMode}
                      >
                        <WaveformIcon width={18} height={18} />
                        <span>{fullVoiceMode ? "Voice chat on" : "Voice chat off"}</span>
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
                      data-testid="composer-input"
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
                        background: "rgba(8,18,31,0.94)",
                        color: "white",
                        border: "1px solid rgba(126,164,206,0.14)",
                        borderRadius: 16,
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
                          : selectedFiles.length > 0
                            ? "Ask about the files/photos..."
                            : activeGoalWorkspace
                              ? "Command bar: refine plan, generate assets, or execute tasks"
                              : "Set a goal or ask Nexa to build one"
                      }
                    />

                    {loading ? (
                      <button
                        type="button"
                        data-testid="stop-button"
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
                        data-testid="send-button"
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
                  background: "linear-gradient(180deg, rgba(11,22,38,0.94), rgba(7,15,26,0.98))",
                  border: "1px solid rgba(126,164,206,0.14)",
                  borderRadius: 22,
                  padding: 10,
                  boxShadow: "0 24px 48px rgba(2,8,16,0.26)"
                }}
              >
                <div ref={mobileActionsRef} style={{ position: "relative" }}>
                  {mobileActionsOpen && (
                    <div
                      style={{
                        position: "absolute",
                        bottom: 60,
                        left: 0,
                        width: 240,
                        background: "linear-gradient(180deg, rgba(11,22,38,0.98), rgba(8,17,31,0.98))",
                        border: "1px solid rgba(126,164,206,0.14)",
                        borderRadius: 18,
                        padding: 10,
                        boxShadow: "0 22px 44px rgba(0,0,0,0.34)",
                        zIndex: 50,
                        display: "flex",
                        flexDirection: "column",
                        gap: 8
                      }}
                    >
                      <input
                        ref={fileInputRef}
                        data-testid="composer-file-input"
                        type="file"
                        multiple
                        onChange={(e) => {
                          const files = Array.from(e.target.files || []);
                          setSelectedFiles(files);
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
                          background: isListening || isSpeakingRef.current ? "#7c3aed" : "#2b3445",
                          border:
                            isListening || isSpeakingRef.current
                              ? "1px solid #8b5cf6"
                              : "1px solid #3b465a"
                        }}
                        onClick={startMicOnce}
                      >
                        <MicIcon width={18} height={18} />
                        <span>{isSpeakingRef.current ? "Interrupt + Speak" : "Speak"}</span>
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
                        style={{
                          ...mobileActionCardStyle,
                          background: fullVoiceMode ? "#16324f" : "#2b3445",
                          border: fullVoiceMode ? "1px solid #46c2ff" : "1px solid #3b465a"
                        }}
                        onClick={toggleFullVoiceMode}
                      >
                        <WaveformIcon width={18} height={18} />
                        <span>{fullVoiceMode ? "Voice chat on" : "Voice chat off"}</span>
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
                      gap: 12,
                      alignItems: "center"
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
                      data-testid="composer-input"
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
                        background: "rgba(11,22,38,0.9)",
                        color: "white",
                        border: "1px solid rgba(126,164,206,0.16)",
                        borderRadius: 18,
                        outline: "none",
                        resize: "none",
                        minHeight: 52,
                        width: "100%",
                        boxSizing: "border-box"
                      }}
                      placeholder={
                        isListening
                          ? `Listening in ${getLanguageLabel(voiceLanguage)}...`
                          : selectedFiles.length > 0
                            ? "Ask about the files/photos, or press Send to upload only"
                            : activeGoalWorkspace
                              ? "Command bar: refine plan, generate assets, or execute tasks"
                              : "Set a goal or ask Nexa to build one"
                      }
                    />

                    {loading ? (
                      <button
                        type="button"
                        data-testid="stop-button"
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
                        data-testid="send-button"
                        style={iconButtonStyle}
                        onClick={() => void submitCurrentInput()}
                        title="Send"
                      >
                        <SendIcon width={18} height={18} />
                      </button>
                    )}
                  </div>
                </div>
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
