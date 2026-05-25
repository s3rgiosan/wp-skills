#!/usr/bin/env bash
# install.sh — installs wp-mnemon skill into a Claude config dir
#
# Usage:
#   bash install.sh                              # → ~/.claude (default)
#   CLAUDE_CONFIG_DIR=~/.some-other-dir bash install.sh # → custom config dir

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_NAME="wp-mnemon"
SKILL_SRC="$SCRIPT_DIR/.claude/skills/$SKILL_NAME"
CLAUDE_CONFIG_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"

echo ""
echo "Installing $SKILL_NAME..."
echo ""

mkdir -p "$CLAUDE_CONFIG_DIR/skills"
rm -rf "$CLAUDE_CONFIG_DIR/skills/$SKILL_NAME"
cp -r "$SKILL_SRC" "$CLAUDE_CONFIG_DIR/skills/$SKILL_NAME"
chmod +x "$CLAUDE_CONFIG_DIR/skills/$SKILL_NAME/scripts/"*.sh
echo "  ✓ Installed → $CLAUDE_CONFIG_DIR/skills/$SKILL_NAME"

echo ""
echo "Done! $SKILL_NAME skill is ready."
echo ""
echo "Try it:"
echo "  \"Analyze the WordPress plugin at /path/to/plugin\""
echo "  \"Analyze https://github.com/org/plugin-repo\""
echo ""
echo "For the wp-mnemon subagent (separate install), see wp-agents/wp-mnemon."
echo ""
