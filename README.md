# 🎮 SkyRush Aviator - Crash Game Platform

A real-time multiplayer crash game platform built with modern web technologies. Players place bets and cash out before the plane crashes, with provably fair gameplay and secure financial transactions.

---

## 🌟 Features

- **Real-time Multiplayer Gameplay** - Watch the multiplier climb with other players
- **Dual Betting Slots** - Place two bets simultaneously per round
- **Auto Cash-out** - Set automatic cash-out multipliers
- **Provably Fair** - Cryptographically verifiable game outcomes
- **Live Chat** - Communicate with other players in real-time
- **Secure Wallet System** - Track deposits, withdrawals, and balance
- **Admin Dashboard** - Manage users, deposits, withdrawals, and monitor platform health
- **Responsive Design** - Optimized for desktop, tablet, and mobile devices
- **Real-time Analytics** - Monitor player behavior and platform metrics

---

## 🏗️ Tech Stack

### Frontend
- **React 18** - Modern UI library
- **TypeScript** - Type-safe development
- **Vite** - Fast build tool and dev server
- **Tailwind CSS** - Utility-first styling
- **Framer Motion** - Smooth animations
- **Socket.IO Client** - Real-time communication

### Backend
- **Node.js 20** - Runtime environment
- **Express** - Web framework
- **TypeScript** - Type-safe development
- **Socket.IO** - Real-time bidirectional communication
- **Prisma** - Type-safe ORM
- **PostgreSQL** - Production database (via Supabase)
- **JWT** - Secure authentication

### Infrastructure
- **Vercel** - Frontend hosting
- **Oracle Cloud** - Backend server (Always Free tier)
- **Supabase** - PostgreSQL database
- **Cloudinary** - Screenshot/image storage

---

## 📦 Project Structure

```
skyrush/
├── apps/
│   ├── server/          # Backend API and game engine
│   │   ├── src/
│   │   │   ├── game/    # Game logic (multiplier, fairness, bets)
│   │   │   ├── routes/  # API endpoints
│   │   │   ├── services/ # Business logic
│   │   │   ├── analytics/ # Metrics and monitoring
│   │   │   └── index.ts # Server entry point
│   │   └── ...
│   │
│   └── web/             # Frontend React app
│       ├── src/
│       │   ├── components/ # Reusable UI components
│       │   ├── pages/   # Page components
│       │   ├── hooks/   # Custom React hooks
│       │   ├── lib/     # Utilities and API client
│       │   └── main.tsx # App entry point
│       └── ...
│
├── packages/
│   └── shared/          # Shared types and utilities
│
├── prisma/
│   └── schema.prisma    # Database schema
│
└── [Deployment files]   # See DEPLOYMENT-SUMMARY.md
```

---

## 🚀 Quick Start (Development)

### Prerequisites

