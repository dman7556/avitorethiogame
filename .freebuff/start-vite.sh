#!/bin/bash
cd apps/web
npx vite --host 0.0.0.0 > .freebuff-vite.log 2>&1 &
echo $! > .freebuff-vite.pid
