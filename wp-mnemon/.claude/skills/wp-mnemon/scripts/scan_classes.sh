#!/usr/bin/env bash
# scan_classes.sh — Scan a WordPress plugin for class architecture
# Usage: bash scan_classes.sh /path/to/plugin

set -euo pipefail

PLUGIN_DIR="${1:?Usage: scan_classes.sh /path/to/plugin}"

if [ ! -d "$PLUGIN_DIR" ]; then
  echo "ERROR: Directory not found: $PLUGIN_DIR" >&2
  exit 1
fi

echo "============================================"
echo "CLASS ARCHITECTURE SCAN: $PLUGIN_DIR"
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
echo "### CLASS DEFINITIONS ###"
scan "class declarations" "^\s*class\s"
scan "abstract classes" "^\s*abstract\s*class\s"
scan "final classes" "^\s*final\s*class\s"
scan "interface declarations" "^\s*interface\s"
scan "trait declarations" "^\s*trait\s"
scan "enum declarations" "^\s*enum\s"

echo ""
echo "### INHERITANCE & IMPLEMENTATION ###"
scan "extends" "\sextends\s"
scan "implements" "\simplements\s"

echo ""
echo "### USE STATEMENTS (namespace imports & trait usage) ###"
scan "use statements" "^\s*use\s"

echo ""
echo "### AUTOLOADING ###"
scan "spl_autoload_register" "spl_autoload_register\s*("
scan "composer autoload" "vendor/autoload"

echo ""
echo "### FILE LOADING ###"
scan "require_once" "require_once\s*("
scan "include_once" "include_once\s*("

echo ""
echo "### INSTANTIATION PATTERNS ###"
scan "Singleton getInstance" "getInstance\s*("
scan "new self / new static" "new\s*self\|new\s*static"
scan "Factory/create methods" "function\s*create\s*(\|function\s*make\s*(\|function\s*factory\s*("

echo ""
echo "### NAMESPACES ###"
scan "namespace declarations" "^\s*namespace\s"

echo ""
echo "### CONSTANTS ###"
scan "class constants" "^\s*const\s"
scan "define statements" "define\s*("

echo ""
echo "============================================"
echo "SCAN COMPLETE"
echo "============================================"
