import type { Metadata } from "next";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { createClient } from "@/lib/supabase/server";
import { formatOneDecimal } from "@/app/dashboard/format";
import ScoreReportDetails from "@/app/dashboard/score-report-details";
import type { ScoreReportRow } from "@/app/dashboard/leaderboard-data";

export const metadata: Metadata = {
  title: "Classement | World Cup 26",
};

type Wc2026ResultRow = {
  user_id: string;
  nickname: string;
  rank: number;
  points: number;
  group_points: number;
  group_placement_points: number;
  knockout_points: number;
  top_scorer_points: number;
  real_points: number;
  score_report: ScoreReportRow[];
};

export default async function WorldCup26ClassementPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("wc2026_results")
    .select(
      "user_id, nickname, rank, points, group_points, group_placement_points, knockout_points, top_scorer_points, real_points, score_report"
    )
    .order("rank", { ascending: true });

  const results = (data ?? []) as Wc2026ResultRow[];

  return (
    <main className="min-h-screen bg-slate-50 px-3 py-4 text-slate-900">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        <section className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-700">
            World Cup 26
          </p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">
            Classement final
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Résultat figé de la compétition : classement général avec les
            points par catégorie, puis le détail complet des points de
            chaque joueur.
          </p>
        </section>

        {results.length === 0 ? (
          <section className="rounded-2xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500 shadow-sm">
            Résultats non encore disponibles.
          </section>
        ) : (
          <>
<section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2 text-left">#</th>
                    <th className="px-3 py-2 text-left">Joueur</th>
                    <th className="px-3 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((row) => (
                    <tr
                      key={row.user_id}
                      className="border-b border-slate-100 last:border-b-0"
                    >
                      <td className="px-3 py-2 font-bold text-slate-500">
                        {row.rank}
                      </td>
                      <td className="px-3 py-2 font-semibold text-slate-900">
                        {row.nickname}
                      </td>
                      <td className="px-3 py-2 text-right font-bold text-slate-900">
                        {formatOneDecimal(row.points)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <div className="flex flex-col gap-6">
              {results.map((row) => (
                <section
                  key={row.user_id}
                  className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
                >
                  <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-900 px-4 py-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">
                        #{row.rank}
                      </p>
                      <p className="text-base font-bold text-white">
                        {row.nickname}
                      </p>
                    </div>
                    <div className="rounded-full bg-white/10 px-3 py-1 text-sm font-bold text-white">
                      {formatOneDecimal(row.points)} pts
                    </div>
                  </div>

                  <div className="p-4">
                    <ScoreReportDetails reportRows={row.score_report} />
                  </div>
                </section>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}