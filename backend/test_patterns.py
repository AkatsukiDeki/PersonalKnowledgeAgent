import requests
r = requests.get('http://localhost:8000/api/v1/patterns/')
print(r.json())
