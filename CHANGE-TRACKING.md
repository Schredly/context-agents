# Change Tracking

This file tracks all changes made to the codebase. Each entry includes a sequential number, timestamp, and detailed summary suitable for syncing context with GPT.

---

## #001 — 2026-03-01 — Initial Project Setup

**What happened:**
- Created the project repository at `context-agents/context-agents/`.
- Added the `ai-context/` folder containing 13 architecture and planning documents (00_README through 12_GPT_CONTEXT_WINDOW) that define the Simplified MVP for the Self-Correcting Agentic System.
- Extracted the UI source code from a zip file into `src/`.

**Current project structure:**
```
context-agents/
├── ai-context/               # 13 planning/architecture docs
│   ├── 00_README.md
│   ├── 01_MVP_PRODUCT_SPEC.md
│   ├── 02_ARCHITECTURE.md
│   ├── 03_DATA_MODEL.md
│   ├── 04_WIZARD_UI.md
│   ├── 05_SERVICE_NOW_INTEGRATION.md
│   ├── 06_GOOGLE_DRIVE_SCAFFOLDING.md
│   ├── 07_AGENT_ORCHESTRATION.md
│   ├── 08_PROMPTING_AND_ROUTING.md
│   ├── 09_EVALUATION_AND_FEEDBACK.md
│   ├── 10_SPRINT_PLAN.md
│   ├── 11_CLAUDE_GROUND_RULES.md
│   └── 12_GPT_CONTEXT_WINDOW.md
├── src/
│   ├── app/
│   │   ├── App.tsx                      # Root component, renders RouterProvider
│   │   ├── routes.tsx                   # React Router config: /tenants, /tenants/setup, /tenants/setup/:id, /runs, /settings
│   │   ├── components/
│   │   │   ├── Sidebar.tsx              # Left nav: Tenants, Runs, Settings (disabled)
│   │   │   ├── TopBar.tsx               # Top bar with tenant selector dropdown + status badge
│   │   │   ├── SetupStepper.tsx         # Vertical stepper component for wizard steps
│   │   │   ├── figma/
│   │   │   │   └── ImageWithFallback.tsx
│   │   │   └── ui/                      # ~40 shadcn/ui components (button, card, dialog, table, tabs, select, etc.)
│   │   ├── data/
│   │   │   └── mockData.ts             # TypeScript interfaces + mock data for Tenant, Run, Skill, RunResult
│   │   ├── layouts/
│   │   │   └── DashboardLayout.tsx      # Shell: Sidebar + TopBar + <Outlet />
│   │   └── pages/
│   │       ├── TenantsPage.tsx          # Tenant list table with create/delete/open-setup actions
│   │       ├── SetupWizardPage.tsx      # 6-step wizard: Create Tenant → ServiceNow → Schema → Drive → Scaffold → Activate
│   │       └── RunsPage.tsx             # Split-pane: run list (left) + run detail with skills timeline + result panel (right)
│   └── styles/
│       ├── index.css                    # Imports fonts, tailwind, theme
│       ├── tailwind.css                 # Tailwind v4 config with tw-animate-css
│       ├── theme.css                    # CSS custom properties for light/dark themes, base typography
│       └── fonts.css                    # Empty (placeholder)
└── CHANGE-TRACKING.md                   # This file
```

**Key technical details:**
- **Framework:** React with React Router (v7 style — `createBrowserRouter`, `RouterProvider`)
- **Styling:** Tailwind CSS v4 + shadcn/ui component library (Radix primitives)
- **State:** Local React state + module-level mock data (no state management library yet)
- **Mock data:** 3 tenants (Acme Corp/Active, TechStart Inc/Active, Global Dynamics/Draft), 3 runs with skill chains (Validate → Retrieve Docs → Synthesize → Writeback → Record Outcome)
- **No backend yet** — all data is hardcoded in `mockData.ts`
- **No build tooling configured yet** — no package.json, vite config, or tsconfig in the repo

**What GPT should know for next steps:**
- The UI skeleton matches Sprint 1 from `10_SPRINT_PLAN.md`: Tenants list, Setup Wizard, Runs Console
- The wizard has 6 steps matching `04_WIZARD_UI.md`: Create Tenant → Configure ServiceNow → Classification Schema → Google Drive → Scaffold Drive → Activate
- The runs page shows the skill chain from `07_AGENT_ORCHESTRATION.md` with expandable reasoning per skill
- All pages currently use mock data — the next major milestone is wiring to a FastAPI backend
- The TopBar tenant selector uses `window.location.reload()` for tenant switching (will need proper state management)
- No build infrastructure exists yet (needs package.json, vite/next config, tsconfig)

