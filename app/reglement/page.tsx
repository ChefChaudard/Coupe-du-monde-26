import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Reglement",
};

function formatDeadline(kickoffAt: string | null) {
  if (!kickoffAt) return "Date non encore definie";

  const date = new Date(kickoffAt);
  if (Number.isNaN(date.getTime())) return "Date non encore definie";

  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default async function ReglementPage() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) redirect("/login");

  const { data: firstMatch } = await supabase
    .from("matches")
    .select("kickoff_at")
    .eq("phase", "Phase de ligue")
    .order("kickoff_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const deadlineLabel = formatDeadline(firstMatch?.kickoff_at ?? null);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#7a1f2c]">
            Reglement
          </p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950">
            Champions League 26-27
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Format de la competition, attribution des points, et dates
            limites pour saisir vos pronostics.
          </p>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold tracking-tight text-slate-950">
            Format de la competition
          </h2>
          <div className="mt-4 space-y-4 text-sm leading-6 text-slate-700">
            <div>
              <h3 className="font-semibold text-slate-900">
                1. Phase de ligue (1er tour)
              </h3>
              <p className="mt-1">
                36 equipes s&apos;affrontent en une seule phase de ligue. A
                l&apos;issue de cette phase, un classement general de 1 a 36
                determine la suite :
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>Rangs 1 a 8 : qualifies directement pour les 8emes de finale.</li>
                <li>Rangs 9 a 24 : disputent les barrages (aller-retour) pour une place en 8emes.</li>
                <li>Rangs 25 a 36 : elimines de la competition.</li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">2. Barrages</h3>
              <p className="mt-1">
                Les 16 equipes classees 9 a 24 s&apos;affrontent en matchs
                aller-retour. Les 8 vainqueurs rejoignent les 8 qualifies
                directs en 8emes de finale.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">
                3. Phase finale
              </h3>
              <p className="mt-1">
                8emes de finale, quarts de finale, demi-finales puis finale,
                en matchs a elimination directe (8emes a demies en
                aller-retour, finale en match unique).
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold tracking-tight text-slate-950">
            Attribution des points
          </h2>
          <div className="mt-4 space-y-4 text-sm leading-6 text-slate-700">
            <div>
              <h3 className="font-semibold text-slate-900">
                Pronostics de matchs (1er tour, barrages, 2e tour reel)
              </h3>
              <p className="mt-1">
                Chaque match pronostique rapporte des points bases sur la
                cote reelle du match (issue bookmaker) :
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>Bonne issue (victoire / nul / victoire) trouvee : 1 fois la cote.</li>
                <li>Score exact trouve : 2 fois la cote.</li>
                <li>Issue incorrecte : 0 point.</li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">
                Classement des 36 equipes (1er tour)
              </h3>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>Equipe placee dans la bonne zone (qualifies 8emes / barrages / eliminees) : 3 points.</li>
                <li>Equipe placee exactement au bon rang (1 a 36) : 6 points.</li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">
                Equipes qualifiees (quarts, demi, finale, vainqueur)
              </h3>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>Equipe pronostiquee qui atteint reellement les quarts : 6 points.</li>
                <li>Equipe pronostiquee qui atteint reellement les demi-finales : 6 points.</li>
                <li>Equipe pronostiquee qui atteint reellement la finale : 12 points.</li>
                <li>Vainqueur pronostique qui remporte reellement la competition : 12 points.</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
          <h2 className="text-xl font-bold tracking-tight text-slate-950">
            Dates limites
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-700">
            Tous les pronostics (scores du 1er tour, classement des 36
            equipes, et equipes qualifiees en quarts / demi / finale /
            vainqueur) doivent etre saisis avant le coup d&apos;envoi du
            premier match de la phase de ligue. Passe ce coup d&apos;envoi,
            plus aucune modification n&apos;est possible.
          </p>
          <p className="mt-3 text-sm font-semibold text-amber-900">
            Coup d&apos;envoi du 1er match : {deadlineLabel}
          </p>
        </section>
      </div>
    </main>
  );
}
