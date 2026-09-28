# ⚡ Quick Start Guide - SkyRush Deployment

**TL;DR** - Deploy SkyRush in 30 minutes

---

## 🎯 Prerequisites

Create accounts at:
1. [Vercel](https://vercel.com) - Frontend hosting
2. [Oracle Cloud](https://oracle.com/cloud/free) - Backend server
3. [Supabase](https://supabase.com) - Database
4. [Cloudinary](https://cloudinary.com) - Image storage

---

## 📝 Step-by-Step

### 1️⃣ Supabase (5 minutes)

```bash
# 1. Create project at supabase.com
# 2. Get connection strings from Settings → Database
# 3. Get API keys from Settings → API
# 4. Run migrations locally:

cd apps/server
cp .env.production.example .env
# Edit .env with Supabase credentials
npm run db:push
```

**Save these values**:
- `DATABASE_URL` (pooler)
- `DIRECT_DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_KEY`

---

### 2️⃣ Cloudinary (2 minutes)

```bash
# 1. Sign up at cloudinary.com
# 2. From dashboard, copy:
#    - Cloud Name
#    - API Key
#    - API Secret
```

**Save these values**:
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`

---

### 3️⃣ Oracle Cloud Backend (10 minutes)

```bash
# 1. Create VM.Standard.E2.1.Micro instance (Ubuntu 22.04)
# 2. Allow port 8080 in Security List
# 3. SSH to VM:

ssh -i your-key.pem ubuntu@YOUR_ORACLE_IP

# 4. Clone and setup:
git clone YOUR_REPO_URL skyrush
cd skyrush/apps/server
chmod +x setup-oracle.sh
bash setup-oracle.sh

# 5. Configure environment:
cp .env.production.example .env
nano .env
# Fill in ALL credentials from Steps 1 & 2
# Set CLIENT_URL=https://your-app.vercel.app (update after Vercel)

# 6. Deploy:
chmod +x deploy.sh
bash deploy.sh

# 7. Verify:
pm2 status
curl http://localhost:8080/health
```

**Save this value**:
- Your Oracle Cloud public IP

---

### 4️⃣ Vercel Frontend (5 minutes)

```bash
# 1. Go to vercel.com/new
# 2. Import your GitHub repository
# 3. Configure:
#    Build Command: npm run build:web
#    Output Directory: apps/web/dist
#    Install Command: npm install

# 4. Add Environment Variable:
#    Name: VITE_API_URL
#    Value: http://YOUR_ORACLE_IP:8080

# 5. Deploy!
```

---

### 5️⃣ Final Steps (5 minutes)

```bash
# 1. Get your Vercel URL (e.g., https://skyrush.vercel.app)

# 2. Update backend CORS:
ssh ubuntu@YOUR_ORACLE_IP
cd ~/skyrush/apps/server
nano .env
# Update: CLIENT_URL=https://your-actual-vercel-url.vercel.app

# 3. Restart:
pm2 restart skyrush-backend

# 4. Test your app!
# Open https://your-vercel-url.vercel.app
```

---

## ✅ Verification Checklist

- [ ] Backend health check works: `http://YOUR_ORACLE_IP:8080/health`
- [ ] Frontend loads: `https://your-app.vercel.app`
- [ ] Can register a new user
- [ ] Can deposit (screenshot uploads to Cloudinary)
- [ ] Game rounds run properly
- [ ] No CORS errors in browser console

---

## 🔄 Common Commands

### Backend (Oracle Cloud)

```bash
# SSH to server
ssh -i your-key.pem ubuntu@YOUR_ORACLE_IP

# View logs
pm2 logs skyrush-backend

# Restart
pm2 restart skyrush-backend

# Stop
pm2 stop skyrush-backend

# Deploy updates
cd ~/skyrush && git pull && cd apps/server && bash deploy.sh

# View status
pm2 status
```

### Frontend (Vercel)

```bash
# Automatic deployment on git push
git add .
git commit -m "Update"
git push origin main

# Manual deployment via Vercel CLI
npm i -g vercel
vercel --prod
```

### Database (Supabase)

```bash
# Run migrations (from local or Oracle Cloud)
cd apps/server
npm run db:push

# Access Prisma Studio
npm run db:studio
```

---

## 🆘 Quick Fixes

### "Cannot connect to backend"
```bash
# Check backend is running
ssh ubuntu@YOUR_ORACLE_IP
pm2 status

# Check Vercel environment variable
# Verify VITE_API_URL = http://YOUR_ORACLE_IP:8080
```

### "CORS error"
```bash
# Update CLIENT_URL on backend
ssh ubuntu@YOUR_ORACLE_IP
cd ~/skyrush/apps/server
nano .env
# Set CLIENT_URL=https://your-exact-vercel-url.vercel.app
pm2 restart skyrush-backend
```

### "Database connection failed"
```bash
# Check Supabase project is active (not paused)
# Verify connection strings in backend .env
# Test connection:
ssh ubuntu@YOUR_ORACLE_IP
cd ~/skyrush/apps/server
node -e "require('./dist/apps/server/src/lib/db').prisma.$connect().then(() => console.log('OK'))"
```

### "PM2 process crashed"
```bash
ssh ubuntu@YOUR_ORACLE_IP
pm2 logs skyrush-backend --err
# Read the error, fix the issue
pm2 restart skyrush-backend
```

---

## 📚 Full Documentation

For detailed instructions, see [DEPLOYMENT.md](./DEPLOYMENT.md)

---

## 🎉 You're Done!

Your app is live! 🚀

**Next steps**:
1. Set up custom domain (optional)
2. Configure SSL for backend (optional)
3. Set up monitoring alerts
4. Create admin accounts
5. Share with users!
