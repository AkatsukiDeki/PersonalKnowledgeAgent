import subprocess
import time
import requests
import json
import os
import sys

def kill_processes():
    subprocess.run(["taskkill", "/F", "/IM", "uvicorn.exe"], capture_output=True)
    subprocess.run(["taskkill", "/F", "/IM", "ollama.exe"], capture_output=True)
    # also kill python.exe running uvicorn if any
    # Actually, we can just kill processes listening on port 8000 using netstat, but simpler:
    pass

print("Killing existing processes...")
kill_processes()
time.sleep(2)

env = os.environ.copy()
env['OLLAMA_KEEP_ALIVE'] = '-1'
env['OLLAMA_MAX_LOADED_MODELS'] = '2'

print("Starting ollama serve...")
ollama_proc = subprocess.Popen(["ollama", "serve"], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(3)

print("Starting uvicorn...")
uvicorn_log = open("uvicorn_bench.log", "w", encoding="utf-8")
python_path = r"C:\Users\Andrey\PycharmProjects\PKA\venv\Scripts\python.exe"
uvicorn_proc = subprocess.Popen(
    [python_path, "-m", "uvicorn", "app.main:app", "--port", "8000"],
    env=env,
    stdout=uvicorn_log,
    stderr=subprocess.STDOUT,
    cwd=r"c:\Users\Andrey\PycharmProjects\PKA\backend"
)

# wait for uvicorn to start
print("Waiting for backend to start...")
for _ in range(20):
    try:
        if requests.get("http://127.0.0.1:8000/api/v1/health").status_code == 200:
            break
    except Exception:
        pass
    time.sleep(1)

print("Backend is up. Running Cold Test...")
payload = {
    "query": "Какие ключевые архитектурные решения приняты в проекте PKA?",
    "history": [],
    "mode": "rag"
}

try:
    resp1 = requests.post("http://127.0.0.1:8000/api/v1/chat/stream", json=payload, stream=True)
    for line in resp1.iter_lines():
        if line:
            # decode event stream just to consume it
            pass
    print("Cold Test finished.")
except Exception as e:
    print("Cold test error:", e)

print("Waiting 5 seconds...")
time.sleep(5)

print("Running Warm Test...")
try:
    resp2 = requests.post("http://127.0.0.1:8000/api/v1/chat/stream", json=payload, stream=True)
    for line in resp2.iter_lines():
        pass
    print("Warm Test finished.")
except Exception as e:
    print("Warm test error:", e)

print("Stopping processes...")
uvicorn_proc.kill()
ollama_proc.kill()
uvicorn_log.close()
kill_processes()

print("Log results:")
with open("uvicorn_bench.log", "r", encoding="utf-8") as f:
    for line in f:
        if "Latency Profile" in line:
            print(line.strip())
