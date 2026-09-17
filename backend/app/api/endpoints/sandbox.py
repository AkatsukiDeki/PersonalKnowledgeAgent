import time
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.services.sandbox_service import PolyglotSandbox

router = APIRouter()

class CodeRunRequest(BaseModel):
    code: str
    language: Optional[str] = "python"
    stdin: Optional[str] = ""

class CodeRunResponse(BaseModel):
    stdout: str
    stderr: str
    exit_code: int
    execution_time_ms: float

@router.post("/run", response_model=CodeRunResponse)
@router.post("/execute", response_model=CodeRunResponse)
async def run_sandbox_code(request: CodeRunRequest):
    if not request.code or not request.code.strip():
        raise HTTPException(status_code=400, detail="Code cannot be empty")

    start_time = time.perf_counter()
    lang = (request.language or "python").lower().strip()

    result = await PolyglotSandbox.execute(
        language=lang,
        code=request.code
    )

    elapsed_ms = (time.perf_counter() - start_time) * 1000.0

    return CodeRunResponse(
        stdout=result.get("stdout", ""),
        stderr=result.get("stderr", ""),
        exit_code=result.get("exit_code", 0),
        execution_time_ms=round(elapsed_ms, 2)
    )
