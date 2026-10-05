#!/bin/sh
# Usage: uci-once.sh <engine> [args...] < commands
# Engines quit on stdin EOF mid-search, so hold stdin open until bestmove.
out=$(mktemp)
trap 'rm -f "$out"' EXIT
{
  cat
  i=0
  while ! grep -q '^bestmove' "$out" && [ $i -lt 1500 ]; do sleep 0.02; i=$((i+1)); done
  echo quit
} | "$@" > "$out" 2>/dev/null
grep -E '^(info string|bestmove)' "$out"
