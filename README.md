# vendor-intelligence-frontend

Web app for **MasterAtlas AI**, the enterprise AI vendor intelligence platform.

**Stack:** Next.js 16 (App Router, Turbopack, Cache Components) · React 19 · TypeScript · Tailwind CSS 4 · shadcn/ui (Base UI) · TanStack Query · React Hook Form + Zod · Zustand

Backend: [`../vendor-intelligence-backend`](../vendor-intelligence-backend/README.md) · Design: [`../docs`](../docs/README.md)

> This Next.js version has breaking changes compared to older releases (`proxy` instead of `middleware`, Cache Components, async request APIs). Check `node_modules/next/dist/docs/` before relying on older patterns, as [AGENTS.md](AGENTS.md) says.

---

## Status: Phase 1 (Foundation) and Phase 2 (Vendor management) done

| Area | Screens |
|---|---|
| Vendors (Phase 2) | **Vendor search** over the shared knowledge base: free text, country, equipment and service category (tree, includes sub-categories), certification, industry and your own AVL status. **Vendor page**: overview, equipment, services, certifications, projects, locations and sources. **Your organization** card: add the vendor to your list and keep your own AVL status, vendor code, tags and notes (private to your organization) |
| My vendors (Phase 2) | Your organization's own vendor list, with the same filters |
| Imports (Phase 2) | **Excel/CSV**: upload, choose sheet and header row, map columns (suggested automatically), live preview of what each row will do, then a background import with live progress and a per-row report (filter by outcome, download CSV). **PDF**: upload a vendor document, say whose it is (suggested name and website, or pick an existing vendor), untick wrong facts (each with page, snippet and confidence), then import. The imports page lists past imports and what you sent for review |
| Approvals (Phase 2, curators) | Queue of proposals by status, kind and source. Review page: every item with its evidence, approve or reject per item (rejection needs a reason), ask for more information, edit an item before approving, decision history |
| Sign-in | Login, forgot password, reset password, accept invitation (set password). Session restore on reload, silent token refresh, sign out / sign out everywhere |
| Workspace | Dashboard (access summary, recent jobs), background jobs list, job detail with **live progress** (Server-Sent Events) and cancel |
| Settings | My profile (name, change password), Organization, Users & roles (search, filter, invite, change roles, disable/enable), API keys (create with scopes, expiry and IP allow-list; secret shown once; revoke), Audit log (filter by action and date, expandable details) |
| Platform (super admin) | Tenants (create with first admin invite, edit plan/trust, suspend/activate, **view as tenant**), platform audit log, diagnostics job |

Menus and pages only appear when you have the permission for them. The API enforces every permission regardless of what the UI shows.

---

## How it talks to the backend

```
Browser ──► Next.js (this app) ──/api/v1/*──► FastAPI backend (BACKEND_URL)
```

- **Same-origin proxy.** `next.config.ts` rewrites `/api/v1/*` to `BACKEND_URL`. The browser only ever calls this app's own origin, so there's no CORS setup, and the refresh cookie works the same locally and on Render.
- **Tokens:**
  - The **access token** (15 min) lives only in memory (Zustand), never in `localStorage`.
  - The **refresh token** is an httpOnly cookie scoped to `/api/v1/auth`.
  - On page load, `SessionBootstrap` calls `/auth/refresh` to restore the session.
  - When an access token expires, the API client ([src/lib/api/client.ts](src/lib/api/client.ts)) refreshes once (shared across concurrent requests) and retries.
- **View as tenant.** A super admin can view the app as a tenant. The app then sends `X-Act-As-Tenant`, shows a banner, and clears all cached data when switching, so tenants' data never mixes.
- **Live job progress.** [src/lib/api/sse.ts](src/lib/api/sse.ts) reads the SSE stream with `fetch`, because `EventSource` can't send the `Authorization` header. The backend marks the stream `Cache-Control: no-transform`; without it the production Next server gzips the proxied stream and nothing arrives until the job ends.
- **Proxy timeout.** `experimental.proxyTimeout` is raised to 120 s: the rewrite otherwise answers 500 after 30 s even when the backend then succeeds (large uploads, big approvals on slow links).
- **Typed API.** [src/lib/api/schema.d.ts](src/lib/api/schema.d.ts) is generated from the backend's OpenAPI schema. Friendly aliases are in [src/lib/api/types.ts](src/lib/api/types.ts).

---

## Local setup

Requires Node.js 20+ (tested with 24) and the backend running (see its README).

