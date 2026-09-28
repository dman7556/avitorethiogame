import SiteFooter from './SiteFooter';

/**
 * Shared layout for public info pages (legal, provably fair, about):
 * semantic <main> landmark with exactly one <h1>, footer, dark theme.
 */
export default function PublicPage({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-sky-dark text-white">
      <header className="border-b border-white/10">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center">
          <a href="/" className="text-sky-red font-extrabold tracking-tight text-lg">
            Aviator
          </a>
        </div>
      </header>
      <main className="max-w-3xl mx-auto w-full px-4 py-8 grow">
        <h1 className="text-2xl font-bold mb-6">{title}</h1>
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
