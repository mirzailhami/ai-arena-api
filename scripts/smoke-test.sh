#!/usr/bin/env bash
# =============================================================================
# AI Arena API — Smoke Test Script
#
# All routes are served under the /arena-manager/api global prefix.
# Routes match the Java TourneyManagerResource contract:
#   GET    /problem/list
#   POST   /problem/upload        (binary octet-stream, X-Problem-Name header)
#   POST   /problem/test/:id
#   GET    /problem/:id
#   DELETE /problem/:id
#   GET    /problem/:id/log
#   POST   /problem/flag/:id
#   POST   /tourney/create
#   GET    /tourney/list
#   GET    /tourney/:tourneyId
#   DELETE /tourney/:tourneyId
#   PUT    /tourney/:tourneyId/round/:n/contest/:cId/problem/:pId
#
# Usage:
#   ./scripts/smoke-test.sh                               # runs against http://localhost:3000/arena-manager/api, synthetic ZIP
#   ./scripts/smoke-test.sh http://localhost:3000/arena-manager/api         # explicit URL, synthetic ZIP
#   ./scripts/smoke-test.sh http://localhost:3000/arena-manager/api /path/to/774830.zip  # real problem ZIP
#
# Challenge problem ZIPs (774830.zip, 774930.zip, 775021.zip):
#   Pass the path to any of these as the second argument to use a real problem
#   instead of the synthetic test ZIP.  The ZIP filename becomes the problem name.
#
# Requirements:
#   - curl
#   - jq  (brew install jq / apt install jq)
#   - A valid Topcoder JWT token in the JWT env var OR passed via prompt
#   - zip command  (for creating the test problem ZIP on the fly)
#
# Example:
#   JWT="eyJ..." ./scripts/smoke-test.sh
#
# JWT source: platform-ui DevTools → Application → Cookies → 'tcjwt'
# =============================================================================

set -euo pipefail

BASE_URL="${1:-http://localhost:3000/arena-manager/api}"
# Optional: path to a real problem ZIP (e.g. 774830.zip, 774930.zip, 775021.zip)
# Usage: ./scripts/smoke-test.sh http://localhost:3000 /path/to/774830.zip
PROBLEM_ZIP_PATH="${2:-}"

# ── colours ─────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'
pass() { echo -e "${GREEN}[PASS]${NC} $1"; }
fail() { echo -e "${RED}[FAIL]${NC} $1"; FAILURES=$((FAILURES+1)); }
info() { echo -e "${YELLOW}[INFO]${NC} $1"; }

FAILURES=0

# ── JWT token ────────────────────────────────────────────────────────────────
if [[ -z "${JWT:-}" ]]; then
  echo ""
  echo "Paste your Topcoder JWT token (from platform-ui DevTools → Application → Cookies → 'tcjwt'):"
  read -r JWT
fi

# The platform-ui sends JWT as 'sessionId' header; we also support 'Authorization: Bearer'
AUTH_HEADER="sessionId: ${JWT}"

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
info "2. GET /problem/list without token (expect 401)"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/problem/list")
if [[ "$STATUS" == "401" ]]; then
  pass "GET /problem/list (no token) → 401"
else
  fail "GET /problem/list (no token) → expected 401, got ${STATUS}"
fi

# ── 3. List problems (empty initially) ───────────────────────────────────────
info "3. GET /problem/list (expect 200)"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "${AUTH_HEADER}" "${BASE_URL}/problem/list")
BODY=$(curl -s -H "${AUTH_HEADER}" "${BASE_URL}/problem/list")
if [[ "$STATUS" == "200" ]]; then
  pass "GET /problem/list → 200  |  body: ${BODY}"
else
  fail "GET /problem/list → expected 200, got ${STATUS}  |  body: ${BODY}"
fi

# ── 4. Upload a problem ZIP (binary octet-stream) ────────────────────────────
info "4. POST /problem/upload — binary octet-stream with X-Problem-Name header"

if [[ -n "${PROBLEM_ZIP_PATH}" && -f "${PROBLEM_ZIP_PATH}" ]]; then
  # Use the provided real problem ZIP
  TMP_ZIP="${PROBLEM_ZIP_PATH}"
  PROBLEM_NAME="$(basename "${PROBLEM_ZIP_PATH}" .zip)"
  info "   Using real problem ZIP: ${TMP_ZIP}"
  CLEANUP_ZIP=false
else
  # Synthesise a minimal valid ZIP on the fly
  TMP_DIR=$(mktemp -d)
  TMP_ZIP="${TMP_DIR}/test-problem.zip"
  PROBLEM_NAME="Smoke Test Problem"
  mkdir -p "${TMP_DIR}/problem"
  cat > "${TMP_DIR}/problem/Dockerfile" << 'EOF'
FROM alpine:3.18
CMD ["echo", "arena problem test passed"]
EOF
  (cd "${TMP_DIR}" && zip -r test-problem.zip problem/ -x "*.DS_Store") > /dev/null 2>&1
  CLEANUP_ZIP=true
