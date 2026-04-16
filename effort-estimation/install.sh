#!/usr/bin/env bash
# install.sh — installs effort-estimation skill into a Claude config dir
#
# Usage:
#   bash install.sh                              # → ~/.claude (default)
#   CLAUDE_HOME=~/.some-other-dir bash install.sh # → custom config dir

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_NAME="effort-estimation"
SKILL_SRC="$SCRIPT_DIR/.claude/skills/$SKILL_NAME"
CLAUDE_HOME="${CLAUDE_HOME:-$HOME/.claude}"

echo ""
echo "Installing $SKILL_NAME..."
echo ""

mkdir -p "$CLAUDE_HOME/skills"
rm -rf "$CLAUDE_HOME/skills/$SKILL_NAME"
cp -r "$SKILL_SRC" "$CLAUDE_HOME/skills/$SKILL_NAME"
echo "  ✓ Installed → $CLAUDE_HOME/skills/$SKILL_NAME"

echo ""
echo "Done! $SKILL_NAME is ready."
echo ""
echo "Try it:"
echo "  \"How long would it take to build a custom Gutenberg block with inner blocks?\""
echo "  \"Estimate: migrate a Next.js pages router app to the app router.\""
echo ""
