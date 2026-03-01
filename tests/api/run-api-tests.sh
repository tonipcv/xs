#!/bin/bash

# API Tests Runner
# Executes all critical API route tests

set -e

echo "🧪 XASE Sheets API Tests"
echo "========================"
echo ""

# Check if server is running
if ! curl -s http://localhost:3000/api/health > /dev/null 2>&1; then
    echo "❌ Server is not running on http://localhost:3000"
    echo "Please start the server with: npm run dev"
    exit 1
fi

echo "✅ Server is running"
echo ""

# Set test environment
export TEST_API_URL="http://localhost:3000"
export NODE_ENV="test"

# Run tests
echo "Running API tests..."
echo ""

# Run individual test suites
echo "▶️  Authentication Tests"
npx vitest run tests/api/auth.test.ts

echo ""
echo "▶️  Datasets Tests"
npx vitest run tests/api/datasets.test.ts

echo ""
echo "▶️  Leases Tests"
npx vitest run tests/api/leases.test.ts

echo ""
echo "▶️  Billing Tests"
npx vitest run tests/api/billing.test.ts

echo ""
echo "▶️  Marketplace Tests"
npx vitest run tests/api/marketplace.test.ts

echo ""
echo "✅ All API tests completed!"
echo ""
