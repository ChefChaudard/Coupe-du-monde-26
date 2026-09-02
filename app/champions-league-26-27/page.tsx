import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Champion's League 26-27",
};

export default function ChampionsLeagueHome() {
  return (
    <main className="py-8 sm:py-10">
      <div className="grid items-start gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-3xl border border-slate-200 bg-white/85 p-8 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
            Pronos
          </p>

          <h1 className="mt-4 max-w-2xl text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl lg:text-6xl">
            Champion&apos;s League 26-27
          </h1>

          <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
            Cette compétition arrive bientôt. Les pronostics Champion&apos;s League
            26-27 seront disponibles ici dès leur mise en ligne.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/"
              className="rounded-full border border-slate-300 bg-white px-6 py-3 font-semibold text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-50"
            >
              ← Retour à l&apos;accueil
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}