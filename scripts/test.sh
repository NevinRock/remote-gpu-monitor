#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
glib-compile-schemas --strict schemas
GSETTINGS_SCHEMA_DIR="$PWD/schemas" GSETTINGS_BACKEND=memory gjs -m tests/run.js
GSETTINGS_SCHEMA_DIR="$PWD/schemas" GSETTINGS_BACKEND=memory gjs -m tests/monitor.js
GSETTINGS_SCHEMA_DIR="$PWD/schemas" GSETTINGS_BACKEND=memory gjs -m tests/collector.js
GSETTINGS_SCHEMA_DIR="$PWD/schemas" GSETTINGS_BACKEND=memory gjs -m tests/i18n.js