fi

UPLOAD_RESP=$(curl -s -w "\n%{http_code}" \
  -X POST \
  -H "${AUTH_HEADER}" \
  -H "Content-Type: application/octet-stream" \
  -H "Content-Disposition: attachment; filename=\"test-problem.zip\"" \
  -H "X-Problem-Name: ${PROBLEM_NAME}" \
  --data-binary "@${TMP_ZIP}" \
  "${BASE_URL}/problem/upload")
UPLOAD_HTTP=$(echo "${UPLOAD_RESP}" | tail -1)
UPLOAD_BODY=$(echo "${UPLOAD_RESP}" | sed '$ d')

if [[ "$UPLOAD_HTTP" == "200" ]]; then
  PROBLEM_ID=$(echo "${UPLOAD_BODY}" | jq -r '.data.problemId // empty')
  pass "POST /problem/upload → 200  |  problemId: ${PROBLEM_ID}"
else
  fail "POST /problem/upload → expected 200, got ${UPLOAD_HTTP}  |  body: ${UPLOAD_BODY}"
  PROBLEM_ID=""
fi

if [[ "${CLEANUP_ZIP:-false}" == "true" ]]; then
  rm -rf "${TMP_DIR}"
fi

# ── 5. Get single problem ─────────────────────────────────────────────────────
if [[ -n "${PROBLEM_ID:-}" ]]; then
  info "5. GET /problem/${PROBLEM_ID}"
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "${AUTH_HEADER}" "${BASE_URL}/problem/${PROBLEM_ID}")
  if [[ "$STATUS" == "200" ]]; then
    pass "GET /problem/:id → 200"
  else
    fail "GET /problem/:id → expected 200, got ${STATUS}"
  fi
else
  info "5. SKIP — no problem ID (upload failed)"
fi

# ── 6. Test problem (Docker cycle) ───────────────────────────────────────────
if [[ -n "${PROBLEM_ID:-}" ]]; then
  info "6. POST /problem/test/${PROBLEM_ID} (requires Docker daemon)"
  BODY=$(curl -s -X POST -H "${AUTH_HEADER}" "${BASE_URL}/problem/test/${PROBLEM_ID}")
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "${AUTH_HEADER}" "${BASE_URL}/problem/test/${PROBLEM_ID}")
  if [[ "$STATUS" == "200" ]]; then
    TEST_SUCCESS=$(echo "${BODY}" | jq -r '.success // "false"')
    pass "POST /problem/test/:id → 200  |  success: ${TEST_SUCCESS}"
  else
    info "POST /problem/test/:id → ${STATUS} (may fail without Docker daemon)"
    info "Response: ${BODY}"
  fi
fi

# ── 7. Get build log ──────────────────────────────────────────────────────────
if [[ -n "${PROBLEM_ID:-}" ]]; then
  info "7. GET /problem/${PROBLEM_ID}/log"
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "${AUTH_HEADER}" "${BASE_URL}/problem/${PROBLEM_ID}/log")
  if [[ "$STATUS" == "200" ]]; then
    pass "GET /problem/:id/log → 200"
  else
    fail "GET /problem/:id/log → expected 200, got ${STATUS}"
  fi
fi

# ── 8. Flag problem for contest ───────────────────────────────────────────────
if [[ -n "${PROBLEM_ID:-}" ]]; then
  info "8. POST /problem/flag/${PROBLEM_ID} (flag=true)"
  FLAG_BODY=$(curl -s -X POST \
    -H "${AUTH_HEADER}" \
    -H "Content-Type: application/json" \
    -d 'true' \
    "${BASE_URL}/problem/flag/${PROBLEM_ID}")
  FLAG_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST \
    -H "${AUTH_HEADER}" \
    -H "Content-Type: application/json" \
    -d 'true' \
    "${BASE_URL}/problem/flag/${PROBLEM_ID}")
  if [[ "$FLAG_STATUS" == "200" ]]; then
    IS_READY=$(echo "${FLAG_BODY}" | jq -r '.data.isContestReady // "false"')
    pass "POST /problem/flag/:id → 200  |  isContestReady: ${IS_READY}"
  else
    fail "POST /problem/flag/:id → expected 200, got ${FLAG_STATUS}  |  body: ${FLAG_BODY}"
  fi
fi

# ── 9. 404 on unknown problem ─────────────────────────────────────────────────
info "9. GET /problem/00000000-0000-0000-0000-000000000000 (expect 404)"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "${AUTH_HEADER}" "${BASE_URL}/problem/00000000-0000-0000-0000-000000000000")
if [[ "$STATUS" == "404" ]]; then
  pass "GET /problem/:invalid-id → 404"
else
  fail "GET /problem/:invalid-id → expected 404, got ${STATUS}"
fi

# ── 10. List tourneys ────────────────────────────────────────────────────────
info "10. GET /tourney/list (expect 200)"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "${AUTH_HEADER}" "${BASE_URL}/tourney/list")
BODY=$(curl -s -H "${AUTH_HEADER}" "${BASE_URL}/tourney/list")
if [[ "$STATUS" == "200" ]]; then
  pass "GET /tourney/list → 200  |  body: ${BODY}"
