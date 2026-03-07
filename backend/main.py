import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from bootstrap.demo_setup import seed_demo_data
from routers import actions_router, admin_router, agent_router, integrations_router, llm_configs_router, llm_usage_router, runs_router, skills_router, tenants_router, tools_router, uc_runs_router, use_cases_router
from store import (
    InMemoryActionStore,
    InMemoryAgentUIRunEventStore,
    InMemoryAgentUIRunStore,
    InMemoryClassificationSchemaStore,
    InMemoryEventStore,
    InMemoryFeedbackStore,
    InMemoryGoogleDriveConfigStore,
    InMemoryIntegrationStore,
    InMemoryLLMConfigStore,
    InMemoryLLMUsageStore,
    InMemoryMetricsEventStore,
    InMemoryReplitConfigStore,
    InMemoryRunStore,
    InMemoryServiceNowConfigStore,
    InMemorySkillStore,
    InMemoryTelemetryStore,
    InMemoryTenantLLMAssignmentStore,
    InMemoryTenantStore,
    InMemoryUseCaseRunStore,
    InMemoryUseCaseStore,
)

@asynccontextmanager
async def lifespan(app: FastAPI):
    await seed_demo_data(app)
    yield


app = FastAPI(title="Context Agents API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory stores — swap these for Postgres-backed implementations later
app.state.tenant_store = InMemoryTenantStore()
app.state.schema_store = InMemoryClassificationSchemaStore()
app.state.drive_config_store = InMemoryGoogleDriveConfigStore()
app.state.snow_config_store = InMemoryServiceNowConfigStore()
app.state.replit_config_store = InMemoryReplitConfigStore()
app.state.llm_config_store = InMemoryLLMConfigStore()
app.state.llm_assignment_store = InMemoryTenantLLMAssignmentStore()
app.state.run_store = InMemoryRunStore()
app.state.event_store = InMemoryEventStore()
app.state.feedback_store = InMemoryFeedbackStore()
app.state.metrics_event_store = InMemoryMetricsEventStore()
app.state.telemetry_store = InMemoryTelemetryStore()
app.state.integration_store = InMemoryIntegrationStore()
app.state.skill_store = InMemorySkillStore()
app.state.use_case_store = InMemoryUseCaseStore()
app.state.use_case_run_store = InMemoryUseCaseRunStore()
app.state.agent_ui_run_store = InMemoryAgentUIRunStore()
app.state.agent_ui_run_event_store = InMemoryAgentUIRunEventStore()
app.state.action_store = InMemoryActionStore()
app.state.llm_usage_store = InMemoryLLMUsageStore()

app.include_router(tenants_router)
app.include_router(admin_router)
app.include_router(actions_router)
app.include_router(agent_router)
app.include_router(integrations_router)
app.include_router(tools_router)
app.include_router(skills_router)
app.include_router(use_cases_router)
app.include_router(llm_configs_router)
app.include_router(llm_usage_router)
app.include_router(runs_router)
app.include_router(uc_runs_router)

_pdf_dir = os.path.join(os.path.dirname(__file__), "generated_pdfs")
os.makedirs(_pdf_dir, exist_ok=True)


@app.get("/api/admin/{tenant_id}/reports/{filename}")
async def download_report(tenant_id: str, filename: str):
    path = os.path.join(_pdf_dir, os.path.basename(filename))
    if not os.path.isfile(path):
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Report not found")
    return FileResponse(path, media_type="application/pdf", filename=filename)
