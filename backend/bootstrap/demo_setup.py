"""Auto-seed demo tenant with integrations, skills, and a use case."""

import uuid

from models import (
    Action,
    ActionParameter,
    ActionRule,
    ApplicationGenome,
    GenomeArtifact,
    GenomeDocument,
    Integration,
    IntegrationEndpoint,
    LLMConfig,
    Skill,
    Tenant,
    TenantLLMAssignment,
    Translation,
    UseCase,
    UseCaseStep,
)


async def seed_demo_data(app) -> None:
    """Populate stores with demo data if the 'acme' tenant doesn't exist yet."""
    tenant_store = app.state.tenant_store
    existing = await tenant_store.get("acme")
    if existing is not None:
        return  # Already seeded

    # --- Tenant ---
    # Insert directly into the store dict to control the ID
    tenant = Tenant(id="acme", name="ACME Corp", status="active")
    tenant_store._tenants["acme"] = tenant

    # --- LLM Config ---
    import os
    anthropic_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if anthropic_key:
        llm_config = LLMConfig(
            id="llm_demo_anthropic",
            label="Anthropic (default)",
            provider="anthropic",
            api_key=anthropic_key,
            model="claude-sonnet-4-20250514",
            input_token_cost=0.003,
            output_token_cost=0.015,
        )
        await app.state.llm_config_store.create(llm_config)
        assignment = TenantLLMAssignment(
            tenant_id="acme",
            llm_config_id=llm_config.id,
            is_active=True,
        )
        await app.state.llm_assignment_store.assign("acme", llm_config.id)
        await app.state.llm_assignment_store.set_active("acme", llm_config.id)

    # --- OpenAI LLM Config (seeded from env var) ---
    openai_key = os.environ.get("OPENAI_API_KEY", "")
    if openai_key:
        openai_config = LLMConfig(
            id="llm_demo_openai",
            label="GPT-4o",
            provider="openai",
            api_key=openai_key,
            model="gpt-4o",
            input_token_cost=0.005,
            output_token_cost=0.015,
        )
        await app.state.llm_config_store.create(openai_config)
        await app.state.llm_assignment_store.assign("acme", openai_config.id)
        # Make OpenAI the active default if ANTHROPIC is not set, or if explicitly preferred
        if not anthropic_key or os.environ.get("DEFAULT_LLM_PROVIDER", "") == "openai":
            await app.state.llm_assignment_store.set_active("acme", openai_config.id)

    # --- GitHub integration (seeded from env var so it survives restarts) ---
    github_pat = os.environ.get("GITHUB_PAT", "")
    github_org = os.environ.get("GITHUB_ORG", "Schredly")
    github_repo = os.environ.get("GITHUB_DEFAULT_REPO", "https://github.com/Schredly/oy_genome.git")
    if github_pat:
        github_integration = Integration(
            id="int_github_seed",
            tenant_id="acme",
            integration_type="github",
            name="Genome",
            enabled=True,
            config={
                "token": github_pat,
                "org": github_org,
                "default_repository": github_repo,
            },
        )
        await app.state.integration_store.create(github_integration)

    # --- ServiceNow integration ---
    await app.state.snow_config_store.upsert(
        "acme",
        instance_url="https://dev221705.service-now.com",
        username="admin",
        password="1Surfer1!",
    )

    snow_integration = Integration(
        id=f"int_{uuid.uuid4().hex[:12]}",
        tenant_id="acme",
        integration_type="servicenow",
        enabled=True,
        config={
            "instance_url": "https://dev221705.service-now.com",
            "username": "admin",
            "password": "1Surfer1!",
        },
        endpoints=[
            IntegrationEndpoint(id="ep_catbyurl", name="Catalog by URL",
                path="/api/1939459/catalogunderstandingservice/loveboat/{sys_id}",
                method="GET", description="Fetch a specific catalog by direct URL with sys_id"),
            IntegrationEndpoint(id="ep_catbytitle", name="Catalog By Title",
                path="/api/1939459/catalogbytitleservic/catalog/{catalogTitle}",
                method="GET", description="Fetch a catalog by its title (URL-encoded)"),
            IntegrationEndpoint(id="ep_catlist", name="List Catalogs",
                path="/api/1939459/catalogtitleservice",
                method="GET", description="List all available ServiceNow catalogs"),
            IntegrationEndpoint(id="ep_apps", name="List Applications",
                path="/api/1939459/overyonder_selfdeploy/extract/applications",
                method="GET", description="List all discoverable applications via self-deploy extractor"),
            IntegrationEndpoint(id="ep_incidents", name="Search Incidents",
                path="/api/now/table/incident", method="GET",
                description="Query the incident table"),
            IntegrationEndpoint(id="ep_kb", name="Knowledge Base",
                path="/api/now/table/kb_knowledge", method="GET",
                description="Search knowledge articles"),
        ],
    )
    await app.state.integration_store.create(snow_integration)

    # --- Replit integration (seeded from env vars so config survives restarts) ---
    replit_sid = os.environ.get("REPLIT_CONNECT_SID", "")
    replit_username = os.environ.get("REPLIT_USERNAME", "")
    replit_enabled = bool(replit_sid)

    if replit_sid:
        await app.state.replit_config_store.upsert(
            "acme", connect_sid=replit_sid, username=replit_username,
        )

    replit_integration = Integration(
        id=f"int_{uuid.uuid4().hex[:12]}",
        tenant_id="acme",
        integration_type="replit",
        enabled=replit_enabled,
        config={"connect_sid": replit_sid, "username": replit_username} if replit_sid else {},
    )
    await app.state.integration_store.create(replit_integration)

    # --- Skills ---
    skill_defs = [
        {
            "name": "Incident Lookup",
            "description": "Search ServiceNow incidents for matching records",
            "tools": ["servicenow.search_incidents"],
        },
        {
            "name": "Knowledge Base Search",
            "description": "Search ServiceNow knowledge base for relevant articles",
            "tools": ["servicenow.search_kb"],
        },
        {
            "name": "Documentation Search",
            "description": "Search Google Drive documents for technical documentation",
            "tools": ["google-drive.search_documents"],
        },
        {
            "name": "Diagnosis Summary",
            "description": "Compile findings into a diagnosis and resolution summary",
            "tools": [],
        },
        {
            "name": "Replit Builder",
            "description": "Build and deploy applications on Replit",
            "tools": ["replit.build_application"],
        },
    ]

    skill_ids: list[str] = []
    for sd in skill_defs:
        skill_id = f"sk_{uuid.uuid4().hex[:12]}"
        skill_ids.append(skill_id)
        skill = Skill(
            id=skill_id,
            tenant_id="acme",
            name=sd["name"],
            description=sd["description"],
            tools=sd["tools"],
        )
        await app.state.skill_store.create(skill)

    # --- Use Case: Email Incident Diagnosis ---
    steps = [
        UseCaseStep(step_id=f"step_{i}", skill_id=skill_ids[i], name=skill_defs[i]["name"])
        for i in range(4)
    ]

    use_case = UseCase(
        id=f"uc_{uuid.uuid4().hex[:12]}",
        tenant_id="acme",
        name="Email Incident Diagnosis",
        description="Diagnoses email-related incidents by searching incidents, KB articles, and documentation",
        status="active",
        triggers=["email", "attachment", "smtp", "mail", "inbox", "outlook", "exchange"],
        steps=steps,
    )
    await app.state.use_case_store.create(use_case)

    # --- Use Case: Application Builder ---
    builder_steps = [
        UseCaseStep(step_id="step_0", skill_id=skill_ids[4], name="Replit Builder"),
    ]
    builder_use_case = UseCase(
        id=f"uc_{uuid.uuid4().hex[:12]}",
        tenant_id="acme",
        name="Application Builder",
        description="Build and deploy applications on Replit",
        status="active",
        triggers=["build", "app", "application", "service", "system", "create", "builder", "replit"],
        steps=builder_steps,
    )
    await app.state.use_case_store.create(builder_use_case)

    # --- Actions ---
    action_defs = [
        {
            "name": "Create Incident",
            "description": "Creates a new incident in ServiceNow with agent findings",
            "integration_id": "servicenow",
            "operation": "incident.create",
            "parameters": [
                ActionParameter(name="title", source="user_prompt"),
                ActionParameter(name="description", source="agent_result"),
                ActionParameter(name="priority", source="static", value="3"),
            ],
            "rules": [
                ActionRule(type="use_case", operator="equals", value="Email Incident Diagnosis"),
                ActionRule(type="keyword", operator="contains", value="email,incident,outage,smtp,exchange,outlook"),
                ActionRule(type="skill", operator="contains", value="Incident Lookup"),
                ActionRule(type="confidence", operator="greater_than", value="0.10"),
            ],
        },
        {
            "name": "Create Jira Issue",
            "description": "Creates a new issue in Jira project with specified fields",
            "integration_id": "jira",
            "operation": "issue.create",
            "parameters": [
                ActionParameter(name="summary", source="user_prompt"),
                ActionParameter(name="description", source="agent_result"),
            ],
            "rules": [
                ActionRule(type="keyword", operator="contains", value="bug,issue,task,feature,ticket,jira"),
            ],
        },
        {
            "name": "Generate PDF Report",
            "description": "Generates a PDF report from agent analysis results",
            "integration_id": "internal",
            "operation": "pdf.generate",
            "parameters": [
                ActionParameter(name="content", source="agent_result"),
            ],
            "rules": [
                ActionRule(type="confidence", operator="greater_than", value="0.15"),
                ActionRule(type="keyword", operator="contains", value="report,summary,diagnosis,analysis,pdf"),
            ],
        },
        {
            "name": "Send Slack Notification",
            "description": "Sends a notification message to a specified Slack channel",
            "integration_id": "slack",
            "operation": "message.post",
            "parameters": [
                ActionParameter(name="channel", source="static", value="#incidents"),
                ActionParameter(name="text", source="agent_result"),
            ],
            "rules": [
                ActionRule(type="keyword", operator="contains", value="notify,alert,team,slack,urgent"),
            ],
        },
        {
            "name": "Create Knowledge Article",
            "description": "Publishes the agent's recommended solution as a ServiceNow KB article",
            "integration_id": "servicenow",
            "operation": "kb_knowledge.create",
            "parameters": [
                ActionParameter(name="title", source="user_prompt"),
                ActionParameter(name="content", source="agent_result"),
            ],
            "rules": [
                ActionRule(type="use_case", operator="equals", value="Email Incident Diagnosis"),
                ActionRule(type="keyword", operator="contains", value="knowledge,kb,article,resolution,solution,fix,workaround,document"),
                ActionRule(type="skill", operator="contains", value="Knowledge Base Search,Diagnosis Summary"),
                ActionRule(type="confidence", operator="greater_than", value="0.50"),
            ],
        },
        {
            "name": "Build Replit Application",
            "description": "Build and deploy an application on Replit",
            "integration_id": "replit",
            "operation": "application.build",
            "parameters": [
                ActionParameter(name="app_name", source="user_prompt"),
                ActionParameter(name="description", source="agent_result"),
                ActionParameter(name="tech_stack", source="agent_result"),
            ],
            "rules": [
                ActionRule(type="keyword", operator="contains", value="build,app,application,service,system,create,builder,replit"),
            ],
        },
        {
            "name": "Create Knowledge Doc",
            "description": "Saves the agent's solution as a .md file in the best-fit Google Drive folder",
            "integration_id": "google-drive",
            "operation": "knowledge_doc.create",
            "parameters": [
                ActionParameter(name="title", source="user_prompt"),
                ActionParameter(name="content", source="agent_result"),
                ActionParameter(name="access_token", source="user_input"),
            ],
            "rules": [
                ActionRule(type="use_case", operator="equals", value="Email Incident Diagnosis"),
                ActionRule(type="keyword", operator="contains", value="document,doc,google,drive,save,write,knowledge,resolution"),
                ActionRule(type="skill", operator="contains", value="Documentation Search,Diagnosis Summary"),
                ActionRule(type="confidence", operator="greater_than", value="0.30"),
            ],
        },
        {
            "name": "ServiceNow to Replit",
            "description": "Convert ServiceNow catalog to Replit app",
            "integration_id": "servicenow",
            "operation": "catalog_to_replit",
            "parameters": [
                ActionParameter(name="service_url", source="static",
                    value="endpoint:Catalog by URL|sys_id=2ab7077237153000158bbfc8bcbe5da9"),
            ],
            "rules": [
                ActionRule(type="keyword", operator="contains",
                    value="convert,servicenow,replit"),
            ],
        },
        {
            "name": "ServiceNow Catalog to Replit",
            "description": "Fetch a ServiceNow catalog by name and convert it to a Replit app",
            "integration_id": "servicenow",
            "operation": "catalog_by_title_to_replit",
            "parameters": [
                ActionParameter(name="catalog_title", source="user_input"),
            ],
            "rules": [
                ActionRule(type="keyword", operator="contains",
                    value="convert,servicenow,catalog,replit"),
            ],
        },
        {
            "name": "ServiceNow Catalog to GitHub",
            "description": "Export a ServiceNow catalog to a GitHub repository",
            "integration_id": "servicenow",
            "operation": "catalog_to_github",
            "parameters": [
                ActionParameter(name="catalog_selection", source="user_input"),
            ],
            "rules": [
                ActionRule(type="keyword", operator="contains",
                    value="github,catalog,export,servicenow,repository"),
            ],
        },
    ]

    for ad in action_defs:
        action = Action(
            id=f"act_{uuid.uuid4().hex[:12]}",
            tenant_id="acme",
            name=ad["name"],
            description=ad["description"],
            integration_id=ad["integration_id"],
            operation=ad["operation"],
            parameters=ad.get("parameters", []),
            rules=ad.get("rules", []),
            status=ad.get("status", "active"),
        )
        await app.state.action_store.create(action)

    # --- Application Genomes ---
    genome_defs = [
        {
            "id": "genome_hw_request",
            "application_name": "Hardware Request",
            "vendor": "ServiceNow",
            "source_platform": "ServiceNow Orlando",
            "target_platform": "Salesforce Service Cloud",
            "category": "IT Service Management",
            "object_count": 347,
            "workflow_count": 89,
            "legacy_cost": 125000,
            "migrated_cost": 85000,
            "operational_cost": 12000,
            "captured_date": "2024-02-15",
            "genome_document": GenomeDocument(
                objects=["request", "request_item", "approval", "task", "asset", "catalog_item", "user", "department", "location", "cost_center"],
                workflows=["request submission", "manager approval", "procurement order", "asset assignment", "delivery notification", "return and disposal"],
                fields=["request_id", "requested_by", "item_type", "quantity", "justification", "cost_center", "approval_status", "assigned_to", "delivery_date", "tracking_number"],
                relationships=["request → approval", "request → request_item", "request_item → task", "request_item → asset", "asset → location", "user → department", "department → cost_center"],
            ),
        },
        {
            "id": "genome_access_req",
            "application_name": "Access Request",
            "vendor": "ServiceNow",
            "source_platform": "ServiceNow Paris",
            "target_platform": "Okta Workflows",
            "category": "Identity & Access Management",
            "object_count": 234,
            "workflow_count": 56,
            "legacy_cost": 98000,
            "migrated_cost": 62000,
            "operational_cost": 9500,
            "captured_date": "2024-02-20",
            "genome_document": GenomeDocument(
                objects=["access_request", "user_role", "permission_set", "approval_chain", "audit_log"],
                workflows=["access approval flow", "role assignment", "deprovisioning", "periodic access review"],
                fields=["access_request_id", "user_id", "role_requested", "justification", "approval_status", "expiry_date"],
                relationships=["access_request → user_role", "user_role → permission_set", "access_request → approval_chain"],
            ),
        },
        {
            "id": "genome_case_mgmt",
            "application_name": "Case Management",
            "vendor": "Salesforce",
            "source_platform": "Salesforce Service Cloud",
            "target_platform": "Zendesk Suite",
            "category": "Customer Service",
            "object_count": 189,
            "workflow_count": 42,
            "legacy_cost": 110000,
            "migrated_cost": 72000,
            "operational_cost": 8800,
            "captured_date": "2024-03-05",
            "genome_document": GenomeDocument(
                objects=["case", "contact", "account", "case_comment", "escalation", "knowledge_article", "entitlement"],
                workflows=["case creation", "auto-assignment", "escalation timer", "satisfaction survey", "SLA breach notification"],
                fields=["case_number", "subject", "description", "priority", "status", "owner", "contact_id", "account_id", "resolution"],
                relationships=["case → contact", "case → account", "case → case_comment", "case → escalation", "contact → account"],
            ),
        },
        {
            "id": "genome_bug_tracker",
            "application_name": "Bug Tracker",
            "vendor": "Jira",
            "source_platform": "Jira Cloud",
            "target_platform": "Azure DevOps",
            "category": "Software Development",
            "object_count": 95,
            "workflow_count": 28,
            "legacy_cost": 45000,
            "migrated_cost": 32000,
            "operational_cost": 4200,
            "captured_date": "2024-03-12",
            "genome_document": GenomeDocument(
                objects=["issue", "project", "sprint", "board", "component", "version"],
                workflows=["bug triage", "sprint planning", "release management", "code review approval"],
                fields=["issue_key", "summary", "description", "assignee", "reporter", "priority", "status", "sprint_id", "story_points"],
                relationships=["issue → project", "issue → sprint", "issue → component", "sprint → board", "project → version"],
            ),
        },
        {
            "id": "genome_onboarding",
            "application_name": "Employee Onboarding",
            "vendor": "Workday",
            "source_platform": "Workday HCM",
            "target_platform": "SAP SuccessFactors",
            "category": "HR Operations",
            "object_count": 278,
            "workflow_count": 65,
            "legacy_cost": 155000,
            "migrated_cost": 98000,
            "operational_cost": 14500,
            "captured_date": "2024-03-18",
            "genome_document": GenomeDocument(
                objects=["worker", "position", "organization", "compensation", "benefit_plan", "onboarding_task", "document", "training"],
                workflows=["new hire onboarding", "benefits enrollment", "IT provisioning", "manager notification", "compliance training assignment", "probation review"],
                fields=["employee_id", "full_name", "department", "position_title", "start_date", "manager_id", "compensation_grade", "location"],
                relationships=["worker → position", "worker → organization", "position → compensation", "worker → benefit_plan", "worker → onboarding_task", "onboarding_task → training"],
            ),
        },
        {
            "id": "genome_helpdesk",
            "application_name": "Helpdesk Ticketing",
            "vendor": "Zendesk",
            "source_platform": "Zendesk Support",
            "target_platform": "Freshdesk",
            "category": "Customer Service",
            "object_count": 142,
            "workflow_count": 35,
            "legacy_cost": 68000,
            "migrated_cost": 48000,
            "operational_cost": 5600,
            "captured_date": "2024-04-01",
            "genome_document": GenomeDocument(
                objects=["ticket", "requester", "agent", "group", "macro", "trigger", "automation"],
                workflows=["ticket routing", "auto-response", "escalation to tier 2", "CSAT follow-up", "SLA tracking"],
                fields=["ticket_id", "subject", "description", "requester_email", "assignee", "priority", "status", "tags"],
                relationships=["ticket → requester", "ticket → agent", "agent → group", "ticket → macro"],
            ),
        },
    ]

    for gd in genome_defs:
        genome = ApplicationGenome(tenant_id="acme", **gd)
        await app.state.genome_store.create(genome)
        # Create a corresponding GenomeArtifact
        artifact = GenomeArtifact(
            id=f"gart_{gd['id'].replace('genome_', '')}",
            genome_id=gd["id"],
            version=1,
            artifact_json=gd["genome_document"].model_dump(),
        )
        await app.state.genome_artifact_store.create(artifact)

    # --- Translations ---
    translation_defs = [
        {
            "id": "trans_claude_buildout",
            "name": "Genome \u2192 Claude Code Build Spec",
            "description": (
                "Transforms any application genome into a detailed CLAUDE.md with Pydantic models, "
                "FastAPI routes, service functions, React page specs, and seed data -- everything "
                "Claude Code needs to build the full app."
            ),
            "source_vendor": "ServiceNow",
            "source_type": "application",
            "target_platform": "claude_code",
            "instructions": (
                "Transform the retrieved genome files into a CLAUDE.md build spec that contains "
                "ACTUAL CODE — not descriptions of code. Claude Code will receive ONLY this file "
                "and must be able to build the entire app from it.\n\n"
                "IMPORTANT: Write LONG, DETAILED content. Target 8000+ tokens in CLAUDE.md.\n\n"
                "---\n\n"
                "## STEP 0: PRE-FLIGHT TABLE AUDIT (do this before writing anything)\n\n"
                "Collect every table name mentioned anywhere in the genome files:\n"
                "  - entities[*].table\n"
                "  - data_model.tables[*].name\n"
                "  - business_logic.rules[*].table\n"
                "  - ui.modules[*].table\n"
                "  - Any table referenced in processes or logic_patterns\n\n"
                "For each table that appears in business_logic or ui but NOT in data_model or entities,\n"
                "you MUST infer its complete schema using every available clue:\n"
                "  - filter expressions (e.g. 'status=checked_out' → status field with choices)\n"
                "  - rule names and logic_summary text\n"
                "  - process step descriptions\n"
                "  - relationships to other known tables\n"
                "  - Standard fields always present: sys_id, status, created_by, created_at, updated_at\n\n"
                "Example: if business_logic references 'x_app_checkout' but it is not in data_model,\n"
                "infer: equipment_id (FK), customer_name, customer_email, rental_start, rental_end,\n"
                "return_date, status (enum: pending/checked_out/returned/cancelled), notes.\n\n"
                "---\n\n"
                "## CLAUDE.md STRUCTURE\n\n"
                "### Section 1: Project Overview\n"
                "App name, what it does, what it replaces. List every entity and workflow by name.\n\n"
                "### Section 2: Tech Stack\n"
                "Backend: Python 3.11, FastAPI, Pydantic v2, SQLAlchemy 2.0, SQLite\n"
                "Frontend: React 19, TypeScript, Vite, TailwindCSS, shadcn/ui\n\n"
                "### Section 3: Data Models — WRITE ACTUAL PYTHON CODE\n"
                "For EVERY table from the audit (including inferred tables), write:\n"
                "1. An Enum class for every choice/status field\n"
                "2. A SQLAlchemy Table model (for DB)\n"
                "3. A Pydantic BaseModel (for API)\n"
                "4. A Pydantic Create/Update model\n\n"
                "```python\n"
                "class CheckoutStatus(str, Enum):\n"
                "    pending = 'pending'\n"
                "    checked_out = 'checked_out'\n"
                "    returned = 'returned'\n"
                "    cancelled = 'cancelled'\n\n"
                "class Checkout(BaseModel):\n"
                "    id: int\n"
                "    equipment_id: int          # FK → Equipment.id\n"
                "    customer_name: str\n"
                "    customer_email: str\n"
                "    rental_start: date\n"
                "    rental_end: date\n"
                "    return_date: Optional[date] = None\n"
                "    status: CheckoutStatus = CheckoutStatus.pending\n"
                "    notes: Optional[str] = None\n"
                "    created_at: datetime\n"
                "    updated_at: datetime\n"
                "```\n\n"
                "### Section 4: API Endpoints — WRITE ACTUAL FASTAPI SIGNATURES\n"
                "CRUD for every entity plus action endpoints for every workflow step:\n"
                "```python\n"
                "@router.get('/checkouts', response_model=list[Checkout])\n"
                "async def list_checkouts(status: CheckoutStatus | None = None, db: Session = Depends(get_db)): ...\n\n"
                "@router.post('/checkouts', response_model=Checkout)\n"
                "async def create_checkout(body: CreateCheckout, db: Session = Depends(get_db)): ...\n\n"
                "@router.post('/checkouts/{id}/return', response_model=Checkout)\n"
                "async def return_checkout(id: int, db: Session = Depends(get_db)): ...\n"
                "```\n\n"
                "### Section 5: Business Logic — WRITE ACTUAL FUNCTION SIGNATURES\n"
                "For EVERY rule in business_logic AND every logic_pattern:\n"
                "```python\n"
                "async def decrement_inventory(db: Session, equipment_id: int, qty: int = 1) -> Equipment:\n"
                "    '''Reduce available_quantity when checkout is created.\n"
                "    Raises ValueError if qty > available_quantity.'''\n"
                "    ...\n\n"
                "async def restore_inventory(db: Session, equipment_id: int, qty: int = 1) -> Equipment:\n"
                "    '''Increase available_quantity when checkout is returned.'''\n"
                "    ...\n"
                "```\n\n"
                "### Section 6: Workflows\n"
                "For EVERY process, write the orchestration as a typed step list:\n"
                "```python\n"
                "RENTAL_WORKFLOW = [\n"
                "    Step('request', actor='customer', action='submit_rental_form',\n"
                "         validates=['equipment_available'], emits='checkout_created'),\n"
                "    Step('checkout', actor='system', action='create_checkout_record',\n"
                "         calls=['decrement_inventory']),\n"
                "    Step('return', actor='customer', action='mark_returned',\n"
                "         calls=['restore_inventory'], emits='equipment_returned'),\n"
                "]\n"
                "```\n\n"
                "### Section 7: Event Handlers\n"
                "For EVERY event in the genome:\n"
                "```python\n"
                "@on_event('checkout_created')\n"
                "async def on_checkout_created(checkout: Checkout, db: Session):\n"
                "    await decrement_inventory(db, checkout.equipment_id)\n"
                "```\n\n"
                "### Section 8: UI Pages\n"
                "For EVERY ui.module, a table row with route, component, data source, and key features.\n"
                "For EVERY catalog item with variables, a form field spec:\n"
                "```\n"
                "RentalRequestForm fields:\n"
                "  customer_name:    TextInput, required\n"
                "  customer_email:   EmailInput, required\n"
                "  equipment_id:     Select (GET /api/equipment?available=true), required\n"
                "  rental_start:     DatePicker, required\n"
                "  rental_end:       DatePicker, required, must be after rental_start\n"
                "  notes:            Textarea, optional\n"
                "```\n\n"
                "### Section 9: Navigation\n"
                "Map genome navigation.menu directly to sidebar routes and icons.\n\n"
                "### Section 10: Architecture Rules\n"
                "- Entity pattern: models.py → database.py → services/{name}.py → routers/{name}.py\n"
                "- All routes return {status, data} envelope\n"
                "- Business logic lives in services/, never in routers\n"
                "- DB session via FastAPI Depends(get_db)\n\n"
                "### Section 11: Build Order\n"
                "Exact numbered steps Claude Code must follow:\n"
                "1. Scaffold: create backend/ and frontend/ with venv + package.json\n"
                "2. backend/models.py — all Pydantic models and enums from Section 3\n"
                "3. backend/database.py — SQLAlchemy engine + Base + get_db + create_tables()\n"
                "4. backend/services/{entity}.py — all service functions from Section 5\n"
                "5. backend/workflows.py — Step dataclass + workflow definitions from Section 6\n"
                "6. backend/events.py — event bus + handlers from Section 7\n"
                "7. backend/routers/{entity}.py — all FastAPI routes from Section 4\n"
                "8. backend/main.py — app factory, CORS, lifespan (create_tables), router includes\n"
                "9. frontend/src/api/ — typed fetch hooks for each endpoint\n"
                "10. frontend/src/pages/ — all pages from Section 8\n"
                "11. Run seed.json through POST endpoints to populate the DB\n\n"
                "---\n\n"
                "## ALSO GENERATE: transformations/seed.json\n"
                "3-5 realistic records for EVERY entity (including inferred tables).\n"
                "Use actual field names from Section 3. Show entity relationships:\n"
                "checkout records must reference equipment records by id.\n\n"
                "---\n\n"
                "## OUTPUT FORMAT\n"
                "Return ONLY valid JSON matching this exact shape (no markdown fences):\n"
                '{"plan":["≤5 short step labels"],"output":{"explanation":"1 sentence summary ONLY — keep this extremely short to save tokens for the files","filesystem_plan":{'
                '"branch_name":"claude-build/{app_slug}",'
                '"base_path":"<genome base path>",'
                '"folders":["transformations"],'
                '"files":[{"path":"transformations/CLAUDE.md","content":"<full CLAUDE.md>"},'
                '{"path":"transformations/seed.json","content":"<seed JSON string>"}]'
                '},"diff":"Files created: CLAUDE.md, seed.json","preview":"<first 200 chars of CLAUDE.md>"}}\n'
                "\nCRITICAL: explanation MUST be ≤2 sentences. Do NOT write prose in explanation — "
                "all detail goes inside transformations/CLAUDE.md. Wasting tokens on explanation "
                "causes the response to be truncated before the files are complete.\n"
            ),
            "output_structure": {
                "folders": ["transformations"],
                "files": [
                    "transformations/CLAUDE.md",
                    "transformations/seed.json",
                ],
            },
            "status": "active",
        },
        {
            "id": "trans_snow_replit",
            "name": "ServiceNow Application -> Replit AI App",
            "description": "Converts any ServiceNow application or catalog genome into a runnable Replit application with FastAPI backend, optional UI, and AI-agent capable workflow execution. Transforms genome entities into domain models, business rules into automation functions, workflows into orchestrated endpoints, and catalog items into forms. Supports function-based AI agent patterns for complex approval chains and multi-step processes.",
            "source_vendor": "ServiceNow",
            "source_type": "application",
            "target_platform": "replit",
            "instructions": (
                "You are an expert OverYonder Translation Architect converting a ServiceNow-derived "
                "Application Genome into a Replit-native AI application.\n\n"
                "This is a PATTERN-BASED recipe that must work on ANY ServiceNow genome.\n\n"
                "---\n\n"
                "## 1. PARSE GENOME\n\n"
                "Extract from the genome YAML:\n"
                "- entities -> domain models (Python dataclasses or Pydantic)\n"
                "- workflows -> backend process endpoints\n"
                "- business_logic rules -> automation functions in services/\n"
                "- catalog items/variables -> input forms / API request schemas\n"
                "- ui/modules -> app routes or pages\n"
                "- data_model tables -> SQLite tables or in-memory stores\n"
                "- relationships -> foreign keys and model references\n\n"
                "---\n\n"
                "## 2. GENERATE REPLIT APP (MANDATORY STRUCTURE)\n\n"
                "Use Python + FastAPI. Generate these files:\n\n"
                "### Backend (REQUIRED):\n"
                "- main.py -- FastAPI entrypoint with CORS, lifespan, router includes\n"
                "- routes.py -- All API endpoints organized by entity\n"
                "- models.py -- Pydantic models for every entity from the genome\n"
                "- services/ directory -- Business logic layer, one file per domain\n"
                "- store.py -- Data access layer (in-memory dict or SQLite)\n"
                "- requirements.txt -- fastapi, uvicorn, pydantic, etc.\n\n"
                "### AI Agent Layer (REQUIRED when genome has workflows or business_logic):\n"
                "- backend/agent.py -- MUST contain:\n\n"
                "  1. FUNCTION REGISTRY: Wrap every business_logic rule as a callable function.\n"
                "     Example:\n"
                "       FUNCTIONS = {\n"
                "           'decrement_inventory': decrement_inventory,\n"
                "           'approve_request': approve_request,\n"
                "           'send_notification': send_notification,\n"
                "       }\n\n"
                "  2. TASK ROUTER: Create a dispatcher that routes tasks to functions:\n"
                "       async def route_task(task_name: str, payload: dict) -> dict:\n"
                "           fn = FUNCTIONS.get(task_name)\n"
                "           if not fn: return {'error': f'Unknown task: {task_name}'}\n"
                "           return await fn(**payload)\n\n"
                "  3. SIMPLE MEMORY: In-memory conversation/task history:\n"
                "       TASK_HISTORY: list[dict] = []\n"
                "       def log_task(task_name, payload, result): ...\n"
                "       def get_history(limit=10): ...\n\n"
                "  4. WORKFLOW EXECUTOR: Chain multiple functions for multi-step workflows:\n"
                "       async def execute_workflow(workflow_name: str, context: dict) -> dict:\n"
                "           steps = WORKFLOWS[workflow_name]\n"
                "           for step in steps:\n"
                "               result = await route_task(step['action'], context)\n"
                "               context.update(result)\n"
                "           return context\n\n"
                "  5. OPTIONAL RETRIEVAL: If the genome has data_model or catalog items,\n"
                "     implement a simple retrieval function:\n"
                "       def retrieve(query: str, collection: str) -> list[dict]:\n"
                "           # Search in-memory store by keyword matching\n\n"
                "  6. API ENDPOINT: Expose the agent via:\n"
                "       POST /api/agent/execute  -- body: {task, payload}\n"
                "       POST /api/agent/workflow  -- body: {workflow, context}\n"
                "       GET  /api/agent/history   -- returns task execution history\n\n"
                "### Replit Config (REQUIRED):\n"
                "- .replit -- run = 'uvicorn main:app --host 0.0.0.0 --port 8080'\n"
                "- replit.nix -- Python 3.11 environment\n\n"
                "---\n\n"
                "## 3. DATA LAYER\n\n"
                "- Use simple in-memory dict store OR SQLite (prefer in-memory for simplicity)\n"
                "- Map every entity from data_model.tables -> a model + CRUD store\n"
                "- Include: create, get_by_id, list_all, update, delete for each entity\n"
                "- Preserve relationships as references between stores\n\n"
                "---\n\n"
                "## 4. API DESIGN\n\n"
                "For each entity in the genome, create:\n"
                "- GET /api/{entity} -- list all\n"
                "- GET /api/{entity}/{id} -- get by ID\n"
                "- POST /api/{entity} -- create\n"
                "- PUT /api/{entity}/{id} -- update\n"
                "- DELETE /api/{entity}/{id} -- delete\n\n"
                "For each workflow, create explicit action endpoints:\n"
                "- POST /api/checkout -- for checkout workflows\n"
                "- POST /api/approve/{id} -- for approval workflows\n"
                "- POST /api/submit-request -- for request intake\n"
                "- POST /api/process/{id} -- for processing steps\n\n"
                "---\n\n"
                "## 5. BUSINESS LOGIC TRANSFORMATION\n\n"
                "Convert every business_logic rule into a Python function in services/:\n\n"
                "Example genome rule:\n"
                "  name: decrement_inventory_on_checkout\n"
                "  trigger: checkout_created\n"
                "  action: reduce inventory count\n\n"
                "Becomes:\n"
                "  async def decrement_inventory(item_id: str, quantity: int):\n"
                "      item = store.get(item_id)\n"
                "      item.quantity -= quantity\n"
                "      store.update(item)\n\n"
                "Convert ALL logic into working Python functions.\n"
                "Remove ServiceNow-specific terminology -- use platform-neutral names.\n\n"
                "---\n\n"
                "## 6. OPTIONAL FRONTEND\n\n"
                "If catalog items exist in the genome, generate:\n"
                "- templates/ directory with HTML forms\n"
                "- Static HTML + CSS that calls the FastAPI endpoints\n"
                "- One page per catalog item with all variables as form fields\n"
                "- Dashboard page listing all entities with counts\n\n"
                "If no catalog items, skip frontend and make it API-only.\n\n"
                "---\n\n"
                "## 7. OUTPUT FORMAT\n\n"
                "Return a filesystem_plan JSON with:\n"
                "- branch_name: 'replit-app/{app_slug}'\n"
                "- base_path: 'Genome Transformations/replit-app'\n"
                "- files: [{path, content}] for every generated file\n"
                "- folders: list of directory paths\n\n"
                "Every file must contain COMPLETE, WORKING code -- no placeholders, no TODOs.\n"
                "The app must run immediately with: uvicorn main:app --host 0.0.0.0 --port 8080\n"
            ),
            "output_structure": {
                "folders": [
                    "backend",
                    "backend/services",
                    "frontend",
                    "data",
                ],
                "files": [
                    "backend/main.py",
                    "backend/routes.py",
                    "backend/models.py",
                    "backend/store.py",
                    "backend/services/__init__.py",
                    "backend/services/logic.py",
                    "backend/services/workflows.py",
                    "backend/agent.py",
                    "frontend/index.html",
                    "frontend/style.css",
                    "data/seed.json",
                    "requirements.txt",
                    ".replit",
                    "replit.nix",
                    "README.md",
                ],
            },
            "status": "active",
        },
        {
            "id": "trans_snow_github",
            "name": "ServiceNow Catalog \u2192 GitHub Repository",
            "description": "Transforms a ServiceNow service catalog genome into a GitHub-ready repository structure with README, schema, and migration scripts.",
            "source_vendor": "ServiceNow",
            "source_type": "service_catalog",
            "target_platform": "github",
            "instructions": (
                "You are translating a ServiceNow service catalog genome into a GitHub repository structure.\n\n"
                "Given the genome YAML content, produce:\n"
                "1. A README.md \u2014 project overview, setup instructions, architecture notes\n"
                "2. A schema.json \u2014 data model schema derived from genome objects and fields\n"
                "3. A migration_plan.md \u2014 step-by-step migration guide from ServiceNow to the target\n\n"
                "The README should explain what the original ServiceNow application does, "
                "its key workflows, and how the migrated version preserves functionality.\n"
                "The schema should map ServiceNow objects to standard data models."
            ),
            "output_structure": {
                "folders": ["Genome Transformations/github-repo"],
                "files": ["README.md", "schema.json", "migration_plan.md"],
            },
            "status": "active",
        },
    ]

    for td in translation_defs:
        translation = Translation(tenant_id="acme", **td)
        await app.state.translation_store.create(translation)

    print(f"[demo_setup] Seeded 'acme' tenant with ServiceNow + Replit integrations, 5 skills, 2 use cases, {len(action_defs)} actions, {len(genome_defs)} genomes + artifacts, {len(translation_defs)} translations")
