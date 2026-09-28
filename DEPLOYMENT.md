# 🚀 SkyRush Aviator - Production Deployment Guide

Complete step-by-step guide to deploy SkyRush Aviator to production using:
- **Frontend**: Vercel
- **Backend**: Oracle Cloud Always Free
- **Database**: Supabase (PostgreSQL)
- **Storage**: Cloudinary

---

## 📋 Prerequisites Checklist

Before starting, ensure you have:
- [ ] GitHub account with your code repository
- [ ] Vercel account (sign up at [vercel.com](https://vercel.com))
- [ ] Oracle Cloud account ([oracle.com/cloud/free](https://www.oracle.com/cloud/free/))
- [ ] Supabase account ([supabase.com](https://supabase.com))
- [ ] Cloudinary account ([cloudinary.com](https://cloudinary.com))

---

## Part 1: Database Setup (Supabase)

### 1.1 Create Supabase Project

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Click **"New Project"**
3. Fill in:
   - **Name**: skyrush-production
   - **Database Password**: *Generate a strong password and save it securely*
   - **Region**: Choose closest to your users
4. Click **"Create new project"** (takes ~2 minutes)

### 1.2 Get Database Connection Strings

1. In your Supabase project, go to **Settings** → **Database**
2. Scroll to **Connection strings** section
3. Copy these values:

**Connection Pooler (Transaction Mode)** - for runtime queries:
```
postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true
```

**Direct Connection** - for migrations:
```
postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres
```

4. Go to **Settings** → **API**
5. Copy these values:
   - **Project URL**: `https://[ref].supabase.co`
   - **anon public key**
   - **service_role key** (keep this secret!)

### 1.3 Run Database Migrations

On your local machine:

```bash
# Copy the production environment template
cp apps/server/.env.production.example apps/server/.env

# Edit apps/server/.env and add your Supabase credentials:
# - DATABASE_URL (pooler URL)
# - DIRECT_DATABASE_URL (direct URL)

# Run migrations
cd apps/server
npm run db:push
```

This creates all tables in your Supabase database.

### 1.4 Create Admin User (Optional)

```bash
# Set up admin credentials
node create-admin.js
```

Follow the prompts to create your first admin user.

---

## Part 2: Cloudinary Setup

### 2.1 Get Cloudinary Credentials

1. Go to [Cloudinary Dashboard](https://cloudinary.com/console)
2. You'll see your credentials on the dashboard:
   - **Cloud Name**
   - **API Key**
   - **API Secret**
3. Save these for later

### 2.2 Configure Upload Preset (Optional)

1. Go to **Settings** → **Upload**
2. Scroll to **Upload presets**
3. Click **Add upload preset**
4. Configure:
   - **Preset name**: skyrush-deposits
   - **Signing mode**: Signed
   - **Folder**: skyrush/deposits
5. Save the preset

---

## Part 3: Oracle Cloud Backend Setup

### 3.1 Create Oracle Cloud VM

1. Log in to [Oracle Cloud Console](https://cloud.oracle.com)
2. Navigate to **Compute** → **Instances**
3. Click **"Create Instance"**
4. Configure:
   - **Name**: skyrush-backend
   - **Image**: Ubuntu 22.04 (Always Free eligible)
   - **Shape**: VM.Standard.E2.1.Micro (Always Free)
   - **Boot Volume**: 50GB
   - **VCN**: Create new or use existing
   - **Subnet**: Public subnet
   - **Assign Public IP**: Yes
5. **Add SSH keys**: Upload your SSH public key or generate new one
6. Click **"Create"**

### 3.2 Configure Security List

1. Go to your VCN → **Security Lists**
2. Edit the **Default Security List**
3. Add **Ingress Rule**:
   - **Source CIDR**: 0.0.0.0/0
   - **IP Protocol**: TCP
   - **Destination Port Range**: 8080
   - **Description**: SkyRush Backend
4. Save the rule

### 3.3 Connect to VM and Initial Setup

```bash
# Connect via SSH (replace with your IP and key)
ssh -i ~/.ssh/your-key.pem ubuntu@your-oracle-ip

# Clone your repository
git clone https://github.com/your-username/skyrush.git
cd skyrush/apps/server

# Run initial setup script
chmod +x setup-oracle.sh
bash setup-oracle.sh
```

This script installs:
- Node.js 20
- PM2 process manager
- Build tools
- Configures firewall

### 3.4 Configure Environment Variables

```bash
# Create production environment file
cp .env.production.example .env
nano .env
```

Fill in all required values:

```env
NODE_ENV=production
PORT=8080

# Frontend URL (you'll update this after Vercel deployment)
CLIENT_URL=https://your-app.vercel.app

# Supabase (from Part 1.2)
DATABASE_URL=postgresql://...
DIRECT_DATABASE_URL=postgresql://...
SUPABASE_URL=https://[ref].supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-key

# Cloudinary (from Part 2.1)
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret

# Optional: Email configuration
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password
EMAIL_FROM="SkyRush <noreply@yourdomain.com>"
```

Save and exit (Ctrl+X, Y, Enter).

### 3.5 Deploy Backend

```bash
# Make deploy script executable
chmod +x deploy.sh

# Run deployment
bash deploy.sh
```

This script will:
- Install dependencies
- Build the application
- Run database migrations
- Start PM2 process

### 3.6 Verify Backend is Running

```bash
# Check PM2 status
pm2 status

# View logs
pm2 logs skyrush-backend

# Run health check
chmod +x health-check.sh
bash health-check.sh

# Test from outside
curl http://your-oracle-ip:8080/health
```

You should see: `{"status":"ok","timestamp":"..."}`

---

## Part 4: Vercel Frontend Deployment

### 4.1 Prepare Vercel Project

1. Push your code to GitHub (if not already done)
2. Go to [Vercel Dashboard](https://vercel.com/dashboard)
3. Click **"Add New..."** → **"Project"**
4. Import your GitHub repository

### 4.2 Configure Build Settings

In Vercel project settings:

**Framework Preset**: Other

**Build & Development Settings**:
- **Build Command**: `npm run build:web`
- **Output Directory**: `apps/web/dist`
- **Install Command**: `npm install`

### 4.3 Configure Environment Variables

In Vercel → **Settings** → **Environment Variables**, add:

| Name | Value | Environment |
|------|-------|-------------|
| `VITE_API_URL` | `http://your-oracle-ip:8080` | Production |

⚠️ **Important**: Replace `your-oracle-ip` with your actual Oracle Cloud VM public IP.

### 4.4 Deploy

1. Click **"Deploy"**
2. Wait for build to complete (~2-3 minutes)
3. Your app will be live at `https://your-app.vercel.app`

### 4.5 Update Backend CORS

Now that you have your Vercel URL:

```bash
# SSH back to Oracle Cloud VM
ssh -i ~/.ssh/your-key.pem ubuntu@your-oracle-ip

cd ~/skyrush/apps/server

# Edit .env and update CLIENT_URL
nano .env
# Change: CLIENT_URL=https://your-actual-app.vercel.app

# Restart backend
pm2 restart skyrush-backend
```

---

## Part 5: Optional - Custom Domain & HTTPS

### 5.1 Add Custom Domain to Vercel

1. In Vercel project → **Settings** → **Domains**
2. Add your domain (e.g., `skyrush.com`)
3. Follow DNS configuration instructions
4. Vercel automatically provisions SSL certificate

### 5.2 Configure Backend Domain (Optional)

For production, you may want a custom domain for your backend:

1. **Option A: Use Nginx Reverse Proxy on Oracle Cloud**
   - Install Nginx: `sudo apt install nginx certbot python3-certbot-nginx`
   - Configure reverse proxy to localhost:8080
   - Get SSL cert: `sudo certbot --nginx -d api.yourdomain.com`

2. **Option B: Use Cloudflare Tunnel** (Recommended for Always Free)
   - No need to open ports
   - Free SSL
   - DDoS protection
   - Follow [Cloudflare Tunnel guide](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/)

Update your Vercel environment:
```
VITE_API_URL=https://api.yourdomain.com
```

---

## Part 6: Monitoring & Maintenance

### 6.1 Backend Monitoring

```bash
# View real-time logs
pm2 logs skyrush-backend

# Monitor CPU/Memory
pm2 monit

# View process info
pm2 info skyrush-backend

# Restart if needed
pm2 restart skyrush-backend
```

### 6.2 Database Monitoring

1. Go to Supabase Dashboard → **Database** → **Database**
2. Monitor:
   - Connection count
   - Query performance
   - Storage usage

### 6.3 Cloudinary Monitoring

1. Go to Cloudinary Dashboard
2. Monitor:
   - Storage usage
   - Bandwidth usage
   - Transformations

### 6.4 Set Up Automated Backups

**Supabase** (automatic):
- Daily backups included in free tier
- Go to **Database** → **Backups** to view/restore

**Oracle Cloud**:
```bash
# Create backup script
crontab -e

# Add daily backup at 2 AM
0 2 * * * cd ~/skyrush && git pull && bash deploy.sh >> ~/deploy.log 2>&1
```

---

## Part 7: Updating Your Application

### 7.1 Update Frontend (Vercel)

Vercel automatically deploys when you push to main branch:

```bash
git add .
git commit -m "Update frontend"
git push origin main
```

Vercel will automatically build and deploy.

### 7.2 Update Backend (Oracle Cloud)

```bash
# SSH to Oracle Cloud
ssh -i ~/.ssh/your-key.pem ubuntu@your-oracle-ip

cd ~/skyrush

# Pull latest code
git pull origin main

# Deploy updates
cd apps/server
bash deploy.sh
```

### 7.3 Database Migrations

If you have schema changes:

```bash
# SSH to Oracle Cloud
cd ~/skyrush/apps/server

# Run migrations
npm run db:push

# Restart backend
pm2 restart skyrush-backend
```

---

## 🔒 Security Checklist

- [ ] All `.env` files are in `.gitignore` (never commit secrets!)
- [ ] Supabase service_role key is only on backend server
- [ ] Cloudinary API secret is only on backend server
- [ ] Oracle Cloud firewall only allows port 8080 (and 22 for SSH)
- [ ] SSH key authentication only (no password login)
- [ ] Regular backups configured
- [ ] HTTPS enabled (via Vercel and optional backend domain)
- [ ] Strong database password
- [ ] Admin accounts use strong passwords

---

## 📊 Costs Breakdown

All services have generous free tiers:

| Service | Free Tier | Cost After |
|---------|-----------|------------|
| **Vercel** | 100GB bandwidth/month | $20/month Pro |
| **Oracle Cloud** | 2 VMs, 200GB storage | Always Free |
| **Supabase** | 500MB database, 1GB file storage | $25/month Pro |
| **Cloudinary** | 25GB storage, 25GB bandwidth | $0.12/GB over |

**Total Monthly Cost**: $0 (within free tiers) for moderate traffic

---

## 🆘 Troubleshooting

### Frontend can't connect to backend

1. Check `VITE_API_URL` in Vercel environment variables
2. Verify Oracle Cloud firewall allows port 8080
3. Check `CLIENT_URL` in backend `.env` matches your Vercel domain
4. Test backend directly: `curl http://your-oracle-ip:8080/health`

### Database connection errors

1. Verify connection strings in backend `.env`
2. Check Supabase project is not paused (free tier pauses after 1 week inactivity)
3. Ensure IP whitelist in Supabase allows connections (should be 0.0.0.0/0 for public)

### Cloudinary upload fails

1. Check credentials in backend `.env`
2. Verify Cloudinary account is active
3. Check upload folder exists or create preset
4. View backend logs: `pm2 logs skyrush-backend`

### PM2 process crashes

```bash
# View error logs
pm2 logs skyrush-backend --err

# Check if port is in use
sudo lsof -i :8080

# Restart process
pm2 restart skyrush-backend

# If still failing, rebuild
cd ~/skyrush/apps/server
bash deploy.sh
```

### Out of memory on Oracle Cloud

Oracle Free Tier has 1GB RAM. Optimize:

```bash
# Edit PM2 config
nano ecosystem.config.js

# Change max_memory_restart to lower value
max_memory_restart: '400M'

# Reload
pm2 reload ecosystem.config.js
```

---

## 📞 Support Resources

- **Vercel Docs**: https://vercel.com/docs
- **Oracle Cloud Docs**: https://docs.oracle.com/en-us/iaas/
- **Supabase Docs**: https://supabase.com/docs
- **Cloudinary Docs**: https://cloudinary.com/documentation

---

## 🎉 Success!

Your SkyRush Aviator app is now live in production!

**Frontend**: `https://your-app.vercel.app`  
**Backend**: `http://your-oracle-ip:8080`  
**Database**: Supabase (PostgreSQL)  
**Storage**: Cloudinary

Share your app and enjoy! 🚀
