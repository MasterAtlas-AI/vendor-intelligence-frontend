import { create } from "zustand";

import type { CurrentUser } from "@/lib/api/types";

export type AuthStatus = "loading" | "authenticated" | "anonymous";

export interface ActAsTenant {
  id: string;
  name: string;
}

interface AuthState {
  status: AuthStatus;
  // The access token lives in memory only (never localStorage), so XSS can't lift a long-lived credential.
  // The refresh token is an httpOnly cookie the browser sends to /api/v1/auth/refresh.
  accessToken: string | null;
  user: CurrentUser | null;
  // Super admins can view the app as a tenant; sent as X-Act-As-Tenant on every request.
  actAs: ActAsTenant | null;
  setSession: (accessToken: string, user: CurrentUser) => void;
  setAccessToken: (accessToken: string) => void;
  clearSession: () => void;
  setActAs: (tenant: ActAsTenant | null) => void;
}

const ACT_AS_KEY = "mai.actAs";

function loadActAs(): ActAsTenant | null {
  try {
    const raw = typeof window === "undefined" ? null : window.sessionStorage.getItem(ACT_AS_KEY);
    return raw ? (JSON.parse(raw) as ActAsTenant) : null;
  } catch {
    return null;
  }
}

function saveActAs(tenant: ActAsTenant | null) {
  try {
    if (tenant) window.sessionStorage.setItem(ACT_AS_KEY, JSON.stringify(tenant));
    else window.sessionStorage.removeItem(ACT_AS_KEY);
  } catch {
    // Storage unavailable (private mode): impersonation just won't survive a reload.
  }
}

export const useAuth = create<AuthState>((set) => ({
  status: "loading",
  accessToken: null,
  user: null,
  actAs: loadActAs(),
  setSession: (accessToken, user) => set({ status: "authenticated", accessToken, user }),
  setAccessToken: (accessToken) => set({ accessToken }),
  clearSession: () => {
    saveActAs(null);
    set({ status: "anonymous", accessToken: null, user: null, actAs: null });
  },
  setActAs: (tenant) => {
    saveActAs(tenant);
    set({ actAs: tenant });
  },
}));
