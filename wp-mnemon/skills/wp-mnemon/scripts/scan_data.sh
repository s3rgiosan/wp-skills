#!/usr/bin/env bash
# scan_data.sh — Scan a WordPress plugin for data structures
# Usage: bash scan_data.sh /path/to/plugin

set -euo pipefail

PLUGIN_DIR="${1:?Usage: scan_data.sh /path/to/plugin}"

if [ ! -d "$PLUGIN_DIR" ]; then
  echo "ERROR: Directory not found: $PLUGIN_DIR" >&2
  exit 1
fi

echo "============================================"
echo "DATA STRUCTURE SCAN: $PLUGIN_DIR"
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
echo "### CUSTOM POST TYPES ###"
scan "register_post_type" "register_post_type\s*("

echo ""
echo "### CUSTOM TAXONOMIES ###"
scan "register_taxonomy" "register_taxonomy\s*("

echo ""
echo "### POST META ###"
scan "add_post_meta" "add_post_meta\s*("
scan "update_post_meta" "update_post_meta\s*("
scan "get_post_meta" "get_post_meta\s*("
scan "delete_post_meta" "delete_post_meta\s*("
scan "register_meta" "register_meta\s*("

echo ""
echo "### USER META ###"
scan "get_user_meta" "get_user_meta\s*("
scan "update_user_meta" "update_user_meta\s*("
scan "add_user_meta" "add_user_meta\s*("

echo ""
echo "### OPTIONS & SETTINGS ###"
scan "get_option" "get_option\s*("
scan "update_option" "update_option\s*("
scan "add_option" "add_option\s*("
scan "delete_option" "delete_option\s*("
scan "register_setting" "register_setting\s*("
scan "add_settings_section" "add_settings_section\s*("
scan "add_settings_field" "add_settings_field\s*("

echo ""
echo "### ADMIN PAGES ###"
scan "add_menu_page" "add_menu_page\s*("
scan "add_submenu_page" "add_submenu_page\s*("
scan "add_options_page" "add_options_page\s*("

echo ""
echo "### CUSTOM DATABASE TABLES ###"
scan "dbDelta" "dbDelta\s*("
scan "wpdb->query" "\$wpdb->query\s*("
scan "wpdb->prefix (table refs)" "\$wpdb->prefix\s*\."
scan "wpdb->get_results" "\$wpdb->get_results\s*("
scan "wpdb->insert" "\$wpdb->insert\s*("
scan "wpdb->update" "\$wpdb->update\s*("
scan "wpdb->delete" "\$wpdb->delete\s*("

echo ""
echo "### TRANSIENTS & CACHE ###"
scan "set_transient" "set_transient\s*("
scan "get_transient" "get_transient\s*("
scan "delete_transient" "delete_transient\s*("
scan "wp_cache_set" "wp_cache_set\s*("
scan "wp_cache_get" "wp_cache_get\s*("

echo ""
echo "### REST API ###"
scan "register_rest_route" "register_rest_route\s*("

echo ""
echo "### SHORTCODES ###"
scan "add_shortcode" "add_shortcode\s*("

echo ""
echo "### BLOCKS ###"
scan "register_block_type" "register_block_type\s*("
scan "register_block_type_from_metadata" "register_block_type_from_metadata\s*("

echo ""
echo "### CRON ###"
scan "wp_schedule_event" "wp_schedule_event\s*("
scan "wp_schedule_single_event" "wp_schedule_single_event\s*("
scan "cron_schedules filter" "cron_schedules"

echo ""
echo "### ASSETS ###"
scan "wp_enqueue_script" "wp_enqueue_script\s*("
scan "wp_enqueue_style" "wp_enqueue_style\s*("
scan "wp_register_script" "wp_register_script\s*("
scan "wp_register_style" "wp_register_style\s*("
scan "wp_localize_script" "wp_localize_script\s*("

echo ""
echo "### THIRD-PARTY INTEGRATION CHECKS ###"
scan "WooCommerce" "class_exists.*WooCommerce\|WC()\|woocommerce"
scan "ACF" "function_exists.*acf\|acf_add_local"
scan "WPML" "WPML_PLUGIN_FILE\|icl_object_id"
scan "Elementor" "class_exists.*Elementor\|elementor"
scan "Yoast SEO" "class_exists.*WPSEO\|wpseo"
scan "WP-CLI" "WP_CLI::"

echo ""
echo "============================================"
echo "SCAN COMPLETE"
echo "============================================"
