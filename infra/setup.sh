#!/usr/bin/env bash
# Setup script for minitrino infrastructure
# This installs dependencies and does first-time setup

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "🚀 LakeQL Infrastructure Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check prerequisites
echo "📋 Checking prerequisites..."

if ! command -v uv &> /dev/null; then
    echo "❌ uv is not installed"
    echo "   Install from: https://docs.astral.sh/uv/"
    exit 1
fi
echo "✓ uv $(uv --version)"

if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed"
    echo "   Install from: https://www.docker.com/products/docker-desktop"
    exit 1
fi
echo "✓ Docker $(docker --version)"

# Install minitrino
echo ""
echo "📦 Installing minitrino..."
uv pip install minitrino --quiet

# Verify installation
if ! command -v minitrino &> /dev/null; then
    echo "❌ Failed to install minitrino"
    exit 1
fi
echo "✓ minitrino $(minitrino --version 2>/dev/null || echo 'installed')"

# Run help
echo ""
echo "📚 Setup complete!"
echo ""
echo "Next steps:"
echo ""
echo "  1. View setup instructions:"
echo "     pnpm infra:setup"
echo ""
echo "  2. Provision minitrino environment (5-10 min):"
echo "     pnpm infra:provision"
echo ""
echo "  3. Open web UI:"
echo "     open https://localhost:8443"
echo ""
echo "  4. Run your backend:"
echo "     pnpm dev:backend"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
