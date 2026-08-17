$sources = Invoke-RestMethod -Uri "http://localhost:8000/api/v1/sources/" -Method Get
foreach ($s in $sources) {
    $body = @{
        title = $s.title
        raw_content = $s.content
        domain = $s.domain
        source_kind = "manual"
    } | ConvertTo-Json
    Invoke-RestMethod -Uri "http://localhost:8000/api/v1/sources/$($s.id)" -Method Put -Body $body -ContentType "application/json" | Out-Null
    Write-Host "Reindexed: $($s.title)"
}
