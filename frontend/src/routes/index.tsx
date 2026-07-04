import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/')({ component: HomePage })

function HomePage() {
  return (
    <main className="page-wrap px-4 pb-8 pt-14">
      <section className="island-shell rise-in relative overflow-hidden rounded-[2rem] px-6 py-10 sm:px-10 sm:py-14">
        <div className="pointer-events-none absolute -left-20 -top-24 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(249,115,22,0.22),transparent_66%)]" />
        <div className="pointer-events-none absolute -bottom-20 -right-20 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(239,68,68,0.12),transparent_66%)]" />
        <p className="island-kicker mb-3">¡Bienvenido a ComeRico!</p>
        <h1 className="display-title mb-5 max-w-3xl text-4xl leading-[1.02] font-bold tracking-tight text-[var(--sea-ink)] sm:text-6xl">
          ¿Qué vamos a comer hoy? 🍽️
        </h1>
        <p className="mb-8 max-w-2xl text-base text-[var(--sea-ink-soft)] sm:text-lg">
          Organiza los platillos de tu hogar y deja que la ruleta resuelva la
          eterna pregunta: <em>¿qué comemos?</em>
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            to="/roulette"
            className="rounded-full border border-[rgba(249,115,22,0.3)] bg-[rgba(249,115,22,0.14)] px-5 py-2.5 text-sm font-semibold text-orange-700 no-underline transition hover:-translate-y-0.5 hover:bg-[rgba(249,115,22,0.24)] dark:text-orange-400"
          >
            🎡 Girar la Ruleta
          </Link>
          <Link
            to="/dishes"
            className="rounded-full border border-[rgba(23,58,64,0.2)] bg-white/50 px-5 py-2.5 text-sm font-semibold text-[var(--sea-ink)] no-underline transition hover:-translate-y-0.5 hover:border-[rgba(23,58,64,0.35)]"
          >
            🍲 Ver Platillos
          </Link>
        </div>
      </section>

      <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(
          [
            ['🎡', 'Ruleta en Tiempo Real', 'Gira la ruleta y todos los miembros del hogar ven el resultado al instante gracias a SignalR.'],
            ['🍲', 'Tus Platillos', 'Agrega, edita y organiza todos los platillos que el hogar disfruta comer.'],
            ['🏠', 'Por Hogar', 'Cada hogar tiene su propio espacio privado. Solo tus platillos, solo tu familia.'],
          ] as const
        ).map(([icon, title, desc], i) => (
          <article
            key={title}
            className="island-shell feature-card rise-in rounded-2xl p-5"
            style={{ animationDelay: `${i * 90 + 80}ms` }}
          >
            <div className="mb-2 text-2xl">{icon}</div>
            <h2 className="mb-2 text-base font-semibold text-[var(--sea-ink)]">{title}</h2>
            <p className="m-0 text-sm text-[var(--sea-ink-soft)]">{desc}</p>
          </article>
        ))}
      </section>
    </main>
  )
}
