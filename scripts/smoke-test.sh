#!/usr/bin/env bash
# =============================================================================
# AI Arena API — Smoke Test Script
#
# Usage:
#   ./scripts/smoke-test.sh                        # runs against http://localhost:3000
#   ./scripts/smoke-test.sh http://localhost:3000
#
# Requirements:
#   - curl
#   - jq  (brew install jq / apt install jq)
#   - A valid Topcoder JWT token in the JWT env var OR passed via prompt
#
# Example:
#   JWT="eyJ..." ./scripts/smoke-test.sh
# =============================================================================

set -euo pipefail

BASE_URL="${1:-http://localhost:3000}"

# ── colours ─────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'
pass() { echo -e "${GREEN}[PASS]${NC} $1"; }
fail() { echo -e "${RED}[FAIL]${NC} $1"; FAILURES=$((FAILURES+1)); }
info() { echo -e "${YELLOW}[INFO]${NC} $1"; }

FAILURES=0

# ── JWT token ────────────────────────────────────────────────────────────────
if [[ -z "${JWT:-}" ]]; then
  echo ""
  echo "Paste your Topcoder JWT token (from platform-ui DevTools → Application → Cookies → 'v3jwt'):"
  read -r JWT
fi

AUTH_HEADER="Authorization: Bearer ${JWT}"

echo ""
echo "============================================================"
echo " AI Arena API Smoke Tests  →  ${BASE_URL}"
echo "============================================================"
echo ""

# ── 1. Health check (public) ─────────────────────────────────────────────────
info "1. GET /health (public — no token required)"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/health")
BODY=$(curl -s "${BASE_URL}/health")
if [[ "$STATUS" == "200" ]]; then
  pass "GET /health → 200  |  body: ${BODY}"
else
  fail "GET /health → expected 200, got ${STATUS}"
fi

# ── 2. Auth guard — no token ─────────────────────────────────────────────────
info "2. GET /library/problems without token (expect 401)"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/library/problems")
if [[ "$STATUS" == "401" ]]; then
  pass "GET /library/problems (no token) → 401"
else
  fail "GET /library/problems (no token) → expected 401, got ${STATUS}"
fi

# ── 3. List problems (empty initially) ───────────────────────────────────────
info "3. GET /library/problems (expect 200 [])"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "${AUTH_HEADER}" "${BASE_URL}/library/problems")
BODY=$(curl -s -H "${AUTH_HEADER}" "${BASE_URL}/library/problems")
if [[ "$STATUS" == "200" ]]; then
  pass "GET /library/problems → 200  |  body: ${BODY}"
else
  fail "GET /library/problems → expected 200, got ${STATUS}  |  body: ${BODY}"
fi

# ── 4. Upload a problem ZIP ───────────────────────────────────────────────────
# Creates a minimal valid ZIP with a Dockerfile on the fly (requires zip command)
info "4. POST /library/problems — upload test problem ZIP"

TMP_DIR=$(mktemp -d)
TMP_ZIP="${TMP_DIR}/test-problem.zip"
mkdir -p "${TMP_DIR}/problem"
cat > "${TMP_DIR}/problem/Dockerfile" << 'EOF'
FROM alpine:3.18
CMD ["echo", "arena problem test passed"]
EOF

(cd "${TMP_DIR}" && zip -r test-problem.zip problem/ -x "*.DS_Store") > /dev/null 2>&1

UPLOAD_RESP=$(curl -s -w "\n%{http_code}" \
  -H "${AUTH_HEADER}" \
  -F "file=@${TMP_ZIP};type=application/zip" \
  "${BASE_URL}/library/problems")
UPLOAD_HTTP=$(echo "${UPLOAD_RESP}" | tail -1)
UPLOAD_BODY=$(echo "${UPLOAD_RESP}" | head -n -1)

if [[ "$UPLOAD_HTTP" == "201" ]]; then
  PROBLEM_ID=$(echo "${UPLOAD_BODY}" | jq -r '.id // empty')
  pass "POST /library/problems → 201  |  id: ${PROBLEM_ID}"