---

## #002 — 2026-03-02 — Real Google Drive Integration

**What happened:**
Replaced the mock Google Drive integration in the Setup Wizard with a fully functional Google OAuth + Drive API implementation. The wizard now authenticates users via Google, verifies Drive folder access, and creates a real recursive folder scaffold in Google Drive. Also replaced the flat classification schema with a hierarchical tree editor supporting up to 4 levels of nesting.

**New files created:**

- `src/app/auth/gis.d.ts` — TypeScript type declarations for the Google Identity Services (GIS) library. Declares the `google.accounts.oauth2` global namespace including `TokenClientConfig`, `TokenResponse`, `TokenClient`, `initTokenClient()`, and `revoke()`.

- `src/app/auth/google-auth.ts` — Low-level wrapper around the GIS token client. Manages module-level state (`accessToken`, `expiresAt`, `tokenClient`). Exports `initGoogleAuth(clientId)`, `requestAccessToken()` (wraps the callback-based GIS popup in a Promise), `getAccessToken()` (returns token if valid, null if expired), and `signOut()` (revokes token). Scope: `drive openid email`. No npm packages — uses the GIS script loaded in index.html. Token is in-memory only (no localStorage).

- `src/app/auth/GoogleAuthContext.tsx` — React context + provider that wraps the app. Exposes `isAuthenticated`, `accessToken`, `userEmail`, `signIn()`, `signOut()`, `isInitialized`, `initError`, `configureClientId()`, and `needsClientId`. On mount, waits for the GIS script to load, then initializes with the client ID from `VITE_GOOGLE_CLIENT_ID` env var. If the env var is missing, `needsClientId` is set to `true` so the UI can show a manual client ID input field. The `configureClientId()` method allows entering the client ID at runtime via the browser UI. Uses `AbortController` for proper cleanup on unmount (important for React StrictMode). The `useGoogleAuth()` hook returns a safe fallback object instead of throwing if the provider is missing — this prevents app crashes.

- `src/app/services/google-drive.ts` — Fetch-based Drive API service with no npm dependencies. Exports:
  - `testDriveFolder(accessToken, folderId)` — GET `/drive/v3/files/{folderId}`, verifies it's a folder, returns the folder name
  - `ensureFolder(accessToken, name, parentId)` — Idempotent: searches by name+parent, creates if missing. Returns `{ id, name, created }`
  - `scaffoldDrive(accessToken, rootFolderId, tenantId, classificationNodes, onProgress)` — Creates the full recursive tree: `rootFolder/AgenticKnowledge/{tenantId}/_schema/`, `dimensions/{recursive classification tree}/`, `documents/`
  - `uploadSchemaFile(accessToken, schemaFolderId, schema)` — Uploads `classification_schema.json` to `_schema/`, updates if it already exists
  - All calls include `supportsAllDrives=true` for Shared Drive compatibility

**Files modified:**

- `index.html` — Added `<script src="https://accounts.google.com/gsi/client" async defer></script>` before the app script tag.

- `src/app/App.tsx` — Wrapped `<RouterProvider>` with `<GoogleAuthProvider>` so all routes have auth access.

- `src/app/layouts/DashboardLayout.tsx` — Added `<Toaster />` from the sonner UI component so toast notifications work throughout the app.

- `src/app/data/mockData.ts` — Added `ClassificationNode` interface (`{ name: string; children: ClassificationNode[] }`). Changed `Tenant.classificationSchema` from `ClassificationLevel[]` to `ClassificationNode[]` to support hierarchical classification. Extended `Tenant.googleDrive` with optional `folderName` and `scaffolded` fields. Updated mock data for Acme Corp to use the tree structure.

