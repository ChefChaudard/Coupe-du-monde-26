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
      setMessage(`Erreur scores: ${scoresError.message}`);
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
      setMessage(`Erreur profils: ${profilesError.message}`);
      return;
    }

    const profileMap = new Map(
      (profiles ?? []).map((profile: ProfileRow) => [profile.id, profile.nickname])
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
    loadLeaderboard();

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
    <section className="border rounded-2xl p-6 h-fit">
      <h2 className="text-2xl font-bold mb-4">Classement live</h2>

      {message ? (
        <p>{message}</p>
      ) : (
        <div className="space-y-3">
          {rows.map((row, index) => (
            <div
              key={row.user_id}
              className="flex items-center justify-between border rounded-xl px-4 py-3"
            >
              <span>
                #{index + 1} — {row.nickname}
              </span>
              <strong>{row.points} pts</strong>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}