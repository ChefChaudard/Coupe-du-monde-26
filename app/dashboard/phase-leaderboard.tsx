"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type PhaseRow = {
  phase: string;
  user_id: string;
  nickname: string;
  points: number;
};

export default function PhaseLeaderboard() {
  const [rows, setRows] = useState<PhaseRow[]>([]);
  const [selectedPhase, setSelectedPhase] = useState<string>("");

  async function loadRows() {
    const { data } = await supabase
      .from("phase_leaderboard")
      .select("*")
      .order("phase", { ascending: true })
      .order("points", { ascending: false });

    const safeRows = (data ?? []) as PhaseRow[];

    setRows(safeRows);

    if (!selectedPhase && safeRows.length > 0) {
      setSelectedPhase(safeRows[0].phase);
    }
  }

useEffect(() => {
  void Promise.resolve().then(() => loadRows());

  const channel = supabase
      .channel("phase-leaderboard-live")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_scores",
        },
        () => loadRows()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

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

            <strong>{row.points} pts</strong>
          </div>
        ))}
      </div>
    </section>
  );
}