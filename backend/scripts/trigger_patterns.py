import requests

r = requests.post('http://localhost:8000/api/v1/patterns/discover')
print(r.status_code)
print(r.json())
