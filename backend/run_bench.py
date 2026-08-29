import httpx
import asyncio
import subprocess
import time
import os

async def main():
    queries = [
        "Напиши Python функцию для бинарного поиска с аннотацией типов",
        "Какие ключевые архитектурные решения приняты в проекте PKA?",
        "Объясни, как работает алгоритм Дейкстры и где его слабые места",
        "Сравни архитектуру RAG на базе pgvector с графовым подходом Neo4j"
    ]
    
    print("Starting backend on port 8008...")
    cwd = r"c:\Users\Andrey\PycharmProjects\PKA\backend"
    
    # Start backend
    proc = subprocess.Popen(
        ["uvicorn", "app.main:app", "--port", "8008"], 
        cwd=cwd, 
        stderr=subprocess.PIPE, 
        stdout=subprocess.PIPE, 
        text=True,
        encoding='utf-8',
        errors='replace'
    )
    
    # Wait for warmup (models loading)
    print("Waiting 15 seconds for startup and warmup...")
    time.sleep(15)
    
    async with httpx.AsyncClient(timeout=120) as client:
        for i, q in enumerate(queries):
            print(f"\n--- Running Test {i+1} ---")
            print(f"Query: {q}")
            try:
                resp = await client.post("http://127.0.0.1:8008/api/v1/chat/stream", json={"query": q, "history": []})
                
                # Consume stream
                async for chunk in resp.aiter_text():
                    pass
                print(f"Test {i+1} completed.")
            except Exception as e:
                print(f"Test {i+1} failed: {e}")
            
    print("\nTerminating backend...")
    proc.terminate()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()
    
    print("\n=== LATENCY PROFILES ===")
    out, err = proc.communicate()
    
    for line in err.splitlines():
        if "Latency Profile" in line:
            print(line.strip())
            
    for line in out.splitlines():
        if "Latency Profile" in line:
            print(line.strip())

if __name__ == "__main__":
    asyncio.run(main())
