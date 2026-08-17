import httpx
import asyncio
import sys

async def upload_vault():
    url = "http://localhost:8000/api/v1/connectors/obsidian/import"
    file_path = "test_vault.zip"
    
    with open(file_path, "rb") as f:
        files = {"file": ("test_vault.zip", f, "application/zip")}
        data = {"vault_name": "Test Vault"}
        
        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(url, files=files, data=data, timeout=30.0)
                print(f"Status Code: {response.status_code}")
                print(f"Response: {response.text}")
                
                if response.status_code == 200:
                    job_id = response.json()["id"]
                    print(f"\nImport started! Job ID: {job_id}")
                    
                    # Poll for status
                    while True:
                        status_url = f"http://localhost:8000/api/v1/connectors/obsidian/import/{job_id}"
                        status_resp = await client.get(status_url)
                        status_data = status_resp.json()
                        print(f"[{status_data['status']}] Processed {status_data['processed_files']}/{status_data['total_files']} files...")
                        
                        if status_data['status'] in ['completed', 'failed']:
                            break
                        await asyncio.sleep(2)
            except Exception as e:
                print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(upload_vault())
