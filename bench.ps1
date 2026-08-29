$env:OLLAMA_KEEP_ALIVE="-1"
$env:OLLAMA_MAX_LOADED_MODELS="2"

Write-Host "Killing processes..."
Stop-Process -Name "ollama" -Force -ErrorAction SilentlyContinue
$pid8000 = (Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue).OwningProcess
if ($pid8000) { Stop-Process -Id $pid8000 -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 2

Write-Host "Starting Ollama..."
Start-Process -FilePath "ollama" -ArgumentList "serve" -WindowStyle Hidden

Write-Host "Starting Backend..."
cd c:\Users\Andrey\PycharmProjects\PKA\backend
Start-Process -FilePath "C:\Users\Andrey\PycharmProjects\PKA\venv\Scripts\python.exe" -ArgumentList "-m uvicorn app.main:app --port 8000" -RedirectStandardOutput uvicorn_bench.log -RedirectStandardError uvicorn_bench.log -WindowStyle Hidden

Write-Host "Waiting for backend to start..."
Start-Sleep -Seconds 10

Write-Host "Running Cold Test..."
$body = @{
    query = "Какие ключевые архитектурные решения приняты в проекте PKA?"
    history = @()
    mode = "rag"
} | ConvertTo-Json -Depth 10

Invoke-RestMethod -Uri "http://127.0.0.1:8000/api/v1/chat/stream" -Method Post -Body $body -ContentType "application/json" | Out-Null

Write-Host "Waiting 5 seconds..."
Start-Sleep -Seconds 5

Write-Host "Running Warm Test..."
Invoke-RestMethod -Uri "http://127.0.0.1:8000/api/v1/chat/stream" -Method Post -Body $body -ContentType "application/json" | Out-Null

Write-Host "Done. Extracting Latency Profile from logs:"
Select-String -Path "uvicorn_bench.log" -Pattern "Latency Profile" | Select-Object -ExpandProperty Line
