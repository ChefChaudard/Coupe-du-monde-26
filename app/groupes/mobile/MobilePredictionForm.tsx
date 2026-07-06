"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { formatMatchDate, formatMatchTime } from "@/app/lib/time-zone";
import { useUserTimeZone } from "@/app/lib/use-user-time-zone";
import { getMatchCity } from "@/app/lib/fifa-cities";
import { formatOneDecimal } from "@/app/dashboard/format";

const LEADERBOARD_REFRESH_EVENT = "leaderboard-data-refresh";
const SIMULATED_DATE_STORAGE_KEY = "simulated-date";
const MOBILE_SAVE_ALL_EVENT = "mobile-save-all-group-predictions";

type Match = {
  id: number;
  phase: string;
  team_a: string;
  team_b: string;
  kickoff_at: string;
  venue?: string | null;
  city?: string | null;
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

type MatchOdds = {
  one: number;
  draw: number;
  two: number;
};

type ScoreEntry = { a: string; b: string };
type FormValues = Record<number, ScoreEntry>;

function computeOddsFromCounts(counts: MatchOdds) {
  const total = counts.one + counts.draw + counts.two;

  if (total === 0) {
    return { one: 1, draw: 1, two: 1 };
  }

  const toOdds = (count: number) => {
    const raw = total / Math.max(count, 1);
    return Math.max(1, Math.round(raw * 100) / 100);
  };

  return {
    one: toOdds(counts.one),
    draw: toOdds(counts.draw),
    two: toOdds(counts.two),
  };
}

export default function MobilePredictionForm({
  matches,
  existingPredictions,
  userId,
  matchStats,
  matchPredictionCounts,
  isAdmin,
  syncRealKnockoutMatches,
}: {
  matches: Match[];
  existingPredictions: Prediction[];
  userId: string;
  matchStats: Record<number, MatchStats>;
  matchPredictionCounts: Record<number, MatchOdds>;
  isAdmin: boolean;
  syncRealKnockoutMatches: (formData: FormData) => Promise<void>;
}) {
  const router = useRouter();
  const timeZone = useUserTimeZone();

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

  const initialRealScores = useMemo(() => {
    const values: FormValues = {};
    for (const match of matches) {
      values[match.id] = {
        a: match.score_a !== null ? String(match.score_a) : "",
        b: match.score_b !== null ? String(match.score_b) : "",
      };
    }
    return values;
  }, [matches]);

  const [values, setValues] = useState<FormValues>(initialValues);
  const [realScores, setRealScores] = useState<FormValues>(initialRealScores);
  const [savingMatch, setSavingMatch] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [simulatedNow, setSimulatedNow] = useState<string | null>(null);
  const [serverNowTime] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;

    // The database (app_settings.simulated_date) is the single source of
    // truth. A per-device localStorage fallback used to be read here too,
    // but a stale value left over from earlier testing on a given device
    // would then override the real clock forever on that device, even
    // after the global setting was cleared. localStorage is now only used
    // for same-browser instant reactivity (below), never as a fallback.
    async function loadSimulatedDate() {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "simulated_date")
        .maybeSingle();

      if (!cancelled) {
        setSimulatedNow(data?.value || null);
      }
    }

    function handleStorageEvent(event: StorageEvent) {
      if (event.key === SIMULATED_DATE_STORAGE_KEY) {
        setSimulatedNow(event.newValue || null);
      }
    }

    window.addEventListener("storage", handleStorageEvent);
    void loadSimulatedDate();
    // Re-check the global setting periodically so an already-open tab
    // reflects a live admin toggle without needing a page refresh.
    const intervalId = window.setInterval(loadSimulatedDate, 15000);

    return () => {
      cancelled = true;
      window.removeEventListener("storage", handleStorageEvent);
      window.clearInterval(intervalId);
    };
  }, []);

  const appNowTime = simulatedNow
    ? new Date(simulatedNow).getTime()
    : serverNowTime;