else
  fail "POST /library/problems → expected 201, got ${UPLOAD_HTTP}  |  body: ${UPLOAD_BODY}"
  PROBLEM_ID=""
fi

rm -rf "${TMP_DIR}"

# ── 5. Get single problem ─────────────────────────────────────────────────────
if [[ -n "${PROBLEM_ID:-}" ]]; then
  info "5. GET /library/problems/${PROBLEM_ID}"
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "${AUTH_HEADER}" "${BASE_URL}/library/problems/${PROBLEM_ID}")
  if [[ "$STATUS" == "200" ]]; then
    pass "GET /library/problems/:id → 200"
  else
    fail "GET /library/problems/:id → expected 200, got ${STATUS}"
  fi
else
  info "5. SKIP — no problem ID (upload failed)"
fi

# ── 6. Test problem (Docker cycle) ───────────────────────────────────────────
if [[ -n "${PROBLEM_ID:-}" ]]; then
  info "6. POST /library/problems/${PROBLEM_ID}/test (requires Docker daemon)"
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "${AUTH_HEADER}" "${BASE_URL}/library/problems/${PROBLEM_ID}/test")
  BODY=$(curl -s -X POST -H "${AUTH_HEADER}" "${BASE_URL}/library/problems/${PROBLEM_ID}/test")
  if [[ "$STATUS" == "200" ]]; then
    pass "POST /library/problems/:id/test → 200  |  body: ${BODY}"
  else
    info "POST /library/problems/:id/test → ${STATUS} (may fail without Docker daemon)"
    info "Response: ${BODY}"
  fi
fi

# ── 7. Get build log ──────────────────────────────────────────────────────────
if [[ -n "${PROBLEM_ID:-}" ]]; then
  info "7. GET /library/problems/${PROBLEM_ID}/log"
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "${AUTH_HEADER}" "${BASE_URL}/library/problems/${PROBLEM_ID}/log")
  if [[ "$STATUS" == "200" ]]; then
    pass "GET /library/problems/:id/log → 200"
  else
    fail "GET /library/problems/:id/log → expected 200, got ${STATUS}"
  fi
fi

# ── 8. 404 on unknown problem ─────────────────────────────────────────────────
info "8. GET /library/problems/00000000-0000-0000-0000-000000000000 (expect 404)"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "${AUTH_HEADER}" "${BASE_URL}/library/problems/00000000-0000-0000-0000-000000000000")
if [[ "$STATUS" == "404" ]]; then
  pass "GET /library/problems/:invalid-id → 404"
else
  fail "GET /library/problems/:invalid-id → expected 404, got ${STATUS}"
fi

# ── 9. List tourneys (empty) ──────────────────────────────────────────────────
info "9. GET /tourneys (expect 200 [])"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "${AUTH_HEADER}" "${BASE_URL}/tourneys")
BODY=$(curl -s -H "${AUTH_HEADER}" "${BASE_URL}/tourneys")
if [[ "$STATUS" == "200" ]]; then
  pass "GET /tourneys → 200  |  body: ${BODY}"
else
  fail "GET /tourneys → expected 200, got ${STATUS}"
fi

# ── 10. Create tournament ─────────────────────────────────────────────────────
info "10. POST /tourneys — create tournament with bracket"
TOURNEY_RESP=$(curl -s -w "\n%{http_code}" \
  -X POST \
  -H "${AUTH_HEADER}" \
  -H "Content-Type: application/json" \
  -d '{"name":"Smoke Test Tournament","numRounds":2,"initialEntrants":8,"maxContestantsPerMatch":4,"advancingContestants":1}' \
  "${BASE_URL}/tourneys")
TOURNEY_HTTP=$(echo "${TOURNEY_RESP}" | tail -1)
TOURNEY_BODY=$(echo "${TOURNEY_RESP}" | head -n -1)

if [[ "$TOURNEY_HTTP" == "201" ]]; then
  TOURNEY_ID=$(echo "${TOURNEY_BODY}" | jq -r '.id // empty')
  ROUND_COUNT=$(echo "${TOURNEY_BODY}" | jq '.rounds | length')
  pass "POST /tourneys → 201  |  id: ${TOURNEY_ID}  |  rounds: ${ROUND_COUNT}"
