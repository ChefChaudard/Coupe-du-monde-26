"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { formatOneDecimal } from "@/app/dashboard/format";
import {
  formatMatchDate,
  formatMatchTime,
} from "@/app/lib/time-zone";
import { getMatchCity } from "@/app/lib/fifa-cities";
import { useUserTimeZone } from "@/app/lib/use-user-time-zone";
import { useRouter } from "next/navigation";
import { getRealLaterFixture, type RealLaterPhase } from "./real-knockout-fixtures";

const LEADERBOARD_REFRESH_EVENT = "leaderboard-data-refresh";

type Match = {
  id: number;
  match_number?: number | null;
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

const SIMULATED_DATE_STORAGE_KEY = "simulated-date";

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

type FormValues = Record<number, { a: string; b: string }>;

export default function RealKnockoutScoreForm({
  matches,
  existingPredictions,
  userId,
  matchStats,
  matchOdds,
  isAdmin,
  firstRoundComplete,
  firstRoundMissingScores,
  tournamentStartAt = null,
  updateMatchResult,
}: {
  matches: Match[];
  existingPredictions: Prediction[];
  userId: string;
  matchStats: Record<number, MatchStats>;
  matchOdds: Record<number, MatchOdds>;
  isAdmin: boolean;
  firstRoundComplete: boolean;
  firstRoundMissingScores: number;
  tournamentStartAt?: number | null;
  updateMatchResult: (formData: FormData) => Promise<void>;
}) {
  const laterPhases: RealLaterPhase[] = [
    "8e de finale",
    "Quarts de finale",
    "Demi-finales",
    "Finale",
  ];

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

  const groupedMatches = useMemo<[string, Match[]][]>(() => {
    const groups: Record<string, Match[]> = {};
    for (const match of matches) {
      if (!groups[match.phase]) groups[match.phase] = [];
      groups[match.phase].push(match);
    }
    return Object.entries(groups).map(
      ([phase, phaseMatches]): [string, Match[]] => [
        phase,
        // Trie par match_number (ordre officiel du tableau) quand il est
        // connu ; ne retombe sur la date/l'id que pour les matchs qui n'en
        // ont pas encore (sinon deux matchs à la même heure peuvent
        // s'afficher/s'apparier dans le désordre, cf. bug "faux match" en 8e).
        phaseMatches.slice().sort((a, b) => {
          if (a.match_number != null && b.match_number != null) {
            return a.match_number - b.match_number;
          }
          if (a.match_number != null) return -1;
          if (b.match_number != null) return 1;
          return (
            new Date(a.kickoff_at).getTime() - new Date(b.kickoff_at).getTime() ||
            a.id - b.id
          );
        }),
      ]
    );
  }, [matches]);

  const [values, setValues] = useState<FormValues>(initialValues);
  const [savingMatch, setSavingMatch] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [simulatedNow, setSimulatedNow] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const router = useRouter();
  const timeZone = useUserTimeZone();
  const effectiveNow = simulatedNow ?? new Date().toISOString();
  const appNowTime = new Date(effectiveNow).getTime();
  const hasTournamentStarted =
    tournamentStartAt !== null &&
    Number.isFinite(tournamentStartAt) &&
    appNowTime >= tournamentStartAt;

  const firstOpenMatchRef = useRef<HTMLElement | null>(null);
  const hasScrolledRef = useRef(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (isMounted && !hasScrolledRef.current && firstOpenMatchRef.current) {
      hasScrolledRef.current = true;
      firstOpenMatchRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [isMounted, simulatedNow]);

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

    function handleSimulatedDateUpdated(event: Event) {
      const nextValue = (event as CustomEvent<string>).detail;
      setSimulatedNow(nextValue || null);
    }

    function handleStorageEvent(event: StorageEvent) {
      if (event.key === SIMULATED_DATE_STORAGE_KEY) {
        setSimulatedNow(event.newValue || null);
      }
    }

    window.addEventListener("simulated-date-updated", handleSimulatedDateUpdated);
    window.addEventListener("storage", handleStorageEvent);
    void loadSimulatedDate();
    // Re-check the global setting periodically so an already-open tab
    // reflects a live admin toggle without needing a page refresh.
    const intervalId = window.setInterval(loadSimulatedDate, 15000);

    return () => {
      cancelled = true;
      window.removeEventListener("simulated-date-updated", handleSimulatedDateUpdated);
      window.removeEventListener("storage", handleStorageEvent);
      window.clearInterval(intervalId);
    };
  }, []);

  function updateValue(matchId: number, side: "a" | "b", value: string) {
    setValues((prev) => ({
      ...prev,
      [matchId]: {
        a: side === "a" ? value : prev[matchId]?.a ?? "",
        b: side === "b" ? value : prev[matchId]?.b ?? "",
      },
    }));
  }

  async function saveMatch(match: Match) {
    const entry = values[match.id];
    if (!entry || entry.a === "" || entry.b === "") {
      setMessage("Aucun pronostic à sauvegarder.");
      return;
    }

    const predictedA = Number(entry.a);
    const predictedB = Number(entry.b);

    if (
      Number.isNaN(predictedA) ||
      Number.isNaN(predictedB) ||
      predictedA < 0 ||
      predictedB < 0
    ) {
      setMessage("Pronostic invalide.");
      return;
    }

    setMessage("");
    setSavingMatch(match.id);

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

    setSavingMatch(null);

    if (error) {
      setMessage(`Erreur sauvegarde : ${error.message}`);
      return;
    }

    window.dispatchEvent(new Event(LEADERBOARD_REFRESH_EVENT));
    router.refresh();
    setMessage("Pronostic sauvegardé.");
  }

  // Calcul du premier match ouvert pour le scroll automatique
  let firstOpenMatchId: number | null = null;
  for (const [, phaseMatches] of groupedMatches) {
    for (const match of phaseMatches) {
      const kickoffDate = match.kickoff_at ? new Date(match.kickoff_at) : null;
      const hasStarted = kickoffDate ? kickoffDate.getTime() <= appNowTime : false;
      if (!hasStarted) {
        firstOpenMatchId = match.id;
        break;
      }
    }
    if (firstOpenMatchId !== null) break;
  }

  return (
    <div className="space-y-5">
      {isMounted && hasTournamentStarted ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 shadow-sm">
          Le tournoi a commencé. Les matchs déjà joués sont fermés, les matchs
          à venir restent modifiables.
        </div>
      ) : isMounted && !firstRoundComplete ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white/80 p-4 text-center text-sm text-slate-500 shadow-sm">
          <p>Les pronostics du 2e tour s&apos;afficheront quand le 1er tour sera terminé.</p>
          {firstRoundMissingScores > 0 && (
            <p className="mt-1">
              {firstRoundMissingScores} score
              {firstRoundMissingScores > 1 ? "s" : ""} de groupes restant
              {firstRoundMissingScores > 1 ? "s" : ""} à saisir.
            </p>
          )}
        </div>
      ) : null}

      {groupedMatches.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white/80 p-6 text-center text-sm text-slate-500 shadow-sm">
          Aucun match réel du 2e tour n&apos;est disponible pour le moment.
        </div>
      ) : (
        groupedMatches.map(([phase, phaseMatches]) => {
          const laterPhaseKey = laterPhases.includes(phase as RealLaterPhase)
            ? (phase as RealLaterPhase)
            : null;

          return (
            <div key={phase} className="space-y-3">
              <h2 className="px-1 text-sm font-bold uppercase tracking-[0.18em] text-slate-500">
                {phase}
              </h2>

              {phaseMatches.map((match, matchIndex) => {
                const phaseFixture = laterPhaseKey
                  ? getRealLaterFixture(laterPhaseKey, matchIndex)
                  : null;
                const kickoffAt =
                  match.kickoff_at || phaseFixture?.kickoff_at || null;
                const displayVenue =
                  match.venue || phaseFixture?.venue || null;
                const displayCity =
                  match.city || phaseFixture?.city || null;
                const kickoffDate = kickoffAt ? new Date(kickoffAt) : null;
                const hasStarted = kickoffDate
                  ? kickoffDate.getTime() <= appNowTime
                  : false;
                const canPredict = !hasStarted;
                const hasOfficialScore =
                  match.is_finished &&
                  match.score_a !== null &&
                  match.score_b !== null;
                const canEnterRealScore = isAdmin && hasStarted;

                const statusLabel = hasOfficialScore
                  ? "Terminé"
                  : canPredict
                    ? "Ouvert"
                    : "Bloqué";

                const stats = matchStats[match.id];
                const odds = matchOdds[match.id] ?? {
                  one: 1,
                  draw: 1,
                  two: 1,
                };
                const myPoints = stats?.myPoints ?? null;
                const averagePoints = stats?.averagePoints ?? null;
                const valueA = values[match.id]?.a ?? "";
                const valueB = values[match.id]?.b ?? "";
                const cityDisplay = getMatchCity(
                  displayVenue,
                  displayCity,
                  match.team_a,
                  match.team_b
                );

                return (
                  <article
                    key={match.id}
                    ref={match.id === firstOpenMatchId ? firstOpenMatchRef : undefined}
                    className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex shrink-0 items-center gap-1.5 flex-wrap">
                        {match.match_number != null && (
                          <span className="rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-white">
                            M{match.match_number}
                          </span>
                        )}
                        {isAdmin && (
                          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-800">
                            Admin
                          </span>
                        )}
                      </div>

                      <div className="min-w-0 flex-1 truncate text-center text-xs text-slate-500">
                        <span>
                          {kickoffDate
                            ? formatMatchDate(kickoffDate, timeZone)
                            : "-"}
                        </span>
                        <span className="mx-1">•</span>
                        <span>
                          {kickoffDate
                            ? formatMatchTime(kickoffDate, timeZone)
                            : "-"}
                        </span>
                        {cityDisplay && cityDisplay !== "-" && (
                          <>
                            <span className="mx-1">•</span>
                            <span>{cityDisplay}</span>
                          </>
                        )}
                      </div>

                      {statusLabel === "Terminé" ? (
                        <span className="shrink-0 rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-800">
                          Terminé
                        </span>
                      ) : statusLabel === "Ouvert" ? (
                        <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                          Ouvert
                        </span>
                      ) : (
                        <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                          Bloqué
                        </span>
                      )}
                    </div>

                    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                      <div className="flex items-center justify-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-right text-sm font-semibold text-slate-900">
                          {match.team_a || "?"}
                        </span>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          value={valueA}
                          onChange={(e) =>
                            updateValue(match.id, "a", e.target.value)
                          }
                          disabled={!canPredict}
                          className="h-9 w-10 shrink-0 rounded-lg border border-slate-200 bg-white text-center text-base font-semibold text-slate-900 shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-100 disabled:bg-slate-100 disabled:text-slate-400"
                        />
                        <span className="shrink-0 text-slate-400">-</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          value={valueB}
                          onChange={(e) =>
                            updateValue(match.id, "b", e.target.value)
                          }
                          disabled={!canPredict}
                          className="h-9 w-10 shrink-0 rounded-lg border border-slate-200 bg-white text-center text-base font-semibold text-slate-900 shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-100 disabled:bg-slate-100 disabled:text-slate-400"
                        />
                        <span className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-slate-900">
                          {match.team_b || "?"}
                        </span>
                      </div>
                      {hasOfficialScore && (
                        <p className="mt-1.5 text-center text-[11px] font-semibold text-sky-700">
                          Score réel : {match.score_a} - {match.score_b}
                        </p>
                      )}
                    </div>

                    {canEnterRealScore ? (
                      <form
                        action={updateMatchResult}
                        className="mt-3 rounded-xl border border-sky-200 bg-sky-50/60 p-3"
                        suppressHydrationWarning
                        onSubmit={() => {
                          window.dispatchEvent(
                            new Event(LEADERBOARD_REFRESH_EVENT)
                          );
                        }}
                      >
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-700">
                          Score réel (admin)
                        </p>
                        <div className="mt-2 flex items-center justify-center gap-3">
                          <input
                            type="hidden"
                            name="match_id"
                            value={match.id}
                          />
                          <input
                            name="score_a"
                            type="number"
                            inputMode="numeric"
                            min={0}
                            defaultValue={match.score_a ?? ""}
                            className="h-11 w-14 rounded-lg border border-sky-200 bg-white text-center text-lg font-semibold text-slate-900 shadow-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                          />
                          <span className="text-slate-400">-</span>
                          <input
                            name="score_b"
                            type="number"
                            inputMode="numeric"
                            min={0}
                            defaultValue={match.score_b ?? ""}
                            className="h-11 w-14 rounded-lg border border-sky-200 bg-white text-center text-lg font-semibold text-slate-900 shadow-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                          />
                          <button
                            type="submit"
                            className="rounded-lg bg-sky-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-sky-800"
                          >
                            Valider
                          </button>
                        </div>
                      </form>
                    ) : null}

                    <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="rounded-lg bg-slate-50 px-2 py-1.5">
                        <p className="text-[10px] uppercase tracking-wide text-slate-400">
                          Cote 1-N-2
                        </p>
                        <p className="mt-0.5 font-mono text-[11px] font-semibold text-slate-700">
                          {formatOneDecimal(odds.one)} /{" "}
                          {formatOneDecimal(odds.draw)} /{" "}
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

                    {canPredict ? (
                      <button
                        type="button"
                        onClick={() => void saveMatch(match)}
                        disabled={savingMatch === match.id}
                        className="mt-3 w-full rounded-full bg-[#7a1f2c] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#5f1822] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {savingMatch === match.id
                          ? "Sauvegarde..."
                          : "Sauvegarder pronostic"}
                      </button>
                    ) : null}
                  </article>
                );
              })}
            </div>
          );
        })
      )}

      {message ? (
        <p className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 shadow-sm">
          {message}
        </p>
      ) : null}
    </div>
  );
}
