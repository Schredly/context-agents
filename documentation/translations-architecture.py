"""Generate Translations Architecture PDF for GPT context."""

from fpdf import FPDF

class PDF(FPDF):
    def header(self):
        self.set_font("Helvetica", "B", 10)
        self.set_text_color(120, 120, 120)
        self.cell(0, 8, "OverYonder.ai - Translations Architecture", align="R")
        self.ln(12)

    def footer(self):
        self.set_y(-15)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(150, 150, 150)
        self.cell(0, 10, f"Page {self.page_no()}/{{nb}}", align="C")

    def section_title(self, title):
        self.set_font("Helvetica", "B", 14)
        self.set_text_color(30, 30, 30)
        self.ln(4)
        self.cell(0, 10, title)
        self.ln(10)

    def sub_title(self, title):
        self.set_font("Helvetica", "B", 11)
        self.set_text_color(60, 60, 60)
        self.ln(2)
        self.cell(0, 8, title)
        self.ln(8)

    def body_text(self, text):
        self.set_font("Helvetica", "", 9.5)
        self.set_text_color(40, 40, 40)
        self.multi_cell(0, 5.5, text)
        self.ln(2)

    def code_block(self, text):
        self.set_font("Courier", "", 8)
        self.set_fill_color(245, 245, 245)
        self.set_text_color(50, 50, 50)
        x = self.get_x()
        self.set_x(x + 4)
        for line in text.split("\n"):
            self.cell(0, 4.5, "  " + line, fill=True)
            self.ln(4.5)
        self.ln(3)

    def bullet(self, text):
        self.set_font("Helvetica", "", 9.5)
        self.set_text_color(40, 40, 40)
        self.set_x(self.l_margin)
        self.multi_cell(0, 5.5, "  - " + text)

    def table_row(self, cols, widths, bold=False):
        style = "B" if bold else ""
        self.set_font("Helvetica", style, 8.5)
        self.set_text_color(40, 40, 40)
        h = 6
        for i, col in enumerate(cols):
            self.cell(widths[i], h, col, border=1)
        self.ln(h)


pdf = PDF()
pdf.alias_nb_pages()
pdf.set_auto_page_break(auto=True, margin=20)

# ── Title page ──
pdf.add_page()
pdf.ln(40)
pdf.set_font("Helvetica", "B", 28)
pdf.set_text_color(30, 30, 30)
pdf.cell(0, 15, "Translations Feature", align="C")
pdf.ln(15)
pdf.set_font("Helvetica", "", 14)
pdf.set_text_color(100, 100, 100)
pdf.cell(0, 10, "Architecture & Technical Specification", align="C")
pdf.ln(20)
pdf.set_font("Helvetica", "", 11)
pdf.cell(0, 8, "OverYonder.ai  |  Application Genome Intelligence Platform", align="C")
pdf.ln(8)
pdf.cell(0, 8, "March 2026", align="C")

# ── 1. Overview ──
pdf.add_page()
pdf.section_title("1. Overview")
pdf.body_text(
    "Translations are reusable transformation recipes that convert application genomes from one "
    "vendor/platform format to another. Instead of manually transforming each genome iteratively, "
    "users generate a recipe once from a successful transformation, then apply that recipe to "
    "similar genomes with a single LLM call, significantly reducing computational resources."
)
pdf.body_text(
    "Core Concept: A Translation encodes the pattern 'convert any {vendor}/{type} genome to "
    "{target_platform} output'. Translations are pattern-based, not instance-based -- they work "
    "on ANY genome matching the vendor/type, not just the one they were created from."
)

# ── 2. Data Model ──
pdf.section_title("2. Data Model")
pdf.sub_title("2.1 Translation Model (backend/models.py)")
pdf.code_block(
    "class Translation(BaseModel):\n"
    "    id: str                        # 'trans_' + uuid hex[:12]\n"
    "    tenant_id: str\n"
    "    name: str                      # e.g. 'ServiceNow Catalog -> Replit App'\n"
    "    description: str = ''\n"
    "    source_vendor: str = ''        # ServiceNow, Salesforce, Jira, etc.\n"
    "    source_type: str = ''          # service_catalog, application, etc.\n"
    "    target_platform: str = ''      # replit, github, salesforce, etc.\n"
    "    instructions: str = ''         # The LLM prompt recipe\n"
    "    output_structure: dict = {}    # Expected: {folders: [], files: []}\n"
    "    status: 'active' | 'draft'    # Default: 'draft'\n"
    "    created_at: datetime\n"
    "    updated_at: datetime"
)
pdf.body_text(
    "Translations do NOT reference specific genome IDs. They are pattern-based and encode a "
    "generic transformation that works on any genome matching the vendor/type combination."
)

