# Deployment Guide

## Prerequisites

- Docker & Docker Compose (for containerized deployment)
- Go 1.21+ (for manual deployment)
- Node.js 18+ (for manual deployment)
- PostgreSQL 15+ (for manual deployment)
- Redis 7+ (optional, for sessions and rate limiting)

## Quick Start with Docker

1. Clone the repository and navigate to the project root:

```bash
cd secret-project
```

2. Copy environment files:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

3. Edit `.env` files with your configuration (especially change JWT_SECRET and database password)

4. Build and start all services:

```bash
docker-compose up --build
```

Services will be available at:
- Frontend: http://localhost:3000
- Backend API: http://localhost:8080
- PostgreSQL: localhost:5432
- Redis: localhost:6379

## Manual Deployment

### Backend

1. Set up PostgreSQL database:

```bash
createdb securechat
```

2. Configure environment:

```bash
cd backend
cp .env.example .env
# Edit .env with your settings
```

3. Install dependencies and build:

```bash
go mod download
go build -o server cmd/server/main.go
```

4. Run migrations and start server:

```bash
./server
```

### Frontend

1. Install dependencies:

```bash
cd frontend
npm install
```

2. Configure environment:

```bash
cp .env.example .env
# Edit .env with backend URL
```

3. Build for production:

```bash
npm run build
```

4. Serve with nginx or any static file server:

```bash
npm run preview  # For testing
# Or deploy dist/ folder to your web server
```

## Production Deployment

### Security Checklist

- [ ] Change all default passwords and secrets
- [ ] Use HTTPS (TLS) for all connections
- [ ] Configure firewall rules
- [ ] Enable rate limiting
- [ ] Set up monitoring and logging
- [ ] Regular security audits
- [ ] Backup database regularly

### Environment Variables (Production)

**Backend:**

```bash
ENV=production
PORT=8080
DATABASE_URL=postgres://user:password@host:5432/db?sslmode=require
REDIS_URL=redis://host:6379/0
JWT_SECRET=<generate-strong-secret>
CORS_ALLOWED_ORIGINS=https://yourdomain.com
SMTP_HOST=smtp.provider.com
SMTP_PORT=587
SMTP_USER=your-email
SMTP_PASSWORD=your-password
```

**Frontend:**

```bash
VITE_API_URL=https://api.yourdomain.com
VITE_WS_URL=wss://api.yourdomain.com
```

### Nginx Configuration (Production)

**Backend Proxy:**

```nginx
server {
    listen 443 ssl http2;
    server_name api.yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Kubernetes Deployment (Optional)

Create Kubernetes manifests in `k8s/` directory:

- `backend-deployment.yaml`
- `frontend-deployment.yaml`
- `postgres-statefulset.yaml`
- `redis-deployment.yaml`
- `ingress.yaml`

Deploy with:

```bash
kubectl apply -f k8s/
```

## Monitoring

Recommended tools:
- **Prometheus** - Metrics collection
- **Grafana** - Visualization
- **Loki** - Log aggregation
- **Jaeger** - Distributed tracing

## Scaling

### Horizontal Scaling

- Multiple backend instances behind load balancer
- Redis for session storage (already configured)
- PostgreSQL read replicas for heavy read workloads

### Vertical Scaling

- Increase container resources in `docker-compose.yml`
- Optimize database indexes
- Enable connection pooling

## Backup & Recovery

### Database Backup

```bash
# Backup
docker-compose exec postgres pg_dump -U securechat securechat > backup.sql

# Restore
docker-compose exec -T postgres psql -U securechat securechat < backup.sql
```

### Automated Backups

Set up cron job:

```bash
0 2 * * * /path/to/backup-script.sh
```

## Troubleshooting

### Backend won't start

- Check DATABASE_URL is correct
- Verify PostgreSQL is running
- Check logs: `docker-compose logs backend`

### Frontend can't connect to backend

- Verify CORS settings in backend
- Check VITE_API_URL in frontend .env
- Verify network connectivity

### WebSocket connection fails

- Ensure proxy supports WebSocket upgrade
- Check firewall rules
- Verify WS_URL configuration

## Support

For issues and questions:
- GitHub Issues: [repository-url]
- Documentation: [docs-url]
