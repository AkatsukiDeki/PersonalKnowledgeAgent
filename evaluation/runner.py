import asyncio
import yaml
import json
import httpx
from datetime import datetime, timezone
import os

async def run_evaluation():
    dataset_path = os.path.join("evaluation", "dataset", "questions.yaml")
    results_path = os.path.join("evaluation", "benchmark_results.json")
    
    with open(dataset_path, "r", encoding="utf-8") as f:
        suite = yaml.safe_load(f)

    results = []
    print(f"Starting evaluation of {len(suite)} questions...")
    
    async with httpx.AsyncClient(base_url="http://localhost:8001", timeout=600.0) as client:
        for test in suite:
            print(f"Running {test['id']} ({test['category']})...")
            start_t = datetime.now(timezone.utc)
            
            payload = {
                "query": test["query"],
                "history": [],
                "conversation_id": None
            }
            
            try:
                resp = await client.post("/api/v1/chat", json=payload)
                resp.raise_for_status()
                data = resp.json()
                
                latency = (datetime.now(timezone.utc) - start_t).total_seconds() * 1000
                metrics = data.get("metrics") or {}
                answer = data.get("answer", "")
                
                trace = {
                    "id": test["id"],
                    "category": test["category"],
                    "query": test["query"],
                    "answer": answer,
                    "latency_ms": latency,
                    "l1_count": metrics.get("l1_count", 0),
                    "l2_count": metrics.get("l2_count", 0),
                    "l3_count": metrics.get("l3_count", 0),
                    "l4_count": metrics.get("l4_count", 0),
                    "graph_hops": metrics.get("graph_hops", 0),
                    "evidence_gate_passed": "INSUFFICIENT_DATA" not in answer,
                    "intent": metrics.get("intent", "UNKNOWN")
                }
                
                results.append(trace)
                print(f"  -> Done in {latency:.0f}ms. Intent: {trace['intent']}, Gate Passed: {trace['evidence_gate_passed']}")
            except Exception as e:
                print(f"  -> Error: {repr(e)}")
                results.append({
                    "id": test["id"],
                    "category": test["category"],
                    "query": test["query"],
                    "error": repr(e)
                })

    with open(results_path, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
        
    print(f"Evaluation complete. Results saved to {results_path}")

if __name__ == "__main__":
    asyncio.run(run_evaluation())
