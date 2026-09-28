$ErrorActionPreference = 'Stop'
$root = 'C:\Users\hp\Desktop\avatior one'
$env:PORT = '4000'
$p = Start-Process -FilePath 'node.exe' -ArgumentList '..\..\node_modules\tsx\dist\cli.mjs','watch','src\index.ts' -WorkingDirectory "$root\apps\server" -RedirectStandardOutput "$root\.freebuff\preview-server.log" -RedirectStandardError "$root\.freebuff\preview-server.log.err" -WindowStyle Hidden -PassThru
$p.Id
