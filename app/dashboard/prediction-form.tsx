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

    for (const match of matchesInGroup) {
      const entry = values[match.id];

      if (!entry || entry.a === "" || entry.b === "") continue;

      const kickoff = new Date(match.kickoff_at).getTime();

      // 🔒 On ne sauvegarde QUE les matchs encore ouverts
      if (kickoff <= Date.now()) continue;

      const predictedA = Number(entry.a);
      const predictedB = Number(entry.b);

      if (Number.isNaN(predictedA) || Number.isNaN(predictedB)) continue;

      await supabase.from("predictions").upsert(
        {
          user_id: userId,
          match_id: match.id,
          predicted_a: predictedA,
          predicted_b: predictedB,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "user_id,match_id",
        }
      );
    }

    setSavingGroup(null);
    setMessage(`Pronostics sauvegardés pour ${phase}`);
  }

  return (
    <section className="space-y-5">
      {groupedMatches.map(([phase, phaseMatches]) => (
        <div key={phase} className="rounded-xl border p-3">
          {/* HEADER AVEC BOUTON SAVE */}
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-lg font-bold capitalize">{phase}</h3>

            <button
              onClick={() => saveGroup(phaseMatches, phase)}
              disabled={savingGroup === phase}
              className="bg-black text-white px-3 py-1 rounded text-sm"
            >
              {savingGroup === phase ? "Saving..." : "SAVE"}
            </button>
          </div>

          <table className="w-full table-fixed text-xs">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="py-2 pr-1 w-[14%]">Équipe A</th>
                <th className="py-2 px-1 text-center w-[44px]">A</th>
                <th className="py-2 px-1 text-center w-[44px]">B</th>
                <th className="py-2 px-1 w-[14%]">Équipe B</th>
                <th className="py-2 px-1 w-[62px]">Date</th>
                <th className="py-2 px-1 w-[60px]">H. Paris</th>
                <th className="py-2 px-1 w-[85px]">Ville</th>
                <th className="py-2 px-1 w-[120px]">Statut</th>

                {isAdmin && (
                  <>
                    <th className="py-2 px-1 text-center w-[55px]">A réel</th>
                    <th className="py-2 px-1 text-center w-[55px]">B réel</th>
                    <th className="py-2 pl-1 w-[65px]"></th>
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

                    <td className="py-2 px-1">
                      <input
                        type="number"
                        min={0}
                        value={values[match.id]?.a ?? ""}
                        onChange={(e) =>
                          updateValue(match.id, "a", e.target.value)
                        }
                        disabled={!canPredict}
                        className="w-10 border px-1 text-center"
                      />
                    </td>

                    <td className="py-2 px-1">
                      <input
                        type="number"
                        min={0}
                        value={values[match.id]?.b ?? ""}
                        onChange={(e) =>
                          updateValue(match.id, "b", e.target.value)
                        }
                        disabled={!canPredict}
                        className="w-10 border px-1 text-center"
                      />
                    </td>

                    <td className="py-2 px-1 font-medium truncate">
                      {match.team_b}
                    </td>

                    <td className="py-2 px-1">
                      {formatParisDate(kickoffDate)}
                    </td>

                    <td className="py-2 px-1">
                      {formatParisTime(kickoffDate)}
                    </td>

                    <td className="py-2 px-1">
                      {getCityFromVenue(match.venue)}
                    </td>

                    <td className="py-2 px-1">
                      {hasOfficialScore ? (
                        <span>
                          {match.score_a}-{match.score_b}
                          {myPoints !== null && ` • ${myPoints}p`}
                          {averagePoints !== null &&
                            ` • m.${averagePoints.toFixed(1)}`}
                        </span>
                      ) : canPredict ? (
                        "Ouvert"
                      ) : (
                        "Bloqué"
                      )}
                    </td>

                    {isAdmin && (
                      <form action={updateMatchResult} className="contents">
                        <input type="hidden" name="match_id" value={match.id} />

                        <td>
                          <input
                            name="score_a"
                            type="number"
                            defaultValue={match.score_a ?? ""}
                            disabled={!canEnterRealScore}
                            className="w-10 border text-center"
                          />
                        </td>

                        <td>
                          <input
                            name="score_b"
                            type="number"
                            defaultValue={match.score_b ?? ""}
                            disabled={!canEnterRealScore}
                            className="w-10 border text-center"
                          />
                        </td>

                        <td>
                          <button
                            disabled={!canEnterRealScore}
                            className="text-xs bg-blue-600 text-white px-2 py-1 rounded"
                          >
                            OK
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