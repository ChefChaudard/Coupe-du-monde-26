"use client";

import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type Match = {
  id: number;
  phase: string;
  team_a: string;
  team_b: string;
  kickoff_at: string;
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
    <section className="space-y-6">
      {groupedMatches.map(([phase, phaseMatches]) => (
        <div key={phase} className="rounded-2xl border p-4">
          <h3 className="mb-4 text-xl font-bold capitalize">{phase}</h3>

          <div className="space-y-3">
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
                <div
                  key={match.id}
                  className="rounded-xl border bg-white p-3"
                >
                  <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                    <span className="text-gray-500">
                      {kickoffDate.toLocaleString("fr-FR")}
                    </span>

                    {hasOfficialScore ? (
                      <span className="font-medium text-blue-700">
                        Match terminé
                      </span>
                    ) : isLocked ? (
                      <span className="font-medium text-red-600">
                        Verrouillé
                      </span>
                    ) : (
                      <span className="font-medium text-green-600">
                        Ouvert
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 items-center gap-3 xl:grid-cols-[1fr_auto_auto_auto_1fr_auto]">
                    <span className="font-medium">{match.team_a}</span>

                    <input
                      type="number"
                      min={0}
                      value={values[match.id]?.a ?? ""}
                      onChange={(e) =>
                        updateValue(match.id, "a", e.target.value)
                      }
                      disabled={isLocked}
                      className="w-16 rounded border px-2 py-1 disabled:bg-gray-100 disabled:text-gray-500"
                    />

                    <span className="text-center">-</span>

                    <input
                      type="number"
                      min={0}
                      value={values[match.id]?.b ?? ""}
                      onChange={(e) =>
                        updateValue(match.id, "b", e.target.value)
                      }
                      disabled={isLocked}
                      className="w-16 rounded border px-2 py-1 disabled:bg-gray-100 disabled:text-gray-500"
                    />

                    <span className="font-medium">{match.team_b}</span>

                    <button
                      onClick={() => savePrediction(match.id)}
                      disabled={isSaving || isLocked}
                      className="rounded bg-black px-3 py-2 text-sm text-white disabled:opacity-50"
                    >
                      {isLocked
                        ? "Verrouillé"
                        : isSaving
                        ? "..."
                        : "OK"}
                    </button>
                  </div>

                  {hasOfficialScore && (
                    <div className="mt-3 grid grid-cols-1 gap-2 rounded-lg bg-blue-50 p-3 text-sm md:grid-cols-3">
                      <div>
                        <span className="text-blue-700">Résultat : </span>
                        <strong>
                          {match.score_a} - {match.score_b}
                        </strong>
                      </div>

                      <div>
                        <span className="text-gray-600">Tes points : </span>
                        <strong>
                          {myPoints !== null
                            ? `${myPoints} pt${myPoints > 1 ? "s" : ""}`
                            : "-"}
                        </strong>
                      </div>

                      <div>
                        <span className="text-gray-600">Moyenne : </span>
                        <strong>
                          {averagePoints !== null
                            ? `${averagePoints.toFixed(1)} pts`
                            : "-"}
                        </strong>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {message && <p className="text-sm">{message}</p>}
    </section>
  );
}