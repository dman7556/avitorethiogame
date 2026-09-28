@echo off
cd /d "C:\Users\hp\Desktop\avatior one\apps\server"
set PORT=4000
set CLIENT_URL=http://localhost:5174
npx tsx watch src/index.ts >> "C:\Users\hp\Desktop\avatior one\.freebuff\preview-server-schtasks.log" 2>&1
