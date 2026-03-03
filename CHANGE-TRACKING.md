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

## #005 — 2026-03-02 — Server-Side Google Drive Provider (Token Passthrough)

**What happened:**
Moved all Google Drive API calls from the browser (`google-drive.ts`) to a backend service (`GoogleDriveProvider`). The frontend still uses GIS for OAuth and passes the access token in request bodies — the backend uses it for the duration of the request and never stores it. This consolidates what were previously multi-step client workflows (test folder + save config, scaffold + upload schema + save result) into single backend calls, and enables future backend agents to reuse the same Drive provider.

**New files created:**

- `backend/services/__init__.py` — Empty package file.

- `backend/services/google_drive.py` — Stateless `GoogleDriveProvider` class (every method receives `access_token`, no storage):
  - `test_folder(access_token, folder_id)` — GET `/drive/v3/files/{id}`, validates mimeType is folder, returns `{id, name}`
  - `ensure_folder(access_token, name, parent_id)` — Search by name+parent+mimeType+not-trashed; create if missing. Returns `{id, name, created}`. Uses `supportsAllDrives=true` + `includeItemsFromAllDrives=true`
  - `scaffold(access_token, root_folder_id, tenant_id, schema_tree)` — Creates `AgenticKnowledge/{tenant_id}/_schema/`, `dimensions/{recursive tree}/`, `documents/`. Returns `{schema_folder_id, progress_log, created_count}`
  - `upload_schema(access_token, schema_folder_id, schema_tree)` — Multipart/related upload of `classification_schema.json`, idempotent (search then create/PATCH). Constructs raw `multipart/related` body (Google requires this, not `multipart/form-data`)
  - `_create_folder_tree(...)` — Recursive helper for classification nodes
  - `GoogleDriveError(status_code, message)` — Custom exception, caught by endpoints and mapped to HTTPException
  - Uses `httpx.AsyncClient()` as context manager per call

**Files modified:**

- `backend/requirements.txt` — Added `httpx>=0.27.0`.

- `backend/models.py` — Added 4 new Pydantic models:
  - `TestDriveFolderRequest(access_token, folder_id)` — Request body for test endpoint
  - `ScaffoldApplyRequest(access_token, root_folder_id, schema_tree: list[ClassificationNodeModel])` — Request body for scaffold endpoint
  - `TestDriveFolderResponse(folder_id, folder_name)` — Response from test endpoint
  - `ScaffoldApplyResponse(schema_folder_id, progress_log: list[str], created_count: int)` — Response from scaffold endpoint

- `backend/routers/admin.py` — Added 2 new endpoints + module-level `_drive = GoogleDriveProvider()`:
  - `POST /api/admin/{tenant_id}/google-drive/test` — Calls `_drive.test_folder()`, persists drive config via `drive_config_store.upsert()` in one shot (combines what was previously two separate client-side calls). Returns `TestDriveFolderResponse`. Catches `GoogleDriveError` → `HTTPException`.
  - `POST /api/admin/{tenant_id}/scaffold-apply` — Calls `_drive.scaffold()` then `_drive.upload_schema()`, persists scaffold result via `drive_config_store.upsert(scaffolded=True, ...)`. Returns `ScaffoldApplyResponse`. Catches `GoogleDriveError` → `HTTPException`.

- `src/app/services/api.ts` — Added 2 new functions + 2 response types:
  - `TestDriveFolderResponse { folder_id, folder_name }` interface
  - `ScaffoldApplyResponse { schema_folder_id, progress_log: string[], created_count }` interface
  - `testDriveFolder(tenantId, accessToken, folderId)` — POST to `/admin/{tenantId}/google-drive/test`
  - `scaffoldApply(tenantId, accessToken, rootFolderId, schemaTree)` — POST to `/admin/{tenantId}/scaffold-apply`

