"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { getGuestId } from "@/lib/guest";
import { supabaseBrowser } from "@/lib/supabase-browser";

type Msg = {
  role: string;
  content: string;
};

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

export default function Home() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [history, setHistory] = useState<ChatItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState("general");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [cameraLoading, setCameraLoading] = useState(false);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);

  const guestId = typeof window !== "undefined" ? getGuestId() : null;

  async function migrateGuestChats(
    currentGuestId: string,
    currentUserId: string
  ) {
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

    if (actualUserId) {
      params.set("userId", actualUserId);
    } else if (guestId) {
      params.set("guestId", guestId);
    } else {
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
    const params = new URLSearchParams();
    params.set("chatId", chatId);

    if (userId) params.set("userId", userId);
    else if (guestId) params.set("guestId", guestId);

    const res = await fetch(`/api/chat-messages?${params.toString()}`, {
      cache: "no-store"
    });
    const data = await res.json();

    if (Array.isArray(data)) {
      setMessages(
        data.map((m: any) => ({
          role: m.role,
          content: m.content
        }))
      );
      setActiveChatId(chatId);

      if (isMobile) {
        setSidebarOpen(false);
      }
    }
  }

  useEffect(() => {
    async function init() {
      const {
        data: { user }
      } = await supabaseBrowser.auth.getUser();

      const currentUserId = user?.id || null;

      if (currentUserId && guestId) {
        await migrateGuestChats(guestId, currentUserId);
      }

      setUserId(currentUserId);
      await loadHistory(currentUserId);
    }

    init();

    const {
      data: { subscription }
    } = supabaseBrowser.auth.onAuthStateChange(async (_event, session) => {
      const currentUserId = session?.user?.id || null;

      if (currentUserId && guestId) {
        await migrateGuestChats(guestId, currentUserId);
      }

      setUserId(currentUserId);

      if (!currentUserId) {
        setActiveChatId(null);
        setMessages([]);
      }

      await loadHistory(currentUserId);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    function handleResize() {
      const mobile = window.innerWidth < 900;
      setIsMobile(mobile);

      if (mobile) {
        setSidebarOpen(false);
      } else {
        setSidebarOpen(true);
      }
    }

    handleResize();
    window.addEventListener("resize", handleResize);

    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    return () => {
      stopCamera();
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

  function convertMessagesForApi(sourceMessages: Msg[]) {
    return sourceMessages.map((m) => {
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
            'If the user asks to summarize or explain the file, use this text.',
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
          "No text could be extracted from this file.",
          "If asked about this file, explain that the file may be scanned or image-based.",
          `File URL: ${parsed.fileUrl}`
        ].join("\n")
      };
    });
  }

  async function streamAssistantReply(nextMessages: Msg[], response: Response) {
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) {
      throw new Error("No response body found.");
    }

    let accumulated = "";
    setMessages([...nextMessages, { role: "assistant", content: "" }]);

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      accumulated += decoder.decode(value, { stream: true });
      setMessages([...nextMessages, { role: "assistant", content: accumulated }]);
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

  function stopCamera() {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    }
  }

  async function openCamera() {
    try {
      setCameraError("");
      setCameraLoading(true);
      setCameraOpen(true);

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

  async function uploadSelectedFile(): Promise<{
    uploadedMessage: Msg | null;
    returnedChatId: string | null;
  }> {
    if (!selectedFile) {
      return { uploadedMessage: null, returnedChatId: activeChatId };
    }

    const formData = new FormData();
    formData.append("file", selectedFile);

    if (userId) formData.append("userId", userId);
    if (guestId) formData.append("guestId", guestId);
    if (activeChatId) formData.append("chatId", activeChatId);

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
      returnedChatId: data.chatId || activeChatId
    };
  }

  async function sendMessage(customMessages?: Msg[]) {
    if (loading) return;
    if (!customMessages && !input.trim() && !selectedFile) return;

    setLoading(true);

    try {
      let workingMessages = customMessages ? [...customMessages] : [...messages];
      let currentChatId = activeChatId;

      if (!customMessages && selectedFile) {
        const uploadResult = await uploadSelectedFile();

        if (uploadResult.uploadedMessage) {
          workingMessages = [...workingMessages, uploadResult.uploadedMessage];
          setMessages(workingMessages);
        }

        if (uploadResult.returnedChatId && !currentChatId) {
          currentChatId = uploadResult.returnedChatId;
          setActiveChatId(uploadResult.returnedChatId);
        }

        if (!input.trim()) {
          await loadHistory();
          return;
        }
      }

      const trimmedInput = input.trim();

      const nextMessages = customMessages
        ? workingMessages
        : [...workingMessages, { role: "user", content: trimmedInput }];

      if (!customMessages) {
        setInput("");
        setMessages(nextMessages);
      }

      if (isMobile) setSidebarOpen(false);

      if (mode === "image") {
        const imageRes = await fetch("/api/image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: convertMessagesForApi(nextMessages),
            mode,
            guestId,
            userId,
            chatId: currentChatId
          })
        });

        const imageData = await imageRes.json();
        const imageReply = imageData.url || imageData.error || "...";

        setMessages([...nextMessages, { role: "assistant", content: imageReply }]);

        if (imageData.chatId && !activeChatId) {
          setActiveChatId(imageData.chatId);
        }

        await loadHistory();
        return;
      }

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: convertMessagesForApi(nextMessages),
          mode,
          guestId,
          userId,
          chatId: currentChatId
        })
      });

      if (!res.ok) {
        let errorMessage = "Request failed.";

        try {
          const errorData = await res.json();
          errorMessage = errorData?.error || errorMessage;
        } catch {}

        setMessages([...nextMessages, { role: "assistant", content: errorMessage }]);
        await loadHistory();
        return;
      }

      const returnedChatId = res.headers.get("X-Chat-Id");
      if (returnedChatId && !activeChatId) {
        setActiveChatId(returnedChatId);
      }

      await streamAssistantReply(nextMessages, res);
      await loadHistory();
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: error instanceof Error ? error.message : "Request failed."
        }
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function regenerateLastReply() {
    const trimmed = [...messages];
    if (!trimmed.length) return;
    if (trimmed[trimmed.length - 1]?.role === "assistant") trimmed.pop();
    await sendMessage(trimmed);
  }

  async function deleteChat(id: string) {
    const params = new URLSearchParams();
    params.set("id", id);

    if (userId) params.set("userId", userId);
    else if (guestId) params.set("guestId", guestId);

    await fetch(`/api/delete?${params.toString()}`, { method: "DELETE" });

    if (activeChatId === id) {
      setActiveChatId(null);
      setMessages([]);
    }

    await loadHistory();
  }

  async function clearAllChats() {
    const confirmed = window.confirm(
      "Are you sure you want to delete all chats? This cannot be undone."
    );
    if (!confirmed) return;

    try {
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
      setMessages([]);
      setHistory([]);
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
    setMessages([]);
    setActiveChatId(null);
    setSelectedFile(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    if (isMobile) setSidebarOpen(false);
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

  const primaryButtonStyle: React.CSSProperties = {
    background: "#2b3445",
    color: "white",
    border: "1px solid #3b465a",
    borderRadius: 10,
    padding: "8px 12px",
    cursor: "pointer"
  };

  const iconButtonStyle: React.CSSProperties = {
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

  const smallButtonStyle: React.CSSProperties = {
    background: "#2b3445",
    color: "white",
    border: "1px solid #3b465a",
    borderRadius: 8,
    padding: "4px 8px",
    cursor: "pointer",
    fontSize: 12
  };

  const dangerButtonStyle: React.CSSProperties = {
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

  const sidebarStyle: React.CSSProperties = {
    width: isMobile ? "86vw" : 280,
    maxWidth: isMobile ? 320 : 280,
    background: "#171717",
    borderRight: "1px solid #2f2f2f",
    padding: 12,
    overflowY: "auto",
    flexShrink: 0,
    position: isMobile ? "fixed" : "relative",
    top: 0,
    left: 0,
    height: "100vh",
    zIndex: isMobile ? 40 : "auto",
    display: "flex",
    flexDirection: "column",
    boxShadow: isMobile ? "0 10px 30px rgba(0,0,0,0.45)" : "none"
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
              padding: 10,
              borderRadius: 10,
              border: "1px solid #3a3a3a",
              background: "#2a2a2a",
              color: "white",
              outline: "none"
            }}
          />

          <a
            href="/settings"
            style={{
              display: "block",
              marginBottom: 14,
              color: "#cbd5e1",
              textDecoration: "none",
              fontSize: 14
            }}
          >
            Settings
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
                  borderRadius: 10,
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
                    fontSize: 14
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
            background: "#212121",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
            flexWrap: "nowrap"
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              minWidth: 0,
              flex: 1
            }}
          >
            <button
              style={{
                ...primaryButtonStyle,
                width: 42,
                minWidth: 42,
                height: 42,
                padding: 0,
                fontSize: 20,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0
              }}
              onClick={() => setSidebarOpen(!sidebarOpen)}
              title="Toggle sidebar"
            >
              ☰
            </button>

            <div
              style={{
                fontSize: isMobile ? 18 : 20,
                fontWeight: 700,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis"
              }}
            >
              Nexa AI
            </div>
          </div>

          <select
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            style={{
              background: "#2a2a2a",
              color: "white",
              border: "1px solid #3a3a3a",
              borderRadius: 8,
              padding: "8px 10px",
              flexShrink: 0
            }}
          >
            <option value="general">Chat</option>
            <option value="image">Image</option>
          </select>
        </div>

        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: isMobile ? "14px 0" : "24px 0"
          }}
        >
          {messages.length === 0 ? (
            <div
              style={{
                maxWidth: 800,
                margin: isMobile ? "40px auto 0 auto" : "80px auto 0 auto",
                textAlign: "center",
                color: "#cbd5e1",
                padding: "0 20px"
              }}
            >
              <div
                style={{
                  fontSize: isMobile ? 26 : 34,
                  fontWeight: 700,
                  marginBottom: 12
                }}
              >
                How can I help you today?
              </div>
              <div style={{ color: "#9ca3af", fontSize: isMobile ? 15 : 16 }}>
                Ask anything, upload files, take photos, generate images, or continue an earlier chat.
              </div>
            </div>
          ) : (
            <div style={{ maxWidth: 860, margin: "0 auto", padding: "0 10px" }}>
              {messages.map((m, i) => {
                const parsedFile = parseFileMessage(m.content);
                const isImage =
                  !parsedFile &&
                  typeof m.content === "string" &&
                  (m.content.startsWith("http") || m.content.startsWith("data:image"));

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
                      marginBottom: 14
                    }}
                  >
                    <div
                      style={{
                        maxWidth: isMobile ? "96%" : isUser ? "75%" : "85%",
                        background: isUser ? "#2f6fed" : "#2a2a2a",
                        color: "white",
                        borderRadius: 18,
                        padding: isMobile ? "12px" : "14px 16px",
                        boxShadow: "0 1px 2px rgba(0,0,0,0.25)"
                      }}
                    >
                      <div
                        style={{
                          fontWeight: 700,
                          color: isUser ? "#dbeafe" : "#f8fafc",
                          marginBottom: 8,
                          fontSize: 13
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
                        <div style={{ color: "#f3f4f6", lineHeight: 1.65 }}>
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
                <div style={{ color: "#9ca3af", marginTop: 8, paddingLeft: 6 }}>
                  Thinking...
                </div>
              )}

              <div ref={bottomRef} />
            </div>
          )}
        </div>

        <div
          style={{
            borderTop: "1px solid #2f2f2f",
            background: "#212121",
            padding: isMobile ? "10px" : "16px 20px 20px 20px"
          }}
        >
          <div
            style={{
              maxWidth: 860,
              margin: "0 auto"
            }}
          >
            {selectedFile && (
              <div
                style={{
                  marginBottom: 10,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  background: "#2a2a2a",
                  border: "1px solid #3a3a3a",
                  borderRadius: 999,
                  padding: "8px 12px",
                  maxWidth: "100%"
                }}
              >
                <span
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: 260
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
                display: "flex",
                gap: 8,
                flexDirection: "row",
                alignItems: "flex-end"
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
                📎
              </button>

              <button
                type="button"
                style={iconButtonStyle}
                onClick={openCamera}
                title="Camera"
              >
                📷
              </button>

              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();

                    if (loading) return;
                    if (!input.trim() && !selectedFile) return;

                    void sendMessage();
                  }
                }}
                rows={isMobile ? 2 : 1}
                style={{
                  flex: 1,
                  padding: 12,
                  background: "#2a2a2a",
                  color: "white",
                  border: "1px solid #3a3a3a",
                  borderRadius: 16,
                  outline: "none",
                  resize: "none",
                  minHeight: 44,
                  maxHeight: isMobile ? 96 : 120,
                  width: "100%",
                  boxSizing: "border-box"
                }}
                placeholder={
                  mode === "image"
                    ? "Describe the image you want"
                    : selectedFile
                    ? "Ask something about the file/photo, or press Send to upload only"
                    : "Message Nexa AI"
                }
              />

              <button
                type="button"
                style={{
                  ...iconButtonStyle,
                  opacity: loading ? 0.7 : 1
                }}
                disabled={loading}
                onClick={() => {
                  if (loading) return;
                  if (!input.trim() && !selectedFile) return;
                  void sendMessage();
                }}
                title="Send"
              >
                {loading ? "⏳" : "➤"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}