useEffect(() => {
  async function handleSaveAll() {
    const editableMatches = matches.filter((match) => {
      const hasStarted = new Date(match.kickoff_at).getTime() <= appNowTime;
      return !hasStarted || (isAdmin && hasStarted);
    });

    for (const match of editableMatches) {
      await saveMatch(match);
    }
  }

  window.addEventListener("mobile-save-all-group-predictions", handleSaveAll);

  return () => {
    window.removeEventListener(
      "mobile-save-all-group-predictions",
      handleSaveAll
    );
  };
}, [matches, values, realScores, isAdmin, appNowTime]);
  function updateValue(matchId: number, side: "a" | "b", value: string) {
    setValues((prev) => ({
      ...prev,
      [matchId]: {
        a: side === "a" ? value : prev[matchId]?.a ?? "",
        b: side === "b" ? value : prev[matchId]?.b ?? "",
      },
    }));
  }

  function updateRealScore(matchId: number, side: "a" | "b", value: string) {
    setRealScores((prev) => ({
      ...prev,
      [matchId]: {
        a: side === "a" ? value : prev[matchId]?.a ?? "",
        b: side === "b" ? value : prev[matchId]?.b ?? "",
      },
    }));
  }

  async function saveMatch(match: Match) {
    setMessage("");
    setSavingMatch(match.id);

    try {
      const hasStarted = new Date(match.kickoff_at).getTime() <= appNowTime;

      // Prediction (editable only before kickoff).
      const entry = values[match.id];
      if (!hasStarted && entry && entry.a !== "" && entry.b !== "") {
        const predictedA = Number(entry.a);
        const predictedB = Number(entry.b);

        if (
          !Number.isNaN(predictedA) &&
          !Number.isNaN(predictedB) &&
          predictedA >= 0 &&
          predictedB >= 0
        ) {
          const { error } = await supabase.from("predictions").upsert(
            [
              {
                user_id: userId,
                match_id: match.id,
                predicted_a: predictedA,
                predicted_b: predictedB,
                updated_at: new Date().toISOString(),
              },
            ],
            { onConflict: "user_id,match_id" }
          );

          if (error) {
            setMessage(`Erreur sauvegarde pronostic : ${error.message}`);
            return;
          }
        }
      }

      // Real score (admin only, after kickoff).
      if (isAdmin && hasStarted) {
        const real = realScores[match.id];
        if (real && real.a !== "" && real.b !== "") {
          const scoreA = Number(real.a);
          const scoreB = Number(real.b);

          if (
            !Number.isNaN(scoreA) &&
            !Number.isNaN(scoreB) &&
            scoreA >= 0 &&
            scoreB >= 0
          ) {
            const { error } = await supabase
              .from("matches")
              .update({
                score_a: scoreA,
                score_b: scoreB,
                is_finished: true,
              })
              .eq("id", match.id);

            if (error) {
              setMessage(`Erreur sauvegarde score réel : ${error.message}`);
              return;
            }

            await syncRealKnockoutMatches(new FormData());
          }
        }
      }

      window.dispatchEvent(new Event(LEADERBOARD_REFRESH_EVENT));
      router.refresh();
      setMessage("Sauvegarde effectuée.");
    } catch (error) {
      console.error("Erreur saveMatch mobile:", error);
      setMessage("Erreur lors de la sauvegarde.");
    } finally {
      setSavingMatch(null);
    }
  }

  if (matches.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white/80 p-6 text-center text-sm text-slate-500 shadow-sm">
        Aucun match du premier tour n&apos;est disponible pour le moment.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {message ? (
        <p className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 shadow-sm">
          {message}
        </p>
      ) : null}

      {matches.map((match) => {
        const kickoffDate = new Date(match.kickoff_at);
        const hasStarted = kickoffDate.getTime() <= appNowTime;
        const canPredict = !hasStarted;
        const hasOfficialScore =
          match.is_finished &&
          match.score_a !== null &&
          match.score_b !== null;
        const canEnterRealScore = isAdmin && hasStarted;

        const statusLabel = !hasStarted
          ? "Ouvert"
          : hasOfficialScore
            ? "Terminé"
            : "Bloqué";

        const stats = matchStats[match.id];
        const myPoints = stats?.myPoints ?? null;
        const averagePoints = stats?.averagePoints ?? null;

        const predictionCounts = {
          ...(matchPredictionCounts[match.id] ?? { one: 0, draw: 0, two: 0 }),
        };
        const currentEntry = values[match.id];
        if (currentEntry && currentEntry.a !== "" && currentEntry.b !== "") {
          const predictedA = Number(currentEntry.a);
          const predictedB = Number(currentEntry.b);
          if (!Number.isNaN(predictedA) && !Number.isNaN(predictedB)) {
            if (predictedA > predictedB) predictionCounts.one += 1;
            else if (predictedA < predictedB) predictionCounts.two += 1;
            else predictionCounts.draw += 1;
          }
        }
        const odds = computeOddsFromCounts(predictionCounts);

        return (
          <article
            key={match.id}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-white">
                {match.phase}
              </span>
              {statusLabel === "Terminé" ? (
                <span className="rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-800">
                  Terminé
                </span>
              ) : statusLabel === "Ouvert" ? (
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                  Ouvert
                </span>
              ) : (
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                  Bloqué
                </span>
              )}
            </div>

            <div className="mt-2 text-xs text-slate-500">
              <span>{formatMatchDate(kickoffDate, timeZone)}</span>
              <span className="mx-1">•</span>
              <span>{formatMatchTime(kickoffDate, timeZone)}</span>
              <span className="mx-1">•</span>
              <span>
                {getMatchCity(
                  match.venue,
                  match.city,
                  match.team_a,
                  match.team_b
                )}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <div className="text-right text-sm font-semibold text-slate-900">
                {match.team_a}
              </div>
              <div className="text-center text-base font-black text-slate-900">
                {hasOfficialScore
                  ? `${match.score_a} - ${match.score_b}`
                  : "vs"}
              </div>
              <div className="text-left text-sm font-semibold text-slate-900">
                {match.team_b}
              </div>
            </div>

            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Mon pronostic
              </p>
              <div className="mt-2 flex items-center justify-center gap-3">
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={values[match.id]?.a ?? ""}
                  onChange={(e) => updateValue(match.id, "a", e.target.value)}
                  disabled={!canPredict}
                  className="h-11 w-14 rounded-lg border border-slate-200 bg-white text-center text-lg font-semibold text-slate-900 shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-100 disabled:bg-slate-100 disabled:text-slate-400"
                />
                <span className="text-slate-400">-</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={values[match.id]?.b ?? ""}
                  onChange={(e) => updateValue(match.id, "b", e.target.value)}
                  disabled={!canPredict}
                  className="h-11 w-14 rounded-lg border border-slate-200 bg-white text-center text-lg font-semibold text-slate-900 shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-100 disabled:bg-slate-100 disabled:text-slate-400"
                />
              </div>
            </div>

            {isAdmin ? (
              <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50/60 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-700">
                  Score réel (admin)
                </p>
                <div className="mt-2 flex items-center justify-center gap-3">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={realScores[match.id]?.a ?? ""}
                    onChange={(e) =>
                      updateRealScore(match.id, "a", e.target.value)
                    }
                    disabled={!canEnterRealScore}
                    className="h-11 w-14 rounded-lg border border-sky-200 bg-white text-center text-lg font-semibold text-slate-900 shadow-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100 disabled:bg-slate-100 disabled:text-slate-400"
                  />
                  <span className="text-slate-400">-</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={realScores[match.id]?.b ?? ""}
                    onChange={(e) =>
                      updateRealScore(match.id, "b", e.target.value)
                    }
                    disabled={!canEnterRealScore}
                    className="h-11 w-14 rounded-lg border border-sky-200 bg-white text-center text-lg font-semibold text-slate-900 shadow-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100 disabled:bg-slate-100 disabled:text-slate-400"
                  />
                </div>
              </div>
            ) : null}

            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-lg bg-slate-50 px-2 py-1.5">
                <p className="text-[10px] uppercase tracking-wide text-slate-400">
                  Cote 1-N-2
                </p>
                <p className="mt-0.5 font-mono text-[11px] font-semibold text-slate-700">
                  {formatOneDecimal(odds.one)} / {formatOneDecimal(odds.draw)} /{" "}
                  {formatOneDecimal(odds.two)}
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 px-2 py-1.5">
                <p className="text-[10px] uppercase tracking-wide text-slate-400">
                  Mes pts
                </p>
                <p className="mt-0.5 font-semibold text-slate-900">
                  {myPoints !== null ? formatOneDecimal(myPoints) : "-"}
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 px-2 py-1.5">
                <p className="text-[10px] uppercase tracking-wide text-slate-400">
                  Moy. pts
                </p>
                <p className="mt-0.5 font-semibold text-slate-700">
                  {averagePoints !== null
                    ? formatOneDecimal(averagePoints)
                    : "-"}
                </p>
              </div>
            </div>

            {canPredict || canEnterRealScore ? (
              <button
                type="button"
                onClick={() => void saveMatch(match)}
                disabled={savingMatch === match.id}
                className="mt-3 w-full rounded-full bg-[#7a1f2c] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#5f1822] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingMatch === match.id ? "Sauvegarde..." : "Sauvegarder"}
              </button>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
