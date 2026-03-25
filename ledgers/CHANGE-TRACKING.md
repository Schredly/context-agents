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

---

## #015 — 2026-03-02 — ServiceNow Round-Trip Validation

**What happened:**
Added explicit writeback success/failure tracking. Writeback failures now correctly fail the run. Writeback success rate is computed from MetricsEvents instead of inferred from run telemetry. Debug logging added to the ServiceNow provider for integration testing.

**Files modified:**

- `backend/models.py` — Added `"writeback_success"` and `"writeback_failed"` to MetricsEvent `event_type` Literal (now 9 types total).

- `backend/services/servicenow.py`:
  - Added `import logging` and module-level `logger = logging.getLogger(__name__)`.
  - `update_work_notes` — Added `tenant_id` keyword argument for debug logging context. Emits `logger.debug` on writeback start (tenant_id, sys_id, url) and success (tenant_id, sys_id, http_status). Emits `logger.error` on failure (tenant_id, sys_id, http_status, error message).

- `backend/services/orchestrator.py` — Writeback section rewritten:
  - **Writeback failure → run status "failed"**: Previously, writeback errors kept the run as `completed` or `fallback_completed`. Now `run_store.update_run` sets `status="failed"` on writeback error, and `terminal_status` is updated to `"failed"` so the final `run_completed` MetricsEvent reflects the true outcome.
  - **Explicit MetricsEvents**: Emits `writeback_success` MetricsEvent with `{sys_id, tenant_id}` metadata on success. Emits `writeback_failed` MetricsEvent with `{sys_id, tenant_id, http_status, error_message}` metadata on failure. `http_status` is captured from `ServiceNowError.status_code` (None for non-ServiceNow exceptions).
  - Passes `tenant_id=tenant_id` to `snow_provider.update_work_notes()` for debug logging.
  - Extracts `sys_id` before the try block so it's available in both success and failure paths.

- `backend/services/telemetry.py`:
  - Added `MetricsEvent` to imports.
  - `aggregate_observability` — Added optional `metrics_events: list[MetricsEvent]` parameter. Writeback success rate computation now prefers MetricsEvents when available: counts `writeback_success` and `writeback_failed` events, computes rate as `success / (success + failed)`. Falls back to the existing RunTelemetry-based computation when no MetricsEvents are provided.

- `backend/routers/admin.py` — `get_observability_summary` now fetches `metrics_event_store.list_for_tenant(tenant_id)` and passes the result to `aggregate_observability` as the `metrics_events` parameter.

**Key design decisions:**
- **Writeback failure = run failure**: This is a deliberate choice. If the user configured ServiceNow writeback and it fails, the run's value proposition (automated resolution delivery) was not fulfilled. The run status should reflect this.
- **MetricsEvents as source of truth for writeback rate**: The `writeback_success`/`writeback_failed` events carry richer metadata (sys_id, http_status, error_message) than can be inferred from run status alone. The telemetry fallback path remains for backward compatibility with runs created before this change.
- **Debug logging is opt-in**: Uses Python's `logging` module at DEBUG level. No output by default — enable with `logging.basicConfig(level=logging.DEBUG)` or a logging config for integration tests.
- **`tenant_id` on update_work_notes is keyword-only**: Backward compatible — existing callers that don't pass it get an empty string default, and logging still works.

**What GPT should know for next steps:**
- MetricsEvent now has 9 event types: `run_started`, `skill_started`, `skill_completed`, `tool_called`, `tool_failed`, `run_completed`, `feedback_recorded`, `writeback_success`, `writeback_failed`.
- Runs with writeback failures now have `status="failed"`. The frontend should handle this case in RunsPage if it shows ServiceNow-sourced runs.
- The `writeback_failed` MetricsEvent metadata includes `http_status` (int or None) and `error_message` (str) — useful for debugging integration issues.
- The ServiceNow provider now logs at DEBUG level. Set `logging.getLogger("services.servicenow").setLevel(logging.DEBUG)` to see writeback traffic.

---

## #016 — 2026-03-02 — Controlled Integration Hardening + Failure Injection

**What happened:**
Added environment-based controlled failure injection for integration testing, a new admin diagnostics endpoint, and improved logging across all service providers. This sprint is backend-only and diagnostic-focused.

**Files modified:**

- `backend/models.py` — Added 2 new models:
  - `DiagnosticFailureEvent(run_id, event_type, skill_name, error_message, timestamp)` — Serialization model for recent failure events in the diagnostics response.
  - `IntegrationDiagnosticsResponse(drive_configured, claude_configured, servicenow_configured, last_writeback_status, last_writeback_error, recent_failure_events)` — Response model for the integration diagnostics endpoint.

- `backend/services/google_drive.py`:
  - Added `import logging, os` and module-level `logger`.
  - Added `injected: bool = False` attribute to `GoogleDriveError.__init__`.
  - `search_documents` — Checks `FAIL_DRIVE_SEARCH` env var at entry. If `"true"`, logs `"[INJECTED FAILURE] Drive search_documents: folder_id=..."` at WARNING level and raises `GoogleDriveError(503)` with `injected=True`.
  - Added error logging on real Drive search failures with `folder_id` and `http_status`.

- `backend/services/claude_client.py`:
  - Added `import logging` and module-level `logger`.
  - Added `injected: bool = False` attribute to `ClaudeClientError.__init__`.
  - `synthesize_resolution` — Checks `FAIL_CLAUDE_SYNTHESIS` env var before API key check. If `"true"`, logs `"[INJECTED FAILURE] Claude synthesis: model=..."` at WARNING level and raises `ClaudeClientError` with `injected=True`.
  - Added error logging on real Claude API failures with `model` and `http_status`.

- `backend/services/servicenow.py`:
  - Added `import os`.
  - Added `injected: bool = False` attribute to `ServiceNowError.__init__`.
  - `update_work_notes` — Checks `FAIL_SERVICENOW_WRITEBACK` env var before making HTTP call. If `"true"`, logs `"[INJECTED FAILURE] ServiceNow writeback: tenant_id=... sys_id=..."` at WARNING level and raises `ServiceNowError(503)` with `injected=True`.

- `backend/services/orchestrator.py`:
  - Reads `SLOW_DOWN_MS` env var once at the start of `run_orchestrator`. If > 0, adds `asyncio.sleep(slow_down_ms / 1000)` inside each skill execution after the "thinking" emit via `_injected_delay()` helper.
  - All catch blocks for `GoogleDriveError`, `ClaudeClientError`, and `ServiceNowError` now check `getattr(exc, 'injected', False)` and:
    - Add `"injected": True` to `tool_failed` MetricsEvent metadata when applicable.
    - Add `"injected": True` to `writeback_failed` MetricsEvent metadata when applicable.
    - Append `" [INJECTED]"` to agent event summaries for visibility in WebSocket stream.
  - Tracks `writeback_injected` bool separately for the writeback section.

- `backend/routers/admin.py`:
  - Added `import os`.
  - Added `DiagnosticFailureEvent` and `IntegrationDiagnosticsResponse` to model imports.
  - New endpoint: `GET /api/admin/{tenant_id}/integration-diagnostics`:
    - `drive_configured`: checks drive_config_store for root_folder_id.
    - `claude_configured`: checks `CLAUDE_API_KEY` env var.
    - `servicenow_configured`: checks snow_config_store for tenant.
    - `last_writeback_status`: most recent `writeback_success` or `writeback_failed` MetricsEvent → `"success"` or `"failed"`.
    - `last_writeback_error`: error_message from most recent `writeback_failed` event metadata.
    - `recent_failure_events`: last 10 `tool_failed` + `writeback_failed` MetricsEvents with run_id, event_type, skill_name, error_message, timestamp.

**Environment variables for failure injection:**
- `FAIL_DRIVE_SEARCH=true` — Drive `search_documents` throws controlled `GoogleDriveError(503)`.
- `FAIL_CLAUDE_SYNTHESIS=true` — `synthesize_resolution` throws controlled `ClaudeClientError` before API call.
- `FAIL_SERVICENOW_WRITEBACK=true` — `update_work_notes` throws controlled `ServiceNowError(503)` before HTTP call.
- `SLOW_DOWN_MS=<integer>` — Adds artificial delay (ms) inside each skill execution.

**Key design decisions:**
- **`injected` attribute on exception instances**: Each provider's error class has an `injected: bool = False` default attribute. Injection code sets it to `True` on the raised instance. The orchestrator reads it with `getattr(exc, 'injected', False)` to propagate the flag into MetricsEvent metadata without modifying existing exception interfaces.
- **Env var checked at call time, not import time**: Each injection check reads `os.environ.get(...)` at the moment of the call, so env vars can be toggled between runs without restarting the server.
- **SLOW_DOWN_MS read once per run**: Read at the start of `run_orchestrator` and applied uniformly to all skills in that run via `_injected_delay()`.
- **Diagnostics endpoint uses existing stores only**: No new store interfaces or implementations. Queries `drive_config_store`, `snow_config_store`, and `metrics_event_store` directly.
- **Observability schema unchanged**: No modifications to `ObservabilitySummaryResponse`, `ObservabilityTrendsResponse`, or any telemetry models. Injected failures flow through existing MetricsEvent and telemetry pipelines naturally.

**What GPT should know for next steps:**
- All three failure injection env vars default to off (unset or not `"true"`). Setting them requires no server restart.
- Injected failures are visible in: MetricsEvents (metadata.injected=true), agent events (summary includes " [INJECTED]"), and provider logs (prefixed with "[INJECTED FAILURE]").
- The diagnostics endpoint is useful for integration testing — check `GET /api/admin/{tenant_id}/integration-diagnostics` to see which integrations are configured and recent failures.
- SLOW_DOWN_MS affects all skills uniformly — use it to simulate slow processing for frontend/WebSocket testing.
- The `injected` attribute on exception classes is backward compatible — existing code that catches these exceptions without checking `.injected` will work unchanged.

---

## #017 — 2026-03-03 — ServiceNow Preview + Approve Writeback (Backend)

**What happened:**
Added a two-step ServiceNow worker flow: preview a run without writeback, then explicitly approve writeback after reviewing the result. This enables a safe UI pattern where a ServiceNow UI Action opens a compact Agent modal, the user reviews the AI resolution, and only then clicks "Update Task" to write back to ServiceNow.

**New request model:**

- `WritebackApproveRequest(tenant_secret, sys_id, note_prefix?)` — Request body for the writeback approve endpoint. `note_prefix` is optional and prepended to the formatted work notes.

**New endpoints:**

- `POST /api/runs/from/servicenow/preview` — Same body as `ServiceNowRunRequest`. Validates tenant + secret (same as existing endpoint). Creates `WorkObject` with `source_system="servicenow"`. Calls orchestrator with `allow_writeback=False` so writeback is skipped even if ServiceNow config exists. Returns `{run_id}`. MetricsEvent metadata includes `"preview": true`.

- `POST /api/runs/{run_id}/writeback/approve?tenant_id=...` — Body: `WritebackApproveRequest`. Validation chain:
  1. Tenant exists and is active
  2. `tenant_secret` matches
  3. Run exists and belongs to tenant
  4. Run status is `completed` or `fallback_completed`
  5. `work_object.source_system == "servicenow"`
  6. Run has a result
  7. ServiceNow config exists for tenant
  - Formats work notes using existing `format_work_notes()`, prepends optional `note_prefix`
  - PATCHes ServiceNow incident via `ServiceNowProvider.update_work_notes()`
  - Emits `writeback_success` or `writeback_failed` MetricsEvent with `"approved_writeback": true` metadata
  - On success: returns `{"ok": true}`
  - On failure: sets run status to `"failed"`, returns HTTP 502 with detail
  - If run was previously failed from a prior writeback attempt and is retried successfully, restores status to `"completed"`

**Files modified:**

- `backend/models.py` — Added `WritebackApproveRequest` model with 3 fields: `tenant_secret: str`, `sys_id: str`, `note_prefix: Optional[str] = None`.

- `backend/services/orchestrator.py` — Added `allow_writeback: bool = True` parameter to `run_orchestrator()`. When `False`, the writeback pre-flight check (`snow_config` lookup) is skipped, so `will_writeback` is always `False` and Skill E never runs. Default is `True` so all existing callers are unaffected.

- `backend/routers/runs.py` — Added 2 new endpoints (described above). Added imports: `os`, `datetime`, `timezone`, `Any`, `ServiceNowError`, `format_work_notes`, `WritebackApproveRequest`.

**Files NOT modified:**
- `backend/main.py` — No new stores or wiring needed
- `backend/store/` — No new store interfaces or implementations
- `backend/services/servicenow.py` — Reuses existing `format_work_notes()` and `ServiceNowProvider` as-is
- `backend/routers/admin.py` — No changes
- All frontend files — Backend-only sprint
- Observability response schemas — Unchanged

**Existing endpoint behavior preserved:**
- `POST /api/runs/from/servicenow` — Unchanged. Still calls orchestrator with `allow_writeback=True` (the default), so writeback proceeds automatically when ServiceNow config exists.

**Key architecture decisions:**
- **`allow_writeback` flag on orchestrator** — Simplest possible change: a single boolean that gates the existing writeback pre-flight check. No new skill states, no conditional skip logic. The orchestrator either checks for ServiceNow config or doesn't.
- **Approve endpoint is synchronous** — Unlike the orchestrator-driven writeback (which runs in a background task), the approve endpoint performs writeback inline and returns the result directly. This is appropriate because the user is actively waiting for confirmation.
- **`approved_writeback: true` in MetricsEvent metadata** — Distinguishes user-approved writebacks from orchestrator-driven writebacks in telemetry and diagnostics, without changing the MetricsEvent schema.
- **`note_prefix` prepended, not injected** — The optional prefix is added before the standard `format_work_notes()` output with a blank line separator. This keeps the formatted work notes structure intact.
- **Failure injection respected** — The approve endpoint uses the same `_snow` provider instance, so `FAIL_SERVICENOW_WRITEBACK=true` injection works for approved writebacks too. The `injected` flag propagates into MetricsEvent metadata.
- **Status restoration on retry** — If a run was previously failed due to writeback failure and the user retries via approve, the endpoint restores status to `completed`. The gate check (`completed`/`fallback_completed`) means this only applies to runs that were re-attempted after a status fix.

