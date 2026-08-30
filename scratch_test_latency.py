import httpx
import asyncio
import json

async def run_test():
    url = "http://localhost:8000/api/chat/stream"
    payload = {
        "query": "Расскажи, что такое инварианты системы и зачем они нужны?",
        "mode": "vault"
    }
    
    print("--- COLD RUN ---")
    async with httpx.AsyncClient(timeout=300.0) as client:
        try:
            async with client.stream("POST", url, json=payload) as response:
                print(f"Status: {response.status_code}")
                async for chunk in response.aiter_text():
                    pass # Just consume the stream
            print("Cold run finished.")
        except Exception as e:
            print(f"Cold run failed: {e}")
            
    print("\n--- WARM RUN ---")
    payload["query"] = "А как это связано с паттернами?"
    async with httpx.AsyncClient(timeout=300.0) as client:
        try:
            async with client.stream("POST", url, json=payload) as response:
                print(f"Status: {response.status_code}")
                async for chunk in response.aiter_text():
                    pass 
            print("Warm run finished.")
        except Exception as e:
            print(f"Warm run failed: {e}")

if __name__ == "__main__":
    asyncio.run(run_test())
