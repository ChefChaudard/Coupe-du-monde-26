"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import {
  formatDashboardDate,
  formatMatchDate,
  formatMatchTime,
} from "@/app/lib/time-zone";
import { useUserTimeZone } from "@/app/lib/use-user-time-zone";

type Match = {
  id: number;
  phase: string;
  team_a: string;
  team_b: string;
  kickoff_at: string;
  venue?: string | null;
  score_a: number | null;
  score_b: number | null;
  is_finished: boolean | null;
};

type Prediction = {
  match_id: number;
  predicted_a: number;
  predicted_b: number;
};

type MatchStats = {
  myPoints: number | null;
  averagePoints: number | null;
};

type FormValues = Record<number, { a: string; b: string }>;

function getCityFromVenue(venue?: string | null) {
  if (!venue) return "-";
  return venue.split("-")[0].trim();
}

export default function RealKnockoutScoreForm({
  matches,
  existingPredictions,
  userId,
  matchStats,
  isAdmin,
  firstRoundComplete,
  firstRoundMissingScores,
  updateMatchResult,
  syncRealMatches,
}: {
  matches: Match[];
  existingPredictions: Prediction[];
  userId: string;
  matchStats: Record<number, MatchStats>;
  isAdmin: boolean;
  firstRoundComplete: boolean;
  firstRoundMissingScores: number;
  updateMatchResult: (formData: FormData) => Promise<void>;
  syncRealMatches: (formData: FormData) => Promise<void>;
}) {
  const initialValues = useMemo(() => {
    const values: FormValues = {};

    for (const prediction of existingPredictions) {
      values[prediction.match_id] = {
        a: String(prediction.predicted_a),
        b: String(prediction.predicted_b),
      };
    }

    return values;
  }, [existingPredictions]);

  const groupedMatches = useMemo(() => {
    const groups: Record<string, Match[]> = {};

    for (const match of matches) {
      if (!groups[match.phase]) groups[match.phase] = [];
      groups[match.phase].push(match);
    }

    return Object.entries(groups);
  }, [matches]);

  const [values, setValues] = useState<FormValues>(initialValues);
  const [savingGroup, setSavingGroup] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [simulatedNow, setSimulatedNow] = useState<string | null>(null);
  const timeZone = useUserTimeZone();

  useEffect(() => {
    function handleSimulatedDateUpdated(event: Event) {
      const nextValue = (event as CustomEvent<string>).detail;
      if (nextValue) setSimulatedNow(nextValue);
    }

    async function loadSimulatedDate() {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "simulated_date")
        .single();

      if (data?.value) {
        setSimulatedNow(data.value);
      } else {
        setSimulatedNow(new Date().toISOString());
      }
    }

    window.addEventListener(
      "simulated-date-updated",
      handleSimulatedDateUpdated
    );
    void loadSimulatedDate();

    return () => {
      window.removeEventListener(
        "simulated-date-updated",
        handleSimulatedDateUpdated
      );
    };
  }, []);

  const appNowTime = simulatedNow ? new Date(simulatedNow).getTime() : 0;

  function updateValue(matchId: number, side: "a" | "b", value: string) {
    setValues((prev) => ({
      ...prev,
      [matchId]: {
        a: side === "a" ? value : prev[matchId]?.a ?? "",
        b: side === "b" ? value : prev[matchId]?.b ?? "",
      },
    }));
  }

  async function saveGroup(matchesInGroup: Match[], phase: string) {
    setMessage("");
    setSavingGroup(phase);

    const rowsToSave = [];

    for (const match of matchesInGroup) {
      const entry = values[match.id];
      if (!entry || entry.a === "" || entry.b === "") continue;

      const hasStarted = new Date(match.kickoff_at).getTime() <= appNowTime;
      if (!firstRoundComplete || hasStarted) continue;

      const predictedA = Number(entry.a);
      const predictedB = Number(entry.b);

      if (Number.isNaN(predictedA) || Number.isNaN(predictedB)) continue;
      if (predictedA < 0 || predictedB < 0) continue;

      rowsToSave.push({
        user_id: userId,
        match_id: match.id,
        predicted_a: predictedA,
        predicted_b: predictedB,
        updated_at: new Date().toISOString(),
      });
    }

    if (rowsToSave.length === 0) {
      setSavingGroup(null);
      setMessage(`Aucun pronostic à sauvegarder pour ${phase}.`);
      return;
    }

    const { error } = await supabase.from("predictions").upsert(rowsToSave, {
      onConflict: "user_id,match_id",
    });

    setSavingGroup(null);

    if (error) {
      setMessage(`Erreur sauvegarde : ${error.message}`);
      return;
    }

    setMessage(`Pronostics sauvegardés pour ${phase}.`);
  }

  if (!simulatedNow) {
    return <p>Chargement...</p>;
  }

  return (
    <section className="space-y-5 text-slate-900">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-3">
          <h1 className="text-3xl font-bold tracking-tight text-slate-950">
            Pronostics Réel 2nd Tour au{" "}
            {formatDashboardDate(simulatedNow, timeZone)}
          </h1>
          <h2 className="text-lg font-semibold text-emerald-950">Mes pronostics</h2>
        </div>

        {isAdmin && (
          <form action={syncRealMatches}>
            <button
              type="submit"
              disabled={!firstRoundComplete}
              className="rounded bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              Synchroniser les matchs réels
            </button>
          </form>
        )}
      </div>

      {!firstRoundComplete && (
        <div className="rounded-lg border border-dashed border-emerald-200 bg-white/80 p-6 text-center text-slate-500 shadow-sm">
          <p>Les pronostics du 2nd tour ouvriront quand le 1er tour sera terminé.</p>
          {firstRoundMissingScores > 0 && (
            <p className="mt-2 text-sm">
              Il reste {firstRoundMissingScores} score
              {firstRoundMissingScores > 1 ? "s" : ""} réel
              {firstRoundMissingScores > 1 ? "s" : ""} de groupes à renseigner.
            </p>
          )}
        </div>
      )}

      {firstRoundComplete && groupedMatches.length === 0 ? (
        <div className="rounded-lg border border-dashed border-emerald-200 bg-white/80 p-6 text-center text-slate-500 shadow-sm">
          Aucun match réel du 2nd tour n&apos;est disponible pour le moment.
        </div>
      ) : (
        groupedMatches.map(([phase, phaseMatches]) => (
          <div key={phase} className="overflow-visible rounded-lg border border-emerald-100 bg-white shadow-[0_12px_30px_rgba(15,118,110,0.07)]">
            <div className="flex items-center justify-between gap-4 rounded-t-lg border-b border-emerald-100 bg-emerald-50/80 px-4 py-3">
              <div className="text-base font-bold capitalize text-emerald-950">{phase}</div>

              <button
                onClick={() => saveGroup(phaseMatches, phase)}
                disabled={savingGroup === phase || !firstRoundComplete}
                className="rounded bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingGroup === phase ? "Sauvegarde..." : "Sauvegarder"}
              </button>
            </div>

            <div className="overflow-x-auto">
            <table className="w-full table-fixed text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left font-semibold text-slate-500">
                  <th className="w-[13%] py-2 pr-1">Équipe A</th>
                  <th className="w-[44px] px-1 py-2 text-center">A</th>
                  <th className="w-[44px] px-1 py-2 text-center">B</th>
                  <th className="w-[13%] px-1 py-2">Équipe B</th>
                  <th className="w-[62px] px-1 py-2">Date</th>
                  <th className="w-[60px] px-1 py-2">Heure</th>
                  <th className="w-[80px] px-1 py-2">Ville</th>
                  <th className="w-[75px] px-1 py-2">Statut</th>
                  <th className="w-[55px] px-1 py-2 text-center">Mes pts</th>
                  <th className="w-[65px] px-1 py-2 text-center">Moy. pts</th>

                  {isAdmin && (
                    <>
                      <th className="w-[55px] px-1 py-2 text-center">A réel</th>
                      <th className="w-[55px] px-1 py-2 text-center">B réel</th>
                      <th className="w-[130px] py-2 pl-1"></th>
                    </>
                  )}
                </tr>
              </thead>

              <tbody>
                {phaseMatches.map((match) => {
                  const kickoffDate = new Date(match.kickoff_at);
                  const hasStarted = kickoffDate.getTime() <= appNowTime;
                  const canPredict = firstRoundComplete && !hasStarted;
                  const canEnterRealScore = isAdmin && hasStarted;

                  const hasOfficialScore =
                    match.is_finished &&
                    match.score_a !== null &&
                    match.score_b !== null;

                  const stats = matchStats[match.id];
                  const myPoints = stats?.myPoints ?? null;
                  const averagePoints = stats?.averagePoints ?? null;

                  return (
                    <tr key={match.id} className="border-b border-slate-100 transition last:border-b-0 hover:bg-emerald-50/45">
                      <td className="py-2 pr-1 font-medium truncate text-slate-900">
                        {match.team_a}
                      </td>

                      <td className="px-1 py-2">
                        <input
                          type="number"
                          min={0}
                          value={values[match.id]?.a ?? ""}
                          onChange={(event) =>
                            updateValue(match.id, "a", event.target.value)
                          }
                          disabled={!canPredict}
                          className="w-10 rounded border border-slate-200 bg-white px-1 py-1 text-center text-slate-900 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100 disabled:text-slate-500"
                        />
                      </td>

                      <td className="px-1 py-2">
                        <input
                          type="number"
                          min={0}
                          value={values[match.id]?.b ?? ""}
                          onChange={(event) =>
                            updateValue(match.id, "b", event.target.value)
                          }
                          disabled={!canPredict}
                          className="w-10 rounded border border-slate-200 bg-white px-1 py-1 text-center text-slate-900 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100 disabled:text-slate-500"
                        />
                      </td>

                      <td className="px-1 py-2 font-medium truncate text-slate-900">
                        {match.team_b}
                      </td>

                      <td className="px-1 py-2 whitespace-nowrap text-slate-600">
                        {formatMatchDate(kickoffDate, timeZone)}
                      </td>

                      <td className="px-1 py-2 whitespace-nowrap text-slate-600">
                        {formatMatchTime(kickoffDate, timeZone)}
                      </td>

                      <td className="px-1 py-2 truncate text-slate-600">
                        {getCityFromVenue(match.venue)}
                      </td>

                      <td className="px-1 py-2 whitespace-nowrap">
                        {hasOfficialScore ? (
                          <span className="rounded-full bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-800">Terminé</span>
                        ) : canPredict ? (
                          <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">Ouvert</span>
                        ) : (
                          <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">Bloqué</span>
                        )}
                      </td>

                      <td className="px-1 py-2 text-center font-semibold text-slate-900">
                        {myPoints !== null ? myPoints : "-"}
                      </td>

                      <td className="px-1 py-2 text-center text-slate-600">
                        {averagePoints !== null
                          ? averagePoints.toFixed(1)
                          : "-"}
                      </td>

                      {isAdmin && (
                        <>
                          <td className="px-1 py-2 text-center font-semibold text-slate-900">
                            {match.score_a ?? "-"}
                          </td>

                          <td className="px-1 py-2 text-center font-semibold text-slate-900">
                            {match.score_b ?? "-"}
                          </td>

                          <td className="py-2 pl-1 text-right">
                            {canEnterRealScore && (
                              <form
                                action={updateMatchResult}
                                className="flex justify-end gap-1"
                              >
                                <input
                                  type="hidden"
                                  name="match_id"
                                  value={match.id}
                                />

                                <input
                                  name="score_a"
                                  type="number"
                                  min={0}
                                  defaultValue={match.score_a ?? ""}
                                  className="w-10 rounded border border-slate-200 px-1 py-1 text-center shadow-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                                />

                                <input
                                  name="score_b"
                                  type="number"
                                  min={0}
                                  defaultValue={match.score_b ?? ""}
                                  className="w-10 rounded border border-slate-200 px-1 py-1 text-center shadow-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                                />

                                <button className="rounded bg-sky-700 px-2 py-1 text-xs font-semibold text-white transition hover:bg-sky-800">
                                  Rés.
                                </button>
                              </form>
                            )}
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>
        ))
      )}

      {message && <p className="text-sm">{message}</p>}
    </section>
  );
}
