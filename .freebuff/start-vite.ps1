$vite = "C:\Users\hp\Desktop\avatior one\node_modules\.bin\vite.cmd"
$workDir = "C:\Users\hp\Desktop\avatior one\apps\web"
$log = "C:\Users\hp\Desktop\avatior one\.freebuff\vite-out.log"
$logErr = "C:\Users\hp\Desktop\avatior one\.freebuff\vite-err.log"

$proc = Start-Process -FilePath $vite -ArgumentList "--host","0.0.0.0","--port","5174" -WorkingDirectory $workDir -RedirectStandardOutput $log -RedirectStandardError $logErr -WindowStyle Hidden -PassThru
Write-Output "VITE_PID=$($proc.Id)"
