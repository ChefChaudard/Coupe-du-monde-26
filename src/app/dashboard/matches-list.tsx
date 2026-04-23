"use client";

import { supabase } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type MatchRow = {
  id: number;
  phase: string;
  team_a: string;
  team_b: string;
  kickoff_at: string;
  score_a: number | null;
  score_b: number | null;
  is_finished: boolean | null;
};

function formatDate(value: string) {
  return new Date(value).toLocaleString("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export default function MatchesList() {
  const router = useRouter();
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [debugError, setDebugError] = useState<string | null>(null);

  async function loadMatches() {
    try {
      const { data, error, status } = await supabase
        .from("matches")
        .select("*")
        .order("kickoff_at", { ascending: true });

      if (error) {
        setDebugError(
          JSON.stringify(
            {
              message: error.message,
              details: error.details,
              hint: error.hint,
              code: error.code,
              status,
            },
            null,
            2
          )
        );
        setLoading(false);
        return;
      }

      setMatches((data as MatchRow[]) ?? []);
      setDebugError(null);
      setLoading(false);
    } catch (e) {
      const message =
        e instanceof Error ? e.message : JSON.stringify(e, null, 2);
      setDebugError(message);
      setLoading(false);
    }
  }

useEffect(() => {
  async function init() {
    const { data } = await supabase.auth.getUser();

    if (!data.user) {
      router.push("/login");
      return;
    }

    loadMatches();
  }

  init();
}, []);

  return (
    <section className="rounded-2xl border p-6">
      <h2 className="mb-4 text-2xl font-bold">Matchs</h2>

      {loading ? (
        <p>Chargement...</p>
      ) : debugError ? (
        <pre className="whitespace-pre-wrap rounded bg-red-50 p-4 text-sm text-red-700">
          {debugError}
        </pre>
      ) : matches.length === 0 ? (
        <p>Aucun match disponible.</p>
      ) : (
        <div className="space-y-3">
          {matches.map((match) => (
            <div key={match.id} className="rounded-xl border p-4">
              <div className="mb-2 flex items-center justify-between gap-4">
                <span className="rounded bg-gray-100 px-2 py-1 text-sm">
                  {match.phase}
                </span>
                <span className="text-sm text-gray-500">
                  {formatDate(match.kickoff_at)}
                </span>
              </div>

              <div className="flex items-center justify-between gap-4">
                <div className="font-medium">
                  {match.team_a} vs {match.team_b}
                </div>

                {match.is_finished ? (
                  <strong>
                    {match.score_a} - {match.score_b}
                  </strong>
                ) : (
                  <span className="text-sm text-gray-500">À jouer</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}