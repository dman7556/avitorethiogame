import prisma from '../lib/prisma';
import { TtlCache } from '../lib/ttl-cache';

const PROFANITY_LIST = [
  'damn', 'hell', 'crap', 'stupid', 'idiot', 'dumb',
  // Add more as needed - basic filter for demo
];

// Per-user last-message timestamps. Bounded (audit M3): entries expire after
// one rate-limit window (an expired timestamp means "no recent message") and
// the map can never hold more than MAX_TRACKED_USERS entries.
const rateLimitMap = new TtlCache<number>(10_000, 10_000);

export class ChatService {
  private rateLimitMs: number;
  private maxMessageLength: number;

  constructor(rateLimitMs = 1000, maxMessageLength = 500) {
    this.rateLimitMs = rateLimitMs;
    this.maxMessageLength = maxMessageLength;
  }

  async sendMessage(userId: string, message: string) {
    // Rate limit check
    const lastMessage = rateLimitMap.get(userId);
    const now = Date.now();
    if (lastMessage && now - lastMessage < this.rateLimitMs) {
      const retryAfter = this.rateLimitMs - (now - lastMessage);
      throw new ChatError('Rate limited', 'RATE_LIMITED', retryAfter);
    }

    // Length check
    if (message.length > this.maxMessageLength) {
      throw new ChatError('Message too long', 'MESSAGE_TOO_LONG');
    }

    // Empty message
    if (message.trim().length === 0) {
      throw new ChatError('Empty message', 'EMPTY_MESSAGE');
    }

    // Profanity filter
    const filteredMessage = this.filterProfanity(message.trim());

    // Save to database
    const chatMessage = await prisma.chatMessage.create({
      data: {
        userId,
        message: filteredMessage,
      },
      include: {
        user: {
          select: { name: true },
        },
      },
    });

    // Update rate limit
    rateLimitMap.set(userId, now);

    return {
      id: chatMessage.id,
      username: chatMessage.user.name,
      message: chatMessage.message,
      timestamp: chatMessage.createdAt.toISOString(),
    };
  }

  async getRecentMessages(limit = 50) {
    const messages = await prisma.chatMessage.findMany({
      include: {
        user: {
          select: { name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return messages.reverse().map((m) => ({
      id: m.id,
      username: m.user.name,
      message: m.message,
      timestamp: m.createdAt.toISOString(),
    }));
  }

  private filterProfanity(message: string): string {
    let filtered = message;
    for (const word of PROFANITY_LIST) {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      filtered = filtered.replace(regex, '*'.repeat(word.length));
    }
    return filtered;
  }
}

export class ChatError extends Error {
  code: string;
  retryAfter?: number;

  constructor(message: string, code: string, retryAfter?: number) {
    super(message);
    this.name = 'ChatError';
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

export const chatService = new ChatService();
