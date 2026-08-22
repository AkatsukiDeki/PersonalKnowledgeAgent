import httpx
import asyncio
import traceback

async def run():
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post('http://localhost:8000/api/v1/chat', json={'query': 'DevOps', 'history': [], 'conversation_id': None})
            print(f"Status: {resp.status_code}")
            print(f"Text: {resp.text}")
            resp.raise_for_status()
    except Exception as e:
        print(f"Repr: {repr(e)}")
        traceback.print_exc()

asyncio.run(run())
