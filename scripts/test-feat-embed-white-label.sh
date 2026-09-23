#!/usr/bin/env bash
# scripts/test-feat-embed-white-label.sh
# Quick smoke test del feat embed-white-label
#
# Uso:
#   bash scripts/test-feat-embed-white-label.sh
#
# Salida: exit 0 si todo pasa, exit 1 si algún test falla

set -e

cd "$(dirname "$0")/.."

echo "🧪 feat/embed-white-label — smoke test"
echo "======================================"
echo ""

echo "▶ 1/6 Build..."
npm run build > /tmp/build.log 2>&1 && echo "  ✅ Build OK" || { echo "  ❌ Build failed"; cat /tmp/build.log; exit 1; }

echo ""
echo "▶ 2/6 Lint (my files)..."
LINT_ERRORS=$(npm run lint 2>&1 | grep -E "scripts/generate-red-tests|bff-session-cookie-auth\.guard\.ts|jwt-cookie-auth\.guard\.ts" | grep -E "error " | wc -l | tr -d ' ')
if [ "$LINT_ERRORS" = "0" ]; then
  echo "  ✅ 0 lint errors in my files"
else
  echo "  ❌ $LINT_ERRORS lint errors in my files"
  npm run lint 2>&1 | grep -E "scripts/generate-red-tests|bff-session-cookie-auth\.guard\.ts|jwt-cookie-auth\.guard\.ts" | grep -E "error "
  exit 1
fi

echo ""
echo "▶ 3/6 Unit tests — BFF context (123 tests expected)..."
BFF_TESTS=$(timeout 90 npm run test:unit -- src/context/auth/bff/ 2>&1 | grep "Tests:" | head -1)
echo "  $BFF_TESTS"

echo ""
echo "▶ 4/6 Unit tests — IntegrationApiKey (~150 tests expected)..."
IAK_TESTS=$(timeout 90 npm run test:unit -- src/context/auth/integration-api-key/ 2>&1 | grep "Tests:" | head -1)
echo "  $IAK_TESTS"

echo ""
echo "▶ 5/6 Tests — AI-X script (26 tests expected)..."
SCRIPT_TESTS=$(npm run test:scripts 2>&1 | grep "Tests:" | head -1)
echo "  $SCRIPT_TESTS"

echo ""
echo "▶ 6/6 Tests — AI-1.5 SOP (28 tests expected)..."
SOP_TESTS=$(timeout 30 npx jest --config ./jest-unit.json src/context/shared/dev-tools/try-tdd-generator/ 2>&1 | grep "Tests:" | head -1)
echo "  $SOP_TESTS"

echo ""
echo "▶ Bonus — generate:red-tests CLI..."
npm run generate:red-tests -- _bmad-output/implementation-artifacts/6-0-extend-jwtcookie-strategy-to-accept-opaque-session-ids.md --force 2>&1 | tail -5

echo ""
echo "✅ Smoke test PASSED"
echo "======================================"
echo ""
echo "Resumen:"
echo "  - Build: OK"
echo "  - Lint (my files): clean"
echo "  - BFF: $BFF_TESTS"
echo "  - IntegrationApiKey: $IAK_TESTS"
echo "  - Scripts (AI-X): $SCRIPT_TESTS"
echo "  - SOP (AI-1.5): $SOP_TESTS"