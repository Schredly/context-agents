"""Generate a technical PDF documenting the six core platform modules."""

from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.colors import HexColor
from reportlab.lib.units import inch
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, HRFlowable, Image,
)
import os


def build_pdf(path: str = "OverYonder-Platform-Modules.pdf"):
    doc = SimpleDocTemplate(
        path,
        pagesize=letter,
        topMargin=0.75 * inch,
        bottomMargin=0.75 * inch,
        leftMargin=0.75 * inch,
        rightMargin=0.75 * inch,
    )

    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle("Title2", parent=styles["Title"], fontSize=22, spaceAfter=4, textColor=HexColor("#111827")))
    styles.add(ParagraphStyle("Subtitle", parent=styles["Normal"], fontSize=11, textColor=HexColor("#6b7280"), spaceAfter=16))
    styles.add(ParagraphStyle("H1", parent=styles["Heading1"], fontSize=16, spaceBefore=20, spaceAfter=8, textColor=HexColor("#111827")))
    styles.add(ParagraphStyle("H2", parent=styles["Heading2"], fontSize=13, spaceBefore=14, spaceAfter=6, textColor=HexColor("#374151")))
    styles.add(ParagraphStyle("H3", parent=styles["Heading3"], fontSize=11, spaceBefore=10, spaceAfter=4, textColor=HexColor("#4b5563")))
    styles.add(ParagraphStyle("Body", parent=styles["Normal"], fontSize=9.5, leading=13, spaceAfter=6, textColor=HexColor("#374151")))
    styles.add(ParagraphStyle("CodeBlock", parent=styles["Normal"], fontSize=8.5, leading=11, fontName="Courier", textColor=HexColor("#1e40af"), backColor=HexColor("#f0f4ff"), spaceAfter=6, leftIndent=12, rightIndent=12, spaceBefore=4))
    styles.add(ParagraphStyle("BulletItem", parent=styles["Normal"], fontSize=9.5, leading=13, leftIndent=20, bulletIndent=10, spaceAfter=3, textColor=HexColor("#374151")))
    styles.add(ParagraphStyle("SmallNote", parent=styles["Normal"], fontSize=8, textColor=HexColor("#9ca3af"), spaceAfter=4))

    story = []
    S = Spacer
    HR = lambda: HRFlowable(width="100%", thickness=0.5, color=HexColor("#e5e7eb"), spaceAfter=8, spaceBefore=8)
    B = lambda t: Paragraph(f"• {t}", styles["BulletItem"])
    P = lambda t: Paragraph(t, styles["Body"])
    C = lambda t: Paragraph(t, styles["CodeBlock"])

    def make_table(data, col_widths=None):
        t = Table(data, colWidths=col_widths, hAlign="LEFT")
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), HexColor("#f9fafb")),
            ("TEXTCOLOR", (0, 0), (-1, 0), HexColor("#374151")),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8.5),
            ("LEADING", (0, 0), (-1, -1), 11),
            ("GRID", (0, 0), (-1, -1), 0.5, HexColor("#e5e7eb")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        return t

    SCREENSHOT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "screenshots")
    usable_width = doc.width  # ~7 inches

    def screenshot(filename, caption=None):
        """Return flowables for an inline screenshot with optional caption."""
        fpath = os.path.join(SCREENSHOT_DIR, filename)
        if not os.path.exists(fpath):
            return [P(f"<i>[Screenshot not found: {filename}]</i>")]
        img = Image(fpath, width=usable_width, height=usable_width * 0.625, kind="proportional")
        flowables = [
            S(1, 8),
            img,
        ]
        if caption:
            flowables.append(Paragraph(caption, styles["SmallNote"]))
        flowables.append(S(1, 8))
        return flowables

    # ── COVER ──────────────────────────────────────────────────────
    story.append(S(1, 120))
    story.append(Paragraph("OverYonder.ai", styles["Title2"]))
    story.append(Paragraph("Platform Module Architecture", styles["Title2"]))
    story.append(S(1, 12))
    story.append(Paragraph("Technical specification of the six core modules: Tenants, Integrations, Tools, Skills, Use Cases, and Actions — how they are structured, how they connect, and how they drive the agentic execution pipeline.", styles["Subtitle"]))
    story.append(S(1, 24))
    story.append(Paragraph("Prepared for GPT UX collaboration session", styles["SmallNote"]))
    story.append(Paragraph("March 2026", styles["SmallNote"]))
    story.append(PageBreak())

    # ── TABLE OF CONTENTS ──────────────────────────────────────────
    story.append(Paragraph("Table of Contents", styles["H1"]))
    toc = [
        "1. Architecture Overview",
        "2. Module 1: Tenants",
        "3. Module 2: Integrations",
        "4. Module 3: Tools",
        "5. Module 4: Skills",
        "6. Module 5: Use Cases",
        "7. Module 6: Actions",
        "8. Cross-Module Relationships",
        "9. End-to-End Execution Flow",
        "10. Data Model Summary",
    ]
    for item in toc:
        story.append(B(item))
    story.append(PageBreak())

    # ── 1. ARCHITECTURE OVERVIEW ───────────────────────────────────
    story.append(Paragraph("1. Architecture Overview", styles["H1"]))
    story.append(HR())
    story.append(P("The OverYonder.ai platform is built on a modular architecture where six core modules form a dependency chain that drives agentic AI workflows:"))
    story.append(S(1, 6))
    story.append(C("Tenants → Integrations → Tools → Skills → Use Cases → Actions"))
    story.append(S(1, 6))
    story.append(P("Each module builds on the ones before it:"))
    story.append(B("<b>Tenants</b> — Multi-tenant isolation. Every resource is scoped to a tenant."))
    story.append(B("<b>Integrations</b> — Connectivity to external systems (ServiceNow, GitHub, Jira, etc.) with auth credentials and webservice endpoints."))
    story.append(B("<b>Tools</b> — Atomic capabilities backed by integration APIs. Each tool has typed input/output schemas."))
    story.append(B("<b>Skills</b> — Reusable AI capabilities that compose one or more tools with instructions."))
    story.append(B("<b>Use Cases</b> — Workflows that chain skills into multi-step sequences, matched to user intent via keyword triggers."))
    story.append(B("<b>Actions</b> — Post-execution decisions that write back to external systems, recommended based on rules that score against the completed agent run."))
    story.append(S(1, 8))

    story.append(Paragraph("Technology Stack", styles["H2"]))
    story.append(B("<b>Backend</b>: Python, FastAPI, Pydantic models, in-memory store (ABC interface → MemoryStore)"))
    story.append(B("<b>Frontend</b>: React + TypeScript, Tailwind CSS, React Router, Sonner toasts"))
    story.append(B("<b>Pattern</b>: Repository pattern — ABC store interface → InMemory implementation → FastAPI router → app.state"))
    story.append(B("<b>Agent Stream</b>: Server-Sent Events (SSE) for real-time execution streaming"))
    story.append(PageBreak())

    # ── 2. TENANTS ─────────────────────────────────────────────────
    story.append(Paragraph("2. Module 1: Tenants", styles["H1"]))
    story.append(HR())
    story.append(P("Tenants provide multi-tenant isolation. Every other module is scoped to a tenant_id. The platform supports an \"All Tenants\" global view for cross-tenant visibility."))
    story.extend(screenshot("01-tenants.png", "Tenants list view — showing tenant name, ID, status, and created date"))

    story.append(Paragraph("Data Model", styles["H2"]))
    story.append(make_table([
        ["Field", "Type", "Description"],
        ["id", "str", "Unique identifier (e.g. 'acme')"],
        ["name", "str", "Human-readable tenant name"],
        ["status", "str", "'draft' or 'active'"],
        ["shared_secret", "Optional[str]", "Shared secret for API auth"],
        ["created_at", "datetime", "Creation timestamp"],
        ["updated_at", "datetime", "Last update timestamp"],
    ], col_widths=[1.2*inch, 1.3*inch, 4.2*inch]))

    story.append(Paragraph("API Endpoints", styles["H2"]))
    story.append(make_table([
        ["Method", "Path", "Description"],
        ["POST", "/api/tenants", "Create a new tenant"],
        ["GET", "/api/tenants", "List all tenants"],
        ["GET", "/api/tenants/{id}", "Get single tenant"],
        ["DELETE", "/api/tenants/{id}", "Delete tenant"],
    ], col_widths=[0.8*inch, 2.2*inch, 3.7*inch]))

    story.append(Paragraph("Store Interface", styles["H2"]))
    story.append(C("TenantStore: create(name) | get(id) | list() | delete(id) | update(id, **kwargs)"))

    story.append(Paragraph("Frontend", styles["H2"]))
    story.append(B("<b>TenantsPage</b> — Table of all tenants with name, ID, status, created date, delete action"))
    story.append(B("<b>CreateTenantPage</b> — Multi-step wizard (Details → Integrations → Use Cases → Summary)"))
    story.append(B("<b>TenantContext</b> — Global React context; tracks currentTenantId, isAllTenants, apiTenantId; ALL_TENANTS = '__all__'"))
    story.append(B("<b>TopBar</b> — Tenant switcher dropdown with 'All Tenants' global view option"))
    story.append(PageBreak())

    # ── 3. INTEGRATIONS ────────────────────────────────────────────
    story.append(Paragraph("3. Module 2: Integrations", styles["H1"]))
    story.append(HR())
    story.append(P("Integrations are the connectivity layer — connections to external systems with auth credentials and configurable webservice endpoints. Each integration belongs to a tenant and has a type from the catalog."))
    story.extend(screenshot("02-integrations.png", "Integrations list — connectors configured per tenant with type, status, and endpoint count"))
    story.extend(screenshot("03-integration-config.png", "Integration config detail — auth credentials, webservice endpoints, and live tester panel"))

    story.append(Paragraph("Data Model: Integration", styles["H2"]))
    story.append(make_table([
        ["Field", "Type", "Description"],
        ["id", "str", "Unique ID (int_*)"],
        ["tenant_id", "str", "Owning tenant"],
        ["integration_type", "str", "Type key (e.g. 'servicenow', 'github')"],
        ["name", "str", "Custom display name"],
        ["enabled", "bool", "Whether integration is active"],
        ["config", "dict", "Auth credentials (instance_url, token, etc.)"],
        ["endpoints", "list[IntegrationEndpoint]", "Configured webservice endpoints"],
        ["created_at / updated_at", "datetime", "Timestamps"],
    ], col_widths=[1.6*inch, 1.8*inch, 3.3*inch]))

    story.append(Paragraph("Data Model: IntegrationEndpoint", styles["H2"]))
    story.append(make_table([
        ["Field", "Type", "Description"],
        ["id", "str", "Unique ID (ep_*)"],
        ["name", "str", "Endpoint name (e.g. 'Search Incidents')"],
        ["path", "str", "URL path (e.g. '/api/now/table/incident')"],
        ["method", "str", "HTTP method (GET, POST, PUT, etc.)"],
        ["headers", "dict", "Custom headers"],
        ["query_params", "dict", "Default query parameters"],
        ["description", "str", "What this endpoint does"],
    ], col_widths=[1.2*inch, 1.0*inch, 4.5*inch]))

    story.append(Paragraph("Supported Integration Types", styles["H2"]))
    story.append(make_table([
        ["Type", "Name", "Config Fields", "Default Endpoints"],
        ["servicenow", "ServiceNow", "instance_url, username, password", "6 (incidents, KB, catalogs)"],
        ["google-drive", "Google Drive", "client_id, root_folder_id", "0"],
        ["salesforce", "Salesforce", "instance_url, username, password", "3 (SOQL, create, describe)"],
        ["slack", "Slack", "webhook_url", "0"],
        ["github", "GitHub", "token, org, repo", "3 (repos, contents)"],
        ["jira", "Jira", "instance_url, username, api_token", "3 (search, create, get)"],
        ["replit", "Replit", "connect_sid, username", "0"],
    ], col_widths=[1.0*inch, 1.1*inch, 2.3*inch, 2.3*inch]))

    story.append(Paragraph("API Endpoints (16 routes)", styles["H2"]))
    story.append(make_table([
        ["Method", "Path", "Description"],
        ["GET", ".../catalog", "Return INTEGRATION_CATALOG"],
        ["GET", ".../", "List integrations (supports filter_tenant)"],
        ["POST", ".../", "Create integration (prevents duplicates except github)"],
        ["GET", ".../{id}", "Get single integration"],
        ["PUT", ".../{id}/name", "Rename integration"],
        ["PUT", ".../{id}/tenant", "Reassign to different tenant"],
        ["PUT", ".../{id}/config", "Update auth config (syncs to config stores)"],
        ["PUT", ".../{id}/enable | /disable", "Toggle enabled flag"],
        ["POST", ".../{id}/test", "Test connection (type-specific logic)"],
        ["DELETE", ".../{id}", "Delete integration"],
        ["POST", ".../{id}/endpoints", "Add webservice endpoint"],
        ["PUT", ".../{id}/endpoints/{eid}", "Update endpoint"],
        ["DELETE", ".../{id}/endpoints/{eid}", "Delete endpoint"],
        ["POST", ".../{id}/endpoints/{eid}/test", "Test endpoint (with path_vars, limit)"],
        ["POST", ".../{id}/endpoints/{eid}/fetch", "Fetch sample records (auto-parses response)"],
    ], col_widths=[0.7*inch, 2.5*inch, 3.5*inch]))

    story.append(Paragraph("Key Features", styles["H2"]))
    story.append(B("<b>MULTI_INSTANCE_TYPES</b> — GitHub allows multiple integrations per tenant; others enforce one-per-type"))
    story.append(B("<b>Endpoint Tester</b> — Test + Fetch with path variable auto-detection ({var} prompt), limit control, response body viewer"))
    story.append(B("<b>Config Sync</b> — Saving config syncs to legacy ServiceNow/GoogleDrive/Replit config stores for backward compatibility"))
    story.append(PageBreak())

    # ── 4. TOOLS ───────────────────────────────────────────────────
    story.append(Paragraph("4. Module 3: Tools", styles["H1"]))
    story.append(HR())
    story.append(P("Tools are atomic capabilities backed by integration APIs. They are defined in a static catalog (TOOL_CATALOG) and referenced by Skills. Each tool has typed input/output schemas and a handler function that executes the actual API call."))
    story.extend(screenshot("04-tools.png", "Tools catalog — grouped by integration type, showing availability based on enabled connectors"))

    story.append(Paragraph("Tool Catalog (16 tools across 7 integrations)", styles["H2"]))
    story.append(make_table([
        ["tool_id", "Integration", "Name", "Input", "Output"],
        ["servicenow.search_incidents", "ServiceNow", "Search Incidents", "query, limit", "incidents[]"],
        ["servicenow.get_incident_details", "ServiceNow", "Get Incident Details", "sys_id", "incident"],
        ["servicenow.search_kb", "ServiceNow", "Search Knowledge Base", "query, limit", "articles[]"],
        ["servicenow.add_work_note", "ServiceNow", "Add Work Note", "sys_id, note", "ok"],
        ["google-drive.search_documents", "Google Drive", "Search Documents", "query, folder_id", "files[]"],
        ["google-drive.read_file", "Google Drive", "Read File", "file_id", "content"],
        ["google-drive.create_file", "Google Drive", "Create File", "name, content, folder_id", "file_id"],
        ["salesforce.search_accounts", "Salesforce", "Search Accounts", "query", "accounts[]"],
        ["salesforce.get_case_history", "Salesforce", "Get Case History", "account_id", "cases[]"],
        ["slack.send_message", "Slack", "Send Message", "channel, text", "ok, ts"],
        ["slack.search_messages", "Slack", "Search Messages", "query", "messages[]"],
        ["github.search_commits", "GitHub", "Search Commits", "query, repo", "commits[]"],
        ["github.search_issues", "GitHub", "Search Issues", "query, repo", "issues[]"],
        ["jira.search_issues", "Jira", "Search Issues", "jql", "issues[]"],
        ["jira.get_issue", "Jira", "Get Issue", "issue_key", "issue"],
        ["replit.build_application", "Replit", "Build Application", "app_name, desc, stack", "project_id, url"],
    ], col_widths=[1.8*inch, 0.9*inch, 1.2*inch, 1.4*inch, 1.0*inch]))

    story.append(Paragraph("Tool Execution", styles["H2"]))
    story.append(P("The tool_executor.py service dispatches tool calls to integration-specific handlers:"))
    story.append(C("execute_tool(tenant_id, tool_id, input_payload, app) → {status, tool_id, ...response}"))
    story.append(B("<b>_HANDLERS</b> maps tool_id → async handler function (e.g. servicenow_tools.search_incidents)"))
    story.append(B("Handler loads integration config from stores, makes HTTP request, returns structured result"))
    story.append(B("Status values: 'completed', 'not_implemented', 'error'"))

    story.append(Paragraph("API Endpoints", styles["H2"]))
    story.append(make_table([
        ["Method", "Path", "Description"],
        ["GET", "/api/admin/{tenant}/tools/catalog", "All tools grouped by integration type"],
        ["GET", "/api/admin/{tenant}/tools/available", "Only tools for enabled integrations"],
    ], col_widths=[0.7*inch, 3.0*inch, 3.0*inch]))

    story.append(Paragraph("Availability Logic", styles["H2"]))
    story.append(P("A tool is 'available' only if its integration_type has an enabled integration with valid config for the tenant. This is computed at query time by checking IntegrationStore + config stores."))
    story.append(PageBreak())

    # ── 5. SKILLS ──────────────────────────────────────────────────
    story.append(Paragraph("5. Module 4: Skills", styles["H1"]))
    story.append(HR())
    story.append(P("Skills are reusable AI capabilities that compose one or more tools with LLM instructions. They are the building blocks that Use Cases chain together into workflows."))
    story.extend(screenshot("05-skills.png", "Skills catalog — each skill lists its assigned tools and LLM model"))

    story.append(Paragraph("Data Model", styles["H2"]))
    story.append(make_table([
        ["Field", "Type", "Description"],
        ["id", "str", "Unique ID (sk_*)"],
        ["tenant_id", "str", "Owning tenant"],
        ["name", "str", "Skill name (e.g. 'Incident Lookup')"],
        ["description", "str", "What this skill does"],
        ["model", "str", "LLM model to use (e.g. 'claude-sonnet-4-20250514')"],
        ["instructions", "str", "Prompt instructions for the LLM"],
        ["tools", "list[str]", "Array of tool_ids from TOOL_CATALOG"],
        ["created_at / updated_at", "datetime", "Timestamps"],
    ], col_widths=[1.4*inch, 1.2*inch, 4.1*inch]))

    story.append(Paragraph("API Endpoints", styles["H2"]))
    story.append(make_table([
        ["Method", "Path", "Description"],
        ["GET", "/api/admin/{tenant}/skills", "List skills (supports filter_tenant)"],
        ["POST", "/api/admin/{tenant}/skills", "Create skill (validates tool_ids)"],
        ["GET", "/api/admin/{tenant}/skills/{id}", "Get single skill"],
        ["PUT", "/api/admin/{tenant}/skills/{id}", "Update skill (re-validates tools)"],
        ["DELETE", "/api/admin/{tenant}/skills/{id}", "Delete skill"],
    ], col_widths=[0.7*inch, 2.5*inch, 3.5*inch]))

    story.append(Paragraph("Validation", styles["H2"]))
    story.append(P("On create and update, all tool_ids in the tools[] array are validated against TOOL_CATALOG_BY_ID. Unknown tool_ids cause a 400 error listing the invalid IDs."))

    story.append(Paragraph("Seed Skills (ACME tenant)", styles["H2"]))
    story.append(make_table([
        ["Skill Name", "Tools", "Purpose"],
        ["Incident Lookup", "servicenow.search_incidents", "Search ServiceNow incident records"],
        ["Knowledge Base Search", "servicenow.search_kb", "Search ServiceNow KB articles"],
        ["Documentation Search", "google-drive.search_documents", "Search Google Drive for docs"],
        ["Diagnosis Summary", "(none)", "LLM-only: synthesize findings"],
        ["Replit Builder", "replit.build_application", "Build an app on Replit"],
    ], col_widths=[1.6*inch, 2.2*inch, 2.9*inch]))
    story.append(PageBreak())

    # ── 6. USE CASES ───────────────────────────────────────────────
    story.append(Paragraph("6. Module 5: Use Cases", styles["H1"]))
    story.append(HR())
    story.append(P("Use Cases are workflows that chain Skills into multi-step sequences. They are matched to user prompts via keyword triggers and executed by the agent orchestration layer."))
    story.extend(screenshot("06-use-cases.png", "Use Cases — workflows with trigger keywords and ordered skill steps"))

    story.append(Paragraph("Data Model: UseCase", styles["H2"]))
    story.append(make_table([
        ["Field", "Type", "Description"],
        ["id", "str", "Unique ID (uc_*)"],
        ["tenant_id", "str", "Owning tenant"],
        ["name", "str", "Use case name"],
        ["description", "str", "What this workflow does"],
        ["status", "'draft' | 'active'", "Only active use cases are matched by agent"],
        ["triggers", "list[str]", "Keywords for matching (e.g. ['email','smtp','outlook'])"],
        ["steps", "list[UseCaseStep]", "Ordered sequence of skill executions"],
        ["created_at / updated_at", "datetime", "Timestamps"],
    ], col_widths=[1.4*inch, 1.4*inch, 3.9*inch]))

    story.append(Paragraph("Data Model: UseCaseStep", styles["H2"]))
    story.append(make_table([
        ["Field", "Type", "Description"],
        ["step_id", "str", "Unique step ID"],
        ["skill_id", "str", "Reference to Skill.id"],
        ["name", "str", "Step display name"],
        ["input_mapping", "str", "How to map input from prior steps"],
        ["output_mapping", "str", "How to expose output to next steps"],
    ], col_widths=[1.2*inch, 1.0*inch, 4.5*inch]))

    story.append(Paragraph("Use Case Matching (Agent Stream)", styles["H2"]))
    story.append(P("When a user sends a prompt to the agent stream endpoint (/api/admin/{tenant}/agent/stream):"))
    story.append(B("1. Load all <b>active</b> use cases for the tenant"))
    story.append(B("2. Score each use case against the prompt using <b>_score_use_case()</b> — keyword overlap between prompt tokens and use case triggers"))
    story.append(B("3. Select the best-scoring use case (if score >= 0.05)"))
    story.append(B("4. Execute each step sequentially: load skill → execute tools → capture results"))
    story.append(B("5. Stream SSE events to frontend: reasoning, use_case_selected, skill_started, tool_called, tool_result, skill_completed, final_result"))
    story.append(B("6. Persist AgentUIRun with selected_use_case, skills_used, result, confidence"))

    story.append(Paragraph("API Endpoints", styles["H2"]))
    story.append(make_table([
        ["Method", "Path", "Description"],
        ["GET", ".../use-cases", "List use cases (supports filter_tenant)"],
        ["POST", ".../use-cases", "Create (validates step skill_ids exist)"],
        ["GET", ".../use-cases/{id}", "Get single use case"],
        ["PUT", ".../use-cases/{id}", "Update (re-validates steps)"],
        ["DELETE", ".../use-cases/{id}", "Delete use case"],
        ["POST", ".../use-cases/{id}/run", "Execute use case (background task)"],
        ["GET", ".../use-cases/{id}/runs", "List all runs for a use case"],
        ["GET", ".../use-cases/{id}/runs/{rid}", "Get single run detail"],
        ["GET", ".../use-cases/{id}/runs/{rid}/events", "SSE stream of run events"],
    ], col_widths=[0.7*inch, 2.6*inch, 3.4*inch]))

    story.append(Paragraph("Seed Use Cases (ACME)", styles["H2"]))
    story.append(P("<b>Email Incident Diagnosis</b> (active) — triggers: email, attachment, smtp, mail, inbox, outlook, exchange"))
    story.append(B("Step 1: Incident Lookup (servicenow.search_incidents)"))
    story.append(B("Step 2: Knowledge Base Search (servicenow.search_kb)"))
    story.append(B("Step 3: Documentation Search (google-drive.search_documents)"))
    story.append(B("Step 4: Diagnosis Summary (LLM synthesis, no tools)"))
    story.append(S(1, 6))
    story.append(P("<b>Application Builder</b> (active) — triggers: build, app, application, service, system, create, builder, replit"))
    story.append(B("Step 1: Replit Builder (replit.build_application)"))
    story.append(PageBreak())

    # ── 7. ACTIONS ─────────────────────────────────────────────────
    story.append(Paragraph("7. Module 6: Actions", styles["H1"]))
    story.append(HR())
    story.append(P("Actions are post-execution decisions that write back to external systems. After the agent completes a use case run, Actions are scored and recommended based on configurable rules."))
    story.extend(screenshot("07-actions.png", "Actions catalog — post-execution writebacks with integration targets and recommendation rules"))

    story.append(Paragraph("Data Model: Action", styles["H2"]))
    story.append(make_table([
        ["Field", "Type", "Description"],
        ["id", "str", "Unique ID (act_*)"],
        ["tenant_id", "str", "Owning tenant"],
        ["name", "str", "Action name (e.g. 'Create Incident')"],
        ["description", "str", "What this action does"],
        ["integration_id", "str", "Target system (e.g. 'servicenow', 'jira')"],
        ["operation", "str", "Operation type (e.g. 'incident.create')"],
        ["parameters", "list[ActionParameter]", "How to resolve inputs"],
        ["rules", "list[ActionRule]", "When to recommend this action"],
        ["status", "'active' | 'disabled'", "Whether action is available"],
    ], col_widths=[1.2*inch, 1.4*inch, 4.1*inch]))

    story.append(Paragraph("ActionParameter", styles["H2"]))
    story.append(make_table([
        ["Field", "Type", "Values"],
        ["name", "str", "Parameter name (e.g. 'title', 'description')"],
        ["source", "str", "static | user_prompt | agent_result | user_input | agent_metadata"],
        ["value", "Optional[str]", "Static value or default"],
    ], col_widths=[1.0*inch, 1.2*inch, 4.5*inch]))
    story.append(S(1, 4))
    story.append(P("<b>Parameter Resolution:</b> static → use param.value; user_prompt → run.prompt; agent_result → run.result; user_input → ask user via UI; agent_metadata → reserved"))

    story.append(Paragraph("ActionRule", styles["H2"]))
    story.append(make_table([
        ["Field", "Type", "Values"],
        ["type", "str", "use_case | confidence | skill | keyword | tag"],
        ["operator", "str", "equals | not_equals | greater_than | less_than | contains | not_contains"],
        ["value", "str", "Value to match against (e.g. use case name, keyword list, threshold)"],
    ], col_widths=[1.0*inch, 1.0*inch, 4.7*inch]))

    story.append(Paragraph("Recommendation Scoring", styles["H2"]))
    story.append(P("After a completed agent run, the recommendation engine scores each active action:"))
    story.append(make_table([
        ["Rule Type", "Points", "Logic"],
        ["use_case", "+3", "run.selected_use_case matches rule value (case-insensitive)"],
        ["keyword", "+2", "Comma-separated keywords overlap with prompt tokens"],
        ["skill", "+2", "Comma-separated skill names overlap with run.skills_used"],
        ["confidence", "+1", "run.confidence satisfies operator against threshold value"],
    ], col_widths=[1.0*inch, 0.7*inch, 5.0*inch]))
    story.append(S(1, 4))
    story.append(B("<b>Score >= 2</b> → 'recommended' list (shown prominently in UI)"))
    story.append(B("<b>Score &lt; 2</b> → 'available' list (shown as secondary options)"))

    story.append(Paragraph("Operation Handlers", styles["H2"]))
    story.append(make_table([
        ["integration:operation", "Handler"],
        ["servicenow:incident.create", "servicenow_tools.create_incident"],
        ["servicenow:kb_knowledge.create", "servicenow_tools.create_knowledge_article"],
        ["servicenow:catalog_to_replit", "snow_to_replit.convert_catalog_to_replit"],
        ["servicenow:catalog_to_github", "snow_to_github.convert_catalog_to_github"],
        ["jira:issue.create", "jira_tools.create_issue"],
        ["slack:message.post", "slack_tools.post_message"],
        ["google-drive:knowledge_doc.create", "google_drive_tools.create_knowledge_doc"],
        ["replit:application.build", "replit_tools.build_application_action"],
        ["internal:pdf.generate", "pdf_tools.generate_pdf"],
    ], col_widths=[2.5*inch, 4.2*inch]))

    story.append(Paragraph("API Endpoints", styles["H2"]))
    story.append(make_table([
        ["Method", "Path", "Description"],
        ["GET", ".../actions", "List actions (supports filter_tenant)"],
        ["POST", ".../actions", "Create action"],
        ["GET", ".../actions/{id}", "Get single action"],
        ["PUT", ".../actions/{id}", "Update action"],
        ["DELETE", ".../actions/{id}", "Delete action"],
        ["POST", ".../actions/{id}/execute", "Execute action (resolve params, dispatch)"],
        ["GET", ".../actions/recommendations/{run_id}", "Score + return recommended/available"],
    ], col_widths=[0.7*inch, 2.8*inch, 3.2*inch]))
    story.append(PageBreak())

    # ── 8. CROSS-MODULE RELATIONSHIPS ──────────────────────────────
    story.append(Paragraph("8. Cross-Module Relationships", styles["H1"]))
    story.append(HR())

    story.append(Paragraph("Dependency Chain", styles["H2"]))
    story.append(C("Tenant → Integration → Tool → Skill → UseCase → Action"))
    story.append(S(1, 6))
    story.append(make_table([
        ["From", "To", "Relationship", "How"],
        ["Tenant", "All modules", "Scoping", "Every resource has tenant_id; TenantContext drives UI filtering"],
        ["Integration", "Tools", "Availability", "Tools filtered by enabled integrations; /tools/available checks IntegrationStore"],
        ["Integration", "Actions", "Execution", "Action handlers use integration config for API calls"],
        ["Tools", "Skills", "Composition", "Skill.tools[] references tool_ids from TOOL_CATALOG"],
        ["Skills", "Use Cases", "Workflow steps", "UseCaseStep.skill_id references Skill.id"],
        ["Use Cases", "Agent Stream", "Selection", "Agent scores use cases against prompt, selects best match"],
        ["Agent Run", "Actions", "Recommendations", "Action rules scored against completed AgentUIRun attributes"],
        ["Integration", "Endpoints", "Embedded", "IntegrationEndpoint[] stored directly on Integration model"],
    ], col_widths=[1.1*inch, 1.1*inch, 1.2*inch, 3.3*inch]))

    story.append(Paragraph("Data Flow", styles["H2"]))
    story.append(B("<b>Configuration time:</b> Admin creates Tenant → configures Integrations → sees available Tools → builds Skills → composes Use Cases → defines Actions with rules"))
    story.append(B("<b>Runtime:</b> User prompt → Use Case matched → Skills executed (tools called) → AgentUIRun persisted → Actions recommended → User approves → Action executed against integration"))
    story.append(PageBreak())

    # ── 9. END-TO-END FLOW ─────────────────────────────────────────
    story.append(Paragraph("9. End-to-End Execution Flow", styles["H1"]))
    story.append(HR())
    story.append(P("<b>Example:</b> User types \"I have an email outage affecting our team\""))
    story.append(S(1, 6))

    story.append(Paragraph("Phase 1: Use Case Matching", styles["H2"]))
    story.append(B("1. Frontend calls POST /api/admin/{tenant}/agent/stream with prompt"))
    story.append(B("2. Backend loads all <b>active</b> use cases for tenant"))
    story.append(B("3. _score_use_case() scores each: 'Email Incident Diagnosis' matches on ['email'] → score 0.75"))
    story.append(B("4. Emit SSE: use_case_selected {name, confidence: 0.75}"))

    story.append(Paragraph("Phase 2: Skill Execution", styles["H2"]))
    story.append(B("5. Step 1 — <b>Incident Lookup</b>: execute servicenow.search_incidents → returns incident records"))
    story.append(B("6. Step 2 — <b>Knowledge Base Search</b>: execute servicenow.search_kb → returns KB articles"))
    story.append(B("7. Step 3 — <b>Documentation Search</b>: execute google-drive.search_documents → returns docs"))
    story.append(B("8. Step 4 — <b>Diagnosis Summary</b>: LLM synthesizes all findings"))
    story.append(B("9. Each step emits SSE events: skill_started, tool_called, tool_result, skill_completed"))

    story.append(Paragraph("Phase 3: Action Recommendation", styles["H2"]))
    story.append(B("10. AgentUIRun persisted with selected_use_case, skills_used, result, confidence"))
    story.append(B("11. Frontend calls GET /actions/recommendations/{run_id}"))
    story.append(B("12. 'Create Incident' scores: +3 (use_case) +2 (keywords) +2 (skill) +1 (confidence) = <b>8 points → recommended</b>"))
    story.append(B("13. 'Create Jira Issue' scores: +2 (keywords) = 2 points → recommended"))
    story.append(B("14. 'Send Slack Notification' scores: +2 (keywords) = 2 points → recommended"))

    story.append(Paragraph("Phase 4: Action Execution", styles["H2"]))
    story.append(B("15. User clicks 'Create Incident'"))
    story.append(B("16. Parameter resolution: title ← run.prompt, description ← run.result, priority ← '3' (static)"))
    story.append(B("17. Dispatched to servicenow_tools.create_incident(tenant_id, params, app)"))
    story.append(B("18. ServiceNow API call: POST /api/now/table/incident with auth from integration config"))
    story.append(B("19. Result: 'Incident INC0123456 created' displayed in chat"))
    story.append(PageBreak())

    # ── 10. DATA MODEL SUMMARY ─────────────────────────────────────
    story.append(Paragraph("10. Data Model Summary", styles["H1"]))
    story.append(HR())
    story.append(P("Quick reference of all core models and their key fields:"))
    story.append(S(1, 6))
    story.append(make_table([
        ["Model", "Key Fields", "Store", "Relationships"],
        ["Tenant", "id, name, status", "TenantStore", "Scopes all other models"],
        ["Integration", "id, tenant_id, type, config, endpoints[]", "IntegrationStore", "Determines tool availability"],
        ["IntegrationEndpoint", "id, name, path, method", "(embedded)", "Belongs to Integration"],
        ["Tool (catalog)", "tool_id, integration_type, schemas", "(static dict)", "Referenced by Skill.tools[]"],
        ["Skill", "id, tenant_id, name, tools[], instructions", "SkillStore", "Referenced by UseCaseStep"],
        ["UseCase", "id, tenant_id, triggers[], steps[]", "UseCaseStore", "Matched by agent stream"],
        ["UseCaseStep", "step_id, skill_id", "(embedded)", "Belongs to UseCase"],
        ["Action", "id, tenant_id, operation, params[], rules[]", "ActionStore", "Scored against AgentUIRun"],
        ["ActionParameter", "name, source, value", "(embedded)", "Resolved at execution time"],
        ["ActionRule", "type, operator, value", "(embedded)", "Drives recommendation scoring"],
        ["AgentUIRun", "run_id, prompt, selected_use_case, result", "AgentUIRunStore", "Links use case → actions"],
    ], col_widths=[1.3*inch, 2.0*inch, 1.2*inch, 2.2*inch]))

    story.append(S(1, 20))
    story.append(HR())
    story.append(Paragraph("End of Document", styles["SmallNote"]))
    story.append(Paragraph("Generated for OverYonder.ai — March 2026", styles["SmallNote"]))

    doc.build(story)
    print(f"PDF generated: {path}")
    return path


if __name__ == "__main__":
    build_pdf()
