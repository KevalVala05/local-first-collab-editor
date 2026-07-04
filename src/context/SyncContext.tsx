"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { localDb } from "@/lib/localDb";
import api from "@/lib/api";

export type SyncStatus = "online" | "offline" | "syncing" | "error";

interface SyncContextType
{
  syncStatus: SyncStatus;
  isOnline: boolean;
  triggerSync: () => Promise<void>;
}

const SyncContext = createContext<SyncContextType | undefined>(undefined);

async function pingServer(): Promise<boolean>
{
  try
  {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () =>
      {
        controller.abort();
      },
      3000
    );

    const res = await fetch(
      "/api/auth/session",
      {
        method: "GET",
        signal: controller.signal,
        headers: { "Cache-Control": "no-cache" },
      }
    );
    clearTimeout(timeoutId);
    return res.ok;
  }
  catch
  {
    return false;
  }
}

export function SyncProvider({ children }: { children: React.ReactNode })
{
  const queryClient = useQueryClient();
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("online");

  const syncQueue = useCallback(
    async () =>
    {
      const items = await localDb.outbox.orderBy("timestamp").toArray();
      if (items.length === 0)
      {
        return;
      }

      setSyncStatus("syncing");

      for (const item of items)
      {
        try
        {
          if (item.action === "create_document")
          {
            const res = await api.post(
              "/documents",
              {
                title: item.payload.title,
              }
            );
            const serverDoc = res.data.data;

            // Update local DB: replace local_xxx with real mongo _id
            const localDoc = await localDb.documents.get(item.documentId);
            if (localDoc)
            {
              await localDb.documents.put(
                {
                  _id: serverDoc._id,
                  title: serverDoc.title,
                  content: localDoc.content || "",
                  ownerId: serverDoc.ownerId,
                  collaborators: serverDoc.collaborators || [],
                  updatedAt: serverDoc.updatedAt,
                  createdAt: serverDoc.createdAt,
                  syncStatus: "synced",
                }
              );
              await localDb.documents.delete(item.documentId);
            }

            // Update any other pending outbox actions targeting this temp ID to point to the new ID
            const dependentItems = await localDb.outbox
              .where("documentId")
              .equals(item.documentId)
              .toArray();

            for (const dep of dependentItems)
            {
              if (dep.id !== undefined && dep.id !== item.id)
              {
                dep.documentId = serverDoc._id;
                await localDb.outbox.put(dep);
              }
            }

            // Delete current item from outbox
            if (item.id !== undefined)
            {
              await localDb.outbox.delete(item.id);
            }

            // Emit redirection event for workspace active sessions
            window.dispatchEvent(
              new CustomEvent(
                "document_created_sync",
                {
                  detail: {
                    oldId: item.documentId,
                    newId: serverDoc._id,
                  },
                }
              )
            );
          }
          else if (item.action === "update_content")
          {
            await api.patch(
              `/documents/${item.documentId}`,
              {
                content: item.payload.content,
              }
            );

            const localDoc = await localDb.documents.get(item.documentId);
            if (localDoc)
            {
              localDoc.syncStatus = "synced";
              await localDb.documents.put(localDoc);
            }

            if (item.id !== undefined)
            {
              await localDb.outbox.delete(item.id);
            }
          }
          else if (item.action === "rename_document")
          {
            await api.patch(
              `/documents/${item.documentId}`,
              {
                title: item.payload.title,
              }
            );

            const localDoc = await localDb.documents.get(item.documentId);
            if (localDoc)
            {
              localDoc.syncStatus = "synced";
              await localDb.documents.put(localDoc);
            }

            if (item.id !== undefined)
            {
              await localDb.outbox.delete(item.id);
            }
          }
          else if (item.action === "delete_document")
          {
            await api.delete(`/documents/${item.documentId}`);

            if (item.id !== undefined)
            {
              await localDb.outbox.delete(item.id);
            }
          }
        }
        catch (err: unknown)
        {
          console.error(`Sync error on outbox item ${item.id}`, err);

          // Network errors should pause sync loop
          const errObj = err as { status?: number; response?: unknown };
          const isNetworkError = !errObj.status && !errObj.response;
          if (isNetworkError)
          {
            setSyncStatus("error");
            return;
          }

          // Discard items with invalid parameters to prevent blockages
          if (item.id !== undefined)
          {
            await localDb.outbox.delete(item.id);
          }
        }
      }

      setSyncStatus("online");
      queryClient.invalidateQueries(
        {
          queryKey: ["documents"],
        }
      );
    },
    [queryClient]
  );

  useEffect(
    () =>
    {
      let active = true;

      async function checkConnection()
      {
        const online = await pingServer();
        if (!active)
        {
          return;
        }

        if (online)
        {
          if (syncStatus === "offline" || syncStatus === "error")
          {
            setSyncStatus("online");
            syncQueue();
          }
        }
        else
        {
          setSyncStatus("offline");
        }
      }

      checkConnection();

      const handleOnline = () =>
      {
        setSyncStatus("online");
        syncQueue();
      };

      const handleOffline = () =>
      {
        setSyncStatus("offline");
      };

      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);

      const intervalId = setInterval(checkConnection, 15000);

      // Trigger sync initially if online — wrapped in setTimeout to avoid
      // calling setState synchronously within the effect body
      if (typeof window !== "undefined" && navigator.onLine)
      {
        setTimeout(() => syncQueue(), 0);
      }

      return () =>
      {
        active = false;
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
        clearInterval(intervalId);
      };
    },
    [syncStatus, syncQueue]
  );

  const isOnline = syncStatus === "online" || syncStatus === "syncing";

  return (
    <SyncContext.Provider
      value={
        {
          syncStatus,
          isOnline,
          triggerSync: syncQueue,
        }
      }
    >
      {children}
    </SyncContext.Provider>
  );
}

export function useSync()
{
  const context = useContext(SyncContext);
  if (context === undefined)
  {
    throw new Error("useSync must be used within a SyncProvider");
  }
  return context;
}
