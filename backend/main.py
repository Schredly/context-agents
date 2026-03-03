from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import admin_router, runs_router, tenants_router
from store import (
    InMemoryClassificationSchemaStore,
    InMemoryEventStore,
    InMemoryFeedbackStore,
    InMemoryGoogleDriveConfigStore,
    InMemoryMetricsEventStore,
    InMemoryRunStore,
    InMemoryServiceNowConfigStore,
    InMemoryTelemetryStore,
    InMemoryTenantStore,
)

app = FastAPI(title="Context Agents API")

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
app.state.run_store = InMemoryRunStore()
app.state.event_store = InMemoryEventStore()
app.state.feedback_store = InMemoryFeedbackStore()
app.state.metrics_event_store = InMemoryMetricsEventStore()
app.state.telemetry_store = InMemoryTelemetryStore()

app.include_router(tenants_router)
app.include_router(admin_router)
app.include_router(runs_router)
