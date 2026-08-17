import httpx
import asyncio
import time

API_URL = "http://127.0.0.1:8000/api/v1"

async def main():
    async with httpx.AsyncClient() as client:
        # 1. Post Source 1
        print("Posting Source 1: Django...")
        res = await client.post(f"{API_URL}/sources/", json={
            "title": "Выбор стека для бэкенда",
            "content": "Для всех своих веб-проектов и API я использую исключительно Django и Django REST Framework.",
            "source_type": "note"
        })
        res.raise_for_status()
        s1 = res.json()
        print(f"Source 1 created: {s1['id']}")
        
        # Wait for ingestion to finish (it runs in background)
        print("Waiting for ingestion of Source 1...")
        await asyncio.sleep(15) 
        
        # 2. Post Source 2
        print("Posting Source 2: FastAPI...")
        res = await client.post(f"{API_URL}/sources/", json={
            "title": "Миграция на современные асинхронные фреймворки",
            "content": "Полностью отказался от Django в новых сервисах и перевел разработку микросервисов и пет-проектов на FastAPI.",
            "source_type": "note"
        })
        res.raise_for_status()
        s2 = res.json()
        print(f"Source 2 created: {s2['id']}")
        
        # Wait for ingestion to finish
        print("Waiting for ingestion of Source 2...")
        await asyncio.sleep(25)
        
        # 3. Check claims
        print("Fetching claims...")
        res = await client.get(f"{API_URL}/claims/?include_history=true")
        claims = res.json()
        for c in claims:
            print(f"Claim: {c['content']} | Active: {c['is_active']} | Superseded by: {c.get('superseded_by')}")
            
        # 4. RAG Chat 1 (Current)
        print("\nTesting RAG Chat (Current state)...")
        res = await client.post(f"{API_URL}/chat/", json={
            "query": "Какой фреймворк я использую для бэкенда новых проектов?",
            "history": []
        })
        if res.status_code != 200:
            print(f"Error {res.status_code}: {res.text}")
        else:
            print(f"Response: {res.json().get('answer', res.text)}")
        
        # 5. RAG Chat 2 (History)
        print("\nTesting RAG Chat (Historical state)...")
        res = await client.post(f"{API_URL}/chat/", json={
            "query": "Как со временем менялся мой выбор фреймворков для бэкенда?",
            "history": []
        })
        if res.status_code != 200:
            print(f"Error {res.status_code}: {res.text}")
        else:
            print(f"Response: {res.json().get('answer', res.text)}")

if __name__ == "__main__":
    asyncio.run(main())
