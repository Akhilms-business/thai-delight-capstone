# Thai Delight Restaurant — Cloud-Based Secure Web Application (DevSecOps Capstone)

A full-stack, secure, cloud-deployed web application for Thai Delight Restaurant
(Springdale, AR), built to demonstrate AWS infrastructure, Linux administration,
networking, cyber security, DevOps/CI-CD, and monitoring.

## Stack
- **Frontend**: Static HTML/CSS/JS (original site design), served by the backend or S3/CloudFront
- **Backend**: Node.js + Express (REST API)
- **Database**: PostgreSQL (AWS RDS in production, Docker locally)
- **Auth**: JWT + bcrypt, role-based access control (user/admin)
- **File storage**: AWS S3 (menu images)
- **Reverse proxy / TLS**: Nginx
- **Containerization**: Docker
- **CI/CD**: GitHub Actions
- **Monitoring**: AWS CloudWatch

## Project Structure
```
thai-delight/
├── backend/                # Express API
│   ├── config/db.js         # PostgreSQL connection pool (parameterized queries)
│   ├── middleware/           # auth (JWT/RBAC), security (helmet/rate-limit)
│   ├── routes/               # auth, reservations, menu, admin
│   ├── models/schema.sql     # DB schema
│   ├── scripts/create-admin.js
│   ├── Dockerfile
│   └── server.js
├── frontend/
│   ├── index.html            # Public site (reservations now hit the real API)
│   └── admin.html            # Admin dashboard (login, manage reservations/menu/users)
├── nginx/                   # Reverse proxy configs for the EC2 instance
├── .github/workflows/deploy.yml   # CI/CD pipeline
├── docs/
│   ├── ARCHITECTURE.md       # System architecture (for your report)
│   └── AWS_DEPLOYMENT_GUIDE.md   # Step-by-step AWS console/CLI runbook
└── docker-compose.yml       # Local dev environment
```

## Running Locally (before touching AWS)
1. Install Docker Desktop
2. From the project root:
   ```bash
   docker compose up --build
   ```
3. This starts Postgres (schema auto-loaded) + the backend on `http://localhost:3000`
4. Open `frontend/index.html` directly in a browser, or visit `http://localhost:3000`
   (the backend also serves the frontend as static files)
5. Create your first admin account:
   ```bash
   docker exec -it thai-delight-backend node scripts/create-admin.js "Admin" "User" admin@thaidelight.com "StrongPassw0rd!"
   ```
6. Visit `http://localhost:3000/admin.html`, log in with the admin credentials, and manage reservations/menu/users.

## Deploying to AWS
Follow `docs/AWS_DEPLOYMENT_GUIDE.md` phase by phase — it covers VPC, EC2, RDS, S3,
CloudFront, ALB, Route 53, CI/CD secrets, and CloudWatch, in the order you should do them.

## Security Checklist (for your report)
- [x] Passwords hashed with bcrypt (cost factor 12)
- [x] JWT auth with 2h expiry, RBAC via `requireRole()`
- [x] All SQL via parameterized queries (`pg` with `$1, $2...`) — no string concatenation
- [x] Input validation/sanitization via `express-validator` on every route
- [x] Rate limiting: general (100/15min) + strict on auth (8/15min)
- [x] Security headers via `helmet` (CSP, X-Frame-Options, HSTS via Nginx)
- [x] CORS restricted to your domain in production
- [x] Non-root Docker user
- [x] IAM role on EC2 instead of static AWS keys
- [x] Failed login attempts logged to `auth_events` table
- [ ] You should still: run `npm audit`, consider adding automated tests, and review
      the OWASP Top 10 checklist against this app for your report's security section.

## Next Steps
1. Push this to a GitHub repo (`git init && git add . && git commit -m "Initial capstone commit"`)
2. Set up the GitHub Actions secrets listed in `docs/AWS_DEPLOYMENT_GUIDE.md` Phase G
3. Follow the AWS deployment guide phase by phase, taking screenshots as you go
4. Assemble your final report using `docs/ARCHITECTURE.md` as the architecture section
