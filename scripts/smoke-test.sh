#!/bin/bash
# ================================================================
# AI Arena — End-to-End Smoke Test
#
# Prerequisites:
#   - API running on localhost:3008 (pnpm start:dev)
#   - PostgreSQL running (docker-compose up -d postgres)
#   - At least 1 problem uploaded and contest-ready
#   - AWS credentials configured (for Fargate deployment)
#
# Usage:
#   chmod +x scripts/smoke-test.sh
#   bash scripts/smoke-test.sh
# ================================================================
set -e

API="${API_URL:-http://localhost:3008/v6}"
AUTH="Authorization: Bearer test"
PASS=0
FAIL=0

pass() { PASS=$((PASS+1)); echo "✓ PASS — $1"; }
fail() { FAIL=$((FAIL+1)); echo "✗ FAIL — $1"; }

echo "============================================="
echo "  SMOKE TEST — AI Arena Backend"
echo "  API: $API"
echo "============================================="
echo ""

# -------- Step 1: Verify problems exist --------
echo "=== Step 1: Verify problems in library ==="
PROBLEMS=$(curl -s "$API/problem/list" -H "$AUTH")
PROB_COUNT=$(echo "$PROBLEMS" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['data']))")
echo "Problems in library: $PROB_COUNT"

if [ "$PROB_COUNT" -lt 1 ]; then
  echo "ERROR: Need at least 1 contest-ready problem. Upload one first."
  exit 1
fi

P1=$(echo "$PROBLEMS" | python3 -c "import sys,json; print(json.load(sys.stdin)['data'][0]['problemId'])")
echo "  Using problem: $P1"
echo ""

# -------- Step 2: Create Tournament --------
echo "=== Step 2: Create tournament ==="
T1=$(curl -s -X POST "$API/tourney/create" \
  -H "$AUTH" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Smoke Test","numRounds":2,"initialEntrants":8,"maxContestantsPerMatch":4,"advancingContestants":1}')
T1_ID=$(echo "$T1" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['tourneyId'])")
T1_SUCCESS=$(echo "$T1" | python3 -c "import sys,json; print(json.load(sys.stdin)['success'])")
echo "Created: $T1_ID"
echo "$T1" | python3 -c "
import sys,json
d=json.load(sys.stdin)['data']
for r in d['bracketStructure']['rounds']:
    print(f'  {r[\"roundName\"]}: {len(r[\"contests\"])} contests')
"
[ "$T1_SUCCESS" = "True" ] && pass "Tournament created" || fail "Tournament creation (success=$T1_SUCCESS)"
echo ""

# -------- Step 3: Assign problems to all contests --------
echo "=== Step 3: Assign problems to contests ==="
for rnd in 0 1; do
  RND_NUM=$((rnd+1))
  CONTESTS=$(echo "$T1" | python3 -c "import sys,json; [print(c['contestId']) for c in json.load(sys.stdin)['data']['bracketStructure']['rounds'][$rnd]['contests']]")
  for cid in $CONTESTS; do
    curl -s -X PUT "$API/tourney/$T1_ID/round/$RND_NUM/contest/$cid/problem/$P1" -H "$AUTH" > /dev/null
    echo "  R$RND_NUM/$cid → ${P1:0:8}..."
  done
done
pass "Problems assigned"
echo ""

# -------- Step 4: Update with start date --------
echo "=== Step 4: Set start date ==="
START_DATE=$(date -u -d '+3 minutes' +%Y-%m-%dT%H:%M:%S.000Z 2>/dev/null || date -u -v+3M +%Y-%m-%dT%H:%M:%S.000Z)
T1_BRACKET=$(curl -s "$API/tourney/$T1_ID" -H "$AUTH" | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin)['data']['bracketStructure']))")
curl -s -X PUT "$API/tourney/$T1_ID" \
  -H "$AUTH" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Smoke Test\",\"numRounds\":2,\"initialEntrants\":8,\"maxContestantsPerMatch\":4,\"advancingContestants\":1,\"isActive\":true,\"startDate\":\"$START_DATE\",\"bracketStructure\":$T1_BRACKET}" > /dev/null
echo "Start date: $START_DATE"
pass "Start date set"
echo ""

# -------- Step 5: Publish --------
echo "=== Step 5: Publish tournament ==="
PUB1_CODE=$(curl -s -o /tmp/pub1.json -w "%{http_code}" -X POST "$API/tourney/$T1_ID/publish" -H "$AUTH")
PUB1_STATUS=$(python3 -c "import json; print(json.load(open('/tmp/pub1.json'))['data']['status'])" 2>/dev/null || echo "UNKNOWN")
echo "HTTP $PUB1_CODE | status=$PUB1_STATUS"
[ "$PUB1_CODE" = "201" ] && pass "Publish returned 201" || fail "Expected 201, got $PUB1_CODE"
echo ""

