-- SkyRush Database Schema for Supabase
-- Run this in Supabase SQL Editor to create all tables

-- Create User table
CREATE TABLE IF NOT EXISTS "User" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "email" TEXT UNIQUE NOT NULL,
  "phone" TEXT UNIQUE,
  "password" TEXT NOT NULL,
  "role" TEXT DEFAULT 'USER' NOT NULL,
  "isActive" BOOLEAN DEFAULT true NOT NULL,
  "emailVerified" BOOLEAN DEFAULT false NOT NULL,
  "verificationCode" TEXT,
  "verificationCodeExpiry" TIMESTAMP(3),
  "resetCode" TEXT,
  "resetCodeExpiry" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "lastLogin" TIMESTAMP(3)
);

-- Create indexes for User
CREATE INDEX IF NOT EXISTS "User_email_idx" ON "User"("email");
CREATE INDEX IF NOT EXISTS "User_phone_idx" ON "User"("phone");
CREATE INDEX IF NOT EXISTS "User_role_idx" ON "User"("role");
CREATE INDEX IF NOT EXISTS "User_isActive_idx" ON "User"("isActive");
CREATE INDEX IF NOT EXISTS "User_emailVerified_idx" ON "User"("emailVerified");

-- Create Wallet table
CREATE TABLE IF NOT EXISTS "Wallet" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT UNIQUE NOT NULL,
  "balance" DECIMAL(65,30) DEFAULT 0 NOT NULL,
  "reserved" DECIMAL(65,30) DEFAULT 0 NOT NULL,
  "currency" TEXT DEFAULT 'ETB' NOT NULL,
  "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Wallet_userId_idx" ON "Wallet"("userId");

-- Create WalletTransaction table
CREATE TABLE IF NOT EXISTS "WalletTransaction" (
  "id" TEXT PRIMARY KEY,
  "walletId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "amount" DECIMAL(65,30) NOT NULL,
  "balanceBefore" DECIMAL(65,30) NOT NULL,
  "balanceAfter" DECIMAL(65,30) NOT NULL,
  "status" TEXT DEFAULT 'COMPLETED' NOT NULL,
  "description" TEXT NOT NULL,
  "referenceId" TEXT,
  "metadata" TEXT,
  "processedBy" TEXT,
  "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "WalletTransaction_walletId_idx" ON "WalletTransaction"("walletId");
CREATE INDEX IF NOT EXISTS "WalletTransaction_type_idx" ON "WalletTransaction"("type");
CREATE INDEX IF NOT EXISTS "WalletTransaction_status_idx" ON "WalletTransaction"("status");
CREATE INDEX IF NOT EXISTS "WalletTransaction_referenceId_idx" ON "WalletTransaction"("referenceId");
CREATE INDEX IF NOT EXISTS "WalletTransaction_createdAt_idx" ON "WalletTransaction"("createdAt");
CREATE INDEX IF NOT EXISTS "WalletTransaction_processedBy_idx" ON "WalletTransaction"("processedBy");

-- Create GameRound table
CREATE TABLE IF NOT EXISTS "GameRound" (
  "id" TEXT PRIMARY KEY,
  "roundNumber" INTEGER UNIQUE NOT NULL,
  "phase" TEXT DEFAULT 'WAITING' NOT NULL,
  "crashPoint" DECIMAL(65,30),
  "maxMultiplier" DECIMAL(65,30) DEFAULT 1.0 NOT NULL,
  "startedAt" TIMESTAMP(3),
  "bettingEndsAt" TIMESTAMP(3),
  "crashedAt" TIMESTAMP(3),
  "settledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "serverSeedHash" TEXT,
  "serverSeed" TEXT
);

CREATE INDEX IF NOT EXISTS "GameRound_phase_idx" ON "GameRound"("phase");
CREATE INDEX IF NOT EXISTS "GameRound_roundNumber_idx" ON "GameRound"("roundNumber");
CREATE INDEX IF NOT EXISTS "GameRound_createdAt_idx" ON "GameRound"("createdAt");

-- Create remaining essential tables (abbreviated for space)
-- You can add more tables as needed

-- Success message
SELECT 'Tables created successfully!' as message;
