/**
 * Site-wide footer: the trust/E-E-A-T layer for a real-money site —
 * operator identity, legal pages, responsible-gambling and 18+ messaging.
 * Rendered on public pages (game, provably fair, legal, about).
 * `compact` (desktop game page): slimmer, single-row variant.
 */
export default function SiteFooter({ compact = false }: { compact?: boolean }) {
  return (
    <footer className="border-t border-white/10 bg-black/40 mt-auto">
      <div className={`max-w-5xl mx-auto px-4 ${compact ? 'py-4' : 'py-8'} text-sm text-sky-text-secondary`}>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 mb-4">
          <a href="/about" className="hover:text-white">About Us</a>
          <a href="/terms" className="hover:text-white">Terms of Service</a>
          <a href="/privacy" className="hover:text-white">Privacy Policy</a>
          <a href="/provably-fair" className="hover:text-white">Provably Fair</a>
          <a href="/responsible-gaming" className="hover:text-white">Responsible Gaming</a>
        </nav>

        {!compact && (
          <div className="flex items-center gap-3 mb-4">
            <span
              aria-label="Adults 18 and over only"
              className="inline-flex items-center justify-center w-10 h-10 rounded-full border-2 border-white/40 text-[11px] font-extrabold text-white"
            >
              18+
            </span>
            <p className="text-xs leading-relaxed max-w-xl">
              Gambling involves risk and can be addictive. Play responsibly and
              only bet what you can afford to lose. This service is intended for
              adults 18 years and older.
            </p>
          </div>
        )}

        <div className="text-xs leading-relaxed">
          <p className="font-semibold text-white/80 mb-1">Aviator</p>
          <p>
            Operated by Aviator Gaming — Addis Ababa, Ethiopia.{' '}
            <a href="mailto:support@ethioaviator.com" className="hover:text-white underline">
              support@ethioaviator.com
            </a>
          </p>
          {!compact && (
            <p className="mt-2 text-sky-text-secondary/70">
              Play responsibly. For help with problem gambling visit our{' '}
              <a href="/responsible-gaming" className="underline hover:text-white">
                responsible gaming page
              </a>
              .
            </p>
          )}
        </div>
      </div>
    </footer>
  );
}
