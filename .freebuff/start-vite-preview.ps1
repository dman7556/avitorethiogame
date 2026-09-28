$ErrorActionPreference = 'Stop'
$log = 'C:\Users\hp\Desktop\avatior one\.freebuff\preview-vite.log'
$err = 'C:\Users\hp\Desktop\avatior one\.freebuff\preview-vite.log.err'
$p = Start-Process -FilePath 'node.exe' -ArgumentList '..\..\node_modules\vite\bin\vite.js','--port','5173','--strictPort' -WorkingDirectory 'C:\Users\hp\Desktop\avatior one\apps\web' -RedirectStandardOutput $log -RedirectStandardError $err -WindowStyle Hidden -PassThru
$p.Id
