#!/usr/bin/env bash
# install.sh — installs wp-plugin-code-audit skill into a Claude config dir
#
# Usage:
#   bash install.sh                              # → ~/.claude (default)
#   CLAUDE_CONFIG_DIR=~/.some-other-dir bash install.sh # → custom config dir

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_NAME="wp-plugin-code-audit"
SKILL_SRC="$SCRIPT_DIR/skills/$SKILL_NAME"
CLAUDE_CONFIG_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"

echo ""
echo "Installing $SKILL_NAME..."
echo ""

mkdir -p "$CLAUDE_CONFIG_DIR/skills"
rm -rf "$CLAUDE_CONFIG_DIR/skills/$SKILL_NAME"
cp -r "$SKILL_SRC" "$CLAUDE_CONFIG_DIR/skills/$SKILL_NAME"
echo "  ✓ Installed → $CLAUDE_CONFIG_DIR/skills/$SKILL_NAME"

echo ""
echo "Done! $SKILL_NAME is ready."
echo ""
echo "Try it:"
echo "  \"Audit this plugin for security issues.\""
echo "  \"Is this plugin safe to install on production?\""
echo "  \"Review the akismet plugin from wp.org — code audit.\""
echo "  \"Audit https://github.com/example/wp-plugin at v1.2.3.\""
echo ""
