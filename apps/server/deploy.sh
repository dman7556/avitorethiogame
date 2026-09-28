#!/bin/bash

# ==========================================
# SkyRush Aviator — Oracle Cloud Deployment Script
# ==========================================
# This script automates deployment on Oracle Cloud VM
# Run this script on your Oracle Cloud instance

set -e  # Exit on error

echo "🚀 Starting SkyRush Backend Deployment..."

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${RED}❌ Error: .env file not found!${NC}"
    echo "Please create .env file from .env.production.example and fill in your credentials"
    exit 1
fi

echo -e "${BLUE}📦 Installing dependencies...${NC}"
npm ci

echo -e "${BLUE}🔨 Building shared package...${NC}"
npm run build:shared

echo -e "${BLUE}🔨 Building server...${NC}"
npm run build:server

echo -e "${BLUE}🗄️  Running database migrations...${NC}"
npm run db:push

echo -e "${BLUE}📁 Creating upload directories...${NC}"
mkdir -p uploads/deposits
mkdir -p logs

echo -e "${BLUE}🔄 Restarting PM2 process...${NC}"
if pm2 list | grep -q "skyrush-backend"; then
    pm2 restart skyrush-backend
else
    pm2 start ecosystem.config.js
fi

echo -e "${BLUE}💾 Saving PM2 configuration...${NC}"
pm2 save

echo -e "${GREEN}✅ Deployment completed successfully!${NC}"
echo ""
echo -e "${BLUE}📊 View logs:${NC} pm2 logs skyrush-backend"
echo -e "${BLUE}📈 View status:${NC} pm2 status"
echo -e "${BLUE}🔄 Restart:${NC} pm2 restart skyrush-backend"
echo -e "${BLUE}🛑 Stop:${NC} pm2 stop skyrush-backend"
