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
      if (!groups[match.phase]) {
        groups[match.phase] = [];
      }

      groups[match.phase].push(match);
    }

    return Object.entries(groups);
  }, [matches]);

  const [values, setValues] = useState<FormValues>(initialValues);
  const [savingGroup, setSavingGroup] = useState<string | null>(null);
  const [message, setMessage] = useState("");

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

      if (!entry || entry.a === "" || entry.b === "") {
        continue;
      }

      const hasStarted = new Date(match.kickoff_at).getTime() <= Date.now();

      if (hasStarted) {
        continue;
      }

      const predictedA = Number(entry.a);
      const predictedB = Number(entry.b);

      if (Number.isNaN(predictedA) || Number.isNaN(predictedB)) {
        continue;
      }

      if (predictedA < 0 || predictedB < 0) {
        continue;
      }

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
      {groupedMatches.map(([phase, phaseMatches]) => (
        <div key={phase} className="rounded-xl border p-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-lg font-bold capitalize">{phase}</h3>

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
                const hasStarted = kickoffDate.getTime() <= Date.now();
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