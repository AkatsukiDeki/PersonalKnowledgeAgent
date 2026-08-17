import httpx
import asyncio

async def reindex_all():
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get("http://localhost:8000/api/v1/sources/")
        sources = r.json()
        print(f"Found {len(sources)} sources")
        for s in sources:
            body = {
                "raw_content": s["raw_content"] or s["content"],
                "domain": s["domain"],
            }
            res = await client.put(f"http://localhost:8000/api/v1/sources/{s['id']}", json=body)
            print(f"Triggered reindex for: {s['title']} -> {res.status_code}")

if __name__ == "__main__":
    asyncio.run(reindex_all())
