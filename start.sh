#!/bin/bash
# ─── GoKwik CSM Control Tower — One-click start (Mac/Linux/EC2) ──────────────

set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

# Check Node.js
if ! command -v node &> /dev/null; then
  echo "❌ Node.js not found. Install from https://nodejs.org (v18+ LTS)"
  exit 1
fi

NODE_VER=$(node -v | cut -c2- | cut -d. -f1)
if [ "$NODE_VER" -lt 18 ]; then
  echo "❌ Node.js v18+ required. Current: $(node -v)"
  exit 1
fi

# Install dependencies if node_modules is missing
if [ ! -d "node_modules" ]; then
  echo "📦 Installing dependencies..."
  npm install
fi

# Check .env
if [ ! -f ".env" ]; then
  echo "⚠️  No .env file found. Copying .env.example → .env"
  cp .env.example .env
  echo "⚠️  Please edit .env and add your tokens, then re-run this script."
  exit 1
fi

# Check users.json
if [ ! -f "users.json" ]; then
  echo "⚠️  No users.json found. Copying users.json.example → users.json"
  cp users.json.example users.json
  echo "⚠️  Please edit users.json and add your tokens, then re-run this script."
  exit 1
fi

# Create logs dir
mkdir -p logs

echo "🚀 Starting CSM Control Tower..."
echo "   Dashboard: http://localhost:3000/dashboard.html"
echo "   Health:    http://localhost:3000/api/health"
echo ""
echo "   Press Ctrl+C to stop."
echo ""

node server.js
