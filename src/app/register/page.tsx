"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { registerSchema } from "@/validation/auth";
import { registerUser } from "@/services/authService";
import { z } from "zod";
import { toast } from "react-toastify";

type RegisterInput = z.infer<typeof registerSchema>;

export default function RegisterPage()
{
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterInput>(
    {
      resolver: zodResolver(registerSchema),
    }
  );

  const { mutate, isPending } = useMutation(
    {
      mutationFn: registerUser,
      onSuccess: () =>
      {
        toast.success("Account created successfully! Please sign in.");
        router.push("/login?registered=true");
      },
      onError: (err: any) =>
      {
        toast.error(err.message || "An unexpected error occurred");
      },
    }
  );

  const onSubmit = (data: RegisterInput) =>
  {
    mutate(data);
  };

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
            <div className="relative">
              <input
                id="password-input"
                type={showPassword ? "text" : "password"}
                {...register("password")}
                className="w-full bg-zinc-900/60 border border-zinc-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl pl-4 pr-11 py-3 text-zinc-100 placeholder-zinc-500 transition-all outline-none text-sm"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 transition-colors focus:outline-none cursor-pointer p-1"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
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
