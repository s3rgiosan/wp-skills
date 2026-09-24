#!/usr/bin/env bash
# install.sh — installs wp-v0-to-block-theme skill into a Claude config dir
#
# Usage:
#   bash install.sh                              # → ~/.claude (default)
#   CLAUDE_CONFIG_DIR=~/.some-other-dir bash install.sh # → custom config dir

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_NAME="wp-v0-to-block-theme"
SKILL_SRC="$SCRIPT_DIR/skills/$SKILL_NAME"
CLAUDE_CONFIG_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"

echo ""
echo "Installing $SKILL_NAME..."
echo ""

mkdir -p "$CLAUDE_CONFIG_DIR/skills"
rm -rf "$CLAUDE_CONFIG_DIR/skills/$SKILL_NAME"
cp -r "$SKILL_SRC" "$CLAUDE_CONFIG_DIR/skills/$SKILL_NAME"
find "$CLAUDE_CONFIG_DIR/skills/$SKILL_NAME" -name '.DS_Store' -delete
echo "  ✓ Installed → $CLAUDE_CONFIG_DIR/skills/$SKILL_NAME"

echo ""
echo "Done! $SKILL_NAME is ready."
echo ""
echo "Try it:"
echo "  \"Turn this v0 design into a WordPress block theme: <deployed-url>\""
echo "  \"Map this Tailwind config to theme.json.\""
echo ""
