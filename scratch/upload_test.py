import requests
import json

url = 'http://localhost:8000/api/v1/media/upload'
with open('БД.mp4', 'rb') as f:
    files = {'file': ('БД.mp4', f, 'video/mp4')}
    data = {'fast_mode': 'false'}
    print(f"Uploading БД.mp4 to {url}...")
    res = requests.post(url, files=files, data=data)
    print("Status:", res.status_code)
    try:
        print(json.dumps(res.json(), indent=2))
    except Exception as e:
        print(res.text)
