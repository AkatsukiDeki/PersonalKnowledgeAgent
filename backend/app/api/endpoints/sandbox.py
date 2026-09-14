from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from ...sandbox.runner import sandbox_runner

router = APIRouter()

class CodeRunRequest(BaseModel):
    code: str

class CodeRunResponse(BaseModel):
    stdout: str
    stderr: str
    exit_code: int
    execution_time_ms: float

@router.post("/run", response_model=CodeRunResponse)
async def run_sandbox_code(request: CodeRunRequest):
    if not request.code or not request.code.strip():
        raise HTTPException(status_code=400, detail="Code cannot be empty")
        
    result = await sandbox_runner.run_python_detailed(request.code)
    
    return CodeRunResponse(
        stdout=result.get("stdout", ""),
        stderr=result.get("stderr", ""),
        exit_code=result.get("exit_code", -1),
        execution_time_ms=result.get("execution_time_ms", 0.0)
    )
