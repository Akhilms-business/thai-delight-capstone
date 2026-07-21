# AWS Deployment Runbook — Thai Delight Restaurant Capstone

Follow these phases in order. Each phase maps to a rubric section. Take screenshots as
you go (console pages, CloudWatch dashboards, terminal output) — you need these for
your final report.

---
## Phase A — VPC & Networking (Rubric §2, §4)

1. **VPC** → Create VPC: `10.0.0.0/16`, name `thaidelight-vpc`.
2. **Subnets** (pick an AZ, e.g. `us-east-1a` and `us-east-1b` for redundancy):
   - `public-subnet-1`: `10.0.1.0/24` (AZ-a)
   - `private-app-subnet-1`: `10.0.2.0/24` (AZ-a)
   - `private-db-subnet-1`: `10.0.3.0/24` (AZ-a)
   - `private-db-subnet-2`: `10.0.4.0/24` (AZ-b) — RDS requires 2 AZs for a DB subnet group
3. **Internet Gateway**: create, attach to `thaidelight-vpc`.
4. **NAT Gateway**: create in `public-subnet-1`, allocate an Elastic IP for it.
5. **Route Tables**:
   - `public-rt`: `0.0.0.0/0 → Internet Gateway`. Associate with `public-subnet-1`.
   - `private-rt`: `0.0.0.0/0 → NAT Gateway`. Associate with both private subnets.
6. **Security Groups**:
   - `alb-sg`: inbound 80/443 from `0.0.0.0/0`
   - `app-sg`: inbound 3000 (or 80/443 if Nginx is on the box) **only from `alb-sg`**; inbound 22 only from your IP
   - `db-sg`: inbound 5432 **only from `app-sg`**

---
## Phase B — RDS PostgreSQL (Rubric §2)

1. RDS → Create database → PostgreSQL → Free tier (or `db.t3.micro`)
2. DB instance identifier: `thaidelight-db`
3. Master username: `thaidelight_admin`, generate a strong password (save in a password manager, not in code)
4. VPC: `thaidelight-vpc`; DB Subnet Group: create using the two private DB subnets
5. Public access: **No**
6. VPC security group: `db-sg`
7. Once available, copy the **endpoint** (e.g. `thaidelight-db.xxxxx.us-east-1.rds.amazonaws.com`) into your `.env` as `DB_HOST`
8. From your EC2 instance (once launched in Phase C), run the schema:
   ```bash
   psql -h <DB_HOST> -U thaidelight_admin -d postgres -c "CREATE DATABASE thaidelight;"
   psql -h <DB_HOST> -U thaidelight_admin -d thaidelight -f backend/models/schema.sql
   ```

---
## Phase C — EC2 + Linux Administration (Rubric §3)

1. Launch EC2 → Ubuntu 22.04 LTS, `t2.micro` (free tier), subnet: `private-app-subnet-1`, security group: `app-sg`
2. Key pair: create new, download the `.pem`, `chmod 400 key.pem`
3. Since it's in a private subnet, connect via **Session Manager (SSM)** or a bastion host in the public subnet. Simplest for a capstone: attach an IAM role with `AmazonSSMManagedInstanceCore` to the EC2 instance, then:
   ```bash
   aws ssm start-session --target <instance-id>
   ```
4. **Harden SSH** (if you do use SSH via a bastion):
   ```bash
   sudo nano /etc/ssh/sshd_config
   # Set: PermitRootLogin no
   # Set: PasswordAuthentication no
   sudo systemctl restart ssh
   sudo apt install fail2ban -y
   sudo systemctl enable --now fail2ban
   ```
5. **Install Docker & Nginx**:
   ```bash
   sudo apt update && sudo apt upgrade -y
   sudo apt install -y nginx docker.io
   sudo systemctl enable --now docker nginx
   sudo usermod -aG docker $USER
   ```
6. **Deploy the app** (manually first, then via CI/CD later):
   ```bash
   mkdir -p ~/thai-delight && cd ~/thai-delight
   # copy your .env file here (scp it, or create it directly with nano)
   docker run -d --name thai-delight-backend --env-file .env -p 3000:3000 --restart unless-stopped \
     <yourdockerhubusername>/thai-delight-backend:latest
   ```
7. **Configure Nginx**: copy `nginx/thaidelight.conf` and `nginx/proxy_params.conf` from this repo to
   `/etc/nginx/sites-available/`, symlink into `sites-enabled/`, then:
   ```bash
   sudo nginx -t && sudo systemctl reload nginx
   ```
