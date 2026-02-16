#!/bin/bash
# Test script for Xase CLI
set -e

echo "🧪 Testing Xase CLI..."
echo ""

# Activate venv
source .venv/bin/activate

# Test 1: Help command
echo "✓ Test 1: xase-cli --help"
xase-cli --help > /dev/null
echo "  ✅ PASS"
echo ""

# Test 2: Version command
echo "✓ Test 2: xase-cli version"
xase-cli version
echo "  ✅ PASS"
echo ""

# Test 3: List commands
echo "✓ Test 3: Available commands"
xase-cli --help | grep -E "Commands:" -A 20
echo "  ✅ PASS"
echo ""

# Test 4: Setup command help
echo "✓ Test 4: xase-cli setup --help"
xase-cli setup --help > /dev/null
echo "  ✅ PASS"
echo ""

# Test 5: Login command help
echo "✓ Test 5: xase-cli login --help"
xase-cli login --help > /dev/null
echo "  ✅ PASS"
echo ""

# Test 6: List offers help
echo "✓ Test 6: xase-cli list-offers --help"
xase-cli list-offers --help > /dev/null
echo "  ✅ PASS"
echo ""

# Test 7: List leases help
echo "✓ Test 7: xase-cli list-leases --help"
xase-cli list-leases --help > /dev/null
echo "  ✅ PASS"
echo ""

# Test 8: Mint lease help
echo "✓ Test 8: xase-cli mint-lease --help"
xase-cli mint-lease --help > /dev/null
echo "  ✅ PASS"
echo ""

# Test 9: Stream help
echo "✓ Test 9: xase-cli stream --help"
xase-cli stream --help > /dev/null
echo "  ✅ PASS"
echo ""

# Test 10: Usage help
echo "✓ Test 10: xase-cli usage --help"
xase-cli usage --help > /dev/null
echo "  ✅ PASS"
echo ""

# Test 11: Logout help
echo "✓ Test 11: xase-cli logout --help"
xase-cli logout --help > /dev/null
echo "  ✅ PASS"
echo ""

# Test 12: Lease details help
echo "✓ Test 12: xase-cli lease-details --help"
xase-cli lease-details --help > /dev/null
echo "  ✅ PASS"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎉 All CLI tests passed!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Next steps:"
echo "  1. Test interactive onboarding: xase-cli"
echo "  2. Test setup wizard: xase-cli setup"
echo "  3. Test authentication: xase-cli login"
echo ""