else
  fail "GET /tourney/list → expected 200, got ${STATUS}"
fi

# ── 11. Create tournament ─────────────────────────────────────────────────────
info "11. POST /tourney/create — create tournament with bracket"
TOURNEY_RESP=$(curl -s -w "\n%{http_code}" \
  -X POST \
  -H "${AUTH_HEADER}" \
  -H "Content-Type: application/json" \
  -d '{"name":"Smoke Test Tournament","numRounds":2,"initialEntrants":8,"maxContestantsPerMatch":4,"advancingContestants":1}' \
  "${BASE_URL}/tourney/create")
TOURNEY_HTTP=$(echo "${TOURNEY_RESP}" | tail -1)
TOURNEY_BODY=$(echo "${TOURNEY_RESP}" | sed '$ d')

if [[ "$TOURNEY_HTTP" == "200" ]]; then
  TOURNEY_ID=$(echo "${TOURNEY_BODY}" | jq -r '.data.tourneyId // empty')
  ROUND_COUNT=$(echo "${TOURNEY_BODY}" | jq '.data.bracketStructure.rounds | length')
  pass "POST /tourney/create → 200  |  tourneyId: ${TOURNEY_ID}  |  rounds: ${ROUND_COUNT}"
else
  fail "POST /tourney/create → expected 200, got ${TOURNEY_HTTP}  |  body: ${TOURNEY_BODY}"
  TOURNEY_ID=""
fi

# ── 12. Get tourney by ID ─────────────────────────────────────────────────────
if [[ -n "${TOURNEY_ID:-}" ]]; then
  info "12. GET /tourney/${TOURNEY_ID}"
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "${AUTH_HEADER}" "${BASE_URL}/tourney/${TOURNEY_ID}")
  if [[ "$STATUS" == "200" ]]; then
    pass "GET /tourney/:id → 200"
  else
    fail "GET /tourney/:id → expected 200, got ${STATUS}"
  fi
fi

# ── 13. Assign problem to contest ─────────────────────────────────────────────
if [[ -n "${TOURNEY_ID:-}" && -n "${PROBLEM_ID:-}" ]]; then
  info "13. PUT /tourney/:id/round/1/contest/:contestId/problem/:problemId"
  TOURNEY_DATA=$(curl -s -H "${AUTH_HEADER}" "${BASE_URL}/tourney/${TOURNEY_ID}")
  CONTEST_ID=$(echo "${TOURNEY_DATA}" | jq -r '.data.bracketStructure.rounds[0].contests[0].contestId // empty')

  if [[ -n "${CONTEST_ID:-}" ]]; then
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
      -X PUT \
      -H "${AUTH_HEADER}" \
      "${BASE_URL}/tourney/${TOURNEY_ID}/round/1/contest/${CONTEST_ID}/problem/${PROBLEM_ID}")
    if [[ "$STATUS" == "200" ]]; then
      pass "PUT /tourney/:id/round/:r/contest/:c/problem/:p → 200"
    else
      BODY=$(curl -s -X PUT -H "${AUTH_HEADER}" "${BASE_URL}/tourney/${TOURNEY_ID}/round/1/contest/${CONTEST_ID}/problem/${PROBLEM_ID}")
      fail "PUT assign problem → expected 200, got ${STATUS}  |  body: ${BODY}"
    fi
  else
    info "SKIP assign — could not extract contestId from tourney response"
  fi
else
  info "SKIP assign — missing tourney or problem ID"
fi

# ── 14. Delete tourney ────────────────────────────────────────────────────────
if [[ -n "${TOURNEY_ID:-}" ]]; then
  info "14. DELETE /tourney/${TOURNEY_ID} (expect 200)"
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE -H "${AUTH_HEADER}" "${BASE_URL}/tourney/${TOURNEY_ID}")
  if [[ "$STATUS" == "200" ]]; then
    pass "DELETE /tourney/:id → 200"
    STATUS2=$(curl -s -o /dev/null -w "%{http_code}" -H "${AUTH_HEADER}" "${BASE_URL}/tourney/${TOURNEY_ID}")
    if [[ "$STATUS2" == "404" ]]; then
      pass "GET /tourney/:id after delete → 404 (confirmed gone)"
    fi
  else
    fail "DELETE /tourney/:id → expected 200, got ${STATUS}"
  fi
fi

# ── 15. Delete problem ────────────────────────────────────────────────────────
if [[ -n "${PROBLEM_ID:-}" ]]; then
  info "15. DELETE /problem/${PROBLEM_ID} (expect 200)"
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE -H "${AUTH_HEADER}" "${BASE_URL}/problem/${PROBLEM_ID}")
  if [[ "$STATUS" == "200" ]]; then
    pass "DELETE /problem/:id → 200"
  else
    fail "DELETE /problem/:id → expected 200, got ${STATUS}"
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