- `src/app/pages/SetupWizardPage.tsx` — Major rewrite:
  - **Step 3 (Classification Schema):** Replaced the flat table (levelKey/displayName/required columns) with a recursive `TreeEditor` component. Users can add categories, nest children up to 4 levels deep, and delete nodes. Each node has a name input, an add-child button (blue +), and a delete button (red trash).
  - **Step 4 (Configure Google Drive):** When no `VITE_GOOGLE_CLIENT_ID` env var is set, shows a text input where the user can paste their Google Cloud OAuth Client ID directly in the browser. After connecting, shows "Sign in with Google" button. After auth, shows the signed-in email with sign-out option, folder ID input, and a real "Test Connection" button that calls the Drive API and displays the resolved folder name.
  - **Step 5 (Scaffold Drive):** Shows a full recursive tree preview of the folder structure that will be created. "Apply Scaffold" button calls `scaffoldDrive()` with a progress callback showing real-time progress bar as each folder is created/found. Also uploads `classification_schema.json`. Shows success/error state.
  - **Step 6 (Activate):** Summary now shows verified folder name and scaffold status.

- `.gitignore` — Added `.env` and `.env.local`.

**Key architecture decisions:**
- **No npm packages for Google auth** — GIS loaded as a script tag, Drive API called via fetch
- **Token in memory only** — no localStorage, user re-authenticates on refresh
- **`drive` scope (not `drive.file`)** — needed to read arbitrary folders the user didn't create via the app
- **Idempotent scaffold** — `ensureFolder` searches before creating, safe to run repeatedly
- **Runtime client ID input** — users can enter their OAuth client ID in the browser UI without needing a `.env` file
- **Graceful degradation** — `useGoogleAuth()` returns a safe fallback instead of throwing, preventing app crashes when auth isn't configured
- **Recursive classification tree** — `ClassificationNode` supports arbitrary nesting up to 4 levels, replacing the flat `ClassificationLevel` model

**Setup requirements for Google Drive integration:**
1. Google Cloud project with OAuth 2.0 Client ID (Web application type)
2. Drive API enabled on the project
3. `http://localhost:5173` in both Authorized JavaScript origins AND Authorized redirect URIs
4. Either `VITE_GOOGLE_CLIENT_ID` in `.env` or enter the client ID in the browser UI at runtime

**What GPT should know for next steps:**
- Google OAuth + Drive API is fully working end-to-end (tested with real Google account and real Drive folder)
- The `ClassificationLevel` interface still exists in mockData.ts but is no longer used by the Tenant type — it's replaced by `ClassificationNode`
- The scaffold creates: `rootFolder/AgenticKnowledge/{tenantId}/_schema/`, `dimensions/{tree}/`, `documents/`
- `classification_schema.json` is uploaded to `_schema/` containing the full tree structure
- All data is still in-memory mock data — no backend persistence yet
- The `sonner` toast system is now mounted and available app-wide via `<Toaster />` in DashboardLayout

---

## #003 — 2026-03-02 — FastAPI Backend Control Plane + Frontend Wiring

**What happened:**
Added a FastAPI backend that persists tenant records, classification schemas, and Google Drive config in memory (survives across browser refreshes as long as the server runs). Rewired the TenantsPage and SetupWizardPage to use the new API instead of the in-memory mockData functions. Google OAuth stays client-side; the backend stores only config.

**New files created:**

- `backend/requirements.txt` — Dependencies: `fastapi>=0.115.0`, `uvicorn[standard]>=0.30.0`, `pydantic>=2.0.0`.

- `backend/models.py` — Pydantic v2 models:
  - **Domain:** `Tenant(id, name, status="draft", created_at, updated_at, shared_secret)`, `ClassificationNodeModel(name, children: list[Self])` (recursive), `ClassificationSchema(tenant_id, schema_tree, updated_at, version)`, `GoogleDriveConfig(tenant_id, root_folder_id, folder_name, scaffolded, scaffolded_at, updated_at)`
  - **Request:** `CreateTenantRequest(name)`, `PutSchemaRequest(schema_tree)`, `PutDriveConfigRequest(root_folder_id, folder_name?)`, `ScaffoldResultRequest(scaffolded, scaffolded_at?, root_folder_id, folder_name?)`
  - **Response:** `ActivateResponse(tenant_id, shared_secret, instructions_stub)`

- `backend/store/interface.py` — Three ABCs (all methods `async` for future Postgres swap):
  - `TenantStore`: `create`, `get`, `list`, `delete`, `update`
  - `ClassificationSchemaStore`: `get_by_tenant`, `upsert` (auto-increments version)
  - `GoogleDriveConfigStore`: `get_by_tenant`, `upsert` (merges on update)

- `backend/store/memory.py` — Dict-backed in-memory implementations:
  - `InMemoryTenantStore`: UUID generation on create, timestamp on update
  - `InMemoryClassificationSchemaStore`: version counter per tenant
  - `InMemoryGoogleDriveConfigStore`: merge-on-upsert preserving existing fields

