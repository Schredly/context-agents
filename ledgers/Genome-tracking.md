# Genome Tracking Ledger

This file tracks all changes related to the Application Genomes feature. Each entry includes a sprint number, date, and detailed summary suitable for syncing context with GPT.

---

## Sprint #1 — 2026-03-10 — Application Genomes Feature: Initial Build

**What happened:**
- Added a new "App Genomes" section to the sidebar navigation in `Layout.tsx` with 3 sub-items: Genomes, Capture, Insights.
- Created 4 new pages and 1 shared data file for the feature.
- Registered 4 new routes in `routes.tsx` (static paths ordered before dynamic `:id`).
- Removed the Agent Console module (`/console` route and `AgentConsolePage` import).

**Files created:**
| File | Purpose |
|------|---------|
| `src/app/data/mockGenomes.ts` | Shared mock dataset with `Genome` and `GenomeDocument` TypeScript interfaces. 6 sample genomes across 5 vendors (ServiceNow ×2, Salesforce, Jira, Workday, Zendesk). |
| `src/app/pages/GenomesPage.tsx` | Table listing at `/genomes` — 10 columns, clickable rows navigate to detail page, "+ Capture Genome" button. |
| `src/app/pages/GenomeDetailPage.tsx` | Detail view at `/genomes/:id` — 5 sections: Header, Application Overview, Cost Profile, Structural Genome (objects/workflows/fields/relationships), Raw Genome Artifact (collapsible JSON). |
| `src/app/pages/GenomeCapturePage.tsx` | 5-step wizard at `/genomes/capture` — Source Platform → Application Type → Configure → Preview → Confirm. Matches CreateTenantPage stepper pattern. |
| `src/app/pages/GenomeInsightsPage.tsx` | Analytics dashboard at `/genomes/insights` — 4 metric cards, SVG donut chart (vendor distribution), CSS bar charts (workflow complexity, migration savings), cost comparison table with totals row. |

**Files modified:**
| File | Change |
|------|--------|
| `src/app/components/Layout.tsx` | Added `Dna` icon import, "App Genomes" expandable nav section with 3 sub-items, expanded by default. |
| `src/app/routes.tsx` | Added 4 genome routes. Removed AgentConsolePage import and `/console` route. |

**Data model (`mockGenomes.ts`):**
```typescript
interface GenomeDocument {
  objects: string[];
  workflows: string[];
  fields: string[];
  relationships: string[];   // format: "from → to"
}

interface Genome {
  id: string;
  application_name: string;
  vendor: string;
  source_platform: string;
  target_platform: string;
  object_count: number;
  workflow_count: number;
  legacy_cost: number;
  migrated_cost: number;
  operational_cost: number;
  captured_date: string;
  category: string;
  genome_document: GenomeDocument;
}
```

**Design decisions:**
- All genome pages import from the single shared `mockGenomes` data file — no duplicated mock data.
- Pure CSS visualizations (SVG donut, horizontal bar charts) — no external chart library.
- GenomeCapturePage wizard matches CreateTenantPage stepper exactly (numbered circles, green checkmarks, connecting lines).
- GenomeInsightsPage follows CostLedgerPage dashboard pattern (`max-w-[1800px]`, `bg-gray-50 min-h-screen`).
- Snake_case field naming throughout (`application_name`, `legacy_cost`, etc.).

---

## Sprint #2 — 2026-03-11 — UI Consistency Review & Navigation Restructure

**What happened:**
- Full UI review of all 4 genome pages against existing app patterns (TenantsPage, CostLedgerPage, CreateTenantPage).
- Fixed styling inconsistencies in GenomesPage and GenomeDetailPage.
- Restructured sidebar navigation order.

**GenomesPage.tsx — aligned with TenantsPage table pattern:**
| Element | Before | After |
|---------|--------|-------|
| Page wrapper | Two nested `<div>` elements | Single `<div className="p-8 max-w-7xl mx-auto">` |
| Header | `flex items-start` | `flex items-center` |
| H1 | `text-2xl font-semibold text-gray-900` | `text-2xl` (inherits from theme) |
| Subtitle | `text-gray-600` | `text-muted-foreground` |
| Primary button | `bg-[#030213] rounded-lg` | `bg-primary text-primary-foreground rounded-md hover:bg-primary/90` |
| Table wrapper | `border-gray-200 shadow-sm` | `border-border overflow-hidden` (no shadow) |
| Thead | Styles on `<tr>` | Styles on `<thead>`, uses `border-border` |
| Th text | `font-medium text-gray-500` | `text-muted-foreground` (no font-medium) |
| Tbody divider | `divide-gray-200` | `divide-border` |
| Row hover | `hover:bg-gray-50` | `hover:bg-gray-50/50` |
| Empty state | `text-gray-500` | `text-muted-foreground` |

