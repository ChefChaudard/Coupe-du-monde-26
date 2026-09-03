"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { formatMatchDate, formatMatchTime } from "@/app/lib/time-zone";
import { useUserTimeZone } from "@/app/lib/use-user-time-zone";
import { formatOneDecimal } from "@/app/dashboard/format";
const LEADERBOARD_REFRESH_EVENT = "leaderboard-data-refresh";
const SIMULATED_DATE_STORAGE_KEY = "simulated-date";
const ROUND_ORDER = ["8e de finale", "Quarts de finale", "Demi-finales", "Finale"];
const ROUND_SHORT_LABELS: Record<string, string> = {
  "8e de finale": "8eme",
  "Quarts de finale": "Quarts",
  "Demi-finales": "Demi",
  Finale: "Finale",
};
const TWO_LEGGED_PHASES = ["8e de finale", "Quarts de finale", "Demi-finales"];
// Un match peut necessiter un vainqueur saisi manuellement (tirs au but) :
// - phases sur 2 manches : uniquement sur la manche retour (leg 2), en cas
//   d'egalite du score cumule (verifie a l'affichage) ;
// - Finale : match unique, en cas d'egalite du score direct.
function isTieBreakEligible(match: Match) {
  if (TWO_LEGGED_PHASES.includes(match.phase)) return match.leg === 2;
  return match.phase === "Finale";
}
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
  odds_home: number | null;
  odds_draw: number | null;
  odds_away: number | null;
  tie_id?: string | null;
  leg?: number | null;
  winner_team?: string | null;
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
export default function KnockoutMobilePredictionForm({
  matches,
  existingPredictions,
  userId,
  matchStats,
  isAdmin,
  syncRealKnockoutMatches,
}: {
  matches: Match[];
  existingPredictions: Prediction[];
  userId: string;
  matchStats: Record<number, MatchStats>;
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
  const initialWinnerTeams = useMemo(() => {
    const values: Record<number, string> = {};
    for (const match of matches) {
      if (match.winner_team) {
        values[match.id] = match.winner_team;
      }
    }
    return values;
  }, [matches]);
  const [values, setValues] = useState<FormValues>(initialValues);
  const [realScores, setRealScores] = useState<FormValues>(initialRealScores);
  const [winnerTeams, setWinnerTeams] = useState<Record<number, string>>(initialWinnerTeams);
  const [savingMatch, setSavingMatch] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [simulatedNow, setSimulatedNow] = useState<string | null>(null);
  const [serverNowTime] = useState(() => Date.now());
  const rounds = useMemo(() => {
    return ROUND_ORDER.map((phase) => ({
      phase,
      label: ROUND_SHORT_LABELS[phase] ?? phase,
      matches: matches.filter((match) => match.phase === phase),
    })).filter((round) => round.matches.length > 0);
  }, [matches]);
  const [selectedRound, setSelectedRound] = useState(0);
  const [savingAll, setSavingAll] = useState(false);
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
    if (rounds.length === 0) return;
    const firstUpcomingIndex = rounds.findIndex((round) =>
      round.matches.some(
        (match) => new Date(match.kickoff_at).getTime() > appNowTime
      )
    );
    setSelectedRound(
      firstUpcomingIndex === -1 ? rounds.length - 1 : firstUpcomingIndex
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rounds.length, appNowTime]);
  const visibleMatches = rounds[selectedRound]?.matches ?? matches;
  async function handleSaveAll() {
    setSavingAll(true);
    try {
      const editableMatches = matches.filter((match) => {
        const hasStarted = new Date(match.kickoff_at).getTime() <= appNowTime;
        return !hasStarted || (isAdmin && hasStarted);
      });
      for (const match of editableMatches) {
        await saveMatch(match);
      }
    } finally {
      setSavingAll(false);
    }
  }
  useEffect(() => {
    window.addEventListener("mobile-save-all-knockout-predictions", handleSaveAll);
    return () => {
      window.removeEventListener(
        "mobile-save-all-knockout-predictions",
        handleSaveAll
      );
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches, values, realScores, winnerTeams, isAdmin, appNowTime]);
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
  function updateWinnerTeam(matchId: number, team: string) {
    setWinnerTeams((prev) => ({
      ...prev,
      [matchId]: team,
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
            const updatePayload: {
              score_a: number;
              score_b: number;
              is_finished: boolean;
              winner_team?: string | null;
            } = {
              score_a: scoreA,
              score_b: scoreB,
              is_finished: true,
            };
            if (isTieBreakEligible(match)) {
              updatePayload.winner_team = winnerTeams[match.id] ?? null;
            }
            const { error } = await supabase
              .from("matches")
              .update(updatePayload)
              .eq("id", match.id);
            if (error) {
              setMessage(`Erreur sauvegarde score reel : ${error.message}`);
              return;
            }
            await syncRealKnockoutMatches(new FormData());
          }
        }
      }
      window.dispatchEvent(new Event(LEADERBOARD_REFRESH_EVENT));
      router.refresh();
      setMessage("Sauvegarde effectuee.");
    } catch (error) {
      console.error("Erreur saveMatch mobile knockout:", error);
      setMessage("Erreur lors de la sauvegarde.");
    } finally {
      setSavingMatch(null);
    }
  }
  return (
    <div className="space-y-3">
      <section
        className="sticky z-40 rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm"
        style={{ top: "var(--topbar-height, 64px)" }}
      >
        <h1 className="text-2xl font-black tracking-tight text-slate-950">
          Deuxieme tour
        </h1>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            {rounds.map((round, index) => (
              <button
                key={round.phase}
                type="button"
                onClick={() => {
                  setSelectedRound(index);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  selectedRound === index
                    ? "bg-[#7a1f2c] text-white"
                    : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                }`}
              >
                {round.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void handleSaveAll()}
            disabled={savingAll}
            className="rounded-full bg-[#7a1f2c] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#5f1822] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {savingAll ? "Sauvegarde..." : "Sauvegarder"}
          </button>
        </div>
      </section>
      {message ? (
        <p className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 shadow-sm">
          {message}
        </p>
      ) : null}
      {matches.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white/80 p-6 text-center text-sm text-slate-500 shadow-sm">
          Aucun match du deuxieme tour n&apos;est disponible pour le moment.
        </div>
      ) : null}
      {visibleMatches.map((match) => {
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
            ? "Termine"
            : "Bloque";
        const stats = matchStats[match.id];
        const myPoints = stats?.myPoints ?? null;
        const averagePoints = stats?.averagePoints ?? null;
        const odds = {
          one: match.odds_home,
          draw: match.odds_draw,
          two: match.odds_away,
        };
        const partnerLeg =
          TWO_LEGGED_PHASES.includes(match.phase) && match.leg === 2 && match.tie_id
            ? matches.find(
                (m) => m.tie_id === match.tie_id && m.leg === 1
              )
            : undefined;
        const bothLegsFinished =
          !!partnerLeg &&
          !!match.is_finished &&
          match.score_a !== null &&
          match.score_b !== null &&
          !!partnerLeg.is_finished &&
          partnerLeg.score_a !== null &&
          partnerLeg.score_b !== null;
        const aggregateTied =
          bothLegsFinished &&
          match.score_a! + partnerLeg!.score_b! ===
            match.score_b! + partnerLeg!.score_a!;
        const finaleTied =
          match.phase === "Finale" &&
          !!match.is_finished &&
          match.score_a !== null &&
          match.score_b !== null &&
          match.score_a === match.score_b;
        const needsWinnerSelector = aggregateTied || finaleTied;
        return (
          <article
            key={match.id}
            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="w-14 shrink-0 text-[11px] leading-tight text-slate-500">
                <div>{formatMatchDate(kickoffDate, timeZone)}</div>
                <div>{formatMatchTime(kickoffDate, timeZone)}</div>
              </div>
              <div className="grid flex-1 grid-cols-[1fr_auto_1fr] items-center gap-2">
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
              <div className="w-16 shrink-0 text-right">
                {statusLabel === "Termine" ? (
                  <span className="rounded-full bg-sky-50 px-2 py-1 text-[10px] font-semibold text-sky-800">
                    Termine
                  </span>
                ) : statusLabel === "Ouvert" ? (
                  <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">
                    Ouvert
                  </span>
                ) : (
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">
                    Bloque
                  </span>
                )}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-3">
              <div className="min-w-[140px] flex-1 rounded-xl border border-slate-200 bg-slate-50 p-3">
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
                    className="h-11 w-14 rounded-lg border border-slate-200 bg-white text-center text-lg font-semibold text-slate-900 shadow-sm outline-none transitionfocus:border-slate-500 focus:ring-2 focus:ring-slate-100 disabled:bg-slate-100 disabled:text-slate-400"
                  />
                  <span className="text-slate-400">-</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={values[match.id]?.b ?? ""}
                    onChange={(e) => updateValue(match.id, "b", e.target.value)}
                    disabled={!canPredict}
                    className="h-11 w-14 rounded-lg border border-slate-200 bg-white text-center text-lg font-semibold text-slate-900 shadow-sm outline-none transitionfocus:border-slate-500 focus:ring-2 focus:ring-slate-100 disabled:bg-slate-100 disabled:text-slate-400"
                  />
                </div>
              </div>
              {isAdmin ? (
                <div className="min-w-[140px] flex-1 rounded-xl border border-sky-200 bg-sky-50/60 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-700">
                    Score reel
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
                      className="h-11 w-14 rounded-lg border border-sky-200 bg-white text-center text-lg font-semibold text-slate-900 shadow-sm outline-none transitionfocus:border-sky-500 focus:ring-2 focus:ring-sky-100 disabled:bg-slate-100 disabled:text-slate-400"
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
                      className="h-11 w-14 rounded-lg border border-sky-200 bg-white text-center text-lg font-semibold text-slate-900 shadow-sm outline-none transitionfocus:border-sky-500 focus:ring-2 focus:ring-sky-100 disabled:bg-slate-100 disabled:text-slate-400"
                    />
                  </div>
                </div>
              ) : null}
              {isAdmin && needsWinnerSelector ? (
                <div className="min-w-[140px] flex-1 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                    Vainqueur (tirs au but)
                  </p>
                  <select
                    value={winnerTeams[match.id] ?? ""}
                    onChange={(e) => updateWinnerTeam(match.id, e.target.value)}
                    className="mt-2 w-full rounded-lg border border-amber-200 bg-white px-2 py-2 text-sm font-semibold text-slate-900 shadow-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
                  >
                    <option value="">-- choisir --</option>
                    <option value={match.team_a}>{match.team_a}</option>
                    <option value={match.team_b}>{match.team_b}</option>
                  </select>
                </div>
              ) : null}
            </div>
             <div className="mt-3 grid grid-cols-2 gap-2 text-center text-xs">
              <div className="rounded-lg bg-slate-50 px-2 py-1.5">
                <p className="text-[10px] uppercase tracking-wide text-slate-400">
                  Cote 1-N-2
                </p>
                <p className="mt-0.5 font-mono text-[11px] font-semibold text-slate-700">
                  {odds.one !== null ? formatOneDecimal(odds.one) : "-"} /{" "}
                  {odds.draw !== null ? formatOneDecimal(odds.draw) : "-"} /{" "}
                  {odds.two !== null ? formatOneDecimal(odds.two) : "-"}
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
            </div>
          </article>
        );
      })}
    </div>
  );
}
