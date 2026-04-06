#!/bin/bash
# LifeFlow Sandbox Startup Script
# ================================
# Ensures clean server starts by killing zombie processes first.
# Usage: bash lifeflow/start.sh
#
# Phase 14: Fixes the "stuck on loading" issue caused by zombie
# next-server processes from previous sessions serving a stale
# .next build that returns 404 for all JS/CSS chunks.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"

echo "=== LifeFlow Startup ==="
echo "Script dir: $SCRIPT_DIR"

# ── Step 1: Kill zombie processes ────────────────────────────────────
echo ""
echo "[1/5] Killing zombie processes..."
# Kill any lingering next-server or node processes on our ports
fuser -k 3000/tcp 2>/dev/null || true
fuser -k 5000/tcp 2>/dev/null || true
sleep 1
echo "  Ports 3000 and 5000 cleared."

# ── Step 2: Verify database ─────────────────────────────────────────
echo ""
echo "[2/5] Checking database..."
if [ -f "$BACKEND_DIR/lifeflow_dev.db" ]; then
  DB_SIZE=$(stat -f%z "$BACKEND_DIR/lifeflow_dev.db" 2>/dev/null || stat -c%s "$BACKEND_DIR/lifeflow_dev.db" 2>/dev/null)
  echo "  SQLite DB: $DB_SIZE bytes"
else
  echo "  WARNING: No database found. Will be created on first run."
fi

# ── Step 3: Check if frontend needs rebuild ──────────────────────────
echo ""
echo "[3/5] Checking frontend build..."
NEEDS_BUILD=false
if [ ! -f "$FRONTEND_DIR/.next/BUILD_ID" ]; then
  echo "  No .next build found. Building..."
  NEEDS_BUILD=true
else
  # Check if any source file is newer than the build
  NEWEST_SRC=$(find "$FRONTEND_DIR/src" -name "*.js" -o -name "*.jsx" -o -name "*.css" | xargs stat -c%Y 2>/dev/null | sort -rn | head -1)
  BUILD_TIME=$(stat -c%Y "$FRONTEND_DIR/.next/BUILD_ID" 2>/dev/null || echo "0")
  if [ "$NEWEST_SRC" -gt "$BUILD_TIME" ] 2>/dev/null; then
    echo "  Source files changed since last build. Rebuilding..."
    NEEDS_BUILD=true
  else
    echo "  Build is up to date (BUILD_ID: $(cat $FRONTEND_DIR/.next/BUILD_ID))"
  fi
fi

if [ "$NEEDS_BUILD" = true ]; then
  cd "$FRONTEND_DIR"
  npx next build 2>&1
  echo "  Build complete."
fi

# ── Step 4: Start backend ───────────────────────────────────────────
echo ""
echo "[4/5] Starting backend on port 5000..."
cd "$BACKEND_DIR"
node src/index.js &
BACKEND_PID=$!
echo "  Backend PID: $BACKEND_PID"

# Wait for backend to be ready
echo "  Waiting for backend health..."
for i in $(seq 1 30); do
  if curl -s http://localhost:5000/api/v1/health > /dev/null 2>&1; then
    echo "  Backend ready!"
    break
  fi
  if [ $i -eq 30 ]; then
    echo "  WARNING: Backend health check timeout (may still be starting)"
  fi
  sleep 1
done

# ── Step 5: Start frontend ──────────────────────────────────────────
echo ""
echo "[5/5] Starting frontend on port 3000..."
cd "$FRONTEND_DIR"
npx next start -p 3000 &
FRONTEND_PID=$!
echo "  Frontend PID: $FRONTEND_PID"

# Wait for frontend
echo "  Waiting for frontend..."
for i in $(seq 1 15); do
  if curl -s http://localhost:3000/ > /dev/null 2>&1; then
    echo "  Frontend ready!"
    break
  fi
  if [ $i -eq 15 ]; then
    echo "  WARNING: Frontend health check timeout"
  fi
  sleep 1
done

# ── Verify static assets ────────────────────────────────────────────
echo ""
echo "=== Static Asset Verification ==="
BUILD_ID=$(cat "$FRONTEND_DIR/.next/BUILD_ID")
WEBPACK_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/_next/static/chunks/webpack-*.js" 2>/dev/null)
# Test first chunk file that exists
FIRST_CHUNK=$(ls "$FRONTEND_DIR/.next/static/chunks/" | head -1)
CHUNK_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/_next/static/chunks/$FIRST_CHUNK" 2>/dev/null)
echo "  Build ID: $BUILD_ID"
echo "  First chunk ($FIRST_CHUNK): HTTP $CHUNK_STATUS"
if [ "$CHUNK_STATUS" = "200" ]; then
  echo "  Static assets: OK"
else
  echo "  WARNING: Static assets returning $CHUNK_STATUS - may need rebuild"
fi

echo ""
echo "=== LifeFlow Running ==="
echo "  Backend:  http://localhost:5000"
echo "  Frontend: http://localhost:3000"
echo "  Backend PID:  $BACKEND_PID"
echo "  Frontend PID: $FRONTEND_PID"
echo ""
echo "To stop: kill $BACKEND_PID $FRONTEND_PID"

# Wait for both processes
wait
