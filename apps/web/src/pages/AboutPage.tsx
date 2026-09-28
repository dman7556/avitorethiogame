import PublicPage from '../components/PublicPage';
import { usePageMeta } from '../lib/seo';

export default function AboutPage() {
  usePageMeta({
    title: 'About Us — Who Runs Aviator',
    description:
      'Who operates Aviator, how the game stays provably fair, and how to reach support. Real-money crash gaming from Addis Ababa, Ethiopia — transparent by design.',
    path: '/about',
  });

  return (
    <PublicPage title="About Aviator">
      <section className="space-y-4 text-sm leading-relaxed text-sky-text-secondary">
        <p>
          Aviator is a real-time crash game operated by{' '}
          <strong className="text-white">Aviator Gaming</strong>, based in
          Addis Ababa, Ethiopia. We built it around one idea:{' '}
          <strong className="text-white">a game you can verify beats a game
          you must trust.</strong>
        </p>

        <h2 className="text-lg font-bold text-white pt-2">What we stand for</h2>
        <ul className="space-y-2">
          <li className="bg-black/30 border border-white/10 rounded-lg p-3">
            <p className="text-white font-semibold">Provably fair outcomes</p>
            <p className="text-xs mt-1">
              Every round is committed via SHA-256 before betting opens and
              revealed afterwards —{' '}
              <a href="/provably-fair" className="underline hover:text-white">verify any round yourself</a>.
            </p>
          </li>
          <li className="bg-black/30 border border-white/10 rounded-lg p-3">
            <p className="text-white font-semibold">Honest money handling</p>
            <p className="text-xs mt-1">
              Every balance change is written to an immutable transaction
              ledger. Reserved funds cannot be bet while a withdrawal is
              pending.
            </p>
          </li>
          <li className="bg-black/30 border border-white/10 rounded-lg p-3">
            <p className="text-white font-semibold">Adults only, play responsibly</p>
            <p className="text-xs mt-1">
              Strictly 18+. Deposit limits and self-exclusion on request — see{' '}
              <a href="/responsible-gaming" className="underline hover:text-white">responsible gaming</a>.
            </p>
          </li>
        </ul>

        <h2 className="text-lg font-bold text-white pt-2">Contact</h2>
        <p>
          Support:{' '}
          <a href="mailto:support@ethioaviator.com" className="underline hover:text-white">
            support@ethioaviator.com
          </a>{' '}
          — we aim to reply within one business day.
        </p>
        <p className="text-xs text-sky-text-secondary/70">
          Aviator Gaming, Addis Ababa, Ethiopia. Gambling involves risk —
          please play responsibly and only bet what you can afford to lose.
        </p>
      </section>
    </PublicPage>
  );
}