- Node.js 20+ ([nvm recommended](https://github.com/nvm-sh/nvm))
- npm 10+
- Git

### Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd skyrush

# Install dependencies
npm install

# Set up environment variables
cp apps/server/.env.example apps/server/.env
# Edit apps/server/.env with your Supabase and other credentials

# Run database migrations
cd apps/server
npm run db:push

# Return to root and start development servers
cd ../..
npm run dev
```

This starts:
- Frontend: http://localhost:5173
- Backend: http://localhost:4000

### Create Admin User

```bash
cd apps/server
node create-admin.js
```

Follow the prompts to create an admin account.

---

## 📱 Production Deployment

We provide comprehensive deployment guides for production:

### 📚 Deployment Documentation

| Document | Purpose | Read Time |
|----------|---------|-----------|
| **[DEPLOYMENT.md](./DEPLOYMENT.md)** | Complete step-by-step guide | 30 min |
| **[QUICK-START.md](./QUICK-START.md)** | TL;DR quick reference | 5 min |
| **[PRE-DEPLOYMENT-CHECKLIST.md](./PRE-DEPLOYMENT-CHECKLIST.md)** | Verification checklist | 10 min |
| **[DEPLOYMENT-SUMMARY.md](./DEPLOYMENT-SUMMARY.md)** | File reference guide | 5 min |

### Quick Deployment Overview

**Services Required**:
1. **Vercel** - Frontend hosting (free tier)
2. **Oracle Cloud** - Backend VM (always free tier)
3. **Supabase** - PostgreSQL database (free tier)
4. **Cloudinary** - Image storage (free tier)

**Deployment Time**: ~45-60 minutes (first time)

**Get Started**: Read [DEPLOYMENT.md](./DEPLOYMENT.md)

---

## 🎮 How to Play

1. **Register/Login** - Create an account or sign in
2. **Deposit Funds** - Upload payment screenshot for admin approval
3. **Place Bets** - Enter bet amount in one or both slots
4. **Watch the Multiplier** - Plane takes off and multiplier increases
5. **Cash Out** - Click "Cash Out" before crash to win
6. **Repeat** - New round starts automatically

### Game Rules

- Minimum bet varies by configuration (default: 10 ETB)
- Maximum bet per slot (default: 1000 ETB)
- You can place 2 bets simultaneously
- Set auto cash-out to automatically collect winnings
- Crash point is provably fair (verify using server seed)

---

## 🛠️ Available Scripts

### Root Level

```bash
npm run dev              # Start both frontend and backend
npm run dev:web          # Start frontend only
npm run dev:server       # Start backend only
npm run build            # Build all packages
npm run build:web        # Build frontend only
npm run build:server     # Build backend only
npm run test             # Run all tests
```

### Database

```bash
npm run db:push          # Push schema changes to database
npm run db:migrate       # Create migration files
npm run db:studio        # Open Prisma Studio (database GUI)
npm run db:seed          # Seed database with sample data
```

---

## 🔒 Security Features

- **Password Hashing** - bcrypt with salt rounds
- **JWT Authentication** - Secure token-based auth
- **Rate Limiting** - Prevent abuse and DDoS
- **CORS Protection** - Whitelist allowed origins
- **Input Validation** - Zod schema validation
- **SQL Injection Prevention** - Prisma parameterized queries
- **XSS Protection** - Helmet.js security headers
- **HTTPS Enforcement** - Secure connections in production

---

## 📊 Admin Features

Access admin panel at `/admin` with admin credentials:

- **User Management** - View, activate/deactivate users
- **Deposit Approvals** - Review and approve/reject deposits
- **Withdrawal Processing** - Process withdrawal requests
- **Platform Analytics** - Real-time metrics and insights
- **Game Monitoring** - Watch live rounds and player activity
- **Risk Alerts** - Monitor suspicious activities
- **Audit Logs** - Complete action history

---

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run specific test file
npm test -- path/to/test.ts
```

---

## 🐛 Troubleshooting

### Development Issues

**Port already in use**:
```bash
# Kill process on port 4000 (backend)
npx kill-port 4000

# Kill process on port 5173 (frontend)
npx kill-port 5173
```

**Database connection errors**:
- Check Supabase project is active
- Verify `DATABASE_URL` in `.env`
- Ensure your IP is whitelisted (Supabase allows all by default)

**Build fails**:
```bash
# Clean and reinstall
rm -rf node_modules package-lock.json
npm install
```

### Production Issues

See [DEPLOYMENT.md - Troubleshooting Section](./DEPLOYMENT.md#-troubleshooting)

---

## 📈 Performance

- **WebSocket latency**: <50ms (same region)
- **Game round**: 10-15 seconds average
- **API response time**: <100ms (p95)
- **Concurrent users**: 100+ (Oracle free tier)
- **Database queries**: Optimized with indexes

---

## 🌐 Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers (iOS Safari, Chrome Mobile)

---

## 📝 Environment Variables

### Backend (`apps/server/.env`)

See [apps/server/.env.production.example](apps/server/.env.production.example) for complete list.

Key variables:
- `DATABASE_URL` - Supabase connection string
- `SUPABASE_URL` - Supabase project URL
- `CLOUDINARY_*` - Image storage credentials
- `CLIENT_URL` - Frontend URL for CORS
- `JWT_SECRET` - Token signing key

### Frontend (`apps/web/.env`)

- `VITE_API_URL` - Backend API URL (configured in Vercel)

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

---

## 📄 License

This project is proprietary software. All rights reserved.

---

## 🆘 Support

- **Documentation**: Start with [DEPLOYMENT.md](./DEPLOYMENT.md)
- **Issues**: Check troubleshooting sections in docs
- **Questions**: Review code comments and architecture

---

## 🎯 Roadmap

- [ ] Mobile apps (React Native)
- [ ] Additional payment methods
- [ ] Tournament system
- [ ] Leaderboards
- [ ] Social features (friends, challenges)
- [ ] Multi-language support
- [ ] Advanced analytics dashboard

---

## 🙏 Acknowledgments

Built with:
- React & TypeScript
- Node.js & Express
- Socket.IO for real-time features
- Prisma ORM
- Tailwind CSS
- Framer Motion

---

## 📞 Quick Links

- [Deployment Guide](./DEPLOYMENT.md) - Full production deployment
- [Quick Start](./QUICK-START.md) - Fast deployment reference
- [Pre-deployment Checklist](./PRE-DEPLOYMENT-CHECKLIST.md) - Verification steps
- [File Summary](./DEPLOYMENT-SUMMARY.md) - Understanding deployment files

---

**Ready to deploy?** Start with [DEPLOYMENT.md](./DEPLOYMENT.md) 🚀
