"use client";

import { useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { api } from "@/lib/api/client";
import type { CursorPage, TenantAdminRead } from "@/lib/api/types";
import { P, useCan } from "@/lib/auth/permissions";
import { useAuth } from "@/lib/auth/store";
import { errorMessage } from "@/lib/validation";

export const TENANT_PARAM = "tenant";

/** The tenant a super admin is viewing as, kept in the URL (`/vendors?tenant=spog`) so the address shows whose
 *  data this is, and a copied link or a new tab opens the same tenant's view.
 *
 *  The session's act-as choice stays the source of truth for requests (the X-Act-As-Tenant header); this keeps
 *  the URL in step with it: links inside the app drop the parameter and it is put back, and a URL that names a
 *  different tenant switches to that tenant (platform staff only; for anyone else it is removed). */
export function TenantInUrl() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const canManage = useCan(P.TENANT_MANAGE);
  const actAs = useAuth((s) => s.actAs);
  const setActAs = useAuth((s) => s.setActAs);
  const wanted = params.get(TENANT_PARAM);
  const resolving = useRef<string | null>(null);
  const previous = useRef(actAs);

  useEffect(() => {
    const current = actAs ? (actAs.slug ?? actAs.id) : null;
    // The tenant was just chosen (or left) by the page itself, which navigates next ("View as" goes to the
    // dashboard, "Exit" to the tenant list): don't rewrite the URL of the page being left.
    const justChanged = previous.current !== actAs;
    previous.current = actAs;
    if (justChanged) return;
    const replaceParam = (value: string | null) => {
      const query = new URLSearchParams(window.location.search);
      if (value) query.set(TENANT_PARAM, value);
      else query.delete(TENANT_PARAM);
      const qs = query.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    };

    if (wanted && wanted !== current) {
      if (!canManage) {
        replaceParam(current); // only platform staff can view as a tenant
        return;
      }
      if (resolving.current === wanted) return;
      resolving.current = wanted;
      api<CursorPage<TenantAdminRead>>("/admin/tenants", { query: { q: wanted, limit: 25 } })
        .then((page) => {
          const tenant = page.items.find((t) => t.slug === wanted || t.id === wanted);
          if (!tenant) {
            toast.error(`No tenant "${wanted}"`);
            replaceParam(current);
            return;
          }
          queryClient.clear(); // never mix one tenant's cached data with another's
          setActAs({ id: tenant.id, name: tenant.name, slug: tenant.slug });
        })
        .catch((e: unknown) => {
          toast.error(errorMessage(e));
          replaceParam(current);
        })
        .finally(() => {
          resolving.current = null;
        });
      return;
    }
    if (!wanted && current) replaceParam(current);
  }, [wanted, actAs, canManage, pathname, queryClient, router, setActAs]);

  return null;
}
