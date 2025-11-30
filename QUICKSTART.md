# Quick Start Guide - Secure Chat System

## 🚀 Get Started in 5 Minutes

### Prerequisites

Before you begin, ensure you have:
- **Go 1.21+** installed ([Download](https://golang.org/dl/))
- **Node.js 18+** installed ([Download](https://nodejs.org/))
- **PostgreSQL 15+** running locally or via Docker

Optional:
- **Docker & Docker Compose** for containerized setup

---

## Option 1: Quick Docker Setup (Recommended)

The fastest way to get everything running:

```bash
# 1. Navigate to project directory
cd secret-project

# 2. Run the deployment script
./deploy.sh
```

That's it! Access the application at:
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8080

---

## Option 2: Manual Setup

### Step 1: Setup Backend

```bash
# Navigate to backend
cd backend

# Copy environment file
cp .env.example .env

# Edit .env file (update DATABASE_URL if needed)
# For local PostgreSQL:
# DATABASE_URL=postgres://user:password@localhost:5432/securechat?sslmode=disable

# Install Go dependencies
go mod download

# Start the backend server
go run cmd/server/main.go
```

Backend will start on **http://localhost:8080**

### Step 2: Setup Database

```bash
# If you don't have PostgreSQL running, start it with Docker:
docker run --name postgres-securechat \
  -e POSTGRES_USER=securechat \
  -e POSTGRES_PASSWORD=changeme \
  -e POSTGRES_DB=securechat \
  -p 5432:5432 \
  -d postgres:15-alpine

# Tables will be created automatically on first run
```

### Step 3: Setup Frontend

```bash
# Navigate to frontend (in a new terminal)
cd frontend

# Copy environment file
cp .env.example .env

# Install npm dependencies
npm install

# Start the development server
npm run dev
```

Frontend will start on **http://localhost:3000**

---

## 🎯 First Time Usage

1. **Open your browser** to http://localhost:3000

2. **Register a new account**:
   - Click "Sign up"
   - Enter email and password
   - You'll receive a 6-digit code in the console (backend terminal)
   - Enter the code to verify

3. **Login** with your credentials

4. **Try Random Match Chat**:
   - Click "Random Match Chat" on dashboard
   - Answer the questionnaire
   - Click "Start Matching"
   - Wait for a match (may need another user)

---

## 🔧 Configuration

### Backend Environment Variables

Edit `backend/.env`:

```bash
# Server
PORT=8080
ENV=development

# Database (update with your credentials)
DATABASE_URL=postgres://user:password@localhost:5432/securechat?sslmode=disable

# JWT Secret (change in production!)
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

# CORS
CORS_ALLOWED_ORIGINS=http://localhost:3000
```

### Frontend Environment Variables

Edit `frontend/.env`:

```bash
# API endpoint
VITE_API_URL=http://localhost:8080

# WebSocket endpoint
VITE_WS_URL=ws://localhost:8080
```

---

## 📝 Testing the System

### Test with Two Users

To test the random matching feature:

1. **Open two browser windows** (or use incognito mode)

2. **Register two different users** in each window

3. **Both users join random match** with similar interests

4. **They should be matched** and can chat

---

## 🛠️ Troubleshooting

### Backend won't start

**Problem**: `Failed to connect to database`

**Solution**:
```bash
# Check if PostgreSQL is running
psql -U securechat -d securechat

# If not, start PostgreSQL
# On macOS with Homebrew:
brew services start postgresql

# Or with Docker:
docker start postgres-securechat
```

### Frontend can't connect to backend

**Problem**: Network errors or CORS issues

**Solution**:
1. Verify backend is running: http://localhost:8080/health
2. Check `VITE_API_URL` in `frontend/.env`
3. Verify CORS settings in `backend/.env`

### 2FA code not appearing

**Problem**: No verification code displayed

**Solution**:
- Check backend terminal output - codes are printed there (mock implementation)
- In production, integrate with Twilio (SMS) or SendGrid (Email)

### Dependencies issues

**Backend:**
```bash
cd backend
go mod tidy
go mod download
```

**Frontend:**
```bash
cd frontend
rm -rf node_modules package-lock.json
npm install
```

---

## 📚 Next Steps

Once you have the system running:

1. **Read the Documentation**:
   - [README.md](./README.md) - Complete overview
   - [SECURITY.md](./SECURITY.md) - Security features and audit checklist
   - [DEPLOYMENT.md](./DEPLOYMENT.md) - Production deployment guide

2. **Explore the Code**:
   - Backend: `backend/internal/api/` - API handlers
   - Frontend: `frontend/src/pages/` - React pages
   - Crypto: `frontend/src/crypto/engine.ts` - Encryption logic

3. **Customize**:
   - Add your own styling
   - Implement additional features
   - Integrate real 2FA providers
   - Deploy to production

---

## 🆘 Need Help?

- **Issues**: Check the GitHub issues page
- **Documentation**: Read the full README.md
- **Security**: Review SECURITY.md for best practices

---

## ⚡ Quick Commands Reference

```bash
# Start backend
cd backend && go run cmd/server/main.go

# Start frontend
cd frontend && npm run dev

# Run tests
cd backend && go test ./...
cd frontend && npm test

# Build for production
cd backend && go build -o server cmd/server/main.go
cd frontend && npm run build

# Docker commands
./deploy.sh                    # Deploy everything
docker-compose logs -f         # View logs
docker-compose down            # Stop all services
docker-compose restart backend # Restart backend only
```

---

**Happy coding! 🎉**
