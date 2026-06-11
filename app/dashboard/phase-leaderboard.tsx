"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { fetchAllRows } from "@/lib/supabase/fetch-all-rows";
import {
  computeMatchOdds,
  getPredictionPoints,
  type MatchOdds,
} from "./scoring";
import { formatOneDecimal } from "./format";

type PhaseRow = {
  phase: string;
  user_id: string;
  nickname: string;
  points: number;
};

type MatchRow = {
  phase: string;
  score_a: number | null;
  score_b: number | null;
  is_finished: boolean | null;
};

type PredictionRow = {
  user_id: string;
  match_id: number;
  predicted_a: number;
  predicted_b: number;
  matches: MatchRow | MatchRow[] | null;
};

type ProfileRow = {
  id: string;
  nickname: string | null;
};

export default function PhaseLeaderboard() {
  const [rows, setRows] = useState<PhaseRow[]>([]);
  const [selectedPhase, setSelectedPhase] = useState<string>("");

  const loadRows = useCallback(async function loadRows() {
    const [{ data: predictions, error: predictionsError }, { data: profiles, error: profilesError }] = await Promise.all([
      fetchAllRows<PredictionRow>(() =>
        supabase
          .from("predictions")
          .select(`
            user_id,
            match_id,
            predicted_a,
            predicted_b,
            matches (
              phase,
              score_a,
              score_b,
              is_finished
            )
          `)
          .order("match_id", { ascending: true })
          .order("user_id", { ascending: true })
      ),
      supabase
        .from("profiles")
        .select("id, nickname"),
    ]);

    if (predictionsError) {
      console.error(predictionsError);
      return;
    }

    if (profilesError) {
      console.error(profilesError);
      return;
    }

    const profileMap = new Map(
      (profiles ?? []).map((profile: ProfileRow) => [
        profile.id,
        profile.nickname ?? "Inconnu",
      ])
    );

    const safePredictions = (predictions ?? []) as PredictionRow[];
    const matchOddsMap = new Map<number, { predicted_a: number; predicted_b: number }[]>();

    for (const prediction of safePredictions) {
      const match = Array.isArray(prediction.matches)
        ? prediction.matches[0]
        : prediction.matches;

      if (!match) continue;

      const current = matchOddsMap.get(prediction.match_id) ?? [];
      current.push({
        predicted_a: prediction.predicted_a,
        predicted_b: prediction.predicted_b,
      });
      matchOddsMap.set(prediction.match_id, current);
    }

    const oddsByMatchId = new Map<number, MatchOdds>();
    for (const [matchId, list] of matchOddsMap.entries()) {
      oddsByMatchId.set(matchId, computeMatchOdds(list));
    }

    const rowsByPhase = new Map<string, PhaseRow[]>();

    for (const prediction of safePredictions) {
      const match = Array.isArray(prediction.matches)
        ? prediction.matches[0]
        : prediction.matches;

      if (!match) continue;

      const odds = oddsByMatchId.get(prediction.match_id) ?? { one: 1, draw: 1, two: 1 };
      const points = getPredictionPoints(
        prediction.predicted_a,
        prediction.predicted_b,
        match.score_a,
        match.score_b,
        match.is_finished,
        match.phase,
        odds
      );

      if (points <= 0) continue;

      const phaseRows = rowsByPhase.get(match.phase) ?? [];
      const existing = phaseRows.find((row) => row.user_id === prediction.user_id);

      if (existing) {
        existing.points += points;
      } else {
        phaseRows.push({
          phase: match.phase,
          user_id: prediction.user_id,
          nickname: profileMap.get(prediction.user_id) ?? "Inconnu",
          points,
        });
      }

      rowsByPhase.set(match.phase, phaseRows);
    }

    const safeRows = Array.from(rowsByPhase.values()).flat();

    safeRows.sort((a, b) => {
      if (a.phase !== b.phase) return a.phase.localeCompare(b.phase);
      return b.points - a.points;
    });

    setRows(safeRows);

    if (!selectedPhase && safeRows.length > 0) {
      setSelectedPhase(safeRows[0].phase);
    }
  }, [selectedPhase]);

  useEffect(() => {
    void Promise.resolve().then(() => loadRows());

    const channel = supabase
      .channel("phase-leaderboard-live")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "predictions",
        },
        () => loadRows()
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "matches",
        },
        () => loadRows()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadRows]);

  const phases = Array.from(new Set(rows.map((row) => row.phase)));

  const filteredRows = rows
    .filter((row) => row.phase === selectedPhase)
    .sort((a, b) => b.points - a.points);

  return (
    <section className="rounded-xl border p-4">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-2xl font-bold">Classement par phase</h2>

        <select
          value={selectedPhase}
          onChange={(e) => setSelectedPhase(e.target.value)}
          className="rounded border px-3 py-2 text-sm"
        >
          {phases.map((phase) => (
            <option key={phase} value={phase}>
              {phase}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        {filteredRows.map((row, index) => (
          <div
            key={`${row.phase}-${row.user_id}`}
            className="flex justify-between rounded bg-gray-50 px-4 py-2"
          >
            <span>
              #{index + 1} - {row.nickname}
            </span>

            <strong>{formatOneDecimal(row.points)} pts</strong>
          </div>
        ))}
      </div>
    </section>
  );
}