- `backend/store/__init__.py` — Re-exports all store interfaces and implementations.

- `backend/routers/tenants.py` — `/api/tenants` routes:
  - `POST /api/tenants` — Create tenant (draft status), returns 201
  - `GET /api/tenants` — List all tenants
  - `GET /api/tenants/{tenant_id}` — Get one, 404 if missing
  - `DELETE /api/tenants/{tenant_id}` — Delete, 204 on success, 404 if missing

- `backend/routers/admin.py` — `/api/admin/{tenant_id}/...` routes (all validate tenant exists first):
  - `GET .../classification-schema` — Returns schema or `{schema_tree:[], version:0}` default
  - `PUT .../classification-schema` — Upsert with auto-increment version
  - `GET .../google-drive` — Returns config or JSON null
  - `PUT .../google-drive` — Upsert root_folder_id + folder_name
  - `POST .../activate` — Generates `secrets.token_urlsafe(32)` shared secret, sets status="active"
  - `POST .../scaffold-result` — Persists scaffold outcome to drive config

- `backend/routers/__init__.py` — Re-exports both routers.

- `backend/main.py` — FastAPI app creation: CORS for `localhost:5173`, instantiates 3 in-memory stores on `app.state`, includes both routers.

- `src/app/services/api.ts` — Typed frontend API client:
  - `request<T>(path, options)` helper with JSON headers and error extraction from `detail`
  - Response types: `TenantResponse`, `ClassificationSchemaResponse`, `GoogleDriveConfigResponse`, `ActivateResponse` (all snake_case matching backend)
  - Functions: `createTenant`, `getTenants`, `getTenant`, `deleteTenant`, `getSchema`, `putSchema`, `getDriveConfig`, `putDriveConfig`, `activateTenant`, `postScaffoldResult`

**Files modified:**

- `vite.config.ts` — Added `server.proxy` config: `/api` → `http://localhost:8000` with `changeOrigin: true`.

- `src/app/pages/TenantsPage.tsx` — Replaced mockData imports with `../services/api`. Added `useEffect` for async tenant fetch on mount, `loading` state with spinner, empty-state row when no tenants. `handleDelete` is now async and refetches after delete. Status display maps lowercase backend values (`"active"` → `"Active"`). Uses `tenant.created_at` (snake_case) instead of `tenant.createdAt`.

- `src/app/pages/SetupWizardPage.tsx` — Major changes:
  - Added `tenantId` state — set from URL param or after create
  - Added `activationResult` state — shown after activation with shared_secret and instructions
  - Added `saving` boolean — guards double-clicks on Next
  - **Step 0 → Next (create mode):** Calls `api.createTenant(name)` → sets tenantId → `navigate(/tenants/setup/${id}, {replace: true})`
  - **Edit mode load:** `Promise.all([getTenant, getSchema.catch(null), getDriveConfig.catch(null)])` → populates form
  - **Step 2 → Next:** `api.putSchema(tenantId, classificationNodes)` to persist schema
  - **Step 3 after testDriveFolder succeeds:** `api.putDriveConfig(tenantId, folderId, folderName)`
  - **Step 4 after scaffold succeeds:** `api.postScaffoldResult(tenantId, {scaffolded: true, ...})`
  - **Step 5 Activate:** `api.activateTenant(tenantId)` → shows shared_secret + instructions_stub in panel → "Done" button navigates to /tenants
  - Removed imports of `addTenant`, `getTenantById`, `updateTenant` from mockData. Kept `ClassificationNode` type import.

- `src/app/data/mockData.ts` — Removed: `ClassificationLevel` interface, `getTenants`, `getTenantById`, `addTenant`, `updateTenant`, `deleteTenant`, `nextId`. Kept: `Tenant`, `ClassificationNode`, `mockTenants` (TopBar still uses), `getCurrentTenant`, `setCurrentTenant`, `Run`, `Skill`, `RunResult`, `mockRuns`.

**Files NOT modified (intentionally out of scope):**
- `TopBar.tsx` — Still uses `mockTenants` directly (known inconsistency, acceptable for this sprint)
- `RunsPage.tsx` — Still uses mock runs data
- `GoogleAuthContext.tsx`, `google-auth.ts`, `google-drive.ts` — Unchanged (OAuth stays client-side)
- `App.tsx`, `DashboardLayout.tsx`, `routes.tsx` — Unchanged

