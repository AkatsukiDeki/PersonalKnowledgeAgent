import os
from dotenv import load_dotenv

load_dotenv()

TG_BOT_TOKEN = os.getenv("TG_BOT_TOKEN")
if not TG_BOT_TOKEN:
    raise ValueError("TG_BOT_TOKEN is not set")

ALLOWED_USERS_STR = os.getenv("TG_ALLOWED_USERS", "")
ALLOWED_USERS = set()
for uid in ALLOWED_USERS_STR.split(","):
    if uid.strip().isdigit():
        ALLOWED_USERS.add(int(uid.strip()))

BACKEND_API_URL = os.getenv("BACKEND_API_URL", "http://backend:8000/api/v1")
WEBAPP_URL = os.getenv("WEBAPP_URL", "https://headed-construct-present-firm.trycloudflare.com")
REDIS_URL = os.getenv("BOT_REDIS_URL", "redis://redis:6379/1")
