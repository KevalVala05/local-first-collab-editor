"use client";

import React from "react";
import { signOut } from "next-auth/react";

export default function LogoutButton()
{
  return (
    <button
      id="logout-btn"
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-900 border border-zinc-700 hover:border-zinc-600 text-zinc-300 hover:text-zinc-100 font-semibold py-2.5 px-4 rounded-xl transition-all cursor-pointer text-sm shadow-sm"
    >
      Sign Out
    </button>
  );
}
