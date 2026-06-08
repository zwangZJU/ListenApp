try {
    $r = Invoke-WebRequest -Uri 'http://127.0.0.1:8082/status' -TimeoutSec 5
    Write-Host "STATUS: $($r.StatusCode)"
    Write-Host "BODY: $($r.Content)"
} catch {
    Write-Host "ERROR: $($_.Exception.Message)"
}