- `src/app/pages/SetupWizardPage.tsx` — Major rewrite of Drive-related logic:
  - **Removed import:** `testDriveFolder, scaffoldDrive, uploadSchemaFile, type ScaffoldProgress` from `../services/google-drive`
  - **Replaced state:** `scaffoldProgress: ScaffoldProgress | null` → `scaffoldLog: string[]` + `scaffoldCreatedCount: number`
  - **`handleTestGoogleDrive`:** Was two calls (client-side `testDriveFolder()` → `api.putDriveConfig()`). Now single call: `api.testDriveFolder(tenantId, accessToken, folderId)`. Backend tests the folder and persists config. Added `tenantId` null guard.
  - **`handleApplyScaffold`:** Was three calls (client-side `scaffoldDrive()` → `uploadSchemaFile()` → `api.postScaffoldResult()`). Now single call: `api.scaffoldApply(tenantId, accessToken, folderId, classificationNodes)`. Backend does scaffold + upload + persist.
  - **Scaffold UI (case 4):** Running state shows indeterminate spinner with `<Loader2>` (no real-time progress since it's a single request). Done state shows success message with `created_count`, plus collapsible `<details>` log with `Created` entries in green, `Found` entries in gray.

**Files deleted:**

- `src/app/services/google-drive.ts` — All functions (`testDriveFolder`, `ensureFolder`, `scaffoldDrive`, `uploadSchemaFile`) moved to `backend/services/google_drive.py`. `ScaffoldProgress` type no longer needed (replaced by server-returned `progress_log`). `ClassificationNode` type still exists in `mockData.ts`.

**Updated project structure:**
```
backend/
├── services/
│   ├── __init__.py                # NEW — Empty package
│   └── google_drive.py            # NEW — GoogleDriveProvider (httpx-based)
├── models.py                      # Added 4 Drive request/response models
├── routers/
│   └── admin.py                   # Added google-drive/test + scaffold-apply endpoints
└── requirements.txt               # Added httpx>=0.27.0

src/app/
├── services/
│   ├── api.ts                     # Added testDriveFolder() + scaffoldApply()
│   └── (google-drive.ts DELETED)  # All logic moved to backend
├── pages/
│   └── SetupWizardPage.tsx        # Rewired to backend API calls
└── ...
```

**Key architecture decisions:**
- **Token passthrough, not storage** — Backend receives `access_token` in each request body, uses it for the duration of that request, never persists it
- **Module-level stateless provider** — `_drive = GoogleDriveProvider()` at module level is safe because the class holds no state
- **Consolidated persistence** — Test+save and scaffold+upload+save are each a single backend call now, reducing frontend complexity and eliminating partial-failure states
- **Raw multipart/related for upload** — Google's upload API requires `multipart/related` (not `multipart/form-data`), so the backend constructs the body manually with a UUID boundary
- **httpx.AsyncClient per call** — Each method creates and closes its own client as a context manager, no connection pooling needed for wizard-frequency calls
- **Progress log replaces real-time progress** — Since scaffold is now a single HTTP request, the client can't get incremental updates. Instead the backend returns a `progress_log` array shown in a collapsible `<details>` element after completion.

**What GPT should know for next steps:**
- `google-drive.ts` no longer exists — all Drive logic is server-side in `backend/services/google_drive.py`
- The `GoogleDriveProvider` is stateless and reusable — future agent orchestration can import and use it directly
- The frontend still handles Google OAuth via GIS (`GoogleAuthContext.tsx` + `google-auth.ts`) — only the access token is sent to the backend
- `putDriveConfig` and `postScaffoldResult` API functions still exist in `api.ts` (the old endpoints still work) but are no longer called by the wizard — the new endpoints handle persistence internally
- The `ScaffoldProgress` type is gone — replaced by `ScaffoldApplyResponse.progress_log: string[]`
- `ClassificationNode` type is still imported from `mockData.ts` by `SetupWizardPage.tsx`

---

## #006 — 2026-03-02 — Execution Plane MVP (Runs + Events + Skill Chain)

**What happened:**
Built a minimal execution plane: users can create agent runs from the UI, the backend executes a 4-skill chain (ValidateInput → RetrieveDocs → SynthesizeResolution → RecordOutcome), events stream live to the browser via WebSocket, and the RunsPage now displays real backend data instead of mock data. Google Drive document search is wired in via the existing `GoogleDriveProvider`. Synthesis uses a deterministic placeholder (no LLM integration yet).

**New files created:**

- `backend/services/orchestrator.py` — The skill chain orchestrator:
  - `run_orchestrator(tenant_id, access_token, work_object, run_id, stores, drive_provider, on_event)` — Async function that executes the full skill chain sequentially, updating run status and emitting `AgentEvent`s at each step.
  - **ValidateInputSkill** — Confirms tenant exists and is `active`, confirms Google Drive config has `root_folder_id`. Fails with clear message if tenant is draft or unconfigured.
  - **RetrieveDocsSkill** — Navigates `root → AgenticKnowledge/{tenant_id}/documents`, tokenizes work object title/description/classification (deduped, stop words stripped), calls `GoogleDriveProvider.search_documents()` with up to 12 tokens. Continues with zero docs on Drive errors instead of failing the run.
  - **SynthesizeResolutionSkill** — Deterministic placeholder: generates summary referencing ticket title and doc count, builds 4-6 resolution steps, sets confidence to 0.55 if docs found else 0.20.
  - **RecordOutcomeSkill** — Stores `{summary, steps, sources, confidence}` as `result` on the `AgentRun`, sets status to `completed`.
  - `_tokenize(work_object)` helper — Extracts search tokens from title/description/classification, filters stop words, limits to 12 tokens.
  - `_build_steps(work_object, sources)` helper — Generates deterministic resolution steps based on available sources.
  - Each skill emits `AgentEvent`s with `event_type` progression (`thinking` → `retrieval`/`tool_call` → `complete`/`error`).
  - 300ms `asyncio.sleep` between skills so WebSocket clients can see each step animate.
  - Top-level try/except catches unexpected errors, marks run as `failed`, emits `error` event.

- `backend/routers/runs.py` — REST + WebSocket router:
  - `POST /api/runs` — Validates tenant exists, creates `AgentRun` with `queued` status, kicks off `run_orchestrator` via `BackgroundTasks`. Returns `{run_id}`.
  - `GET /api/runs?tenant_id=...` — Lists all runs for tenant, newest first.
  - `GET /api/runs/{run_id}?tenant_id=...` — Gets single run, 404 if tenant mismatch.
  - `WS /api/runs/{run_id}/events?tenant_id=...` — Validates tenant owns the run (closes with 4004 on mismatch). Replays all existing events in order. If run is already terminal, sends `stream_end` and closes. Otherwise subscribes to live events via in-memory pubsub (`asyncio.Queue` per subscriber). Sends `stream_end` message when run completes/fails/times out (120s).
  - Module-level `_event_subscribers: dict[str, list[asyncio.Queue]]` — Simple pubsub: `_publish_event`, `_subscribe`, `_unsubscribe`.

**Files modified:**

- `backend/models.py` — Added 5 new models:
  - `ClassificationPair(name, value)` — Key-value pair for work object classification
  - `WorkObject(work_id, source_system="ui", record_type="incident", title, description, classification: list[ClassificationPair], metadata: dict | None)` — Canonical work item representation
  - `CreateRunRequest(tenant_id, access_token, work_object)` — Request body for creating a run (access_token for Drive calls during execution)
  - `AgentRun(run_id, tenant_id, status: "queued"|"running"|"completed"|"failed", started_at, completed_at, work_object, result: dict | None)` — Run record
  - `AgentEvent(run_id, skill_id, event_type: "thinking"|"retrieval"|"planning"|"tool_call"|"tool_result"|"verification"|"complete"|"error", summary, confidence, timestamp, metadata: dict | None)` — Structured event (no chain-of-thought leakage)

- `backend/store/interface.py` — Added 2 new ABCs:
  - `RunStore`: `create_run(run)`, `get_run(run_id)`, `list_runs_for_tenant(tenant_id)`, `update_run(run_id, **kwargs)`
  - `EventStore`: `append_event(event)`, `list_events_for_run(run_id)`

- `backend/store/memory.py` — Added 2 new implementations:
  - `InMemoryRunStore` — Dict-backed, keyed by `run_id`. `list_runs_for_tenant` filters by `tenant_id`. `update_run` merges kwargs like existing stores.
  - `InMemoryEventStore` — Dict of lists, keyed by `run_id`. Append-only.

- `backend/store/__init__.py` — Re-exports `RunStore`, `EventStore`, `InMemoryRunStore`, `InMemoryEventStore`.

- `backend/services/google_drive.py` — Added `search_documents(access_token, folder_id, tokens, limit=10)` method:
  - Builds a Drive query with `name contains` OR clauses for up to 8 tokens
  - Excludes folders (`mimeType != folder`)
  - Returns `list[{name, id, webViewLink}]`

- `backend/routers/__init__.py` — Added `runs_router` re-export.

- `backend/main.py` — Added `run_store = InMemoryRunStore()`, `event_store = InMemoryEventStore()` to `app.state`. Included `runs_router`.

- `vite.config.ts` — Added `ws: true` to the `/api` proxy config so WebSocket connections pass through to the backend.

- `src/app/services/api.ts` — Added types and functions:
  - `WorkObject` interface — Matches backend model
  - `AgentRunResponse` interface — Run with `work_object` and nullable `result: {summary, steps, sources, confidence}`
  - `AgentEventResponse` interface — Event with `skill_id`, `event_type`, `summary`, `confidence`, `metadata`
  - `createRun(tenantId, accessToken, workObject)` → `POST /api/runs`
  - `getRuns(tenantId)` → `GET /api/runs?tenant_id=...`
  - `getRun(tenantId, runId)` → `GET /api/runs/{runId}?tenant_id=...`
  - `connectRunEvents(runId, tenantId, onEvent, onEnd, onError)` → Opens WebSocket, dispatches events and stream_end, returns the `WebSocket` handle for cleanup

- `src/app/pages/RunsPage.tsx` — Full rewrite:
  - **Imports:** Removed `mockRuns` from `mockData`. Added `useTenants`, `useGoogleAuth`, `api` imports.
  - **State:** `runs: AgentRunResponse[]` fetched from backend on tenant change. `events: AgentEventResponse[]` populated via WebSocket. `showNewRun` / `newTitle` / `newDescription` for the creation form.
  - **Skills timeline built from events:** `buildSkills(events)` function groups events by `skill_id`, derives status (`pending` → `running` → `completed`/`error`), ordered by `SKILL_ORDER` constant.
  - **WebSocket lifecycle:** On run selection, opens WS, replays existing events, streams live events. On `stream_end`, refreshes the run to pick up final `result`. Cleans up on un-select or unmount.
  - **New Run form:** Title + description inputs, "Start Run" button. Disabled when not authenticated or no tenant selected. Creates run via `api.createRun()`, auto-selects the new run.
  - **Run list (left panel):** Shows run title, run_id, status dot, timestamp. "+" button in header for new run. Auth hint when not signed in.
  - **Run detail (right panel):** Header with title, status badge, run_id, timestamp, description. Skills timeline with expandable event lists (event_type color-coded: green for complete, red for error, gray for others). Result panel for completed runs with summary, steps, sources (links), confidence bar. In-progress banner with spinner. Failed banner with error hint.

- `src/app/data/mockData.ts` — Removed `Run`, `Skill`, `RunResult` interfaces and `mockRuns` array. Only `ClassificationNode` interface remains (still used by `SetupWizardPage.tsx`).

**Updated project structure:**
```
backend/
├── services/
│   ├── __init__.py
│   ├── google_drive.py            # Added search_documents()
│   └── orchestrator.py            # NEW — 4-skill chain orchestrator
├── models.py                      # Added WorkObject, AgentRun, AgentEvent, etc.
├── store/
│   ├── __init__.py                # Re-exports new stores
│   ├── interface.py               # Added RunStore, EventStore ABCs
│   └── memory.py                  # Added InMemoryRunStore, InMemoryEventStore
├── routers/
│   ├── __init__.py                # Added runs_router
│   ├── admin.py                   # (unchanged)
│   ├── tenants.py                 # (unchanged)
│   └── runs.py                    # NEW — REST + WebSocket endpoints
└── main.py                        # Added run_store, event_store, runs_router

src/app/
├── services/
│   └── api.ts                     # Added run types + createRun/getRuns/getRun/connectRunEvents
├── pages/
│   ├── RunsPage.tsx               # Full rewrite — backend-driven with WebSocket events
│   └── SetupWizardPage.tsx        # (unchanged)
├── data/
│   └── mockData.ts                # Reduced to ClassificationNode only
└── ...

vite.config.ts                     # Added ws: true for WebSocket proxy
```

**Key architecture decisions:**
- **Background task execution** — `BackgroundTasks` (FastAPI) kicks off the orchestrator after returning `{run_id}` to the client. No Celery/Redis needed for MVP.
- **In-memory pubsub for events** — `asyncio.Queue` per WebSocket subscriber. Simple, no external dependencies. Events are also persisted in `EventStore` for replay.
- **WebSocket replay + live** — On connect, all existing events are sent first, then live events stream until the run is terminal. This means a client that connects mid-run catches up automatically.
- **Tenant isolation on every endpoint** — REST endpoints validate `tenant_id` matches the run. WebSocket closes with code 4004 on mismatch. Orchestrator validates tenant is `active`.
- **Token passthrough for Drive calls during execution** — `access_token` is passed in the `CreateRunRequest` and forwarded to `GoogleDriveProvider.search_documents()` during the run. Never stored.
- **Deterministic synthesis (no LLM)** — SynthesizeResolution generates a structured placeholder. Confidence = 0.55 with docs, 0.20 without. Ready for Claude API swap later.
- **Graceful Drive failure** — If `search_documents` fails (expired token, network), the run continues with zero docs and lower confidence rather than failing entirely.
- **Skills timeline derived from events** — Frontend builds skill state from the event stream rather than a separate "skills" API. This means the timeline updates in real-time as events arrive.
- **No chain-of-thought leakage** — Events contain structured summaries only (`summary` field), not raw LLM reasoning. `metadata` holds safe structured details (token counts, doc counts).

**What GPT should know for next steps:**
- The execution plane is functional end-to-end: UI → REST → orchestrator → Drive search → synthesis → WS events → UI
- `mockData.ts` only contains `ClassificationNode` now — all Run/Skill/RunResult types are gone, replaced by `api.ts` types
- The orchestrator is in `backend/services/orchestrator.py` — each skill is currently inline in `run_orchestrator()`. Future refactoring could extract skills into separate classes.
- The `search_documents` method on `GoogleDriveProvider` does a `name contains` search — not semantic/embedding-based. Good enough for MVP, can be replaced with vector search later.
- No ServiceNow writeback skill — the chain ends at RecordOutcome. Writeback would be skill E in a future sprint.
- No feedback capture — the run result is final. Feedback loop would be a separate sprint.
- The `access_token` passed at run creation may expire during long runs — for MVP this is acceptable since runs complete in ~2 seconds. For production, token refresh would be needed.
- WebSocket uses query param `tenant_id` for auth — no header auth on WS. Acceptable for MVP; production would use the activation secret.

---

## #007 — 2026-03-02 — Claude Synthesis (Replace Placeholder with Real LLM)

**What happened:**
Replaced the deterministic placeholder in SynthesizeResolutionSkill with a real Claude API call. The orchestrator now sends the ticket, classification path, and retrieved document links to Claude with a strict JSON prompt contract, and uses the structured response as the run result. If Claude is unavailable (API key missing, timeout, parse error), the system falls back to the original deterministic placeholder seamlessly. No chain-of-thought leakage — event metadata contains only safe operational metrics.

**New files created:**

- `backend/services/claude_client.py` — Minimal Claude synthesis service:
  - `synthesize_resolution(title, description, classification, sources, tenant_notes)` — Async function that calls Claude Messages API via httpx.
  - **Model:** `claude-sonnet-4-20250514` (configurable via constant).
  - **API key:** Read from `CLAUDE_API_KEY` environment variable. Raises `ClaudeClientError` immediately if unset.
  - **System prompt:** Strict rules — never invent policies, only reference provided sources, include "questions to clarify" when evidence is insufficient, confidence must reflect evidence strength.
  - **User message:** Structured with ticket title, description, classification path (ordered pairs), retrieved documents (title + link), and tenant policy notes (stub, empty for now).
  - **Output contract:** Strict JSON with `{summary, recommended_steps, sources: [{title, url}], confidence: 0..1}`.
  - **Timeout:** 30 seconds.
  - **Response parsing:** Extracts text from content blocks, strips markdown code fences if Claude adds them despite instructions, parses JSON, validates required keys, clamps confidence to 0-1.
  - **Metadata returned:** `_meta: {model, latency_ms, input_tokens, output_tokens}` — attached to result for the caller to include in events.
  - `ClaudeClientError` exception — Raised on any failure (missing key, HTTP error, empty response, JSON parse failure, missing keys). Caller catches and falls back.
  - `_build_user_message(...)` helper — Formats the structured prompt from ticket + classification + sources + notes.

**Files modified:**

- `backend/services/orchestrator.py` — SynthesizeResolutionSkill rewritten:
  - **New event flow:** `thinking` → `tool_call` ("Calling Claude synthesis...") → Claude API call → `tool_result` ("Claude synthesis complete") with confidence → `complete`.
  - **On Claude success:** Uses `claude_result["summary"]`, `claude_result["recommended_steps"]` (mapped to `steps`), `claude_result["sources"]`, `claude_result["confidence"]` directly as the run result.
  - **On `ClaudeClientError`:** Emits `error` event with message (e.g. "Claude unavailable, using fallback: CLAUDE_API_KEY not set"), then runs the original deterministic placeholder logic. The `complete` event includes `[fallback]` tag. Run still completes successfully — it does not fail.
  - **Safe metadata only:** `tool_result` event metadata contains `{model, latency_ms, input_tokens, output_tokens, doc_count}`. No raw prompt, no raw Claude response text, no chain-of-thought.
  - **`used_fallback` flag:** Tracked and included in the `complete` event metadata as `{"fallback": true/false}`.
  - Added import of `ClaudeClientError` and `synthesize_resolution` from `services.claude_client`.

**Files NOT modified (verified compatible):**

- `backend/requirements.txt` — `httpx>=0.27.0` already present (added in Sprint 5).
- `src/app/services/api.ts` — `AgentRunResponse.result` shape `{summary, steps, sources, confidence}` already matches. Claude returns `recommended_steps` which the orchestrator maps to `steps`.
- `src/app/pages/RunsPage.tsx` — Result panel already renders `result.summary`, `result.steps`, `result.sources`, `result.confidence`. No changes needed.

**Updated project structure:**
```
backend/services/
├── __init__.py
├── claude_client.py           # NEW — Claude synthesis via httpx
├── google_drive.py            # (unchanged)
└── orchestrator.py            # Updated — Claude call + fallback in SynthesizeResolutionSkill
```

**Prompt contract details:**

System prompt rules:
1. Never invent policies or steps not supported by provided sources
2. If evidence insufficient, say so in summary and include "questions to clarify" as steps
3. Steps must be actionable and concise
4. Sources must only reference provided doc links — never fabricate URLs
5. Confidence must reflect evidence strength (lower when docs missing/sparse)

Output schema (strict JSON, no markdown):
```json
{
  "summary": "string — one paragraph recommendation",
  "recommended_steps": ["string — actionable step", ...],
  "sources": [{"title": "string", "url": "string"}, ...],
  "confidence": 0.0-1.0
}
```

**Key architecture decisions:**
- **httpx, not SDK** — Keeps dependencies minimal. Single POST to `/v1/messages` with `x-api-key` header and `anthropic-version: 2023-06-01`.
- **Graceful fallback, not failure** — Missing API key or Claude errors don't fail the run. The deterministic placeholder produces a valid result so the system always returns something useful.
- **No chain-of-thought leakage** — The raw prompt and raw Claude response are never stored in events, metadata, or the run result. Only the parsed JSON fields are used.
- **`tenant_notes` stub** — The prompt accepts tenant policy notes but they're empty for now. Future sprints can populate this from tenant config.
- **Markdown fence stripping** — Claude sometimes wraps JSON in ```json fences despite explicit instructions. The parser handles this gracefully.
- **Confidence clamping** — `max(0.0, min(1.0, float(conf)))` ensures the value is always valid even if Claude returns something unexpected.

**Configuration:**
```bash
# Set before starting the backend
export CLAUDE_API_KEY=sk-ant-api03-...

# Then start as usual
cd backend && uvicorn main:app --reload --port 8000
```

If `CLAUDE_API_KEY` is not set, runs still work — they use the deterministic fallback and the SynthesizeResolution skill emits an error event followed by the fallback completion.

**What GPT should know for next steps:**
- Claude synthesis is live when `CLAUDE_API_KEY` is set. Without it, the system falls back transparently.
- The prompt is a single baseline template in `claude_client.py` — future optimization would involve prompt routing, few-shot examples, or tenant-specific instructions.
- `tenant_notes` parameter is stubbed empty — can be wired to a tenant config field for per-tenant policy injection.
- The model is `claude-sonnet-4-20250514` — can be changed by updating the `CLAUDE_MODEL` constant.
- No streaming from Claude — the full response is awaited. For long responses, this could be changed to streaming with partial event updates.
- The `recommended_steps` key from Claude is mapped to `steps` in the run result to match the existing frontend contract.

---

---

## #008 — 2026-03-02 — ServiceNow Integration (Run Trigger + WritebackSkill)

**What happened:**
Added full ServiceNow integration: config persistence, external run trigger endpoint, and a conditional WritebackSkill that patches incident work_notes after resolution synthesis.

**Files created:**
- `backend/services/servicenow.py` — `ServiceNowProvider` class with `update_work_notes()` (PATCH to ServiceNow REST Table API) and `format_work_notes()` helper that produces a stable, readable work notes string with summary, steps, sources, confidence, and run ID.

**Files modified:**

- `backend/models.py` — Added 3 models:
  - `ServiceNowConfig` — tenant_id, instance_url, username, password, updated_at
  - `PutServiceNowConfigRequest` — instance_url, username, password
  - `ServiceNowRunRequest` — tenant_id, tenant_secret, sys_id, number, short_description, description, classification, metadata, access_token (optional)

- `backend/store/interface.py` — Added `ServiceNowConfigStore` ABC with `get_by_tenant()` and `upsert()` methods.

- `backend/store/memory.py` — Added `InMemoryServiceNowConfigStore` implementing the same merge-on-upsert pattern as `InMemoryGoogleDriveConfigStore`.

- `backend/store/__init__.py` — Re-exports `ServiceNowConfigStore` and `InMemoryServiceNowConfigStore`.

- `backend/main.py` — Added `app.state.snow_config_store = InMemoryServiceNowConfigStore()`.

- `backend/routers/admin.py` — Added 2 endpoints:
  - `GET /api/admin/{tenant_id}/servicenow` — returns ServiceNow config or null
  - `PUT /api/admin/{tenant_id}/servicenow` — upserts instance_url, username, password

- `backend/routers/runs.py` — Added `POST /api/runs/from/servicenow` endpoint:
  - Validates tenant exists, is active, and shared_secret matches `body.tenant_secret`
  - Constructs `WorkObject` with `source_system="servicenow"`, `record_type="incident"`, metadata containing sys_id and number
  - Passes `snow_config_store` and `snow_provider` to orchestrator
  - Updated existing `create_run` endpoint to also pass `snow_config_store` and `snow_provider`
  - Updated WebSocket terminal check to detect both `RecordOutcome` and `Writeback` skill completions

- `backend/services/orchestrator.py` — Added WritebackSkill (Skill E):
  - New parameters: `snow_config_store: Any = None`, `snow_provider: Any = None`
  - Pre-flight check before RecordOutcome: if `source_system == "servicenow"` and ServiceNow config exists, sets `will_writeback = True`
  - RecordOutcome conditionally defers `status="completed"` when writeback follows (stores result without status change)
  - Skill E runs after RecordOutcome: formats work notes via `format_work_notes()`, PATCHes incident via `snow_provider.update_work_notes()`, emits `tool_call`/`tool_result`/`complete` events
  - Catches `ServiceNowError` gracefully — emits error event but does NOT fail the run (run still completes)
  - Sets `status="completed"` BEFORE emitting the terminal event to avoid WebSocket race condition

- `src/app/services/api.ts` — Added `ServiceNowConfigResponse` interface, `getSnowConfig()`, and `putSnowConfig()` functions.

- `src/app/pages/SetupWizardPage.tsx`:
  - Replaced mock `handleTestServiceNow` (setTimeout) with real `api.putSnowConfig()` call that persists to backend
  - Loads existing ServiceNow config on tenant edit (added `api.getSnowConfig(id)` to the parallel load)
  - Persists ServiceNow config on "Next" from Step 2 (`currentStep === 1`)

- `src/app/pages/RunsPage.tsx` — Updated `SKILL_ORDER` to include `'Writeback'` so it appears in the skill timeline.

**ServiceNow run trigger flow:**
```
POST /api/runs/from/servicenow
{
  "tenant_id": "t_abc123",
  "tenant_secret": "the-shared-secret",
  "sys_id": "abc123...",
  "number": "INC0012345",
  "short_description": "VPN not connecting",
  "description": "User reports VPN fails after update...",
  "classification": [{"name": "Category", "value": "Network"}]
}
```
1. Validates tenant exists, is active, shared_secret matches
2. Constructs WorkObject with `source_system="servicenow"`
3. Kicks off orchestrator in background
4. Returns `{"run_id": "run_xxx"}`

**WritebackSkill flow (Skill E — conditional):**
1. Only runs when `work_object.source_system == "servicenow"` AND ServiceNow config exists for the tenant
2. Formats work notes: `[AI Resolution Recommendation]\n\nSummary:\n...\nRecommended Steps:\n  1. ...\nSources:\n  - title: url\nConfidence: 0.xx\nRun ID: run_xxx`
3. PATCHes `/api/now/table/incident/{sys_id}` with `{"work_notes": formatted_text}` using Basic Auth
4. On success: emits `tool_result` + `complete` events
5. On failure: emits `error` event but run still completes (result is preserved)

**WebSocket terminal detection:**
Previously checked only `RecordOutcome` complete/error. Now checks both `RecordOutcome` and `Writeback` — when the event arrives, it verifies run status is terminal before sending `stream_end`. For non-ServiceNow runs, RecordOutcome sets status before its complete event. For ServiceNow runs, RecordOutcome defers status → WS stays open → Writeback sets status before its terminal event → WS closes.

**Key architecture decisions:**
- **ServiceNow credentials stored server-side** — instance_url, username, password are persisted in `InMemoryServiceNowConfigStore` (future: Postgres). The access_token for Google Drive remains client-side/per-request, but ServiceNow creds are stored because writeback happens asynchronously after the run starts.
- **Writeback does not fail the run** — The resolution result is already recorded in RecordOutcome. If ServiceNow PATCH fails (network, auth, permissions), the error is logged as an event but the run still shows as completed with its result.
- **Deferred status pattern** — RecordOutcome stores the result without changing status when writeback follows. This prevents the WebSocket from closing prematurely while Writeback is still in progress.
- **Shared secret auth for external trigger** — The `/runs/from/servicenow` endpoint uses `tenant_secret` (generated during activation) rather than OAuth. This is suitable for ServiceNow webhook/scripted REST integrations.
- **format_work_notes is pure** — The formatter is a standalone function, easy to test and modify without touching the provider class.

**What GPT should know for next steps:**
- ServiceNow integration is complete end-to-end: config → trigger → orchestrate → writeback.
- The ServiceNow "Test Connection" button in the wizard currently just persists config — it doesn't actually test the connection to ServiceNow. A dedicated test endpoint could be added in a future sprint.
- WritebackSkill only fires for `source_system == "servicenow"` runs. UI-created runs (`source_system == "ui"`) skip it entirely.
- The `ServiceNowRunRequest.access_token` field is optional — it's used for Google Drive document search during the run. If omitted, the run still works but document retrieval may fail.
- `SKILL_ORDER` in RunsPage now includes Writeback, so it always shows in the timeline (as "pending" for non-ServiceNow runs). A future improvement could hide it dynamically based on source_system.

---

## #009 — 2026-03-02 — Feedback Capture + Minimal Evaluation Metrics

**What happened:**
Added a lightweight feedback loop: users can mark completed runs as success/fail from the RunsPage, and an admin metrics endpoint aggregates key performance indicators per tenant. This closes the evaluation loop described in the architecture docs (09_EVALUATION_AND_FEEDBACK).

**Files modified:**

- `backend/models.py` — Added 3 models:
  - `FeedbackEvent(id, tenant_id, run_id, work_id, outcome: "success"|"fail", reason: "resolved"|"partial"|"wrong-doc"|"missing-context"|"other", notes, classification_path, timestamp)` — Stored feedback record, one per run (resubmit overwrites)
  - `CreateFeedbackRequest(tenant_id, run_id, outcome, reason, notes)` — Request body for feedback submission
  - `MetricsResponse(total_runs, completed_runs, success_rate, avg_confidence, doc_hit_rate, avg_latency_seconds, writeback_success_rate, feedback_count, breakdown_by_classification_path)` — Aggregated tenant metrics, nullable fields return `None` when insufficient data

- `backend/store/interface.py` — Added `FeedbackStore` ABC:
  - `append(event: FeedbackEvent) -> FeedbackEvent`
  - `get_by_run(run_id: str) -> Optional[FeedbackEvent]`
  - `list_for_tenant(tenant_id: str) -> list[FeedbackEvent]`

- `backend/store/memory.py` — Added `InMemoryFeedbackStore`:
  - `_feedback: dict[str, FeedbackEvent]` keyed by `run_id` — one feedback per run, resubmit overwrites
  - `append` stores/overwrites by `run_id`
  - `get_by_run` is a dict lookup
  - `list_for_tenant` filters by `tenant_id`

- `backend/store/__init__.py` — Re-exports `FeedbackStore` and `InMemoryFeedbackStore`.

- `backend/main.py` — Added `app.state.feedback_store = InMemoryFeedbackStore()`.

- `backend/routers/runs.py` — Added 2 endpoints:
  - `POST /api/runs/feedback` — Body: `CreateFeedbackRequest`. Validates run exists and tenant matches. Derives `classification_path` by joining `run.work_object.classification` values with "/". Derives `work_id` from `run.work_object.work_id`. Generates `id` as `fb_{uuid4_hex[:12]}`. Stores via `feedback_store.append()`. Returns the `FeedbackEvent`.
  - `GET /api/runs/feedback/{run_id}?tenant_id=...` — Returns existing feedback for a run, or `null` if none exists.

- `backend/routers/admin.py` — Added 1 endpoint:
  - `GET /api/admin/{tenant_id}/metrics` — Computes aggregated metrics from run_store, event_store, and feedback_store:
    - `total_runs` / `completed_runs`: count from `run_store.list_runs_for_tenant`
    - `success_rate`: feedback with `outcome=="success"` / total feedback (`None` if no feedback)
    - `avg_confidence`: mean of `run.result["confidence"]` for completed runs with results (`None` if none)
    - `doc_hit_rate`: fraction of completed runs where `run.result["sources"]` is non-empty (`None` if none)
    - `avg_latency_seconds`: mean of `(completed_at - started_at).total_seconds()` for completed runs (`None` if none)
    - `writeback_success_rate`: runs with a Writeback "complete" event / runs with any Writeback event (`None` if no writeback runs)
    - `breakdown_by_classification_path`: top 10 classification paths by feedback count, with per-path success_rate and count

- `src/app/services/api.ts` — Added types and functions:
  - `FeedbackEventResponse` interface — matches backend `FeedbackEvent`
  - `MetricsResponse` interface — matches backend `MetricsResponse`
  - `submitFeedback(tenantId, runId, outcome, reason, notes)` → `POST /api/runs/feedback`
  - `getFeedback(runId, tenantId)` → `GET /api/runs/feedback/{runId}?tenant_id=...`
  - `getMetrics(tenantId)` → `GET /api/admin/{tenantId}/metrics`

- `src/app/pages/RunsPage.tsx` — Added feedback form and metrics summary:
  - **Metrics panel** (left column, below runs list header): 2x2 grid showing success rate %, avg confidence %, doc hit rate %, total runs. Fetched on tenant change via `getMetrics()`. Displays "—" when metric is null.
  - **Feedback form** (right column, after result panel for completed runs):
    - Two toggle buttons: "Success" (green outline when selected) / "Fail" (red outline when selected)
    - `<select>` for reason: resolved, partial, wrong-doc, missing-context, other
    - Optional notes `<textarea>`
    - Submit button with loading state
    - Loads existing feedback when selecting a completed run (`getFeedback`)
    - After submission: shows "Feedback Recorded" with CheckCircle icon, button changes to "Resubmit"
    - Resubmit overwrites existing feedback and refreshes metrics
  - New imports: `CheckCircle` from lucide-react
  - New state: `fbOutcome`, `fbReason`, `fbNotes`, `fbSubmitting`, `fbRecorded`, `metrics`

**Updated project structure:**
```
backend/
├── models.py                      # Added FeedbackEvent, CreateFeedbackRequest, MetricsResponse
├── store/
│   ├── __init__.py                # Re-exports FeedbackStore, InMemoryFeedbackStore
│   ├── interface.py               # Added FeedbackStore ABC
│   └── memory.py                  # Added InMemoryFeedbackStore
├── routers/
│   ├── runs.py                    # Added POST /feedback + GET /feedback/{run_id}
│   └── admin.py                   # Added GET /metrics
└── main.py                        # Added feedback_store

src/app/
├── services/
│   └── api.ts                     # Added FeedbackEventResponse, MetricsResponse, submitFeedback, getFeedback, getMetrics
└── pages/
    └── RunsPage.tsx               # Added feedback form + metrics summary panel
```

**Key architecture decisions:**
- **One feedback per run, overwrite on resubmit** — `InMemoryFeedbackStore` is keyed by `run_id`. Resubmitting feedback replaces the previous entry. This keeps the model simple and avoids feedback versioning complexity.
- **classification_path derived at submit time** — The feedback endpoint joins `work_object.classification` values with "/" to create a path string used for breakdown aggregation. This means the classification is baked into the feedback record, not re-derived at query time.
- **Nullable metrics** — Each metric returns `None` when there's insufficient data to compute it (e.g., `success_rate` is `None` when no feedback exists). The frontend shows "—" for null values.
- **Metrics computed on-read** — No pre-aggregation or caching. The metrics endpoint iterates all runs, events, and feedback for the tenant on each request. Acceptable for MVP; would need caching or materialized views at scale.
- **Writeback success rate from events** — Computed by scanning event_store for Writeback skill events per run, rather than adding a writeback status field to the run model. This avoids model changes and leverages existing event data.
- **Feedback form always visible for completed runs** — Even runs without a result panel show the feedback form. This ensures feedback can be captured regardless of result display.
- **Metrics refresh on feedback submit** — After submitting feedback, the frontend immediately re-fetches metrics so the left panel numbers update without a page refresh.

**What GPT should know for next steps:**
- Feedback capture is live: users can rate any completed run from the RunsPage.
- The metrics endpoint aggregates across all runs/feedback for a tenant — it's a read-only summary, not a detailed report.
- `breakdown_by_classification_path` is limited to top 10 by count. For tenants with many classification paths, this provides a useful overview.
- The feedback store is in-memory — data is lost on server restart. Future sprints should persist to Postgres alongside other stores.
- No feedback validation against run status — users can technically submit feedback for any run, though the UI only shows the form for completed runs.
- The metrics panel is minimal (numbers only, no charts). A future sprint could add time-series visualizations or trend indicators.

---

## #010 — 2026-03-02 — Design Polish Pass on Agent Worker Surface

**What happened:**
Applied a styling-only polish pass to the RunsPage to align with the reference design system (`src.zip` component kit). No layout changes, no new features, no backend modifications, no data contract changes. All changes are purely visual.

**Files modified:**

- `src/app/pages/RunsPage.tsx` — UI styling updates throughout:

  - **Status badge:** "Completed" text replaced with **"Resolution Ready"**. Badge restyled as a muted blue pill: `bg-blue-50 text-blue-700 border border-blue-200 font-semibold text-[14px] rounded-full`. Calm, not celebratory. Other statuses also updated to pill style with subtle borders.

  - **Result panel heading:** Changed from "Result" to **"Recommended Resolution"**. Added evidence line below: `"Based on {n} knowledge source(s)"` in `text-xs text-gray-400`, only rendered when `sources.length > 0`.

  - **Resolution summary text:** Brightness reduced from default foreground to `text-gray-500` for a softer read.

  - **Confidence bar:** Slimmed from `h-2` to `h-1.5`, track lightened to `bg-gray-100`, fill changed to `bg-blue-500`. Moved above steps for better visual flow.

  - **Resolution steps:** Spacing tightened from `space-y-2` to `space-y-0.5`. Numbered circles added (`w-5 h-5 rounded-full bg-blue-50 text-blue-600`). Step text softened to `text-gray-600`. Rows have `hover:bg-gray-50` with `rounded-md`. Section label renamed from "Recommended Steps" to "Resolution Steps".

  - **Sources section:** Renamed from "Sources" to "Knowledge Sources". Links restyled with `group` hover: text goes `text-gray-500 → text-gray-800`, icon goes `text-gray-400 → text-blue-500`. Spacing tightened to `space-y-1`.

  - **Incident context collapsed by default:** Work object description wrapped in a `<details>` element (closed by default). Summary line reads "Incident Context" with a `ChevronRight` icon that rotates 90° on open via CSS. Classification pairs shown as small rounded pills inside the expanded section.

  - **Active skill in timeline:** Running skills get: left accent border (`border-l-[3px] border-l-blue-500`), subtle elevation (`shadow-sm`), tinted background (`bg-blue-50/40`), bold title. No heavy animation — just a clean active indicator. Timeline spacing tightened from `space-y-3` to `space-y-2`.

  - **Primary button (feedback submit):** Changed from `bg-blue-600` to darker enterprise green (`bg-emerald-700`, `hover:bg-emerald-800`, `active:bg-emerald-900`). Height shortened from `py-2` to `py-1.5`. `Check` icon added on the left (replaced by `Loader2` spinner during submit). Added `font-medium`.

  - **Feedback form inputs:** Height reduced on outcome toggles, select, and textarea (`py-2` → `py-1.5`).

  - **New import:** `Check` from `lucide-react` (for the primary button icon).

- `src/styles/theme.css` — Added CSS rules for `<details>` element:
  - `details[open] > summary .details-open-rotate { transform: rotate(90deg); }` — Rotates the chevron icon when expanded
  - `details > summary .details-open-rotate { transition: transform 150ms ease; }` — Smooth rotation transition
  - `details > summary::-webkit-details-marker, details > summary::marker { display: none; }` — Hides the browser's default disclosure triangle

**Files NOT modified:**
- No backend files changed
- No API calls changed
- No types or data contracts changed
- `api.ts` unchanged
- No new dependencies added

**Design decisions:**
- **"Resolution Ready" over "Completed"** — Matches the reference design's language. Signals that the result is ready for review, not that a process finished. Muted blue (not green) keeps the tone professional and calm.
- **Evidence line is conditional** — Only appears when sources exist, avoiding misleading "Based on 0 sources" text.
- **Collapsed incident context** — Reduces visual noise on the detail view. The context is still accessible with one click. Classification pairs are shown as pills for scannability.
- **Active skill treatment is subtle** — Left border + light shadow + tint. No bounce, no pulse on the card itself (the status dot still pulses). This keeps the timeline scannable during a run without visual distraction.
- **Enterprise green for primary action** — `emerald-700` reads as "confirm/approve" in enterprise UI patterns. Darker tone avoids the "gaming" feel of bright greens. Check icon reinforces the action intent.
- **Native `<details>` for collapsible** — No new dependency needed. The CSS rules handle chevron rotation and marker hiding cleanly.

**What GPT should know for next steps:**
- This was a styling-only pass. All functional behavior is unchanged.
- The `<details>` element uses a CSS class `details-open-rotate` for chevron animation — any future collapsible sections can reuse this pattern.
- The status badge now uses `rounded-full` pill styling with subtle borders across all states (not just completed).
- The result panel has a more structured hierarchy: heading → evidence line → summary → confidence → steps → sources → run ID.
- The feedback form button is now green (`emerald-700`) while the "Start Run" button remains blue (`blue-600`) — this distinguishes creation from confirmation actions.

---

## #011 — 2026-03-02 — Structured Agent Trace UI

**What happened:**
Replaced the flat event list inside expanded skill cards with a structured execution trace renderer. When a skill is expanded in the timeline, events are now grouped by execution phase (Intent, Tool Call, Result, Error, Completion) instead of displayed as a raw chronological list. This is a UI-only enhancement — no backend, API, type, or data contract changes.

**Files modified:**

- `src/app/pages/RunsPage.tsx` — Added `SkillTrace` component and replaced the expanded skill content:

  - **`SkillTrace` component** — New inline component that receives a skill's events array and renders structured sections:

    - **Intent** — Shows the first `thinking` event's summary. Styled `text-sm text-gray-500` with a `text-xs font-medium text-gray-400` label.

    - **Tool Call** — Shows the `tool_call` event summary inside a `rounded-md bg-gray-50 border border-gray-200 p-3` card. Renders metadata below the summary when available:
      - `model` — e.g. "Model: claude-sonnet-4-20250514"
      - `latency_ms` — e.g. "342ms"
      - `tool_name` — e.g. "Tool: search_documents"
      - All metadata rendered as `text-xs text-gray-400` in a flex-wrap row.

    - **Result** — Shows the `tool_result` event summary as `text-sm text-gray-600`. Renders metadata below when available:
      - `confidence` — from the event's `confidence` field, rendered as percentage
      - `doc_count` — from metadata
      - `model` — from metadata
      - `latency_ms` — from metadata

    - **Error** — Shows the `error` event summary inside a `rounded-md bg-red-50 border border-red-200 p-3` card. Error text styled `text-sm text-red-600`.

    - **Completion** — Two optional indicators:
      - If `metadata.fallback === true`: shows "Fallback used" in `text-xs text-amber-600`
      - If timestamps exist on first and last events and diff > 0: shows "Completed in {N}ms" in `text-xs text-gray-400`

  - **`m()` helper** — Type-safe metadata accessor: `m(obj, key)` returns `String(value)` if the key exists and is non-null, otherwise `undefined`. Avoids TypeScript `unknown` → `ReactNode` errors when rendering metadata values inline.

  - **Expanded skill panel** — The old content (`<ul>` of raw events with `event_type` labels) replaced with `<SkillTrace events={skill.events} />`. Panel retains `bg-gray-50` background, adds `border-t border-gray-100` separator and `pt-2` top padding.

  - **Sections use `space-y-2`** between trace sections for compact vertical rhythm.

**What was NOT changed:**
- Timeline layout, skill card structure, toggle behavior
- Badge styling, result panel, button styling
- Backend code, API calls, types, event schema
- No new dependencies added
- No new hex colors — all use existing Tailwind tokens

**Key design decisions:**
- **Phase grouping over chronological list** — Events are grouped by `event_type` rather than listed in order. This surfaces the important information (what the skill intended, what tool it called, what result it got) without requiring the user to scan through raw event logs.
- **Metadata is opportunistic** — Each section only renders metadata fields that are actually present. Skills that don't emit `latency_ms` or `model` just show the summary. This handles the variation between skills (ValidateInput has no tool call, SynthesizeResolution has model/latency metadata).
- **No scrolling inside skill panel** — The trace content is compact enough to render inline without overflow. Each section is 1-3 lines maximum.
- **Fallback indicator uses amber** — Not red (it's not an error) and not gray (it should be noticeable). Amber signals "degraded but functional" which accurately describes the fallback synthesis path.
- **Duration from timestamp diff** — Calculated as `last_event.timestamp - first_event.timestamp` in milliseconds. Only shown when diff > 0 to avoid displaying "0ms" for skills that complete instantly.

**What GPT should know for next steps:**
- The `SkillTrace` component is defined inline in `RunsPage.tsx` — it could be extracted to its own file if the page grows further.
- The trace renderer uses `find()` to pick the first event of each type. If a skill emits multiple `tool_call` events, only the first is shown. This is acceptable for the current 4-skill chain but may need adjustment if skills become multi-step.
- The `m()` helper is a pattern for safely rendering `Record<string, unknown>` metadata values in JSX — reusable anywhere metadata needs to be displayed.
- The old flat event list is fully removed. There is no toggle or fallback to the old view.

---

## #012 — 2026-03-02 — Telemetry Extraction + Tenant Observability

**What happened:**
- Added backend-first telemetry extraction that computes structured per-run and per-skill metrics from existing event/run/feedback data.
- Created a new service module (`backend/services/telemetry.py`) with 4 pure functions for telemetry computation.
- Added 3 new admin API endpoints for observability dashboards.
- No frontend changes — this sprint is backend-only, preparing data for a future observability UI.

**Files modified:**
- `backend/models.py` — Added 5 new Pydantic models:
  - `SkillTelemetry` — per-skill metrics (status, duration, tool calls/errors, model, tokens, doc_count, fallback)
  - `RunTelemetry` — per-run metrics (duration, confidence, doc_hit, writeback, fallback, model, tokens, list of SkillTelemetry)
  - `ObservabilitySummaryResponse` — aggregate stats (total/completed/failed runs, 7d/30d counts, avg/p95 duration, avg confidence, doc hit rate, fallback rate, writeback success rate, model mix, top classification paths)
  - `ObservabilityTrendPoint` — daily data point (date, runs, success_rate, avg_confidence, fallback_rate, doc_hit_rate, avg_duration_ms)
  - `ObservabilityTrendsResponse` — container for 7d and 30d trend arrays

- `backend/store/interface.py` — Added `TelemetryStore` ABC with 3 methods:
  - `upsert(run_telemetry)` — insert or update by run_id
  - `get(run_id)` — retrieve cached telemetry
  - `list_for_tenant(tenant_id)` — all telemetries for a tenant

- `backend/store/memory.py` — Added `InMemoryTelemetryStore` implementing `TelemetryStore` with dict keyed by run_id.

- `backend/store/__init__.py` — Re-exported `TelemetryStore` and `InMemoryTelemetryStore`.

- `backend/main.py` — Wired `app.state.telemetry_store = InMemoryTelemetryStore()`.

- `backend/services/telemetry.py` — **New file.** Pure service module with:
  - `build_skill_telemetry(skill_id, skill_events)` → `SkillTelemetry` — Determines status (completed/failed/skipped), computes duration from first-to-last event timestamp diff, counts tool_calls and tool_errors, extracts model/latency/tokens/doc_count from latest tool_result metadata, checks for fallback flag.
  - `build_run_telemetry(run, events, feedback)` → `RunTelemetry` — Groups events by skill_id, builds SkillTelemetry for each (including SKILL_ORDER for canonical ordering), computes run-level duration/confidence/doc_hit/writeback/fallback/model/tokens.
  - `aggregate_observability(tenant_id, run_telemetries, feedback_map)` → `ObservabilitySummaryResponse` — Computes aggregate stats across all runs: counts, avg/p95 duration, avg confidence, doc hit rate, fallback rate, writeback success rate, model mix, top 10 classification paths with per-path success rate and avg confidence.
  - `compute_trends(run_telemetries, window_days, feedback_map)` → `list[ObservabilityTrendPoint]` — Groups runs by date within window, computes daily metrics. Generates entries for all days in window (empty days get runs=0). Success rate uses feedback outcome when available, falls back to run status.

- `backend/routers/admin.py` — Added 3 endpoints + shared helper:
  - `_build_tenant_telemetries(tenant_id, request)` — Iterates all completed/failed runs for tenant, checks telemetry_store cache first, otherwise builds telemetry on-demand and upserts to cache. Returns `(list[RunTelemetry], dict[str, FeedbackEvent])`.
  - `GET /api/admin/{tenant_id}/observability/summary` → `ObservabilitySummaryResponse`
  - `GET /api/admin/{tenant_id}/observability/trends?window=7|30` → `ObservabilityTrendsResponse` (defaults to both windows)
  - `GET /api/admin/{tenant_id}/observability/runs?limit=50` → `list[RunTelemetry]` (newest first, limit 1-500)

**Key design decisions:**
- **On-demand computation, no background jobs** — Telemetry is computed when the observability endpoints are called, not on a schedule. This keeps the system simple and stateless. The telemetry_store acts as a cache to avoid recomputing for the same run.
- **SKILL_ORDER canonical ordering** — Skills appear in pipeline order (ValidateInput → RetrieveDocs → SynthesizeResolution → RecordOutcome → Writeback) regardless of the order events arrived. Extra skills not in the canonical list appear at the end.
- **Feedback-aware success rate** — Both `aggregate_observability` and `compute_trends` prefer feedback outcome over run status when computing success rates. If a user marked a completed run as "fail", it counts as a failure.
- **P95 duration uses sorted array** — `math.ceil(0.95 * n) - 1` index on sorted durations. Simple and correct for the expected data sizes.
- **Telemetry cache is write-once** — Once a run's telemetry is computed and cached, it's returned from cache on subsequent requests. This means if feedback is submitted after the first observability query, the cached RunTelemetry won't reflect the feedback change (but the feedback_map passed to aggregation functions will).
- **Pure functions in service module** — `telemetry.py` has no side effects and no store dependencies. All data is passed in as arguments, making the functions easy to test.

**What GPT should know for next steps:**
- The 3 observability endpoints are ready for a frontend dashboard. The summary endpoint provides all the data needed for a KPI panel, trends provides daily time series for charts, and runs provides the detail table.
- The `_build_tenant_telemetries` helper does N+1 queries (one per run for events + feedback). This is fine for the in-memory store but would need optimization (batch queries) for a database-backed store.
- The telemetry cache in `InMemoryTelemetryStore` never invalidates. If a run's events change after telemetry is cached (unlikely but possible), the cached version is stale. For MVP this is acceptable.
- The `ObservabilityTrendsResponse` model supports returning 7d and 30d independently or together. The `?window=7` and `?window=30` query params control which is returned.
- No frontend changes were made. The next sprint could add an observability dashboard page consuming these endpoints.

---

## #013 — 2026-03-02 — Integrate Observability Page (Admin UI)

**What happened:**
- Added a new Observability page at `/admin/observability` consuming the three backend observability endpoints from sprint #012.
- Added sidebar navigation item with `BarChart3` icon.
- Added route entry in `routes.tsx`.
- Added observability types and 3 API functions to `api.ts`.
- Strictly frontend-only — no backend changes.

**Files created:**
- `src/app/pages/ObservabilityPage.tsx` — Full observability dashboard page with 5 sections:
  - **Section 1 — Impact Overview**: 4 KPI cards in responsive grid (Total Runs, Avg Confidence, Avg Resolution Time, Writeback Success). Each card has large number, optional sparkline from trend data, and % change vs previous period computed from first-half/second-half trend averages.
  - **Section 2 — Quality Signals**: Two-column layout. Left: Fallback Rate + Doc Hit Rate. Right: Avg Duration + P95 Duration. Uses `CompactMetric` tiles.
  - **Section 3 — Model & Outcome Correlation**: 2x2 grid showing High/Low Confidence x Completed/Failed percentages derived from the runs list. Uses `CorrelationCell` with tinted backgrounds (green/red/yellow/blue).
  - **Section 4 — Top Classification Paths**: Table with path, runs count, success rate, avg confidence. Limited to 5 rows from summary endpoint.
  - **Section 5 — Recent Errors**: Last 3 failed runs from `/observability/runs` endpoint. Shows timestamp, failed skill badge, and error description in red.
  - **Loading state**: Skeleton placeholders with `animate-pulse` for KPI cards and quality panels.
  - **Error state**: Red banner with `AlertCircle` icon.
  - **Empty state**: Message when no runs exist.
  - **No-tenant state**: Prompt to select a tenant.

- Sub-components defined inline in ObservabilityPage.tsx:
  - `Sparkline` — SVG polyline from numeric array, configurable color
  - `MetricCard` — KPI card with label, large value, optional trend badge, optional sparkline, optional subtext
  - `MetricCardSkeleton` — Loading placeholder matching MetricCard dimensions
  - `CompactMetric` — Compact label + large number tile for quality/performance section
  - `CorrelationCell` — Tinted card with percentage and label for the 2x2 matrix

- Helper functions:
  - `fmt(n, suffix, decimals)` — Format nullable number with suffix
  - `fmtMs(ms)` — Format milliseconds as "Xms" or "X.Xs"
  - `fmtPct(n)` — Format 0-1 ratio as "X.X%"
  - `trendVal(point, key)` — Type-safe accessor for ObservabilityTrendPoint fields by string key
  - `computeChange(trendPoints, key)` — Compute % change between first and second half of trend window

**Files modified:**
- `src/app/routes.tsx` — Added `import { ObservabilityPage }` and route `{ path: 'admin/observability', Component: ObservabilityPage }`.

- `src/app/components/Sidebar.tsx` — Added `BarChart3` to lucide imports. Added `{ name: 'Observability', path: '/admin/observability', icon: BarChart3 }` to navItems between Runs and Settings.

- `src/app/services/api.ts` — Added observability types and functions:
  - `SkillTelemetryResponse` — per-skill telemetry shape
  - `RunTelemetryResponse` — per-run telemetry shape with skills array
  - `ObservabilitySummaryResponse` — aggregate stats shape
  - `ObservabilityTrendPoint` — daily data point shape
  - `ObservabilityTrendsResponse` — 7d + 30d trend arrays
  - `getObservabilitySummary(tenantId)` → GET `/api/admin/{id}/observability/summary`
  - `getObservabilityTrends(tenantId, window?)` → GET `/api/admin/{id}/observability/trends`
  - `getObservabilityRuns(tenantId, limit?)` → GET `/api/admin/{id}/observability/runs`

**Key design decisions:**
- **Date range is client-side filtering** — The `Last 7 days / Last 30 days` dropdown switches between `trends.last_7d` and `trends.last_30d` arrays and between `summary.runs_last_7d` and `summary.runs_last_30d` counts. Both windows are fetched in a single API call (no `?window=` param needed).
- **Change % computed from trend halves** — The trend change badge splits the trend array at the midpoint and compares the average of the second half to the first half. This gives a meaningful "trending up/down" signal without needing a separate previous-period API call.
- **Correlation matrix derived from runs** — The 2x2 confidence/outcome matrix is computed from the `/observability/runs` response. Confidence >= 0.7 is "high", status determines completed/failed. This avoids needing a dedicated backend endpoint.
- **No chart library** — Sparklines are pure SVG polylines. No recharts/chart.js/d3 dependency added.
- **Inline sub-components** — All sub-components (Sparkline, MetricCard, etc.) are defined in ObservabilityPage.tsx. They can be extracted if reused elsewhere.
- **Type-safe trend access** — `trendVal()` switch function avoids TypeScript index signature issues with the `ObservabilityTrendPoint` interface.

**What GPT should know for next steps:**
- The page is fully functional but shows empty/zero states when no runs exist. To see data, create and complete runs first.
- The correlation matrix uses run status (completed/failed) not feedback outcome, since feedback is not included in the RunTelemetry response. A future enhancement could add feedback data to the runs endpoint.
- The sparkline component handles edge cases (< 2 data points returns null, zero range uses 1 to avoid division by zero).
- Sub-components could be extracted to `src/app/components/observability/` if the page grows or components are reused.
- The date range dropdown triggers a re-render with different data slices but does NOT re-fetch from the backend.

---

## #014 — 2026-03-02 — Outcome & Metrics Instrumentation

**What happened:**
- Normalized the feedback model with `confidence_at_time` for point-in-time capture.
- Added `fallback_completed` canonical run state to distinguish fallback synthesis paths.
- Created lightweight `MetricsEvent` audit trail emitted from orchestrator and route handlers.
- Enhanced observability summary with `model_latency_avg` and `confidence_outcome_matrix`.
- Backend-only sprint — no frontend changes.

**Files modified:**

- `backend/models.py`:
  - `FeedbackEvent` — Added `confidence_at_time: Optional[float] = None` field. Existing `timestamp` serves as `created_at`.
  - `AgentRun.status` — Extended Literal to include `"fallback_completed"` alongside existing states.
  - `RunTelemetry.status` — Extended Literal to include `"fallback_completed"`.
  - `MetricsEvent` — **New model.** Fields: `id`, `tenant_id`, `run_id`, `event_type` (Literal of 7 types), `skill_name` (nullable), `metadata` (json), `created_at`.
  - `ObservabilitySummaryResponse` — Added `model_latency_avg: Optional[float]` and `confidence_outcome_matrix: list[dict[str, Any]]`.

- `backend/store/interface.py` — Added `MetricsEventStore` ABC with `append`, `list_for_run`, `list_for_tenant`.

- `backend/store/memory.py` — Added `InMemoryMetricsEventStore` using a flat list with filter-on-read.

- `backend/store/__init__.py` — Re-exported `MetricsEventStore` and `InMemoryMetricsEventStore`.

- `backend/main.py` — Wired `app.state.metrics_event_store = InMemoryMetricsEventStore()`.

- `backend/routers/runs.py`:
  - `create_run` + `create_run_from_servicenow` — Emit `run_started` MetricsEvent. Pass `metrics_event_store` to orchestrator.
  - `submit_feedback` — Extract `confidence_at_time` from run result and set on FeedbackEvent. Emit `feedback_recorded` MetricsEvent.
  - WebSocket handler — Added `_TERMINAL_STATUSES` tuple including `"fallback_completed"` for terminal state checks.

- `backend/services/orchestrator.py`:
  - Added `metrics_event_store` optional parameter (backward compatible).
  - Added `emit_metric` helper for MetricsEvent emission.
  - Emits: `skill_started`/`skill_completed` for each skill, `tool_called`/`tool_failed` for Drive search and Claude synthesis, `run_completed` at terminal.
  - Uses `fallback_completed` status when fallback synthesis was used, `completed` otherwise.

- `backend/services/telemetry.py`:
  - `build_run_telemetry` — Sets `status="fallback_completed"` when run completed with `fallback_used=True`.
  - `aggregate_observability` — Treats `fallback_completed` as completed in count/rate calculations. Adds `model_latency_avg` (mean of skill-level `model_latency_ms`). Adds `confidence_outcome_matrix` (4-cell grid: high/low confidence x positive/negative outcome using feedback or status).
  - `compute_trends` — Treats `fallback_completed` as success in daily success rate.

- `backend/routers/admin.py` — Updated `_build_tenant_telemetries` to include `fallback_completed` in terminal status check.

**Key design decisions:**
- **`fallback_completed` is a backend-only state for now** — The orchestrator sets it when fallback synthesis was used. The frontend currently checks `status === 'completed'` — `fallback_completed` runs will appear in the list but the result panel won't render until a future frontend update. This is acceptable as a backend instrumentation sprint.
- **MetricsEvent is append-only** — No update or delete operations. The store is a flat list filtered on read. This is sufficient for MVP; a real deployment would use a time-series database.
- **`emit_metric` is fire-and-forget** — If `metrics_event_store` is None (backward compat), metrics are silently skipped. No error propagation from metric emission to the main skill chain.
- **`confidence_at_time` captures run confidence at feedback submission** — This enables tracking whether high-confidence runs correlate with positive feedback over time, independent of later telemetry recalculations.
- **Confidence outcome matrix uses 0.7 threshold** — Confidence >= 0.7 is "high", < 0.7 is "low". Positive outcome prefers feedback when available, falls back to run status.

**What GPT should know for next steps:**
- The frontend Observability page (sprint #013) can now consume the new `confidence_outcome_matrix` and `model_latency_avg` fields from the summary endpoint — currently it derives the matrix client-side from runs data, but the backend-computed version is now available.
- The `fallback_completed` status needs a frontend update to display properly in RunsPage. Currently those runs show in the list but the result panel gate (`status === 'completed'`) won't match.
- The `MetricsEvent` store is in-memory and will lose data on restart. It's a diagnostic/audit layer, not critical path.
- The 7 event types cover the full run lifecycle. The `metadata` field carries context-specific data (error messages, tool names, sys_ids, etc.).

*Next change will be #015.*
