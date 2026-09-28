# 🚀 Deploy to Render.com (Easy Option)

**Easiest backend hosting alternative to Oracle Cloud**

✅ No complex VM setup  
✅ Auto-deploy from GitHub  
✅ Free tier: 750 hours/month  
✅ Free SSL certificate  
⚠️ Sleeps after 15 min inactivity (auto-wakes)

---

## 📋 What You'll Need

- [ ] GitHub account with your code
- [ ] Render account (sign up at [render.com](https://render.com))
- [ ] Supabase account (database)
- [ ] Cloudinary account (storage)
- [ ] Vercel account (frontend)

**Time to deploy**: 20-30 minutes

---

## Part 1: Supabase Setup (10 minutes)

### 1.1 Create Supabase Project

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Click **"New Project"**
3. Fill in:
   - **Name**: skyrush-production
   - **Database Password**: *Strong password*
   - **Region**: Closest to you
4. Click **"Create"** (wait ~2 minutes)

### 1.2 Get Database Connection Strings

1. Go to **Settings** → **Database**
2. Find **Connection string** → **URI**
3. Copy and modify for these two URLs:

**DATABASE_URL** (for runtime - Transaction mode):
```
postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true
```

**DIRECT_DATABASE_URL** (for migrations):
```
postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres
```

### 1.3 Get API Keys

1. Go to **Settings** → **API**
2. Copy:
   - **URL**: `https://[ref].supabase.co`
   - **anon public key**
   - **service_role secret** (keep secret!)

### 1.4 Run Migrations Locally

```bash
# In your project folder
cd apps/server

# Create .env file
cp .env.production.example .env

# Add your Supabase credentials to .env
# DATABASE_URL=...
# DIRECT_DATABASE_URL=...

# Run migrations
npm run db:push
```

---

## Part 2: Cloudinary Setup (5 minutes)

1. Go to [Cloudinary Dashboard](https://cloudinary.com/console)
2. Copy from dashboard:
   - **Cloud Name**
   - **API Key**
   - **API Secret**
3. Save these for later

---

## Part 3: Deploy Backend to Render (10 minutes)

### 3.1 Create Render Account

1. Go to [render.com](https://render.com)
2. Sign up with GitHub (recommended)

### 3.2 Create Web Service

1. Click **"New +"** → **"Web Service"**
2. Connect your GitHub repository
3. Grant Render access to the repository

### 3.3 Configure Service

**Basic Settings**:
- **Name**: `skyrush-backend`
- **Region**: Choose closest to your users
- **Branch**: `main` (or your production branch)
- **Root Directory**: `apps/server`
- **Runtime**: `Node`

**Build Settings**:
- **Build Command**: 
  ```bash
  cd ../.. && npm ci && npm run build:shared && cd apps/server && npm run build
  ```
- **Start Command**: 
  ```bash
  node dist/apps/server/src/index.js
  ```

**Instance Type**:
- Select **"Free"** (750 hours/month)

### 3.4 Add Environment Variables

Click **"Advanced"** → **"Add Environment Variable"**

Add these one by one:

```env
NODE_ENV=production
PORT=8080

# Supabase (from Part 1)
DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres
SUPABASE_URL=https://[ref].supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-key

# Cloudinary (from Part 2)
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret

# CORS - You'll update this after Vercel deployment
CLIENT_URL=https://your-app.vercel.app

# Optional: Email settings
# EMAIL_HOST=smtp.gmail.com
# EMAIL_PORT=587
# EMAIL_USER=your-email@gmail.com
# EMAIL_PASSWORD=your-app-password
# EMAIL_FROM=SkyRush <noreply@yourdomain.com>

# Game settings (defaults)
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
ROUND_BETTING_DURATION_MS=7000
ROUND_INTERVAL_MS=3000
```

### 3.5 Deploy

1. Click **"Create Web Service"**
2. Render will automatically:
   - Clone your repository
   - Install dependencies
   - Build your app
   - Start the server
3. Wait 3-5 minutes for deployment

### 3.6 Get Your Backend URL

Once deployed, you'll see:
```
https://skyrush-backend.onrender.com
```

**Save this URL!** You'll need it for Vercel.

### 3.7 Test Backend

Click on your backend URL and add `/health`:
```
https://skyrush-backend.onrender.com/health
```

You should see: `{"status":"ok","timestamp":"..."}`

---

## Part 4: Deploy Frontend to Vercel (10 minutes)

### 4.1 Create Vercel Project

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click **"Add New..."** → **"Project"**
3. Import your GitHub repository

### 4.2 Configure Build Settings

**Framework Preset**: Other

**Build & Development Settings**:
- **Build Command**: `npm run build:web`
- **Output Directory**: `apps/web/dist`
- **Install Command**: `npm install`

### 4.3 Add Environment Variable

Click **"Environment Variables"**

Add:
```
Name:  VITE_API_URL
Value: https://skyrush-backend.onrender.com
```

(Use your actual Render URL from Part 3.6)

### 4.4 Deploy

1. Click **"Deploy"**
2. Wait 2-3 minutes
3. Get your frontend URL: `https://your-app.vercel.app`

---

## Part 5: Update Backend CORS (2 minutes)

Now that you have your Vercel URL, update backend:

1. Go back to [Render Dashboard](https://dashboard.render.com)
2. Click on your **skyrush-backend** service
3. Go to **"Environment"**
4. Find `CLIENT_URL` and update it:
   ```
   CLIENT_URL=https://your-actual-app.vercel.app
   ```
5. Click **"Save Changes"**
6. Render will automatically redeploy (takes ~2 minutes)

---

## Part 6: Test Everything (5 minutes)

### 6.1 Test Backend
```
https://skyrush-backend.onrender.com/health
```
Should return: `{"status":"ok"}`

### 6.2 Test Frontend

Open your Vercel URL: `https://your-app.vercel.app`

**Test these features**:
- [ ] Page loads without errors
- [ ] Can register a new account
- [ ] Can login
- [ ] Game page loads
- [ ] Multiplier updates (real-time works)
- [ ] Can place a bet
- [ ] Can deposit (screenshot upload)
- [ ] No CORS errors in browser console (F12)

---

## 🎉 You're Live!

**Frontend**: `https://your-app.vercel.app`  
**Backend**: `https://skyrush-backend.onrender.com`  
**Database**: Supabase  
**Storage**: Cloudinary

---

## 📊 Render Free Tier Limits

- **Hours**: 750 hours/month (always enough)
- **Sleep**: After 15 minutes of inactivity
- **Wake time**: ~30 seconds (automatic on first request)
- **Memory**: 512MB RAM
- **Bandwidth**: 100GB/month

**💡 Tip**: To keep your app awake, use a service like [UptimeRobot](https://uptimerobot.com) (free) to ping your backend every 10 minutes.

---

## 🔄 Updating Your App

### Update Backend

Render auto-deploys when you push to GitHub:

```bash
# Make your changes
git add .
git commit -m "Update backend"
git push origin main
```

Render automatically rebuilds and deploys!

### Update Frontend

Same as backend - Vercel auto-deploys:

```bash
git add .
git commit -m "Update frontend"
git push origin main
```

---

## 🆘 Troubleshooting

### "Service Unavailable" when accessing backend

**Cause**: Service is sleeping (free tier limitation)

**Solution**: 
- Wait 30 seconds, refresh
- Set up UptimeRobot to ping every 10 minutes
- Or upgrade to paid plan ($7/month, no sleep)

### "Cannot connect to backend" from frontend

1. Check backend is running: Visit `https://your-backend.onrender.com/health`
2. Verify `VITE_API_URL` in Vercel matches your Render URL
3. Check `CLIENT_URL` in Render environment variables

### "CORS error" in browser

1. Go to Render Dashboard → Your service → Environment
2. Verify `CLIENT_URL` matches your exact Vercel URL (no trailing slash)
3. Save changes (triggers redeploy)

### "Database connection failed"

1. Check Supabase project is not paused
2. Verify `DATABASE_URL` and `DIRECT_DATABASE_URL` in Render environment
3. Test connection from local machine first

### Build fails on Render

1. Check build logs in Render dashboard
2. Ensure `package.json` scripts are correct
3. Verify all dependencies are in `package.json`
4. Try building locally first: `npm run build`

---

## 🚀 Optional: Keep Backend Always Awake

### Using UptimeRobot (Free)

1. Sign up at [UptimeRobot](https://uptimerobot.com)
2. Create new monitor:
   - **Monitor Type**: HTTP(s)
   - **URL**: `https://your-backend.onrender.com/health`
   - **Monitoring Interval**: 5 minutes (free tier)
3. Your backend will never sleep!

---

## 💰 Cost Comparison

| Service | Free Tier | Paid Tier |
|---------|-----------|-----------|
| **Render** | 750 hrs/month, sleeps | $7/mo, always on |
| **Vercel** | 100GB bandwidth | $20/mo Pro |
| **Supabase** | 500MB DB | $25/mo Pro |
| **Cloudinary** | 25GB storage | $89/mo+ |

**Total Free Tier Cost**: $0/month ✨

**Upgrade when needed**: ~$7-20/month for more traffic

---

## 📝 Environment Variables Checklist

### Render Backend

- [x] `NODE_ENV=production`
- [x] `PORT=8080`
- [x] `CLIENT_URL` (Vercel URL)
- [x] `DATABASE_URL` (Supabase pooler)
- [x] `DIRECT_DATABASE_URL` (Supabase direct)
- [x] `SUPABASE_URL`
- [x] `SUPABASE_ANON_KEY`
- [x] `SUPABASE_SERVICE_KEY`
- [x] `CLOUDINARY_CLOUD_NAME`
- [x] `CLOUDINARY_API_KEY`
- [x] `CLOUDINARY_API_SECRET`

### Vercel Frontend

- [x] `VITE_API_URL` (Render backend URL)

---

## 🎯 Next Steps

- [ ] Set up custom domain (optional)
- [ ] Configure UptimeRobot to prevent sleep
- [ ] Create admin account
- [ ] Test all features thoroughly
- [ ] Monitor Render logs for errors
- [ ] Set up Supabase backups (automatic in free tier)

---

## 📞 Quick Help

**Render Docs**: https://render.com/docs  
**Render Status**: https://status.render.com  
**Community**: https://community.render.com

---

**Render is MUCH easier than Oracle Cloud!** No SSH, no VM management, just connect GitHub and deploy. 🎉
