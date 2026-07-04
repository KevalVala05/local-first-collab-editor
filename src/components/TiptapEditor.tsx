"use client";

import React, {
  useEffect,
  useCallback,
  useRef,
  useState,
  useMemo,
  forwardRef,
  useImperativeHandle,
} from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import CharacterCount from "@tiptap/extension-character-count";
import Collaboration from "@tiptap/extension-collaboration";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import api from "@/lib/api";
import { toastError } from "@/lib/toast";
import { DocumentRole } from "@/types/document";
import { saveDocumentLocally, localDb } from "@/lib/localDb";

// ── Types & Interfaces ──────────────────────────────────────────────────────

interface TiptapEditorProps {
  documentId: string;
  initialContent: string;
  userRole: DocumentRole;
  title: string;
  userName: string;
  userEmail: string;
}

type SaveStatus = "idle" | "saving" | "saved" | "error";
type ConnectionStatus = "connecting" | "connected" | "disconnected";

// ── Constants ───────────────────────────────────────────────────────────────

const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:1234";

const AUTOSAVE_DEBOUNCE_MS = 2000;

// ── Presence colour palette ─────────────────────────────────────────────────

const PRESENCE_COLORS = [
  "#818cf8", // indigo
  "#34d399", // emerald
  "#f472b6", // pink
  "#fb923c", // orange
  "#a78bfa", // violet
  "#38bdf8", // sky
  "#facc15", // yellow
];

function getPresenceColor(clientId: number): string {
  return PRESENCE_COLORS[clientId % PRESENCE_COLORS.length];
}

export interface TiptapEditorRef
{
  setContent: (content: string) => void;
}

// ── Component ───────────────────────────────────────────────────────────────

