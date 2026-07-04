"use client";

import React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { registerSchema } from "@/validation/auth";
import { registerUser } from "@/services/authService";
import { z } from "zod";

type RegisterInput = z.infer<typeof registerSchema>;

export default function RegisterPage()
{
  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterInput>(
    {
      resolver: zodResolver(registerSchema),
    }
  );

  const { mutate, error, isPending } = useMutation(
    {
      mutationFn: registerUser,
      onSuccess: () =>
      {
        router.push("/login?registered=true");
      },
    }
  );

  const onSubmit = (data: RegisterInput) =>
  {
    mutate(data);
  };

  const errorMessage = error instanceof Error ? error.message : "";

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-white font-sans px-4 relative overflow-hidden">
      {/* Background visual graphics */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-indigo-900/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-violet-900/20 rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-md bg-zinc-900/40 backdrop-blur-xl border border-zinc-800/80 rounded-2xl p-8 shadow-2xl z-10">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">
            Create an Account
          </h1>
          <p className="text-zinc-400 mt-2 text-sm">
            Sign up to start editing and collaborating in real-time
          </p>
        </div>

        {errorMessage && (
          <div className="mb-6 p-4 bg-red-900/20 border border-red-500/30 rounded-xl text-red-400 text-sm flex items-center gap-2">
            <span className="font-semibold">Error:</span> {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div>
            <label htmlFor="name-input" className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-2">
              Full Name
            </label>
            <input
              id="name-input"
              type="text"
              {...register("name")}
              className="w-full bg-zinc-900/60 border border-zinc-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-4 py-3 text-zinc-100 placeholder-zinc-500 transition-all outline-none text-sm"
              placeholder="John Doe"
            />
            {errors.name && (
              <p className="text-red-400 text-xs mt-1.5 ml-1">{errors.name.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="email-input" className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-2">
              Email Address
            </label>
            <input
              id="email-input"
              type="email"
              {...register("email")}
              className="w-full bg-zinc-900/60 border border-zinc-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-4 py-3 text-zinc-100 placeholder-zinc-500 transition-all outline-none text-sm"
              placeholder="you@example.com"
            />
            {errors.email && (
              <p className="text-red-400 text-xs mt-1.5 ml-1">{errors.email.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="password-input" className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-2">
              Password
            </label>
            <input
              id="password-input"
              type="password"
              {...register("password")}
              className="w-full bg-zinc-900/60 border border-zinc-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-4 py-3 text-zinc-100 placeholder-zinc-500 transition-all outline-none text-sm"
              placeholder="••••••••"
            />
            {errors.password && (
              <p className="text-red-400 text-xs mt-1.5 ml-1">{errors.password.message}</p>
            )}
          </div>

          <button
            id="register-submit-btn"
            type="submit"
            disabled={isPending}
            className="w-full bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-50 text-white font-semibold py-3 px-4 rounded-xl transition-all shadow-lg hover:shadow-indigo-500/20 cursor-pointer text-sm"
          >
            {isPending ? "Creating Account..." : "Register"}
          </button>
        </form>

        <div className="mt-8 text-center border-t border-zinc-800/80 pt-6">
          <p className="text-zinc-400 text-sm">
            Already have an account?{" "}
            <Link
              id="goto-login-link"
              href="/login"
              className="text-indigo-400 hover:text-indigo-300 font-semibold transition-all"
            >
              Sign In
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
