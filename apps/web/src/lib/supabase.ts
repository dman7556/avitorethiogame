import { API_BASE } from './config';

/**
 * Supabase client for the frontend.
 * 
 * We DON'T use @supabase/supabase-js here because Node.js 20
 * (used by this project) doesn't have native WebSocket support.
 * Instead, the frontend talks to our Express backend which handles
 * all Supabase Auth operations via REST API.
 * 
 * The access token (JWT) from Supabase is stored in localStorage
 * and sent as a Bearer token in API requests.
 */

export const API_URL = API_BASE;

export interface SupabaseUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

export interface AuthResponse {
  success: boolean;
  data?: {
    user: {
      id: string;
      name: string;
      email: string;
      role: string;
      createdAt: string;
      updatedAt: string;
    };
    token: string;
  };
  error?: string;
  code?: string;
  email?: string;
}
