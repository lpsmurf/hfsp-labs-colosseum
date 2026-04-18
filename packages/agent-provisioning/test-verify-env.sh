#!/bin/bash
set -euo pipefail

# Test script to verify environment variables are set correctly
echo "=============================================="
echo "TEST CONTAINER - Environment Variable Check"
echo "=============================================="
echo ""
echo "Checking for telegram_token:"
if [[ -n "${telegram_token:-}" ]]; then
    echo "  ✓ telegram_token is SET (length: ${#telegram_token})"
    echo "  ✓ First 10 chars: ${telegram_token:0:10}..."
else
    echo "  ✗ telegram_token is NOT SET"
fi

echo ""
echo "Checking for llm_api_key:"
if [[ -n "${llm_api_key:-}" ]]; then
    echo "  ✓ llm_api_key is SET (length: ${#llm_api_key})"
    echo "  ✓ First 10 chars: ${llm_api_key:0:10}..."
else
    echo "  ✗ llm_api_key is NOT SET"
fi

echo ""
echo "All environment variables containing 'token' or 'api_key':"
env | grep -iE 'token|api_key|TELEGRAM|LLM' | sort || true

echo ""
echo "=============================================="
echo "VERIFICATION COMPLETE"
echo "=============================================="
