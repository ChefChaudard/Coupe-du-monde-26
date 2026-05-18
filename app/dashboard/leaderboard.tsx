"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type Prediction = {
  user_id: string;
  predicted_a: number;
  predicted_b: number;
  matches: {
    score_a: number | null;
    score_b: number | null;
    is_finished: boolean;
  } | null;
};

type Profile = {
  id: string;
  nickname: string;
};

type LeaderboardRow = {
  user_id: string;
  nickname: string;
  points: number;
};

function getPoints(p: Prediction) {
  const m = p.matches;

  if (!m || !m.is_finished || m.score_a === null || m.score_b === null) {
    return 0;
  }

  const exact = p.predicted_a === m.score_a && p.predicted_b === m.score_b;
  if (exact) return 3;

  const realDiff = m.score_a - m.score_b;
  const predDiff = p.predicted_a - p.predicted_b;

  const goodResult =
    (realDiff > 0 && predDiff > 0) ||
    (realDiff < 0 && predDiff < 0) ||
    (realDiff === 0 && predDiff === 0);

  return goodResult ? 1 : 0;
}

function getRankBadgeClass(index: number) {
  if (index === 0) return "border-amber-300 bg-amber-100 text-amber-950";
  if (index === 1) return "border-slate-300 bg-slate-100 text-slate-800";
  if (index === 2) return "border-orange-300 bg-orange-100 text-orange-950";

  return "border-emerald-100 bg-emerald-50 text-emerald-900";
}

export default function Leaderboard() {
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [message, setMessage] = useState("Chargement...");

  useEffect(() => {
    let cancelled = false;

    async function loadLeaderboard() {
      try {
        setMessage("Chargement...");

        const { data: predictions, error: predictionsError } = await supabase
          .from("predictions")
          .select(`
            user_id,
            predicted_a,
            predicted_b,
            matches (
              score_a,
              score_b,
              is_finished
            )
          `);

        if (cancelled) return;

        if (predictionsError) {
          console.error(predictionsError);
          setMessage(`Erreur pronostics : ${predictionsError.message}`);
          return;
        }

        const { data: profiles, error: profilesError } = await supabase
          .from("profiles")
          .select("id, nickname");

        if (cancelled) return;

        if (profilesError) {
          console.error(profilesError);
          setMessage(`Erreur profils : ${profilesError.message}`);
          return;
        }

        const profileMap = new Map(
          (profiles ?? []).map((profile: Profile) => [
            profile.id,
            profile.nickname,
          ])
        );

        const scoreMap = new Map<string, number>();

        ((predictions ?? []) as Prediction[]).forEach((prediction) => {
          const current = scoreMap.get(prediction.user_id) ?? 0;
          scoreMap.set(prediction.user_id, current + getPoints(prediction));
        });

        const leaderboard = Array.from(scoreMap.entries())
          .map(([user_id, points]) => ({
            user_id,
            points,
            nickname: profileMap.get(user_id) ?? "Inconnu",
          }))
          .sort((a, b) => b.points - a.points);

        setRows(leaderboard);
        setMessage(leaderboard.length ? "" : "Aucun score pour le moment.");
      } catch (error) {
        console.error("Erreur leaderboard:", error);
        setMessage("Erreur chargement classement.");
      }
    }

    void loadLeaderboard();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="w-full">
      {message ? (
        <p className="rounded-lg border border-emerald-100 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
          {message}
        </p>
      ) : (
        <div className="relative w-full overflow-visible rounded-lg border border-emerald-200 bg-white shadow-[0_18px_45px_rgba(15,118,110,0.10)]">
          <div className="flex items-center justify-between gap-3 rounded-t-lg border-b border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-semibold text-slate-900">
            <span>Classement live</span>
            <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-900">
              Live
            </span>
          </div>

          <div className="overflow-visible divide-y divide-slate-100">
            {rows.map((row, index) => (
              <div
                key={row.user_id}
                className="grid grid-cols-[1fr_auto] items-center gap-4 px-4 py-3 min-w-0 transition hover:bg-emerald-50/55"
              >
                <span className="group relative inline-flex min-w-0 items-center gap-2">
                  <span
                    className={`flex h-7 w-9 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${getRankBadgeClass(index)}`}
                  >
                    #{index + 1}
                  </span>

                  <span className="truncate text-sm text-slate-800 min-w-0">
                    {row.nickname}
                  </span>
                </span>

                <strong className="shrink-0 rounded-full bg-slate-900 px-3 py-1 text-sm text-white">
                  {row.points} pts
                </strong>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}