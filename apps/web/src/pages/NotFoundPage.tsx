import PublicPage from '../components/PublicPage';
import { usePageMeta } from '../lib/seo';

export default function NotFoundPage() {
  usePageMeta({
    title: 'Page Not Found (404)',
    description: 'That page does not exist. Head back to the game or the help pages.',
    path: '/404',
  });

  return (
    <PublicPage title="Page not found">
      <section className="space-y-4 text-sm text-sky-text-secondary">
        <p className="text-5xl font-extrabold text-white font-mono">404</p>
        <p>The curve flew off with that page — it does not exist.</p>
        <div className="flex flex-wrap gap-3 pt-2">
          <a
            href="/"
            className="rounded-lg bg-[#35cc47] hover:brightness-110 transition text-white font-bold px-4 py-2.5 text-sm"
          >
            Back to the game
          </a>
          <a
            href="/provably-fair"
            className="rounded-lg border border-white/20 hover:border-white/40 transition px-4 py-2.5 text-sm"
          >
            How the game stays fair
          </a>
        </div>
      </section>
    </PublicPage>
  );
}
