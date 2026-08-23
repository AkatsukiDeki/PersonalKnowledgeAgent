import urllib.request
import json
import os

req = urllib.request.Request("http://localhost:8000/api/v1/subjects")
# The frontend uses VITE_PKA_API_KEY, let's try without it first or check if the backend requires it.
# The user might have set it in .env, let's read it from there.
from dotenv import load_dotenv
load_dotenv(".env")
api_key = os.environ.get("PKA_API_KEY", "")
if api_key:
    req.add_header("X-API-Key", api_key)

try:
    with urllib.request.urlopen(req) as response:
        data = response.read().decode('utf-8')
        subjects = json.loads(data)
        print(f"Status: {response.status}")
        print(f"Subjects returned: {len(subjects)}")
except Exception as e:
    print(f"Error: {e}")
