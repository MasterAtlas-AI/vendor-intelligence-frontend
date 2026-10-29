"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Eye, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { AppSidebar } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { refreshSession } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/store";

export function ShellSkeleton() {
  return (
    <div className="flex min-h-svh items-center justify-center p-8">
      <div className="grid w-full max-w-md gap-3">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
    </div>
  );
}

function ActingAsBanner() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { actAs, setActAs } = useAuth();
  if (!actAs) return null;
  return (
    <div className="flex items-center gap-2 border-b bg-amber-100 px-4 py-2 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-100">
      <Eye className="size-4" />
      <span>
        Viewing as <strong>{actAs.name}</strong>. Every change you make is recorded in that tenant&apos;s audit log.
      </span>
      <Button
        size="xs"
        variant="outline"
        className="ml-auto"
        onClick={() => {
          setActAs(null);
          queryClient.clear();
          router.push("/admin/tenants");
        }}
      >
        <X /> Exit
      </Button>
    </div>
  );
}

/** Signed-in chrome: route guard, sidebar, header. Client-only because the session lives in memory. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const status = useAuth((s) => s.status);

  const wasSignedIn = useRef(false);

  useEffect(() => {
    const toLogin = () => router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    if (status === "authenticated") wasSignedIn.current = true;
    if (status !== "anonymous") return;
    if (!wasSignedIn.current || useAuth.getState().signedOut) {
      toLogin();
      return;
    }
    // Signed out mid-session (e.g. a refresh lost a race with another request or tab): try the refresh cookie
    // once before sending the user to the login page, so they stay on the page they were opening.
    wasSignedIn.current = false;
    void refreshSession().then((ok) => {
      if (!ok) toLogin();
    });
  }, [status, pathname, router]);

  if (status !== "authenticated") return <ShellSkeleton />;

  return (
    <SidebarProvider>
      <AppSidebar />
      {/* min-w-0: let wide tables scroll inside their own container instead of widening the page. */}
      <SidebarInset className="min-w-0">
        <ActingAsBanner />
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <span className="text-sm text-muted-foreground">MasterAtlas AI</span>
        </header>
        <div className="flex-1 p-4 md:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
