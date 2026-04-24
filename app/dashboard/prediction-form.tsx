"use client";

import { useMemo, useState } from "react";
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

type FormValues = Record<number, { a: string; b: string }>;

type GroupStanding = {
  team: string;
  played: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
};

function getCityFromVenue(venue?: string | null) {
  if (!venue) return "-";
  return venue.split("-")[0].trim();
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

function toDatetimeLocalValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function computeGroupStandings(
  matches: Match[],
  values: FormValues
): GroupStanding[] {
  const standings = new Map<string, GroupStanding>();

  function ensureTeam(team: string) {
    if (!standings.has(team)) {
      standings.set(team, {
        team,
        played: 0,
        points: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
      });
    }

    return standings.get(team)!;
  }

  for (const match of matches) {
    const prediction = values[match.id];

    if (!prediction || prediction.a === "" || prediction.b === "") {
      ensureTeam(match.team_a);
      ensureTeam(match.team_b);
      continue;
    }

    const scoreA = Number(prediction.a);
    const scoreB = Number(prediction.b);

    if (Number.isNaN(scoreA) || Number.isNaN(scoreB)) continue;

    const teamA = ensureTeam(match.team_a);
    const teamB = ensureTeam(match.team_b);

    teamA.played += 1;
    teamB.played += 1;

    teamA.goalsFor += scoreA;
    teamA.goalsAgainst += scoreB;

    teamB.goalsFor += scoreB;
    teamB.goalsAgainst += scoreA;

    if (scoreA > scoreB) teamA.points += 3;
    else if (scoreA < scoreB) teamB.points += 3;
    else {
      teamA.points += 1;
      teamB.points += 1;
    }
  }

  return Array.from(standings.values())
    .map((team) => ({
      ...team,
      goalDifference: team.goalsFor - team.goalsAgainst,
    }))
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.goalDifference !== a.goalDifference) {
        return b.goalDifference - a.goalDifference;
      }
      if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
      return a.team.localeCompare(b.team);
    });
}

function GroupStandingTooltip({
  phaseMatches,
  values,
}: {
  phaseMatches: Match[];
  values: FormValues;
}) {
  const standings = computeGroupStandings(phaseMatches, values);

  return (
    <div className="absolute left-0 top-8 z-50 hidden w-[360px] rounded-xl border bg-white p-3 text-xs shadow-xl group-hover:block">
      <div className="mb-2 font-bold text-gray-900">
        Classement selon tes pronostics
      </div>

      <table className="w-full">
        <thead>
          <tr className="border-b text-left text-gray-500">
            <th className="py-1">#</th>
            <th className="py-1">Équipe</th>
            <th className="py-1 text-center">J</th>
            <th className="py-1 text-center">Pts</th>
            <th className="py-1 text-center">Diff</th>
            <th className="py-1 text-center">BP</th>
            <th className="py-1 text-center">BC</th>
          </tr>
        </thead>

        <tbody>
          {standings.map((row, index) => (
            <tr key={row.team} className="border-b last:border-b-0">
              <td className="py-1">{index + 1}</td>
              <td className="py-1 font-medium">{row.team}</td>
              <td className="py-1 text-center">{row.played}</td>
              <td className="py-1 text-center font-bold">{row.points}</td>
              <td className="py-1 text-center">
                {row.goalDifference > 0 ? "+" : ""}
                {row.goalDifference}
              </td>
              <td className="py-1 text-center">{row.goalsFor}</td>
              <td className="py-1 text-center">{row.goalsAgainst}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function PredictionForm({
  matches,
  existingPredictions,
  userId,
  matchStats,
  isAdmin,
  updateMatchResult,
}: {
  matches: Match[];
  existingPredictions: Prediction[];
  userId: string;
  matchStats: Record<number, MatchStats>;
  isAdmin: boolean;
  updateMatchResult: (formData: FormData) => Promise<void>;
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
  const [simulatedNow, setSimulatedNow] = useState(
    toDatetimeLocalValue(new Date())
  );

  const appNow = isAdmin ? new Date(simulatedNow) : new Date();
  const appNowTime = appNow.getTime();

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

  return (
    <section className="space-y-5">
      {isAdmin && (
        <div className="rounded-xl border bg-yellow-50 p-4">
          <label className="mb-2 block text-sm font-semibold text-yellow-900">
            Date simulée utilisée par l’application
          </label>

          <input
            type="datetime-local"
            value={simulatedNow}
            onChange={(e) => setSimulatedNow(e.target.value)}
            className="rounded border px-3 py-2"
          />

          <p className="mt-2 text-xs text-yellow-800">
            Cette date remplace la date système pour tester le verrouillage des
            pronostics et la saisie des scores réels.
          </p>
        </div>
      )}

      {groupedMatches.map(([phase, phaseMatches]) => (
        <div key={phase} className="rounded-xl border p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="group relative">
              <h3 className="cursor-help text-lg font-bold capitalize underline decoration-dotted underline-offset-4">
                {phase}
              </h3>

              <GroupStandingTooltip
                phaseMatches={phaseMatches}
                values={values}
              />
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
                    <th className="w-[55px] px-1 py-2 text-center">A réel</th>
                    <th className="w-[55px] px-1 py-2 text-center">B réel</th>
                    <th className="w-[65px] py-2 pl-1"></th>
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
                      <form action={updateMatchResult} className="contents">
                        <input type="hidden" name="match_id" value={match.id} />

                        <td className="px-1 py-2">
                          <input
                            name="score_a"
                            type="number"
                            min={0}
                            defaultValue={match.score_a ?? ""}
                            disabled={!canEnterRealScore}
                            className="w-10 rounded border px-1 py-1 text-center disabled:bg-gray-100 disabled:text-gray-500"
                          />
                        </td>

                        <td className="px-1 py-2">
                          <input
                            name="score_b"
                            type="number"
                            min={0}
                            defaultValue={match.score_b ?? ""}
                            disabled={!canEnterRealScore}
                            className="w-10 rounded border px-1 py-1 text-center disabled:bg-gray-100 disabled:text-gray-500"
                          />
                        </td>

                        <td className="py-2 pl-1 text-right">
                          <button
                            disabled={!canEnterRealScore}
                            className="rounded bg-blue-700 px-2 py-1 text-xs text-white disabled:opacity-40"
                          >
                            Rés.
                          </button>
                        </td>
                      </form>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}

      {message && <p className="text-sm">{message}</p>}
    </section>
  );
}