# LifeFlow - Deployment Guide
## دليل النشر والتشغيل

---

## 📋 Table of Contents
1. [Prerequisites](#prerequisites)
2. [Quick Start (Development)](#quick-start)
3. [Environment Configuration](#environment)
4. [Backend Deployment](#backend)
5. [Frontend Deployment](#frontend)
6. [Mobile App Build](#mobile)
7. [Docker Deployment](#docker)
8. [Production Checklist](#production)

---

## 1. Prerequisites

### System Requirements
- **Node.js**: v18+ (v20 recommended)
- **npm**: v9+
- **Git**: v2.30+
- **Flutter**: v3.16+ (for mobile app)
- **Docker & Docker Compose**: v24+ (for containerized deployment)

### Optional (Production)
- **PostgreSQL**: v14+ (SQLite used for development)
- **Redis**: v7+ (in-memory fallback available)
- **Nginx**: v1.24+ (reverse proxy)
- **PM2**: for Node.js process management

---

## 2. Quick Start (Development)

```bash
# Clone and setup
git clone <repo-url>
cd lifeflow

# Backend setup
cd backend
cp .env.example .env
# Edit .env with your values
npm install
npm run dev

# Frontend setup (new terminal)
cd ../frontend
npm install
npm run dev

# Access:
# API:      http://localhost:5000/api/v1
# Web App:  http://localhost:3000
# Health:   http://localhost:5000/health
```

### Demo Credentials
```
Email:    demo@lifeflow.app
Password: demo123456
```

---

## 3. Environment Configuration

### Backend `.env`
```bash
# Server
NODE_ENV=development
PORT=5000

# Database (SQLite for dev, PostgreSQL for prod)
USE_SQLITE=true                          # Set false for PostgreSQL
DB_NAME=lifeflow_prod
DB_USER=lifeflow
DB_PASSWORD=your_secure_password
DB_HOST=localhost
DB_PORT=5432

# JWT Secrets (generate with: openssl rand -hex 64)
JWT_SECRET=your_64_char_hex_secret_here
JWT_REFRESH_SECRET=another_64_char_hex_secret
JWT_EXPIRES_IN=24h
JWT_REFRESH_EXPIRES_IN=30d

# Redis (optional - in-memory fallback if not available)
REDIS_URL=redis://:password@localhost:6379

# Stripe (for subscription payments)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_MONTHLY=price_...
STRIPE_PRICE_YEARLY=price_...

# CORS
CORS_ORIGINS=http://localhost:3000,https://yourdomain.com
FRONTEND_URL=http://localhost:3000

# Logging
LOG_LEVEL=info
TIMEZONE=Africa/Cairo
```

### Frontend `.env.local`
```bash
NEXT_PUBLIC_API_URL=http://localhost:5000/api/v1
NEXT_PUBLIC_SOCKET_URL=http://localhost:5000
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

---

## 4. Backend Deployment

### Development
```bash
cd backend
npm install
npm run dev          # Hot reload with nodemon
```

### Production with PM2
```bash
cd backend
npm install --production
npm install -g pm2

# Start
pm2 start src/index.js --name lifeflow-api

# Auto-restart on boot
pm2 startup
pm2 save

# Logs
pm2 logs lifeflow-api
pm2 monit
```

### Database Migration
```bash
# SQLite (development - auto-synced)
USE_SQLITE=true npm start

# PostgreSQL (production)
USE_SQLITE=false npm start  # Tables created automatically on first run
```

---

## 5. Frontend Deployment

### Development
```bash
cd frontend
npm install
npm run dev              # Starts on port 3000
```

### Production Build
```bash
cd frontend
npm run build            # Creates optimized production build
npm start                # Serves production build on port 3000
```

### Deploy to Vercel
```bash
npm install -g vercel
cd frontend
vercel --prod
# Set environment variables in Vercel dashboard
```

---

## 6. Mobile App Build

### Prerequisites
```bash
flutter --version        # Should be 3.16+
flutter doctor           # Check all dependencies
```

### Development (Android Emulator)
```bash
cd mobile

# Update API URL in lib/utils/app_constants.dart
# Change: static const String apiBaseUrl = 'http://10.0.2.2:5000/api/v1';
# (10.0.2.2 maps to host machine from Android emulator)

flutter pub get
flutter run              # Runs on connected device/emulator
```

### Production Build

#### Android APK
```bash
cd mobile
flutter build apk --release
# Output: build/app/outputs/flutter-apk/app-release.apk
```

#### Android App Bundle (Google Play)
```bash
flutter build appbundle --release
# Output: build/app/outputs/bundle/release/app-release.aab
```

#### iOS (macOS required)
```bash
flutter build ios --release
# Open ios/ in Xcode for final build and submission
```

### Required Configuration for Production
1. Update `lib/utils/app_constants.dart`:
   ```dart
   static const String apiBaseUrl = 'https://api.yourdomain.com/api/v1';
   static const String socketUrl = 'https://api.yourdomain.com';
   ```

2. Add `google-services.json` (Android) and `GoogleService-Info.plist` (iOS) for Firebase push notifications

---

## 7. Docker Deployment

### Quick Start with Docker Compose
```bash
# Copy environment file
cp .env.production .env

# Build and start all services
docker-compose up -d --build

# Check status
docker-compose ps
docker-compose logs -f

# Services running:
# PostgreSQL:  port 5432
# Redis:       port 6379
# Backend API: port 5000
# Frontend:    port 3000
# Nginx:       ports 80, 443
```

### Docker Compose Services
```yaml
services:
  db:        PostgreSQL 15
  redis:     Redis 7 (with password)
  backend:   Node.js API server
  frontend:  Next.js web app
  nginx:     Reverse proxy (SSL termination)
```

### SSL Configuration (Nginx)
```bash
# Place SSL certificates in ./nginx/ssl/
mkdir -p nginx/ssl
cp /path/to/cert.pem nginx/ssl/certificate.pem
cp /path/to/key.pem  nginx/ssl/private.key

# Or use Let's Encrypt:
certbot certonly --webroot -w ./nginx/html -d yourdomain.com
```

### Individual Service Management
```bash
docker-compose restart backend
docker-compose logs backend -f
docker-compose exec backend node src/index.js
```

---

## 8. Production Checklist

### Security
- [ ] Generate strong JWT secrets (64+ hex chars)
- [ ] Set `NODE_ENV=production`
- [ ] Configure HTTPS/SSL certificates
- [ ] Set proper CORS origins (no wildcards)
- [ ] Enable rate limiting (already configured)
- [ ] Rotate Stripe webhook secrets
- [ ] Disable SQLite, use PostgreSQL

### Performance
- [ ] Enable Redis for caching
- [ ] Configure PM2 cluster mode: `pm2 start src/index.js -i max`
- [ ] Enable Nginx gzip compression
- [ ] Set proper cache headers for static assets
- [ ] Configure CDN for media assets

### Monitoring
- [ ] Set up PM2 monitoring or external APM
- [ ] Configure error alerting (Sentry, etc.)
- [ ] Set up database backups
- [ ] Configure log rotation
- [ ] Monitor SSL certificate expiry

### Database
```bash
# PostgreSQL backup
pg_dump lifeflow_prod > backup_$(date +%Y%m%d).sql

# Restore
psql lifeflow_prod < backup.sql
```

---

## 9. API Documentation

### Base URL
```
Development: http://localhost:5000/api/v1
Production:  https://api.yourdomain.com/api/v1
```

### Authentication
All protected endpoints require:
```
Authorization: Bearer <JWT_ACCESS_TOKEN>
```

### Key Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /auth/login | User login |
| POST | /auth/register | User registration |
| GET | /dashboard | Main dashboard data |
| GET/POST | /tasks | Task management |
| GET/POST | /habits | Habit tracking |
| POST | /habits/:id/checkin | Check in habit |
| GET/POST | /moods | Mood tracking |
| GET | /performance/today | Today's performance score |
| GET | /performance/dashboard | Full performance data |
| GET | /performance/coaching/daily | AI coaching message |
| GET | /performance/weekly-audit/latest | Latest weekly audit |
| GET | /performance/flags | Procrastination flags |
| GET | /performance/energy | Energy profile |
| GET | /subscription/status | Subscription status |
| GET | /subscription/plans | Available plans |
| POST | /subscription/trial/start | Start 7-day free trial |
| GET | /notifications | User notifications |
| GET | /health | Health check |

---

## 10. Troubleshooting

### Backend won't start
```bash
# Check Node.js version
node --version          # Should be 18+

# Check port availability
lsof -i :5000           # Kill if occupied

# Check database
ls -la *.sqlite         # SQLite file should exist

# Check logs
tail -f /tmp/backend.log
```

### Frontend build fails
```bash
# Clear cache
rm -rf .next node_modules
npm install
npm run build
```

### Mobile app issues
```bash
flutter clean
flutter pub get
flutter run --verbose
```

### Common Errors
- **EADDRINUSE**: Port already in use → `pkill -f "node src/index"`
- **Validation error**: SQLite schema mismatch → Delete SQLite file and restart
- **JWT expired**: Refresh token or re-login
- **CORS error**: Check `CORS_ORIGINS` env variable

---

## Support

- **Demo**: `http://localhost:3000`
- **API Health**: `http://localhost:5000/health`
- **Demo Account**: `demo@lifeflow.app` / `demo123456`
