import requests
import json

payload = {
    "query": "Какие общие принципы объединяют мои тренировки и программирование?",
    "history": []
}

r = requests.post("http://localhost:8000/api/v1/chat/", json=payload)
print(r.status_code)
print(json.dumps(r.json(), ensure_ascii=False, indent=2))
