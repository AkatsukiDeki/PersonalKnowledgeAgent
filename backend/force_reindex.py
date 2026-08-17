import httpx
import asyncio

async def reindex():
    async with httpx.AsyncClient(timeout=None) as client:
        r = await client.get("http://localhost:8000/api/v1/sources/")
        sources = r.json()
        for s in sources:
            body = {
                "title": s["title"],
                "raw_content": s["content"],
                "domain": s.get("domain", "personal"),
                "source_kind": "manual"
            }
            res = await client.put(f"http://localhost:8000/api/v1/sources/{s['id']}", json=body)
            print(f"Reindexed {s['title']}: {res.status_code}")
            if res.status_code != 200:
                print(res.text)

if __name__ == "__main__":
    asyncio.run(reindex())
