import React from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { redirect } from "next/navigation";
import LogoutButton from "@/components/LogoutButton";

export default async function DashboardPage()
{
  const session = await getServerSession(authOptions);

  if (!session)
  {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white font-sans flex flex-col">
      <header className="border-b border-zinc-800/80 bg-zinc-900/20 backdrop-blur-md px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">
          Collaborative Editor
        </h1>
        <div className="flex items-center gap-4">
          <span className="text-zinc-400 text-sm hidden sm:inline">
            Logged in as <strong className="text-zinc-200">{session.user?.name || session.user?.email}</strong>
          </span>
          <LogoutButton />
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-6 py-12">
        <div className="bg-zinc-900/30 border border-zinc-800/80 rounded-2xl p-8 backdrop-blur-xl">
          <h2 className="text-2xl font-extrabold tracking-tight mb-4">
            Welcome to your Dashboard, {session.user?.name}!
          </h2>
          <p className="text-zinc-400 text-sm leading-relaxed mb-6">
            This is the starting point for your document collaborative editing workspace. In the next modules, we'll build full Document CRUD features, collaborative workspaces, and local-first offline synchronization.
          </p>

          <div className="border border-dashed border-zinc-800 rounded-xl p-8 text-center bg-zinc-950/20">
            <h3 className="text-lg font-bold text-zinc-300 mb-2">No documents found</h3>
            <p className="text-zinc-500 text-sm max-w-md mx-auto mb-4">
              Get started by creating your first collaborative document once Module 2 features are implemented.
            </p>
            <button
              id="create-doc-btn-disabled"
              disabled
              className="bg-zinc-800 text-zinc-500 font-semibold py-2.5 px-5 rounded-xl text-sm border border-zinc-850 cursor-not-allowed"
            >
              + Create Document (Module 2)
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
