"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { formatOneDecimal } from "@/app/dashboard/format";
import {
  formatDashboardDate,
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

function readStoredSimulatedDate() {
  if (typeof window === "undefined") return null;

  return window.localStorage.getItem(SIMULATED_DATE_STORAGE_KEY) || null;
}

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
  syncRealMatches,
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
  syncRealMatches: (formData: FormData) => Promise<void>;
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
        phaseMatches.slice().sort(
          (a, b) =>
            new Date(a.kickoff_at).getTime() - new Date(b.kickoff_at).getTime() ||
            a.id - b.id
        ),
      ]
    );
  }, [matches]);

  const [values, setValues] = useState<FormValues>(initialValues);
  const [savingGroup, setSavingGroup] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [simulatedNow, setSimulatedNow] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const router = useRouter();
  const timeZone = useUserTimeZone();
  const effectiveNow = simulatedNow ?? new Date().toISOString();
  const appNowTime = new Date(effectiveNow).getTime();
  const hasTournamentStarted =
    tournamentStartAt !== null && Number.isFinite(tournamentStartAt) && appNowTime >= tournamentStartAt;

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    function handleSimulatedDateUpdated(event: Event) {
      const nextValue = (event as CustomEvent<string>).detail;
      setSimulatedNow(nextValue || null);
    }

    function syncSimulatedDateFromStorage() {
      setSimulatedNow(readStoredSimulatedDate());
    }

    async function loadSimulatedDate() {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "simulated_date")
        .maybeSingle();

      if (data?.value) {
        setSimulatedNow(data.value);
      } else {
        setSimulatedNow(readStoredSimulatedDate());
      }
    }

    window.addEventListener(
      "simulated-date-updated",
      handleSimulatedDateUpdated
    );
    syncSimulatedDateFromStorage();
    const intervalId = window.setInterval(syncSimulatedDateFromStorage, 500);
    void loadSimulatedDate();

    return () => {
      window.removeEventListener(
        "simulated-date-updated",
        handleSimulatedDateUpdated
      );
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

  async function saveGroup(matchesInGroup: Match[], phase: string) {
    setMessage("");
    setSavingGroup(phase);

    const rowsToSave = [];

    for (const match of matchesInGroup) {
      const entry = values[match.id];
      if (!entry || entry.a === "" || entry.b === "") continue;

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

    window.dispatchEvent(new Event(LEADERBOARD_REFRESH_EVENT));
    router.refresh();
    setMessage(`Pronostics sauvegardés pour ${phase}.`);
  }


  return (
    <section className="space-y-5 text-slate-900">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-3">
          <h1 className="text-3xl font-bold tracking-tight text-slate-950">
            2e tours Réels au{" "}
            {formatDashboardDate(effectiveNow, timeZone)}
          </h1>
          <h2 className="text-lg font-semibold text-slate-950">Mes pronostics</h2>
        </div>

        {isAdmin && isMounted ? (
          <form action={syncRealMatches} suppressHydrationWarning>
            <button
              type="submit"
              disabled={!firstRoundComplete}
              className="rounded bg-slate-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              Synchroniser les matchs réels
            </button>
          </form>
        ) : isAdmin ? (
          <div className="h-10 w-[220px] rounded bg-transparent" aria-hidden="true" />
        ) : null}
      </div>

      {hasTournamentStarted ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center text-amber-900 shadow-sm">
          <p>Le tournoi a commencé. Les matchs déjà joués sont fermés, mais les matchs à venir restent modifiables.</p>
        </div>
      ) : !firstRoundComplete ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white/80 p-6 text-center text-slate-500 shadow-sm">
          <p>Les pronostics du 2nd tour ouvriront quand le 1er tour sera terminé.</p>
          {firstRoundMissingScores > 0 && (
            <p className="mt-2 text-sm">
              Il reste {firstRoundMissingScores} score
              {firstRoundMissingScores > 1 ? "s" : ""} réel
              {firstRoundMissingScores > 1 ? "s" : ""} de groupes à renseigner.
            </p>
          )}
        </div>
      ) : null}

      {firstRoundComplete && groupedMatches.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white/80 p-6 text-center text-slate-500 shadow-sm">
          Aucun match réel du 2nd tour n&apos;est disponible pour le moment.
        </div>
      ) : (
        groupedMatches.map(([phase, phaseMatches]) => {
          const laterPhase = laterPhases.includes(phase as RealLaterPhase)
            ? (phase as RealLaterPhase)
            : null;

          return (
            <div
              key={phase}
              className="overflow-visible rounded-2xl border border-slate-200 bg-white shadow-[0_12px_30px_rgba(15,23,42,0.07)]"
            >
              <div className="flex items-center justify-between gap-4 rounded-t-2xl border-b border-slate-200 bg-slate-50 px-4 py-3">
                <div>
                  <div className="text-base font-bold capitalize text-slate-950">{phase}</div>
                  <div className="text-xs text-slate-500">
                    Cotes, pronostics, scores réels et statistiques sur les mêmes cartes.
                  </div>
                </div>

                <button
                  onClick={() => saveGroup(phaseMatches, phase)}
                  disabled={savingGroup === phase || !firstRoundComplete}
                  className="rounded-full bg-[#7a1f2c] px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#5f1822] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {savingGroup === phase ? "Sauvegarde..." : "Sauvegarder"}
                </button>
              </div>

              <div className="space-y-4 p-4 sm:p-5">
                {phaseMatches.map((match, matchIndex) => {
                  const phaseFixture = laterPhase
                    ? getRealLaterFixture(laterPhase, matchIndex)
                    : null;
                  const kickoffAt = match.kickoff_at || phaseFixture?.kickoff_at || null;
                  const displayVenue = match.venue || phaseFixture?.venue || null;
                  const displayCity = match.city || phaseFixture?.city || null;
                  const kickoffDate = kickoffAt ? new Date(kickoffAt) : null;
                  const compactMatchInfo = kickoffDate
                    ? `${formatMatchDate(kickoffDate, timeZone)} · ${formatMatchTime(kickoffDate, timeZone)}${displayCity ? ` · ${displayCity}` : ""}`
                    : displayCity ?? "";
                  const hasStarted = kickoffDate
                    ? kickoffDate.getTime() <= appNowTime
                    : false;
                  const canPredict = !hasStarted;
                  const hasOfficialScore =
                    match.is_finished &&
                    match.score_a !== null &&
                    match.score_b !== null;
                  const canEnterRealScore = isAdmin && hasStarted;

                  const stats = matchStats[match.id];
                  const odds = matchOdds[match.id] ?? { one: 1, draw: 1, two: 1 };
                  const myPoints = stats?.myPoints ?? null;
                  const averagePoints = stats?.averagePoints ?? null;
                  const valueA = values[match.id]?.a ?? "";
                  const valueB = values[match.id]?.b ?? "";

                  return (
                    <article
                      key={match.id}
                      className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 shadow-sm transition hover:border-emerald-200 hover:bg-emerald-50/55"
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-slate-900 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white">
                              {match.match_number ?? match.id}
                            </span>
                            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                              {hasOfficialScore ? "Terminé" : canPredict ? "Ouvert" : "Bloqué"}
                            </span>
                            {isAdmin ? (
                              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                                Admin
                              </span>
                            ) : null}
                          </div>

                          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center">
                            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Équipe A</div>
                              <div className="mt-1 text-base font-bold text-slate-950">{match.team_a}</div>
                              <div className="mt-1 text-[11px] text-slate-500 sm:hidden">{compactMatchInfo}</div>
                            </div>

                            <div className="flex justify-center py-2 text-sm font-semibold text-slate-500">
                              vs
                            </div>

                            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Équipe B</div>
                              <div className="mt-1 text-base font-bold text-slate-950">{match.team_b}</div>
                              <div className="mt-1 text-[11px] text-slate-500 sm:hidden">{compactMatchInfo}</div>
                            </div>
                          </div>
                        </div>

                        <div className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm lg:min-w-[290px]">
                          <div className="flex items-center justify-between gap-3">
                            <span>Date</span>
                            <span className="font-semibold text-slate-900">{kickoffDate ? formatMatchDate(kickoffDate, timeZone) : "-"}</span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span>Heure</span>
                            <span className="font-semibold text-slate-900">{kickoffDate ? formatMatchTime(kickoffDate, timeZone) : "-"}</span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span>Ville</span>
                            <span className="text-right font-semibold text-slate-900">
                              {displayCity ?? getMatchCity(displayVenue, displayCity, match.team_a, match.team_b)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span>Statut</span>
                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${hasOfficialScore ? "bg-sky-50 text-sky-800" : canPredict ? "bg-slate-100 text-slate-700" : "bg-slate-100 text-slate-600"}`}>
                              {hasOfficialScore ? "Terminé" : canPredict ? "Ouvert" : "Bloqué"}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span>Cote 1-N-2</span>
                            <span className="font-mono text-xs font-semibold text-slate-700">
                              {formatOneDecimal(odds.one)} / {formatOneDecimal(odds.draw)} / {formatOneDecimal(odds.two)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span>Mes pts</span>
                            <span className="font-semibold text-slate-950">{myPoints !== null ? formatOneDecimal(myPoints) : "-"}</span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span>Moy. pts</span>
                            <span className="font-semibold text-slate-900">{averagePoints !== null ? formatOneDecimal(averagePoints) : "-"}</span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start">
                        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                          <div className="text-sm font-semibold text-slate-900">Pronostic de score</div>
                          <div className="mt-3 flex flex-wrap items-center gap-3">
                            <label className="space-y-1 text-sm font-medium text-slate-600">
                              <span>A</span>
                              <input
                                type="number"
                                min={0}
                                value={valueA}
                                onChange={(event) => updateValue(match.id, "a", event.target.value)}
                                disabled={!canPredict}
                                className="w-14 rounded border border-slate-200 bg-white px-2 py-2 text-center text-slate-900 shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-100 disabled:bg-slate-100 disabled:text-slate-500"
                              />
                            </label>

                            <span className="pt-6 text-slate-500">-</span>

                            <label className="space-y-1 text-sm font-medium text-slate-600">
                              <span>B</span>
                              <input
                                type="number"
                                min={0}
                                value={valueB}
                                onChange={(event) => updateValue(match.id, "b", event.target.value)}
                                disabled={!canPredict}
                                className="w-14 rounded border border-slate-200 bg-white px-2 py-2 text-center text-slate-900 shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-100 disabled:bg-slate-100 disabled:text-slate-500"
                              />
                            </label>

                            <div className="text-xs text-slate-500">
                              {canPredict ? "Saisie autorisée avant le coup d'envoi." : "Saisie fermée."}
                            </div>
                          </div>
                        </div>

                        {isAdmin ? (
                          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3" suppressHydrationWarning>
                            <div className="text-sm font-semibold text-slate-900">Score réel</div>
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              <div className="text-sm text-slate-600">
                                A réel: <span className="font-semibold text-slate-950">{match.score_a ?? "-"}</span>
                              </div>
                              <div className="text-sm text-slate-600">
                                B réel: <span className="font-semibold text-slate-950">{match.score_b ?? "-"}</span>
                              </div>

                              {canEnterRealScore ? (
                                <form
                                  action={updateMatchResult}
                                  className="mt-2 flex w-full flex-wrap items-center gap-2"
                                  suppressHydrationWarning
                                  onSubmit={() => {
                                    window.dispatchEvent(new Event(LEADERBOARD_REFRESH_EVENT));
                                  }}
                                >
                                  <input type="hidden" name="match_id" value={match.id} />

                                  <input
                                    name="score_a"
                                    type="number"
                                    min={0}
                                    defaultValue={match.score_a ?? ""}
                                    className="w-14 rounded border border-slate-200 px-2 py-2 text-center shadow-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                                  />

                                  <input
                                    name="score_b"
                                    type="number"
                                    min={0}
                                    defaultValue={match.score_b ?? ""}
                                    className="w-14 rounded border border-slate-200 px-2 py-2 text-center shadow-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                                  />

                                  <button className="rounded bg-sky-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-sky-800">
                                    Rés.
                                  </button>
                                </form>
                              ) : null}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          );
        })
      )}

      {message && <p className="text-sm">{message}</p>}
    </section>
  );
}
