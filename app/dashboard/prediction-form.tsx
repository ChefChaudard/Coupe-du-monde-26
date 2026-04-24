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

export default function PredictionForm({
  matches,
  existingPredictions,
  userId,
  matchStats,
}: {
  matches: Match[];
  existingPredictions: Prediction[];
  userId: string;
  matchStats: Record<number, MatchStats>;
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
  const [savingMatchId, setSavingMatchId] = useState<number | null>(null);
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

  async function savePrediction(matchId: number) {
    setMessage("");

    const entry = values[matchId];

    if (!entry || entry.a === "" || entry.b === "") {
      setMessage("Merci de saisir les 2 scores.");
      return;
    }

    const match = matches.find((m) => m.id === matchId);

    if (!match) {
      setMessage("Match introuvable.");
      return;
    }

    if (new Date(match.kickoff_at).getTime() <= Date.now()) {
      setMessage("Ce pronostic est verrouillé car le match a commencé.");
      return;
    }

    const predictedA = Number(entry.a);
    const predictedB = Number(entry.b);

    if (Number.isNaN(predictedA) || Number.isNaN(predictedB)) {
      setMessage("Les scores doivent être des nombres.");
      return;
    }

    if (predictedA < 0 || predictedB < 0) {
      setMessage("Les scores doivent être positifs.");
      return;
    }

    setSavingMatchId(matchId);

    const { error } = await supabase.from("predictions").upsert(
      {
        user_id: userId,
        match_id: matchId,
        predicted_a: predictedA,
        predicted_b: predictedB,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "user_id,match_id",
      }
    );

    setSavingMatchId(null);

    if (error) {
      setMessage(`Erreur sauvegarde : ${error.message}`);
      return;
    }

    setMessage("Pronostic enregistré.");
  }

  return (
    <section className="space-y-5">
      {groupedMatches.map(([phase, phaseMatches]) => (
        <div key={phase} className="rounded-xl border p-3">
          <h3 className="mb-2 text-lg font-bold capitalize">{phase}</h3>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="py-2 pr-2">Équipe A</th>
                  <th className="py-2 px-1 text-center">A</th>
                  <th className="py-2 px-1 text-center">B</th>
                  <th className="py-2 px-2">Équipe B</th>
                  <th className="py-2 px-2">Date</th>
                  <th className="py-2 px-2">Lieu</th>
                  <th className="py-2 px-2">Statut</th>
                  <th className="py-2 pl-2"></th>
                </tr>
              </thead>

              <tbody>
                {phaseMatches.map((match) => {
                  const isSaving = savingMatchId === match.id;
                  const kickoffDate = new Date(match.kickoff_at);
                  const isLocked = kickoffDate.getTime() <= Date.now();
                  const hasOfficialScore =
                    match.is_finished &&
                    match.score_a !== null &&
                    match.score_b !== null;

                  const stats = matchStats[match.id];
                  const myPoints = stats?.myPoints ?? null;
                  const averagePoints = stats?.averagePoints ?? null;

                  return (
                    <tr key={match.id} className="border-b last:border-b-0">
                      <td className="py-2 pr-2 font-medium whitespace-nowrap">
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
                          disabled={isLocked}
                          className="w-12 rounded border px-2 py-1 text-center disabled:bg-gray-100 disabled:text-gray-500"
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
                          disabled={isLocked}
                          className="w-12 rounded border px-2 py-1 text-center disabled:bg-gray-100 disabled:text-gray-500"
                        />
                      </td>

                      <td className="py-2 px-2 font-medium whitespace-nowrap">
                        {match.team_b}
                      </td>

                      <td className="py-2 px-2 whitespace-nowrap text-gray-600">
                        {kickoffDate.toLocaleDateString("fr-FR")}
                      </td>

                      <td className="py-2 px-2 text-gray-600">
                        {match.venue ?? "-"}
                      </td>

                      <td className="py-2 px-2 whitespace-nowrap">
                        {hasOfficialScore ? (
                          <span className="text-blue-700">
                            Terminé {match.score_a}-{match.score_b}
                            {myPoints !== null && ` • ${myPoints} pts`}
                            {averagePoints !== null &&
                              ` • moy. ${averagePoints.toFixed(1)}`}
                          </span>
                        ) : isLocked ? (
                          <span className="text-red-600">Verrouillé</span>
                        ) : (
                          <span className="text-green-600">Ouvert</span>
                        )}
                      </td>

                      <td className="py-2 pl-2 text-right">
                        <button
                          onClick={() => savePrediction(match.id)}
                          disabled={isSaving || isLocked}
                          className="rounded bg-black px-3 py-1 text-xs text-white disabled:opacity-50"
                        >
                          {isLocked ? "Lock" : isSaving ? "..." : "OK"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {message && <p className="text-sm">{message}</p>}
    </section>
  );
}