**Updated project structure:**
```
context-agents/
├── ai-context/                    # (unchanged)
├── backend/
│   ├── requirements.txt           # fastapi, uvicorn, pydantic
│   ├── main.py                    # FastAPI app, CORS, store init, router includes
│   ├── models.py                  # Pydantic v2 domain + request/response models
│   ├── store/
│   │   ├── __init__.py            # Re-exports
│   │   ├── interface.py           # ABCs: TenantStore, SchemaStore, DriveConfigStore
│   │   └── memory.py              # Dict-backed in-memory implementations
│   └── routers/
│       ├── __init__.py            # Re-exports
│       ├── tenants.py             # POST/GET/DELETE /api/tenants
│       └── admin.py               # Schema, drive config, activate, scaffold-result
├── src/
│   ├── app/
│   │   ├── services/
│   │   │   ├── api.ts             # NEW — Typed API client for all backend endpoints
│   │   │   └── google-drive.ts    # (unchanged)
│   │   ├── data/
│   │   │   └── mockData.ts        # Cleaned up — removed CRUD functions, kept types + mock arrays
│   │   ├── pages/
│   │   │   ├── TenantsPage.tsx    # Rewired to async API
│   │   │   ├── SetupWizardPage.tsx # Rewired to async API with per-step persistence
│   │   │   └── RunsPage.tsx       # (unchanged — still uses mock data)
│   │   └── ...                    # (rest unchanged)
│   └── ...
├── vite.config.ts                 # Added /api proxy → localhost:8000
└── CHANGE-TRACKING.md
```

**Key architecture decisions:**
- **In-memory stores with ABC interfaces** — Swap to Postgres-backed implementations later without changing routers
- **Tenant created on Step 1 "Next"** — All subsequent wizard steps have a `tenant_id` to persist against
- **URL updates with UUID** — `navigate(/tenants/setup/${id}, {replace: true})` after create so refresh works
- **Backend stores snake_case, frontend maps for display** — `status: "active"` → displayed as `"Active"`
- **Google OAuth stays entirely client-side** — Backend stores only config (folder ID, folder name, scaffold status), not tokens
- **`shared_secret` generated on activate** — `secrets.token_urlsafe(32)`, shown to user once with usage instructions
- **CORS restricted to `localhost:5173`** — Only the Vite dev server can call the API
- **Vite proxy in dev** — `/api` requests proxied to `localhost:8000`, no CORS issues in dev

**How to run:**
```bash
# Terminal 1: Backend
cd backend && source .venv/bin/activate && uvicorn main:app --reload --port 8000

# Terminal 2: Frontend
npm run dev
```

**What GPT should know for next steps:**
- Tenant data now persists across browser refreshes (as long as backend is running)
- Data is still in-memory — a server restart loses all data. Next step would be adding Postgres via the ABC interface swap.
- TopBar tenant selector still reads from `mockTenants` — it doesn't reflect backend-created tenants yet (known gap)
- RunsPage still uses mock data — no backend runs API yet
- The `ClassificationLevel` interface has been removed from mockData.ts
- The backend venv lives at `backend/.venv/` (not committed to git)
- All 10 API endpoints are tested and working

---

## #004 — 2026-03-02 — Shared TenantContext (Single Source of Truth)

**What happened:**
Replaced the stale in-memory `mockTenants` / `getCurrentTenant` / `setCurrentTenant` in mockData.ts with a shared React context backed by the backend API. TopBar, TenantsPage, and SetupWizardPage now share tenant state via `useTenants()`, so creating, deleting, or activating a tenant is immediately reflected across all components without a page reload.

**New files created:**

- `src/app/context/TenantContext.tsx` — React context + provider following the GoogleAuthContext pattern:
  - `TenantContextValue` interface: `tenants: TenantResponse[]`, `loading: boolean`, `error: string | null`, `refreshTenants(): Promise<void>`, `currentTenantId: string | null`, `setCurrentTenantId(id: string | null): void`, `currentTenant: TenantResponse | null`
  - `TenantProvider` component: fetches `api.getTenants()` on mount, stores tenants list + current selection in state. `currentTenant` derived via `tenants.find()`. Auto-selects first tenant when nothing is selected. `refreshTenants()` re-fetches and preserves selection if still valid, otherwise resets to first.
  - `useTenants()` hook with `FALLBACK` constant (returns safe defaults if provider is missing, matching GoogleAuthContext pattern)
  - In-memory only — no localStorage

