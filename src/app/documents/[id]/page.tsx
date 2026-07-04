import React from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { redirect } from "next/navigation";
import dbConnect from "@/lib/db";
import { Document } from "@/models/Document";
import Link from "next/link";
import UserMenu from "@/components/UserMenu";
import { DocumentRole } from "@/types/document";
import TiptapEditor from "@/components/TiptapEditor";

// ── Types & Interfaces ──────────────────────────────────────────────────────

interface PageProps {
  params: Promise<{ id: string }>;
}

// ── Page ────────────────────────────────────────────────────────────────────

export default async function DocumentPage({ params }: PageProps)
{
  const { id } = await params;
  const session = await getServerSession(authOptions);

  if (!session?.user?.id)
  {
    redirect("/login");
  }

  await dbConnect();

  const doc = await Document.findById(id)
    .populate("ownerId", "name email")
    .populate("collaborators.userId", "name email");

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

  // Check if current user is owner or collaborator
  const userId = session.user.id;
  const isOwner = doc.ownerId._id.toString() === userId;

  const collaborators = (doc.collaborators || []) as Array<{
    userId?: {
      _id: { toString(): string };
      name?: string | null;
      email?: string | null;
    } | null;
    role: DocumentRole;
  }>;

  const isCollaborator = collaborators.some(
    (c) => c.userId?._id?.toString() === userId
  );

  if (!isOwner && !isCollaborator)
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

  // Determine role
  let userRole: DocumentRole = DocumentRole.VIEWER;
  if (isOwner)
  {
    userRole = DocumentRole.OWNER;
  }
  else
  {
    const collab = collaborators.find((c) => c.userId?._id?.toString() === userId);
    if (collab)
    {
      userRole = collab.role;
    }
  }

  // Role badge colour
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
          <span className={`px-2.5 py-1 rounded-md border text-[10px] uppercase font-bold tracking-wider ${roleBadge[userRole]}`}>
            {userRole}
          </span>
          <UserMenu user={session.user || {}} />
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
              documentId={id}
              initialContent={initialContent}
              userRole={userRole}
              title={doc.title}
              userName={session.user?.name || "Anonymous"}
              userEmail={session.user?.email || ""}
            />
          </div>
        </div>

        {/* ── Sidebar Column ── */}
        <div className="w-full md:w-64 flex flex-col gap-5 shrink-0">

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
                {collaborators.map((c) =>
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
                })}
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
        </div>
      </main>
    </div>
  );
}