```bash
npm install
copy .env.example .env.local
npm run dev
```

Open http://localhost:3000 and sign in with a user from the backend (for example the Super Admin created with `python -m app.cli create-platform-user`).

`BACKEND_URL` in `.env.local` defaults to `http://localhost:8000`.

### After the backend API changes

```bash
npm run api:export
npm run api:types
npm run typecheck
```

`api:export` writes `openapi.json` from the backend code (no database needed). `api:types` regenerates the TypeScript types, and `typecheck` then shows every place the UI must adapt.

### Quality checks

```bash
npm run lint
npm run typecheck
npm run build
```

### CI (GitHub Actions)

[.github/workflows/ci.yml](.github/workflows/ci.yml) runs `npm ci`, lint, type check and a production build on every push to `main` and on pull requests.

---

## Deploying to Render

| Setting | Value |
|---|---|
| Service type | Web Service (Node) |
| Build command | `npm ci && npm run build` |
| Start command | `npm run start -- --port $PORT` |
| Environment | `BACKEND_URL` = the backend service's URL (Render internal URL, e.g. `http://masteratlas-api:10000`, or its public `https://…onrender.com`) |

The backend's `FRONTEND_URL` must point at this app, because invite and reset emails link to `/accept-invite` and `/reset-password`.

The proxy makes the refresh cookie first-party, so the backend's default `REFRESH_COOKIE_SAMESITE=strict` works even on `*.onrender.com` hosts.

---

## Project layout

```
src/
  app/
    (auth)/          login · forgot-password · reset-password · accept-invite
    (app)/           signed-in area (layout = Suspense + AppShell)
      dashboard/ · jobs/ · jobs/[id]/   (each: page.tsx server entry + view.tsx client UI)
      vendors/ · vendors/[id]/ · my-vendors/
      imports/ · imports/new/ · imports/[id]/
      settings/      profile · organization · users · api-keys · audit-log
      admin/         tenants · audit-logs · proposals · proposals/[id]
  components/
    ui/              shadcn/ui primitives (Base UI); regenerate with `npx shadcn add …`
    app-shell.tsx    route guard, sidebar, header, view-as-tenant banner
    app-sidebar.tsx  permission-aware navigation and user menu
    vendors/         vendor table, search, facts tabs, "your organization" dialog
    imports/         upload, spreadsheet-mapping and PDF steps of the import wizard
    …                shared form, table, dialog and badge helpers
  lib/
    api/             client (auth + refresh), SSE reader, generated schema, type aliases
    auth/            session store, permission helpers
    validation.ts    shared Zod rules (password policy mirrors the backend)
  hooks/
```

### Conventions

- **Signed-in pages are Client Components.** They fetch data with TanStack Query through `api()`, because the session lives in browser memory. The `(app)` layout wraps them in `<Suspense>` (required by Cache Components for URL-reading hooks). Each route is a thin server `page.tsx` that sets `export const instant = false` and re-exports the client `view.tsx`, because `instant` is per segment and can't be exported from a Client Component.
- **Query keys** include the "view as" tenant where the data is tenant-specific. Switching tenant always calls `queryClient.clear()`.
- **Base UI composition** uses the `render` prop (e.g. `<DropdownMenuTrigger render={<Button />}>`), not Radix's `asChild`.
- **Checkboxes** need an explicit `aria-label`: Base UI renders them as `<span role="checkbox">`, so a wrapping `<label>` doesn't name them.
- **Mutations** show a toast on success or error. Destructive actions go through `ConfirmDialog`.
- **Route state survives navigation.** With Cache Components, Next keeps visited routes mounted in the background, so component state (e.g. a half-finished import wizard) is still there when you come back. Reset it explicitly where that would confuse (the wizard clears itself once an import starts), and never let a background route act on its own (the login page only redirects while it's the current URL).

---

## Known gaps

- No automated UI tests yet (Playwright is planned). Phase 1 and Phase 2 screens were checked manually in a browser (production build) against a test database.
- `npm run api:export` uses a Unix-style path and fails in Windows `cmd`; run `..endor-intelligence-backend.venvScriptspython -m app.cli export-openapi --output ../vendor-intelligence-frontend/openapi.json` from the backend folder instead.
- Platform staff can't edit their own name in the UI, because profile edits go through the tenant user API. Use the backend CLI for that.
- The dev server logs `ERR_ABORTED` for some requests. This is React's development-only double-mount cancelling the first fetch, and doesn't happen in production builds.