**What GPT should know for next steps:**
- The preview endpoint creates runs identical to the existing ServiceNow endpoint — same `WorkObject`, same skill chain (A→B→C→D) — just without Skill E (Writeback).
- The approve endpoint can be called multiple times on the same run (idempotent from ServiceNow's perspective — work_notes append, not replace).
- The frontend needs a compact Agent UI (browser modal) that: (1) calls `/from/servicenow/preview`, (2) connects to WebSocket for live events, (3) displays the result, (4) has an "Update Task" button that calls `/writeback/approve`.
- The `tenant_secret` is required on both endpoints — the compact UI will need it passed from the ServiceNow UI Action context.
- No changes to WebSocket protocol — preview runs terminate at RecordOutcome (Skill D) and emit `stream_end` normally.

---

## #018 — 2026-03-03 — Compact ServiceNow Worker UI (Popup Modal)

**What happened:**
Added a standalone popup page at `/worker/servicenow` designed to be opened from a ServiceNow UI Action in a small browser window (~520px). The page reads incident data from URL query parameters, runs a preview (no writeback), displays live skill traces and the AI resolution result, then lets the user approve writeback to ServiceNow with an "Update Task" button. This is a frontend-only sprint — no backend changes.

**Files created:**

- `src/app/pages/WorkerServiceNowPage.tsx` — Complete standalone page component:
  - **Query param parsing:** Reads `tenant_id`, `tenant_secret`, `sys_id`, `number`, `short_description` (required) and `description`, `category`, `subcategory`, `business_service`, `work_notes` (optional) from `window.location.search`. Missing required params render a compact error panel listing what's missing.
  - **Status pill:** Header displays "AI Resolution Assistant" title with a status pill cycling through: Ready → Running → Resolution Ready → Updated / Writeback Failed / Error.
  - **Section A — Incident Summary:** Collapsible `<details>` element (closed by default) showing `short_description`, classification pills (Category/Subcategory/Service from query params), description, and a work_notes snippet if present.
  - **Section B — Extra Context:** Textarea for optional user input appended to the description before the run. Only shown in "ready" state.
  - **Section C — Run Button:** Full-width "Run" button calling `createRunFromServiceNowPreview()`. Disabled during execution. Shows spinner while creating.
  - **Section D — Live Skill Trace:** Compact version of RunsPage's skill timeline. Shows 4 skills (ValidateInput → RetrieveDocs → SynthesizeResolution → RecordOutcome). Each skill card is expandable with a `SkillTrace` component rendering Intent / Tool Call / Result / Error / Completion sections. Active skill has left blue border accent and subtle shadow. All text sizes reduced (text-xs / text-[11px] / text-[10px]) for compact layout.
  - **Section E — Result Panel:** Rendered when run status is `completed` or `fallback_completed`. Shows "Recommended Resolution" heading, evidence line, fallback indicator (amber banner if applicable), summary text, confidence bar, numbered resolution steps, knowledge sources with external links, and run ID.
  - **Section F — Writeback Approval:** "Update Task" button (emerald-700, full width) enabled only when run is terminal with a result and not already updated. Calls `approveRunWriteback()`. On success: status becomes "Updated" with green confirmation banner. On failure: status becomes "Writeback Failed" with red banner and retry hint. Button shows spinner during the call.
  - **WebSocket lifecycle:** Connects via `connectRunEvents()` when `runId` is set. On `stream_end`, fetches the final run via `getRun()` to populate result panel. Cleans up on unmount.
  - **Classification mapping:** Builds classification array from query params: `category` → `{name:"Category", value}`, `subcategory` → `{name:"Subcategory", value}`, `business_service` → `{name:"Service", value}`.
  - **Own `<Toaster />`:** Since this page is outside DashboardLayout, it mounts its own sonner Toaster.
  - **Inline sub-components:** `SkillTrace` (compact version), `buildSkills()`, `statusPill()`, `getSkillStatusColor()`, `useQueryParams()`, `getMissingParams()`.

**Files modified:**

- `src/app/routes.tsx` — Added import of `WorkerServiceNowPage` and route entry `{ path: '/worker/servicenow', Component: WorkerServiceNowPage }` as a top-level route (outside the DashboardLayout children). This means no sidebar, no top bar — just the standalone page.

- `src/app/services/api.ts` — Added 2 functions + 1 interface:
  - `ServiceNowPreviewRequest` interface — Matches `ServiceNowRunRequest` backend model: `tenant_id`, `tenant_secret`, `sys_id`, `number`, `short_description`, `description?`, `classification?`, `metadata?`, `access_token?`.
  - `createRunFromServiceNowPreview(body)` → `POST /api/runs/from/servicenow/preview`. Returns `{run_id}`.
  - `approveRunWriteback(runId, tenantId, tenantSecret, sysId, notePrefix?)` → `POST /api/runs/{runId}/writeback/approve?tenant_id=...`. Body: `{tenant_secret, sys_id, note_prefix}`. Returns `{ok: boolean}`.
  - **Fix:** `AgentRunResponse.status` type updated from `'queued' | 'running' | 'completed' | 'failed'` to include `'fallback_completed'` — this was a pre-existing gap that prevented the frontend from correctly handling fallback runs.

**Files NOT modified:**
- No backend files changed
- `RunsPage.tsx` unchanged (existing admin UI untouched)
- `DashboardLayout.tsx` unchanged
- `Sidebar.tsx` unchanged — no nav entry for worker page (it's only opened from ServiceNow)
- No new dependencies added
- No style files changed (reuses existing `details-open-rotate` CSS from theme.css)

**Updated project structure:**
```
src/app/
├── pages/
│   ├── WorkerServiceNowPage.tsx   # NEW — Compact popup for ServiceNow workers
│   ├── RunsPage.tsx               # (unchanged)
│   ├── TenantsPage.tsx            # (unchanged)
│   ├── SetupWizardPage.tsx        # (unchanged)
│   └── ObservabilityPage.tsx      # (unchanged)
├── routes.tsx                     # Added /worker/servicenow route (top-level)
├── services/
│   └── api.ts                     # Added preview + approve functions, fixed status type
└── ...
```

**Key architecture decisions:**
- **Top-level route, not DashboardLayout child** — `/worker/servicenow` is a peer of the DashboardLayout route tree, not nested inside it. This means no sidebar, no top bar, no tenant context provider — the page is fully self-contained with all context from URL params. This is intentional for the popup use case.
- **All context from URL query params** — No React context, no localStorage, no auth flow. The ServiceNow UI Action passes everything the page needs via the URL. This makes the page stateless and embeddable.
- **Own Toaster instance** — Since DashboardLayout provides the Toaster for admin pages, and this page is outside that layout, it mounts its own `<Toaster />`.
- **Compact SkillTrace is a copy, not shared** — The SkillTrace component is duplicated from RunsPage with smaller text sizes rather than extracted to a shared component. This avoids coupling the worker page to admin page internals and keeps changes isolated.
- **SKILL_ORDER excludes Writeback** — The worker page only shows 4 skills (A→D) since preview runs never execute Skill E. This differs from RunsPage which includes Writeback in its SKILL_ORDER.
- **`fallback_completed` treated as terminal success** — Both `completed` and `fallback_completed` trigger the result panel and enable the "Update Task" button. The `TERMINAL_STATUSES` constant handles this consistently.
- **Extra context appended to description** — The optional textarea content is appended to the ServiceNow description with a separator, not sent as a separate field. This means it flows through the existing orchestrator pipeline without any backend changes.
- **No note_prefix** — The approve call omits `note_prefix` (sends null). The work notes are formatted using the standard `format_work_notes()` template. A future iteration could let the user customize this.

**ServiceNow UI Action URL pattern:**
```
/worker/servicenow?tenant_id=...&tenant_secret=...&sys_id=...&number=INC0012345&short_description=VPN+not+connecting&category=Network&subcategory=VPN&description=...
```

**What GPT should know for next steps:**
- The worker page is fully functional end-to-end: URL params → preview run → WebSocket events → result display → writeback approval.
- The `AgentRunResponse.status` type now correctly includes `fallback_completed`. RunsPage still gates result rendering on `status === 'completed'` only — a future fix could update it to also show results for `fallback_completed` runs.
- The worker page doesn't use `useTenants()` or `useGoogleAuth()` — it's entirely self-contained from URL params. No Google OAuth token is available in the popup context, so `access_token` is omitted from the preview request.
- The `ServiceNowPreviewRequest` interface mirrors the backend `ServiceNowRunRequest` model exactly — the same body shape works for both endpoints.
- The SkillTrace duplication between RunsPage and WorkerServiceNowPage could be extracted to a shared component in a future refactoring sprint if needed.

*Next change will be #019.*

---

## #019 — 2026-03-03 — ServiceNow UI Action Documentation (PDF Deliverable)

**What happened:**
Generated a copy/paste-ready PDF documenting the ServiceNow-side configuration needed to launch the Agent worker popup from an Incident form. This is a documentation-only sprint — no application code changes. The PDF provides everything a ServiceNow admin needs to wire up the UI Action button that opens `/worker/servicenow`.

**Deliverable:**
- `Sprint_19_ServiceNow_UI_Action.pdf` — 6-page PDF generated via `generate_sprint19_pdf.py` (using fpdf2).

**PDF contents:**

1. **System Properties** — Three `x_agent.*` properties to create in ServiceNow (base_url, tenant_id, tenant_secret) with types, example values, role restrictions (itil read / admin write).

2. **UI Action Record** — Full field-by-field configuration table for creating the "AI Resolution Assistant" button on the incident table. Key settings: Client=true, Form button=true, Show insert=false, Show update=true, Condition=`current.state != 7`, Roles=itil, Onclick=`aiResolutionAssistant()`.

3. **UI Action Script** — Complete `aiResolutionAssistant()` function that:
   - Reads config from `gel()` hidden fields (UI16) with fallback to `window._agent*` globals (Next Experience)
   - Validates config is present, shows `g_form.addErrorMessage()` if missing
   - Reads incident fields via `g_form`: sys_id, number, short_description (required), category, subcategory, business_service, description (optional, truncated to 2000 chars)
   - Uses `getDisplayValue()` for category/subcategory/business_service (friendlier strings)
   - Builds URL with `encodeURIComponent` for all params
   - Opens centered popup window (540x720, resizable, scrollbars)

4. **Companion Client Script (onLoad)** — `onLoad` Client Script on incident table that uses `GlideAjax` to call `AgentConfigAjax` Script Include, parses the JSON response, and sets `window._agentBaseUrl`, `window._agentTenantId`, `window._agentTenantSec` globals.

5. **Companion Script Include** — `AgentConfigAjax` extending `AbstractAjaxProcessor`, marked Client callable. Single method `getAgentConfig()` returns JSON with the three `gs.getProperty()` values.

6. **UI16 + Next Experience Compatibility** — Reference table documenting API availability across UI16 (Classic) and Next Experience (Polaris): g_form, window.open(), GlideModal, GlideAjax, gel(), getDisplayValue(), description truncation, popup blocker behavior.

7. **Field Mapping Table** — Maps each URL query parameter to its ServiceNow source (g_form call or sys_property via GlideAjax) with required/optional notes.

8. **Testing Checklist** — Grouped into Setup (8 items), UI Action Visibility (4 items), Popup Launch (5 items), Error Handling (2 items), End-to-End Flow (7 items), Cross-Experience (2 items).

**Note on scope:** The original sprint spec called for an MVP approach with hardcoded tenant_id/tenant_secret in the UI Action script. The delivered PDF instead documents the production-grade sys_properties + GlideAjax approach. A follow-up may provide a simplified hardcoded-only script for first round-trip testing.

**Files created (not committed to repo):**
- `generate_sprint19_pdf.py` — Python script using fpdf2 to generate the PDF
- `Sprint_19_ServiceNow_UI_Action.pdf` — Generated 6-page PDF

**Files NOT modified:**
- No backend files changed
- No frontend files changed
- No configuration files changed

**What GPT should know for next steps:**
- The PDF is the deliverable — a ServiceNow admin uses it to configure the UI Action, Client Script, and Script Include.
- The UI Action opens the same `/worker/servicenow` popup page built in Sprint 18.
- The `gel()` + `window._agent*` fallback pattern handles both UI16 and Next Experience environments.
- For quick first-time testing, the admin could skip the GlideAjax/Script Include setup and hardcode tenant_id/tenant_secret directly in the `aiResolutionAssistant()` function (replacing the `gel()` / `window._agent*` reads with literal strings).
- The PDF was generated with fpdf2 core fonts (no Unicode support) — em dashes and special chars were replaced with ASCII equivalents.

*Next change will be #019A.*

## #019A — 2026-03-04 — Settings Page Tabbed Sub-Modules Redesign

**What happened:**
Full rewrite of `SettingsPage.tsx` from a single stacked-section layout into a two-tab design using Radix Tabs. The page no longer depends on the global tenant selector (`useTenants()`) — the Tenant Intelligence tab fetches its own tenant list independently. Both tabs use the same table styling as `TenantsPage.tsx` (white bg, gray-50 header, uppercase column headers, icon action buttons).

**Files modified:**

- `src/app/pages/SettingsPage.tsx` — **Complete rewrite.** Key changes:

  **Removed dependencies:**
  - `useTenants()` from `../context/TenantContext` — no longer imported or used
  - `Radio`, `Link`, `Unlink` icons — no longer needed

  **Added imports:**
  - `Tabs, TabsList, TabsTrigger, TabsContent` from `../components/ui/tabs`
  - `getTenants, type TenantResponse` from `../services/api`
  - `ChevronDown, ChevronRight` from `lucide-react`
  - `Fragment` from `react`

  **Layout:**
  - Page container changed from `max-w-2xl` to `max-w-7xl mx-auto` to match Tenants page width
  - Page header: "Settings" (text-2xl) with subtitle, matching Tenants page header style
  - Two Radix tabs: **LLM Setup** (default) and **Tenant Intelligence**

  **Tab 1 — LLM Setup:**
  - "Add" button upper-right (same style as Tenants page "Create Tenant" button)
  - **Table** with columns: LABEL | PROVIDER | MODEL | API KEY (masked) | ACTIONS
  - Table classes match TenantsPage: `bg-white border border-border rounded-lg`, `bg-gray-50` thead, `divide-y divide-border` tbody
  - Pencil icon (`p-2 hover:bg-gray-100 rounded`) opens inline edit form in a `colSpan={5}` table row
  - Trash icon (`p-2 hover:bg-red-50 rounded text-red-600`) triggers immediate delete
  - Inline form card: Label, Provider select, API Key with show/hide toggle, Model select, Test + Save + Cancel buttons with status feedback
  - API Key input includes `autoComplete="off"` to prevent browser password manager from blocking paste
  - Empty state: dashed border box with "No LLM configurations yet." and Add button

  **Tab 2 — Tenant Intelligence:**
  - Fetches tenant list via `getTenants()` on mount (independent of global tenant context)
  - Loads tenant LLM assignments lazily when a tenant row is expanded (via `getTenantLLMAssignments()`)
  - **Table** with columns: (chevron) | NAME | TENANT ID | STATUS (badge) | ASSIGNED LLMs (count)
  - Clickable rows toggle expansion with chevron icons (`ChevronRight` / `ChevronDown`)
  - Only one tenant expanded at a time — clicking another collapses the previous
  - **Expanded row** (`colSpan={5}`, `bg-gray-50/50`): Shows all global LLM configs as cards with:
    - **Checkbox** to assign/unassign the config to that tenant (`assignLLMConfig` / `unassignLLMConfig`)
    - **Radio** button (scoped per tenant via `name={default-llm-${tenant.id}}`) to set the default (`activateLLMAssignment`)
    - Event propagation stopped on checkbox/radio to prevent row toggle
  - Empty state inside expansion: "No LLM configs available. Add one in the LLM Setup tab first."
  - Tenant status badges use same styling as TenantsPage (green-100/green-800 for active, gray-100/gray-600 otherwise)
  - Fallback note at bottom: "When no active assignment exists, the system falls back to the `CLAUDE_API_KEY` environment variable."

  **State management:**
  - `providers` and `configs` fetched once on mount (shared by both tabs)
  - `tenants` and `tenantsLoading` — independent tenant list for Tab 2
  - `expandedTenantId` — which tenant row is expanded (null = none)
  - `assignmentsMap: Record<string, TenantLLMAssignmentResponse[]>` — keyed by tenant ID, lazily populated on expand
  - `editingId` and `form` — LLM Setup inline form state (unchanged from previous impl)
  - When an LLM config is deleted, `assignmentsMap` is cleaned across all tenants (removes stale references)

**Files NOT modified:**
- No route changes (`routes.tsx` unchanged) — Settings page is still at `/settings`
- No sidebar changes (`Sidebar.tsx` unchanged)
- No API changes (`api.ts` unchanged) — all API functions already existed
- No backend changes
- No new dependencies added

**Key architecture decisions:**
- **Independent tenant fetch** — Tab 2 calls `getTenants()` directly instead of relying on `useTenants()`. This decouples Settings from the global tenant selector in TopBar. Users can manage assignments for any tenant without switching the global selector.
- **Lazy assignment loading** — Assignments are fetched per-tenant only when expanded, not upfront for all tenants. Results are cached in `assignmentsMap` so re-expanding a tenant doesn't re-fetch.
- **Single-expansion accordion** — Only one tenant row can be expanded at a time. This prevents layout complexity and keeps the table scannable.
- **Per-tenant radio scoping** — Radio buttons use `name={default-llm-${tenant.id}}` so each tenant's default selection is independent. The old implementation used a single `name="default-llm"` which only worked because it only showed one tenant at a time.
- **Form rendered as table row** — The inline edit form is rendered in a `<td colSpan={5}>` row within the table, keeping the table structure valid and the form contextually positioned below the header / above the row being edited.
- **autoComplete="off" on API Key input** — Prevents browser password manager from intercepting the field, which was blocking paste on Safari.

**What GPT should know for next steps:**
- The Settings page is now fully self-contained — it doesn't depend on `useTenants()` or `currentTenantId` from the global context.
- Both tabs share `providers` and `configs` state so adding a config in Tab 1 immediately appears in Tab 2's expansion panels.
- The `assignmentsMap` is a cache — if the user assigns/unassigns LLMs, the map is updated optimistically from the API response without re-fetching.
- The table styling in both tabs exactly matches `TenantsPage.tsx` patterns: same header classes, same hover states, same icon button patterns.
- No new API endpoints were needed — all functions (`getTenants`, `getTenantLLMAssignments`, `assignLLMConfig`, `unassignLLMConfig`, `activateLLMAssignment`) already existed in `api.ts`.

## #020 — 2026-03-04 — UI Structural Refactor: General-Purpose Control Plane Navigation

**What happened:**
Refactored the UI from a ServiceNow-specific 4-item sidebar into a general-purpose AI Agent Control Plane with 7 sidebar items. Added new mock-data pages for Integrations, Skills, Use Cases, and Agent Console. Replaced `Sidebar.tsx` + `DashboardLayout.tsx` with a single `Layout.tsx` component. Removed the ServiceNow-specific Setup Wizard — tenant creation is now a standalone flow, and integration configuration lives in the new Integrations module. This is a structural refactor only — existing providers, API connections, design system, and the standalone `/worker/servicenow` route are all preserved.

**Files created:**

- `src/app/components/Layout.tsx` — Replaces both `Sidebar.tsx` and `DashboardLayout.tsx`. Contains sidebar with 7 nav items (Tenants, Integrations, Skills, Use Cases, Runs, Observability, Settings), `TopBar`, `Toaster`, and `<Outlet />`. Uses named export `Layout()` matching codebase convention. Icons: `Building2`, `Plug`, `Sparkles`, `Workflow`, `PlayCircle`, `Activity`, `Settings` from lucide-react. Active item styling: `bg-gray-200 text-gray-900 font-medium`. Sidebar width: `w-60`.

- `src/app/pages/IntegrationsPage.tsx` — Grid of integration cards (ServiceNow, Google Drive, Salesforce, Slack, GitHub, Jira). Each card shows name, description, icon, and connection status badge (green "Connected" or gray "Not Connected"). Cards link to `/integrations/:id`. Header: "Integrations — Connect external systems for this tenant." Primary button: "Add Integration".

- `src/app/pages/IntegrationConfigPage.tsx` — Configuration form for a single integration. Fields: Instance URL, Username, Password/OAuth Token. Buttons: "Test Connection" (simulates 1.5s test with spinner → success badge) and "Enable Integration" (enabled only after successful test). Back link to `/integrations`. Integration name resolved from URL param `:id`.

- `src/app/pages/SkillsPage.tsx` — Table of reusable AI capabilities. Columns: NAME, DESCRIPTION, TOOLS (monospace badges, max 2 shown + overflow count), MODEL, LAST UPDATED, ACTIONS (edit pencil, delete trash, more menu). Mock data: Knowledge Search, Incident Diagnosis, Customer Email Writer, Root Cause Analysis. Primary button: "Create Skill" linking to `/skills/create`.

- `src/app/pages/SkillEditorPage.tsx` — Two-column skill editor. Left column: Skill Name, Description, Model dropdown (Claude 3.5 Sonnet / GPT-4 / GPT-4 Turbo / Gemini Pro), Allowed Tools checklist (9 tools from ServiceNow, GoogleDrive, Salesforce, Slack, GitHub). Right column: Instructions textarea (20 rows, monospace). Cancel + Save buttons. Handles both create (`/skills/create`) and edit (`/skills/:id`) modes based on URL param presence.

- `src/app/pages/UseCasesPage.tsx` — Table of workflow templates. Columns: NAME, DESCRIPTION, SKILLS (blue badges, max 2 + overflow), TRIGGERS, STATUS (green "Active" / gray "Draft"), ACTIONS. Mock data: IT Incident Resolution, Customer Support Automation, Sales Lead Research. Primary button: "Create Use Case" linking to `/use-cases/create`.

- `src/app/pages/UseCaseBuilderPage.tsx` — Visual workflow builder. Main area: horizontal step cards connected by arrow icons (Classify Ticket → Search Knowledge → Analyze Root Cause → Generate Response). Each step card shows step number, skill name, skill ID, and settings icon. Clicking a step selects it. Right panel: step configuration with skill selector dropdown, input mapping textarea, output mapping textarea. "Add Step" dashed button at end of chain. Cancel + Save buttons.

- `src/app/pages/AgentConsolePage.tsx` — Two-panel agent interface. Left (2/3 width): chat-style interface with message bubbles (user = dark bg right-aligned, assistant = light bg left-aligned), processing spinner, input field with send button, quick action chips ("Investigate Incident", "Analyze Email Thread", "Search Knowledge"). Right (1/3 width): execution trace panel showing skills used (blue badges), tools called (monospace gray badges), latency, and token count. Mock response simulates 2s processing delay.

- `src/app/pages/RunDetailPage.tsx` — Drill-down view for a single run. Header: run ID (monospace) + status badge. Metadata cards: Tenant, Duration, Total Tokens, Created. Execution timeline: vertical step list with green checkmark indicators, timeline connectors, step type badges (blue "Skill" / purple "Tool"), latency, token count, start/end times, and result text. Back link to `/runs`.

- `src/app/pages/CreateTenantPage.tsx` — Multi-step tenant creation wizard. 4-step progress bar: Create Tenant → Add Integrations → Enable Use Cases → Activate. Step 1: form with Tenant Name, Tenant ID, Status dropdown. Steps 2-3: placeholder content for integration/use-case selection. Step 4: green "Ready to Activate" confirmation. Back/Continue navigation between steps. No ServiceNow-specific configuration — integrations are configured separately via the Integrations module.

**Files modified:**

- `src/app/routes.tsx` — **Major rewrite.** Imports `Layout` from `./components/Layout` instead of `DashboardLayout` from `./layouts/DashboardLayout`. Root `Component` changed from `DashboardLayout` to `Layout`. New page imports use default imports (new pages) alongside existing named imports (preserved pages). Added routes: `/tenants/create`, `/integrations`, `/integrations/:id`, `/skills`, `/skills/create`, `/skills/:id`, `/use-cases`, `/use-cases/create`, `/use-cases/:id`, `/runs/:id`, `/observability`, `/console`. Removed routes: `/tenants/setup`, `/tenants/setup/:id`, `/test-harness`, `/admin/observability`. Changed observability path from `/admin/observability` to `/observability`. Standalone `/worker/servicenow` route preserved unchanged.

- `src/app/pages/TenantsPage.tsx` — Changed "Create Tenant" button navigation from `/tenants/setup` to `/tenants/create`. Changed per-tenant settings button navigation from `/tenants/setup/${tenant.id}` to `/tenants/create`. No other changes — table structure, API calls, and TenantContext usage all preserved.

**Files deleted:**

- `src/app/components/Sidebar.tsx` — Replaced by sidebar section within `Layout.tsx`.
- `src/app/layouts/DashboardLayout.tsx` — Replaced by `Layout.tsx` which combines sidebar + main content area.
- `src/app/pages/SetupWizardPage.tsx` — 6-step ServiceNow-specific wizard removed. Tenant creation is now handled by `CreateTenantPage.tsx` (general-purpose). Integration configuration is handled by the Integrations module.
- `src/app/pages/TestHarnessPage.tsx` — Removed from navigation and routes.

**Files NOT modified:**
- `src/app/App.tsx` — `GoogleAuthProvider` and `TenantProvider` wrappers preserved. `RouterProvider` still renders the exported `router`.
- `src/app/pages/RunsPage.tsx` — Live API connections and dual-answer card logic preserved.
- `src/app/pages/ObservabilityPage.tsx` — Live charts preserved. Only the route path changed (in `routes.tsx`), component unchanged.
- `src/app/pages/SettingsPage.tsx` — Tabbed LLM Setup / Tenant Intelligence preserved.
- `src/app/pages/WorkerServiceNowPage.tsx` — Standalone worker page preserved at `/worker/servicenow`.
- `src/app/services/api.ts` — No API changes.
- `src/app/context/*` — All providers unchanged.
- `src/app/components/TopBar.tsx` — Unchanged, now imported by `Layout.tsx` instead of `DashboardLayout.tsx`.
- `src/app/components/ui/*` — All shadcn/ui components unchanged.

**Key architecture decisions:**
- **Layout.tsx replaces two files** — Sidebar was only used in DashboardLayout, so merging them into a single `Layout.tsx` component eliminates an unnecessary abstraction layer. The sidebar is now an `<aside>` element within the layout.
- **Named export convention** — `Layout.tsx` uses `export function Layout()` (not default export) to match the existing codebase pattern where all components use named exports.
- **New pages use default exports** — The 9 new pages from the refactored source use `export default function`. This is intentional — they're imported with default import syntax in `routes.tsx` while existing pages keep their named imports.
- **Tenants href changed to `/tenants`** — The refactored source had Tenants pointing to `/` with special `isActive` logic. Changed to `/tenants` to match the existing routing pattern where `/` redirects to `/tenants`.
- **No ServiceNow coupling in tenant creation** — `CreateTenantPage.tsx` is a general 4-step flow (Create → Integrations → Use Cases → Activate) with no ServiceNow-specific fields. The old `SetupWizardPage.tsx` had 6 steps including ServiceNow config, schema, and Drive scaffold — all of that now lives in the Integrations module.
- **Mock data only for new pages** — All new pages use hardcoded mock data. Existing pages (Runs, Observability, Settings, Tenants) retain their live API connections unchanged.
- **Observability route simplified** — Changed from `/admin/observability` to `/observability` to match the flat navigation structure.

**Current sidebar navigation (7 items):**
```
Tenants        (Building2)    → /tenants
Integrations   (Plug)         → /integrations
Skills         (Sparkles)     → /skills
Use Cases      (Workflow)     → /use-cases
Runs           (PlayCircle)   → /runs
Observability  (Activity)     → /observability
Settings       (Settings)     → /settings
```

**Current route map:**
```
/                        → redirect to /tenants
/tenants                 → TenantsPage (live API)
/tenants/create          → CreateTenantPage (mock)
/integrations            → IntegrationsPage (mock)
/integrations/:id        → IntegrationConfigPage (mock)
/skills                  → SkillsPage (mock)
/skills/create           → SkillEditorPage (mock)
/skills/:id              → SkillEditorPage (mock)
/use-cases               → UseCasesPage (mock)
/use-cases/create        → UseCaseBuilderPage (mock)
/use-cases/:id           → UseCaseBuilderPage (mock)
/runs                    → RunsPage (live API)
/runs/:id                → RunDetailPage (mock)
/observability           → ObservabilityPage (live API)
/console                 → AgentConsolePage (mock)
/settings                → SettingsPage (live API)
/worker/servicenow       → WorkerServiceNowPage (standalone, live API)
```

**What GPT should know for next steps:**
- The platform is now a general-purpose AI agent control plane, no longer ServiceNow-specific.
- All new pages are mock-data placeholders ready to be wired to backend APIs.
- The Integrations module is where external system configuration will live — each integration type will need its own config schema and connection test logic on the backend.
- The Skills module will need backend CRUD endpoints and a way to associate tools from connected integrations.
- The Use Cases module will need a workflow execution engine on the backend that chains skills together.
- The Agent Console will need a WebSocket or SSE connection to stream execution traces in real-time.
- The Run Detail page (`/runs/:id`) currently shows mock data — it should be wired to the existing runs API with the trace/step data from the orchestrator.
- The `CreateTenantPage` navigates to `/` on completion — this should be updated to call the existing `createTenant` API and navigate to `/tenants` on success.
- `npx tsc --noEmit` passes clean with all changes.

*Next change will be #021.*

---

## #021 — 2026-03-04 — Integrations Module Backend + Frontend Wiring

**What happened:**
Built the full backend API for integrations and wired the frontend Integrations pages to real data. The new integrations router uses a unified wrapper approach — it reads from existing config stores (`snow_config_store`, `drive_config_store`) for ServiceNow/Google Drive hydration, and a new `IntegrationStore` for per-tenant CRUD, enable/disable state, and future integration types. Existing admin config endpoints remain untouched.

**Files created:**

- `backend/routers/integrations.py` — New router at `/api/admin/{tenant_id}/integrations` with 10 endpoints:
  - `GET /catalog` — Returns static `INTEGRATION_CATALOG` (6 types: servicenow, google-drive, salesforce, slack, github, jira).
  - `GET /` — Lists integrations for tenant. Hydrates `connection_status` from `snow_config_store`/`drive_config_store` for ServiceNow/Google Drive; derives status from `config` + `enabled` for other types.
  - `POST /` — Creates integration record. Validates type against catalog. Returns 409 if type already exists for tenant. Generates `int_` prefixed IDs.
  - `GET /{integration_id}` — Single integration with hydrated connection status.
  - `PUT /{integration_id}/config` — Updates config fields. Syncs to `snow_config_store` for ServiceNow and `drive_config_store` for Google Drive.
  - `PUT /{integration_id}/enable` — Sets `enabled=True`.
  - `PUT /{integration_id}/disable` — Sets `enabled=False`.
  - `POST /{integration_id}/test` — Tests connection. For ServiceNow, makes real HTTP call to `{instance_url}/api/now/table/incident?sysparm_limit=1` with basic auth via `httpx`. For other types, returns mock success.
  - `DELETE /{integration_id}` — Deletes integration record.
  - Uses `_require_tenant` pattern from admin router. Helper functions `_connection_status()` and `_serialize()` handle hydration and response formatting.

**Files modified:**

- `backend/models.py` — Added `INTEGRATION_CATALOG` dict (6 integration types with name, description, config_fields), `Integration` model (id, tenant_id, integration_type, enabled, config dict, timestamps), `CreateIntegrationRequest`, `UpdateIntegrationConfigRequest`, `TestIntegrationRequest`.

- `backend/store/interface.py` — Added `IntegrationStore` ABC with 6 abstract methods: `create`, `get`, `list_for_tenant`, `update`, `delete`, `get_by_type`. Added `Integration` to imports.

- `backend/store/memory.py` — Added `InMemoryIntegrationStore` implementation. Uses `dict[str, Integration]` keyed by ID. `list_for_tenant` filters by tenant_id. `get_by_type` filters by tenant_id + integration_type. `update` uses same `model_dump()` / merge pattern as existing stores.

- `backend/store/__init__.py` — Added `IntegrationStore` and `InMemoryIntegrationStore` to imports and `__all__`.

- `backend/main.py` — Added `InMemoryIntegrationStore` import, `app.state.integration_store = InMemoryIntegrationStore()`, imported and registered `integrations_router`.

- `backend/routers/__init__.py` — Added `from routers.integrations import router as integrations_router` and exported it in `__all__`.

- `src/app/services/api.ts` — Added `IntegrationResponse` interface (id, tenant_id, integration_type, enabled, config, connection_status, timestamps), `IntegrationCatalogEntry` interface (name, description, config_fields), and 9 API functions: `getIntegrationCatalog`, `getIntegrations`, `getIntegration`, `createIntegration`, `updateIntegrationConfig`, `enableIntegration`, `disableIntegration`, `testIntegration`, `deleteIntegration`.

- `src/app/pages/IntegrationsPage.tsx` — Replaced hardcoded `integrations` array with live API data. Uses `useTenants()` for `currentTenantId`. Fetches integrations + catalog via `useEffect`/`useCallback` on mount and tenant change. Added loading spinner (Loader2 pattern), empty state with "Add Integration" CTA, and "no tenant selected" state. "Add Integration" button shows dropdown of catalog entries not yet added for the tenant, calls `createIntegration()` on selection and refetches. Card status badges derive from `integration.connection_status`. Card links use `integration.id` instead of hardcoded type slugs. Icon mapping: static `ICONS` record keyed by `integration_type`.

- `src/app/pages/IntegrationConfigPage.tsx` — Replaced mock form with live API data. URL param `:id` now refers to the integration record ID. On mount: calls `getIntegration()` + `getIntegrationCatalog()` to load config and field definitions. Dynamic form fields rendered from `catalog[integration.integration_type].config_fields`. Field labels auto-formatted from snake_case. Secret fields (password, token, api_key, etc.) use `type="password"`. "Test Connection" saves config first via `updateIntegrationConfig()`, then calls `testIntegration()`. "Enable Integration" saves config, calls `enableIntegration()`, navigates to `/integrations`. Added loading state, not-found state, and toast notifications via sonner.

**Files NOT modified:**
- `src/app/App.tsx`, `src/app/routes.tsx`, `src/app/components/Layout.tsx` — No changes needed. Route param `:id` stays the same, just semantically refers to integration record ID now.
- `src/app/pages/TenantsPage.tsx`, `src/app/pages/RunsPage.tsx`, `src/app/pages/ObservabilityPage.tsx`, `src/app/pages/SettingsPage.tsx`, `src/app/pages/WorkerServiceNowPage.tsx` — All preserved unchanged.
- `backend/routers/admin.py` — Existing ServiceNow, Google Drive, and other admin endpoints remain intact.
- `src/app/context/*`, `src/app/components/TopBar.tsx`, `src/app/components/ui/*` — All unchanged.

**Key architecture decisions:**
- **Unified wrapper approach** — The integrations router doesn't replace existing config endpoints. It wraps them by reading from `snow_config_store`/`drive_config_store` for hydration and syncing writes back to those stores. This means `/api/admin/{tenant_id}/servicenow` still works independently.
- **Config sync on write** — When `PUT /{integration_id}/config` is called for a ServiceNow integration, the config is saved to both the integration store and `snow_config_store`. Same for Google Drive → `drive_config_store`. This ensures the orchestrator and worker pages that read from the original stores continue to work.
- **Connection status hydration** — For ServiceNow/Google Drive, connection status is derived from whether the corresponding config store has data. For other types (salesforce, slack, github, jira), status is derived from `config` non-empty + `enabled=True`.
- **Real HTTP test for ServiceNow** — Uses `httpx.AsyncClient` to make a live HTTP request to the ServiceNow instance. Other integration types return mock success for now.
- **Dynamic form rendering** — The config page reads `config_fields` from the catalog to render the right inputs for each integration type, instead of hardcoding fields per type.

**Current route map (updated):**
```
/integrations            → IntegrationsPage (live API)
/integrations/:id        → IntegrationConfigPage (live API)
```

**What GPT should know for next steps:**
- The Integrations module is now fully wired end-to-end: backend CRUD + frontend list/config pages.
- The `INTEGRATION_CATALOG` in `backend/models.py` is the single source of truth for available integration types and their config field schemas.
- To add a new integration type, add an entry to `INTEGRATION_CATALOG` and optionally add type-specific test logic in the router's `test_integration` endpoint.
- The config sync pattern (integration store ↔ existing config stores) means the ServiceNow worker and Google Drive orchestrator continue to read from their original stores without modification.
- Real connection tests for Salesforce, Slack, GitHub, and Jira are mocked — they'll need actual API calls when those integrations are implemented.
- `npx tsc --noEmit` passes clean with all changes.

*Next change will be #022.*

---

## #022 — 2026-03-04 — Tool Registry + Skills CRUD Backend + Frontend Wiring

**What happened:**
Added a static Tool Catalog (15 tools across 6 integration types) with a tenant-scoped "available tools" endpoint that filters by enabled/connected integrations. Built full Skills CRUD backend with store layer, and wired the frontend Skills pages (SkillsPage + SkillEditorPage) from mock data to live API. Tool IDs are validated against the catalog when creating or updating skills.

**Files created:**

- `backend/routers/tools.py` — New router at `/api/admin/{tenant_id}/tools` with 2 endpoints:
  - `GET /catalog` — Returns full `TOOL_CATALOG` (15 tools) with `tools` array and `by_integration` grouping. Includes all tools regardless of tenant integration state.
  - `GET /available` — Returns only tools whose `integration_type` maps to an integration that is **enabled** for the tenant. For ServiceNow, also requires `snow_config_store` to have data (hydrated "connected" status). For Google Drive, requires `drive_config_store` to have data. For other types (salesforce, slack, github, jira), `enabled=True` is sufficient. Response shape: `{ "tools": [...], "by_integration": { "servicenow": [...], ... } }`.
  - Uses `_require_tenant` pattern. Uses `defaultdict` for grouping.

- `backend/routers/skills.py` — New router at `/api/admin/{tenant_id}/skills` with 5 endpoints:
  - `GET /` — Lists all skills for tenant.
  - `POST /` — Creates skill with `sk_` prefixed ID. Validates `tools[]` against `TOOL_CATALOG_BY_ID`. Returns 400 with list of unknown tool IDs on validation failure.
  - `GET /{skill_id}` — Returns single skill. 404 if not found or tenant mismatch.
  - `PUT /{skill_id}` — Updates skill fields. Uses `model_dump(exclude_none=True)` so only provided fields are updated. Validates tools if included in update.
  - `DELETE /{skill_id}` — Deletes skill. Returns `{"ok": true}`.
  - All endpoints use `_require_tenant` pattern and verify `skill.tenant_id == tenant_id`.

**Files modified:**

- `backend/models.py` — Added `TOOL_CATALOG` list (15 tool entries) with fields: `tool_id`, `integration_type`, `name`, `description`, `input_schema`, `output_schema`. Tools per integration: ServiceNow (4: search_incidents, get_incident_details, search_kb, add_work_note), Google Drive (3: search_documents, read_file, create_file), Salesforce (2: search_accounts, get_case_history), Slack (2: send_message, search_messages), GitHub (2: search_commits, search_issues), Jira (2: search_issues, get_issue). Added `TOOL_CATALOG_BY_ID` dict for O(1) lookup. Added `Skill` model (id, tenant_id, name, description, model, instructions, tools list[str], timestamps). Added `CreateSkillRequest` and `UpdateSkillRequest` (all fields optional except name on create).

- `backend/store/interface.py` — Added `Skill` to imports. Added `SkillStore` ABC with 5 abstract methods: `create`, `get`, `list_for_tenant`, `update`, `delete`.

- `backend/store/memory.py` — Added `Skill` and `SkillStore` to imports. Added `InMemorySkillStore` implementation. Uses `dict[str, Skill]` keyed by ID. `list_for_tenant` filters by tenant_id. `update` uses same `model_dump()` / merge pattern as other stores.

- `backend/store/__init__.py` — Added `SkillStore` and `InMemorySkillStore` to imports and `__all__`.

- `backend/main.py` — Added `InMemorySkillStore` import, `app.state.skill_store = InMemorySkillStore()`. Added `skills_router` and `tools_router` to imports and `app.include_router()` calls.

- `backend/routers/__init__.py` — Added `from routers.skills import router as skills_router` and `from routers.tools import router as tools_router`. Updated `__all__` to include both.

- `src/app/services/api.ts` — Added `ToolCatalogEntry` interface (tool_id, integration_type, name, description, input_schema, output_schema). Added `ToolsResponse` interface (tools array + by_integration grouping). Added `SkillResponse` interface (id, tenant_id, name, description, model, instructions, tools, timestamps). Added 7 API functions: `getToolsCatalog`, `getAvailableTools`, `getSkills`, `getSkill`, `createSkill`, `updateSkill`, `deleteSkill`.

- `src/app/pages/SkillsPage.tsx` — Replaced hardcoded `mockSkills` array with live API data. Uses `useTenants()` for `currentTenantId`. Fetches skills via `useEffect`/`useCallback` on mount and tenant change. Added loading spinner (Loader2), no-tenant state (AlertCircle), empty state with "Create Skill" CTA. Delete button calls `deleteSkill()` with confirmation dialog, then refetches. Table styling identical to original mock. "Last Updated" column uses `format(new Date(skill.updated_at), "MMM d, yyyy")` from date-fns. Tools column shows first 2 tool IDs as monospace badges + overflow count. Row name and edit icon both link to `/skills/:id`. Added `toast` imports from sonner.

- `src/app/pages/SkillEditorPage.tsx` — Replaced hardcoded `availableTools` flat list with `getToolsCatalog()` grouped by integration type. Uses `useTenants()` for `currentTenantId`. On mount: fetches tool catalog. In edit mode (`:id` present): also fetches skill and populates form. Tools section renders with section headers per integration type using `INTEGRATION_LABELS` mapping, each tool showing `tool_id` (monospace) and description. Model dropdown values changed from `"claude"/"gpt4"` to `"claude-3.5-sonnet"/"gpt-4"/"gpt-4-turbo"/"gemini-pro"` with a "Select a model..." placeholder. Save button: calls `createSkill()` in create mode, `updateSkill()` in edit mode, navigates to `/skills` on success. Added toast notifications for success/error. Added loading state, saving state with disabled button + spinner. Empty tools state shows "No tools available. Add and enable integrations first." Two-column layout preserved unchanged.

**Files NOT modified:**
- `src/app/routes.tsx` — No route changes needed. `/skills`, `/skills/create`, `/skills/:id` already exist.
- `src/app/App.tsx`, `src/app/components/Layout.tsx` — Unchanged.
- `src/app/pages/RunsPage.tsx`, `src/app/pages/ObservabilityPage.tsx`, `src/app/pages/SettingsPage.tsx`, `src/app/pages/WorkerServiceNowPage.tsx` — All preserved unchanged.
- `src/app/pages/IntegrationsPage.tsx`, `src/app/pages/IntegrationConfigPage.tsx` — Sprint #021 wiring preserved unchanged.
- `backend/routers/admin.py`, `backend/routers/integrations.py` — Existing endpoints stay intact.
- `src/app/context/*`, `src/app/components/TopBar.tsx`, `src/app/components/ui/*` — All unchanged.

**Key architecture decisions:**
- **Static tool catalog** — `TOOL_CATALOG` is a flat list in `models.py`, not a store. Tools are not tenant-specific — they represent capabilities of integration types. The `/available` endpoint filters dynamically based on tenant's enabled integrations.
- **Tool ID format** — `{integration_type}.{action}` (e.g. `servicenow.search_kb`, `google-drive.read_file`). This matches the mock data naming convention and is human-readable.
- **Catalog validation on skill save** — `_validate_tools()` checks all tool IDs against `TOOL_CATALOG_BY_ID`. This prevents referencing nonexistent tools. It does NOT enforce that the tools are "available" (i.e. integration enabled) — a skill can reference tools from integrations not yet connected. This is intentional: skills are reusable templates that may be configured before integrations are enabled.
- **Skill editor uses full catalog** — The editor shows all tools from the catalog (not just available ones) so users can pre-configure skills. The `/available` endpoint exists for runtime filtering (e.g. when the orchestrator needs to know which tools a skill can actually use).
- **Model values normalized** — Changed from display names (`"claude"`, `"gpt4"`) to stable identifiers (`"claude-3.5-sonnet"`, `"gpt-4"`) that match typical API model IDs.

**Current route map (updated):**
```
/skills                  → SkillsPage (live API)
/skills/create           → SkillEditorPage (live API, create mode)
/skills/:id              → SkillEditorPage (live API, edit mode)
```

**What GPT should know for next steps:**
- The Tool Catalog + Skills CRUD are now fully wired end-to-end.
- `TOOL_CATALOG` in `backend/models.py` is the single source of truth for available tools. To add a new tool, append to the list.
- Skills reference tools by `tool_id`. The orchestrator can use `GET /tools/available` at runtime to check which tools a skill can actually invoke for a given tenant.
- The Use Cases module (next sprint candidate) can reference skills by `skill_id` and chain them into workflows.
- The Agent Console can use skills + available tools to build execution plans.
- `npx tsc --noEmit` passes clean with all changes.

*Next change will be #023.*

---

## #023 — 2026-03-04 — Use Cases CRUD Backend + Frontend Wiring + Run Endpoint

**What happened:**
Built full Use Cases CRUD backend with store layer, a "Run Use Case" stub endpoint that builds an execution plan from use case steps, and wired the frontend Use Cases pages (UseCasesPage + UseCaseBuilderPage) from mock data to live API. Use case steps reference skills by `skill_id`, validated against the tenant's skill store on create/update.

**Files created:**

- `backend/routers/use_cases.py` — New router at `/api/admin/{tenant_id}/use-cases` with 6 endpoints:
  - `GET /` — Lists all use cases for tenant.
  - `POST /` — Creates use case with `uc_` prefixed ID. Validates `steps[].skill_id` against `skill_store` — each referenced skill must exist and belong to the tenant. Returns 400 if a skill is not found.
  - `GET /{use_case_id}` — Returns single use case. 404 if not found or tenant mismatch.
  - `PUT /{use_case_id}` — Updates use case fields. Uses `model_dump(exclude_none=True)` so only provided fields are updated. Validates steps if included. Converts `UseCaseStep` objects to dicts for storage merge.
  - `DELETE /{use_case_id}` — Deletes use case. Returns `{"ok": true}`.
  - `POST /{use_case_id}/run` — Stub execution endpoint. Loads the use case, builds an execution plan from steps by resolving each `skill_id` to get the skill's tools and model. Returns `{ run_id, use_case_id, status: "planned", message, plan: [...] }` where each plan entry has `step_index`, `skill_id`, `skill_name`, `tools`, `model`, `status: "pending"`. Does not create a real run record — runtime execution is deferred to a future sprint.
  - All endpoints use `_require_tenant` pattern and verify `use_case.tenant_id == tenant_id`.
  - Helper `_validate_steps()` checks all `skill_id` references.

**Files modified:**

- `backend/models.py` — Added `UseCaseStep` model (step_id, skill_id, name, input_mapping, output_mapping). Added `UseCase` model (id with `uc_` prefix, tenant_id, name, description, status as `"draft"|"active"`, triggers list[str], steps list[UseCaseStep], timestamps). Added `CreateUseCaseRequest` (name required, all else optional with defaults). Added `UpdateUseCaseRequest` (all fields optional).

- `backend/store/interface.py` — Added `UseCase` to imports. Added `UseCaseStore` ABC with 5 abstract methods: `create`, `get`, `list_for_tenant`, `update`, `delete`.

- `backend/store/memory.py` — Added `UseCase` and `UseCaseStore` to imports. Added `InMemoryUseCaseStore` implementation. Uses `dict[str, UseCase]` keyed by ID. Same `model_dump()` / merge pattern as other stores.

- `backend/store/__init__.py` — Added `UseCaseStore` and `InMemoryUseCaseStore` to imports and `__all__`.

- `backend/main.py` — Added `InMemoryUseCaseStore` import, `app.state.use_case_store = InMemoryUseCaseStore()`. Added `use_cases_router` to imports and `app.include_router()`.

- `backend/routers/__init__.py` — Added `from routers.use_cases import router as use_cases_router`. Updated `__all__`.

- `src/app/services/api.ts` — Added `UseCaseStepResponse` interface (step_id, skill_id, name, input_mapping, output_mapping). Added `UseCaseResponse` interface (id, tenant_id, name, description, status, triggers, steps, timestamps). Added `RunUseCaseResponse` interface (run_id, use_case_id, status, message, plan array). Added 7 API functions: `getUseCases`, `getUseCase`, `createUseCase`, `updateUseCase`, `deleteUseCase`, `runUseCase`.

- `src/app/pages/UseCasesPage.tsx` — Replaced hardcoded `mockUseCases` array with live API data. Uses `useTenants()` for `currentTenantId`. Fetches use cases via `useEffect`/`useCallback` on mount and tenant change. Added loading spinner, no-tenant state, empty state with "Create Use Case" CTA. Delete button calls `deleteUseCase()` with confirmation dialog, then refetches. Skills column shows step names (falling back to `skill_id`) as blue badges with overflow count. Triggers column shows comma-joined triggers or em-dash if empty. Status column shows "Active" (green) or "Draft" (gray) badges from `useCase.status`. Table styling identical to original mock. Added `toast` imports from sonner.

- `src/app/pages/UseCaseBuilderPage.tsx` — Major rewrite from mock to live API while preserving layout:
  - **Name/Description/Status/Triggers bar** added above workflow area — 4-column grid with text inputs, status dropdown, and comma-separated triggers field.
  - **Workflow steps** populated from use case steps in edit mode, empty in create mode. Each step card shows step number, skill name, skill_id, and a settings icon. Hover reveals a delete (trash) button per step.
  - **Add Step** button creates a new step using the first available tenant skill. Shows toast error if no skills exist.
  - **Step configuration panel** (right column): skill selector dropdown populated from live `getSkills()`, input mapping textarea, output mapping textarea. All changes update local state.
  - **Save** calls `createUseCase()` in create mode, `updateUseCase()` in edit mode. Serializes workflow state to `UseCaseStepResponse[]` with step_id, skill_id, name, input_mapping, output_mapping.
  - **Run button** (edit mode only): calls `runUseCase()`, shows toast with run_id on success. Disabled when no steps.
  - Added loading state, saving/running states with spinners, toast notifications.
  - Two-column layout (2/3 workflow + 1/3 config) preserved.

**Files NOT modified:**
- `src/app/routes.tsx` — No route changes. `/use-cases`, `/use-cases/create`, `/use-cases/:id` already exist.
- `src/app/App.tsx`, `src/app/components/Layout.tsx` — Unchanged.
- `src/app/pages/RunsPage.tsx`, `src/app/pages/ObservabilityPage.tsx`, `src/app/pages/SettingsPage.tsx`, `src/app/pages/WorkerServiceNowPage.tsx` — Preserved unchanged.
- `src/app/pages/IntegrationsPage.tsx`, `src/app/pages/IntegrationConfigPage.tsx` — Sprint #021 wiring preserved.
- `src/app/pages/SkillsPage.tsx`, `src/app/pages/SkillEditorPage.tsx` — Sprint #022 wiring preserved.
- `backend/routers/admin.py`, `backend/routers/integrations.py`, `backend/routers/tools.py`, `backend/routers/skills.py` — All existing endpoints stay intact.

**Key architecture decisions:**
- **Steps reference skills by ID** — Each `UseCaseStep.skill_id` must exist in the tenant's skill store. This creates a dependency chain: Integrations → Tools → Skills → Use Cases.
- **Step validation on save** — `_validate_steps()` checks that every referenced skill exists and belongs to the tenant. This prevents dangling references if a skill is deleted after being added to a use case.
- **Run endpoint is a stub** — `POST /{use_case_id}/run` builds an execution plan by resolving each step's skill (tools, model) but does not create a real `AgentRun` record or invoke the orchestrator. It returns `status: "planned"` with the plan array. This gives the frontend something to display immediately while actual execution is implemented in a future sprint.
- **Builder adds metadata fields** — The original mock had no name/description/triggers editing in the builder. Added a 4-column metadata bar above the workflow area for full CRUD — this was necessary since the backend model includes these fields and the create flow needs them.
- **Triggers as comma-separated text** — Stored as `list[str]` on backend, entered as comma-separated in the UI. Parsed on save, joined on display.

**Current route map (updated):**
```
/use-cases               → UseCasesPage (live API)
/use-cases/create        → UseCaseBuilderPage (live API, create mode)
/use-cases/:id           → UseCaseBuilderPage (live API, edit mode)
```

**What GPT should know for next steps:**
- The full control plane CRUD chain is now complete: Integrations → Tools → Skills → Use Cases, all wired end-to-end.
- The `POST /{use_case_id}/run` endpoint returns a plan but does not execute. The next step is implementing actual execution that creates an `AgentRun`, streams events via WebSocket, and invokes skills in sequence.
- The Agent Console page is the last mock-data page remaining in the sidebar. It could be wired to use the run endpoint + WebSocket streaming.
- The `CreateTenantPage` still uses mock wizard steps — could be wired to actually create integrations and use cases during tenant onboarding.
- `npx tsc --noEmit` passes clean with all changes.

*Next change will be #024.*

---

## #024 — 2026-03-04 — Agent Console + Runs + Observability + Real Execution Engine

**What happened:**
Implemented 4 Figma-designed pages (AgentConsolePage, RunDetailPage, RunsPage, ObservabilityPage) with live API wiring, plus a real execution engine that upgrades the `POST /use-cases/{id}/run` stub into background step-by-step execution with SSE streaming. Created 5 shared UI components from Figma designs. The entire execution → viewing → analysis flow now works end-to-end: run a use case from the Agent Console, watch steps complete in real-time via SSE, browse runs in the Runs table, drill into run details, and explore individual trace steps in the Observability trace explorer.

**Files created:**

- `src/app/components/StatusBadge.tsx` — Reusable status badge with 4 variants (completed=green, running=blue+spinner, pending=gray, failed=red). Configurable `size` (sm/md) and optional icon. Used across RunsPage, RunDetailPage, AgentConsolePage, ObservabilityPage, and TraceStep.

- `src/app/components/TimelineConnector.tsx` — Vertical line connecting timeline steps. Positioned absolutely at left side, hidden when `isLast=true`.

- `src/app/components/ToolInvocation.tsx` — Displays tool names as monospace code badges in a flex-wrap layout.

- `src/app/components/RunCard.tsx` — Compact clickable card showing run ID, StatusBadge, use case name, duration, timestamp. Used in AgentConsolePage recent runs list.

- `src/app/components/TraceStep.tsx` — Expandable timeline step card with: step number circle indicator, skill name + StatusBadge header, model/latency/tokens metrics, tools invoked section, result summary. Expanded view shows: skill instructions, tool request payload (JSON), tool response (JSON), LLM output. Uses TimelineConnector for vertical connection between steps.

- `backend/routers/uc_runs.py` — New router at `/api/admin/{tenant_id}/uc-runs` with 3 endpoints:
  - `GET /` — Lists all use-case runs for a tenant across all use cases. Sorted newest first.
  - `GET /{run_id}` — Gets single run by ID with tenant validation.
  - `GET /{run_id}/events` — SSE streaming endpoint. Polls the run store every 300ms, emits `step.completed` events as steps finish, then `run.completed` when terminal. Uses `StreamingResponse` with `text/event-stream` media type.

**Files modified:**

- `backend/models.py` — Added `UseCaseRunStep` model (step_index, skill_id, skill_name, model, tools, instructions, status, latency_ms, tokens, result_summary, tool_request_payload, tool_response, llm_output, started_at, completed_at). Added `UseCaseRun` model (run_id with `run_` prefix, tenant_id, use_case_id, use_case_name, status as `"queued"|"running"|"completed"|"failed"`, steps list, total_latency_ms, total_tokens, final_result, timestamps).

- `backend/store/interface.py` — Added `UseCaseRun` to imports. Added `UseCaseRunStore` ABC with 5 abstract methods: `create`, `get`, `list_for_tenant`, `list_for_use_case`, `update`.

- `backend/store/memory.py` — Added `UseCaseRun` and `UseCaseRunStore` to imports. Added `InMemoryUseCaseRunStore` implementation with dict keyed by `run_id`, tenant/use-case filtering.

- `backend/store/__init__.py` — Added `UseCaseRunStore` and `InMemoryUseCaseRunStore` to imports and `__all__`.

- `backend/main.py` — Added `InMemoryUseCaseRunStore` import, `app.state.use_case_run_store = InMemoryUseCaseRunStore()`. Added `uc_runs_router` to imports and `app.include_router()`. Backend now boots with 72 routes.

- `backend/routers/__init__.py` — Added `from routers.uc_runs import router as uc_runs_router`. Updated `__all__`.

- `backend/routers/use_cases.py` — Major upgrade to the run endpoint:
  - `POST /{use_case_id}/run` — Now creates a real `UseCaseRun` record in the store, builds `UseCaseRunStep` entries from the use case's steps (resolving skill names, models, tools, instructions), then launches `_execute_run()` as an `asyncio.create_task` background task. Returns the full run object (status: "queued").
  - `_execute_run()` — Background coroutine that iterates through steps sequentially. For each step: marks as running, simulates latency (300–1500ms via `asyncio.sleep`), generates mock tool payloads/responses, records tokens (100–900 random), updates the run store in-place so SSE clients see progress. On completion, marks run as "completed" with final_result summary.
  - `GET /{use_case_id}/runs` — Lists runs for a specific use case.
  - `GET /{use_case_id}/runs/{run_id}` — Gets single run detail.
  - `GET /{use_case_id}/runs/{run_id}/events` — SSE streaming (same implementation as uc_runs router).

- `src/app/services/api.ts` — Added `UseCaseRunStepResponse` interface (step_index, skill_id, skill_name, model, tools, instructions, status, latency_ms, tokens, result_summary, tool_request_payload, tool_response, llm_output, started_at, completed_at). Added `UseCaseRunResponse` interface (run_id, tenant_id, use_case_id, use_case_name, status, steps, total_latency_ms, total_tokens, final_result, timestamps). Replaced old `RunUseCaseResponse` with comment. Updated `runUseCase()` return type to `UseCaseRunResponse`. Added 5 new API functions: `getUseCaseRuns()`, `getUseCaseRun()`, `getAllUCRuns()`, `getUCRun()`, `connectUCRunEvents()` (EventSource-based SSE client that dispatches `onStepCompleted` and `onRunCompleted` callbacks).

- `src/app/pages/AgentConsolePage.tsx` — Complete rewrite from mock chat interface to Figma two-panel layout:
  - **Left panel**: Tenant selector (from `useTenants()`), run mode toggle (Use Case / Ask Agent), use case dropdown (populated from `getUseCases()`), prompt textarea, Run/Ask button. Below: Recent Runs list using `RunCard` components (from `getAllUCRuns()`, limited to 5).
  - **Right panel**: Execution Trace timeline using `TraceStep` components. Populated in real-time via `connectUCRunEvents()` SSE — each step appears as it completes. Shows running indicator during execution, success banner on completion, empty state with Play icon when idle.
  - Run flow: click "Run Use Case" → calls `runUseCase()` → subscribes to SSE → trace steps appear one by one → run completes → recent runs refresh.

- `src/app/pages/RunDetailPage.tsx` — Complete rewrite from mock 5-step view to Figma design with live API:
  - Fetches run via `getUCRun(currentTenantId, id)` on mount.
  - **Header**: Run ID (monospace) + StatusBadge, use case name.
  - **4 metadata cards**: Tenant, Started, Completed, Use Case.
  - **3/4 execution timeline**: Uses `TraceStep` components for each step.
  - **1/4 run summary sidebar** (sticky): Total Steps, Total Latency, Total Tokens, Final Result.
  - Loading spinner and not-found state handled.

- `src/app/pages/RunsPage.tsx` — Complete rewrite from complex split-pane WebSocket/feedback UI to Figma filterable table:
  - Fetches runs via `getAllUCRuns(currentTenantId)`.
  - **Search input**: Filters by run ID, use case name, tenant ID.
  - **Date filter dropdown**: All time, Today, Yesterday, Last 7 days.
  - **Status filter pills**: All, Completed (green), Running (blue), Failed (red) — each with count badge.
  - **Table**: Run ID, Use Case, Status (StatusBadge), Steps count, Duration, Started. Clickable rows navigate to `/runs/{run_id}`.
  - Empty state with contextual message.
  - Results count indicator.

- `src/app/pages/ObservabilityPage.tsx` — Complete rewrite from summary/trends dashboard to Figma trace explorer:
  - Fetches runs + use cases + skills in parallel via `Promise.all()`.
  - Flattens all run steps into a `TraceEntry[]` array for the table.
  - **4-column filter bar**: Use Case, Skill, Status, Date Range — dynamically populated from API data.
  - **Trace table**: Step number, Run ID (blue monospace link), Skill, Tool (code badge), Latency, Tokens, Status (StatusBadge). Clickable rows.
  - **Detail drawer** (fixed right, 600px): Backdrop overlay + slide-in panel. Shows Overview (tenant, use case, skill, model, timestamp), Metrics (latency + tokens cards), Skill Instructions, Tool Request Payload (JSON), Tool Response (JSON), LLM Output (blue background).
  - Loading state, empty states for no data and no filter matches.

**Files NOT modified:**
- `src/app/routes.tsx` — No route changes. `/runs`, `/runs/:id`, `/console`, `/observability` already exist.
- `src/app/components/Layout.tsx`, `src/app/App.tsx` — Unchanged.
- `src/app/pages/TenantsPage.tsx`, `src/app/pages/CreateTenantPage.tsx` — Unchanged.
- `src/app/pages/IntegrationsPage.tsx`, `src/app/pages/IntegrationConfigPage.tsx` — Sprint #021 wiring preserved.
- `src/app/pages/SkillsPage.tsx`, `src/app/pages/SkillEditorPage.tsx` — Sprint #022 wiring preserved.
- `src/app/pages/UseCasesPage.tsx`, `src/app/pages/UseCaseBuilderPage.tsx` — Sprint #023 wiring preserved (UseCaseBuilderPage's Run button now creates real runs via upgraded endpoint).
- `src/app/pages/SettingsPage.tsx`, `src/app/pages/WorkerServiceNowPage.tsx` — Unchanged.
- `backend/routers/admin.py`, `backend/routers/runs.py` — Existing orchestrator-based run system preserved intact.

**Key architecture decisions:**

- **Separate run system** — `UseCaseRun` / `UseCaseRunStore` is distinct from the existing `AgentRun` / `RunStore`. The existing system handles orchestrator-based runs from the UI/ServiceNow with WebSocket streaming, dual-answer mode, feedback, and writeback. The new system handles use-case-based execution with step-level granularity and SSE streaming. Both coexist — the existing `/api/runs` endpoints are untouched.

- **SSE over WebSocket** — The new execution system uses Server-Sent Events instead of WebSocket. SSE is simpler (HTTP-based, auto-reconnect, no bidirectional needed) and sufficient for the unidirectional event stream. The existing WebSocket system in `runs.py` is preserved for backward compatibility.

- **Background execution via asyncio.create_task** — The run endpoint launches execution as a fire-and-forget async task. The task updates the run store in-place, so SSE clients can poll for changes. No pub/sub needed — the SSE generator polls the store every 300ms.

- **Simulated execution** — Steps simulate real processing with random latency (300–1500ms) and token counts (100–900). Tool payloads and responses are generated mocks. This provides a realistic demo experience while the actual LLM/tool integration is built in future sprints.

- **Flat trace entries for observability** — The ObservabilityPage flattens all run steps into a single table, enabling cross-run analysis. Each step is independently filterable by use case, skill, status, and date range. The detail drawer provides deep inspection of individual steps.

- **Reusable components** — StatusBadge, TraceStep, RunCard, ToolInvocation, and TimelineConnector are shared across all 4 pages, ensuring consistent visual language.

**Current route map (updated):**
```
/console                 → AgentConsolePage (live API, SSE streaming)
/runs                    → RunsPage (live API, filterable table)
/runs/:id                → RunDetailPage (live API, trace timeline + summary)
/observability           → ObservabilityPage (live API, trace explorer + drawer)
```

**Current backend endpoint map (new/changed):**
```
POST   /api/admin/{tenant_id}/use-cases/{id}/run        → Creates real run + background execution
GET    /api/admin/{tenant_id}/use-cases/{id}/runs        → List runs for use case
GET    /api/admin/{tenant_id}/use-cases/{id}/runs/{rid}  → Get single run
GET    /api/admin/{tenant_id}/use-cases/{id}/runs/{rid}/events → SSE stream
GET    /api/admin/{tenant_id}/uc-runs                    → List all runs for tenant
GET    /api/admin/{tenant_id}/uc-runs/{rid}              → Get single run
GET    /api/admin/{tenant_id}/uc-runs/{rid}/events       → SSE stream
```

**What GPT should know for next steps:**
- The full pipeline now works end-to-end: create tenant → configure integrations → define skills → build use case → run from Agent Console → watch execution in real-time → browse in Runs table → analyze in Observability trace explorer.
- Execution is simulated — each step sleeps for 300–1500ms and generates mock payloads. Real LLM/tool integration is the next major backend task.
- The existing orchestrator-based run system (`/api/runs`, WebSocket, dual-answer, feedback, writeback) is fully preserved and operational alongside the new use-case execution system.
- All 4 Figma-designed pages are implemented with exact styling from the designs, wired to live API.
- `npx tsc --noEmit` passes clean. Backend boots with 72 routes.

*Next change will be #025.*

---

## #025 — 2026-03-04 — Real Tool Execution + Agent UI + Demo Bootstrap

**What happened:**
Two feature sets delivered: (1) Sprint #025 replaced simulated execution with real tool invocation for ServiceNow and Google Drive, added run cancellation, and upgraded frontend trace components. (2) Agent UI integration added a standalone chat-based agent page at `/agentui` with a backend `/ask` endpoint and automatic demo data seeding on startup.

**Files created:**

- `backend/services/tool_executor.py` — Central dispatch function `execute_tool(tenant_id, tool_id, input_payload, app)`. Maps 7 tool IDs to handler functions across ServiceNow and Google Drive integrations. Returns `{"status": "not_implemented"}` for unregistered tools.

- `backend/services/servicenow_tools.py` — 4 ServiceNow tool handlers: `search_incidents` (queries `/api/now/table/incident`), `get_incident_details` (gets single incident by sys_id), `search_kb` (queries `/api/now/table/kb_knowledge`), `add_work_note` (PATCH work_notes). All load credentials from `snow_config_store` and make real HTTP calls via `httpx.AsyncClient`.

- `backend/services/google_drive_tools.py` — 3 Google Drive tool handlers: `search_documents`, `read_file`, `create_file`. Use existing `GoogleDriveProvider` and load config from `drive_config_store`.

- `backend/routers/agent.py` — New router at `/api/admin/{tenant_id}/agent` with `POST /ask` endpoint. Accepts `{prompt}`, loads active use cases, scores each against prompt via `_score_use_case()` (keyword overlap against name, description, triggers), executes matched use case's skill tools via `execute_tool()`, returns `{reasoning, use_case, skills, tools, result}`. Score threshold of 5% — below returns "No matching workflow found".

- `backend/bootstrap/__init__.py` — Empty package init.

- `backend/bootstrap/demo_setup.py` — `seed_demo_data(app)` auto-seeds on startup if "acme" tenant doesn't exist. Creates: ACME Corp tenant (active), ServiceNow integration (dev221705.service-now.com, admin/1Surfer1!), 4 skills (Incident Lookup, Knowledge Base Search, Documentation Search, Diagnosis Summary), 1 active use case (Email Incident Diagnosis with email-related triggers).

- `src/app/components/agentui/` — 13 Figma component files for the Agent UI:
  - `TopBar.tsx` — Agent header with name, tenant, status indicator (lucide icons)
  - `ChatMessage.tsx` — User/agent chat bubbles
  - `InputPanel.tsx` — Textarea with glow effect, Shift+Enter for newline, character counter, action buttons
  - `ExecutionPanel.tsx` — Right-side execution trace with step cards, status colors, confidence bar
  - `AgentReasoning.tsx` — Reasoning step list with status indicators
  - `SelectedUseCase.tsx` — Use case card with confidence badge
  - `SkillExecutionTimeline.tsx` — Skill execution timeline with duration badges
  - `ToolsUsed.tsx` — Tool call list with target system, response time, status codes
  - `AIRecommendation.tsx` — Resolution display with confidence and suggested actions
  - `AgentActions.tsx` — Action buttons (approve, escalate, create ticket, share)
  - `AgentResponseCard.tsx` — Structured agent response card
  - `MobileAgentView.tsx` — Mobile-optimized tabbed layout
  - `MobileApp.tsx` — Mobile wrapper with hardcoded demo data

- `src/app/pages/AgentUIPage.tsx` — Standalone dark-theme page with two-column layout. Left: chat conversation with user messages + AIRecommendation responses + loading indicator. Right: execution trace panel with reasoning steps, selected use case, skills executed, tools & APIs, execution time footer. Calls `askAgent()` API function. Mobile-responsive with MobileApp fallback at <768px.

- `src/app/components/CancelRunButton.tsx` — Red cancel button with XCircle icon for use case runs.

- `src/app/components/ToolCallItem.tsx` — Expandable tool call with request/response JSON display, uses StatusBadge.

- `src/app/components/TraceStepToolSection.tsx` — Container rendering list of ToolCallItems.

**Files modified:**

- `backend/models.py` — Added `ToolCallRecord` model (name, status, latency_ms, request, response). Added `tool_calls: list[ToolCallRecord]` to `UseCaseRunStep`. Added `"cancelled"` to `UseCaseRun.status` literal.

- `backend/routers/use_cases.py` — Replaced simulated execution with real tool invocation. `_execute_run()` now calls `execute_tool()` for each tool, builds `ToolCallRecord` list, checks for cancellation between steps.

- `backend/routers/uc_runs.py` — Added `POST /{run_id}/cancel` endpoint (sets status="cancelled"). SSE generator emits `run.cancelled` event.

- `backend/routers/__init__.py` — Added `agent_router` to imports and `__all__`.

- `backend/main.py` — Added `lifespan` context manager calling `seed_demo_data()` on startup. Added `agent_router` import and `app.include_router(agent_router)`. Backend now boots with 74 routes.

- `src/app/routes.tsx` — Added `AgentUIPage` import and `/agentui` route (outside Layout, no sidebar entry).

- `src/app/services/api.ts` — Added `AgentAskResponse` interface and `askAgent()` function. Added `ToolCallRecordResponse` interface. Added `tool_calls` to `UseCaseRunStepResponse`. Added `'cancelled'` to `UseCaseRunResponse.status`. Added `onRunCancelled` callback to `connectUCRunEvents()`. Added `cancelUCRun()` function.

- `src/app/components/StatusBadge.tsx` — Added "cancelled" status type with orange variant.

- `src/app/components/TraceStep.tsx` — Added `toolCalls` prop and `TraceStepToolSection` rendering.

- `src/app/pages/AgentConsolePage.tsx` — Added CancelRunButton, cancel handler, toolCalls mapping on TraceStep, cancelled/failed indicators.

- `src/app/pages/RunDetailPage.tsx` — Added CancelRunButton in header, cancel handler, toolCalls mapping on TraceStep.

- `src/app/pages/RunsPage.tsx` — Updated StatusBadge usage.

**Key architecture decisions:**

- **Real tool execution** — `execute_tool()` dispatches to integration-specific handlers that make real HTTP calls. Each tool call is individually timed and recorded as a `ToolCallRecord`. Non-implemented tools return a status marker rather than failing.

- **Cooperative cancellation** — Execution loop checks `run.status` from the store before each step. Cancel endpoint sets status to "cancelled", and the next iteration exits. SSE emits `run.cancelled` for frontend cleanup.

- **Agent UI isolation** — All Figma Agent UI components under `src/app/components/agentui/` to avoid name conflicts with existing components. Route at `/agentui` is outside Layout wrapper.

- **Demo bootstrap via lifespan** — `seed_demo_data()` runs in FastAPI's `lifespan` context manager. Only seeds if "acme" tenant doesn't exist, making it idempotent across restarts.

- **Keyword scoring** — `_score_use_case()` computes token overlap between prompt and use case name/description/triggers. Simple but effective for demo; threshold at 5% prevents false matches.

**Current backend endpoint map (new):**
```
POST   /api/admin/{tenant_id}/agent/ask                  → Agent prompt → use case match → tool execution → result
POST   /api/admin/{tenant_id}/uc-runs/{rid}/cancel       → Cancel a running use case execution
```

**Current route map (new):**
```
/agentui                 → AgentUIPage (standalone, no sidebar)
```

**Verification:**
- `npx tsc --noEmit` passes clean.
- Backend boots with 74 routes.
- Demo data auto-seeds on startup.

*Next change will be #026.*

---

## #026 — 2026-03-05 — Blank Page Bugfix: Named vs Default Export Mismatch

**What happened:**
Fixed a critical bug where the entire app rendered as a blank white page. The root cause was a named-import / default-export mismatch in `routes.tsx`: `RunsPage` and `ObservabilityPage` were changed to `export default` in Sprint #024 rewrites, but `routes.tsx` still used named imports (`import { RunsPage }`). Vite dev mode is lenient about this (no compile error, `tsc --noEmit` passes), but it causes a silent runtime crash in the browser — the imported binding is `undefined`, which crashes `createBrowserRouter` before React mounts, resulting in a completely blank page with no visible error. Also added a top-level React ErrorBoundary to `main.tsx` so future runtime errors display on screen instead of silently failing.

**Files modified:**

- `src/app/routes.tsx` — Changed `import { RunsPage } from './pages/RunsPage'` to `import RunsPage from './pages/RunsPage'`. Changed `import { ObservabilityPage } from './pages/ObservabilityPage'` to `import ObservabilityPage from './pages/ObservabilityPage'`. Both pages use `export default function` but were imported with named-export destructuring syntax.

- `src/main.tsx` — Added `ErrorBoundary` class component wrapping `<App />`. On uncaught render error, displays error message and stack trace in red monospace text instead of a blank page. Imports `Component` and `ReactNode` from React.

**Diagnosis method:**
- Browser showed blank white page with no visible error
- `tsc --noEmit` passed clean (TypeScript doesn't distinguish named vs default at this level)
- `vite build` (Rollup) caught the error: `"RunsPage" is not exported by "src/app/pages/RunsPage.tsx"`
- Vite dev mode uses esbuild which is more permissive than Rollup for this case

**Key lesson:**
When all routes are defined in a single `createBrowserRouter()` call, a single broken import kills the entire app — not just the affected route. The error happens at module evaluation time, before React mounts, so React error boundaries don't help. The fix is to always verify import style matches export style, and to use `vite build` as a stricter check than `tsc --noEmit`.

**Verification:**
- `vite build` passes clean (1951 modules, 574KB JS bundle)
- All routes render correctly in browser
- `/agentui` page displays dark-theme Agent UI as designed

*Next change will be #027.*

---

## #027 — 2026-03-05 — Agent SSE Streaming Endpoint

**What happened:**
Added a new `POST /api/admin/{tenant_id}/agent/stream` endpoint that returns a Server-Sent Event stream, enabling the Agent UI to show reasoning and tool execution live instead of waiting for a single response. The existing `/ask` endpoint is unchanged for backward compatibility.

**SSE event sequence:**
```
event: reasoning        → {"message": "Analyzing request: \"...\""}
event: reasoning        → {"message": "Evaluating N active use case(s)"}
event: reasoning        → {"message": "Best match: \"...\" (score: NN%)"}
event: use_case_selected → {"name": "...", "description": "...", "confidence": 0.XX}
event: skill_started    → {"skill": "Incident Lookup"}
event: tool_called      → {"tool": "servicenow.search_incidents", "skill": "..."}
event: tool_result      → {"tool": "...", "skill": "...", "summary": "...", "status": "ok|error"}
event: skill_completed  → {"skill": "Incident Lookup"}
  ... (repeats for each skill/tool) ...
event: final_result     → {"result": "...resolution text...", "confidence": 0.XX}
```

**Files modified:**

- `backend/routers/agent.py` — Added imports: `asyncio`, `json`, `AsyncGenerator`, `StreamingResponse`. Added `_sse_event()` helper to format SSE events. Added `_summarize_tool_result()` helper (extracted from inline logic in `/ask`). Added `POST /stream` endpoint using `StreamingResponse` with `text/event-stream` media type. The generator: parses prompt, scores use cases, yields reasoning events, yields use case selection, executes skills sequentially (emitting `skill_started` / `tool_called` / `tool_result` / `skill_completed` for each), then emits `final_result`. Early-exits with `final_result` if no active use cases or score below threshold. Includes `Cache-Control: no-cache`, `Connection: keep-alive`, `X-Accel-Buffering: no` headers.

**Files NOT modified:**
- `backend/routers/__init__.py`, `backend/main.py` — No changes needed; the agent router was already registered and the new endpoint is on the same router.
- `src/app/pages/AgentUIPage.tsx` — Not yet wired to the stream endpoint (still uses `/ask`).

**Current backend endpoint map (new):**
```
POST   /api/admin/{tenant_id}/agent/stream  → SSE stream of reasoning + tool execution events
```

**Verification:**
- `curl -sN` test confirms correct SSE event format and ordering
- Agent router now has 2 routes (`/ask` + `/stream`)
- Backend boots cleanly with 75 routes

*Next change will be #028.*

---

## #028 — 2026-03-05 — Agent SSE Streaming Client

**What happened:**
Created a frontend streaming client for the agent SSE endpoint. The client uses `fetch()` with `ReadableStream` to consume SSE events from `POST /api/admin/{tenant_id}/agent/stream` and dispatches parsed events to typed callback handlers. Returns a cancel function backed by `AbortController` for aborting in-flight streams.

**Files created:**

- `src/app/services/agentStream.ts` — Exports `streamAgent(tenantId, prompt, handlers)` function and `StreamHandlers` interface. Implementation: POSTs to `/api/admin/{tenantId}/agent/stream` with `{prompt}` body, reads the response body as a `ReadableStream`, buffers chunks via `TextDecoder`, splits on double-newline SSE boundaries, parses `event:` and `data:` lines, JSON-parses the data payload, and dispatches to the matching handler callback (`onReasoning`, `onUseCase`, `onSkillStarted`, `onToolCalled`, `onToolResult`, `onSkillCompleted`, `onFinalResult`, `onError`). Suppresses `AbortError` when cancelled. Returns `() => void` cancel function.

**Verification:**
- `npx tsc --noEmit` passes clean.

*Next change will be #029.*

---

## #029 — 2026-03-05 — Wire Agent UI to SSE Streaming Endpoint

**What happened:**
Updated `AgentUIPage` to use the `streamAgent()` SSE client instead of the batch `askAgent()` call. The execution trace panel now updates live as events arrive — reasoning steps appear one by one, skills show "running" then flip to "completed", tools appear as they're called and update with results. Layout and styling are unchanged; only the data wiring was modified.

**Files modified:**

- `src/app/pages/AgentUIPage.tsx` — Replaced `askAgent` import with `streamAgent` from `../services/agentStream`. Removed `AgentAskResponse` type import. Changed `handleSendMessage` from `async` to synchronous (stream is fire-and-forget). Added `cancelRef` (`useRef`) to store the cancel function from `streamAgent` — called on new submissions to abort any in-flight stream. Added `reasoningCountRef`, `skillCountRef`, `toolCountRef` refs for incrementing IDs across handler callbacks. Handler wiring:
  - `onReasoning` → appends to `reasoningSteps` with `status: "completed"` and rotating icons
  - `onUseCase` → sets `selectedUseCase` with confidence converted from decimal to percentage
  - `onSkillStarted` → appends to `skillExecutions` with `status: "running"`
  - `onToolCalled` → appends to `toolCalls` with `status: "running"`, derives `targetSystem` from tool ID prefix
  - `onToolResult` → updates matching tool call's status (`"success"` or `"error"`), responseTime, statusCode
  - `onSkillCompleted` → updates matching skill's status to `"completed"`
  - `onFinalResult` → calculates execution time, sets recommendation, adds agent message to chat, sets `isLoading(false)`
  - `onError` → appends error reasoning step, sets `isLoading(false)`
  - Changed `Message` interface: replaced `response?: AgentResponse` with `result?: string` since we no longer receive the full batch response object

**Verification:**
- `npx tsc --noEmit` passes clean.

*Next change will be #030.*

---

## #030 — 2026-03-05 — Live Tool Execution Display in ToolsUsed Component

**What happened:**
Updated the `ToolsUsed` component and its integration in `AgentUIPage` so that tool execution is visible live during streaming. Tools now appear with `"running"` status when `tool_called` arrives and update to `"success"` or `"error"` with a summary line when `tool_result` arrives.

**Files modified:**

- `src/app/components/agentui/ToolsUsed.tsx` — Added optional `summary?: string` field to `ToolCall` interface. Added a `<p>` element below the system/metadata row that renders `tool.summary` as truncated gray text when present.

- `src/app/pages/AgentUIPage.tsx` — Updated `onToolResult` handler: now uses `findLastIndex` to locate the last matching tool with `status: "running"` (handles duplicate tool names correctly). Sets `status`, `statusCode`, and `summary` on the matched entry. Removed the old `responseTime`-based summary which was overloading that field.

**Verification:**
- `npx tsc --noEmit` passes clean.

*Next change will be #031.*

---

## #031 — 2026-03-05 — Persist Agent UI Runs

**What happened:**
Added `AgentUIRun` and `AgentUIRunEvent` models with corresponding store ABCs and in-memory implementations so that every `/agent/stream` SSE session is persisted and can be replayed later.

**Files modified:**

- `backend/models.py` — Added `AgentUIRun` (id, tenant_id, prompt, selected_use_case, result, confidence, status, created_at) and `AgentUIRunEvent` (id, run_id, event_type, payload, timestamp) models.

- `backend/store/interface.py` — Added `AgentUIRunStore` ABC (create, get, list_for_tenant, update) and `AgentUIRunEventStore` ABC (create, list_for_run).

- `backend/store/memory.py` — Added `InMemoryAgentUIRunStore` (dict keyed by id, update uses model_dump merge) and `InMemoryAgentUIRunEventStore` (dict keyed by id, list_for_run returns sorted by timestamp).

- `backend/store/__init__.py` — Exported all 4 new classes.

- `backend/main.py` — Registered `app.state.agent_ui_run_store` and `app.state.agent_ui_run_event_store`.

- `backend/routers/agent.py` — Updated `stream_agent` → `generate()`: creates `AgentUIRun` at start, persists each SSE event as `AgentUIRunEvent` via `_emit()` helper, updates run with result/confidence/status on `final_result`, sets `status="error"` on exception. ID format: `arun_<hex12>` / `arevt_<hex12>`.

**Note:** Named `AgentUIRun`/`AgentUIRunEvent` (not `AgentRun`/`AgentRunEvent`) to avoid collision with existing execution-plane `AgentRun`/`AgentEvent` models.

**Verification:**
- All new imports resolve cleanly (`python -c` smoke test).
- SSE streaming behavior unchanged — `_emit()` wraps `_sse_event()` transparently.

*Next change will be #032.*

---

## #032 — 2026-03-05 — Actions Module (Admin CRUD + Agent UI Dynamic Loading)

**What happened:**
Added a full Actions module — backend model, CRUD API, admin catalog UI, and dynamic action loading in the Agent UI. Actions represent integration-agnostic operations (create incident, send Slack message, generate PDF, etc.) that the agent can execute after analyzing a request.

**Backend files:**

- `backend/models.py` — Added `Action`, `ActionParameter`, `ActionRule`, `CreateActionRequest`, `UpdateActionRequest`, `ExecuteActionRequest` models.

- `backend/store/interface.py` — Added `ActionStore` ABC (create, get, list_for_tenant, update, delete).

- `backend/store/memory.py` — Added `InMemoryActionStore` implementation.

- `backend/store/__init__.py` — Exported `ActionStore` and `InMemoryActionStore`.

- `backend/main.py` — Registered `app.state.action_store = InMemoryActionStore()` and `actions_router`.

- `backend/routers/actions.py` — New router with CRUD endpoints (`GET/POST/PUT/DELETE /api/admin/{tenant_id}/actions`), `POST /{action_id}/execute` (placeholder), and `get_available_actions_for_run()` context filter placeholder.

- `backend/routers/__init__.py` — Exported `actions_router`.

- `backend/bootstrap/demo_setup.py` — Seeds 5 demo actions (Create Incident, Create Jira Issue, Generate PDF Report, Send Slack Notification, Create Google Doc).

**Frontend files:**

- `src/app/pages/ActionsCatalogPage.tsx` — Admin catalog page wired to `GET/PUT/DELETE` API endpoints (replaced mock data).

- `src/app/pages/CreateEditActionPage.tsx` — Create/edit form wired to `POST/PUT` API (loads existing action on edit, submits parameters).

- `src/app/pages/ActionVisibilityRulesPage.tsx` — Visibility rules UI (copied from design, uses local state for now).

- `src/app/pages/AgentUIActionsPage.tsx` — Agent UI actions preview page (copied from design).

- `src/app/components/Layout.tsx` — Added "Actions" nav item with Zap icon between Skills and Use Cases.

- `src/app/routes.tsx` — Added 5 routes: `/actions`, `/actions/create`, `/actions/:id`, `/actions/:id/visibility`, `/actions/preview`.

- `src/app/components/agentui/AgentActions.tsx` — Replaced hard-coded actions with dynamic loading from `GET /api/admin/acme/actions`. Falls back to prop-provided actions. Calls `POST /actions/{id}/execute` on click. Shows executing/completed states.

**Also in this changeset:**

- `backend/services/servicenow_tools.py` — Fixed auth to use explicit `Authorization: Basic` header (resolves `!` in password). Added non-JSON response handling for hibernating instances. Fixed response keys to `incidents`/`articles`.

**Verification:**
- `npx tsc --noEmit` passes clean.
- All backend imports resolve (`python -c` smoke test).
- Actions CRUD API functional, demo data seeded on startup.

*Next change will be #033.*

---

## #033 — 2026-03-05 — Context-Aware Action Recommendation System

**What happened:**
Transformed agent actions from static buttons into context-aware recommendations. Actions now only appear when they are relevant to the user's question and the agent's analysis, scored by a recommendation engine that evaluates use case match, keyword overlap, skill usage, and confidence threshold.

**Scoring algorithm (in `action_recommendation.py`):**
- `+3` — use_case rule matches the selected use case
- `+2` — keyword rule matches prompt tokens
- `+2` — skill rule matches skills_used in the run
- `+1` — confidence threshold is satisfied
- Actions scoring ≥ 2 are "recommended"; the rest are "available"

**Backend changes:**

- `backend/models.py` — Added `skills_used: list[str]` to `AgentUIRun` model to track which skills were executed during a run.

- `backend/services/action_recommendation.py` — **NEW.** Recommendation scoring service with `recommend_actions(run, actions)` → `(recommended, available)`. Scores each action's `rules` list against the run context (selected_use_case, prompt, skills_used, confidence).

- `backend/routers/actions.py` — Replaced placeholder `get_available_actions_for_run()` with `GET /recommendations/{run_id}` endpoint. Returns `{recommended: [...], available: [...]}` with scores on recommended items.

- `backend/routers/agent.py` — Emits new `run_started` SSE event with `{run_id}` so the frontend knows the run ID. Tracks `skills_used` list during skill execution and persists it on the `AgentUIRun` record at completion.

- `backend/bootstrap/demo_setup.py` — Enriched demo action rules: "Create Incident" now has use_case + keyword + skill + confidence rules. Other actions have keyword and skill-based rules for contextual matching.

**Frontend changes:**

- `src/app/services/agentStream.ts` — Added `onRunStarted` handler to `StreamHandlers` interface. Parses new `run_started` SSE event.

- `src/app/pages/AgentUIPage.tsx` — Tracks `runId` state from `onRunStarted` callback. Passes `runId` prop to `AgentActions` component.

- `src/app/components/agentui/AgentActions.tsx` — Accepts `runId` prop. When `runId` is present, fetches from `GET /api/admin/acme/actions/recommendations/{runId}` instead of listing all actions. Renders two sections: "Recommended" (with star icon and enhanced styling) and "Other Actions". Falls back to loading all active actions when no `runId` is available. Extracted `ActionButton` into its own component for reuse across sections.

**Verification:**
- Backend: `GET /api/admin/acme/actions/recommendations/{run_id}` returns scored recommendations after a stream completes.
- Frontend: After submitting a prompt in the Agent UI, actions panel shows contextually relevant actions under "Recommended" with a star badge, and remaining actions under "Other Actions".

*Next change will be #034.*

---

## #034 — 2026-03-05 — Agent UI Nautical Color Scheme

**What happened:**
Restyled all Agent UI components from the default dark theme to a consistent nautical blue palette. Every component under `src/app/components/agentui/` and the `AgentUIPage` now uses the same color system.

**Color palette:**
- Background: `#0B1E2D` (deep navy)
- Card/surface: `#102A43` (dark blue-grey)
- Borders: `#2F5F7A` (steel blue)
- Primary text: `#F1F5F9` (near-white)
- Secondary text: `#C7D2DA` (light grey-blue)
- Muted text: `#8FA7B5` (grey-blue)
- Accent teal: `#59C3C3`
- Accent blue: `#2E86AB`
- Accent gold: `#F6C667`

**Files changed:**
- `src/app/components/agentui/TopBar.tsx` — Navy background, steel-blue borders, teal status dot
- `src/app/components/agentui/ChatMessage.tsx` — User messages get `#102A43` bubble, agent messages get `#0B1E2D`
- `src/app/components/agentui/InputPanel.tsx` — Dark input field, steel-blue border, teal send button
- `src/app/components/agentui/AgentReasoning.tsx` — Nautical step indicators with teal/blue/gold status colors
- `src/app/components/agentui/SelectedUseCase.tsx` — Navy card with steel-blue border
- `src/app/components/agentui/SkillExecutionTimeline.tsx` — Nautical timeline connectors and status pills
- `src/app/components/agentui/ToolsUsed.tsx` — Dark tool cards with status code badges
- `src/app/components/agentui/AIRecommendation.tsx` — Navy recommendation card with teal accents
- `src/app/components/agentui/AgentActions.tsx` — Dark action buttons with nautical hover states
- `src/app/components/agentui/AgentResponseCard.tsx` — Navy response card
- `src/app/components/agentui/ExecutionPanel.tsx` — Dark execution panel
- `src/app/components/agentui/MobileAgentView.tsx` — Mobile view restyled to match
- `src/app/pages/AgentUIPage.tsx` — Navy background, custom scrollbar with `#2F5F7A` thumb, two-column layout with execution trace panel

---

## #035 — 2026-03-05 — Settings Page Redesign: LLM Providers Section

**What happened:**
Replaced the old tabbed Settings page (LLM Setup + Tenant Intelligence) with a new three-section AI Infrastructure control panel. This entry covers the LLM Providers section.

**LLM Providers table columns:**
- Provider (icon + name)
- Model
- Connection Status (pill badge)
- Token Cost (input/output per 1K tokens)
- Actions (edit/delete)

**Add Provider slide-out panel:**
- Right-side overlay panel with: Provider selector, API Key, Model selector, Token Pricing (input/output cost fields), Test Connection button, Save button
- Auto-generates label from `{Provider} — {Model}` when label is left blank
- Save guard only requires API Key and Model

**Key implementation details:**
- `DEFAULT_MODEL_PRICING` constant provides default costs for new configs (e.g., Claude Sonnet: $0.003/$0.015)
- Existing configs display their persisted pricing from the backend
- All buttons use explicit `bg-gray-900 text-white` instead of CSS variable `bg-primary` for reliability
- Right sidebar shows LLM Cost Snapshot summary

**Files changed:**
- `src/app/pages/SettingsPage.tsx` — Complete rewrite (~1200 lines)

---

## #036 — 2026-03-05 — Settings Page Redesign: Tenant Model Access Section

**What happened:**
Added the Tenant Model Access section to the Settings page. A matrix table with rows = tenants and columns = LLM models, where each cell shows assignment status.

**Matrix behavior:**
- Each cell shows "Enabled" (green pill) or "Disabled" (grey pill)
- Clicking a cell opens a positioned popover panel with:
  - **Enabled toggle** — assigns/unassigns the model for that tenant
  - **Default model toggle** — sets this as the tenant's active model (star icon)
  - **Fallback model selector** — dropdown to pick a fallback model (client-side only, no backend field)
- Star icon on the cell indicates the tenant's default/active model
- RotateCcw icon indicates a configured fallback

**State management:**
- `assignPanel` state tracks which cell popover is open
- `fallbackMap` state: `Record<string, string>` for client-side fallback tracking (keyed by `tenantId-configId`)

**Files changed:**
- `src/app/pages/SettingsPage.tsx` — Added matrix section

---

## #037 — 2026-03-05 — Persist Token Pricing on LLM Config

**What happened:**
Added `input_token_cost` and `output_token_cost` fields to the `LLMConfig` model so token pricing is persisted per provider rather than hardcoded.

**Backend changes:**
- `backend/models.py` — Added `input_token_cost: float = 0.0` and `output_token_cost: float = 0.0` to `LLMConfig`, `CreateLLMConfigRequest` (default `0.0`), and `UpdateLLMConfigRequest` (Optional)
- `backend/routers/llm_configs.py` — Pass `input_token_cost` and `output_token_cost` from request body to `LLMConfig` constructor on create
- `backend/bootstrap/demo_setup.py` — Demo Anthropic config seeded with `input_token_cost=0.003, output_token_cost=0.015`

**Frontend changes:**
- `src/app/services/api.ts` — `LLMConfigResponse` includes `input_token_cost` and `output_token_cost`. `createLLMConfig()` and `updateLLMConfig()` accept pricing params.
- `src/app/pages/SettingsPage.tsx` — Provider table reads pricing from persisted config; `FormState` includes `inputTokenCost` and `outputTokenCost` string fields; `handleSave()` sends pricing to backend.

**Compatibility note:**
- `calculate_llm_cost()` in the execution plane still uses its own hardcoded `LLM_PRICING` dict — unaffected by these config fields (by design).
- `CLAUDE_API_KEY` fallback in agent orchestration remains intact.

---

## #038 — 2026-03-06 — Agent UI Branding: Love-Boat.AI

**What happened:**
Rebranded the Agent UI from "Enterprise" to "Love-Boat.AI" and added the Love Boat heart/wave logo.

**Changes:**
- `src/app/pages/AgentUIPage.tsx` — Replaced all 3 occurrences: `agentName="Love-Boat.AI Agent"`, heading "Ask the Love-Boat.AI Agent", category "Love-Boat.AI Operations"
- `src/app/components/agentui/TopBar.tsx` — Replaced the `Activity` icon with `<img src="/lb.png" alt="Love-Boat.AI" />` in the far-left position. Uses `mix-blend-mode: screen` to drop white background against the dark navy UI. Removed `Activity` icon import from lucide-react.
- `public/lb.png` — Love Boat heart/wave logo image

---

## #039 — 2026-03-06 — Remove Confidence Score from AIRecommendation

**What happened:**
Removed the Confidence Score section (progress bar with percentage and label) from the `AIRecommendation` component. The section had a `TrendingUp` icon, a progress bar, a percentage display, and a confidence label (Very High/High/Medium/Low).

**Files changed:**
- `src/app/components/agentui/AIRecommendation.tsx` — Removed the "Confidence Score" `<div>` block. The `getConfidenceLevel()` and `getPriorityStyles()` helper functions remain (used by other parts of the component). Removed `TrendingUp` from the lucide-react import.

---

## #040 — 2026-03-06 — Integration Config Page Overhaul

**What happened:**
Overhauled the Integration Config page with a full-featured configuration UI including real-time field editing, connection testing, and enable/disable controls.

**Files changed:**
- `src/app/pages/IntegrationConfigPage.tsx` — Enhanced from a minimal placeholder to a full config editor
- `backend/routers/integrations.py` — Extended integration catalog and configuration endpoints
- `backend/services/google_drive_tools.py` — Enhanced Google Drive tooling
- `backend/services/servicenow_tools.py` — Added ServiceNow tool functions
- `backend/services/action_executor.py` — Updated action execution logic

---

## #041 — 2026-03-06 — Fix Tenant Configuration (Edit Mode)

**What happened:**
Fixed a bug where clicking the Settings/Configure button on an existing tenant opened a blank "Create Tenant" form with no data loaded. Users could not see the tenant name/ID, add integrations, or manage use cases.

**Root cause:**
`TenantsPage.tsx` line 100 navigated to `/tenants/create` (hardcoded) instead of passing the tenant ID.

**Fix — 3 files:**

1. `src/app/pages/TenantsPage.tsx` — Changed `navigate('/tenants/create')` → `navigate('/tenants/${tenant.id}')` on the Settings button.

2. `src/app/routes.tsx` — Added new route `tenants/:id` pointing to `CreateTenantPage`, alongside the existing `tenants/create` route.

3. `src/app/pages/CreateTenantPage.tsx` — Rewrote to support both create and edit modes:
   - Uses `useParams()` to detect `:id` parameter → triggers edit mode
   - **Step 1 (Tenant Details)**: In edit mode, loads tenant via `getTenant(id)` and pre-fills Name, Tenant ID (read-only), and Status
   - **Step 2 (Integrations)**: Loads existing integrations via `getIntegrations()` and the integration catalog via `getIntegrationCatalog()`. Shows each integration with type label, enabled/disabled status, connection status, Configure and Delete buttons. Lists available catalog entries with Add buttons.
   - **Step 3 (Use Cases)**: Loads use cases via `getUseCases()`. Shows each with name, truncated description, status badge, step count, Edit and Delete buttons. Includes "Create Use Case" button.
   - **Step 4 (Summary)**: Shows count of integrations and use cases configured. Button label changes from "Create Tenant" to "Done" in edit mode.
   - In edit mode, step indicators are clickable for direct navigation between steps.

**New imports in CreateTenantPage:**
`getTenant`, `createTenant`, `getIntegrations`, `getIntegrationCatalog`, `createIntegration`, `deleteIntegration`, `getUseCases`, `deleteUseCase` from `api.ts`. Lucide icons: `Loader2`, `Plus`, `Trash2`, `Plug`, `BookOpen`.

---

## #042 — 2026-03-06 — Admin Layout & Backend Infrastructure Updates

**What happened:**
Several supporting infrastructure changes across backend and frontend that accompanied the above features.

**Backend:**
- `backend/main.py` — Registered new stores on `app.state` (agent run store, agent run event store)
- `backend/models.py` — Added `AgentRun` and `AgentRunEvent` models for persisting agent UI runs and their SSE events
- `backend/store/interface.py` — Added `AgentRunStore` and `AgentRunEventStore` abstract base classes
- `backend/store/memory.py` — Added `InMemoryAgentRunStore` and `InMemoryAgentRunEventStore` implementations
- `backend/store/__init__.py` — Exported new store classes
- `backend/routers/__init__.py` — Updated router registration
- `backend/routers/agent.py` — Persists `AgentRun` and `AgentRunEvent` records during SSE streaming; emits `run_started` event with `run_id`

**Frontend:**
- `src/app/components/Layout.tsx` — Updated admin layout/navigation structure
- `src/app/services/api.ts` — Added `input_token_cost`/`output_token_cost` to `LLMConfigResponse`, updated `createLLMConfig()` and `updateLLMConfig()` signatures, added integration and use-case API function types
- `src/app/services/agentStream.ts` — Added `onRunStarted` handler to `StreamHandlers` interface

*Next change will be #044.*

---

## #043 — 2026-03-07 — ServiceNow Catalog to Replit (by Title)

**What happened:**
Added a new action "ServiceNow Catalog to Replit" that lets users fetch a ServiceNow catalog by name and convert it into a Replit app. Unlike the existing "ServiceNow to Replit" action (which uses a hardcoded service URL), this action asks the user for the catalog title, transforms spaces to `%20`, calls the `catalogbytitleservice` web service endpoint, then runs the same LLM draft → refine → approve → push-to-Replit flow.

**User flow:**
1. User types something like "I want to convert my servicenow catalog to replit" → action appears
2. User clicks the action → agent asks "What is the name of the catalog?"
3. User types a name (e.g., "Technical Catalog") and hits Enter
4. Backend transforms to `Technical%20Catalog`, calls `GET https://dev221705.service-now.com/api/1939459/catalogbytitleservice/catalog/Technical%20Catalog`
5. Payload returns → LLM generates a draft Replit prompt (same prompt header format as existing action)
6. User can refine the prompt via chat until satisfied
7. User clicks "Approve & Send to Replit" → repl is created

**Backend:**
- `backend/services/snow_to_replit.py` — Added `convert_catalog_by_title_to_replit()`: returns `needs_input` when no `catalog_title` provided; when given, URL-encodes spaces, fetches from the `catalogbytitleservice` endpoint, and runs LLM draft generation using the same `_DRAFT_SYSTEM_PROMPT` and `_fetch_catalog` helpers
- `backend/services/action_executor.py` — Registered `servicenow:catalog_by_title_to_replit` → `snow_to_replit.convert_catalog_by_title_to_replit`
- `backend/bootstrap/demo_setup.py` — Added "ServiceNow Catalog to Replit" action definition with `catalog_by_title_to_replit` operation, `user_input` source for `catalog_title`, keyword triggers: `convert,servicenow,catalog,replit`

**Frontend:**
- `src/app/components/agentui/AgentActions.tsx` — Added `NeedsInputPayload` interface and `onNeedsInput` prop; `handleClick` now detects `needs_input` status from backend and fires the callback
- `src/app/pages/AgentUIPage.tsx` — Added `InputCollectionState` and `inputState`; `handleSendMessage` intercepts input mode to send the user's answer back to the action execute endpoint, then transitions to draft/refine mode; added `handleNeedsInput` callback wired to all `AgentActions` instances
- `src/app/components/agentui/InputPanel.tsx` — Added `"input"` mode with `inputPrompt` prop for contextual placeholder text and "Submit" button label

---

## #044 — 2026-03-09 — Runtime Defaults Backend + Save Configuration Wiring

**What happened:**
Added full-stack support for persisting per-tenant runtime defaults (max tokens per run, cost guardrails). Previously the "Save Configuration" button in Settings → Runtime Defaults had no backend wiring.

**Backend:**
- `backend/models.py` — Added `RuntimeDefaults` model (`tenant_id`, `max_tokens_per_run`, `cost_guardrail_per_run`, `cost_guardrail_daily`, `updated_at`) and `UpdateRuntimeDefaultsRequest`
- `backend/main.py` — Added `app.state.runtime_defaults = {}` (dict keyed by tenant_id)
- `backend/routers/admin.py` — Added `GET /runtime-defaults` and `PUT /runtime-defaults` endpoints with tenant validation and upsert logic

**Frontend:**
- `src/app/services/api.ts` — Added `RuntimeDefaultsResponse` interface, `getRuntimeDefaults()`, and `updateRuntimeDefaults()` functions
- `src/app/pages/SettingsPage.tsx` — Wired Save Configuration button with `useEffect` to load defaults on mount, `handleSaveRuntimeDefaults` async handler, loading/saved/error icon states on the button

---

## #045 — 2026-03-09 — ServiceNow Catalog Cleanup + Error Handling Hardening

**What happened:**
Fixed multiple issues in the ServiceNow-to-Replit pipeline: empty error messages, refinement failures, truncated output, raw HTML in drafts, and Agent Actions appearing below drafts.

**Refinement & LLM fixes:**
- `backend/services/claude_client.py` — Increased `max_tokens` from 1024 → 16384 for both Anthropic and OpenAI calls to prevent output truncation
- `backend/services/snow_to_replit.py` — Changed `except ClaudeClientError` to `except Exception` in both draft generation functions to catch all LLM failures; added `except Exception` catch-all in `refine_prompt`

**Error handling:**
- `backend/services/action_executor.py` — Fixed empty error string from `httpx.TimeoutException('')` by using `str(e) or f"{type(e).__name__}: {repr(e)}"`

**Frontend fixes:**
- `src/app/pages/AgentUIPage.tsx` — Changed input collection fetch URL from `http://localhost:8000/api/...` to `/api/...` (Vite proxy); added `res.ok` checks before parsing response; added `else` branch for unexpected response statuses; changed error messages from `agent-structured` to `agent-result` type (no AgentActions below errors); wrapped inline AgentActions with `{!draftState && !inputState && (...)}` to hide during draft/input modes

---

## #046 — 2026-03-09 — Catalog Payload Optimization (1.28MB → 113KB)

**What happened:**
Rewrote the ServiceNow catalog cleanup pipeline to be structure-aware instead of generic. The raw catalog payload (1.28MB) was causing LLM timeouts because the old approach sent 200K+ chars to an LLM for reformatting, then made a second LLM call for draft generation — two massive calls in sequence.

**Root cause:** The ServiceNow response contains a `prompts` field on every item that duplicates the item data as an embedded string — accounting for **79% of the payload**. The old generic cleanup only stripped 22% of the noise.

**New pipeline:**
- `_clean_catalog_item()` — Structure-aware per-item cleanup: drops `prompts` duplication entirely, strips `sys_id` fields, cleans HTML from descriptions, keeps only useful variable fields (`name`, `question`, `type`, `mandatory`, `choices`), drops `help_text` and `workflow_summary`
- `_reformat_catalog()` — Now synchronous (no LLM call): parses the `{result: {items: [...]}}` wrapper, runs `_clean_catalog_item` on each entry, collects unique categories, outputs structured JSON with `catalog_title`, `total_items`, `total_categories`, `categories[]`, and `items[]`
- Eliminated the LLM reformat call entirely — the deterministic cleanup is instant and produces better results
- `_MAX_LLM_CATALOG_CHARS` changed from 200K to 150K (cleaned output is ~113K, fits without truncation)

**Result:** 1,286,670 chars → 112,860 chars (91.8% reduction). All 185 items and 26 categories preserved. Pipeline went from 2+ minute timeout to ~3 second ServiceNow fetch + single LLM draft call.

**Vite proxy:**
- `vite.config.ts` — Added `timeout: 300000` and `proxyTimeout: 300000` (5 minutes) for the `/api` proxy to handle slow ServiceNow instances
- `src/app/components/agentui/AgentActions.tsx` — Changed `API_BASE` from `http://localhost:8000/api/admin/acme/actions` to `/api/admin/acme/actions` (Vite proxy)

---

## #047 — 2026-03-09 — Header-Only Prompt Refinement

**What happened:**
Refinement was timing out (`ReadTimeout`) because it sent the entire 113K+ draft prompt (instructions + embedded catalog JSON) to the LLM. The user's feedback only applies to the instruction header — the catalog data never changes.

**Fix:**
- `backend/services/snow_to_replit.py` — Added `_split_prompt_and_data()` that splits a draft prompt at the first JSON block (`{` or `[` on its own line), separating the instruction header from the embedded catalog data
- `refine_prompt()` — Now sends only the header (~200-500 chars) to the LLM for refinement, then reassembles the refined header with the original catalog data automatically
- `_REFINE_SYSTEM_PROMPT` — Updated to tell the LLM it's only seeing the instruction header, not to reproduce catalog data

**Result:** Refinement calls went from 113K+ chars (timeout) to ~500 chars (5-10 second response).

---

## #048 — 2026-03-10 — Progress Steps + Branding + Clipboard Fix

**What happened:**
Three UX improvements: progress indicators during long operations, rebranding from Love-Boat.AI to OverYonder.ai, and fixing the clipboard to always contain the refined prompt.

**Progress indicators:**
- `src/app/pages/AgentUIPage.tsx` — Added `loadingStatus` state and `startProgressSteps()` timer system that shows contextual progress messages during long operations:
  - Input collection: "Connecting to ServiceNow..." → "Fetching catalog..." → "Received catalog data — cleaning and formatting..." → "Analyzing catalog structure..." → "Generating draft Replit prompt..." → "Finalizing draft..."
  - Refinement: "Processing your feedback..." → "Refining the Replit prompt..." → "Incorporating changes..."
  - Normal agent queries: "Agent is thinking..."
- Loading indicator now shows `{loadingStatus}` instead of hardcoded "Agent is thinking..."
- All timers properly cleaned up via `clearLoadingTimers()` on response/error

**Branding:**
- `src/app/pages/AgentUIPage.tsx` — Replaced all "Love-Boat.AI" references with "OverYonder.ai" (agent name, empty state heading, operations category)
- `src/app/components/agentui/TopBar.tsx` — Changed logo from `/lb.png` to `/overyonder-logo.png`, updated alt text, removed `mixBlendMode: 'screen'` and dark background
- `public/overyonder-logo.png` — Added new orange/gold arrow-shield logo

**Clipboard fix (refined prompt not pasting to Replit):**
- `handleApproveReplit` — Clipboard write now happens **immediately** on Approve click (before the async backend call), using `currentDraft.draftPrompt` from local state
- `setDraftState` during refinement — Ref sync (`draftStateRef.current = updated`) now happens synchronously inside the state updater callback, not deferred to `useEffect`
- Removed dependency on `data.prompt_text` from backend echo for clipboard — local state is the source of truth

## #049 — 2026-03-13 — GitHub Org Repo Creation + Structured Commit

**What happened:**
Rewrote `commit_to_github()` in `backend/services/snow_to_github.py` to create repos under a GitHub org and commit a structured directory tree instead of flat files.

**Changes:**
- `backend/services/snow_to_github.py` — New `_build_repo_files()` helper parses the ServiceNow catalog JSON payload and generates structured files:
  - `catalog/catalog.json` — full catalog payload
  - `catalog/items.json` — extracted items list
  - `forms/<item_name>.json` — one file per catalog item with variable definitions
  - `workflows/workflows.json` — workflow/execution plan data per item
  - `models/data_model.json` — extracted field names, types, mandatory flags
  - `README.md` — overview with item list, repo structure, prompt text
- `commit_to_github()` — Rewritten:
  - Creates repo via `POST /orgs/{org}/repos` (org sourced from `ManagedIntegration.base_url`)
  - Commits each file via `PUT /repos/{org}/{repo}/contents/{path}` using a single `httpx.AsyncClient` session
  - Captures `commit.sha` from GitHub Contents API response
  - Returns `{ repo_url, commit_hash, files_pushed }` on success
  - No longer calls `GET /user` — org is explicit from integration config

## #050 — 2026-03-13 — Tenant Filtering Across Platform Modules

**What happened:**
Added cross-tenant filtering with GLOBAL support to 6 platform modules: Integrations, Skills, Use Cases, Actions, Runs, and LLM Usage Ledger. Each module now has a tenant filter dropdown with options for All, Global, and individual tenants.

**Backend — Store layer:**
- `backend/store/interface.py` — Added `list_filtered(tenant_id: Optional[str])` abstract method to 6 store ABCs: `IntegrationStore`, `SkillStore`, `UseCaseStore`, `ActionStore`, `UseCaseRunStore`, `LLMUsageStore`
- `backend/store/memory.py` — Implemented `list_filtered` in all 6 InMemory stores with query logic:
  - `None` or `"all"` → return all items
  - `"GLOBAL"` → return only items where `tenant_id == "GLOBAL"`
  - Specific tenant → return items where `tenant_id` matches OR `tenant_id == "GLOBAL"`

**Backend — Router layer:**
- Added optional `filter_tenant` query parameter to list endpoints in:
  - `backend/routers/integrations.py` — `GET /api/admin/{tenant_id}/integrations/`
  - `backend/routers/skills.py` — `GET /api/admin/{tenant_id}/skills/`
  - `backend/routers/use_cases.py` — `GET /api/admin/{tenant_id}/use-cases/`
  - `backend/routers/actions.py` — `GET /api/admin/{tenant_id}/actions`
  - `backend/routers/uc_runs.py` — `GET /api/admin/{tenant_id}/uc-runs/`
  - `backend/routers/llm_usage.py` — all 3 endpoints (list, summary, ledger)
- When `filter_tenant` is provided, routes call `store.list_filtered()` instead of `store.list_for_tenant()`

**Frontend — New component:**
- `src/app/components/TenantFilter.tsx` — Reusable dropdown component with icons (List/Globe/Building2), displays All Tenants, Global, and tenant names from TenantContext

**Frontend — API layer:**
- `src/app/services/api.ts` — Added optional `filterTenant` parameter to: `getIntegrations`, `getSkills`, `getUseCases`, `getAllUCRuns`, `getLLMUsage`, `getLLMUsageSummary`, `getLLMUsageLedger`

**Frontend — Page updates:**
- `src/app/pages/IntegrationsPage.tsx` — Added TenantFilter dropdown, passes filter to API
- `src/app/pages/SkillsPage.tsx` — Added TenantFilter dropdown, passes filter to API
- `src/app/pages/UseCasesPage.tsx` — Added TenantFilter dropdown, passes filter to API
- `src/app/pages/ActionsCatalogPage.tsx` — Replaced hardcoded `acme` with TenantContext, added TenantFilter
- `src/app/pages/RunsPage.tsx` — Added TenantFilter dropdown, passes filter to API
- `src/app/pages/CostLedgerPage.tsx` — Replaced hardcoded `TENANT_ID = "acme"` with TenantContext, added TenantFilter

---

## #051 — 2026-03-13 — Multiple GitHub Integrations with Unique Names

**What happened:**
Allow creating multiple GitHub integrations per tenant, each with a unique user-chosen name. Previously each integration type was limited to one instance per tenant.

**Backend — Model layer:**
- `backend/models.py` — Added `name: str = ""` field to `Integration` model and `CreateIntegrationRequest`

**Backend — Router layer:**
- `backend/routers/integrations.py`:
  - `MULTI_INSTANCE_TYPES = {"github", "servicenow"}` — types in this set skip the one-per-type uniqueness constraint
  - `create_integration` accepts optional `name`, defaults to catalog name if not provided
  - `_serialize()` backfills `name` from `INTEGRATION_CATALOG` for old records without a name

**Frontend — API layer:**
- `src/app/services/api.ts`:
  - Added `name: string` to `IntegrationResponse` interface
  - Updated `createIntegration()` to accept optional `name` parameter

**Frontend — Integrations list:**
- `src/app/pages/IntegrationsPage.tsx`:
  - Multi-instance types (github, servicenow) remain in "Add" dropdown even when one already exists
  - Clicking a multi-instance type opens a name prompt modal before creating
  - Integration cards display the custom name as the primary title with the type name shown below

**Frontend — Integration config:**
- `src/app/pages/IntegrationConfigPage.tsx`:
  - Header displays the integration's custom name (with catalog name as subtitle when different)

---

## #052 — 2026-03-13 — Editable Integration Names + Multi-Instance ServiceNow

**What happened:**
- Added `servicenow` to `MULTI_INSTANCE_TYPES` in backend and frontend, allowing multiple ServiceNow integrations per tenant with unique names
- Added inline name editing on the integration config page — pencil icon next to the header opens an inline input with save/cancel

**Backend:**
- `backend/routers/integrations.py`:
  - `MULTI_INSTANCE_TYPES` now includes `{"github", "servicenow"}`
  - New `PUT /{integration_id}/name` endpoint accepts `{ "name": "..." }` and updates via store

**Frontend:**
- `src/app/pages/IntegrationsPage.tsx` — `MULTI_INSTANCE_TYPES` includes `"servicenow"`
- `src/app/services/api.ts` — New `renameIntegration(tenantId, integrationId, name)` function
- `src/app/pages/IntegrationConfigPage.tsx` — Pencil icon next to header triggers inline name editing with Enter/Escape keyboard support, save/cancel buttons, and toast feedback

---

## #053 — 2026-03-13 — Delete Integration UI + Revert ServiceNow Multi-Instance

**What happened:**
- Added delete button with two-step confirmation on the integration config page
- Reverted ServiceNow back to single-instance (removed from `MULTI_INSTANCE_TYPES`) — only GitHub allows multiple instances

**Backend:**
- `backend/routers/integrations.py` — `MULTI_INSTANCE_TYPES` reverted to `{"github"}` only

**Frontend:**
- `src/app/pages/IntegrationsPage.tsx` — `MULTI_INSTANCE_TYPES` reverted to `{"github"}` only
- `src/app/pages/IntegrationConfigPage.tsx` — Added Delete button (red) in the actions bar with a two-step confirm flow; on confirm calls `api.deleteIntegration()` and navigates back to the integrations list

---

## #054 — 2026-03-13 — Configurable Webservice Endpoints per Integration

**What happened:**
Each integration can now have a list of named webservice endpoints (URL path + method). Endpoints inherit the parent integration's base URL and auth credentials. The catalog provides suggested default endpoints per integration type. Users can add custom endpoints, edit, delete, and test them individually.

**Backend — Models (`backend/models.py`):**
- New `IntegrationEndpoint` model: `id`, `name`, `path`, `method`, `headers`, `query_params`, `description`
- Added `endpoints: list[IntegrationEndpoint]` field to `Integration` model
- New request models: `AddEndpointRequest`, `UpdateEndpointRequest`
- `INTEGRATION_CATALOG` entries now include `default_endpoints` lists:
  - ServiceNow: Search Incidents, Create Incident, Knowledge Base, Service Catalog
  - Salesforce: Query Records (SOQL), Create Record, Describe SObject
  - GitHub: List Repos, Create Repo, Repo Contents
  - Jira: Search Issues (JQL), Create Issue, Get Issue

**Backend — Router (`backend/routers/integrations.py`):**
- `POST /{integration_id}/endpoints` — add a new endpoint
- `PUT /{integration_id}/endpoints/{endpoint_id}` — update an endpoint
- `DELETE /{integration_id}/endpoints/{endpoint_id}` — remove an endpoint
- `POST /{integration_id}/endpoints/{endpoint_id}/test` — test an endpoint using parent integration's credentials; supports ServiceNow (Basic auth), Jira (email+token), Salesforce (Basic), GitHub (Bearer token) with automatic URL and auth resolution

**Frontend — API (`src/app/services/api.ts`):**
- New `IntegrationEndpoint` and `CatalogDefaultEndpoint` types
- Added `endpoints` to `IntegrationResponse`, `default_endpoints` to `IntegrationCatalogEntry`
- New functions: `addIntegrationEndpoint`, `updateIntegrationEndpoint`, `deleteIntegrationEndpoint`, `testIntegrationEndpoint`

**Frontend — Config Page (`src/app/pages/IntegrationConfigPage.tsx`):**
- New collapsible "Webservice Endpoints" section below the credentials card
- Endpoint list with method badge (color-coded GET/POST/PUT/PATCH/DELETE), name, path, description
- Per-endpoint actions: Test (play button), Edit (pencil), Delete (trash with confirm)
- Inline edit form with name, method dropdown, path, description
- "Suggested endpoints" row shows catalog defaults not yet added — one-click to add
- "Add custom endpoint" form for free-form endpoint creation

**Multi-tenant note:** Integrations are already scoped per `tenant_id`. The uniqueness check `get_by_type(tenant_id, integration_type)` is per-tenant, so Tenant A and Tenant B can each have their own ServiceNow (or any other type) independently.

---

## #055 — 2026-03-13 — Integration Tenant Assignment + Remove Duplicate Filter

**What happened:**
- Removed the "All Tenants" TenantFilter dropdown from the Integrations page — the top-nav tenant switcher is the single source of tenant context
- Added a tenant assignment dropdown on the Integration Config page so integrations can be moved between tenants
- Added backend `PUT /{integration_id}/tenant` endpoint to reassign an integration's tenant

**Backend:**
- `backend/routers/integrations.py` — New `PUT /{integration_id}/tenant` route: validates target tenant exists, updates `tenant_id` via store

**Frontend:**
- `src/app/pages/IntegrationsPage.tsx` — Removed `TenantFilter` import, state, and JSX; list now uses only `currentTenantId` from top-nav
- `src/app/services/api.ts` — New `reassignIntegrationTenant(tenantId, integrationId, newTenantId)` function
- `src/app/pages/IntegrationConfigPage.tsx` — Added tenant dropdown (Building2 icon + select) in the header below the description; selecting a different tenant calls the reassign API and updates the local state

---

## #056 — 2026-03-13 — All Tenants Option in Top-Nav Tenant Switcher

**What happened:**
Added an "All Tenants" option to the top-nav tenant dropdown so users can view data across all tenants from a single control. When selected, pages show cross-tenant data and a "Global View" badge appears.

**TenantContext (`src/app/context/TenantContext.tsx`):**
- New exported constant `ALL_TENANTS = "__all__"`
- New derived values: `isAllTenants` (boolean), `apiTenantId` (first real tenant ID for API URL paths when "All" is selected)
- `refreshTenants` preserves `__all__` selection across refreshes

**TopBar (`src/app/components/TopBar.tsx`):**
- Added "All Tenants" option at the top of the dropdown with a List icon, separated by a border
- Shows "Global View" blue badge when All Tenants is active
- Shows List icon next to "All Tenants" label in the collapsed button

**IntegrationsPage (`src/app/pages/IntegrationsPage.tsx`):**
- Uses `apiTenantId` and `isAllTenants` from context
- When "All Tenants" is selected, passes `filter_tenant=all` to `getIntegrations` so backend returns integrations across all tenants

**IntegrationConfigPage (`src/app/pages/IntegrationConfigPage.tsx`):**
- Uses `effectiveTenantId` derived from `integration.tenant_id || apiTenantId`
- Ensures the config page works correctly when navigated to from the "All Tenants" view

---

## #057 — 2026-03-13 — Refactor ServiceNow Actions to Use Integration Endpoints

**What happened:**
Refactored the ServiceNow-to-Replit and ServiceNow-to-GitHub actions to resolve REST endpoint URLs from the integration's configured webservice endpoints instead of hardcoding URLs. Fixed a critical bug where `snow_to_replit.py` had a hardcoded `dev221705.service-now.com` instance URL.

**New helper (`backend/services/servicenow_tools.py`):**
- `get_endpoint_url(tenant_id, endpoint_name, app, **path_vars)` — looks up a named endpoint from the tenant's ServiceNow integration, substitutes path variables (e.g. `{title}`, `{sys_id}`), and returns the full URL. Returns `None` if not found, allowing callers to fall back.

**Refactored actions:**
- `backend/services/snow_to_replit.py`:
  - `convert_catalog_to_replit()` — now supports `endpoint:Name|key=val` syntax in `service_url` parameter, resolving the URL from integration endpoints
  - `convert_catalog_by_title_to_replit()` — uses `get_endpoint_url("Catalog by Title", title=...)` instead of hardcoded URL. Falls back to config `instance_url` if endpoint not found.
- `backend/services/snow_to_github.py`:
  - `convert_catalog_to_github()` — both "List Catalogs" and "Catalog by Title" lookups now use `get_endpoint_url()` with fallback

**Demo seed (`backend/bootstrap/demo_setup.py`):**
- ACME's ServiceNow integration now seeds 5 webservice endpoints: Catalog by URL, Catalog by Title, List Catalogs, Search Incidents, Knowledge Base
- "ServiceNow to Replit" action parameter changed from hardcoded URL to `endpoint:Catalog by URL|sys_id=2ab7077237153000158bbfc8bcbe5da9`

**Catalog defaults (`backend/models.py`):**
- Added 3 catalog endpoints to ServiceNow's `default_endpoints` in `INTEGRATION_CATALOG`: List Catalogs, Catalog by Title, Catalog by URL — these appear as one-click suggestions on any new ServiceNow integration

## #058 — 2026-03-13 — Webservice Endpoint Tester with Record Extraction

**What happened:**
Added a full webservice endpoint tester UI to the integration config page. Users can validate endpoints, extract sample records, view raw response payloads, and supply path variables without editing the endpoint definition.

**Backend (`backend/routers/integrations.py`):**
- `_build_endpoint_request()` now accepts `path_vars: dict` — substitutes `{key}` placeholders in the URL at call time and strips any remaining unresolved placeholders
- `POST .../test` — now accepts optional `{path_vars, limit}` body; returns `response_body` (truncated to 4KB) alongside status/latency
- `POST .../fetch` — now accepts `path_vars` in body alongside `limit`
- Extracted shared helper handles URL/auth/header resolution across ServiceNow (Basic), Jira (email+token), GitHub (Bearer), Salesforce, Replit

**Frontend (`src/app/services/api.ts`):**
- `testIntegrationEndpoint` — accepts optional `{path_vars, limit}` opts; return type includes `response_body`
- `fetchEndpointRecords` — accepts optional `path_vars` parameter

**Frontend (`src/app/pages/IntegrationConfigPage.tsx`):**
- **Path variable inputs**: Tester panel detects `{var}` patterns in endpoint path and renders labeled inline inputs for each (e.g. `{sys_id}`, `{title}`). Values are sent to both test and fetch calls — no need to edit the endpoint definition.
- **Response payload viewer**: After a test (Play button), a "Response" toggle appears inline with the result. Clicking it expands a dark-themed `<pre>` block showing the prettified JSON (or raw text) response body (up to 4KB).
- **Limit control**: Tester panel has a numeric limit input (1–25) that applies to both Test and Fetch operations.
- **Combined test + fetch**: The tester panel now has both a "Test" button (lightweight check) and a "Fetch Records" button (extracts records into a table), sharing the same path variable inputs and limit.
- Records table shows up to 8 columns with truncated values and hover tooltips, scrollable to 384px height.

## #059 — 2026-03-13 — Auto-Prompt for Path Variables on Test/Fetch

**What happened:**
When a user clicks Test (Play) or Fetch (Search) on an endpoint that has `{var}` placeholders in its path (e.g. `/api/now/table/sc_cat_item/{sys_id}`), an amber inline prompt automatically appears below the endpoint row asking the user to fill in the required values before the call executes. Once filled and submitted, the values persist so subsequent clicks execute immediately without re-prompting.

**Backend (`backend/routers/integrations.py`):**
- `_build_endpoint_request()` path_vars substitution now strips any remaining unresolved `{var}` placeholders from the URL after substitution (safety net)

**Frontend (`src/app/pages/IntegrationConfigPage.tsx`):**
- New state: `promptEpId` / `promptAction` track which endpoint is awaiting path variable input and what action (test or fetch) triggered it
- `requirePathVars(epId, action)` — checks if the endpoint has `{var}` patterns and if any are unfilled; if so, shows the amber prompt and returns `true` (caller aborts); if all filled or no vars needed, returns `false` (proceed)
- Amber prompt UI: compact inline panel with a labeled input for each `{var}`, auto-focus on first field, Enter to submit, Escape to cancel, "Run Test" or "Fetch" button, Cancel button
- Play button on endpoint row: gates through `requirePathVars` — prompts if needed, else fires immediately
- Tester panel's Test/Fetch buttons call `doTest`/`doFetch` directly (no re-prompting since inputs are already visible in the panel)
- Path var values persist across interactions within the same session — fill once, test repeatedly

## #060 — 2026-03-13 — Fix ServiceNow Endpoint URLs + Show Resolved URL on Errors

**What happened:**
Corrected the ServiceNow scripted REST API endpoint URLs across all files (seed data, catalog defaults, service fallbacks) to match the actual ServiceNow instance paths. Added resolved URL display on connection errors for easier debugging.

**Correct URLs (authoritative):**
- **Catalog by Title**: `/api/1939459/catalogbytitleservic/catalog/{catalogTitle}`
- **List Catalogs**: `/api/1939459/catalogtitleservice`
- **Catalog by URL**: `/api/1939459/catalogunderstandingservice/loveboat/{sys_id}` (unchanged)

**Files updated:**
- `backend/bootstrap/demo_setup.py` — seed endpoint paths + path var name `{title}` → `{catalogTitle}`
- `backend/models.py` — `INTEGRATION_CATALOG` default_endpoints for ServiceNow
- `backend/services/snow_to_replit.py` — fallback URL + `get_endpoint_url` kwarg `title=` → `catalogTitle=`
- `backend/services/snow_to_github.py` — both List Catalogs fallback URLs + Catalog by Title fallback + kwarg rename

**Debugging improvement:**
- `resolved_url` is now returned in error responses (including connection exceptions) from both test and fetch endpoints, so the UI always shows what URL was attempted

## #061 — 2026-03-13 — Tools Page in Left Sidebar

**What happened:**
Added a dedicated Tools page to the admin portal, accessible from the left sidebar between Integrations and Tools. Shows all tools from the catalog grouped by integration type, with availability status based on enabled integrations.

**New file — `src/app/pages/ToolsPage.tsx`:**
- Groups tools by integration type (ServiceNow, Google Drive, Jira, GitHub, Slack, Salesforce, Replit)
- Each group shows: integration name, tool count badge, connection status (Connected / N/M available / Not connected)
- Collapsible groups with chevron toggle
- Each tool row shows: name, tool_id (monospace), description, input/output schema tags, Available/Unavailable badge
- Unavailable tools (no enabled integration) shown at 50% opacity
- "All Tools" / "Available Only" toggle in header
- Tenant filter dropdown (All Tenants / specific tenant)
- Fetches both `/tools/catalog` (all tools) and `/tools/available` (tools with enabled integrations) in parallel

**Updated files:**
- `src/app/components/Layout.tsx` — added Wrench icon + "Tools" nav item between Integrations and Skills
- `src/app/routes.tsx` — added `/tools` route pointing to ToolsPage

**Sidebar order now follows the dependency chain:** Tenants → Integrations → Tools → Skills → Use Cases → Actions

## #062 — 2026-03-13 — Platform Modules PDF with Embedded Screenshots

**What happened:**
Generated a technical PDF (`OverYonder-Platform-Modules.pdf`) documenting the six core modules — Tenants, Integrations, Tools, Skills, Use Cases, Actions — with 7 embedded screenshots from the running application.

**New files:**
- `generate_modules_pdf.py` — ReportLab-based PDF generator covering architecture overview, all 6 modules (data models, API endpoints, features), cross-module relationships, end-to-end execution flow, and data model summary
- `capture_screenshots.mjs` — Playwright script capturing 7 admin portal pages at 2x DPI (1440×900): tenants, integrations, integration-config, tools, skills, use-cases, actions
- `screenshots/` — 7 PNG screenshots (01-tenants through 07-actions)
- `OverYonder-Platform-Modules.pdf` — 1.6MB, ~14 pages with screenshots inline in each module section

**Screenshot placement:**
- Section 2 (Tenants): tenants list view
- Section 3 (Integrations): integrations list + integration config detail (2 screenshots)
- Section 4 (Tools): tools catalog grouped by integration type
- Section 5 (Skills): skills catalog with tool assignments
- Section 6 (Use Cases): workflows with trigger keywords
- Section 7 (Actions): actions catalog with recommendation rules

## #063 — 2026-03-13 — "All Tenants" Global View + Cross-Page Tenant Filtering

**What happened:**
Added an "All Tenants" selection mode to the platform, letting users view data aggregated across all tenants rather than scoped to a single one. A reusable `TenantFilter` dropdown was added and wired into every list page.

**Frontend — TenantContext + TopBar:**
- `src/app/context/TenantContext.tsx` — Added `ALL_TENANTS` sentinel (`"__all__"`), `isAllTenants` boolean, and `apiTenantId` (falls back to first tenant for URL paths when "All" is selected). Selection persists across refreshes.
- `src/app/components/TopBar.tsx` — Global tenant dropdown now shows "All Tenants" option at top with a "Global View" badge when selected.

**New component — `src/app/components/TenantFilter.tsx`:**
- Reusable dropdown filter with three modes: "All Tenants", "Global", or specific tenant. Used on every list page.

**Pages wired up with TenantFilter:**
- `ActionsCatalogPage.tsx` — passes `filter_tenant` query param
- `RunsPage.tsx` — `getAllUCRuns` passes `filterTenant`
- `SkillsPage.tsx` — `getSkills` passes `filterTenant`
- `UseCasesPage.tsx` — `getUseCases` passes `filterTenant`
- `CostLedgerPage.tsx` — replaced hardcoded `"acme"` with `currentTenantId`; `getLLMUsageLedger` and `getLLMUsageSummary` pass `filterTenant`
- `IntegrationsPage.tsx` — uses `apiTenantId` and `isAllTenants`; passes `filter_tenant=all` in global view

**Frontend — api.ts:**
- `getIntegrations`, `getSkills`, `getUseCases`, `getAllUCRuns`, `getLLMUsage`, `getLLMUsageSummary`, `getLLMUsageLedger` all accept optional `filterTenant` parameter appended as query string

**Backend — Store layer (`store/interface.py` + `store/memory.py`):**
- Added `list_filtered(tenant_id)` abstract method to `IntegrationStore`, `SkillStore`, `UseCaseStore`, `UseCaseRunStore`, `LLMUsageStore`, and `ActionStore`
- Logic: `None`/`"all"` returns everything, `"GLOBAL"` returns only global items, otherwise returns items for that tenant + GLOBAL
- All six in-memory store implementations include the new `list_filtered` method

**Backend — Routers:**
- `actions.py`, `skills.py`, `use_cases.py`, `uc_runs.py`, `llm_usage.py` — all list endpoints accept optional `filter_tenant` query param and call `list_filtered`
- `llm_usage.py` — `usage_summary` and `cost_ledger` endpoints also accept `filter_tenant`

## #064 — 2026-03-13 — Managed Integrations v2 (Web Service + GitHub)

**What happened:**
Added a new "managed integrations" subsystem alongside the existing integration CRUD, supporting `web_service` and `github` types with their own auth config, connectivity test, and lifecycle.

**Backend — Model (`backend/models.py`):**
- `ManagedIntegration` — id, name, type, tenant_id, base_url, endpoint, headers, auth_type, token, test_endpoint, enabled, timestamps
- `CreateManagedIntegrationRequest` — creation payload

**Backend — Store:**
- `store/interface.py` — `ManagedIntegrationStore` ABC (create, get, list_for_tenant, update, delete)
- `store/memory.py` — `InMemoryManagedIntegrationStore` implementation
- `store/__init__.py` — exports the new store

**Backend — Router (`backend/routers/managed_integrations.py`, new):**
- Full CRUD at `/api/admin/{tenant_id}/managed-integrations`
- `POST /{integration_id}/test` — connectivity test endpoint

**Backend — Service (`backend/services/integration_executor.py`, new):**
- `test_managed_integration()` — tests GitHub (validates PAT via `/user`) and web_service (hits base_url + test/primary endpoint with auth headers)

**Wiring:**
- `main.py` — instantiates `InMemoryManagedIntegrationStore`, registers router
- `routers/__init__.py` — exports `managed_integrations_router`

## #065 — 2026-03-13 — ServiceNow-to-GitHub Export Pipeline + PromptEditor

**What happened:**
Added a multi-phase action that fetches a ServiceNow catalog and commits structured files to a GitHub org repository. Includes a new inline PromptEditor component for reviewing/editing the commit prompt before pushing.

**Backend — Service (`backend/services/snow_to_github.py`, new, 390 lines):**
- Two-phase flow:
  - Phase 1: `convert_catalog_to_github()` lists catalogs (returns `needs_input` with numbered list)
  - Phase 2: fetches selected catalog, cleans it, returns `draft` status with generated prompt, catalog payload, and `target: "github"`
- `commit_to_github()` — looks up tenant's GitHub managed integration (token + org), creates repo via GitHub API, builds structured file tree (`catalog/`, `forms/`, `workflows/`, `models/`, `README.md`), commits each file via Contents API

**Backend — Action registration:**
- `action_executor.py` — registered `"servicenow:catalog_to_github"` handler pointing to `snow_to_github.convert_catalog_to_github`

**Backend — Agent endpoints (`routers/agent.py`):**
- `POST /approve-github` — acknowledges export approval
- `POST /commit-github` — calls `commit_to_github()` to push files to org repo

**Frontend — New component (`src/app/components/agentui/PromptEditor.tsx`):**
- Rich inline editor with editable prompt textarea, collapsible read-only JSON payload viewer, and "Commit to GitHub" button with cancel
- Styled in dark agent UI theme

**Frontend — AgentUIPage integration:**
- When draft returns with `target: "github"`, renders `PromptEditor` instead of standard draft + InputPanel
- `handleCommitToGithub()` POSTs to `/commit-github`
- `handleApprove` routes to either `/approve-github` or `/approve-replit` based on `target`
- Draft state carries `approveLabel`, `draftLabel`, and `target`

**Frontend — AgentActions + InputPanel:**
- `AgentActions.tsx` — `DraftReadyPayload` now includes `approve_label`, `draft_label`, `target`
- `InputPanel.tsx` — approve button label is dynamic via `approveLabel` prop (defaults to "Approve & Send to Replit")

## #066 — 2026-03-13 — Integration Endpoints Data Model + CRUD

**What happened:**
Expanded the Integration model to support named API endpoints with per-endpoint config, CRUD operations, and a default endpoint catalog per integration type.

**Backend — Model (`backend/models.py`):**
- `IntegrationEndpoint` — id, name, path, method, headers, query_params, description
- `Integration` model now has `endpoints: list[IntegrationEndpoint]` and `name: str`
- `AddEndpointRequest` and `UpdateEndpointRequest` for endpoint CRUD
- `CreateIntegrationRequest` now accepts optional `name`
- `INTEGRATION_CATALOG` expanded with `default_endpoints`: ServiceNow (6 endpoints including catalog APIs), Salesforce (3), GitHub (3), Jira (3)

**Backend — ServiceNow tools (`backend/services/servicenow_tools.py`):**
- `get_endpoint_url()` helper — looks up a named endpoint from a tenant's ServiceNow integration, substitutes path variables, returns full URL. Used by `snow_to_github.py` to resolve "List Catalogs" and "Catalog by Title" dynamically.

**Frontend — api.ts:**
- New interfaces: `IntegrationEndpoint`, `CatalogDefaultEndpoint`
- `IntegrationResponse` now includes `name` and `endpoints`
- `IntegrationCatalogEntry` now includes `default_endpoints`
- `createIntegration()` accepts optional `name`
- New functions: `addIntegrationEndpoint`, `updateIntegrationEndpoint`, `deleteIntegrationEndpoint`, `testIntegrationEndpoint`, `fetchEndpointRecords`, `reassignIntegrationTenant`, `renameIntegration`

## #067 — 2026-03-13 — Multi-Instance Integration Support (GitHub)

**What happened:**
Enabled GitHub to have multiple integration instances per tenant (e.g. "Production", "Staging"), while other integration types remain one-per-tenant.

**Frontend — IntegrationsPage.tsx:**
- `MULTI_INSTANCE_TYPES` designates GitHub as multi-instance — multiple integrations per tenant allowed
- When adding a multi-instance type, a modal prompts for a custom name
- Integration list card displays custom `name` if set, with catalog type name as subtitle
- GitHub integrations no longer filtered out of the "Add" dropdown once one exists

---

## #068 — 2026-03-24 — Doc Genome: Extract Application Genomes from Documentation

**What happened:**
Added "Doc Genome" as a new capability under App Genomes, alongside Video Genome. Users upload product documentation (PDF, DOCX, TXT, MD), a 3-agent AI pipeline extracts the application genome, and the user can review, refine, and commit to GitHub.

**Backend:**
- `DocGenomeExtraction` model in `models.py`
- `DocGenomeExtractionStore` interface + `InMemoryDocGenomeExtractionStore` in store layer
- `backend/routers/doc_genome.py`: 6 endpoints (upload, extract via SSE, list, get, delete, commit)
- `backend/services/doc_agents/`: 3-agent pipeline — document_parser (PDF/DOCX/TXT/MD), structure_extraction (LLM), synthesis_validation

**Frontend:**
- `DocGenomePage.tsx`: List view at `/genomes/doc`
- `DocGenomeCapturePage.tsx`: 4-step wizard (Select → Extract → Refine → Commit)
- `DocGenomeDetailPage.tsx`: Detail view with file browser, sections tab, GitHub commit
- Routes and sidebar nav entry added

**Key design decisions:**
- Uses tenant's default LLM via `_get_llm_config` + `call_llm` (same as Video Genome)
- Indigo color scheme differentiates from Video Genome's orange
- Document parser supports PDF (pdfplumber/PyPDF2), DOCX (python-docx), and plain text/markdown
- Reuses `oy_genome_github_service.commit_genome()` for GitHub integration

---

## #069 — 2026-03-24 — SN Genome: Extract Genomes from ServiceNow Update Set XMLs

**What happened:**
Added "SN Genome" module for extracting structured application genomes from ServiceNow update set XML files. Supports multi-file upload, uses a specialized ServiceNow architect LLM prompt to extract entities, catalog items, workflows, business rules, UI modules, data model tables, and integrations into a canonical YAML genome format.

**Backend:**
- `SNGenomeExtraction` model with multi-file support (doc_ids list, doc_filenames list)
- `SNGenomeExtractionStore` + in-memory implementation
- `backend/routers/sn_genome.py`: multi-file upload, SSE extract, CRUD, GitHub commit
- `backend/services/sn_agents/`: 2-agent pipeline (xml_parser, genome_extraction with SN-specific prompt)

**Frontend:**
- `SNGenomePage.tsx`: List view with SN-specific genome element counts
- `SNGenomeCapturePage.tsx`: 4-step wizard with multi-file XML upload
- `SNGenomeDetailPage.tsx`: Detail with 6 summary cards and file browser
- Emerald color scheme, routes at `/genomes/sn/*`, sidebar nav entry