**Files modified:**

- `src/app/App.tsx` — Wrapped `<RouterProvider>` with `<TenantProvider>` inside `<GoogleAuthProvider>`:
  ```
  <GoogleAuthProvider>
    <TenantProvider>
      <RouterProvider router={router} />
    </TenantProvider>
  </GoogleAuthProvider>
  ```

- `src/app/components/TopBar.tsx` — Complete rewrite:
  - Replaced `import { mockTenants, getCurrentTenant, setCurrentTenant }` with `import { useTenants }`
  - Destructures `{ tenants, currentTenant, currentTenantId, setCurrentTenantId }` from context
  - `handleTenantSelect`: calls `setCurrentTenantId(id)` + closes dropdown — no more `window.location.reload()`
  - Empty state: disabled button showing "No tenants" when `tenants.length === 0`
  - Status badge: checks `=== 'active'` (lowercase from backend), capitalizes for display via `displayStatus()`

- `src/app/pages/TenantsPage.tsx` — Simplified:
  - Removed local `useState<TenantResponse[]>`, `useState(true)` for loading, `fetchTenants` function, and `useEffect`
  - Replaced with `const { tenants, loading, refreshTenants } = useTenants()`
  - `handleDelete` calls `refreshTenants()` after `deleteTenant(id)` — this updates both the table and TopBar
  - Removed `getTenants` import from `../services/api` (context handles fetching)

- `src/app/pages/SetupWizardPage.tsx` — Added context integration at three points:
  - Import `useTenants` from context, destructure `{ setCurrentTenantId, refreshTenants }`
  - After `api.createTenant()` in handleNext step 0: `await refreshTenants()` + `setCurrentTenantId(tenant.id)` — new tenant appears in TopBar immediately
  - In edit-mode `useEffect` (when `id` URL param exists): `setCurrentTenantId(tenant.id)` — TopBar syncs to the tenant being edited
  - After `handleActivate` succeeds: `await refreshTenants()` — TopBar shows updated "Active" status

- `src/app/data/mockData.ts` — Cleaned up:
  - Removed: `Tenant` interface, `mockTenants` array (3 hardcoded tenants), `currentTenantId` variable, `getCurrentTenant()` function, `setCurrentTenant()` function
  - Kept: `ClassificationNode` interface, `Run`/`Skill`/`RunResult` interfaces, `mockRuns` array

**Updated project structure:**
```
src/app/
├── context/
│   └── TenantContext.tsx        # NEW — Shared tenant state backed by backend API
├── auth/
│   └── GoogleAuthContext.tsx    # (unchanged)
├── services/
│   ├── api.ts                  # (unchanged)
│   └── google-drive.ts         # (unchanged)
├── data/
│   └── mockData.ts             # Reduced — only ClassificationNode, Run types, mockRuns
├── components/
│   └── TopBar.tsx              # Rewritten — uses useTenants() context
├── pages/
│   ├── TenantsPage.tsx         # Simplified — uses useTenants() context
│   ├── SetupWizardPage.tsx     # Added context calls for create/edit/activate
│   └── RunsPage.tsx            # (unchanged — still uses mockRuns)
└── App.tsx                     # Added TenantProvider wrapper
```

**Key architecture decisions:**
- **Context pattern matches GoogleAuthContext** — same `createContext` + `useContext` + FALLBACK approach for consistency
- **Backend is the single source of truth** — context calls `getTenants()` API, no local mock data
- **No localStorage** — tenant selection resets on page refresh (auto-selects first tenant)
- **`refreshTenants()` preserves selection** — after re-fetch, keeps `currentTenantId` if the tenant still exists, otherwise falls back to first

**What GPT should know for next steps:**
- TopBar is now fully wired to backend data — the `mockTenants` array no longer exists
- All tenant CRUD operations (create, delete, activate) now trigger `refreshTenants()` which updates every component using `useTenants()`
- `mockData.ts` only contains `ClassificationNode` (used by SetupWizardPage), `Run`/`Skill`/`RunResult` types, and `mockRuns` (used by RunsPage)
- The `Tenant` interface from mockData.ts is gone — use `TenantResponse` from `services/api.ts` instead
- RunsPage is the last page still using mock data

---

*Next change will be #005.*
