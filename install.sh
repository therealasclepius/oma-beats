#!/usr/bin/env bash
# Oma Beats user-local installer for Omarchy / Linux x86_64.
# No sudo, no auto-launch, and no changes to projects or sample libraries.
set -euo pipefail
version=0.4.0
asset="Oma-Beats-${version}-linux-x86_64.AppImage"
expected_sha256=44ed2048f6808c0ef69e16f0ccf5d0b8cb3090dc0062022217964af155434603
repo=https://github.com/therealasclepius/oma-beats
if [[ "$(uname -s)" != Linux || "$(uname -m)" != x86_64 ]]; then
  printf '%s\n' 'This installer supports Linux x86_64. Other builds:' "$repo/releases/tag/v$version" >&2
  exit 1
fi
for dependency in curl sha256sum install mktemp; do
  command -v "$dependency" >/dev/null || { printf 'Missing required command: %s\n' "$dependency" >&2; exit 1; }
done
oma_data="${XDG_DATA_HOME:-$HOME/.local/share}"
oma_apps="$HOME/Applications"
oma_tmp="$(mktemp -d)"
trap 'rm -rf -- "$oma_tmp"' EXIT
printf 'Downloading Oma Beats %s…\n' "$version"
curl --fail --location --retry 3 --proto '=https' --tlsv1.2 "$repo/releases/download/v$version/$asset" --output "$oma_tmp/$asset"
printf '%s  %s\n' "$expected_sha256" "$oma_tmp/$asset" | sha256sum --check --status
curl --fail --location --retry 3 --proto '=https' --tlsv1.2 "https://raw.githubusercontent.com/therealasclepius/oma-beats/v$version/build/icon.png" --output "$oma_tmp/icon.png"
install -d "$oma_apps" "$oma_data/applications" "$oma_data/icons/hicolor/256x256/apps"
# Rename a complete verified download atomically; running versions keep their inode.
install -m 755 "$oma_tmp/$asset" "$oma_apps/.Oma-Beats-$version.AppImage.new"
mv -f "$oma_apps/.Oma-Beats-$version.AppImage.new" "$oma_apps/Oma-Beats-$version.AppImage"
install -m 644 "$oma_tmp/icon.png" "$oma_data/icons/hicolor/256x256/apps/oma-beats-desktop.png"
oma_exec="$oma_apps/Oma-Beats-$version.AppImage"
# Quote Desktop Entry Exec special characters, including literal percent signs.
oma_exec="${oma_exec//\\/\\\\}"
oma_exec="${oma_exec//\"/\\\"}"
oma_exec="${oma_exec//\$/\\\$}"
oma_exec="${oma_exec//\`/\\\`}"
oma_exec="${oma_exec//%/%%}"
cat > "$oma_tmp/oma-beats-desktop.desktop" <<DESKTOP
[Desktop Entry]
Version=1.0
Type=Application
Name=Oma Beats Desktop
Comment=Standalone sampler and beat sequencer
Exec="$oma_exec"
Icon=oma-beats-desktop
Terminal=false
Categories=AudioVideo;Audio;Music;
StartupWMClass=oma-beats
Keywords=beats;drums;sampler;sequencer;
DESKTOP
install -m 644 "$oma_tmp/oma-beats-desktop.desktop" "$oma_data/applications/oma-beats-desktop.desktop"
if command -v update-desktop-database >/dev/null; then update-desktop-database "$oma_data/applications" || true; fi
printf '\nOma Beats %s is installed. Open “Oma Beats Desktop” from your launcher.\n' "$version"
printf 'App: %s\n' "$oma_apps/Oma-Beats-$version.AppImage"