**GenomeDetailPage.tsx — fixes:**
| Element | Before | After |
|---------|--------|-------|
| Page wrapper | Two nested `<div>` elements | Single `<div className="p-8 max-w-7xl mx-auto">` |
| "Rebuild" button | `bg-blue-600 hover:bg-blue-700` | `bg-gray-900 hover:bg-gray-800` (matches app CTA pattern) |

**GenomeCapturePage.tsx** — No changes needed. Already matches CreateTenantPage stepper pattern.

**GenomeInsightsPage.tsx** — No changes needed. Already matches CostLedgerPage dashboard pattern.

**routes.tsx** — Fixed indentation on the `settings` route entry (line 132).

**Layout.tsx — sidebar navigation restructure:**
- Swapped "Actions" and "Use Cases" so Actions appears directly below Use Cases.
- Moved "Runs" from a top-level nav item into the Observability section as the first sub-item (above "LLM Usage").

**Final sidebar order:**
```
Tenants
Integrations
Skills
Use Cases
Actions
App Genomes
  ├── Genomes
  ├── Capture
  └── Insights
Observability
  ├── Runs
  ├── LLM Usage
  └── Cost Ledger
Settings
```

**Verification:** TypeScript compiles clean (`npx tsc --noEmit` — no errors).

---

## Sprint #3 — 2026-03-11 — Genome Backend Persistence & API

**What happened:**
- Built the full backend persistence layer for Application Genomes following the existing Repository Pattern (ABC interface → InMemory implementation → FastAPI router → store on `app.state`).
- Created API endpoints for genome CRUD.
- Migrated all 6 mock genomes into backend seed data.
- Connected GenomesPage and GenomeDetailPage to the API, replacing static `mockGenomes` imports with `useEffect` + fetch calls.
- Added loading states (spinner) to both pages.

**Files created:**
| File | Purpose |
|------|---------|
| `backend/routers/genomes.py` | FastAPI router with 4 endpoints: `GET /api/admin/{tenant_id}/genomes`, `GET .../genomes/{genome_id}`, `POST .../genomes`, `DELETE .../genomes/{genome_id}`. Follows the same `_require_tenant` guard pattern as `actions.py`. |

**Backend models added (`backend/models.py`):**
```python
class GenomeDocument(BaseModel):
    objects: list[str]
    workflows: list[str]
    fields: list[str]
    relationships: list[str]

class ApplicationGenome(BaseModel):
    id: str                    # "genome_" + uuid hex[:12]
    tenant_id: str
    vendor: str
    application_name: str
    source_platform: str
    target_platform: str
    category: str
    object_count: int
    workflow_count: int
    legacy_cost: float
    migrated_cost: float
    operational_cost: float
    captured_date: str         # ISO date string
    genome_document: GenomeDocument
    source_signature: str
    created_at: datetime
    updated_at: datetime

class CreateGenomeRequest(BaseModel):
    # Same fields as ApplicationGenome minus id, tenant_id, created_at, updated_at
```

**Store layer added:**
| File | Change |
|------|--------|
| `backend/store/interface.py` | Added `GenomeStore` ABC with `create`, `get`, `list_for_tenant`, `delete` abstract methods. |
| `backend/store/memory.py` | Added `InMemoryGenomeStore` — dict-based storage keyed by genome ID, tenant filtering via list comprehension. |
| `backend/store/__init__.py` | Exported `GenomeStore` and `InMemoryGenomeStore`. |

**Backend wiring:**
| File | Change |
|------|--------|
| `backend/main.py` | Added `InMemoryGenomeStore` import, `app.state.genome_store = InMemoryGenomeStore()`, `app.include_router(genomes_router)`. |
| `backend/routers/__init__.py` | Added `genomes_router` import and `__all__` entry. |

**Seed data (`backend/bootstrap/demo_setup.py`):**
- Added all 6 genomes from `mockGenomes.ts` as `ApplicationGenome` records under the "acme" tenant.
- Genome IDs use stable strings (`genome_hw_request`, `genome_access_req`, `genome_case_mgmt`, `genome_bug_tracker`, `genome_onboarding`, `genome_helpdesk`) for predictable routing.
- Each genome includes full `GenomeDocument` with objects, workflows, fields, and relationships.

**Frontend API client (`src/app/services/api.ts`):**
- Added `GenomeResponse` and `GenomeDocumentResponse` TypeScript interfaces.
- Added `getGenomes(tenantId)` → `GET /api/admin/{tenantId}/genomes`.
- Added `getGenome(tenantId, genomeId)` → `GET /api/admin/{tenantId}/genomes/{genomeId}`.

**Frontend pages updated:**
| File | Change |
|------|--------|
| `src/app/pages/GenomesPage.tsx` | Removed `mockGenomes` import. Added `useState` + `useEffect` to fetch from `getGenomes("acme")`. Added `Loader2` spinner during loading. |
| `src/app/pages/GenomeDetailPage.tsx` | Removed `mockGenomes` import. Added `useState` + `useEffect` to fetch from `getGenome("acme", id)`. Added loading spinner state. |

