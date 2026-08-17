import urllib.request
import urllib.error

try:
    req = urllib.request.Request("http://127.0.0.1:8000/api/v1/insights/generate", method="POST")
    with urllib.request.urlopen(req) as response:
        print("Status:", response.status)
        print("Body:", response.read().decode())
except urllib.error.HTTPError as e:
    print("HTTP Error:", e.code, e.reason)
except Exception as e:
    print("Error:", e)
