/**
 * Per-route SEO: title, meta description, canonical, Open Graph, Twitter
 * card, and optional JSON-LD structured data.
 *
 * SPA caveat: crawlers that don't execute JS (and some link-preview bots)
 * only ever see the static index.html, so index.html carries the default
 * (landing-page) metadata. This hook keeps every route correct for
 * Googlebot (renders JS) and updates tags on client-side navigation.
 */
import { useEffect } from 'react';

const SITE_NAME = 'Aviator';
const PROD_ORIGIN = 'https://ethioaviator.com';
const DEFAULT_OG_IMAGE = `${PROD_ORIGIN}/og-image.png`;

/** Canonical origin: production domain everywhere (dev included) so
 *  canonicals never point at localhost or preview ports. */
function origin(): string {
  if (import.meta.env.PROD) return PROD_ORIGIN;
  return typeof window !== 'undefined' ? window.location.origin : PROD_ORIGIN;
}

function upsertMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

export interface PageMeta {
  /** Unique, human-written page title (site name is appended automatically) */
  title: string;
  description: string;
  /** Path portion of the canonical URL, e.g. "/register" */
  path: string;
  /** JSON-LD structured data object(s) for this page */
  jsonLd?: object[];
}

export function usePageMeta({ title, description, path, jsonLd }: PageMeta) {
  useEffect(() => {
    const canonical = `${origin()}${path}`;
    const ogImage = import.meta.env.PROD ? DEFAULT_OG_IMAGE : `${window.location.origin}/og-image.png`;

    document.title = `${title} | ${SITE_NAME}`;
    upsertMeta('name', 'description', description);
    upsertLink('canonical', canonical);

    upsertMeta('property', 'og:title', title);
    upsertMeta('property', 'og:description', description);
    upsertMeta('property', 'og:url', canonical);
    upsertMeta('property', 'og:image', ogImage);
    upsertMeta('property', 'og:type', 'website');
    upsertMeta('property', 'og:site_name', SITE_NAME);

    upsertMeta('name', 'twitter:card', 'summary_large_image');
    upsertMeta('name', 'twitter:title', title);
    upsertMeta('name', 'twitter:description', description);
    upsertMeta('name', 'twitter:image', ogImage);

    // JSON-LD: replace on every navigation, never stack
    document.querySelectorAll('script[data-seo-ld]').forEach((n) => n.remove());
    (jsonLd ?? []).forEach((obj) => {
      const s = document.createElement('script');
      s.type = 'application/ld+json';
      s.setAttribute('data-seo-ld', 'true');
      s.textContent = JSON.stringify(obj);
      document.head.appendChild(s);
    });
  }, [title, description, path, jsonLd]);
}
