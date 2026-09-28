# 🚂 Deploy to Railway.app (Alternative Easy Option)

**Another easy backend hosting option - No sleep mode!**

✅ $5 free credit/month (~500 hours)  
✅ No sleep mode (always on!)  
✅ Auto-deploy from GitHub  
✅ Very simple UI  
✅ One-click PostgreSQL (optional)

---

## 📋 Prerequisites

- [ ] GitHub account
- [ ] Railway account ([railway.app](https://railway.app))
- [ ] Supabase (or use Railway's PostgreSQL)
- [ ] Cloudinary account
- [ ] Vercel account (frontend)

**Time to deploy**: 15-20 minutes

---

## Part 1: Database Choice

### Option A: Use Supabase (Recommended)

Follow Supabase setup from [DEPLOYMENT-RENDER.md](./DEPLOYMENT-RENDER.md) Part 1

### Option B: Use Railway PostgreSQL

1. In Railway dashboard
2. Click **"New Project"** → **"Provision PostgreSQL"**
3. Railway automatically creates database
4. Get connection string from **"Connect"** tab

---

## Part 2: Cloudinary Setup

1. Go to [cloudinary.com](https://cloudinary.com)
2. Sign up / Login
3. Copy from dashboard:
   - Cloud Name
   - API Key
   - API Secret

---

## Part 3: Deploy Backend to Railway

### 3.1 Create Railway Account

1. Go to [railway.app](https://railway.app)
2. Sign up with GitHub

### 3.2 Create New Project

1. Click **"New Project"**
2. Select **"Deploy from GitHub repo"**
3. Choose your repository
4. Select the repository

### 3.3 Configure Service

Railway will auto-detect Node.js. Configure:

1. Click **"Settings"**
2. **Root Directory**: `apps/server`
3. **Build Command**: 
   ```bash
   npm ci && cd ../.. && npm run build:shared && cd apps/server && npm run build
   ```
4. **Start Command**: 
   ```bash
   node dist/apps/server/src/index.js
   ```

### 3.4 Add Environment Variables

Click **"Variables"** tab, add these:

```env
NODE_ENV=production
PORT=8080

# Database (Supabase or Railway PostgreSQL)
DATABASE_URL=postgresql://...
DIRECT_DATABASE_URL=postgresql://...

# Supabase Auth
SUPABASE_URL=https://[ref].supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-key

# Cloudinary
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret

# CORS (update after Vercel)
CLIENT_URL=https://your-app.vercel.app

# Optional Email
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password
```

### 3.5 Generate Domain

1. Click **"Settings"**
2. Scroll to **"Domains"**
3. Click **"Generate Domain"**
4. You'll get: `https://your-app-production.up.railway.app`

**Save this URL!**

### 3.6 Deploy

1. Click **"Deploy"**
2. Railway automatically builds and deploys
3. Wait 3-5 minutes

### 3.7 Test Backend

Visit: `https://your-app-production.up.railway.app/health`

Should return: `{"status":"ok"}`

---

## Part 4: Deploy Frontend to Vercel

1. Go to [vercel.com/dashboard](https://vercel.com/dashboard)
2. Import your GitHub repository
3. Configure:
   - **Build Command**: `npm run build:web`
   - **Output Directory**: `apps/web/dist`
4. Add environment variable:
   ```
   VITE_API_URL=https://your-app-production.up.railway.app
   ```
5. Deploy!

---

## Part 5: Update CORS

1. Go back to Railway
2. Click **"Variables"**
3. Update `CLIENT_URL`:
   ```
   CLIENT_URL=https://your-actual-vercel-url.vercel.app
   ```
4. Railway auto-redeploys

---

## 🎉 You're Live!

**Frontend**: `https://your-app.vercel.app`  
**Backend**: `https://your-app.railway.app`  
**Database**: Supabase or Railway

---

## 💰 Railway Pricing

- **Free**: $5 credit/month
- **Usage**: ~$0.01/hour = ~500 hours
- **Pro**: $5/month + usage
- **No sleep mode** (always responsive!)

---

## 🔄 Auto-Deploy

Railway automatically deploys when you push:

```bash
git add .
git commit -m "Update"
git push origin main
```

Both Railway and Vercel will auto-deploy!

---

## 🆘 Troubleshooting

### "Out of credits" error

- Free tier: $5/month credit
- Check usage in Railway dashboard
- Upgrade to Pro plan if needed ($5/mo base)

### Build fails

1. Check Railway logs in dashboard
2. Verify build command is correct
3. Test locally first: `npm run build`

### Can't connect to database

1. Check `DATABASE_URL` in Railway variables
2. Verify Supabase project is active
3. Test connection locally

---

## 📊 Why Railway?

✅ **No sleep mode** (unlike Render free tier)  
✅ **Simple interface**  
✅ **Auto-deploy from GitHub**  
✅ **Built-in PostgreSQL option**  
✅ **Fast builds**  
⚠️ Limited free credits ($5/month)

---

**Railway is perfect for production apps that need to be always responsive!** 🚂
