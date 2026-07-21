# Architecture — Thai Delight Restaurant (Cloud-Based Secure Web Application)

## High-Level Diagram (describe in your report / draw.io)

```
                                   Internet
                                      │
                              Route 53 (DNS)
                                      │
                              CloudFront (CDN)
                                 │         │
                        (static assets) (dynamic API passthrough, optional)
                                 │
                    ┌────────────────────────────┐
                    │      VPC (10.0.0.0/16)      │
                    │                              │
   Internet Gateway │  ┌──────────────────────┐   │
        │           │  │  Public Subnet        │   │
        └───────────┼─▶│  (10.0.1.0/24)        │   │
                    │  │  - ALB                │   │
                    │  │  - NAT Gateway         │   │
                    │  └──────────┬────────────┘   │
                    │             │                │
                    │  ┌──────────▼────────────┐   │
                    │  │  Private Subnet (App) │   │
                    │  │  (10.0.2.0/24)         │   │
                    │  │  - EC2 (Nginx + Node)  │   │
                    │  └──────────┬────────────┘   │
                    │             │                │
                    │  ┌──────────▼────────────┐   │
                    │  │  Private Subnet (DB)   │   │
                    │  │  (10.0.3.0/24)         │   │
                    │  │  - RDS PostgreSQL      │   │
                    │  └────────────────────────┘   │
                    │                              │
                    │  S3 Bucket (menu images,      │
                    │  DB backups) - accessed via   │
                    │  IAM role, not public         │
                    └──────────────────────────────┘
                                      │
                              CloudWatch (logs, metrics, alarms)
```

## Component Responsibilities

| Component | Purpose |
|---|---|
| Route 53 | DNS for your domain → CloudFront / ALB |
| CloudFront | CDN for static assets, TLS termination option, DDoS buffering |
| ALB (or Nginx alone for smaller setups) | Load balancing, health checks, TLS termination |
| EC2 (private subnet) | Runs Nginx (reverse proxy) + Node.js/Express app in Docker |
| NAT Gateway | Lets private EC2 reach the internet (e.g. `npm install`, OS updates) without being publicly reachable |
| RDS PostgreSQL (private subnet) | Persistent data: users, reservations, menu items |
| S3 | Menu image storage, and DB/media backups |
| CloudWatch | Metrics (CPU/memory/disk), log aggregation, alarms |
| IAM Roles | EC2 instance role grants S3 access — no hardcoded AWS keys anywhere |

## Data Flow: Reservation Submission
1. Browser (`index.html`) → HTTPS POST `/api/reservations` → CloudFront/ALB → Nginx → Node.js (Express)
2. Express validates input (`express-validator`), assigns `user_id` if JWT present
3. Parameterized `INSERT` into RDS `reservations` table
4. Response returned to browser; admin dashboard later reads/updates via `/api/reservations` (JWT + role=admin required)

## Data Flow: Login
1. Browser → POST `/api/auth/login` with email/password
2. Express looks up user by email (parameterized query), compares password using `bcrypt.compare`
3. On success, signs a JWT (2h expiry) containing `{id, email, role}`
4. Every subsequent request sends `Authorization: Bearer <token>`; `authenticate` middleware verifies it, `requireRole('admin')` enforces RBAC

## Security Layers (Defense in Depth)
1. **Network**: VPC with public/private subnet separation; DB and app servers not directly internet-facing; security groups allow only necessary ports (443 from ALB, 5432 from app SG only)
2. **Transport**: HTTPS/TLS everywhere (Let's Encrypt or ACM)
3. **Application**: Helmet security headers, CORS restricted to your domain, rate limiting (general + strict on auth), input validation/sanitization on every route
4. **Auth**: bcrypt (cost factor 12) password hashing, JWT with short expiry, RBAC via role checks
5. **Data**: Parameterized SQL queries everywhere (no string concatenation → no SQL injection surface)
6. **Infra**: SSH key-based auth only, root login disabled, fail2ban, non-root Docker user, IAM roles instead of static credentials
7. **Monitoring**: CloudWatch alarms on failed logins, CPU/memory thresholds, health check failures
