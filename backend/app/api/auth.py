from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
import urllib.parse
import hmac
import hashlib
import os
import json
import time

router = APIRouter(prefix="/auth", tags=["auth"])

class TelegramInitData(BaseModel):
    initData: str

class ScopePayload(BaseModel):
    user_id: int
    folder_name: str | None = None

@router.post("/telegram")
async def verify_telegram_init_data(data: TelegramInitData):
    """
    Verify Telegram Web App initData using HMAC-SHA256 and TG_BOT_TOKEN.
    """
    bot_token = os.getenv("TG_BOT_TOKEN")
    if not bot_token:
        raise HTTPException(status_code=500, detail="TG_BOT_TOKEN not configured")
        
    init_data = data.initData
    
    try:
        # Parse the initData string
        parsed_data = urllib.parse.parse_qsl(init_data)
        data_dict = dict(parsed_data)
        
        if "hash" not in data_dict:
            raise HTTPException(status_code=400, detail="Hash is missing")
            
        received_hash = data_dict.pop("hash")
        
        # Sort the key-value pairs alphabetically by key
        sorted_items = sorted(data_dict.items(), key=lambda x: x[0])
        
        # Format: key=<value>\nkey=<value>
        data_check_string = "\n".join([f"{k}={v}" for k, v in sorted_items])
        
        # Create secret key: HMAC-SHA256 of the bot token using "WebAppData" as key
        secret_key = hmac.new(b"WebAppData", bot_token.encode("utf-8"), hashlib.sha256).digest()
        
        # Create signature: HMAC-SHA256 of data_check_string using the secret key
        calculated_hash = hmac.new(secret_key, data_check_string.encode("utf-8"), hashlib.sha256).hexdigest()
        
        if calculated_hash != received_hash:
            raise HTTPException(status_code=403, detail="Invalid signature")
            
        # Verify auth_date to prevent replay attacks
        auth_date_str = data_dict.get("auth_date")
        if not auth_date_str:
            raise HTTPException(status_code=400, detail="Auth date missing")
            
        auth_date = int(auth_date_str)
        current_time = int(time.time())
        # Reject if older than 24 hours (86400 seconds)
        if current_time - auth_date > 86400:
            raise HTTPException(status_code=403, detail="Session expired")
            
        # Parse user info
        user_str = data_dict.get("user")
        if not user_str:
            raise HTTPException(status_code=400, detail="User data missing")
            
        user = json.loads(user_str)
        
        # Assuming you'd generate a JWT here. For now, returning success.
        # In a real app, you would sign a JWT token and return it.
        return {
            "status": "success", 
            "user": user,
            "token": "dummy-jwt-token" # Replace with real JWT logic
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

from arq import ArqRedis
from ..core.redis import get_redis_pool

@router.post("/bot/scope")
async def set_bot_scope(payload: ScopePayload, redis: ArqRedis = Depends(get_redis_pool)):
    if not payload.user_id:
        raise HTTPException(status_code=400, detail="Missing user_id")
    
    key = f"bot:scope:{payload.user_id}"
    if payload.folder_name:
        await redis.set(key, payload.folder_name)
    else:
        await redis.delete(key)
    return {"status": "ok", "scope": payload.folder_name}

@router.get("/bot/scope/{user_id}")
async def get_bot_scope(user_id: int, redis: ArqRedis = Depends(get_redis_pool)):
    val = await redis.get(f"bot:scope:{user_id}")
    return {"folder_name": val.decode("utf-8") if val else None}
