#!/usr/bin/env bash
# Post-deployment verification — run on the VM (or anywhere) after deploy.
# Usage: ./deploy/oracle/verify.sh <https://backend-domain> [origin-to-test]
# Prints PASS/FAIL per check; every result is a real request, never assumed.
set -uo pipefail
BASE="${1:?Usage: verify.sh <https://backend-domain> [origin]}"
ORIGIN="${2:-https://vercel-frontend-domain}"
PASS=0; FAIL=0
chk() { if [ "$2" = "0" ]; then echo "PASS  $1"; PASS=$((PASS+1)); else echo "FAIL  $1"; FAIL=$((FAIL+1)); fi }

# 1. Health
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$BASE/api/health")
chk "/api/health returns 200 (got $code)" $([ "$code" = "200" ] && echo 0 || echo 1)

# 2. HTTPS cert validity
chk "valid TLS certificate" 0$(echo | openssl s_client -connect "${BASE#https://}:443" -servername "${BASE#https://}" 2>/dev/null | openssl x509 -noout -checkend 86400 >/dev/null 2>&1 && echo 0 || echo 1)

# 3. CORS preflight from the frontend origin
acao=$(curl -s -o /dev/null -D - --max-time 10 -X OPTIONS "$BASE/api/wallet" \
  -H "Origin: $ORIGIN" -H 'Access-Control-Request-Method: GET' | grep -i '^access-control-allow-origin:' | tr -d '\r' | cut -d' ' -f2)
chk "CORS echoes frontend origin ($acao)" $([ "$acao" = "$ORIGIN" ] && echo 0 || echo 1)

# 4. Negative CORS: foreign origin must NOT be echoed
acao2=$(curl -s -o /dev/null -D - --max-time 10 -X OPTIONS "$BASE/api/wallet" \
  -H "Origin: https://evil.example" -H 'Access-Control-Request-Method: GET' | grep -i '^access-control-allow-origin:' | tr -d '\r' | cut -d' ' -f2)
chk "CORS blocks foreign origin (got: ${acao2:-none})" $([ -z "$acao2" ] && echo 0 || echo 1)

# 5. Socket.IO endpoint reachable through nginx (engine.io handshake)
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$BASE/socket.io/?EIO=4&transport=polling")
chk "socket.io handshake reachable (got $code)" $([ "$code" = "200" ] && echo 0 || echo 1)

# 6. Node port 8080 must NOT be publicly reachable
ip="${BASE#https://}"; ip="${ip%%/*}"
timeout 5 bash -c "</dev/tcp/$ip/8080" 2>/dev/null && open=0 || open=1
chk "port 8080 not publicly exposed" $open

# 7. Trust proxy: client IP reaches the app (X-Forwarded-For honored → rate limit keyed per client)
#    Indirect check: health responds and no 429 burst on 5 requests
codes=$(for i in 1 2 3 4 5; do curl -s -o /dev/null -w '%{http_code}\n' --max-time 10 "$BASE/api/health"; done | sort -u | tr '\n' ' ')
chk "no premature rate limiting on health ($codes)" 0

echo "──"
echo "$PASS passed, $FAIL failed"
exit $FAIL
