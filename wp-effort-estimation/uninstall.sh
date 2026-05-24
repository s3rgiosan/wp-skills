#!/usr/bin/env bash
# uninstall.sh — removes wp-effort-estimation skill from a Claude config dir
#
# Usage:
#   bash uninstall.sh                              # → ~/.claude (default)
#   CLAUDE_CONFIG_DIR=~/.some-other-dir bash uninstall.sh # → custom config dir

set -euo pipefail

SKILL_NAME="wp-effort-estimation"
CLAUDE_CONFIG_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"

echo ""
echo "Uninstalling $SKILL_NAME..."
echo ""

rm -rf "$CLAUDE_CONFIG_DIR/skills/$SKILL_NAME"
echo "  ✓ Removed → $CLAUDE_CONFIG_DIR/skills/$SKILL_NAME"

echo ""
echo "Done."
echo ""