pdf.sub_title("2.2 Request Models")
pdf.code_block(
    "class CreateTranslationRequest(BaseModel):\n"
    "    name: str\n"
    "    description: str = ''\n"
    "    source_vendor: str = ''\n"
    "    source_type: str = ''\n"
    "    target_platform: str = ''\n"
    "    instructions: str = ''\n"
    "    output_structure: dict = {}\n"
    "    status: 'active' | 'draft' = 'draft'\n"
    "\n"
    "class UpdateTranslationRequest(BaseModel):\n"
    "    # All fields Optional -- only non-None fields are merged"
)

# ── 3. API Endpoints ──
pdf.add_page()
pdf.section_title("3. API Endpoints")

pdf.sub_title("3.1 Admin CRUD API (backend/routers/translations.py)")
w = [20, 75, 75]
pdf.table_row(["Method", "Path", "Purpose"], w, bold=True)
pdf.table_row(["GET", "/api/admin/{tenant_id}/translations", "List all translations for tenant"], w)
pdf.table_row(["GET", "/api/admin/{tenant_id}/translations/by-vendor/{v}", "List by vendor (case-insensitive)"], w)
pdf.table_row(["GET", "/api/admin/{tenant_id}/translations/{id}", "Get single translation"], w)
pdf.table_row(["POST", "/api/admin/{tenant_id}/translations", "Create new translation"], w)
pdf.table_row(["PUT", "/api/admin/{tenant_id}/translations/{id}", "Update translation fields"], w)
pdf.table_row(["DELETE", "/api/admin/{tenant_id}/translations/{id}", "Delete translation (204)"], w)
pdf.ln(6)

pdf.sub_title("3.2 Genome Studio API (backend/routers/genome_studio.py)")
w2 = [20, 75, 75]
pdf.table_row(["Method", "Path", "Purpose"], w2, bold=True)
pdf.table_row(["POST", "/api/genome/run-translation", "Apply recipe to current genome"], w2)
pdf.table_row(["POST", "/api/genome/generate-translation-recipe", "Auto-generate recipe from transformation"], w2)
pdf.table_row(["POST", "/api/genome/save-translation", "Save recipe from Studio"], w2)
pdf.ln(6)

pdf.sub_title("3.3 Run Translation Detail")
pdf.body_text("POST /api/genome/run-translation")
pdf.code_block(
    "Request:\n"
    "  { translation_id: str, content: str, path: str }\n"
    "\n"
    "Backend workflow:\n"
    "  1. Load Translation record from store\n"
    "  2. Load full repo context (file tree + YAML files from GitHub)\n"
    "  3. Build LLM prompt: repo context + current file + instructions\n"
    "  4. LLM returns filesystem_plan JSON\n"
    "\n"
    "Response:\n"
    "  { status, reasoning, explanation, filesystem_plan, diff, preview }"
)

pdf.sub_title("3.4 Generate Translation Recipe Detail")
pdf.body_text("POST /api/genome/generate-translation-recipe")
pdf.code_block(
    "Request:\n"
    "  { original_content, output_files: [{path, content}],\n"
    "    chat_context, source_vendor, target_platform }\n"
    "\n"
    "Backend workflow:\n"
    "  1. Build context: vendor, target, chat history, genome, outputs\n"
    "  2. LLM reverse-engineers a reusable recipe\n"
    "\n"
    "Response:\n"
    "  { status, instructions, output_structure, suggested_description }"
)

