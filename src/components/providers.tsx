"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useEffect, useState } from "react";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ApiError, refreshSession } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/store";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        // Don't hammer the API on auth/permission/not-found errors; retry transient ones once.
        retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 1,
      },
    },
  });
}

/** Restores the session from the refresh cookie once per page load. */
function SessionBootstrap() {
  useEffect(() => {
    if (useAuth.getState().status === "loading") void refreshSession();
  }, []);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(makeQueryClient);
  const status = useAuth((s) => s.status);

  // Signed out (expired session, logout elsewhere): drop every cached query so no data outlives the session.
  useEffect(() => {
    if (status === "anonymous") queryClient.clear();
  }, [status, queryClient]);

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <SessionBootstrap />
          {children}
          <Toaster richColors closeButton />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
