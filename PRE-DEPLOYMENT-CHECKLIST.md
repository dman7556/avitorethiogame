# 🔍 Pre-Deployment Checklist

Complete this checklist before deploying to production to ensure a smooth deployment.

---

## 📦 Code & Repository

- [ ] All code changes are committed and pushed to GitHub
- [ ] No sensitive data (passwords, API keys) in git history
- [ ] `.env` files are in `.gitignore`
- [ ] `.env.example` files are up-to-date with all required variables
- [ ] All dependencies are listed in `package.json`
- [ ] Build succeeds locally: `npm run build`
- [ ] Tests pass (if applicable): `npm test`

---

## 🗄️ Supabase Setup

- [ ] Supabase project created
- [ ] Database password saved securely
- [ ] Connection strings copied:
  - [ ] `DATABASE_URL` (pooler, port 6543)
  - [ ] `DIRECT_DATABASE_URL` (direct, port 5432)
- [ ] API credentials copied:
  - [ ] `SUPABASE_URL`
  - [ ] `SUPABASE_ANON_KEY`
  - [ ] `SUPABASE_SERVICE_KEY` (keep secret!)
- [ ] Migrations tested locally: `npm run db:push`
- [ ] Database is accessible from your IP

---

## ☁️ Cloudinary Setup

- [ ] Cloudinary account created
- [ ] Credentials copied:
  - [ ] `CLOUDINARY_CLOUD_NAME`
  - [ ] `CLOUDINARY_API_KEY`
  - [ ] `CLOUDINARY_API_SECRET`
- [ ] Upload folder structure planned (e.g., `skyrush/deposits`)
- [ ] Free tier limits understood (25GB storage, 25GB bandwidth)

---

## 🖥️ Oracle Cloud Setup

- [ ] Oracle Cloud account created and verified
- [ ] VM instance created:
  - [ ] Shape: VM.Standard.E2.1.Micro (Always Free)
  - [ ] OS: Ubuntu 22.04
  - [ ] Boot volume: 50GB
  - [ ] Public IP assigned
- [ ] SSH key pair generated and added to instance
- [ ] Security List configured:
  - [ ] Ingress rule for port 8080 (TCP) added
  - [ ] SSH access (port 22) works
- [ ] Can SSH to VM successfully
- [ ] Initial setup script executed: `bash setup-oracle.sh`
- [ ] Node.js 20 installed: `node --version`
- [ ] PM2 installed: `pm2 --version`

---

## 🔐 Environment Variables - Backend

Create `apps/server/.env` with these values:

- [ ] `NODE_ENV=production`
- [ ] `PORT=8080`
- [ ] `CLIENT_URL` (Vercel URL - can update after frontend deployment)
- [ ] `DATABASE_URL` (Supabase pooler)
- [ ] `DIRECT_DATABASE_URL` (Supabase direct)
- [ ] `SUPABASE_URL`
- [ ] `SUPABASE_ANON_KEY`
- [ ] `SUPABASE_SERVICE_KEY`
- [ ] `CLOUDINARY_CLOUD_NAME`
- [ ] `CLOUDINARY_API_KEY`
- [ ] `CLOUDINARY_API_SECRET`
- [ ] Email settings (optional):
  - [ ] `EMAIL_HOST`
  - [ ] `EMAIL_PORT`
  - [ ] `EMAIL_USER`
  - [ ] `EMAIL_PASSWORD`
  - [ ] `EMAIL_FROM`

---

## 🌐 Environment Variables - Frontend

Configure in Vercel Dashboard:

- [ ] `VITE_API_URL` = `http://YOUR_ORACLE_IP:8080`
  - Update to custom domain later if needed

---

## 🚀 Vercel Setup

- [ ] Vercel account created
- [ ] GitHub repository connected
- [ ] Build settings configured:
  - [ ] Build Command: `npm run build:web`
  - [ ] Output Directory: `apps/web/dist`
  - [ ] Install Command: `npm install`
- [ ] Environment variables added
- [ ] Custom domain configured (optional)

---

## 🔒 Security Review

