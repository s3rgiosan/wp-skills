#!/usr/bin/env bash
# install.sh: installs wp-project-security-audit skill into a Claude config dir
#
# Usage:
#   bash install.sh                              # → ~/.claude (default)
#   CLAUDE_CONFIG_DIR=~/.some-other-dir bash install.sh # → custom config dir

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_NAME="wp-project-security-audit"
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
if [ ! -d "$CLAUDE_CONFIG_DIR/skills/wp-plugin-code-audit" ] || [ ! -d "$CLAUDE_CONFIG_DIR/skills/wp-theme-code-audit" ]; then
  echo "Note: $SKILL_NAME requires wp-plugin-code-audit and wp-theme-code-audit."
  echo "      From the repo root: bash wp-plugin-code-audit/install.sh && bash wp-theme-code-audit/install.sh"
  echo ""
fi
echo "Try it:"
echo "  \"Audit this WordPress project for security issues.\""
echo "  \"Is this site safe as deployed? Check every plugin and theme.\""
echo "  \"Run a vulnerability sweep over this wp-content repo.\""
echo "  \"A vendor we use was compromised: are we affected?\""
echo ""
