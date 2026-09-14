import urllib.request, json

req = urllib.request.Request('http://localhost:8000/api/v1/conversations', method='POST', headers={'Content-Type': 'application/json'}, data=json.dumps({"title":"Smoke Test Chat"}).encode('utf-8'))
res = urllib.request.urlopen(req).read().decode()
print("Conversation:", res)
conv_id = json.loads(res)['id']

req2 = urllib.request.Request('http://localhost:8000/api/v1/chat', method='POST', headers={'Content-Type': 'application/json'}, data=json.dumps({"query":"Привет! Что ты знаешь о Git Flow?", "conversation_id": conv_id, "stream":False, "chat_mode": "vault"}).encode('utf-8'))
res2 = urllib.request.urlopen(req2).read().decode()
print("Message:", res2)