# ── 4. Store Layer ──
pdf.add_page()
pdf.section_title("4. Store Layer")
pdf.sub_title("4.1 Interface (backend/store/interface.py)")
pdf.code_block(
    "class TranslationStore(ABC):\n"
    "    async def create(translation) -> Translation\n"
    "    async def get(translation_id) -> Optional[Translation]\n"
    "    async def list_for_tenant(tenant_id) -> list[Translation]\n"
    "    async def list_by_vendor(tenant_id, vendor) -> list[Translation]\n"
    "    async def update(translation_id, **kwargs) -> Optional[Translation]\n"
    "    async def delete(translation_id) -> bool"
)
pdf.sub_title("4.2 Memory Implementation (backend/store/memory.py)")
pdf.body_text(
    "InMemoryTranslationStore: dict-based storage. Filters by tenant_id, sorts by created_at "
    "descending. list_by_vendor does case-insensitive matching on source_vendor."
)

# ── 5. Frontend Architecture ──
pdf.section_title("5. Frontend Architecture")

pdf.sub_title("5.1 TranslationsPage (/genomes/translations)")
pdf.body_text(
    "Lists all translations as a filterable table with columns: name, vendor, target platform, "
    "status. Actions: Edit (navigate to editor), Delete (with confirmation). Create button "
    "navigates to /genomes/translations/create."
)

pdf.sub_title("5.2 TranslationEditorPage (/genomes/translations/{id})")
pdf.body_text(
    "Form fields: name (required), description, source_vendor (dropdown), source_type (text), "
    "target_platform (dropdown), instructions (large textarea, 10 rows), output_structure "
    "(JSON textarea), status (dropdown: active/draft)."
)
pdf.body_text(
    "Vendor options: ServiceNow, Salesforce, Jira, Zendesk, Workday, GitHub. "
    "Target options: Replit, GitHub, Salesforce, ServiceNow, Azure DevOps, Freshdesk, Custom."
)

pdf.sub_title("5.3 Genome Studio Integration")
pdf.body_text(
    "GenomeWorkspace.tsx has a 'Translations' tab showing available recipes for the current "
    "genome's vendor. Users can search, select, and run translations. "
    "SaveTranslationModal.tsx opens when saving a transformation as a reusable recipe."
)

pdf.sub_title("5.4 Store (useGenomeStore.ts)")
pdf.code_block(
    "fetchTranslations(vendor?) -> GET /api/admin/acme/translations[/by-vendor/{v}]\n"
    "runTranslation(id)         -> POST /api/genome/run-translation\n"
    "generateTranslationRecipe  -> POST /api/genome/generate-translation-recipe\n"
    "saveAsTranslation(recipe)  -> POST /api/genome/save-translation"
)

# ── 6. Data Flows ──
pdf.add_page()
pdf.section_title("6. Data Flows")

pdf.sub_title("6.1 Creating a Translation (from Studio)")
pdf.code_block(
    "User transforms genome interactively in Studio\n"
    "  -> User clicks 'Save as Translation'\n"
    "  -> SaveTranslationModal opens\n"
    "  -> (Optional) 'Generate Instructions'\n"
    "     -> POST /api/genome/generate-translation-recipe\n"
    "     -> LLM analyzes: original genome + output files + chat history\n"
    "     -> Returns: auto-generated instructions + output_structure\n"
    "  -> User edits/confirms, clicks Save\n"
    "  -> POST /api/genome/save-translation\n"
    "  -> Translation stored with status: 'active'"
)

pdf.sub_title("6.2 Applying a Translation (Run Recipe)")
pdf.code_block(
    "User loads genome in Studio -> opens Translations tab\n"
    "  -> GET /api/admin/acme/translations/by-vendor/{vendor}\n"
    "  -> User selects translation -> clicks 'Run Translation'\n"
    "  -> POST /api/genome/run-translation\n"
    "     Body: { translation_id, content (current file), path }\n"
    "  -> Backend:\n"
    "     1. Load Translation record\n"
    "     2. Load full repo context (file tree + YAML files)\n"
    "     3. Build LLM prompt: repo + file + translation instructions\n"
    "     4. LLM returns filesystem_plan (new files)\n"
    "  -> Frontend merges files into 'Transformed' tab\n"
    "  -> User commits to GitHub branch"
)

