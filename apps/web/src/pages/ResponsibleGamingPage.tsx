import PublicPage from '../components/PublicPage';
import { usePageMeta } from '../lib/seo';

const RESOURCES = [
  {
    name: 'National Board for Sobriety & Anti-Addiction (Ethiopia)',
    note: 'Government body for addiction prevention and treatment referrals',
  },
  {
    name: 'GamCare',
    url: 'https://www.gamcare.org.uk/',
    note: 'Free confidential help and counselling for problem gamblers',
  },
  {
    name: 'Gambling Therapy',
    url: 'https://www.gamblingtherapy.org/',
    note: 'Online support in multiple languages, worldwide',
  },
];

export default function ResponsibleGamingPage() {
  usePageMeta({
    title: 'Responsible Gaming — Play Safe, Stay in Control',
    description:
      'Tools and resources for safe play: 18+ only, deposit limits, self-exclusion, and free independent help for problem gambling. Gambling is entertainment, not income.',
    path: '/responsible-gaming',
  });

  return (
    <PublicPage title="Responsible Gaming">
      <section className="space-y-4 text-sm leading-relaxed text-sky-text-secondary">
        <div className="flex items-start gap-3 bg-black/40 border border-white/10 rounded-lg p-4">
          <span
            aria-label="Adults 18 and over only"
            className="inline-flex items-center justify-center w-12 h-12 shrink-0 rounded-full border-2 border-white/40 text-xs font-extrabold text-white"
          >
            18+
          </span>
          <p className="text-white font-medium">
            Aviator is strictly for adults aged 18 and over. Accounts belonging
            to minors are closed and their balances returned where law allows.
          </p>
        </div>

        <h2 className="text-lg font-bold text-white pt-2">Golden rules</h2>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>Gamble for entertainment — never as a way to make money.</li>
          <li>Only ever bet money you can afford to lose.</li>
          <li>Set a budget before you play and stop when it is spent.</li>
          <li>Never chase losses. A "sure win" is never sure.</li>
          <li>Do not gamble when upset, stressed, or under the influence.</li>
          <li>Balance gambling with friends, family, and other interests.</li>
        </ul>

        <h2 className="text-lg font-bold text-white pt-2">Know the signs</h2>
        <p>
          Spending more or playing longer than you planned, hiding play from
          family, borrowing to bet, or gambling to escape problems — these are
          warning signs. The earlier you act, the easier it is to regain
          control.
        </p>

        <h2 className="text-lg font-bold text-white pt-2">Taking a break</h2>
        <p>
          You can request a self-exclusion (temporary or permanent) or a
          deposit limit at any time by contacting{' '}
          <a href="mailto:support@ethioaviator.com" className="underline hover:text-white">
            support@ethioaviator.com
          </a>
          . We will action it within one business day and will not send you
          marketing while an exclusion is active.
        </p>

        <h2 className="text-lg font-bold text-white pt-2">Free, independent help</h2>
        <ul className="space-y-3">
          {RESOURCES.map((r) => (
            <li key={r.name} className="bg-black/30 border border-white/10 rounded-lg p-3">
              <p className="text-white font-semibold">
                {r.url ? (
                  <a href={r.url} target="_blank" rel="noopener noreferrer" className="underline hover:text-sky-green-light">
                    {r.name}
                  </a>
                ) : (
                  r.name
                )}
              </p>
              <p className="text-xs mt-0.5">{r.note}</p>
            </li>
          ))}
        </ul>

        <p className="text-xs pt-2 text-sky-text-secondary/70">
          Gambling involves risk. Outcomes are random over which no player has
          control — see our{' '}
          <a href="/provably-fair" className="underline hover:text-white">provably fair page</a>{' '}
          for how outcomes are generated. This page is information, not advice.
        </p>
      </section>
    </PublicPage>
  );
}
