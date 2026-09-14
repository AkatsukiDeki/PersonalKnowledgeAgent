import urllib.request, json
try:
    req = urllib.request.Request('http://localhost:8000/api/v1/media/b83f5927-f4dd-48b4-ac28-e46573d3a52c/retranscribe', method='POST', headers={'Content-Type': 'application/json'}, data=json.dumps({'language':'en','enable_demucs':False}).encode('utf-8'))
    print(urllib.request.urlopen(req).read().decode())
except Exception as e:
    print("error", e)
