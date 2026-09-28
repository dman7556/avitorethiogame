#!/bin/bash

# ==========================================
# SkyRush Aviator — Health Check Script
# ==========================================
# Quick health check for the backend service

PORT=${PORT:-8080}
HOST=${HOST:-localhost}

echo "🔍 Checking SkyRush Backend Health..."

# Check if process is running
if pm2 list | grep -q "online.*skyrush-backend"; then
    echo "✅ PM2 Process: Running"
else
    echo "❌ PM2 Process: Not running or stopped"
    exit 1
fi

# Check if port is listening
if nc -z $HOST $PORT 2>/dev/null; then
    echo "✅ Port $PORT: Listening"
else
    echo "❌ Port $PORT: Not accessible"
    exit 1
fi

# Check HTTP endpoint
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://$HOST:$PORT/health)
if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ Health Endpoint: OK (HTTP $HTTP_CODE)"
else
    echo "❌ Health Endpoint: Failed (HTTP $HTTP_CODE)"
    exit 1
fi

echo ""
echo "✅ All health checks passed!"
echo "🌐 Backend is running at http://$HOST:$PORT"
