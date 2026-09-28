#!/bin/bash

# ==========================================
# SkyRush Aviator — Oracle Cloud Initial Setup
# ==========================================
# Run this script ONCE on a fresh Oracle Cloud VM
# This installs all required dependencies

set -e

echo "🔧 Setting up Oracle Cloud VM for SkyRush..."

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

# Update system
echo -e "${BLUE}📦 Updating system packages...${NC}"
sudo apt-get update
sudo apt-get upgrade -y

# Install Node.js 20.x
echo -e "${BLUE}📦 Installing Node.js 20.x...${NC}"
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 globally
echo -e "${BLUE}📦 Installing PM2 process manager...${NC}"
sudo npm install -g pm2

# Setup PM2 startup script
echo -e "${BLUE}🔄 Configuring PM2 to start on boot...${NC}"
sudo pm2 startup systemd -u $USER --hp /home/$USER
pm2 save

# Install Git (if not already installed)
echo -e "${BLUE}📦 Installing Git...${NC}"
sudo apt-get install -y git

# Install build essentials (for native dependencies)
echo -e "${BLUE}📦 Installing build tools...${NC}"
sudo apt-get install -y build-essential

# Configure firewall (if using iptables)
echo -e "${BLUE}🔥 Configuring firewall...${NC}"
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 8080 -j ACCEPT
sudo netfilter-persistent save || echo "Note: netfilter-persistent not installed"

# Create app directory
echo -e "${BLUE}📁 Creating application directory...${NC}"
mkdir -p ~/skyrush
cd ~/skyrush

echo -e "${GREEN}✅ Initial setup completed!${NC}"
echo ""
echo "Next steps:"
echo "1. Clone your repository: git clone <your-repo-url> ."
echo "2. Copy .env.production.example to .env and fill in your credentials"
echo "3. Run: bash deploy.sh"