**Pages NOT modified (still use mockGenomes.ts):**
- `GenomeInsightsPage.tsx` — out of scope; dashboard computes aggregates from full dataset
- `GenomeCapturePage.tsx` — out of scope; wizard uses mock preview data

**API endpoint details:**
| Method | Path | Response |
|--------|------|----------|
| `GET` | `/api/admin/{tenant_id}/genomes` | `ApplicationGenome[]` — full objects including `genome_document` |
| `GET` | `/api/admin/{tenant_id}/genomes/{genome_id}` | `ApplicationGenome` — single genome with full detail |
| `POST` | `/api/admin/{tenant_id}/genomes` | `ApplicationGenome` — newly created genome (201) |
| `DELETE` | `/api/admin/{tenant_id}/genomes/{genome_id}` | 204 No Content |

**Verification:**
- TypeScript compiles clean (`npx tsc --noEmit` — no errors).
- Python imports verified (`models`, `store.interface`, `store.memory`, `routers.genomes`, `bootstrap.demo_setup` — all OK).
- API smoke tested via `httpx` AsyncClient: `GET /genomes` returns 6 records, `GET /genomes/{id}` returns full genome_document with correct keys and counts.

---

## Sprint #4 — 2026-03-11 — Extraction Payloads: Raw Platform Data Storage

**What happened:**
- Added a new `extraction_payloads` persistence layer to store raw platform data before genome generation.
- Full backend implementation: model → store interface → in-memory store → API router → wired into app.
- No genome-building logic — this sprint only stores raw payloads with a status field.

**Files created:**
| File | Purpose |
|------|---------|
| `backend/routers/extractions.py` | FastAPI router with 3 endpoints: list, get, and create extraction payloads. POST returns `{ extraction_id }` with `status = "pending"`. |

**Backend model added (`backend/models.py`):**
```python
class ExtractionPayload(BaseModel):
    id: str                    # "ext_" + uuid hex[:12]
    tenant_id: str
    vendor: str
    source_platform: str
    application_name: str
    payload: dict              # raw JSON from platform extraction
    status: str = "pending"    # pending | processing | completed | failed
    created_at: datetime
    updated_at: datetime

class CreateExtractionRequest(BaseModel):
    vendor: str
    source_platform: str
    application_name: str
    payload: dict
```

**Store layer added:**
| File | Change |
|------|--------|
| `backend/store/interface.py` | Added `ExtractionPayloadStore` ABC with `create`, `get`, `list_for_tenant`. |
| `backend/store/memory.py` | Added `InMemoryExtractionPayloadStore` — dict-based storage, list sorted by `created_at` descending. |
| `backend/store/__init__.py` | Exported `ExtractionPayloadStore` and `InMemoryExtractionPayloadStore`. |

**Backend wiring:**
| File | Change |
|------|--------|
| `backend/main.py` | Added `InMemoryExtractionPayloadStore` import, `app.state.extraction_store`, `app.include_router(extractions_router)`. |
| `backend/routers/__init__.py` | Added `extractions_router` import and `__all__` entry. |

**API endpoint details:**
| Method | Path | Response |
|--------|------|----------|
| `GET` | `/api/admin/{tenant_id}/extractions` | `ExtractionPayload[]` — all extractions for tenant, newest first |
| `GET` | `/api/admin/{tenant_id}/extractions/{extraction_id}` | `ExtractionPayload` — single record with full payload |
| `POST` | `/api/admin/{tenant_id}/extractions` | `{ extraction_id: string }` — newly created with `status = "pending"` (201) |

**Status lifecycle (for future sprints):**
```
pending → processing → completed | failed
```
Only `pending` is set in this sprint. Status transitions will be added when genome-building logic is implemented.

**No frontend changes.** No seed data — extractions are created via API at runtime.

**Verification:**
- All Python imports verified clean.
- API smoke tested via `httpx` AsyncClient: POST creates extraction with `status=pending`, GET list returns 1 record, GET by ID returns full payload JSON.

---

## Sprint #5 — 2026-03-11 — Genome Builder Service (Deterministic Parsing)

**What happened:**
- Created the genome builder service that converts raw extraction payloads into structured `GenomeDocument` objects.
- Implements vendor-specific parsers for ServiceNow, Salesforce, Jira, Zendesk, and Workday.
- Includes a generic fallback parser for unknown vendors.
- Pure deterministic parsing — no AI/LLM calls.

**Files created:**
| File | Purpose |
|------|---------|
| `backend/services/genome_builder.py` | `build_genome_from_extraction(payload, vendor)` — converts raw dict into `{ genome_document, object_count, workflow_count }`. |

**Public API:**
```python
from services.genome_builder import build_genome_from_extraction

result = build_genome_from_extraction(payload_dict, vendor_string)
# Returns:
# {
#     "genome_document": GenomeDocument(objects, workflows, fields, relationships),
#     "object_count": int,
#     "workflow_count": int,
# }
```

