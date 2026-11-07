import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/about")({
  component: About,
});

function About() {
  return (
    <main className="page-wrap px-4 py-12">
      <section className="island-shell rounded-2xl p-6 sm:p-8">
        <p className="island-kicker mb-2">Acerca de</p>
        <h1 className="display-title mb-3 text-4xl font-bold text-sea-ink sm:text-5xl">
          Rebasto: lo que hace falta en casa.
        </h1>
        <p className="m-0 max-w-3xl text-base leading-8 text-sea-ink-soft">
          Rebasto (<em>re</em> + <em>abasto</em>) ayuda a tu hogar a reabastecerse: lleva la lista de
          compras, avisa cuando algo se acaba y planifica qué vamos a comer durante la semana.
        </p>
      </section>
    </main>
  );
}
