#!/bin/bash

# Secure Chat Deployment Script

set -e

echo "🚀 Starting deployment..."

# Check if docker-compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "❌ docker-compose is not installed. Please install it first."
    exit 1
fi

# Check if .env files exist
if [ ! -f backend/.env ]; then
    echo "⚠️  backend/.env not found. Copying from example..."
    cp backend/.env.example backend/.env
    echo "⚠️  Please edit backend/.env with your configuration before continuing."
    exit 1
fi

if [ ! -f frontend/.env ]; then
    echo "⚠️  frontend/.env not found. Copying from example..."
    cp frontend/.env.example frontend/.env
    echo "⚠️  Please edit frontend/.env with your configuration before continuing."
    exit 1
fi

# Build and start services
echo "📦 Building Docker images..."
docker-compose build

echo "🔧 Starting services..."
docker-compose up -d

echo "⏳ Waiting for services to be ready..."
sleep 10

# Check if services are running
if docker-compose ps | grep -q "Up"; then
    echo "✅ Deployment successful!"
    echo ""
    echo "📍 Services are running at:"
    echo "   Frontend: http://localhost:3000"
    echo "   Backend:  http://localhost:8080"
    echo "   PostgreSQL: localhost:5432"
    echo "   Redis: localhost:6379"
    echo ""
    echo "📝 View logs with: docker-compose logs -f"
    echo "🛑 Stop services with: docker-compose down"
else
    echo "❌ Deployment failed. Check logs with: docker-compose logs"
    exit 1
fi
