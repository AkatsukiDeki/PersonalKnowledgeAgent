import asyncio, httpx
async def test():
    try:
        async with httpx.AsyncClient() as client:
            r = await client.post('http://localhost:11434/api/generate', json={'model': 'qwen2.5-coder:14b', 'prompt': 'ping', 'stream': False})
            print('Ollama status:', r.status_code)
            print('Ollama response:', r.text[:200])
    except Exception as e:
        print('Error:', e)
asyncio.run(test())
