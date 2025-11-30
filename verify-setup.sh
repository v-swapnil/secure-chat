#!/bin/bash

# Setup Verification Script

echo "🔍 Verifying Secure Chat Project Setup..."
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track status
ALL_GOOD=true

# Check Go
echo -n "Checking Go installation... "
if command -v go &> /dev/null; then
    GO_VERSION=$(go version | awk '{print $3}')
    echo -e "${GREEN}✓${NC} $GO_VERSION"
else
    echo -e "${RED}✗${NC} Go not found"
    ALL_GOOD=false
fi

# Check Node.js
echo -n "Checking Node.js installation... "
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo -e "${GREEN}✓${NC} $NODE_VERSION"
else
    echo -e "${RED}✗${NC} Node.js not found"
    ALL_GOOD=false
fi

# Check Docker
echo -n "Checking Docker installation... "
if command -v docker &> /dev/null; then
    DOCKER_VERSION=$(docker --version | awk '{print $3}' | sed 's/,//')
    echo -e "${GREEN}✓${NC} $DOCKER_VERSION"
else
    echo -e "${YELLOW}!${NC} Docker not found (optional for local dev)"
fi

# Check docker-compose
echo -n "Checking docker-compose installation... "
if command -v docker-compose &> /dev/null; then
    COMPOSE_VERSION=$(docker-compose --version | awk '{print $4}' | sed 's/,//')
    echo -e "${GREEN}✓${NC} $COMPOSE_VERSION"
else
    echo -e "${YELLOW}!${NC} docker-compose not found (optional for local dev)"
fi

echo ""
echo "📂 Checking project structure..."

# Check backend files
echo -n "Backend files... "
if [ -f "backend/go.mod" ] && [ -f "backend/cmd/server/main.go" ]; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗${NC} Missing backend files"
    ALL_GOOD=false
fi

# Check frontend files
echo -n "Frontend files... "
if [ -f "frontend/package.json" ] && [ -f "frontend/src/main.tsx" ]; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${RED}✗${NC} Missing frontend files"
    ALL_GOOD=false
fi

# Check environment files
echo ""
echo "⚙️  Checking configuration..."
echo -n "Backend .env file... "
if [ -f "backend/.env" ]; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${YELLOW}!${NC} Not found (copy from .env.example)"
fi

echo -n "Frontend .env file... "
if [ -f "frontend/.env" ]; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${YELLOW}!${NC} Not found (copy from .env.example)"
fi

# Check dependencies
echo ""
echo "📦 Checking dependencies..."

# Backend dependencies
echo -n "Backend Go modules... "
cd backend 2>/dev/null
if [ -f "go.sum" ]; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${YELLOW}!${NC} Run 'go mod download' in backend/"
fi
cd ..

# Frontend dependencies
echo -n "Frontend npm packages... "
cd frontend 2>/dev/null
if [ -d "node_modules" ]; then
    echo -e "${GREEN}✓${NC}"
else
    echo -e "${YELLOW}!${NC} Run 'npm install' in frontend/"
fi
cd ..

# Check documentation
echo ""
echo "📚 Checking documentation..."
DOCS=("README.md" "DEPLOYMENT.md" "SECURITY.md" "PROJECT_SUMMARY.md" "LICENSE")
for doc in "${DOCS[@]}"; do
    echo -n "$doc... "
    if [ -f "$doc" ]; then
        echo -e "${GREEN}✓${NC}"
    else
        echo -e "${RED}✗${NC}"
        ALL_GOOD=false
    fi
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ "$ALL_GOOD" = true ]; then
    echo -e "${GREEN}✓ All checks passed!${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Set up environment files (if not done):"
    echo "     cp backend/.env.example backend/.env"
    echo "     cp frontend/.env.example frontend/.env"
    echo ""
    echo "  2. Start with Docker:"
    echo "     ./deploy.sh"
    echo ""
    echo "  3. Or start manually:"
    echo "     Backend:  cd backend && go run cmd/server/main.go"
    echo "     Frontend: cd frontend && npm run dev"
else
    echo -e "${RED}✗ Some checks failed${NC}"
    echo "Please fix the issues above before proceeding."
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
