"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";

const GROUP_NAME = "Phase de ligue";
const POSITION_OFFSET = 1000;
const HOLD_INITIAL_DELAY_MS = 400;
const HOLD_REPEAT_INTERVAL_MS = 150;

type PredictionRow = {
  team_name: string;
  predicted_position: number;
};

export default function LeagueRankingPrediction({
  userId,
  teams,
  realRankByTeam,
  locked = false,
}: {
  userId: string;
  teams: string[];
  realRankByTeam: Record<string, number>;
  locked?: boolean;
}) {
  const [orderedTeams, setOrderedTeams] = useState<string[]>(teams);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const holdTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    async function loadPrediction() {
      const { data, error } = await supabase
        .from("group_predictions")
        .select("team_name, predicted_position")
        .eq("user_id", userId)
        .eq("group_name", GROUP_NAME)
        .order("predicted_position", { ascending: true });

      if (error) {
        console.error("Erreur chargement classement:", JSON.stringify(error, null, 2));
        setOrderedTeams(teams);
        setLoading(false);
        return;
      }

      const savedRows = (data ?? []) as PredictionRow[];

      if (savedRows.length > 0) {
        const savedTeamNames = savedRows.map((row) => row.team_name).filter((team) => teams.includes(team));
        const missingTeams = teams.filter((team) => !savedTeamNames.includes(team));
        setOrderedTeams([...savedTeamNames, ...missingTeams]);
      } else {
        setOrderedTeams(teams);
      }

      setLoading(false);
    }

    void loadPrediction();
  }, [userId, teams]);

  useEffect(() => {
    return () => {
      stopRepeat();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function moveTeamByName(team: string, direction: -1 | 1) {
    if (locked) return;

    setOrderedTeams((prev) => {
      const index = prev.indexOf(team);
      if (index === -1) return prev;

      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;

      const next = [...prev];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });

    setSaveMessage(null);
  }

  function stopRepeat() {
    if (holdTimeoutRef.current) {
      clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }
    if (holdIntervalRef.current) {
      clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
  }

  function startRepeat(team: string, direction: -1 | 1) {
    if (locked) return;

    stopRepeat();
    moveTeamByName(team, direction);

    holdTimeoutRef.current = setTimeout(() => {
      holdIntervalRef.current = setInterval(() => {
        moveTeamByName(team, direction);
      }, HOLD_REPEAT_INTERVAL_MS);
    }, HOLD_INITIAL_DELAY_MS);
  }

  function handlePointerDown(
    event: React.PointerEvent<HTMLButtonElement>,
    team: string,
    direction: -1 | 1
  ) {
    if (locked) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    startRepeat(team, direction);
  }

  function handlePointerUp(event: React.PointerEvent<HTMLButtonElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    stopRepeat();
  }

  async function handleSave() {
    if (saving || locked) return;

    setSaving(true);
    setSaveMessage(null);

    const finalRows = orderedTeams.map((team, index) => ({
      user_id: userId,
      group_name: GROUP_NAME,
      team_name: team,
      predicted_position: index + 1,
      updated_at: new Date().toISOString(),
    }));

    const tempRows = finalRows.map((row) => ({
      ...row,
      predicted_position: row.predicted_position + POSITION_OFFSET,
    }));

    const { error: tempError } = await supabase
      .from("group_predictions")
      .upsert(tempRows, { onConflict: "user_id,group_name,team_name" });

    if (tempError) {
      console.error("Erreur sauvegarde classement (phase 1):", JSON.stringify(tempError, null, 2));
      setSaveMessage("Erreur lors de la sauvegarde.");
      setSaving(false);
      return;
    }

    const { error: finalErrorResult } = await supabase
      .from("group_predictions")
      .upsert(finalRows, { onConflict: "user_id,group_name,team_name" });

    setSaving(false);

    if (finalErrorResult) {
      console.error("Erreur sauvegarde classement (phase 2):", JSON.stringify(finalErrorResult, null, 2));
      setSaveMessage("Erreur lors de la sauvegarde.");
      return;
    }

    setSaveMessage("Classement sauvegarde.");
  }

  if (loading) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-500">Chargement...</p>
      </section>
    );
  }

  return (
    <section className="space-y-4 text-slate-900">
      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">Classement phase de ligue</h1>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Classez les 36 equipes de la 1ere a la 36eme place a l&apos;aide des fleches, puis sauvegardez.
            Maintenez une fleche enfoncee pour deplacer une equipe plusieurs fois de suite.
          </p>
        </div>
        <button type="button" onClick={() => void handleSave()} disabled={saving || locked}
          className="rounded bg-[#7a1f2c] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#5f1822] disabled:opacity-60">
          {saving ? "Sauvegarde..." : "Sauvegarder"}
        </button>
      </div>

      {locked ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
          La competition a debute : le classement est verrouille et ne peut plus etre modifie.
        </div>
      ) : null}

      {saveMessage && <p className="text-sm">{saveMessage}</p>}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <ul className="divide-y divide-slate-100">
          {orderedTeams.map((team, index) => {
            const tierLabel =
              index === 0
                ? { text: "Qualifies pour les 8emes", className: "bg-[#014421]" }
                : index === 8
                  ? { text: "Qualifiees pour les Barrages", className: "bg-orange-600" }
                  : index === 24
                    ? { text: "Eliminees", className: "bg-red-700" }
                    : null;

            const teamTextClassName = index < 8 ? "text-[#014421]" : index < 24 ? "text-orange-700" : "text-red-700";

            return (
              <li key={team}>
                {tierLabel ? (
                  <div className={`px-4 py-2 text-xs font-bold uppercase tracking-wide text-white ${tierLabel.className}`}>
                    {tierLabel.text}
                  </div>
                ) : null}

                <div className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                  <span className="w-8 shrink-0 text-right text-sm font-semibold text-slate-500">{index + 1}</span>
                  <span className={`flex-1 text-sm font-semibold ${teamTextClassName}`}>{team}</span>
                  <div className="flex shrink-0 items-center gap-1">
                    <span className="text-xs font-semibold text-slate-400">
                      ({realRankByTeam[team] ?? "-"})
                    </span>
                    <button
                      type="button"
                      onPointerDown={(event) => handlePointerDown(event, team, -1)}
                      onPointerUp={handlePointerUp}
                      onPointerCancel={handlePointerUp}
                      onKeyDown={(event) => {
                        if ((event.key === "Enter" || event.key === " ") && !event.repeat) {
                          event.preventDefault();
                          startRepeat(team, -1);
                        }
                      }}
                      onKeyUp={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          stopRepeat();
                        }
                      }}
                      disabled={index === 0 || locked}
                      aria-label={`Monter ${team}`}
                      className="rounded border border-slate-200 bg-white px-2 py-1 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                      dangerouslySetInnerHTML={{ __html: "&uarr;" }} />
                    <button
                      type="button"
                      onPointerDown={(event) => handlePointerDown(event, team, 1)}
                      onPointerUp={handlePointerUp}
                      onPointerCancel={handlePointerUp}
                      onKeyDown={(event) => {
                        if ((event.key === "Enter" || event.key === " ") && !event.repeat) {
                          event.preventDefault();
                          startRepeat(team, 1);
                        }
                      }}
                      onKeyUp={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          stopRepeat();
                        }
                      }}
                      disabled={index === orderedTeams.length - 1 || locked}
                      aria-label={`Descendre ${team}`}
                      className="rounded border border-slate-200 bg-white px-2 py-1 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                      dangerouslySetInnerHTML={{ __html: "&darr;" }} />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}