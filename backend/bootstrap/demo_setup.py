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
            "id": "trans_snow_replit",
            "name": "ServiceNow Catalog \u2192 Replit App",
            "description": "Transforms a ServiceNow service catalog genome into a Replit-deployable application with master prompt, catalog summary, and Replit config.",
            "source_vendor": "ServiceNow",
            "source_type": "service_catalog",
            "target_platform": "replit",
            "instructions": (
                "You are translating a ServiceNow service catalog genome into a Replit application.\n\n"
                "Given the genome YAML content, produce:\n"
                "1. A master_prompt.md \u2014 comprehensive prompt for Replit Agent to build the app\n"
                "2. A catalog_summary.json \u2014 structured JSON summary of the catalog item\n"
                "3. A .replit config \u2014 Replit project configuration\n\n"
                "The master prompt should describe the UI, API routes, data models, and workflows "
                "that replicate the ServiceNow catalog item as a standalone web application.\n"
                "Include all fields, validation rules, and approval workflows from the genome."
            ),
            "output_structure": {
                "folders": ["Genome Transformations/replit-app"],
                "files": ["master_prompt.md", "catalog_summary.json", ".replit"],
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
