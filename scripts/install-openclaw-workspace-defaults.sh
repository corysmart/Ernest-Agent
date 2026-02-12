#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SOURCE_DIR="$REPO_ROOT/docs/openclaw-workspace-defaults"
TARGET_DIR="${1:-$HOME/.openclaw/workspace}"

if [[ ! -d "$SOURCE_DIR" ]]; then
  echo "Source templates not found: $SOURCE_DIR" >&2
  exit 1
fi

mkdir -p "$TARGET_DIR"

cp "$SOURCE_DIR/AGENTS.md" "$TARGET_DIR/AGENTS.md"
cp "$SOURCE_DIR/BOOTSTRAP.md" "$TARGET_DIR/BOOTSTRAP.md"
cp "$SOURCE_DIR/HEARTBEAT.md" "$TARGET_DIR/HEARTBEAT.md"
cp "$SOURCE_DIR/IDENTITY.md" "$TARGET_DIR/IDENTITY.md"
cp "$SOURCE_DIR/SOUL.md" "$TARGET_DIR/SOUL.md"
cp "$SOURCE_DIR/TOOLS.md" "$TARGET_DIR/TOOLS.md"
cp "$SOURCE_DIR/USER.md" "$TARGET_DIR/USER.md"

echo "Installed OpenClaw workspace defaults to: $TARGET_DIR"
