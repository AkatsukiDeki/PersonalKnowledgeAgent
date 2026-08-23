import urllib.request

req = urllib.request.Request("http://localhost:8000/api/v1/health")
try:
    with urllib.request.urlopen(req, timeout=5) as response:
        print(f"Health: {response.status}")
except Exception as e:
    print(f"Health error: {e}")

req = urllib.request.Request("http://localhost:8000/api/v1/conversations")
try:
    with urllib.request.urlopen(req, timeout=5) as response:
        print(f"Conversations: {response.status}")
except Exception as e:
    print(f"Conversations error: {e}")
