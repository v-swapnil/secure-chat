# Secure Chat + Random Matching System

End-to-end encrypted chat system with two modes:

1. **Secure Direct Chat** - Between verified users with full E2EE
2. **Secure Random Match Chat** - Server pairs anonymized users based on questionnaire

## 🌟 Features

- **Zero Message Storage** - Server never stores messages
- **End-to-End Encryption** - X3DH + Double Ratchet protocol
- **Perfect Forward Secrecy** - Automatic key rotation
- **2FA Required** - Email/Phone verification
- **Anonymous Matching** - Privacy-preserving questionnaire matching
- **Real-time** - WebSocket-based messaging
- **Fingerprint Verification** - Manual safety number comparison

## 📚 Documentation

- **[QUICKSTART.md](./QUICKSTART.md)** - Get started in 5 minutes
- **[PROJECT_SUMMARY.md](./PROJECT_SUMMARY.md)** - Complete technical overview
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Production deployment guide
- **[SECURITY.md](./SECURITY.md)** - Security audit checklist and threat model

## 🚀 Quick Start

### Prerequisites

- Go 1.21+ or Node.js 18+ (for manual setup)
- Docker & Docker Compose (for containerized setup)
- PostgreSQL 15+ (or use Docker)

### Using Docker (Recommended)

```bash
# Clone and navigate to project
cd secret-project

# Deploy with one command
./deploy.sh
```

- Backend: http://localhost:8080
- Frontend: http://localhost:3000

### Manual Setup

**Backend:**
```bash
cd backend
cp .env.example .env
go mod download
go run cmd/server/main.go
```

**Frontend:**
```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

See **[QUICKSTART.md](./QUICKSTART.md)** for detailed instructions.

## Security Model

### Cryptography Stack

- **Curve25519** - ECDH key agreement
- **X3DH** - Initial key exchange
- **Double Ratchet** - Message encryption with PFS
- **XChaCha20-Poly1305** - Symmetric encryption
- **HKDF-SHA256** - Key derivation

### What Server Stores

- Identity public keys
- Signed pre-keys
- One-time pre-keys
- Device metadata (ID, last online)

### What Server NEVER Stores

- Messages
- Message metadata
- Questionnaires
- Session keys
- IP logs (optional privacy mode)

## API Endpoints

### Authentication

- `POST /api/v1/auth/register` - Register new user with 2FA
- `POST /api/v1/auth/verify` - Verify 2FA code
- `POST /api/v1/auth/login` - Login with credentials

### Key Management

- `GET /api/v1/keys/identity/:userId` - Get user's identity key
- `POST /api/v1/keys/prekeys` - Upload pre-keys
- `GET /api/v1/keys/prekeys/:userId` - Get user's pre-keys

### Matching

- `POST /api/v1/match/queue` - Join matching queue
- `GET /api/v1/match/status` - Check match status
- `DELETE /api/v1/match/queue` - Leave queue

### WebSocket Events

- `init_session` - Initialize encrypted session
- `encrypted_message` - Send/receive encrypted message
- `presence_update` - Online/offline status
- `end_session` - Terminate session

## Development

### Running Tests

```bash
# Backend
cd backend
go test ./...

# Frontend
cd frontend
npm test
```

### Database Migrations

```bash
cd backend
go run cmd/migrate/main.go up
```

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for production deployment guide.

## Security Checklist

See [SECURITY.md](./SECURITY.md) for security audit checklist and threat model.

## License

MIT License - See LICENSE file for details

## Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## Disclaimer

This is a proof-of-concept implementation. Please conduct a thorough security audit before using in production.