else
  fail "POST /tourneys → expected 201, got ${TOURNEY_HTTP}  |  body: ${TOURNEY_BODY}"
  TOURNEY_ID=""
fi

# ── 11. Get tourney by ID ─────────────────────────────────────────────────────
if [[ -n "${TOURNEY_ID:-}" ]]; then
  info "11. GET /tourneys/${TOURNEY_ID}"
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "${AUTH_HEADER}" "${BASE_URL}/tourneys/${TOURNEY_ID}")
  if [[ "$STATUS" == "200" ]]; then
    pass "GET /tourneys/:id → 200"
  else
    fail "GET /tourneys/:id → expected 200, got ${STATUS}"
  fi
fi

# ── 12. Assign problem to contest ─────────────────────────────────────────────
if [[ -n "${TOURNEY_ID:-}" && -n "${PROBLEM_ID:-}" ]]; then
  info "12. PUT /tourneys/:id/rounds/1/contests/:contestId/problems/:problemId"
  TOURNEY_DATA=$(curl -s -H "${AUTH_HEADER}" "${BASE_URL}/tourneys/${TOURNEY_ID}")
  CONTEST_ID=$(echo "${TOURNEY_DATA}" | jq -r '.rounds[0].contests[0].id // empty')

  if [[ -n "${CONTEST_ID:-}" ]]; then
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
      -X PUT \
      -H "${AUTH_HEADER}" \
      "${BASE_URL}/tourneys/${TOURNEY_ID}/rounds/1/contests/${CONTEST_ID}/problems/${PROBLEM_ID}")
    if [[ "$STATUS" == "200" ]]; then
      pass "PUT /tourneys/:id/rounds/:r/contests/:c/problems/:p → 200"
    else
      BODY=$(curl -s -X PUT -H "${AUTH_HEADER}" "${BASE_URL}/tourneys/${TOURNEY_ID}/rounds/1/contests/${CONTEST_ID}/problems/${PROBLEM_ID}")
      fail "PUT assign problem → expected 200, got ${STATUS}  |  body: ${BODY}"
    fi
  else
    info "SKIP assign — could not extract contestId from tourney response"
  fi
else
  info "SKIP assign — missing tourney or problem ID"
fi

# ── 13. Delete tourney ────────────────────────────────────────────────────────
if [[ -n "${TOURNEY_ID:-}" ]]; then
  info "13. DELETE /tourneys/${TOURNEY_ID} (expect 204)"
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE -H "${AUTH_HEADER}" "${BASE_URL}/tourneys/${TOURNEY_ID}")
  if [[ "$STATUS" == "204" ]]; then
    pass "DELETE /tourneys/:id → 204"
    # Verify it's gone
    STATUS2=$(curl -s -o /dev/null -w "%{http_code}" -H "${AUTH_HEADER}" "${BASE_URL}/tourneys/${TOURNEY_ID}")
    if [[ "$STATUS2" == "404" ]]; then
      pass "GET /tourneys/:id after delete → 404 (confirmed gone)"
    fi
  else
    fail "DELETE /tourneys/:id → expected 204, got ${STATUS}"
  fi
fi

# ── 14. Delete problem ────────────────────────────────────────────────────────
if [[ -n "${PROBLEM_ID:-}" ]]; then
  info "14. DELETE /library/problems/${PROBLEM_ID} (expect 204)"
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE -H "${AUTH_HEADER}" "${BASE_URL}/library/problems/${PROBLEM_ID}")
  if [[ "$STATUS" == "204" ]]; then
    pass "DELETE /library/problems/:id → 204"
  else
    fail "DELETE /library/problems/:id → expected 204, got ${STATUS}"
  fi
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "============================================================"
if [[ "$FAILURES" -eq 0 ]]; then
  echo -e "${GREEN} All smoke tests passed!${NC}"
else
  echo -e "${RED} ${FAILURES} test(s) failed. See [FAIL] lines above.${NC}"
fi
echo "============================================================"
echo ""

exit "${FAILURES}"
