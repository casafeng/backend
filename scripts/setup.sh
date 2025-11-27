#!/bin/bash

# Setup script for AI Receptionist Backend
# This script helps initialize the project

set -e

echo "🚀 Setting up AI Receptionist Backend..."

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  echo "❌ Error: Node.js 18+ is required. Current version: $(node -v)"
  exit 1
fi

echo "✅ Node.js version: $(node -v)"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Generate Prisma client
echo "🔧 Generating Prisma client..."
npm run prisma:generate

# Check for .env file
if [ ! -f .env ]; then
  echo "⚠️  Warning: .env file not found"
  echo "   Please create .env file from .env.example and fill in your credentials"
  echo "   cp .env.example .env"
else
  echo "✅ .env file found"
fi

# Check if DATABASE_URL is set
if grep -q "your_" .env 2>/dev/null || ! grep -q "DATABASE_URL=" .env 2>/dev/null; then
  echo "⚠️  Warning: Please update .env file with your actual credentials"
fi

echo ""
echo "✨ Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Update .env file with your credentials"
echo "  2. Run database migrations: npm run prisma:migrate"
echo "  3. Start development server: npm run dev"
echo ""

