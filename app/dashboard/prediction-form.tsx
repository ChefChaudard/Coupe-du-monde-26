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
    <section className="space-y-4">
      {matches.map((match) => {
        const isSaving = savingMatchId === match.id;
        const kickoffDate = new Date(match.kickoff_at);
        const isLocked = kickoffDate.getTime() <= Date.now();
        const hasOfficialScore =
          match.is_finished && match.score_a !== null && match.score_b !== null;

        const stats = matchStats[match.id];
        const myPoints = stats?.myPoints ?? null;
        const averagePoints = stats?.averagePoints ?? null;

        return (
          <div
            key={match.id}
            className="border rounded-2xl p-4 flex flex-col gap-4"
          >
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <div className="text-sm text-gray-500 mb-1">
                  {match.phase} •{" "}
                  {new Date(match.kickoff_at).toLocaleString("fr-FR")}
                </div>
                <div className="text-lg font-semibold">
                  {match.team_a} vs {match.team_b}
                </div>
              </div>

              <div className="text-sm">
                {hasOfficialScore ? (
                  <span className="font-medium text-blue-700">
                    Match terminé
                  </span>
                ) : isLocked ? (
                  <span className="text-red-600 font-medium">
                    Pronostic verrouillé
                  </span>
                ) : (
                  <span className="text-green-600 font-medium">
                    Pronostic ouvert
                  </span>
                )}
              </div>
            </div>

            {hasOfficialScore && (
              <div className="rounded-xl border bg-blue-50 px-4 py-3 space-y-2">
                <div>
                  <div className="text-sm text-blue-700 font-medium mb-1">
                    Résultat réel
                  </div>
                  <div className="text-lg font-semibold text-blue-900">
                    {match.team_a} {match.score_a} - {match.score_b}{" "}
                    {match.team_b}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t">
                  <div className="rounded-lg bg-white px-3 py-2 border">
                    <div className="text-sm text-gray-500">Tes points</div>
                    <div className="text-lg font-semibold">
                      {myPoints !== null
                        ? `${myPoints} pt${myPoints > 1 ? "s" : ""}`
                        : "-"}
                    </div>
                  </div>

                  <div className="rounded-lg bg-white px-3 py-2 border">
                    <div className="text-sm text-gray-500">
                      Moyenne des joueurs
                    </div>
                    <div className="text-lg font-semibold">
                      {averagePoints !== null
                        ? `${averagePoints.toFixed(1)} pts`
                        : "-"}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center gap-3 flex-wrap">
              <span className="min-w-[90px]">{match.team_a}</span>

              <input
                type="number"
                min={0}
                value={values[match.id]?.a ?? ""}
                onChange={(e) => updateValue(match.id, "a", e.target.value)}
                disabled={isLocked}
                className="w-20 border rounded px-3 py-2 disabled:bg-gray-100 disabled:text-gray-500"
              />

              <span>-</span>

              <input
                type="number"
                min={0}
                value={values[match.id]?.b ?? ""}
                onChange={(e) => updateValue(match.id, "b", e.target.value)}
                disabled={isLocked}
                className="w-20 border rounded px-3 py-2 disabled:bg-gray-100 disabled:text-gray-500"
              />

              <span className="min-w-[90px]">{match.team_b}</span>

              <button
                onClick={() => savePrediction(match.id)}
                disabled={isSaving || isLocked}
                className="bg-black text-white px-4 py-2 rounded disabled:opacity-50"
              >
                {isLocked
                  ? "Verrouillé"
                  : isSaving
                  ? "Sauvegarde..."
                  : "Sauvegarder"}
              </button>
            </div>
          </div>
        );
      })}

      {message && <p className="text-sm">{message}</p>}
    </section>
  );
}