**Vendor parsers:**
| Vendor | Object keys | Workflow keys | Field keys | Relationship keys |
|--------|-------------|---------------|------------|-------------------|
| ServiceNow | `tables`, `result[].name` | `workflows`, `flows`, `business_rules`, `flow_definitions` | `fields` (dict or list), `result[].columns` | `references`, `relationships`, `reference_fields` |
| Salesforce | `sobjects`, `objects`, `custom_objects`, `metadata.objects` | `flows`, `process_builders`, `workflows`, `apex_triggers`, `automations` | `fields` (dict or list) | `lookups`, `master_details`, `relationships` |
| Jira | `projects`, `issue_types`, `boards`, `sprints`, `components` | `workflows`, `automations`, `rules` | `fields` (list) | `links`, `relationships` |
| Zendesk | `ticket_forms`, `groups`, `organizations`, `brands`, `objects` | `triggers`, `automations`, `macros`, `workflows` | `ticket_fields`, `user_fields`, `fields` | `relationships` |
| Workday | `business_objects`, `report_definitions`, `domains`, `objects` | `business_processes`, `integrations`, `workflows`, `tasks` | `fields` (list) | `relationships` |
| Generic | All object-like keys | All workflow-like keys | All field-like keys | All relationship-like keys |

**Design decisions:**
- Each parser handles both string items (`"incident"`) and dict items (`{"name": "incident"}`) for flexibility.
- Relationships accept `"A → B"`, `"A -> B"` (auto-normalized), or dict with `source/target`, `from/to`, or vendor-specific keys.
- `_dedupe()` helper preserves insertion order while removing duplicates.
- Vendor dispatch via `_VENDOR_PARSERS` dict — case-insensitive lookup with generic fallback.
- No coupling to the extraction store or API routes — pure function, can be called from anywhere.

**No API or frontend changes.** This service will be wired into the extraction → genome pipeline in a future sprint.

**Verification:**
- Smoke tested all 5 vendor parsers + generic fallback with realistic payloads.
- ServiceNow: 5 objects, 3 workflows, 8 fields, 3 relationships.
- Salesforce: 4 objects, 2 workflows, 2 relationships.
- Jira: 5 objects, 2 workflows, 2 relationships.
- Generic: correctly parses unknown vendors using heuristic key scanning.

---

## Sprint #6 — 2026-03-11 — Genome Worker (Async Background Processing)

**What happened:**
- Created an async background worker that processes pending extraction payloads and generates genomes.
- Added `update` and `list_by_status` methods to `ExtractionPayloadStore`.
- Added `error_message` and `genome_id` fields to `ExtractionPayload` model.
- Worker runs every 30 seconds via `asyncio.create_task` in the app lifespan.

**Files created:**
| File | Purpose |
|------|---------|
| `backend/workers/__init__.py` | Package init. |
| `backend/workers/genome_worker.py` | Background worker: `genome_worker_loop(app)` polls every 30s, `_poll_once(app)` processes all pending extractions, `start_genome_worker(app)` launches background task. |

**Worker flow:**
```
1. list_by_status("pending")
2. For each extraction:
   a. Set status = "processing"
   b. build_genome_from_extraction(payload, vendor)
   c. Create ApplicationGenome record in genome store
   d. Set status = "completed", genome_id = new genome ID
   On error: status = "failed", error_message = traceback
```

**Model changes (`backend/models.py`):**
- `ExtractionPayload`: added `error_message: str = ""` and `genome_id: str = ""`

**Store changes:**
| File | Change |
|------|--------|
| `backend/store/interface.py` | Added `list_by_status(status)` and `update(extraction_id, **kwargs)` abstract methods to `ExtractionPayloadStore`. |
| `backend/store/memory.py` | Implemented both — `list_by_status` returns sorted by `created_at` ascending; `update` merges kwargs and bumps `updated_at`. |

**App wiring (`backend/main.py`):**
- Imported `start_genome_worker`.
- Lifespan starts worker on startup, cancels on shutdown.

**Generated genome fields:**
- `target_platform`: empty (set later during migration planning)
- `category`: empty (set later)
- `captured_date`: today's date (ISO)
- `source_signature`: extraction ID (links genome back to source extraction)
- `legacy_cost`, `migrated_cost`, `operational_cost`: 0 (set later during cost analysis)

**Verification:**
- End-to-end test: POST extraction → `_poll_once()` → extraction status = "completed" → genome created with correct objects/workflows/relationships.
- Genome count incremented from 6 → 7 after processing.
- Error handler tested — status transitions and error_message field wired correctly.
- All Python imports clean.

---

## Sprint #7 — 2026-03-11 — ServiceNow Catalog Adapter

