"""Auto-seed demo tenant with integrations, skills, and a use case."""

import uuid

from models import (
    Integration,
    Skill,
    Tenant,
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
        for i in range(len(skill_defs))
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

    print("[demo_setup] Seeded 'acme' tenant with ServiceNow integration, 4 skills, and 1 use case")