pdf.sub_title("6.3 Editing a Translation (Admin Page)")
pdf.code_block(
    "Navigate to /genomes/translations/{id}\n"
    "  -> GET loads translation -> form populated\n"
    "  -> User edits fields -> clicks Save\n"
    "  -> PUT /api/admin/acme/translations/{id}"
)

# ── 7. Integration with Genomes ──
pdf.section_title("7. Integration with Genomes")
pdf.body_text(
    "Vendor-matched: When loading translations in Studio, they are filtered by the current "
    "genome's vendor (extracted from file path: genomes/vendors/{vendor}/...)."
)
pdf.body_text(
    "Non-destructive: Original genomes are never modified. All transformation outputs go to "
    "a transformations/ subfolder within the genome directory."
)
pdf.sub_title("7.1 Output Structure Convention")
pdf.code_block(
    "genomes/vendors/ServiceNow/catalog1/\n"
    "    catalog1.yaml              # Original genome (untouched)\n"
    "    transformations/           # Created by translation\n"
    "        replit-app/\n"
    "            master_prompt.md\n"
    "            catalog_summary.json\n"
    "            .replit"
)

# ── 8. Seed Data ──
pdf.add_page()
pdf.section_title("8. Seed Data (demo_setup.py)")
pdf.body_text("Two example translations are seeded on startup:")
pdf.ln(2)

pdf.sub_title("Translation 1: ServiceNow Catalog -> Replit App")
pdf.code_block(
    "id: trans_snow_replit\n"
    "source_vendor: ServiceNow\n"
    "source_type: service_catalog\n"
    "target_platform: replit\n"
    "output: master_prompt.md, catalog_summary.json, .replit\n"
    "status: active"
)

pdf.sub_title("Translation 2: ServiceNow Catalog -> GitHub Repository")
pdf.code_block(
    "id: trans_snow_github\n"
    "source_vendor: ServiceNow\n"
    "source_type: service_catalog\n"
    "target_platform: github\n"
    "output: README.md, schema.json, migration_plan.md\n"
    "status: active"
)

# ── 9. Design Principles ──
pdf.section_title("9. Design Principles")
pdf.bullet("Pattern-based, not instance-based: recipes work on any genome of same vendor/type")
pdf.bullet("LLM-driven: both recipe generation and application use LLM calls")
pdf.bullet("Non-destructive: originals untouched, outputs in transformations/ subfolder")
pdf.bullet("Context-rich: full repo context provided to LLM when running recipes")
pdf.bullet("Tenant-scoped: all translations belong to a tenant")
pdf.bullet("Status-aware: 'draft' vs 'active' lifecycle")
pdf.bullet("Git-integrated: all transformation outputs create new Git branches")

# ── 10. File Locations ──
pdf.ln(6)
pdf.section_title("10. File Locations Reference")
w3 = [90, 80]
pdf.table_row(["File", "Purpose"], w3, bold=True)
pdf.table_row(["backend/models.py", "Translation, Create/Update request models"], w3)
pdf.table_row(["backend/routers/translations.py", "CRUD endpoints"], w3)
pdf.table_row(["backend/routers/genome_studio.py", "run/generate/save translation"], w3)
pdf.table_row(["backend/store/interface.py", "TranslationStore ABC"], w3)
pdf.table_row(["backend/store/memory.py", "InMemoryTranslationStore"], w3)
pdf.table_row(["backend/bootstrap/demo_setup.py", "Seed 2 example translations"], w3)
pdf.table_row(["src/app/pages/TranslationsPage.tsx", "List page"], w3)
pdf.table_row(["src/app/pages/TranslationEditorPage.tsx", "Create/edit page"], w3)
pdf.table_row(["src/app/pages/genome-studio/SaveTranslationModal.tsx", "Save recipe modal"], w3)
pdf.table_row(["src/app/pages/genome-studio/GenomeWorkspace.tsx", "Studio translations tab"], w3)
pdf.table_row(["src/app/store/useGenomeStore.ts", "Frontend store methods"], w3)

# ── Output ──
output_path = "/Users/groovingtothemusic/context-agents/context-agents/documentation/translations-architecture.pdf"
pdf.output(output_path)
print(f"PDF generated: {output_path}")
