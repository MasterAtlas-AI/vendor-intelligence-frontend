import { Suspense } from "react";

import { AppShell, ShellSkeleton } from "@/components/app-shell";

// The shell reads the URL and the in-memory session, so it renders on the client inside Suspense
// (required by cacheComponents for URL-dependent client hooks).
// Signed-in pages fetch their data client-side with the access token, so navigations into them can't be
// "instant" by design; opt the whole group out of Next's dev-time instant-navigation validation.
export const instant = false;

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}
