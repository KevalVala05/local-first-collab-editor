import React from "react";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export default async function Home()
{
  const session = await getServerSession(authOptions);

  return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-zinc-950 text-white font-sans px-6 relative overflow-hidden">
      {/* Glow graphics */}
      <div className="absolute top-[-30%] left-[-20%] w-[70%] h-[70%] bg-indigo-900/25 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-[-30%] right-[-20%] w-[70%] h-[70%] bg-violet-900/25 rounded-full blur-[140px] pointer-events-none" />

      <main className="text-center max-w-2xl z-10 flex flex-col items-center gap-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-400 text-xs font-semibold tracking-wide uppercase">
          ⚡ Local-First Collaborative Engine
        </div>

        <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight leading-tight">
          Real-Time Editing,{" "}
          <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
            Offline Synchronization.
          </span>
        </h1>

        <p className="text-zinc-400 text-lg leading-relaxed max-w-lg">
          Create, edit, and collaborate on rich documents with instant server state synchronization, built-in MongoDB security, and offline support.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 mt-4 w-full justify-center">
          {session ? (
            <Link
              id="dashboard-btn"
              href="/dashboard"
              className="bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-semibold py-3 px-8 rounded-xl transition-all shadow-lg hover:shadow-indigo-500/20 text-center text-sm"
            >
              Go to Dashboard
            </Link>
          ) : (
            <>
              <Link
                id="login-btn"
                href="/login"
                className="bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-semibold py-3 px-8 rounded-xl transition-all shadow-lg hover:shadow-indigo-500/20 text-center text-sm"
              >
                Sign In
              </Link>
              <Link
                id="register-btn"
                href="/register"
                className="bg-zinc-900 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-850 active:bg-zinc-900 text-zinc-300 hover:text-white font-semibold py-3 px-8 rounded-xl transition-all text-center text-sm"
              >
                Create Account
              </Link>
            </>
          )}
        </div>
      </main>

      <footer className="absolute bottom-6 text-zinc-650 text-xs tracking-wider uppercase font-medium">
        House of EdTech Assignment v2.1
      </footer>
    </div>
  );
}
