"use client";

import React, { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import UserMenu from "@/components/UserMenu";
import { DocumentRole } from "@/types/document";
import TiptapEditor, { TiptapEditorRef } from "@/components/TiptapEditor";
import { localDb } from "@/lib/localDb";
import api from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { useSync } from "@/context/SyncContext";
import { toastSuccess, toastError } from "@/lib/toast";
import Footer from "@/components/Footer";

// ── Types & Interfaces ──────────────────────────────────────────────────────

interface Collaborator
{
  userId: {
    _id: string;
    name: string;
    email: string;
  };
  role: DocumentRole;
}

interface DocumentData
{
  _id: string;
  title: string;
  content: string;
  ownerId: {
    _id: string;
    name: string;
    email: string;
  };
  collaborators: Collaborator[];
  createdAt: string;
  updatedAt: string;
  isLocalOnly?: boolean;
}

interface SnapshotItem {
  _id: string;
  version: number;
  title: string;
  content: string;
  createdBy?: { name?: string };
  createdAt: string;
}

type PopulatedId = { _id: string; name?: string; email?: string };
// ── Page ────────────────────────────────────────────────────────────────────

export default function DocumentPage()
{
  const { id } = useParams() as { id: string };
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();
  const { syncStatus, isOnline } = useSync();

  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [previewSnapshot, setPreviewSnapshot] = useState<SnapshotItem | null>(null);
  const [isCreatingSnapshot, setIsCreatingSnapshot] = useState(false);
  const [snapshotTitle, setSnapshotTitle] = useState("");
  const editorRef = useRef<TiptapEditorRef | null>(null);

  // Fetch Snapshots
  const { data: snapshots, refetch: refetchSnapshots } = useQuery(
    {
      queryKey: ["document-snapshots", id],
      queryFn: async () =>
      {
        const res = await api.get(`/documents/${id}/snapshots`);
        return res.data.data;
      },
      enabled: !!id && !id.startsWith("local_"),
    }
  );

  // Create Manual Snapshot
  const handleCreateSnapshot = async () =>
  {
    if (!snapshotTitle.trim())
    {
      toastError("Please enter a version description/title");
      return;
    }
    setIsCreatingSnapshot(true);
    try
    {
      await api.post(
        `/documents/${id}/snapshots`,
        {
          title: snapshotTitle.trim(),
        }
      );
      setSnapshotTitle("");
      refetchSnapshots();
      toastSuccess("Snapshot captured successfully!");
    }
    catch (err: unknown)
    {
      const msg = err instanceof Error
        ? (err as Error & { response?: { data?: { message?: string } } }).response?.data?.message ?? err.message
        : "Failed to create snapshot";
      toastError(msg);
    }
    finally
    {
      setIsCreatingSnapshot(false);
    }
  };

  // Restore Snapshot
  const handleRestore = async (snapshotId: string) =>
  {
    try
    {
      const res = await api.post(`/documents/${id}/snapshots/${snapshotId}/restore`);
      const restored = res.data.data;

      // Update TiptapEditor content instantly
      if (editorRef.current)
      {
        editorRef.current.setContent(restored.content);
      }

      // Refetch snapshots to include the pre-restore backup
      refetchSnapshots();

      // Close preview modal
      setPreviewSnapshot(null);

      toastSuccess("Document successfully rolled back to chosen version!");
    }
    catch (err: unknown)
    {
      const msg = err instanceof Error
        ? (err as Error & { response?: { data?: { message?: string } } }).response?.data?.message ?? err.message
        : "Failed to restore snapshot";
      toastError(msg);
    }
  };

  // Auto-save snapshots every 10 minutes if online
  useEffect(
    () =>
    {
      const isLocalOnly = id.startsWith("local_");
      if (isLocalOnly || !isOnline)
      {
        return;
      }

      const interval = setInterval(
        async () =>
        {
          try
          {
            await api.post(
              `/documents/${id}/snapshots`,
              {
                title: "Auto-save Backup",
              }
            );
            refetchSnapshots();
          }
          catch (err)
          {
            console.warn("Auto-save snapshot failed", err);
          }
        },
        10 * 60 * 1000
      );

      return () =>
      {
        clearInterval(interval);
      };
    },
    [id, isOnline, refetchSnapshots]
  );

  // Redirect to server ObjectID if a local temporary ID document gets synced in background
  useEffect(
    () =>
    {
      const handleSyncRedirect = (e: Event) =>
      {
        const customEvent = e as CustomEvent;
        if (customEvent.detail.oldId === id)
        {
          router.replace(`/documents/${customEvent.detail.newId}`);
        }
      };

      window.addEventListener("document_created_sync", handleSyncRedirect);
      return () =>
      {
        window.removeEventListener("document_created_sync", handleSyncRedirect);
      };
    },
    [id, router]
  );

  const [localDoc, setLocalDoc] = useState<DocumentData | null>(null);
  const [localLoading, setLocalLoading] = useState(true);

  // 1. Fetch from local IndexedDB first
  useEffect(
    () =>
    {
      async function fetchLocal()
      {
        try
        {
          const cached = await localDb.documents.get(id);
          if (cached)
          {
            setLocalDoc(
              {
                _id: cached._id,
                title: cached.title,
                content: cached.content || "",
                ownerId: cached.ownerId,
                collaborators: cached.collaborators as Collaborator[] || [],
                updatedAt: cached.updatedAt,
                createdAt: cached.createdAt,
                isLocalOnly: cached.isLocalOnly,
              }
            );
          }
        }
        catch (err)
        {
          console.error("Error reading local DB", err);
        }
        finally
        {
          setLocalLoading(false);
        }
      }
      fetchLocal();
    },
    [id]
  );



  // 2. Fetch from server in background if online and not a local-only document
  const { data: serverDoc, isLoading: serverLoading } = useQuery(
    {
      queryKey: ["document", id],
      queryFn: async () =>
      {
        const res = await api.get(`/documents/${id}`);
        const docData = res.data.data;

        // Cache/update in Dexie
        await localDb.documents.put(
          {
            _id: docData._id,
            title: docData.title,
            content: docData.content || "",
            ownerId: docData.ownerId,
            collaborators: docData.collaborators || [],
            updatedAt: docData.updatedAt,
            createdAt: docData.createdAt,
            syncStatus: "synced",
          }
        );

        return docData as DocumentData;
      },
      enabled: !!id && isOnline && !id.startsWith("local_"),
      retry: false,
    }
  );

  // Redirect if unauthenticated
  useEffect(
    () =>
    {
      if (sessionStatus === "unauthenticated")
      {
        router.push("/login");
      }
    },
    [sessionStatus, router]
  );

  if (sessionStatus === "loading" || (localLoading && serverLoading))
  {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center font-sans">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-zinc-400 text-sm">Loading document...</p>
      </div>
    );
  }

  const doc = serverDoc || localDoc;

  if (!doc)
  {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center font-sans p-6">
        <h2 className="text-2xl font-bold text-red-400 mb-2">Document Not Found</h2>
        <p className="text-zinc-400 text-sm mb-6">The document you are trying to access does not exist or has been deleted.</p>
        <Link href="/dashboard" className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2 px-5 rounded-xl text-sm transition-colors">
          Back to Dashboard
        </Link>
      </div>
    );
  }

  // Check access permissions
  const userId = session?.user?.id;

  const docOwnerId = typeof doc.ownerId === "object" && doc.ownerId !== null
    ? (doc.ownerId as PopulatedId)._id
    : String(doc.ownerId);

  const isOwner = docOwnerId === userId;
  const isLocalOnly = doc.isLocalOnly || doc._id.startsWith("local_");

  const collaborators = (doc.collaborators || []).filter(
    (c) =>
    {
      const collabId = typeof c.userId === "object" && c.userId !== null
        ? (c.userId as PopulatedId)._id
        : String(c.userId);
      return collabId !== docOwnerId;
    }
  );

  const isCollaborator = collaborators.some(
    (c) =>
    {
      const collabId = typeof c.userId === "object" && c.userId !== null
        ? (c.userId as PopulatedId)._id
        : String(c.userId);
      return collabId === userId;
    }
  );

  const hasAccess = isLocalOnly || isOwner || isCollaborator;

  if (!hasAccess && !serverLoading)
  {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center font-sans p-6">
        <h2 className="text-2xl font-bold text-red-400 mb-2">Permission Denied</h2>
        <p className="text-zinc-400 text-sm mb-6">You do not have authorization to view or edit this document.</p>
        <Link href="/dashboard" className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2 px-5 rounded-xl text-sm transition-colors">
          Back to Dashboard
        </Link>
      </div>
    );
  }

  // Determine user role
  let userRole: DocumentRole = DocumentRole.VIEWER;
  if (isOwner || isLocalOnly)
  {
    userRole = DocumentRole.OWNER;
  }
  else
  {
    const collab = collaborators.find(
      (c) =>
      {
        const collabId = typeof c.userId === "object" && c.userId !== null
          ? (c.userId as PopulatedId)._id
          : String(c.userId);
        return collabId === userId;
      }
    );
    if (collab)
    {
      userRole = collab.role;
    }
  }

  // Role badge styling
  const roleBadge: Record<DocumentRole, string> = {
    [DocumentRole.OWNER]: "bg-indigo-500/10 border-indigo-500/20 text-indigo-400",
    [DocumentRole.EDITOR]: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
    [DocumentRole.VIEWER]: "bg-amber-500/10 border-amber-500/20 text-amber-400",
  };

  const initialContent = typeof doc.content === "string" ? doc.content : "";

  return (
    <div className="min-h-screen bg-zinc-950 text-white font-sans flex flex-col relative overflow-hidden">
      {/* Glow background */}
      <div className="absolute top-[-10%] left-[-5%] w-[40%] h-[40%] bg-indigo-900/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-15%] right-[-5%] w-[45%] h-[45%] bg-violet-900/10 rounded-full blur-[120px] pointer-events-none" />

      {/* Header */}
      <header className="border-b border-zinc-800/80 bg-zinc-900/20 backdrop-blur-md px-6 py-4 flex items-center justify-between z-10 sticky top-0">
        <div className="flex items-center gap-4 min-w-0">
          <Link
            href="/dashboard"
            className="p-2 text-zinc-400 hover:text-zinc-200 rounded-xl hover:bg-zinc-900 border border-transparent hover:border-zinc-800 transition-all flex items-center gap-1 text-sm font-semibold shrink-0"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Dashboard
          </Link>
          <span className="text-zinc-600">/</span>
          <h1 className="text-base font-bold text-zinc-100 truncate max-w-xs">{doc.title}</h1>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div
            className={
              `flex items-center gap-2 px-3 py-1 rounded-xl border text-xs font-semibold ${
                syncStatus === "online"
                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                  : syncStatus === "offline"
                  ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
                  : syncStatus === "syncing"
                  ? "bg-blue-500/10 border-blue-500/20 text-blue-400"
                  : "bg-red-500/10 border-red-500/20 text-red-400"
              }`
            }
          >
            <span
              className={
                `w-2 h-2 rounded-full ${
                  syncStatus === "online"
                    ? "bg-emerald-400"
                    : syncStatus === "offline"
                    ? "bg-amber-400 animate-pulse"
                    : syncStatus === "syncing"
                    ? "bg-blue-400 animate-ping"
                    : "bg-red-500"
                }`
              }
            />
            <span>
              {
                syncStatus === "online"
                  ? "Online"
                  : syncStatus === "offline"
                  ? "Offline"
                  : syncStatus === "syncing"
                  ? "Syncing..."
                  : "Sync Error"
              }
            </span>
          </div>
          <span className={`px-2.5 py-1 rounded-md border text-[10px] uppercase font-bold tracking-wider ${roleBadge[userRole]}`}>
            {userRole}
          </span>
          {!isLocalOnly && (
            <button
              onClick={
                () =>
                {
                  setIsHistoryOpen(!isHistoryOpen);
                }
              }
              className={
                `px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                  isHistoryOpen
                    ? "bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/10"
                    : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                }`
              }
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              History
            </button>
          )}
          <UserMenu user={session?.user || {}} />
        </div>
      </header>

      {/* Main workspace */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6 z-10 flex flex-col md:flex-row gap-6">

        {/* ── Editor Column ── */}
        <div className="flex-1 bg-zinc-900/20 border border-zinc-800/60 rounded-2xl p-6 backdrop-blur-md flex flex-col min-h-[600px]">
          {/* Doc title + meta */}
          <div className="border-b border-zinc-800/60 pb-4 mb-5">
            <h2 className="text-2xl font-extrabold tracking-tight text-zinc-100">{doc.title}</h2>
            <p className="text-zinc-500 text-xs mt-1">
              Created {new Date(doc.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
              {" · "}
              Last updated {new Date(doc.updatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
            </p>
          </div>

          {/* Tiptap Editor */}
          <div className="flex-1">
            <TiptapEditor
              ref={editorRef}
              documentId={id}
              initialContent={initialContent}
              userRole={userRole}
              title={doc.title}
              userName={session?.user?.name || "Anonymous"}
              userEmail={session?.user?.email || ""}
            />
          </div>
        </div>

        {/* ── Sidebar Column ── */}
        <div className="w-full md:w-64 flex flex-col gap-5 shrink-0">
          {isHistoryOpen ? (
            /* History sidebar */
            <div className="bg-zinc-900/20 border border-zinc-800/60 rounded-2xl p-5 backdrop-blur-md flex-1 flex flex-col min-h-[500px]">
              <div className="flex items-center justify-between border-b border-zinc-800/60 pb-3 mb-4">
                <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-widest">Version History</h3>
                <button
                  onClick={() => setIsHistoryOpen(false)}
                  className="text-zinc-500 hover:text-zinc-300 transition-colors p-1 cursor-pointer"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Create Snapshot section */}
              {userRole !== DocumentRole.VIEWER && (
                <div className="mb-5 pb-4 border-b border-zinc-800/40">
                  <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2">Create Version</h4>
                  <div className="flex flex-col gap-2">
                    <input
                      type="text"
                      placeholder="Version title/reason..."
                      value={snapshotTitle}
                      onChange={(e) => setSnapshotTitle(e.target.value)}
                      className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-indigo-500 text-zinc-200"
                    />
                    <button
                      onClick={handleCreateSnapshot}
                      disabled={isCreatingSnapshot}
                      className="w-full bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-semibold py-2 px-3 rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      {isCreatingSnapshot ? "Capturing..." : "Capture Snapshot"}
                    </button>
                  </div>
                </div>
              )}

              {/* Timeline list of snapshots */}
              <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                {snapshots && snapshots.length > 0 ? (
                  <div className="relative border-l border-zinc-800 pl-4 ml-2 space-y-5 py-2">
                    {snapshots.map(
                      (snap: SnapshotItem) =>
                      {
                        return (
                          <div key={snap._id} className="relative group">
                            {/* timeline dot */}
                            <span className="absolute -left-[21px] top-1.5 w-2.5 h-2.5 rounded-full bg-indigo-500 ring-4 ring-zinc-950 group-hover:bg-indigo-400 transition-colors" />

                            <div className="min-w-0">
                              <p className="text-xs font-bold text-zinc-200 leading-tight">
                                v{snap.version} - {snap.title}
                              </p>
                              <p className="text-[10px] text-zinc-500 mt-1 leading-normal">
                                By {snap.createdBy?.name || "Unknown"}
                              </p>
                              <p className="text-[9px] text-zinc-650 mt-0.5 leading-none">
                                {new Date(snap.createdAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "numeric" })} · {new Date(snap.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                              </p>

                              <div className="flex items-center gap-2 mt-2">
                                <button
                                  onClick={() => setPreviewSnapshot(snap)}
                                  className="text-[10px] font-semibold bg-zinc-900 hover:bg-zinc-850 text-zinc-300 py-1 px-2.5 rounded-lg border border-zinc-800 hover:border-zinc-700 transition-all cursor-pointer"
                                >
                                  Preview
                                </button>
                                {userRole !== DocumentRole.VIEWER && (
                                  <button
                                    onClick={() => handleRestore(snap._id)}
                                    className="text-[10px] font-semibold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 py-1 px-2.5 rounded-lg border border-emerald-500/20 hover:border-emerald-500/30 transition-all cursor-pointer"
                                  >
                                    Restore
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      }
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <svg className="w-8 h-8 text-zinc-700 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-xs text-zinc-600">No versions recorded yet.</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Default standard sidebar */
            <>
              {/* Owner card */}
              <div className="bg-zinc-900/20 border border-zinc-800/60 rounded-2xl p-5 backdrop-blur-md">
                <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3">Owner</h3>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center font-bold text-xs text-white shrink-0">
                    {doc.ownerId?.name?.slice(0, 2).toUpperCase() || "OW"}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-zinc-200 truncate">{doc.ownerId?.name}</p>
                    <p className="text-xs text-zinc-500 truncate">{doc.ownerId?.email}</p>
                  </div>
                </div>
              </div>

              {/* Collaborators card */}
              <div className="bg-zinc-900/20 border border-zinc-800/60 rounded-2xl p-5 backdrop-blur-md flex-1">
                <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3">
                  Collaborators ({collaborators.length})
                </h3>
                {collaborators.length === 0 ? (
                  <p className="text-zinc-600 text-xs">No collaborators yet.</p>
                ) : (
                  <div className="space-y-2.5">
                    {collaborators.map(
                      (c) =>
                      {
                        const uName = c.userId?.name || "User";
                        const uEmail = c.userId?.email || "";
                        const roleColors: Record<DocumentRole, string> = {
                          [DocumentRole.OWNER]: "text-indigo-400 bg-indigo-500/10",
                          [DocumentRole.EDITOR]: "text-emerald-400 bg-emerald-500/10",
                          [DocumentRole.VIEWER]: "text-amber-400 bg-amber-500/10",
                        };
                        return (
                          <div
                            key={c.userId?._id?.toString()}
                            className="flex items-center justify-between bg-zinc-950/30 border border-zinc-900 rounded-xl p-2.5"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="w-7 h-7 rounded-full bg-zinc-800 flex items-center justify-center font-bold text-[10px] text-zinc-300 shrink-0">
                                {uName.slice(0, 2).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-zinc-200 truncate">{uName}</p>
                                <p className="text-[10px] text-zinc-500 truncate">{uEmail}</p>
                              </div>
                            </div>
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0 ${roleColors[c.role]}`}>
                              {c.role}
                            </span>
                          </div>
                        );
                      }
                    )}
                  </div>
                )}
              </div>

              {/* Help tips card */}
              <div className="bg-zinc-900/20 border border-zinc-800/60 rounded-2xl p-5 backdrop-blur-md">
                <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3">Tips</h3>
                <ul className="space-y-1.5 text-xs text-zinc-500">
                  <li>• <span className="text-zinc-400 font-medium">Ctrl+S</span> to save manually</li>
                  <li>• Auto-saves after 1.5s of inactivity</li>
                  <li>• Use toolbar to format text</li>
                  <li>• Viewers cannot edit</li>
                </ul>
              </div>
            </>
          )}
        </div>
      </main>

      {/* ── Snapshot Preview Modal ── */}
      {previewSnapshot && (
        <div className="fixed inset-0 bg-black/80 z-50 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="border-b border-zinc-800/80 px-6 py-4 bg-zinc-950/20 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
                  <span className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded text-xs font-mono">
                    v{previewSnapshot.version}
                  </span>
                  {previewSnapshot.title}
                </h3>
                <p className="text-xs text-zinc-500 mt-1">
                  Saved by {previewSnapshot.createdBy?.name || "Unknown"} on {new Date(previewSnapshot.createdAt).toLocaleString("en-IN", { day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit" })}
                </p>
              </div>
              <button
                onClick={() => setPreviewSnapshot(null)}
                className="text-zinc-400 hover:text-zinc-200 transition-colors p-2 rounded-xl hover:bg-zinc-800/50 cursor-pointer"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Content Preview Area (Read-Only) */}
            <div className="flex-1 overflow-y-auto p-6 bg-zinc-950/50">
              <div className="bg-zinc-900 border border-zinc-800/80 rounded-2xl p-6 min-h-[300px]">
                {previewSnapshot.content ? (
                  <div
                    className="prose prose-invert prose-sm max-w-none text-zinc-300 focus:outline-none"
                    dangerouslySetInnerHTML={
                      {
                        __html: previewSnapshot.content,
                      }
                    }
                  />
                ) : (
                  <p className="text-zinc-600 text-sm italic">Empty content.</p>
                )}
              </div>
            </div>

            {/* Modal Footer Actions */}
            <div className="border-t border-zinc-800/80 px-6 py-4 bg-zinc-950/20 flex items-center justify-end gap-3">
              <button
                onClick={() => setPreviewSnapshot(null)}
                className="bg-zinc-800 hover:bg-zinc-750 text-zinc-300 font-semibold py-2 px-5 rounded-xl text-sm transition-colors cursor-pointer"
              >
                Close Preview
              </button>
              {userRole !== DocumentRole.VIEWER && (
                <button
                  onClick={
                    () =>
                    {
                      handleRestore(previewSnapshot._id);
                    }
                  }
                  className="bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-semibold py-2 px-5 rounded-xl text-sm transition-colors flex items-center gap-1.5 cursor-pointer shadow-lg shadow-emerald-600/10 hover:shadow-emerald-500/20"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H18.5" />
                  </svg>
                  Restore This Version
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Author Footer ── */}
      <Footer className="mt-6 pb-6" />
    </div>
  );
}
