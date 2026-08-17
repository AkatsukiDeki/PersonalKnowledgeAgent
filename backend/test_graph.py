import asyncio, httpx
async def test():
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get('http://localhost:8000/api/v1/graph/topology')
            print('Status:', r.status_code)
            if r.status_code == 200:
                print('Nodes:', len(r.json().get('nodes', [])))
            else:
                print('Error:', r.text)
    except Exception as e:
        print('Error:', e)
asyncio.run(test())
