#!/usr/bin/env bash
# uninstall.sh — removes effort-estimation skill from a Claude config dir
#
# Usage:
#   bash uninstall.sh                              # → ~/.claude (default)
#   CLAUDE_HOME=~/.some-other-dir bash uninstall.sh # → custom config dir

set -euo pipefail

SKILL_NAME="effort-estimation"
CLAUDE_HOME="${CLAUDE_HOME:-$HOME/.claude}"

echo ""
echo "Uninstalling $SKILL_NAME..."
echo ""

rm -rf "$CLAUDE_HOME/skills/$SKILL_NAME"
echo "  ✓ Removed → $CLAUDE_HOME/skills/$SKILL_NAME"

echo ""
echo "Done."
echo ""
