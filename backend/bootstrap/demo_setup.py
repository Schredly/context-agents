"""Auto-seed demo tenant with integrations, skills, and a use case."""

import uuid

from models import (
    Action,
    ActionParameter,
    ActionRule,
    Integration,
    LLMConfig,
    Skill,
    Tenant,
    TenantLLMAssignment,
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
                    value="https://dev221705.service-now.com/api/1939459/catalogunderstandingservice/loveboat/2ab7077237153000158bbfc8bcbe5da9"),
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

    print(f"[demo_setup] Seeded 'acme' tenant with ServiceNow + Replit integrations, 5 skills, 2 use cases, {len(action_defs)} actions")