# -------- Step 6: Verify rooms --------
echo "=== Step 6: Verify rooms ==="
ROOMS=$(curl -s "$API/tourney/$T1_ID/rooms" -H "$AUTH")
ROOM_COUNT=$(echo "$ROOMS" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['data']))")
echo "$ROOMS" | python3 -c "
import sys,json
for r in json.load(sys.stdin)['data']:
    print(f'  {r[\"roomName\"]} | {r[\"status\"]} | scheduled={r[\"scheduledAt\"][:19]}')
"
[ "$ROOM_COUNT" = "3" ] && pass "3 rooms created" || fail "Expected 3 rooms, got $ROOM_COUNT"
echo ""

# -------- Step 7: AI Hub --------
echo "=== Step 7: AI Hub endpoint ==="
HUB_CODE=$(curl -s -o /tmp/hub.json -w "%{http_code}" "$API/tourney/active/hub" -H "$AUTH")
HUB_NAME=$(python3 -c "import json; d=json.load(open('/tmp/hub.json')); print(d['data']['name'] if d['data'] else 'NONE')" 2>/dev/null || echo "ERROR")
echo "HTTP $HUB_CODE | tournament=$HUB_NAME"
[ "$HUB_NAME" = "Smoke Test" ] && pass "AI Hub returns correct tournament" || fail "Expected 'Smoke Test', got '$HUB_NAME'"
echo ""

# -------- Step 8: Double-publish (409) --------
echo "=== Step 8: Double-publish protection ==="
DUP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API/tourney/$T1_ID/publish" -H "$AUTH")
echo "HTTP $DUP_CODE"
[ "$DUP_CODE" = "409" ] && pass "Double-publish blocked (409)" || fail "Expected 409, got $DUP_CODE"
echo ""

# -------- Step 9: Second tournament publish blocked --------
echo "=== Step 9: Second tournament publish blocked ==="
T2=$(curl -s -X POST "$API/tourney/create" \
  -H "$AUTH" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Should Fail","numRounds":1,"initialEntrants":4,"maxContestantsPerMatch":4,"advancingContestants":1}')
T2_ID=$(echo "$T2" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['tourneyId'])")
T2_CID=$(echo "$T2" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['bracketStructure']['rounds'][0]['contests'][0]['contestId'])")
curl -s -X PUT "$API/tourney/$T2_ID/round/1/contest/$T2_CID/problem/$P1" -H "$AUTH" > /dev/null
START2=$(date -u -d '+10 minutes' +%Y-%m-%dT%H:%M:%S.000Z 2>/dev/null || date -u -v+10M +%Y-%m-%dT%H:%M:%S.000Z)
T2_BRACKET=$(curl -s "$API/tourney/$T2_ID" -H "$AUTH" | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin)['data']['bracketStructure']))")
curl -s -X PUT "$API/tourney/$T2_ID" \
  -H "$AUTH" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Should Fail\",\"numRounds\":1,\"initialEntrants\":4,\"maxContestantsPerMatch\":4,\"advancingContestants\":1,\"isActive\":true,\"startDate\":\"$START2\",\"bracketStructure\":$T2_BRACKET}" > /dev/null
T2_PUB_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API/tourney/$T2_ID/publish" -H "$AUTH")
echo "HTTP $T2_PUB_CODE"
[ "$T2_PUB_CODE" = "409" ] && pass "Second publish blocked (409)" || fail "Expected 409, got $T2_PUB_CODE"
echo ""

# -------- Step 10: 404 for nonexistent --------
echo "=== Step 10: Nonexistent tournament (404) ==="
FAKE_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API/tourney/00000000-0000-0000-0000-000000000000/publish" -H "$AUTH")
echo "HTTP $FAKE_CODE"
[ "$FAKE_CODE" = "404" ] && pass "Nonexistent returns 404" || fail "Expected 404, got $FAKE_CODE"
echo ""

# -------- Step 11: Delete T2 --------
echo "=== Step 11: Cleanup — delete T2 ==="
DEL_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$API/tourney/$T2_ID" -H "$AUTH")
echo "DELETE T2: HTTP $DEL_CODE"
[ "$DEL_CODE" = "200" ] && pass "Tournament deleted" || fail "Expected 200, got $DEL_CODE"
echo ""

# -------- Summary --------
echo "============================================="
echo "  RESULTS: $PASS passed, $FAIL failed"
echo "============================================="
echo ""
echo "Published tournament: $T1_ID"
echo ""
echo "Monitor room deployment (cron runs every 60s):"
echo "  curl -s $API/tourney/$T1_ID/rooms -H 'Authorization: Bearer test' | python3 -m json.tool"
echo ""

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
