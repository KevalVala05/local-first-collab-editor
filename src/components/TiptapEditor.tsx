"use client";

import React, {
  useEffect,
  useCallback,
  useRef,
  useState,
  useMemo,
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

// ── Component ───────────────────────────────────────────────────────────────

export default function TiptapEditor({
  documentId,
  initialContent,
  userRole,
  userName,
  userEmail,
}: TiptapEditorProps)
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

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Save to backend (debounced) ────────────────────────────────────────────
  const saveContent = useCallback(
    async (content: string) =>
    {
      setSaveStatus("saving");
      try
      {
        await api.patch(`/documents/${documentId}`, { content });
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 2000);
      }
      catch (err)
      {
        setSaveStatus("error");
        const message = err instanceof Error ? err.message : "Failed to save";
        toastError(message);
      }
    },
    [documentId]
  );

  // ── Tiptap editor ──────────────────────────────────────────────────────────
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
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
    editorProps: {
      attributes: {
        class:
          "prose prose-invert prose-sm sm:prose-base max-w-none min-h-[500px] focus:outline-none px-2 py-2 text-zinc-100 leading-relaxed",
      },
    },
    onUpdate: ({ editor }) =>
    {
      if (isReadOnly) return;
      const html = editor.getHTML();
      setWordCount(editor.storage.characterCount?.words() ?? 0);

      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(
        () => saveContent(html),
        AUTOSAVE_DEBOUNCE_MS
      );
    },
  });

  // ── Seed initial content after Yjs syncs ──────────────────────────────────
  useEffect(() =>
  {
    if (!editor || contentSeeded) return;

    const handleSync = (synced: boolean) =>
    {
      if (!synced || contentSeeded) return;

      // If the Yjs doc is empty, load content from MongoDB
      const fragment = ydoc.getXmlFragment("default");
      if (fragment.length === 0 && initialContent)
      {
        editor.commands.setContent(initialContent);
      }
      setContentSeeded(true);
      setWordCount(editor.storage.characterCount?.words() ?? 0);
    };

    // y-websocket v3 uses 'sync' event (also emits 'synced' for backwards compat)
    provider.on("sync", handleSync);
    // If already synced when this effect runs
    if (provider.synced) handleSync(true);

    return () => provider.off("sync", handleSync);
  }, [editor, provider, ydoc, initialContent, contentSeeded]);

  // ── Connection status tracking ─────────────────────────────────────────────
  useEffect(() =>
  {
    const handleStatus = ({ status }: { status: string }) =>
    {
      if (status === "connected") setConnectionStatus("connected");
      else if (status === "disconnected") setConnectionStatus("disconnected");
      else setConnectionStatus("connecting");
    };

    provider.on("status", handleStatus);
    return () => provider.off("status", handleStatus);
  }, [provider]);

  // ── Awareness / presence tracking ─────────────────────────────────────────
  useEffect(() =>
  {
    // Set our own presence data
    provider.awareness.setLocalStateField("user", {
      name: userName,
      email: userEmail,
      color: getPresenceColor(ydoc.clientID),
    });

    const updatePresence = () =>
    {
      const states = provider.awareness.getStates();
      const users: Array<{ name: string; color: string; clientId: number }> =
        [];

      states.forEach((state, clientId) =>
      {
        if (state.user && clientId !== ydoc.clientID)
        {
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
  useEffect(() =>
  {
    const handleKeyDown = (e: KeyboardEvent) =>
    {
      if ((e.ctrlKey || e.metaKey) && e.key === "s")
      {
        e.preventDefault();
        if (editor && !isReadOnly)
        {
          if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
          saveContent(editor.getHTML());
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [editor, isReadOnly, saveContent]);

  // ── Cleanup ────────────────────────────────────────────────────────────────
  useEffect(() =>
  {
    return () =>
    {
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
    { label: "|", title: "divider", action: () => {}, active: () => false, className: "cursor-default opacity-30 pointer-events-none" },
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
    { label: "|", title: "divider2", action: () => {}, active: () => false, className: "cursor-default opacity-30 pointer-events-none" },
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
    { label: "|", title: "divider3", action: () => {}, active: () => false, className: "cursor-default opacity-30 pointer-events-none" },
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
    { label: "|", title: "divider4", action: () => {}, active: () => false, className: "cursor-default opacity-30 pointer-events-none" },
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
  ];

  // ── Save status config ─────────────────────────────────────────────────────
  const statusConfig: Record<SaveStatus, { text: string; color: string }> = {
    idle:    { text: "All saved",    color: "text-zinc-500" },
    saving:  { text: "Saving…",      color: "text-indigo-400 animate-pulse" },
    saved:   { text: "✓ Saved",      color: "text-emerald-400" },
    error:   { text: "⚠ Save failed", color: "text-red-400" },
  };

  // ── Connection status config ───────────────────────────────────────────────
  const connConfig: Record<ConnectionStatus, { dot: string; label: string }> = {
    connecting:   { dot: "bg-amber-400 animate-pulse", label: "Connecting…" },
    connected:    { dot: "bg-emerald-400",              label: "Live" },
    disconnected: { dot: "bg-red-500",                  label: "Offline" },
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
            <span className="text-[10px] text-zinc-600 mr-1">Also here:</span>
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
      <div className="flex-1 overflow-y-auto rounded-xl bg-zinc-950/30 border border-zinc-900/50 p-2">
        <EditorContent editor={editor} />
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
