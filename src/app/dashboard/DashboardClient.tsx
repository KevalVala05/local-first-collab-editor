"use client";

import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { useRouter } from "next/navigation";
import UserMenu from "@/components/UserMenu";
import { DocumentRole } from "@/types/document";
import {
  useCreateDocumentMutation,
  useRenameDocumentMutation,
  useDeleteDocumentMutation,
  useShareDocumentMutation,
} from "@/hooks/useDocumentMutations";

interface Collaborator {
  userId: {
    _id: string;
    name: string;
    email: string;
  };
  role: DocumentRole;
}

interface DocumentData {
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
}

interface DashboardClientProps {
  session: {
    user?: {
      name?: string | null;
      email?: string | null;
      id?: string | null;
    };
  };
}

export default function DashboardClient({ session }: DashboardClientProps)
{
  const router = useRouter();
  const currentUserId = session.user?.id;

  // Pagination & Filtering state
  const [q, setQ] = useState("");
  const [sortBy, setSortBy] = useState("updatedAt");
  const [order, setOrder] = useState("desc");
  const [page, setPage] = useState(1);
  const limit = 6;

  // Modal / Operations State
  const [activeModal, setActiveModal] = useState<{
    type: "rename" | "share" | "delete";
    doc: DocumentData;
  } | null>(null);

  // Form states inside modals
  const [renameTitle, setRenameTitle] = useState("");
  const [shareEmail, setShareEmail] = useState("");
  const [shareRole, setShareRole] = useState<DocumentRole.EDITOR | DocumentRole.VIEWER>(DocumentRole.EDITOR);
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);

  // Fetch Documents
  const { data, isLoading } = useQuery({
    queryKey: ["documents", { q, sortBy, order, page }],
    queryFn: async () =>
    {
      const response = await api.get("/documents", {
        params: { q, sortBy, order, page, limit },
      });
      return response.data.data;
    },
  });

  const documents: DocumentData[] = data?.documents || [];
  const pagination = data?.pagination || { page: 1, limit: 6, total: 0, pages: 1 };

  // CREATE Document mutation
  const createMutation = useCreateDocumentMutation();

  // RENAME Document mutation
  const renameMutation = useRenameDocumentMutation({
    onSuccess: () =>
    {
      setActiveModal(null);
    },
  });

  // DELETE Document mutation
  const deleteMutation = useDeleteDocumentMutation({
    onSuccess: () =>
    {
      setActiveModal(null);
    },
  });

  // SHARE / Invite collaborator mutation
  const shareMutation = useShareDocumentMutation<DocumentData>({
    onSuccess: (updatedDoc) =>
    {
      if (activeModal && activeModal.type === "share")
      {
        setActiveModal({
          type: "share",
          doc: updatedDoc,
        });
      }
      setShareEmail("");
    },
  });

  // Modal state for creating a document
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newDocTitle, setNewDocTitle] = useState("");

  const handleOpenCreate = () => setCreateModalOpen(true);
  const handleCloseCreate = () => {
    setCreateModalOpen(false);
    setNewDocTitle("");
  };

  const handleCreateSubmit = () => {
    if (!newDocTitle.trim()) return; // safety guard
    createMutation.mutate(newDocTitle.trim());
  };

  // When creation succeeds, close the modal automatically
  useEffect(() => {
    if (createMutation.isSuccess) {
      handleCloseCreate();
    }
  }, [createMutation.isSuccess]);

  const handleRenameSubmit = (e: React.FormEvent) =>
  {
    e.preventDefault();
    if (activeModal && renameTitle.trim())
    {
      renameMutation.mutate({
        id: activeModal.doc._id,
        title: renameTitle.trim(),
      });
    }
  };

  const handleDeleteSubmit = () =>
  {
    if (activeModal)
    {
      deleteMutation.mutate(activeModal.doc._id);
    }
  };

  const handleShareSubmit = (e: React.FormEvent) =>
  {
    e.preventDefault();
    if (activeModal && shareEmail.trim())
    {
      shareMutation.mutate({
        id: activeModal.doc._id,
        email: shareEmail.trim(),
        role: shareRole,
      });
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white font-sans flex flex-col relative overflow-hidden">
      {/* Glow graphics background */}
      <div className="absolute top-[-10%] left-[-5%] w-[40%] h-[40%] bg-indigo-900/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-15%] right-[-5%] w-[45%] h-[45%] bg-violet-900/10 rounded-full blur-[120px] pointer-events-none" />

      {/* Header bar */}
      <header className="border-b border-zinc-800/80 bg-zinc-900/20 backdrop-blur-md px-6 py-4 flex items-center justify-between z-10">
        <div className="flex items-center gap-2">
          <svg className="w-6 h-6 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
          <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">
            Collaborative DocEditor
          </span>
        </div>
        <div className="flex items-center gap-4">
          <UserMenu user={session.user || {}} />
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-10 z-10 flex flex-col">
        {/* Top welcome section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
              Welcome back, {session.user?.name || "User"}!
            </h1>
            <p className="text-zinc-500 text-sm mt-1">
              Create, manage, and share your real-time collaborative documents.
            </p>
          </div>
          <button
            id="create-doc-btn"
            onClick={handleOpenCreate}
            disabled={createMutation.isPending}
            className="self-start md:self-auto bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-50 text-white font-semibold py-3 px-5 rounded-xl transition-all shadow-lg hover:shadow-indigo-500/20 flex items-center gap-2 cursor-pointer text-sm"
          >
            {createMutation.isPending ? (
              <>
                <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Creating...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                New Document
              </>
            )}
          </button>
        </div>

        {/* ── Create Document Modal ── */}
        {createModalOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
              <h2 className="text-lg font-bold text-white mb-1">New Document</h2>
              <p className="text-zinc-400 text-sm mb-4">Give your document a title to get started.</p>
              <input
                autoFocus
                type="text"
                value={newDocTitle}
                onChange={(e) => setNewDocTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleCreateSubmit(); }}
                placeholder="e.g. Project Plan"
                className="w-full bg-zinc-950 border border-zinc-700 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-white placeholder-zinc-500 outline-none text-sm transition-all mb-4"
                minLength={2}
                maxLength={100}
              />
              {newDocTitle.trim().length > 0 && newDocTitle.trim().length < 2 && (
                <p className="text-red-400 text-xs mb-3 -mt-2">Title must be at least 2 characters.</p>
              )}
              <div className="flex justify-end gap-2">
                <button
                  onClick={handleCloseCreate}
                  className="px-4 py-2 text-sm rounded-xl text-zinc-300 bg-zinc-800 hover:bg-zinc-700 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateSubmit}
                  disabled={newDocTitle.trim().length < 2 || createMutation.isPending}
                  className="px-4 py-2 text-sm rounded-xl text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 transition-colors cursor-pointer font-semibold"
                >
                  {createMutation.isPending ? "Creating..." : "Create"}
                </button>
              </div>
            </div>
          </div>
        )}


        {/* Filter and Control Panel */}
        <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-4 mb-6 backdrop-blur-md flex flex-col md:flex-row items-center justify-between gap-4">
          {/* Search box */}
          <div className="relative w-full md:max-w-xs">
            <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-500">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
            <input
              type="text"
              placeholder="Search documents..."
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(1); }}
              className="w-full bg-zinc-950/60 border border-zinc-800/60 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl pl-10 pr-4 py-2.5 text-zinc-100 placeholder-zinc-500 transition-all outline-none text-sm"
            />
          </div>

          {/* Sorters */}
          <div className="flex items-center gap-3 w-full md:w-auto justify-end">
            <label className="text-zinc-500 text-xs font-semibold uppercase tracking-wider hidden sm:inline">Sort By</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-zinc-950/60 border border-zinc-800/60 focus:border-indigo-500 rounded-xl px-3 py-2 text-zinc-300 outline-none text-sm transition-all cursor-pointer"
            >
              <option value="updatedAt">Last Updated</option>
              <option value="createdAt">Date Created</option>
              <option value="title">Alphabetical</option>
            </select>

            <select
              value={order}
              onChange={(e) => setOrder(e.target.value)}
              className="bg-zinc-950/60 border border-zinc-800/60 focus:border-indigo-500 rounded-xl px-3 py-2 text-zinc-300 outline-none text-sm transition-all cursor-pointer"
            >
              <option value="desc">Descending</option>
              <option value="asc">Ascending</option>
            </select>
          </div>
        </div>

        {/* Document list render */}
        {isLoading ? (
          /* Skeletons */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((n) => (
              <div key={n} className="bg-zinc-900/20 border border-zinc-900 rounded-2xl p-6 h-44 animate-pulse flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="h-5 bg-zinc-800 rounded w-2/3" />
                  <div className="h-4 bg-zinc-800 rounded w-1/2" />
                </div>
                <div className="flex justify-between items-center pt-4 border-t border-zinc-900">
                  <div className="h-8 bg-zinc-800 rounded w-24" />
                  <div className="h-8 bg-zinc-800 rounded-full w-8" />
                </div>
              </div>
            ))}
          </div>
        ) : documents.length === 0 ? (
          /* Empty states */
          <div className="flex-1 bg-zinc-900/10 border border-zinc-900 border-dashed rounded-3xl p-12 text-center flex flex-col items-center justify-center min-h-[300px]">
            <div className="w-16 h-16 rounded-full bg-zinc-900/60 flex items-center justify-center text-zinc-600 mb-4 border border-zinc-800">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-zinc-300">No documents found</h3>
            <p className="text-zinc-500 text-sm max-w-sm mx-auto mt-1 mb-6">
              {q ? "We couldn't find any documents matching your search term." : "Create your first collaborative document to start editing in real-time."}
            </p>
            {!q && (
              <button
                onClick={handleOpenCreate}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2.5 px-5 rounded-xl transition-all shadow-md text-sm cursor-pointer"
              >
                + Create Document
              </button>
            )}
          </div>
        ) : (
          /* Document Grid */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {documents.map((doc) =>
            {
              const isOwner = doc.ownerId?._id === currentUserId;
              const ownerName = doc.ownerId?.name || "Unknown";

              return (
                <div
                  key={doc._id}
                  className="group bg-zinc-900/30 hover:bg-zinc-900/50 border border-zinc-800/60 hover:border-zinc-700/80 rounded-2xl p-6 transition-all duration-300 flex flex-col justify-between shadow-lg relative cursor-pointer"
                  onClick={() => router.push(`/documents/${doc._id}`)}
                >
                  <div className="absolute top-4 right-4" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => setOpenDropdownId(openDropdownId === doc._id ? null : doc._id)}
                      className="p-1 text-zinc-500 hover:text-zinc-300 rounded-lg hover:bg-zinc-800/60 transition-colors"
                      aria-label="Document options"
                    >
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 10a2 2 0 11-2 2 2 2 0 012-2zm0-6a2 2 0 11-2 2 2 2 0 012-2zm0 12a2 2 0 11-2 2 2 2 0 012-2z" />
                      </svg>
                    </button>

                    {/* Context Dropdown */}
                    {openDropdownId === doc._id && (
                      <>
                        <div className="fixed inset-0 z-20" onClick={() => setOpenDropdownId(null)} />
                        <div className="absolute right-0 mt-1 w-36 bg-zinc-900 border border-zinc-800 rounded-xl p-1.5 shadow-xl z-30 origin-top-right">
                          <button
                            onClick={() =>
                            {
                              setRenameTitle(doc.title);
                              setActiveModal({ type: "rename", doc });
                              setOpenDropdownId(null);
                            }}
                            className="w-full text-left px-3 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-800/80 hover:text-white rounded-lg transition-colors flex items-center gap-2"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                            Rename
                          </button>
                          <button
                            onClick={() =>
                            {
                              setShareEmail("");
                              setShareRole(DocumentRole.EDITOR);
                              setActiveModal({ type: "share", doc });
                              setOpenDropdownId(null);
                            }}
                            className="w-full text-left px-3 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-800/80 hover:text-white rounded-lg transition-colors flex items-center gap-2"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 10.742l3.528-3.528A1 1 0 0012 6.5H5.5A2.5 2.5 0 003 9v8.5A2.5 2.5 0 005.5 20h8.5a2.5 2.5 0 002.5-2.5V11.5a1 1 0 00-.742-.968l-3.528-3.528" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 8a3 3 0 100-6 3 3 0 000 6zM15 12a3 3 0 100-6 3 3 0 000 6z" />
                            </svg>
                            Share / Collaborators
                          </button>
                          {isOwner && (
                            <button
                              onClick={() =>
                              {
                                setActiveModal({ type: "delete", doc });
                                setOpenDropdownId(null);
                              }}
                              className="w-full text-left px-3 py-2 text-xs font-medium text-red-400 hover:bg-red-500/10 hover:text-red-300 rounded-lg transition-colors flex items-center gap-2"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                              Delete
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  <div>
                    <h3 className="text-lg font-bold group-hover:text-indigo-400 transition-colors truncate pr-8">
                      {doc.title}
                    </h3>
                    <p className="text-zinc-500 text-xs mt-1.5 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                      {isOwner ? "Owner (You)" : `Shared by ${ownerName}`}
                    </p>
                  </div>

                  <div className="flex justify-between items-center pt-4 mt-6 border-t border-zinc-800/60 text-xs text-zinc-500">
                    <span>
                      Updated {new Date(doc.updatedAt).toLocaleDateString()}
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-zinc-800 text-[10px] text-zinc-400 uppercase tracking-wider font-semibold">
                      Cloud
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination bar */}
        {!isLoading && pagination.pages > 1 && (
          <div className="flex justify-between items-center mt-8 pt-6 border-t border-zinc-900">
            <span className="text-xs text-zinc-500">
              Showing page {pagination.page} of {pagination.pages} ({pagination.total} documents)
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
                className="bg-zinc-900 border border-zinc-800 disabled:opacity-30 hover:bg-zinc-850 active:bg-zinc-900 text-white font-medium py-1.5 px-3 rounded-lg text-xs transition-colors cursor-pointer disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                disabled={page >= pagination.pages}
                onClick={() => setPage((p) => Math.min(p + 1, pagination.pages))}
                className="bg-zinc-900 border border-zinc-800 disabled:opacity-30 hover:bg-zinc-850 active:bg-zinc-900 text-white font-medium py-1.5 px-3 rounded-lg text-xs transition-colors cursor-pointer disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </main>

      {/* RENAME MODAL */}
      {activeModal && activeModal.type === "rename" && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center px-4">
          <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-lg font-bold text-white mb-4">Rename Document</h3>
            <form onSubmit={handleRenameSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Title</label>
                <input
                  type="text"
                  required
                  minLength={2}
                  maxLength={100}
                  value={renameTitle}
                  onChange={(e) => setRenameTitle(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-zinc-100 placeholder-zinc-500 transition-all outline-none text-sm"
                />
              </div>
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="bg-zinc-900 border border-zinc-800 hover:bg-zinc-850 text-zinc-300 font-semibold py-2 px-4 rounded-xl text-sm transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={renameMutation.isPending}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2 px-4 rounded-xl text-sm transition-colors cursor-pointer disabled:opacity-50"
                >
                  {renameMutation.isPending ? "Renaming..." : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE MODAL */}
      {activeModal && activeModal.type === "delete" && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center px-4">
          <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-lg font-bold text-red-400 mb-2">Delete Document</h3>
            <p className="text-zinc-400 text-sm leading-relaxed mb-6">
              Are you sure you want to delete <span className="text-zinc-200 font-semibold">&quot;{activeModal.doc.title}&quot;</span>? This action is permanent and cannot be undone. All collaborators will lose access.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="bg-zinc-900 border border-zinc-800 hover:bg-zinc-850 text-zinc-300 font-semibold py-2 px-4 rounded-xl text-sm transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteSubmit}
                disabled={deleteMutation.isPending}
                className="bg-red-600 hover:bg-red-500 text-white font-semibold py-2 px-4 rounded-xl text-sm transition-colors cursor-pointer disabled:opacity-50"
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SHARE / COLLABORATORS MODAL */}
      {activeModal && activeModal.type === "share" && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center px-4">
          <div className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4 mb-4">
              <h3 className="text-lg font-bold text-white">Collaborators: {activeModal.doc.title}</h3>
              <button
                onClick={() => setActiveModal(null)}
                className="text-zinc-500 hover:text-zinc-300 p-1"
                aria-label="Close modal"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Invite Form */}
            <form onSubmit={handleShareSubmit} className="space-y-4 mb-6">
              <div className="flex flex-col sm:flex-row gap-3 items-end">
                <div className="flex-1 w-full">
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">User Email</label>
                  <input
                    type="email"
                    required
                    minLength={2}
                    maxLength={50}
                    placeholder="collaborator@example.com"
                    value={shareEmail}
                    onChange={(e) => setShareEmail(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-zinc-100 placeholder-zinc-500 transition-all outline-none text-sm"
                  />
                </div>
                <div className="w-full sm:w-28">
                  <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Role</label>
                  <select
                    value={shareRole}
                    onChange={(e) => setShareRole(e.target.value as DocumentRole.EDITOR | DocumentRole.VIEWER)}
                    className="w-full bg-zinc-950 border border-zinc-800 focus:border-indigo-500 rounded-xl px-3 py-2.5 text-zinc-300 outline-none text-sm transition-all cursor-pointer"
                  >
                    <option value={DocumentRole.EDITOR}>Editor</option>
                    <option value={DocumentRole.VIEWER}>Viewer</option>
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={shareMutation.isPending || !shareEmail.trim()}
                  className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2.5 px-4 rounded-xl text-sm transition-colors cursor-pointer disabled:opacity-50"
                >
                  {shareMutation.isPending ? "Inviting..." : "Invite"}
                </button>
              </div>
            </form>

            {/* Collaborators List */}
            <div className="flex-1 overflow-y-auto pr-1">
              <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">People with Access</h4>
              <div className="space-y-3">
                {/* Document Owner */}
                <div className="flex items-center justify-between bg-zinc-950/20 border border-zinc-850 rounded-xl p-3.5">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center font-bold text-xs text-zinc-300">
                      {activeModal.doc.ownerId?.name?.slice(0, 2).toUpperCase() || "OW"}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-zinc-200 truncate">{activeModal.doc.ownerId?.name || "Owner"}</p>
                      <p className="text-xs text-zinc-500 truncate">{activeModal.doc.ownerId?.email || ""}</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold text-indigo-400 bg-indigo-500/10 px-2.5 py-1 rounded-md uppercase tracking-wider">
                    Owner
                  </span>
                </div>

                {/* Other collaborators */}
                {activeModal.doc.collaborators?.map((collab) =>
                {
                  const uName = collab.userId?.name || "Collaborator";
                  const uEmail = collab.userId?.email || "";
                  const initials = uName.slice(0, 2).toUpperCase();

                  return (
                    <div key={collab.userId?._id} className="flex items-center justify-between bg-zinc-950/20 border border-zinc-850 rounded-xl p-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-zinc-850 flex items-center justify-center font-bold text-xs text-zinc-400">
                          {initials}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-zinc-200 truncate">{uName}</p>
                          <p className="text-xs text-zinc-500 truncate">{uEmail}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-zinc-400 bg-zinc-800 px-2.5 py-1 rounded-md uppercase tracking-wider">
                          {collab.role}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
