"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";

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

type GroupStandingRow = {
  team: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
};

type FormValues = Record<number, { a: string; b: string }>;

function getCityFromVenue(venue?: string | null) {
  if (!venue) return "-";
  return venue.split("-")[0].trim();
}

function toDatetimeLocalValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDashboardDate(value: string) {
  const date = new Date(value);
  const day = date.getDate().toString().padStart(2, "0");
  const month = date.toLocaleDateString("fr-FR", { month: "long" });
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");

  return `${day} ${month} - ${hours}h${minutes}`;
}

function formatParisDate(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    day: "2-digit",
    month: "2-digit",
  }).format(date);
}

function formatParisTime(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function PredictionForm({
  matches,
  existingPredictions,
  userId,
  userEmail,
  matchStats,
  isAdmin,
  updateMatchResult,
  groupStandings,
}: {
  matches: Match[];
  existingPredictions: Prediction[];
  userId: string;
  userEmail: string;
  matchStats: Record<number, MatchStats>;
  isAdmin: boolean;
  updateMatchResult: (formData: FormData) => Promise<void>;
  groupStandings: Record<string, GroupStandingRow[]>;
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

  useEffect(() => {
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

    void loadSimulatedDate();
  }, []);

  const appNowTime = simulatedNow ? new Date(simulatedNow).getTime() : 0;

  async function updateSimulatedDate(value: string) {
    setSimulatedNow(value);

    await supabase
      .from("app_settings")
      .update({
        value: new Date(value).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("key", "simulated_date");
  }

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
      if (hasStarted) continue;

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
    <section className="space-y-6">
      <div className="flex justify-between items-center">
        <Link href="/" className="text-blue-600 hover:underline font-medium">
          ← Retour à l’accueil
        </Link>

        <span className="text-sm text-gray-500">{userEmail}</span>
      </div>

      <h1 className="text-4xl font-bold">
        Tableau de bord au {formatDashboardDate(simulatedNow)}
      </h1>

      {isAdmin && (
        <div className="rounded-xl border bg-yellow-50 p-4">
          <label className="mb-2 block text-sm font-semibold text-yellow-900">
            Date simulée utilisée par l’application
          </label>

          <input
            type="datetime-local"
            value={toDatetimeLocalValue(new Date(simulatedNow))}
            onChange={(e) => updateSimulatedDate(e.target.value)}
            className="rounded border px-3 py-2"
          />
        </div>
      )}

      <h2 className="text-2xl font-bold">Mes pronostics</h2>

      {groupedMatches.map(([phase, phaseMatches]) => {
        const standings = groupStandings[phase] ?? [];

        return (
          <div key={phase} className="rounded-xl border p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="relative inline-block group">
                <h3 className="text-lg font-bold capitalize cursor-help underline decoration-dotted">
                  {phase}
                </h3>

                <div className="hidden group-hover:block absolute left-0 top-7 z-50 w-[620px] rounded border bg-white p-3 text-xs shadow-xl">
                  <p className="mb-2 font-bold capitalize">
                    Classement {phase}
                  </p>

                  {standings.length === 0 ? (
                    <p className="text-gray-500">
                      Aucun match terminé dans ce groupe.
                    </p>
                  ) : (
                    <table className="w-full">
                      <thead>
                        <tr className="border-b text-left text-gray-500">
                          <th className="py-1">Équipe</th>
                          <th>J</th>
                          <th>G</th>
                          <th>N</th>
                          <th>P</th>
                          <th>BP</th>
                          <th>BC</th>
                          <th>Diff</th>
                          <th>Pts</th>
                        </tr>
                      </thead>
                      <tbody>
                        {standings.map((row) => (
                          <tr
                            key={row.team}
                            className="border-b last:border-b-0"
                          >
                            <td className="py-1 font-medium">{row.team}</td>
                            <td>{row.played}</td>
                            <td>{row.won}</td>
                            <td>{row.drawn}</td>
                            <td>{row.lost}</td>
                            <td>{row.goalsFor}</td>
                            <td>{row.goalsAgainst}</td>
                            <td>{row.goalDifference}</td>
                            <td className="font-bold">{row.points}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              <button
                onClick={() => saveGroup(phaseMatches, phase)}
                disabled={savingGroup === phase}
                className="rounded bg-black px-3 py-1 text-sm text-white disabled:opacity-50"
              >
                {savingGroup === phase ? "Saving..." : "SAVE"}
              </button>
            </div>

            <table className="w-full table-fixed text-xs">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="w-[13%] py-2 pr-1">Équipe A</th>
                  <th className="w-[44px] px-1 py-2 text-center">A</th>
                  <th className="w-[44px] px-1 py-2 text-center">B</th>
                  <th className="w-[13%] px-1 py-2">Équipe B</th>
                  <th className="w-[62px] px-1 py-2">Date</th>
                  <th className="w-[60px] px-1 py-2">H. Paris</th>
                  <th className="w-[80px] px-1 py-2">Ville</th>
                  <th className="w-[75px] px-1 py-2">Statut</th>
                  <th className="w-[55px] px-1 py-2 text-center">Mes pts</th>
                  <th className="w-[65px] px-1 py-2 text-center">Moy. pts</th>

                  {isAdmin && (
                    <>
                      <th className="w-[55px] px-1 py-2 text-center">
                        A réel
                      </th>
                      <th className="w-[55px] px-1 py-2 text-center">
                        B réel
                      </th>
                      <th className="w-[130px] py-2 pl-1"></th>
                    </>
                  )}
                </tr>
              </thead>

              <tbody>
                {phaseMatches.map((match) => {
                  const kickoffDate = new Date(match.kickoff_at);
                  const hasStarted = kickoffDate.getTime() <= appNowTime;
                  const canPredict = !hasStarted;
                  const canEnterRealScore = isAdmin && hasStarted;

                  const hasOfficialScore =
                    match.is_finished &&
                    match.score_a !== null &&
                    match.score_b !== null;

                  const stats = matchStats[match.id];
                  const myPoints = stats?.myPoints ?? null;
                  const averagePoints = stats?.averagePoints ?? null;

                  return (
                    <tr key={match.id} className="border-b last:border-b-0">
                      <td className="py-2 pr-1 font-medium truncate">
                        {match.team_a}
                      </td>

                      <td className="px-1 py-2">
                        <input
                          type="number"
                          min={0}
                          value={values[match.id]?.a ?? ""}
                          onChange={(e) =>
                            updateValue(match.id, "a", e.target.value)
                          }
                          disabled={!canPredict}
                          className="w-10 rounded border px-1 py-1 text-center disabled:bg-gray-100 disabled:text-gray-500"
                        />
                      </td>

                      <td className="px-1 py-2">
                        <input
                          type="number"
                          min={0}
                          value={values[match.id]?.b ?? ""}
                          onChange={(e) =>
                            updateValue(match.id, "b", e.target.value)
                          }
                          disabled={!canPredict}
                          className="w-10 rounded border px-1 py-1 text-center disabled:bg-gray-100 disabled:text-gray-500"
                        />
                      </td>

                      <td className="px-1 py-2 font-medium truncate">
                        {match.team_b}
                      </td>

                      <td className="px-1 py-2 whitespace-nowrap text-gray-600">
                        {formatParisDate(kickoffDate)}
                      </td>

                      <td className="px-1 py-2 whitespace-nowrap text-gray-600">
                        {formatParisTime(kickoffDate)}
                      </td>

                      <td className="px-1 py-2 truncate text-gray-600">
                        {getCityFromVenue(match.venue)}
                      </td>

                      <td className="px-1 py-2 whitespace-nowrap">
                        {hasOfficialScore ? (
                          <span className="text-blue-700">Terminé</span>
                        ) : canPredict ? (
                          <span className="text-green-600">Ouvert</span>
                        ) : (
                          <span className="text-red-600">Bloqué</span>
                        )}
                      </td>

                      <td className="px-1 py-2 text-center font-semibold">
                        {myPoints !== null ? myPoints : "-"}
                      </td>

                      <td className="px-1 py-2 text-center">
                        {averagePoints !== null
                          ? averagePoints.toFixed(1)
                          : "-"}
                      </td>

                      {isAdmin && (
                        <>
                          <td className="px-1 py-2 text-center font-semibold">
                            {match.score_a ?? "-"}
                          </td>

                          <td className="px-1 py-2 text-center font-semibold">
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
                                  className="w-10 rounded border px-1 py-1 text-center"
                                />

                                <input
                                  name="score_b"
                                  type="number"
                                  min={0}
                                  defaultValue={match.score_b ?? ""}
                                  className="w-10 rounded border px-1 py-1 text-center"
                                />

                                <button className="rounded bg-blue-700 px-2 py-1 text-xs text-white">
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
        );
      })}

      {message && <p className="text-sm">{message}</p>}
    </section>
  );
}