**What happened:**
- Created a ServiceNow catalog adapter that normalizes raw catalog extraction output into the standard `{tables, fields, workflows, relationships}` format consumed by `genome_builder`.
- Added a helper function `create_servicenow_extraction()` that normalizes + creates an extraction record in one call.
- Added `error_message` and `genome_id` fields to `ExtractionPayload` model, and `update`/`list_by_status` methods to the store (done in Sprint #6, listed here for completeness).
- Verified full pipeline: raw catalog JSON → adapter → extraction store → genome worker → genome created.

**Files created:**
| File | Purpose |
|------|---------|
| `backend/adapters/__init__.py` | Package init. |
| `backend/adapters/servicenow_catalog_adapter.py` | `normalize_servicenow_catalog(payload)` + `create_servicenow_extraction(tenant_id, catalog_name, payload, app)`. |

**Adapter: `normalize_servicenow_catalog(payload)`**

Handles these ServiceNow catalog API shapes:
1. `{result: {catalog_title, items: [{item: {name, variables, categories}}]}}`
2. `{result: [{name, label, columns}]}`
3. `{items: [...]}`
4. Flat list of item dicts
5. Single item dict

Mapping logic:
| Output field | Source |
|-------------|--------|
| `tables` | Each catalog item name + each category name |
| `fields` | Variable names from all items (normalized to `snake_case`) |
| `workflows` | `"{item_name} request"` for each item, plus `"{item_name} approval"` if approval indicators detected |
| `relationships` | `"category → item"` links, `"item → variables"` links |

Approval detection scans variable names and item description for keywords: `approval`, `authorize`, `manager`, `sign-off`.

**Helper: `create_servicenow_extraction(tenant_id, catalog_name, payload, app)`**
- Calls `normalize_servicenow_catalog(payload)` internally
- Creates `ExtractionPayload` with `vendor="ServiceNow"`, `status="pending"`
- Returns `extraction_id`
- Genome worker picks it up on next poll cycle

**Worker compatibility confirmed.** The adapter outputs `tables`, `fields`, `workflows`, `relationships` — the exact keys that `genome_builder._parse_servicenow()` reads.

**No frontend changes.** No modifications to existing files.

**Verification:**
- Adapter tested with 3 shapes: wrapped catalog (3 items → 8 tables, 6 fields, 5 workflows, 8 relationships), table list (2 tables), empty payload (0 results).
- End-to-end pipeline tested: raw catalog → `create_servicenow_extraction()` → genome worker poll → genome created with 6 objects, 3 workflows, 6 fields, 6 relationships. Genome count 6→7.

---

## Sprint #8 — 2026-03-11 — Genome Artifact Storage

**What happened:**
- Added a separate `GenomeArtifact` model and store to persist genome documents independently from the `ApplicationGenome` record.
- This enables future versioning — each genome can have multiple artifact versions.
- Updated the genome worker, API router, and seed data to create artifacts alongside genomes.
- GET detail endpoint now returns the latest artifact alongside genome metadata.
- Full backward compatibility maintained: `genome_document` still lives on `ApplicationGenome`.

**Backend model added (`backend/models.py`):**
```python
class GenomeArtifact(BaseModel):
    id: str                          # "gart_" + uuid hex[:12]
    genome_id: str
    version: int = 1
    artifact_json: dict = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
```

**Store layer added:**
| File | Change |
|------|--------|
| `backend/store/interface.py` | Added `GenomeArtifactStore` ABC with `create`, `get_by_genome`, `get_latest_by_genome` abstract methods. |
| `backend/store/memory.py` | Added `InMemoryGenomeArtifactStore` — dict-based storage; `get_latest_by_genome()` returns the highest-version artifact for a genome. |
| `backend/store/__init__.py` | Exported `GenomeArtifactStore` and `InMemoryGenomeArtifactStore`. |

**Backend wiring (`backend/main.py`):**
- Added `InMemoryGenomeArtifactStore` import.
- Added `app.state.genome_artifact_store = InMemoryGenomeArtifactStore()`.

**Genome worker updated (`backend/workers/genome_worker.py`):**
- After creating `ApplicationGenome`, now also creates a `GenomeArtifact` with `version=1` and `artifact_json=genome_doc.model_dump()`.
- Both records created in the same try block — atomic success/failure.

**API router updated (`backend/routers/genomes.py`):**
- `GET /{genome_id}`: Now returns `{ ...genome_fields, artifact: { id, genome_id, version, artifact_json, created_at } | null }`.
- `POST`: Now creates both `ApplicationGenome` and `GenomeArtifact` (version 1).
- `GET` list: Unchanged — returns genome metadata only (no artifact lookup for performance).

**Seed data updated (`backend/bootstrap/demo_setup.py`):**
- All 6 existing genomes now have corresponding `GenomeArtifact` records seeded on startup.
- Artifact IDs derived from genome IDs: `gart_{genome_id_suffix}` (e.g., `gart_hw_request` for `genome_hw_request`).

**No frontend changes.** The frontend already receives genome data from GET endpoints; the new `artifact` field is available for future UI use.

**Verification:**
- End-to-end smoke test: seed artifacts verified present, GET detail includes `artifact` field with correct `artifact_json` keys, POST creates both genome and artifact, genome worker creates artifact alongside genome.
- TypeScript compilation passed (`npx tsc --noEmit` — no errors).

---

## Sprint #9 — 2026-03-11 — GenomeDetailPage: Artifact Viewer UI

**What happened:**
- Added a new "Genome Artifact" collapsible section to GenomeDetailPage, positioned between Structural Genome and Raw Genome Artifact.
- Section renders only when `genome.artifact` is present (returned from GET detail endpoint).
- Default state is collapsed.
- Added `GenomeArtifactResponse` TypeScript interface to the API client and wired it into `GenomeResponse`.

**Frontend changes:**

| File | Change |
|------|--------|
| `src/app/services/api.ts` | Added `GenomeArtifactResponse` interface (`id`, `genome_id`, `version`, `artifact_json`, `created_at`). Added `artifact?: GenomeArtifactResponse \| null` to `GenomeResponse`. |
| `src/app/pages/GenomeDetailPage.tsx` | Added `Copy`, `FileJson`, `Check` icon imports. Added `showArtifact` and `artifactCopied` state. Added Genome Artifact collapsible section. |

**Genome Artifact section features:**
- **Header**: `FileJson` icon, "Genome Artifact" title, version badge (`v1`), chevron toggle.
- **Toolbar**: Copy button (copies `artifact_json` to clipboard with 2-second checkmark feedback) and Download JSON button.
- **Download**: Generates a Blob URL, triggers browser download as `{app-name}-artifact-v{version}.json`.
- **JSON viewer**: Dark background (`bg-gray-900`), green monospace text (`text-emerald-400`), max height 600px with scroll overflow, `whitespace-pre-wrap` for long lines.

**Data source:** Artifact data loaded from `GET /api/admin/{tenant_id}/genomes/{id}` — no additional API call needed; the `artifact` field is already returned by the detail endpoint (Sprint #8).

**Verification:**
- TypeScript compiles clean (`npx tsc --noEmit` — no errors).

---

## Sprint #10 — 2026-03-11 — Genome Worker Performance Improvements

**What happened:**
- Rewrote the genome worker with 4 performance improvements: batch processing, parallel execution, payload hash deduplication, and configurable poll interval.

**1. Batch Processing:**
- `_poll_once` fetches all pending extractions at once and processes them in batches of `BATCH_CONCURRENCY` (default 5, configurable via `GENOME_WORKER_BATCH_CONCURRENCY` env var).
- Replaces the previous sequential `for extraction in pending` loop.

**2. Parallel Execution:**
- Each batch runs concurrently via `asyncio.gather(*batch, return_exceptions=True)`.
- `return_exceptions=True` ensures one failed extraction doesn't block the rest of the batch.

**3. Payload Hash Deduplication:**
- New `_compute_payload_hash(payload)` function produces a deterministic SHA-256 from `json.dumps(payload, sort_keys=True, separators=(",", ":"))`.
- Before processing, the worker calls `find_by_payload_hash`. If an identical payload was already `completed` or `processing`, the extraction is marked `completed` with the existing `genome_id` and `error_message="deduplicated: identical payload already processed"`.
- No genome or artifact records are created for duplicates.

**4. Configurable Worker Interval:**
- `GENOME_WORKER_INTERVAL_SECONDS` reads from env var (default `30`).
- `GENOME_WORKER_BATCH_CONCURRENCY` reads from env var (default `5`).
- Both parsed at module load via `int(os.environ.get(...))`.

**Model changes (`backend/models.py`):**
- `ExtractionPayload`: added `payload_hash: str = ""` — stores the SHA-256 hex digest of the canonical payload JSON.

**Store changes:**
| File | Change |
|------|--------|
| `backend/store/interface.py` | Added `find_by_payload_hash(payload_hash) -> Optional[ExtractionPayload]` abstract method to `ExtractionPayloadStore`. |
| `backend/store/memory.py` | Implemented `find_by_payload_hash` — returns first extraction with matching hash in `completed` or `processing` status. |

**Worker file (`backend/workers/genome_worker.py`):**
- Full rewrite. Added `hashlib`, `json`, `os` imports. Removed hardcoded `POLL_INTERVAL_SECONDS = 30`, replaced with env-var-backed `GENOME_WORKER_INTERVAL_SECONDS`. Added `BATCH_CONCURRENCY`. Added `_compute_payload_hash`. Updated `_process_one` with dedup check. Updated `_poll_once` with batch + gather.

**Verification:**
- End-to-end smoke test: two identical payloads → first creates genome, second deduplicated with shared `genome_id`. Different payload → unique genome created.
- Hash determinism verified: `{'b':2,'a':1}` and `{'a':1,'b':2}` produce same SHA-256.
- All Python imports clean.

---

## Sprint #7 — 2026-03-19 — Translations Module: Reusable Genome Conversion Recipes

**What happened:**
- Added a full Translations module that makes genome-to-platform conversion recipes reusable, shareable, and manageable through the admin portal.
- A Translation record stores: name, description, source_vendor, source_type, target_platform, LLM instructions (the recipe), output_structure, and status (active/draft).
- Backend: new `Translation` model + request models, `TranslationStore` ABC, `InMemoryTranslationStore`, CRUD router at `/api/admin/{tenant_id}/translations`, plus `list_by_vendor` endpoint.
- Genome Studio: added `/api/genome/run-translation` (applies a saved recipe via LLM) and `/api/genome/save-translation` (captures Studio work as a reusable Translation).
- Frontend: `TranslationsPage` (admin list with table), `TranslationEditorPage` (create/edit form), both registered under `/genomes/translations`.
- Genome Studio workspace: new "Translations" tab shows vendor-matching recipes with "Run" buttons; "Save as Translation" button appears after successful transforms.
- Seeded 2 demo translations: "ServiceNow Catalog → Replit App" and "ServiceNow Catalog → GitHub Repository".
- Navigation: added "Translations" sub-item under App Genomes in sidebar.

**Files created:**
| File | Purpose |
|------|---------|
| `backend/routers/translations.py` | CRUD router (list, get, create, update, delete, list_by_vendor) |
| `src/app/pages/TranslationsPage.tsx` | Admin list page with table |
| `src/app/pages/TranslationEditorPage.tsx` | Create/edit form with vendor/platform dropdowns, instructions textarea, output structure JSON editor |

**Files modified:**
| File | Change |
|------|--------|
| `backend/models.py` | Added `Translation`, `CreateTranslationRequest`, `UpdateTranslationRequest` |
| `backend/store/interface.py` | Added `TranslationStore` ABC with 6 methods including `list_by_vendor` |
| `backend/store/memory.py` | Added `InMemoryTranslationStore` implementation |
| `backend/store/__init__.py` | Exported new store classes |
| `backend/routers/__init__.py` | Exported `translations_router` |
| `backend/main.py` | Initialized `translation_store`, included `translations_router` |
| `backend/routers/genome_studio.py` | Added `POST /run-translation` and `POST /save-translation` endpoints |
| `backend/bootstrap/demo_setup.py` | Added 2 seed translations with full instruction recipes |
| `src/app/routes.tsx` | Added 3 translation routes (list, create, edit) before `genomes/:id` |
| `src/app/components/Layout.tsx` | Added "Translations" to App Genomes sub-items |
| `src/app/store/useGenomeStore.ts` | Added `TranslationRecord` type, `translations`/`translationsLoading` state, `fetchTranslations`, `runTranslation`, `saveAsTranslation` actions |
| `src/app/pages/genome-studio/GenomeWorkspace.tsx` | Added "Translations" tab with recipe cards and run buttons; "Save as Translation" button in header and tab |
| `src/app/pages/GenomeStudioPage.tsx` | Wired translation props to workspace, auto-fetches translations on file select |

**Verification:**
- TypeScript compiles cleanly (`npx tsc --noEmit` — no errors).
- Python imports verified (`from routers.translations import router` etc.).

---

## Sprint #7b — 2026-03-19 — Translations: Full Repo Context, LLM Recipe Generation, Modal UX

**What happened:**
- Fixed `/run-translation` to read the full GitHub repo tree + multiple YAML files for context (matching `/transform` behavior), not just the single selected file's content. The LLM now sees the full repository structure when applying a translation recipe.
- Added `POST /api/genome/generate-translation-recipe` — takes the current Studio context (original content, output files, chat history) and uses the LLM to reverse-engineer reusable instructions and output_structure for a new translation.
- Replaced the `prompt()` dialogs for "Save as Translation" with a full modal (`SaveTranslationModal`) that lets the user: fill in metadata (name, description, vendor, source type, target platform), click "Generate Instructions" to have the LLM auto-create instructions from the current transformation context, and then edit the generated instructions before saving.
- `fetchTranslations()` now accepts optional vendor (no vendor = fetch all). Translations are loaded when the repo connects (all translations), then refined by vendor when a specific file is selected.
- The Translations tab now works before a file is selected (shows all available translations), and shows a "Save as Translation" button even when no translations exist yet.

**Files created:**
| File | Purpose |
|------|---------|
| `src/app/pages/genome-studio/SaveTranslationModal.tsx` | Modal with metadata fields, AI-powered instruction generation, and editable instructions/output_structure |

**Files modified:**
| File | Change |
|------|--------|
| `backend/routers/genome_studio.py` | `/run-translation` now reads full repo tree + YAML files; added `POST /generate-translation-recipe` with `_RECIPE_SYSTEM` prompt; tracked as `genome-generate-recipe` in cost ledger |
| `src/app/store/useGenomeStore.ts` | `fetchTranslations` accepts optional vendor; added `generateTranslationRecipe`; `saveAsTranslation` refreshes translations list after save |
| `src/app/pages/GenomeStudioPage.tsx` | Fetches all translations on repo connect; vendor-specific refine on file select; opens `SaveTranslationModal` instead of `prompt()` |
| `src/app/pages/genome-studio/GenomeWorkspace.tsx` | Updated empty-state copy; "Save as Translation" available even with no existing translations |

**Verification:**
- TypeScript compiles cleanly.
- Python imports clean from backend directory.

---

## Sprint #7c — 2026-03-19 — Translations: Selective Load + Run Fix

**What happened:**
- Translations no longer auto-load on repo connect or file select. The Translations tab now starts empty with a "Load Translations" button that the user clicks to fetch available translations on demand.
- Once loaded, translations appear in a left-panel browser with search/filter. User selects a translation to see its full details (instructions preview, vendor/target badges) in a right detail panel.
- Run button is now enabled whenever a repo is connected (no longer requires a specific file to be selected). The backend already reads the full repo tree, so a selected file is optional for more targeted results.
- Run now posts a user message to chat ("Run translation: [name]") so the action is visible, and the assistant reply shows the result or error. This gives clear feedback that the run is happening.
- Error handling fixed: `loadingState` now resets to `"idle"` (not `"error"`) after failures, preventing the UI from getting stuck. Error messages always appear in chat.
- The "Create New Translation" button is at the bottom of the translations browser panel (always accessible).

**Files modified:**
| File | Change |
|------|--------|
| `src/app/pages/genome-studio/GenomeWorkspace.tsx` | Full rewrite of Translations tab: two-panel browse-and-select UX with search, "Load Translations" button, detail panel with Run. New props: `onFetchTranslations`, `repoConnected`. `onRunTranslation` now returns Promise. |
| `src/app/pages/GenomeStudioPage.tsx` | Removed auto-fetch on repo connect. Added `handleFetchTranslations` and `handleRunTranslation` (adds chat message before running). Passes `repoConnected` and `onFetchTranslations` props. |
| `src/app/store/useGenomeStore.ts` | `runTranslation` error handling: resets to `"idle"` instead of `"error"`, always posts error to chat with details. Clears error state at start of run. |

---

## Sprint #8 — 2026-03-19 — Video Genome: Extract Application Genomes from Video

**What happened:**
- New "Video Genome" module: upload a video of someone clicking through software, LLM analyzes extracted frames via vision API, builds an application genome, and commits it to GitHub.
- Extended `call_llm` to support multimodal (vision) messages via an optional `content_blocks` parameter. When provided, Anthropic receives native image content blocks; OpenAI receives base64 data URI `image_url` blocks. All existing callers are unaffected (parameter defaults to `None`).
- New `video_genome_service.py`: extracts frames from video via ffmpeg (every 3s, max 20 frames), builds Anthropic-compatible vision content blocks with base64-encoded JPEG images, orchestrates the full pipeline.
- Admin page: 3-step wizard (Upload Video → Select GitHub Target → Extract & Commit) with animated execution pipeline showing real-time progress.
- Genome Studio integration: ChatInterface accepts video file uploads (.mp4/.mov/.webm), auto-uploads to `/api/video-genome/upload`, and when the user says "extract the genome" with a video attached, triggers the video genome extraction pipeline. Output appears as a filesystem_plan in the Transformed tab.
- Token usage tracked via `_track_usage("video-genome-extract", ...)` — appears in Cost Ledger / LLM Usage automatically.
- Videos stored locally in `backend/uploaded_videos/` with UUID-prefixed filenames.

**Files created:**
| File | Purpose |
|------|---------|
| `backend/services/video_genome_service.py` | Frame extraction (ffmpeg), vision prompt builder, LLM analysis orchestrator |
| `backend/routers/video_genome.py` | Upload, extract, commit endpoints for standalone admin page |
| `src/app/pages/VideoGenomePage.tsx` | 3-step wizard admin page |

**Files modified:**
| File | Change |
|------|--------|
| `backend/services/claude_client.py` | Added `content_blocks` param to `_call_anthropic`, `_call_openai`, `call_llm` for multimodal vision support |
| `backend/routers/genome_studio.py` | Added `POST /video-extract` endpoint for Studio integration |
| `backend/main.py` | Registered `video_genome_router` |
| `src/app/routes.tsx` | Added `/genomes/video` route |
| `src/app/components/Layout.tsx` | Added "Video Genome" to App Genomes nav |
| `src/app/pages/genome-studio/ChatInterface.tsx` | Accepts video file types, uploads videos to `/api/video-genome/upload` |
| `src/app/store/useGenomeStore.ts` | Added `extractVideoGenome` callback |
| `src/app/pages/GenomeStudioPage.tsx` | Video attachment detection, triggers `extractVideoGenome` when user says "extract genome" |
