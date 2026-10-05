#!/bin/sh
# Usage: build-patricia.sh <chessmod data dir>
# Builds Patricia at a pinned commit with chessmod's patch so its strength
# setting works when the engine is started fresh for every move.
# Needs git, make and a C++20 compiler (Xcode Command Line Tools on macOS).
set -e
DIR=${1:?usage: build-patricia.sh <chessmod data dir>}
SHA=67d83d7056801cfab868872d27b99d192488a316
PATCH=$(cd "$(dirname "$0")/.." && pwd)/patches/patricia-stateless-skill.diff
SRC="$DIR/build/patricia"
rm -rf "$SRC"
mkdir -p "$SRC" "$DIR/bin"
cd "$SRC"
git init -q
git fetch -q --depth 1 https://github.com/Adam-Kulju/Patricia "$SHA"
git checkout -q FETCH_HEAD
git apply "$PATCH"
make -C engine build CXXFLAGS="-O3 -std=c++20 -ffast-math -pthread" >"$DIR/build/patricia.log" 2>&1 || { tail -20 "$DIR/build/patricia.log" >&2; exit 1; }
cp engine/patricia "$DIR/bin/patricia"
cp LICENSE "$DIR/bin/patricia.LICENSE"
cd "$DIR"
rm -rf "$SRC"