const TiptapEditor = forwardRef<TiptapEditorRef, TiptapEditorProps>(
  (
    {
      documentId,
      initialContent,
      userRole,
      userName,
      userEmail,
    },
    ref
  ) =>
  {
    const isReadOnly = userRole === DocumentRole.VIEWER;

  // ── Yjs setup ─────────────────────────────────────────────────────────────
  const ydoc = useMemo(() => new Y.Doc(), []);

  const provider = useMemo(
    () =>
      new WebsocketProvider(WS_URL, documentId, ydoc, {
        connect: true,
      }),
    [documentId, ydoc]
  );

  // ── State ──────────────────────────────────────────────────────────────────
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("connecting");
  const [wordCount, setWordCount] = useState(0);
  const [activeUsers, setActiveUsers] = useState<
    Array<{ name: string; color: string; clientId: number }>
  >([]);
  const [contentSeeded, setContentSeeded] = useState(false);

  // ── AI Copilot State ──────────────────────────────────────────────────────
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [aiAction, setAiAction] = useState<"summarize" | "tone">("summarize");
  const [targetTone, setTargetTone] = useState("Professional");
  const [isGenerating, setIsGenerating] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveContent = useCallback(
    async (content: string) => {
      setSaveStatus("saving");
      try {
        // 1. Always save to local IndexedDB (which also handles queuing in the outbox)
        await saveDocumentLocally(documentId, content);

        // 2. If online, try to patch immediately on the server
        if (typeof window !== "undefined" && navigator.onLine) {
          await api.patch(`/documents/${documentId}`, { content });
          
          // Mark as synced locally
          const localDoc = await localDb.documents.get(documentId);
          if (localDoc) {
            localDoc.syncStatus = "synced";
            await localDb.documents.put(localDoc);
          }

          // Remove the update_content action from the outbox since it was successfully sent
          const outboxItem = await localDb.outbox
            .where("documentId")
            .equals(documentId)
            .and((item) => item.action === "update_content")
            .first();
          if (outboxItem?.id !== undefined) {
            await localDb.outbox.delete(outboxItem.id);
          }
        }
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 2000);
      }
      catch (err) {
        // If it's a network error, silently treat it as saved (it is saved locally in IndexedDB and queued in the outbox)
        const isNetworkError = err && typeof err === "object" && !("response" in err);
        if (isNetworkError) {
          setSaveStatus("saved");
          setTimeout(() => setSaveStatus("idle"), 2000);
        } else {
          setSaveStatus("error");
          const message = err instanceof Error ? err.message : "Failed to save";
          toastError(message);
        }
      }
    },
    [documentId]
  );

  // ── Debounced onUpdate handler to avoid stale closures ─────────────────────
  type EditorLike = { getHTML: () => string; state: { selection: { from: number; to: number }; doc: { textBetween: (a: number, b: number, sep?: string) => string } }; commands: { deleteRange: (r: { from: number; to: number }) => void }; storage: { characterCount?: { words: () => number } } };
  const onUpdateRef = useRef<((ed: EditorLike) => void) | null>(null);
  onUpdateRef.current = (ed: EditorLike) => {
    if (isReadOnly) return;
    const html = ed.getHTML();
    setWordCount(ed.storage.characterCount?.words() ?? 0);

    const { from } = ed.state.selection;
    const textBefore = ed.state.doc.textBetween(Math.max(0, from - 3), from);
    if (textBefore === "/ai") {
      ed.commands.deleteRange({ from: from - 3, to: from });
    const selected = ed.state.doc.textBetween(ed.state.selection.from, ed.state.selection.to, " ");
      setIsAiOpen(true);
      void selected;
    }

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(
      () => saveContent(html),
      AUTOSAVE_DEBOUNCE_MS
    );
  };

  // ── Tiptap editor ──────────────────────────────────────────────────────────
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        history: false,
      } as Parameters<typeof StarterKit.configure>[0]),
      Placeholder.configure({
        placeholder: isReadOnly
          ? "This document is view-only."
          : "Start writing your document…",
      }),
      CharacterCount,
      Collaboration.configure({
        document: ydoc,
      }),
    ],
    editable: !isReadOnly,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "prose prose-invert prose-sm sm:prose-base max-w-none min-h-[500px] focus:outline-none px-2 py-2 text-zinc-100 leading-relaxed",
      },
    },
    onUpdate: ({ editor }) => {
      onUpdateRef.current?.(editor);
    },
  });

  useImperativeHandle(
    ref,
    () =>
    {
      return {
        setContent: (html: string) =>
        {
          if (editor)
          {
            editor.commands.setContent(html);
          }
        },
      };
    },
    [editor]
  );

  // ── AI Helper Callbacks ────────────────────────────────────────────────────
  const getSelectedText = useCallback(() => {
    if (!editor) return "";
    const { from, to } = editor.state.selection;
    return editor.state.doc.textBetween(from, to, " ");
  }, [editor]);

  const runAiGeneration = useCallback(async () => {
    if (!editor || isGenerating) return;

    setIsGenerating(true);
    abortControllerRef.current = new AbortController();

    try {
      const selectedText = getSelectedText();
      const editorText = editor.getText();
      const context = editorText.slice(0, 5000);
      const textToUse = selectedText || editorText || "Start of document";

      const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: aiAction,
          text: textToUse,
          context: context,
          targetLanguage: "Spanish",
          targetTone,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || "Failed to generate AI response");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) return;

      let insertPosition = editor.state.selection.to;
      let deletedSelection = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        if (chunk) {
          if (selectedText && !deletedSelection) {
            editor.commands.deleteSelection();
            insertPosition = editor.state.selection.from;
            deletedSelection = true;
          }
          editor.commands.insertContentAt(insertPosition, chunk);
          insertPosition += chunk.length;
          editor.commands.focus();
        }
      }
      setIsAiOpen(false);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        console.log("AI generation aborted by user.");
      } else {
        const message = err instanceof Error ? err.message : "AI generation failed";
        toastError(message);
      }
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  }, [editor, aiAction, targetTone, getSelectedText, isGenerating]);

  const cancelAiGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  const triggerAiMenuFromButton = useCallback(() => {
    setIsAiOpen((prev) => !prev);
  }, []);

  // ── Seed initial content after Yjs syncs ──────────────────────────────────
  useEffect(() => {
    if (!editor || contentSeeded) return;

    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const handleSync = (synced: boolean) => {
      if (!synced || contentSeeded) return;
      if (timeoutId) clearTimeout(timeoutId);

      // If the Yjs doc is empty, load content from MongoDB
      const fragment = ydoc.getXmlFragment("default");
      if (fragment.length === 0 && initialContent) {
        editor.commands.setContent(initialContent);
      }
      setContentSeeded(true);
      setWordCount(editor.storage.characterCount?.words() ?? 0);
    };

    const seedOffline = () => {
      if (contentSeeded) return;
      const fragment = ydoc.getXmlFragment("default");
      if (fragment.length === 0 && initialContent) {
        editor.commands.setContent(initialContent);
      }
      setContentSeeded(true);
      if (editor) {
        setWordCount(editor.storage.characterCount?.words() ?? 0);
      }
    };

    // y-websocket v3 uses 'sync' event (also emits 'synced' for backwards compat)
    provider.on("sync", handleSync);
    
    // If already synced when this effect runs
    if (provider.synced) {
      handleSync(true);
    } else {
      // If offline, seed immediately. If online, set a 1.5s timeout to seed as fallback.
      const isOnline = typeof window !== "undefined" && navigator.onLine;
      const delay = isOnline ? 1500 : 0;
      timeoutId = setTimeout(seedOffline, delay);
    }

    return () => {
      provider.off("sync", handleSync);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [editor, provider, ydoc, initialContent, contentSeeded]);

  // ── Connection status tracking ─────────────────────────────────────────────
  useEffect(() => {
    const handleStatus = ({ status }: { status: string }) => {
      if (status === "connected") setConnectionStatus("connected");
      else if (status === "disconnected") setConnectionStatus("disconnected");
      else setConnectionStatus("connecting");
    };

    provider.on("status", handleStatus);
    return () => provider.off("status", handleStatus);
  }, [provider]);

  // ── Awareness / presence tracking ─────────────────────────────────────────
  useEffect(() => {
    // Set our own presence data
    provider.awareness.setLocalStateField("user", {
      name: userName,
      email: userEmail,
      color: getPresenceColor(ydoc.clientID),
    });

    const updatePresence = () => {
      const states = provider.awareness.getStates();
      const users: Array<{ name: string; color: string; clientId: number }> =
        [];

      states.forEach((state, clientId) => {
        if (state.user && clientId !== ydoc.clientID) {
          users.push({
            name: state.user.name || "Anonymous",
            color: state.user.color || "#818cf8",
            clientId,
          });
        }
      });

      setActiveUsers(users);
    };

    provider.awareness.on("change", updatePresence);
    updatePresence();

    return () => provider.awareness.off("change", updatePresence);
  }, [provider, ydoc, userName, userEmail]);

  // ── Manual save: Ctrl/Cmd + S ──────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (editor && !isReadOnly) {
          if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
          saveContent(editor.getHTML());
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editor, isReadOnly, saveContent]);

  // ── Cleanup ────────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      provider.awareness.setLocalState(null);
      provider.disconnect();
      ydoc.destroy();
    };
  }, [provider, ydoc]);

  // ── Toolbar config ─────────────────────────────────────────────────────────
  const toolbar = [
    {
      label: "B",
      title: "Bold",
      action: () => editor?.chain().focus().toggleBold().run(),
      active: () => editor?.isActive("bold") ?? false,
      className: "font-bold",
    },
    {
      label: "I",
      title: "Italic",
      action: () => editor?.chain().focus().toggleItalic().run(),
      active: () => editor?.isActive("italic") ?? false,
      className: "italic",
    },
    {
      label: "S̶",
      title: "Strikethrough",
      action: () => editor?.chain().focus().toggleStrike().run(),
      active: () => editor?.isActive("strike") ?? false,
      className: "",
    },
    { label: "|", title: "divider", action: () => { }, active: () => false, className: "cursor-default opacity-30 pointer-events-none" },
    {
      label: "H1",
      title: "Heading 1",
      action: () => editor?.chain().focus().toggleHeading({ level: 1 }).run(),
      active: () => editor?.isActive("heading", { level: 1 }) ?? false,
      className: "font-extrabold",
    },
    {
      label: "H2",
      title: "Heading 2",
      action: () => editor?.chain().focus().toggleHeading({ level: 2 }).run(),
      active: () => editor?.isActive("heading", { level: 2 }) ?? false,
      className: "font-bold",
    },
    {
      label: "H3",
      title: "Heading 3",
      action: () => editor?.chain().focus().toggleHeading({ level: 3 }).run(),
      active: () => editor?.isActive("heading", { level: 3 }) ?? false,
      className: "font-semibold",
    },
    { label: "|", title: "divider2", action: () => { }, active: () => false, className: "cursor-default opacity-30 pointer-events-none" },
    {
      label: "•",
      title: "Bullet List",
      action: () => editor?.chain().focus().toggleBulletList().run(),
      active: () => editor?.isActive("bulletList") ?? false,
      className: "",
    },
    {
      label: "1.",
      title: "Ordered List",
      action: () => editor?.chain().focus().toggleOrderedList().run(),
      active: () => editor?.isActive("orderedList") ?? false,
      className: "",
    },
    { label: "|", title: "divider3", action: () => { }, active: () => false, className: "cursor-default opacity-30 pointer-events-none" },
    {
      label: "</>",
      title: "Code Block",
      action: () => editor?.chain().focus().toggleCodeBlock().run(),
      active: () => editor?.isActive("codeBlock") ?? false,
      className: "font-mono text-[10px]",
    },
    {
      label: "❝",
      title: "Blockquote",
      action: () => editor?.chain().focus().toggleBlockquote().run(),
      active: () => editor?.isActive("blockquote") ?? false,
      className: "",
    },
    { label: "|", title: "divider4", action: () => { }, active: () => false, className: "cursor-default opacity-30 pointer-events-none" },
    {
      label: "↩",
      title: "Undo",
      action: () => editor?.chain().focus().undo().run(),
      active: () => false,
      className: "",
    },
    {
      label: "↪",
      title: "Redo",
      action: () => editor?.chain().focus().redo().run(),
      active: () => false,
      className: "",
    },
    { label: "|", title: "divider5", action: () => { }, active: () => false, className: "cursor-default opacity-30 pointer-events-none" },
    {
      label: "✨ AI Copilot",
      title: "Open AI Assistant Menu",
      action: () => triggerAiMenuFromButton(),
      active: () => isAiOpen,
      className: "bg-indigo-950/60 text-indigo-400 border border-indigo-900/60 hover:bg-indigo-900/60 hover:text-indigo-300 font-bold",
    },
  ];

  // ── Save status config ─────────────────────────────────────────────────────
  const statusConfig: Record<SaveStatus, { text: string; color: string }> = {
    idle: { text: "All saved", color: "text-zinc-500" },
    saving: { text: "Saving…", color: "text-indigo-400 animate-pulse" },
    saved: { text: "✓ Saved", color: "text-emerald-400" },
    error: { text: "⚠ Save failed", color: "text-red-400" },
  };

  // ── Connection status config ───────────────────────────────────────────────
  const connConfig: Record<ConnectionStatus, { dot: string; label: string }> = {
    connecting: { dot: "bg-amber-400 animate-pulse", label: "Connecting…" },
    connected: { dot: "bg-emerald-400", label: "Live" },
    disconnected: { dot: "bg-red-500", label: "Offline" },
  };

  return (
    <div className="flex flex-col h-full">

      {/* ── Toolbar ── */}
      {!isReadOnly && (
        <div className="flex flex-wrap items-center gap-1 border-b border-zinc-800/60 pb-3 mb-4">
          {toolbar.map((btn, idx) =>
            btn.label === "|" ? (
              <span key={idx} className="text-zinc-700 select-none mx-0.5">|</span>
            ) : (
              <button
                key={btn.title}
                onClick={btn.action}
                title={btn.title}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer select-none
                  ${btn.active()
                    ? "bg-indigo-600 text-white shadow-sm shadow-indigo-500/30"
                    : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 border border-zinc-800"
                  } ${btn.className}`}
              >
                {btn.label}
              </button>
            )
          )}

          {/* Save controls (right side) */}
          <div className="ml-auto flex items-center gap-3">
            <span className={`text-xs transition-all ${statusConfig[saveStatus].color}`}>
              {statusConfig[saveStatus].text}
            </span>
            <button
              onClick={() => editor && saveContent(editor.getHTML())}
              disabled={saveStatus === "saving"}
              className="px-3 py-1 text-xs rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-all disabled:opacity-50 cursor-pointer"
              title="Save (Ctrl+S)"
            >
              Save
            </button>
          </div>
        </div>
      )}

      {/* ── View-only banner ── */}
      {isReadOnly && (
        <div className="flex items-center gap-2 border-b border-zinc-800/60 pb-3 mb-4">
          <span className="text-xs bg-amber-500/10 border border-amber-500/20 text-amber-400 px-2.5 py-1 rounded-lg font-semibold">
            👁 View-Only Mode
          </span>
          <span className="text-xs text-zinc-500">
            You have Viewer access to this document.
          </span>
        </div>
      )}

      {/* ── Status bar (connection + active users) ── */}
      <div className="flex items-center gap-3 mb-3">
        {/* Connection dot + label */}
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${connConfig[connectionStatus].dot}`} />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            {connConfig[connectionStatus].label}
          </span>
        </div>

        {/* Active collaborators avatars */}
        {activeUsers.length > 0 && (
          <div className="flex items-center gap-1 ml-2">
            <span className="text-[10px] font-bold text-white mr-1">Also here:</span>
            <div className="flex -space-x-1">
              {activeUsers.slice(0, 5).map((u) => (
                <div
                  key={u.clientId}
                  title={u.name}
                  style={{ borderColor: u.color, backgroundColor: u.color + "22" }}
                  className="w-6 h-6 rounded-full border-2 flex items-center justify-center text-[9px] font-bold text-white"
                >
                  {u.name.slice(0, 1).toUpperCase()}
                </div>
              ))}
              {activeUsers.length > 5 && (
                <div className="w-6 h-6 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-[9px] text-zinc-400 font-bold">
                  +{activeUsers.length - 5}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Editor content ── */}
      <div className="flex-1 overflow-y-auto rounded-xl bg-zinc-950/30 border border-zinc-900/50 p-2 relative">
        <EditorContent editor={editor} />

        {/* ── AI Copilot Panel ── */}
        {isAiOpen && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 w-[95%] max-w-md bg-zinc-900/95 border border-indigo-500/30 rounded-2xl p-4 shadow-2xl backdrop-blur-md z-30 flex flex-col gap-3 transition-all animate-in fade-in slide-in-from-top-2">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <div className="flex items-center gap-1.5">
                <span className="text-base">✨</span>
                <h4 className="text-xs font-bold text-zinc-100 uppercase tracking-wider">AI Copilot</h4>
              </div>
              <button
                onClick={() => {
                  cancelAiGeneration();
                  setIsAiOpen(false);
                }}
                className="text-zinc-500 hover:text-zinc-300 text-xs transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Action Selector */}
            <div className="grid grid-cols-2 gap-1 bg-zinc-950 p-1 rounded-xl border border-zinc-850">
              {(
                [
                  { id: "summarize", label: "Summary" },
                  { id: "tone", label: "Tone" },
                ] as const
              ).map((act) => (
                <button
                  key={act.id}
                  onClick={() => setAiAction(act.id)}
                  className={`py-1.5 px-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer text-center
                    ${aiAction === act.id
                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20"
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
                    }`}
                >
                  {act.label}
                </button>
              ))}
            </div>

            {/* Context Display & Selection Notice */}
            <div className="text-[10px] text-zinc-500 flex items-center justify-between">
              <span>
                {getSelectedText()
                  ? "👉 Selected text will be replaced"
                  : "👉 Insert text at current cursor"}
              </span>
              {getSelectedText() && (
                <span className="text-indigo-400 font-medium font-sans">
                  {getSelectedText().length} chars selected
                </span>
              )}
            </div>

            {/* Conditional Options */}

            {aiAction === "tone" && (
              <div className="flex items-center gap-2 bg-zinc-950 p-2 rounded-xl border border-zinc-850">
                <span className="text-[10px] text-zinc-400 font-bold shrink-0 uppercase tracking-wide">Tone:</span>
                <select
                  value={targetTone}
                  onChange={(e) => setTargetTone(e.target.value)}
                  className="w-full bg-transparent text-xs text-zinc-200 focus:outline-none cursor-pointer"
                >
                  {["Professional", "Casual", "Academic", "Creative", "Persuasive", "Direct", "Excited"].map((t) => (
                    <option key={t} value={t} className="bg-zinc-900 text-zinc-200">{t}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Generation controls */}
            <div className="flex items-center justify-between mt-1 pt-2 border-t border-zinc-800/40">
              {isGenerating ? (
                <div className="flex items-center gap-2 text-indigo-400 text-xs font-semibold">
                  <div className="w-3.5 h-3.5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                  <span>AI is writing...</span>
                </div>
              ) : (
                <span className="text-[10px] text-zinc-500">
                  Type <kbd className="bg-zinc-800 px-1 py-0.5 rounded text-zinc-400 font-mono text-[9px]">/ai</kbd> in editor
                </span>
              )}

              <div className="flex items-center gap-2">
                {isGenerating ? (
                  <button
                    onClick={cancelAiGeneration}
                    className="px-3.5 py-1.5 text-xs rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 font-bold transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                ) : (
                  <button
                    onClick={runAiGeneration}
                    className="px-4 py-1.5 text-xs rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition-all shadow-md shadow-indigo-500/20 cursor-pointer"
                  >
                    Generate ✨
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Footer stats ── */}
      <div className="border-t border-zinc-800/40 mt-4 pt-3 flex items-center justify-between text-xs text-zinc-600">
        <span>{wordCount} {wordCount === 1 ? "word" : "words"}</span>
        {!isReadOnly && (
          <span className="text-zinc-700">Ctrl+S · saves to cloud</span>
        )}
      </div>
    </div>
  );
}
);

TiptapEditor.displayName = "TiptapEditor";

export default TiptapEditor;
