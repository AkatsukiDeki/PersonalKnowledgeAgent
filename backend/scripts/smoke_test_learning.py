import asyncio
import httpx

async def main():
    async with httpx.AsyncClient(base_url="http://localhost:8000/api/v1") as client:
        print("1. Generating Roadmap for folder 'DevOps'")
        payload = {
            "scope": {
                "folder": "DevOps",
                "recursive": True
            },
            "target_role": "DevOps Engineer",
            "target_goal": "Understand CI/CD and Kubernetes"
        }
        resp = await client.post("/learning/roadmap", json=payload, timeout=60.0)
        
        if resp.status_code == 400:
            print("No claims/chunks found. Expected if DB is empty for this folder.")
            print(resp.json())
            return
            
        resp.raise_for_status()
        roadmap = resp.json()
        print(f"Roadmap generated: {roadmap['title']} with {len(roadmap['modules'])} modules.")
        
        if not roadmap['modules']:
            print("No modules generated!")
            return
            
        first_module = roadmap['modules'][0]
        if not first_module['topics']:
            print("No topics generated!")
            return
            
        first_topic = first_module['topics'][0]
        
        print(f"\n2. Generating Study Note for topic '{first_topic['title']}'")
        note_payload = {
            "roadmap_payload": roadmap,
            "module_id": first_module['id'],
            "topic_id": first_topic['id'],
            "scope": payload['scope']
        }
        
        note_resp = await client.post("/learning/generate-note", json=note_payload, timeout=60.0)
        note_resp.raise_for_status()
        note = note_resp.json()
        
        print(f"Study Note Generated: {note['title']}")
        print(f"Insufficient Evidence: {note['insufficient_evidence']}")
        if note['evidence_warning']:
            print(f"Warning: {note['evidence_warning']}")
        print("Citations:", len(note['citations']))
        print("Note length:", len(note['markdown']))

if __name__ == "__main__":
    asyncio.run(main())
