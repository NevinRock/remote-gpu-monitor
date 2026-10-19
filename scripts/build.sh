#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
out_dir="${1:-dist}"
mkdir -p "$out_dir"
glib-compile-schemas --strict schemas
gnome-extensions pack --force --out-dir "$out_dir" \
    --schema schemas/org.gnome.shell.extensions.remote-gpu-monitor.gschema.xml \
    --extra-source=lib --extra-source=icons/remote-gpu-panel.png \
    --extra-source=LICENSE .
