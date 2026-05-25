#!/usr/bin/env bash
# scan_hooks.sh — Scan a WordPress plugin directory for all hook usage
# Usage: bash scan_hooks.sh /path/to/plugin

set -euo pipefail

PLUGIN_DIR="${1:?Usage: scan_hooks.sh /path/to/plugin}"

if [ ! -d "$PLUGIN_DIR" ]; then
  echo "ERROR: Directory not found: $PLUGIN_DIR" >&2
  exit 1
fi

echo "============================================"
echo "HOOK SCAN: $PLUGIN_DIR"
echo "============================================"

scan() {
  local label="$1"
  local pattern="$2"
  local results
  results=$(grep -rn --include="*.php" "$pattern" "$PLUGIN_DIR" 2>/dev/null || true)
  if [ -n "$results" ]; then
    echo ""
    echo "--- $label ---"
    echo "$results"
  fi
}

echo ""
echo "### HOOKS REGISTERED (plugin listens to WP/others) ###"
scan "add_action" "add_action\s*("
scan "add_filter" "add_filter\s*("
scan "remove_action" "remove_action\s*("
scan "remove_filter" "remove_filter\s*("

echo ""
echo "### HOOKS EXPOSED (extension points for other plugins) ###"
scan "do_action" "do_action\s*("
scan "apply_filters" "apply_filters\s*("
scan "do_action_ref_array" "do_action_ref_array\s*("
scan "apply_filters_ref_array" "apply_filters_ref_array\s*("

echo ""
echo "### HOOK CHECKS ###"
scan "has_action" "has_action\s*("
scan "has_filter" "has_filter\s*("
scan "doing_action" "doing_action\s*("

echo ""
echo "============================================"
echo "SCAN COMPLETE"
echo "============================================"
