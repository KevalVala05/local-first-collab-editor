import React from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { redirect } from "next/navigation";
import dbConnect from "@/lib/db";
import { Document } from "@/models/Document";
import Link from "next/link";
import UserMenu from "@/components/UserMenu";
import { DocumentRole } from "@/types/document";

interface PageProps {
  params: Promise<{ id: string }>;
}

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

  return (
    <div className="min-h-screen bg-zinc-950 text-white font-sans flex flex-col relative overflow-hidden">
      {/* Glow graphics background */}
      <div className="absolute top-[-10%] left-[-5%] w-[40%] h-[40%] bg-indigo-900/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-15%] right-[-5%] w-[45%] h-[45%] bg-violet-900/10 rounded-full blur-[120px] pointer-events-none" />

      {/* Header */}
      <header className="border-b border-zinc-800/80 bg-zinc-900/20 backdrop-blur-md px-6 py-4 flex items-center justify-between z-10">
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard"
            className="p-2 text-zinc-400 hover:text-zinc-200 rounded-xl hover:bg-zinc-900 border border-transparent hover:border-zinc-800 transition-all flex items-center gap-1 text-sm font-semibold"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Dashboard
          </Link>
          <span className="text-zinc-600">/</span>
          <h1 className="text-base font-bold text-zinc-100 max-w-xs truncate">{doc.title}</h1>
        </div>
        <div className="flex items-center gap-4">
          <span className="px-2.5 py-1 rounded-md bg-zinc-900 border border-zinc-800 text-[10px] text-zinc-400 uppercase font-semibold tracking-wider">
            Role: {userRole}
          </span>
          <UserMenu user={session.user || {}} />
        </div>
      </header>

      {/* Main Workspace */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-8 z-10 flex flex-col md:flex-row gap-6">
        {/* Editor Area */}
        <div className="flex-1 bg-zinc-900/20 border border-zinc-800/60 rounded-2xl p-6 backdrop-blur-md flex flex-col gap-4">
          <div className="border-b border-zinc-850 pb-4">
            <h2 className="text-2xl font-extrabold tracking-tight text-zinc-100">{doc.title}</h2>
            <p className="text-zinc-500 text-xs mt-1">
              Created on {new Date(doc.createdAt).toLocaleDateString()} • Last updated {new Date(doc.updatedAt).toLocaleDateString()}
            </p>
          </div>

          <div className="flex-1 min-h-[350px] bg-zinc-950/40 border border-zinc-900 rounded-xl p-4 flex flex-col items-center justify-center text-center">
            <div className="w-12 h-12 rounded-full bg-zinc-900/60 border border-zinc-800 flex items-center justify-center text-indigo-400 mb-3 animate-pulse">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-zinc-300">Editor Workspace</h3>
            <p className="text-zinc-500 text-sm max-w-md mx-auto mt-1 mb-4 leading-relaxed">
              This space will host the rich text cooperative editor (TipTap/Quill) with role-based UI access control, which will be implemented in **Module 3**.
            </p>
            <div className="text-xs font-semibold uppercase tracking-wider text-indigo-400 bg-indigo-500/10 px-3 py-1.5 rounded-lg border border-indigo-500/20">
              Module 3: Rich Text Editor Interface
            </div>
          </div>
        </div>

        {/* Sidebar info */}
        <div className="w-full md:w-72 flex flex-col gap-6">
          {/* Document details */}
          <div className="bg-zinc-900/20 border border-zinc-800/60 rounded-2xl p-5 backdrop-blur-md">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-4">Document Owner</h3>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center font-bold text-xs text-white">
                {doc.ownerId?.name?.slice(0, 2).toUpperCase() || "OW"}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-zinc-200 truncate">{doc.ownerId?.name}</p>
                <p className="text-xs text-zinc-500 truncate">{doc.ownerId?.email}</p>
              </div>
            </div>
          </div>

          {/* Collaborators list */}
          <div className="bg-zinc-900/20 border border-zinc-800/60 rounded-2xl p-5 backdrop-blur-md flex-1">
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-4">Collaborators</h3>
            {collaborators.length === 0 ? (
              <p className="text-zinc-500 text-xs">No collaborators added yet.</p>
            ) : (
              <div className="space-y-3">
                {collaborators.map((c) =>
                {
                  const uName = c.userId?.name || "User";
                  const uEmail = c.userId?.email || "";
                  const initials = uName.slice(0, 2).toUpperCase();

                  return (
                    <div key={c.userId?._id?.toString()} className="flex items-center justify-between bg-zinc-950/20 border border-zinc-900 rounded-xl p-2.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center font-bold text-[10px] text-zinc-400">
                          {initials}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-zinc-200 truncate">{uName}</p>
                          <p className="text-[10px] text-zinc-500 truncate">{uEmail}</p>
                        </div>
                      </div>
                      <span className="text-[9px] font-bold text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded uppercase tracking-wider">
                        {c.role}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
