# Secure Chat Backend (Fiber + GORM)

This repository is a secure messaging backend skeleton using Fiber (Go) and GORM (Postgres).
It implements core endpoints for registration, OTP verification, and prekey upload with
application-layer encryption (clients encrypt key bundles with server RSA public key).

## Features
- Fiber web framework
- GORM for PostgreSQL ORM
- OTP registration flow (dev-mode returns OTP)
- Prekey upload with RSA-OAEP decryption server-side
- Matchmaker and WebSocket hub skeletons
- Docker-compose for dev

## Running (dev)
1. Generate RSA keys:
```bash
openssl genrsa -out server_rsa_priv.pem 4096
openssl rsa -in server_rsa_priv.pem -pubout -out server_rsa_pub.pem
```
2. Place `server_rsa_priv.pem` where the app can read it (see .env)
3. Start postgres + app:
```bash
docker-compose up --build
```

## Notes
This is a functional skeleton and **not** production-ready out of the box.
Review TLS, HSM, secrets management, logging, and audits before production.
