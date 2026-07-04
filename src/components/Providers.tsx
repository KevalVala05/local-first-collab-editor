"use client";

import React, { useState } from "react";
import { SessionProvider } from "next-auth/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastContainer } from "react-toastify";
import { SyncProvider } from "@/context/SyncContext";
import "react-toastify/dist/ReactToastify.css";

interface Props
{
  children: React.ReactNode;
}

export default function Providers({ children }: Props)
{
  const [queryClient] = useState(
    () =>
    {
      return new QueryClient(
        {
          defaultOptions: {
            queries: {
              refetchOnWindowFocus: false,
              retry: false,
            },
          },
        }
      );
    }
  );

  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        <SyncProvider>
          {children}
          <ToastContainer
            position="bottom-right"
            autoClose={3000}
            hideProgressBar={false}
            newestOnTop={false}
            closeOnClick
            rtl={false}
            pauseOnFocusLoss
            draggable
            pauseOnHover
            theme="dark"
          />
        </SyncProvider>
      </QueryClientProvider>
    </SessionProvider>
  );
}
