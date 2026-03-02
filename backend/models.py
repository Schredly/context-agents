from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from pydantic import BaseModel, Field


# --- Domain models ---


class Tenant(BaseModel):
    id: str
    name: str
    status: str = "draft"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    shared_secret: Optional[str] = None


class ClassificationNodeModel(BaseModel):
    name: str
    children: list[ClassificationNodeModel] = Field(default_factory=list)


class ClassificationSchema(BaseModel):
    tenant_id: str
    schema_tree: list[ClassificationNodeModel] = Field(default_factory=list)
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    version: int = 1


class GoogleDriveConfig(BaseModel):
    tenant_id: str
    root_folder_id: str
    folder_name: Optional[str] = None
    scaffolded: bool = False
    scaffolded_at: Optional[datetime] = None
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# --- Request models ---


class CreateTenantRequest(BaseModel):
    name: str


class PutSchemaRequest(BaseModel):
    schema_tree: list[ClassificationNodeModel]


class PutDriveConfigRequest(BaseModel):
    root_folder_id: str
    folder_name: Optional[str] = None


class ScaffoldResultRequest(BaseModel):
    scaffolded: bool
    scaffolded_at: Optional[datetime] = None
    root_folder_id: str
    folder_name: Optional[str] = None


# --- Response models ---


class ActivateResponse(BaseModel):
    tenant_id: str
    shared_secret: str
    instructions_stub: str
