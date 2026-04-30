"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type ScoreRow = {
  user_id: string;
  points: number;
};

type ProfileRow = {
  id: string;
  nickname: string;
};

type LeaderboardRow = {
  user_id: string;
  points: number;
  nickname: string;
};

export default function Leaderboard() {
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [message, setMessage] = useState("Chargement...");

  async function loadLeaderboard() {
    const { data: scores, error: scoresError } = await supabase
      .from("user_scores")
      .select("user_id, points")
      .order("points", { ascending: false });

    if (scoresError) {
      setMessage(`Erreur scores : ${scoresError.message}`);
      return;
    }

    if (!scores || scores.length === 0) {
      setRows([]);
      setMessage("Aucun score pour le moment.");
      return;
    }

    const userIds = scores.map((row) => row.user_id);

    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, nickname")
      .in("id", userIds);

    if (profilesError) {
      setMessage(`Erreur profils : ${profilesError.message}`);
      return;
    }

    const profileMap = new Map(
      (profiles ?? []).map((profile: ProfileRow) => [
        profile.id,
        profile.nickname,
      ])
    );

    const merged = (scores as ScoreRow[]).map((score) => ({
      user_id: score.user_id,
      points: score.points,
      nickname: profileMap.get(score.user_id) ?? "Inconnu",
    }));

    setRows(merged);
    setMessage("");
  }

useEffect(() => {
  void Promise.resolve().then(() => loadLeaderboard());

  const channel = supabase
      .channel("user_scores_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_scores",
        },
        () => {
          loadLeaderboard();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <section className="w-full">
      {message ? (
        <p>{message}</p>
      ) : (
        <div className="w-full overflow-hidden rounded-3xl border border-red-500 bg-red-50">
          <div className="border-b border-red-500 bg-red-100 px-4 py-3 text-sm font-semibold text-slate-800">
            Classement live
          </div>
          <div className="divide-y divide-slate-200">
            {rows.map((row, index) => (
              <div key={row.user_id} className="grid grid-cols-[1fr_auto] items-center gap-4 px-4 py-3 min-w-0">
                <span className="group relative inline-flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm text-slate-800 min-w-0">
                    #{index + 1} — {row.nickname}
                  </span>
                  <div className="pointer-events-none invisible absolute left-0 top-full z-20 mt-2 min-w-[18rem] rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-800 shadow-xl opacity-0 transition duration-150 group-hover:visible group-hover:opacity-100">
                    <p className="font-semibold">Détail des Points</p>
                    <ul className="mt-2 space-y-1 text-slate-700">
                      <li>Pronostics Groupe — {row.points} pts</li>
                      <li>Pronostics Tours Eliminatoires — 0 pts</li>
                      <li>Pronostics 2nd Tour Réel — 0 pts</li>
                      <li>Meilleur butteur — 0 pts</li>
                    </ul>
                  </div>
                </span>
                <strong className="shrink-0 text-slate-900">{row.points} pts</strong>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
