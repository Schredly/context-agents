import uuid

from fastapi import APIRouter, HTTPException, Request

from models import CreateLLMConfigRequest, LLMConfig, TestLLMConfigRequest, UpdateLLMConfigRequest
from services.claude_client import ClaudeClientError, test_api_key

router = APIRouter(prefix="/api/llm-configs", tags=["llm-configs"])

KNOWN_LLM_PROVIDERS = {
    "anthropic": {
        "name": "Anthropic (Claude)",
        "models": [
            {"id": "claude-sonnet-4-20250514", "name": "Claude Sonnet 4"},
            {"id": "claude-haiku-3-20250414", "name": "Claude Haiku 3"},
        ],
    },
    "openai": {
        "name": "OpenAI",
        "models": [
            {"id": "o3", "name": "o3"},
            {"id": "o3-mini", "name": "o3 Mini"},
            {"id": "o3-pro", "name": "o3 Pro"},
            {"id": "o4-mini", "name": "o4 Mini"},
            {"id": "gpt-5", "name": "GPT-5"},
            {"id": "gpt-4o", "name": "GPT-4o"},
            {"id": "gpt-4o-mini", "name": "GPT-4o Mini"},
        ],
    },
}


@router.get("/providers")
async def get_providers():
    return KNOWN_LLM_PROVIDERS


@router.get("")
async def list_llm_configs(request: Request):
    return await request.app.state.llm_config_store.list_all()


@router.post("", status_code=201)
async def create_llm_config(body: CreateLLMConfigRequest, request: Request):
    config = LLMConfig(
        id=f"llm_{uuid.uuid4().hex[:12]}",
        label=body.label,
        provider=body.provider,
        api_key=body.api_key,
        model=body.model,
        input_token_cost=body.input_token_cost,
        output_token_cost=body.output_token_cost,
    )
    return await request.app.state.llm_config_store.create(config)


@router.put("/{config_id}")
async def update_llm_config(config_id: str, body: UpdateLLMConfigRequest, request: Request):
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    updated = await request.app.state.llm_config_store.update(config_id, **updates)
    if updated is None:
        raise HTTPException(status_code=404, detail="LLM config not found")
    return updated


@router.delete("/{config_id}")
async def delete_llm_config(config_id: str, request: Request):
    deleted = await request.app.state.llm_config_store.delete(config_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="LLM config not found")
    return {"ok": True}


@router.post("/test")
async def test_llm_config(body: TestLLMConfigRequest):
    try:
        await test_api_key(body.provider, body.api_key, body.model)
    except ClaudeClientError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"ok": True}
