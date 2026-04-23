"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase/client";

type Match = {
  id: number;
  phase: string;
  team_a: string;
  team_b: string;
  kickoff_at: string;
};

type PredictionValues = Record<number, { a: string; b: string }>;

export default function PredictionForm() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [userName, setUserName] = useState("");
  const [values, setValues] = useState<PredictionValues>({});
  const [status, setStatus] = useState("");

  useEffect(() => {
    const storedName = localStorage.getItem("user_name");
    if (storedName) setUserName(storedName);

    async function loadMatches() {
      const { data, error } = await supabase
        .from("matches")
        .select("*")
        .order("kickoff_at", { ascending: true });

      if (error) {
        setStatus(`Erreur chargement matchs : ${error.message}`);
        return;
      }

      setMatches(data ?? []);
    }

    loadMatches();
  }, []);

  function updateValue(matchId: number, side: "a" | "b", value: string) {
    setStatus("");
    setValues((prev) => ({
      ...prev,
      [matchId]: {
        a: side === "a" ? value : prev[matchId]?.a ?? "",
        b: side === "b" ? value : prev[matchId]?.b ?? "",
      },
    }));
  }

  async function savePredictions() {
    if (!userName.trim()) {
      setStatus("Saisis d'abord ton pseudo.");
      return;
    }

    localStorage.setItem("user_name", userName);

    const rows = Object.entries(values)
      .filter(([, score]) => score.a !== "" && score.b !== "")
      .map(([matchId, score]) => ({
        user_name: userName.trim(),
        match_id: Number(matchId),
        predicted_a: Number(score.a),
        predicted_b: Number(score.b),
        updated_at: new Date().toISOString(),
      }));

    if (rows.length === 0) {
      setStatus("Aucun pronostic à enregistrer.");
      return;
    }

    const { error } = await supabase
      .from("predictions")
      .upsert(rows, { onConflict: "user_name,match_id" });

    setStatus(error ? `Erreur : ${error.message}` : "Pronostics enregistrés en base.");
  }

  return (
    <section className="space-y-4">
      <div className="rounded-2xl bg-white p-4 shadow">
        <label className="mb-2 block text-sm font-medium text-slate-700">
          Ton pseudo
        </label>
        <input
          type="text"
          value={userName}
          onChange={(e) => setUserName(e.target.value)}
          className="w-full rounded-lg border border-slate-300 p-3"
          placeholder="Ex: Fabrice"
        />
      </div>

      {matches.map((match) => (
        <div
          key={match.id}
          className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between"
        >
          <div>
            <p className="text-sm font-medium text-blue-600">{match.phase}</p>
            <h2 className="text-lg font-semibold text-slate-900">
              {match.team_a} vs {match.team_b}
            </h2>
            <p className="text-sm text-slate-500">
              {new Date(match.kickoff_at).toLocaleString("fr-FR")}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0"
              value={values[match.id]?.a ?? ""}
              onChange={(e) => updateValue(match.id, "a", e.target.value)}
              className="w-20 rounded-lg border border-slate-300 p-2 text-center"
            />
            <span className="text-lg font-bold text-slate-500">-</span>
            <input
              type="number"
              min="0"
              value={values[match.id]?.b ?? ""}
              onChange={(e) => updateValue(match.id, "b", e.target.value)}
              className="w-20 rounded-lg border border-slate-300 p-2 text-center"
            />
          </div>
        </div>
      ))}

      <button
        onClick={savePredictions}
        className="rounded-xl bg-blue-600 px-5 py-3 font-medium text-white hover:bg-blue-700"
      >
        Enregistrer mes pronostics
      </button>

      {status && (
        <p className="text-sm font-medium text-green-600">{status}</p>
      )}
    </section>
  );
}