8. **HTTPS cert** (only works if this box is reachable — if fully private, terminate TLS at the ALB/CloudFront instead and use HTTP internally):
   ```bash
   sudo apt install certbot python3-certbot-nginx -y
   sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
   ```
9. **Backup script + cron** (DB + media → S3):
   ```bash
   cat << 'EOF' > ~/backup.sh
   #!/bin/bash
   DATE=$(date +%F)
   pg_dump -h <DB_HOST> -U thaidelight_admin thaidelight > /tmp/db-$DATE.sql
   aws s3 cp /tmp/db-$DATE.sql s3://thai-delight-backups/db/db-$DATE.sql
   rm /tmp/db-$DATE.sql
   EOF
   chmod +x ~/backup.sh
   crontab -e
   # add: 0 2 * * * /home/ubuntu/backup.sh   (runs daily at 2am)
   ```
10. **Log rotation**: Ubuntu ships with `logrotate`; add a config for Nginx/app logs at
    `/etc/logrotate.d/thaidelight` if you want custom retention (default Nginx logrotate is usually already installed).

---
## Phase D — ALB + Target Groups (Rubric §4)

1. EC2 → Target Groups → create, target type: instance, protocol HTTP:3000 (or 80 if Nginx handles it), health check path `/health`
2. Register your EC2 instance
3. EC2 → Load Balancers → Create Application Load Balancer, internet-facing, subnets: both public subnets, security group: `alb-sg`
4. Listener: HTTPS:443 → forward to target group. Attach an **ACM certificate** for your domain (Certificate Manager → Request public certificate → validate via DNS in Route 53)
5. Add an HTTP:80 → redirect to HTTPS:443 listener

---
## Phase E — Route 53 (Rubric §4)

1. Register or use existing domain
2. Create a Hosted Zone for your domain
3. Create an **A record (Alias)** → pointing to your ALB (or CloudFront distribution, if using one in front)

---
## Phase F — S3 + CloudFront (Rubric §2)

1. **S3 bucket for menu images**: create `thai-delight-menu-images`, block all public access, use bucket policy to allow only CloudFront Origin Access Control (OAC) to read
2. **S3 bucket for backups**: create `thai-delight-backups`, fully private
3. **IAM Role for EC2**: create a role with a policy allowing `s3:PutObject`/`s3:GetObject` on the menu-images bucket and `s3:PutObject` on backups bucket. Attach this role to your EC2 instance — do **not** put AWS access keys in `.env` in production.
4. **CloudFront distribution**: origin = your S3 bucket (for static assets/images) and/or your ALB (for the app); enables CDN caching and free DDoS protection at the edge.

---
## Phase G — CI/CD (Rubric §6)

1. Push this repo to GitHub
2. In GitHub repo → Settings → Secrets and variables → Actions, add:
   - `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN` (Docker Hub access token)
   - `EC2_HOST` (public IP of a bastion, or use SSM instead — see note below)
   - `EC2_USER` (usually `ubuntu`)
   - `EC2_SSH_KEY` (private key contents)
3. The workflow at `.github/workflows/deploy.yml` will: install deps → run `npm audit` → build Docker image → push to Docker Hub → SSH into EC2 → pull + restart the container → verify `/health`
4. **Note**: if your EC2 is fully private (no public IP, SSM only), replace the SSH deploy step with an SSM `send-command` step instead — ask me and I'll rewrite that job for you.

---
## Phase H — CloudWatch Monitoring (Rubric §7)

1. Install the CloudWatch agent on EC2:
   ```bash
   sudo apt install -y amazon-cloudwatch-agent
   sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -c file:cw-agent-config.json -s
   ```
2. Set up alarms:
   - CPUUtilization > 80% for 5 min → SNS email alert
   - ALB target `UnHealthyHostCount` > 0 → SNS alert
   - Custom metric/alarm on repeated `login_failed` rows in `auth_events` (query via a small Lambda + CloudWatch custom metric, or simply review `/api/admin/auth-events` regularly for the capstone's purposes)
3. Take screenshots of: the CloudWatch dashboard, at least one configured alarm, and the ALB health check status — these go directly into your final report (Image 2 requirement).

---
## Cost note
Everything above fits in AWS Free Tier for 12 months if you stay on `t2.micro`/`db.t3.micro` and don't leave NAT Gateway running 24/7 for months unnecessarily (NAT Gateway is the one component that isn't free — budget ~$0.045/hr + data). Shut it down between work sessions if cost is a concern, and document that decision in your report.
