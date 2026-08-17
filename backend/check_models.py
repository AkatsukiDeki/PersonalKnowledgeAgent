from google import genai
import os
from dotenv import load_dotenv

load_dotenv()

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

print("Список доступных моделей:")
for model in client.models.list():
    if "generateContent" in (model.supported_actions or []):
        print(f" - {model.name}")