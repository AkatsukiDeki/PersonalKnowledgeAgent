import httpx
import logging
import asyncio
from core.config import BACKEND_API_URL

logger = logging.getLogger(__name__)

async def get_user_scope(user_id: int) -> str | None:
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{BACKEND_API_URL}/auth/bot/scope/{user_id}")
            if resp.status_code == 200:
                return resp.json().get("folder_name")
    except Exception as e:
        logger.error(f"Failed to fetch user scope: {e}")
    return None

async def set_user_scope(user_id: int, folder_name: str | None):
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(f"{BACKEND_API_URL}/auth/bot/scope", json={"user_id": user_id, "folder_name": folder_name})
    except Exception as e:
        logger.error(f"Failed to set user scope: {e}")

async def get_folders_tree():
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{BACKEND_API_URL}/sources/folders/tree")
            if resp.status_code == 200:
                return resp.json().get("children", {})
    except Exception as e:
        logger.error(f"Failed to fetch folders: {e}")
    return {}

async def create_folder(folder_name: str) -> bool:
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                f"{BACKEND_API_URL}/subjects", 
                json={"title": folder_name, "description": ""}
            )
            return resp.status_code in (200, 201)
    except Exception as e:
        logger.error(f"Failed to create folder: {e}")
    return False

async def send_chat_message(query: str, conv_id: str, scope: str | None = None) -> dict:
    try:
        payload = {
            "query": query,
            "conversation_id": conv_id,
            "chat_mode": "vault",
            "use_reasoning": False
        }
        if scope:
            payload["scope_folder"] = scope
            
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(f"{BACKEND_API_URL}/chat", json=payload)
            resp.raise_for_status()
            return resp.json()
    except Exception as e:
        logger.error(f"Error in chat message: {e}")
        raise e

async def poll_task_status(task_id: str, max_retries: int = 120, delay: float = 3.0) -> dict:
    """Опрашивает статус задачи до завершения или ошибки."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        for _ in range(max_retries):
            try:
                resp = await client.get(f"{BACKEND_API_URL}/sources/tasks/{task_id}")
                if resp.status_code == 200:
                    data = resp.json()
                    status = data.get("status")
                    if status in ("completed", "failed"):
                        return data
                elif resp.status_code == 404:
                    return {"status": "failed", "error": "Task not found"}
            except Exception as e:
                logger.warning(f"Poll error for {task_id}: {e}")
            await asyncio.sleep(delay)
    return {"status": "failed", "error": "Polling timeout"}

async def upload_file(file_name: str, file_bytes: bytes, mime_type: str, folder_name: str, is_voice: bool = False) -> str:
    """Загружает файл на бэкенд и возвращает task_id (202 Accepted)."""
    async with httpx.AsyncClient(timeout=60.0) as client:
        files = {"file": (file_name, file_bytes, mime_type)}
        data = {}
        if folder_name and folder_name != "none":
            data["folder"] = folder_name
            
        url = f"{BACKEND_API_URL}/sources" # Используем переписанный /sources
        
        resp = await client.post(url, files=files, data=data)
        resp.raise_for_status()
        
        result = resp.json()
        return result.get("task_id")
