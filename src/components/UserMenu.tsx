"use client";

import React, { useState, useRef, useEffect } from "react";
import { signOut } from "next-auth/react";

interface Props
{
  user: {
    name?: string | null;
    email?: string | null;
  };
}

export default function UserMenu({ user }: Props)
{
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() =>
  {
    const handleClickOutside = (event: MouseEvent) =>
    {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node))
      {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () =>
    {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const name = user.name || "User";
  const email = user.email || "";
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div
      ref={dropdownRef}
      className="relative"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      {/* Trigger button */}
      <button
        id="user-menu-trigger"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-3 px-3 py-1.5 rounded-xl hover:bg-zinc-850 active:bg-zinc-900 transition-all border border-transparent hover:border-zinc-800 cursor-pointer outline-none group text-left"
      >
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center font-bold text-sm text-white shadow-md shadow-indigo-500/20 group-hover:scale-105 transition-transform duration-200">
          {initials}
        </div>
        <div className="hidden sm:block select-none">
          <p className="text-sm font-semibold text-zinc-200 leading-tight group-hover:text-zinc-100 transition-colors">
            {name}
          </p>
          <p className="text-xs text-zinc-500 leading-none mt-0.5">
            Account Owner
          </p>
        </div>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          id="user-menu-dropdown"
          className="absolute right-0 mt-2 w-56 bg-zinc-900/90 backdrop-blur-xl border border-zinc-800/80 rounded-2xl p-2 shadow-2xl z-50 origin-top-right"
        >
          {/* User Details */}
          <div className="px-4 py-3 select-none">
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              Signed in as
            </p>
            <p className="text-sm font-bold text-zinc-200 truncate mt-1">
              {name}
            </p>
            {email && (
              <p className="text-xs text-zinc-400 truncate mt-0.5">
                {email}
              </p>
            )}
          </div>

          <div className="h-[1px] bg-zinc-850 my-2" />

          {/* Action Button */}
          <button
            id="user-menu-logout-btn"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="w-full text-left px-4 py-2.5 text-sm font-medium text-red-400 hover:bg-red-500/10 active:bg-red-500/20 rounded-xl transition-all cursor-pointer flex items-center gap-2"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
              />
            </svg>
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}
