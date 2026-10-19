#!/usr/bin/env bash
# install.sh: installs wp-pr-review skill into a Claude config dir
#
# Usage:
#   bash install.sh                              # → ~/.claude (default)
#   CLAUDE_CONFIG_DIR=~/.some-other-dir bash install.sh # → custom config dir

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_NAME="wp-pr-review"
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
echo "Done! $SKILL_NAME is ready. It requires wp-mnemon: bash ../wp-mnemon/install.sh"
echo ""
echo "Try it:"
echo "  \"Review https://github.com/example-org/example-site/pull/12\""
echo "  \"Code review PR #12 against ticket ACME-101\""
echo "  \"Draft review comments for this merge request\""
echo ""