- [ ] All API keys and secrets are unique and strong
- [ ] Database password is strong (min 16 chars, mixed case, numbers, symbols)
- [ ] SSH key authentication only (no password login on Oracle VM)
- [ ] Firewall rules are restrictive (only necessary ports open)
- [ ] CORS is properly configured (only allow your Vercel domain)
- [ ] Rate limiting is enabled in backend
- [ ] Admin passwords are strong and secure
- [ ] No hardcoded credentials in source code
- [ ] `.env` files are never committed to git

---

## 📊 Monitoring & Backups

- [ ] PM2 configured to restart on crashes
- [ ] PM2 configured to start on system boot
- [ ] Supabase automatic backups verified (check dashboard)
- [ ] Log rotation configured (PM2 handles this)
- [ ] Health check endpoint works: `/health`
- [ ] Monitoring plan decided (Supabase dashboard, PM2 logs, etc.)

---

## 🧪 Testing Plan

- [ ] Backend health check responds: `curl http://YOUR_IP:8080/health`
- [ ] Can register new user
- [ ] Email verification works (if configured)
- [ ] Can deposit funds (test screenshot upload to Cloudinary)
- [ ] Can place bets and play game
- [ ] Can withdraw funds
- [ ] Admin panel accessible
- [ ] Real-time features work (Socket.IO)
- [ ] No CORS errors in browser console
- [ ] Mobile responsive design works

---

## 📝 Documentation

- [ ] README.md is up-to-date
- [ ] DEPLOYMENT.md reviewed
- [ ] QUICK-START.md reviewed
- [ ] API documentation available (if applicable)
- [ ] Admin user guide prepared (if applicable)
- [ ] User guide/FAQ prepared (if applicable)

---

## 💰 Cost Verification

- [ ] Understood Vercel free tier limits (100GB bandwidth/month)
- [ ] Understood Oracle Cloud Always Free limits (2 VMs, 200GB storage)
- [ ] Understood Supabase free tier limits (500MB DB, 1GB storage)
- [ ] Understood Cloudinary free tier limits (25GB storage/bandwidth)
- [ ] Billing alerts configured in each service
- [ ] Usage monitoring plan in place

---

## 🎯 Launch Checklist

**1 Day Before:**
- [ ] Final code review completed
- [ ] All environment variables documented
- [ ] Backup plan tested
- [ ] Rollback plan documented

**Launch Day:**
- [ ] Deploy backend to Oracle Cloud
- [ ] Verify backend is running: `pm2 status`
- [ ] Deploy frontend to Vercel
- [ ] Update backend `CLIENT_URL` with actual Vercel URL
- [ ] Restart backend: `pm2 restart skyrush-backend`
- [ ] Test all critical user flows
- [ ] Monitor logs for errors: `pm2 logs skyrush-backend`
- [ ] Monitor Supabase dashboard for database issues
- [ ] Test from multiple devices/browsers

**Post-Launch:**
- [ ] Monitor for 24 hours
- [ ] Check error logs daily for first week
- [ ] Verify backups are running
- [ ] Document any issues encountered
- [ ] Create incident response plan

---

## ✅ Final Sign-Off

**Deployment Date**: _________________

**Deployed By**: _________________

**Backend URL**: _________________

**Frontend URL**: _________________

**Database**: Supabase Project: _________________

**Storage**: Cloudinary Cloud: _________________

**Notes**:
```
_________________________________________________________________
_________________________________________________________________
_________________________________________________________________
```

---

## 🆘 Emergency Contacts

**Technical Issues**:
- Vercel Status: https://vercel-status.com
- Oracle Cloud Status: https://ocistatus.oraclecloud.com
- Supabase Status: https://status.supabase.com
- Cloudinary Status: https://status.cloudinary.com

**Rollback Procedure**:
1. Vercel: Revert to previous deployment in dashboard
2. Backend: `pm2 stop skyrush-backend && git checkout <previous-commit> && bash deploy.sh`
3. Database: Restore from Supabase backup (Settings → Database → Backups)

---

**Ready to deploy?** See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed instructions!
