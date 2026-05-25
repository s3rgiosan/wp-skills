#!/usr/bin/env bash
# uninstall.sh — removes wp-mnemon skill from a Claude config dir
#
# Usage:
#   bash uninstall.sh                              # → ~/.claude (default)
#   CLAUDE_CONFIG_DIR=~/.some-other-dir bash uninstall.sh # → custom config dir

set -euo pipefail

SKILL_NAME="wp-mnemon"
CLAUDE_CONFIG_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"

echo ""
echo "Uninstalling $SKILL_NAME skill..."
echo ""

if [ -d "$CLAUDE_CONFIG_DIR/skills/$SKILL_NAME" ]; then
  rm -rf "$CLAUDE_CONFIG_DIR/skills/$SKILL_NAME"
  echo "  ✓ Removed → $CLAUDE_CONFIG_DIR/skills/$SKILL_NAME"
else
  echo "  - Not installed in $CLAUDE_CONFIG_DIR/skills/$SKILL_NAME"
fi

echo ""
echo "Note: this only removes the skill. If the wp-mnemon subagent is installed"
echo "(from wp-agents/wp-mnemon), it will lose its skill dependency."
echo ""
echo "Done!"
echo ""
