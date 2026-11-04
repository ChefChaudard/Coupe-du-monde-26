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
type MatchPredictionEntry = {
  nickname: string;
  predicted_a: number;
  predicted_b: number;
  points: number | null;
};
type FormValues = Record<number, { a: string; b: string }>;
export default function MobilePredictionForm({
  matches,
  existingPredictions,
  userId,
  matchStats,
  matchPredictionsByMatch,
  isAdmin,
  syncRealKnockoutMatches,
}: {
  matches: Match[];
  existingPredictions: Prediction[];
  userId: string;
  matchStats: Record<number, MatchStats>;
  matchPredictionsByMatch: Record<number, MatchPredictionEntry[]>;
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
    const JOURNEE_SIZE = 18;
  const journees = useMemo(() => {
    const chunks: Match[][] = [];
    for (let i = 0; i < matches.length; i += JOURNEE_SIZE) {
      chunks.push(matches.slice(i, i + JOURNEE_SIZE));
    }
    return chunks;
  }, [matches]);
  const [selectedJournee, setSelectedJournee] = useState(0);
  // Tableau des pronostics de tous les joueurs, affiche au survol (ou au
  // toucher) d'un match deja commence.
  const [predictionsTooltip, setPredictionsTooltip] = useState<{
    matchId: number;
    top: number;
    left: number;
    width: number;
  } | null>(null);
  // Coche verte si le 1N2 du pronostic est correct, croix rouge sinon
  // (uniquement quand le score reel du match est connu).
  function renderOutcomeMark(matchId: number, entry: MatchPredictionEntry) {
    const m = matches.find((x) => x.id === matchId);
    if (!m || !m.is_finished || m.score_a === null || m.score_b === null) {
      return null;
    }
    const ok =
      Math.sign(entry.predicted_a - entry.predicted_b) ===
      Math.sign(m.score_a - m.score_b);
    return ok ? (
      <span className="text-emerald-600">✓</span>
    ) : (
      <span className="text-red-600">✗</span>
    );
  }
  function showPredictionsTooltip(matchId: number, element: HTMLElement) {
    const rect = element.getBoundingClientRect();
    const margin = 12;
    const width = Math.min(320, window.innerWidth - margin * 2);
    const left = Math.max(
      margin,
      Math.min(window.innerWidth - width - margin, rect.left + rect.width / 2 - width / 2)
    );
    setPredictionsTooltip({ matchId, top: rect.bottom + 8, left, width });
  }
    const [savingAll, setSavingAll] = useState(false);
  // Cote moyenne de la journee, utilisee comme repli d'affichage quand le
  // bookmaker n'a pas encore publie de cote pour un match donne (moyenne
  // des 1, des N et des 2 separement, calculee sur les seuls matchs de la
  // meme journee qui ont une cote reelle).
  const journeeOddsAverage = useMemo(() => {
    const average = (values: (number | null)[]) => {
      const known = values.filter((v): v is number => v !== null);
      if (known.length === 0) return null;
      return known.reduce((sum, v) => sum + v, 0) / known.length;
    };
    return journees.map((journeeMatches) => ({
      one: average(journeeMatches.map((m) => m.odds_home)),
      draw: average(journeeMatches.map((m) => m.odds_draw)),
      two: average(journeeMatches.map((m) => m.odds_away)),
    }));
  }, [journees]);

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
    if (journees.length === 0) return;
    const firstUpcomingIndex = journees.findIndex((journeeMatches) =>
      journeeMatches.some(
        (match) => new Date(match.kickoff_at).getTime() > appNowTime
      )
    );
    setSelectedJournee(
      firstUpcomingIndex === -1 ? journees.length - 1 : firstUpcomingIndex
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [journees.length, appNowTime]);
  const visibleMatches = journees[selectedJournee] ?? matches;
async function handleSaveAll() {
  setSavingAll(true);
  try {
    const editableMatches = matches.filter((match) => {
      const hasStarted = new Date(match.kickoff_at).getTime() <= appNowTime;
      return !hasStarted || (isAdmin && hasStarted);
    });
    setMessage("");
    let changedCount = 0;
    let realScoreChanged = false;
    let hasError = false;
    // Ecritures sequentielles mais SANS rafraichissement entre deux matchs :
    // avant, chaque match relancait un router.refresh() complet de la page
    // (et une action serveur), ce qui saturait et faisait echouer l'Update
    // des qu'on modifiait plus de 2 matchs.
    for (const match of editableMatches) {
      const result = await persistMatch(match);
      if (result.error) {
        hasError = true;
        break;
      }
      if (result.changed) changedCount += 1;
      if (result.realScoreChanged) realScoreChanged = true;
    }
    if (hasError) return;
    if (realScoreChanged) {
      await syncRealKnockoutMatches(new FormData());
    }
    window.dispatchEvent(new Event(LEADERBOARD_REFRESH_EVENT));
    router.refresh();
    setMessage(
      changedCount === 0
        ? "Aucune modification à sauvegarder."
        : `Sauvegarde effectuée (${changedCount} match${changedCount > 1 ? "s" : ""}).`
    );
  } catch (error) {
    console.error("Erreur handleSaveAll mobile:", error);
    setMessage("Erreur lors de la sauvegarde.");
  } finally {
    setSavingAll(false);
  }
}
useEffect(() => {
  window.addEventListener("mobile-save-all-group-predictions", handleSaveAll);
  return () => {
    window.removeEventListener(
      "mobile-save-all-group-predictions",
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
  // Sauvegarde un match (pronostic et/ou score reel) uniquement s'il a change
  // par rapport a ce qui est deja en base. Ne rafraichit pas la page : c'est
  // handleSaveAll qui le fait une seule fois a la fin.
  async function persistMatch(
    match: Match
  ): Promise<{ error: boolean; changed: boolean; realScoreChanged: boolean }> {
    let changed = false;
    let realScoreChanged = false;
    setSavingMatch(match.id);
    try {
      const hasStarted = new Date(match.kickoff_at).getTime() <= appNowTime;
      // Prediction (editable only before kickoff).
      const entry = values[match.id];
      if (!hasStarted && entry && entry.a !== "" && entry.b !== "") {
        const predictedA = Number(entry.a);
        const predictedB = Number(entry.b);
        const saved = initialValues[match.id];
        const predictionUnchanged =
          saved !== undefined &&
          Number(saved.a) === predictedA &&
          Number(saved.b) === predictedB;
        if (
          !predictionUnchanged &&
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
            return { error: true, changed, realScoreChanged };
          }
          changed = true;
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
            if (match.phase === "Barrages" && match.leg === 2) {
              updatePayload.winner_team = winnerTeams[match.id] ?? null;
            }
            const realUnchanged =
              match.is_finished === true &&
              match.score_a === scoreA &&
              match.score_b === scoreB &&
              (updatePayload.winner_team === undefined ||
                (match.winner_team ?? null) === updatePayload.winner_team);
            if (!realUnchanged) {
              const { error } = await supabase
                .from("matches")
                .update(updatePayload)
                .eq("id", match.id);
              if (error) {
                setMessage(`Erreur sauvegarde score réel : ${error.message}`);
                return { error: true, changed, realScoreChanged };
              }
              changed = true;
              realScoreChanged = true;
            }
          }
        }
      }
      return { error: false, changed, realScoreChanged };
    } catch (error) {
      console.error("Erreur persistMatch mobile:", error);
      setMessage("Erreur lors de la sauvegarde.");
      return { error: true, changed, realScoreChanged };
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
          Premier tour
        </h1>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            {journees.map((_, index) => (
              <button
                key={index}
                type="button"
                               onClick={() => {
                  setSelectedJournee(index);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  selectedJournee === index
                    ? "bg-[#7a1f2c] text-white"
                    : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                }`}
              >
                {index < 8 ? `J${index + 1}` : "JB"}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void handleSaveAll()}
            disabled={savingAll}
            className="rounded-full bg-[#7a1f2c] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#5f1822] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {savingAll ? "Update..." : "Update"}
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
          Aucun match du premier tour n&apos;est disponible pour le moment.
        </div>
      ) : null}
      {visibleMatches.some(
        (match) => match.odds_home === null || match.odds_draw === null || match.odds_away === null
      ) ? (
        <p className="px-1 text-[11px] text-slate-400">
          * cote non publiee par le bookmaker : moyenne des cotes de la journee affichee a titre indicatif.
        </p>
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
            ? "Terminé"
            : "Bloqué";
        const stats = matchStats[match.id];
        const myPoints = stats?.myPoints ?? null;
        const averagePoints = stats?.averagePoints ?? null;
               const journeeAverage =
          journeeOddsAverage[selectedJournee] ?? { one: null, draw: null, two: null };
        const oneIsFallback = match.odds_home === null && journeeAverage.one !== null;
        const drawIsFallback = match.odds_draw === null && journeeAverage.draw !== null;
        const twoIsFallback = match.odds_away === null && journeeAverage.two !== null;
        const odds = {
          one: match.odds_home ?? journeeAverage.one,
          draw: match.odds_draw ?? journeeAverage.draw,
          two: match.odds_away ?? journeeAverage.two,
        };
        const hasFallbackOdds = oneIsFallback || drawIsFallback || twoIsFallback;
        const partnerLeg =
          match.phase === "Barrages" && match.leg === 2 && match.tie_id
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
              <div
                className={`grid flex-1 grid-cols-[1fr_auto_1fr] items-center gap-2 ${
                  hasStarted ? "cursor-help" : ""
                }`}
                onMouseEnter={
                  hasStarted
                    ? (e) => showPredictionsTooltip(match.id, e.currentTarget)
                    : undefined
                }
                onMouseLeave={
                  hasStarted ? () => setPredictionsTooltip(null) : undefined
                }
                onClick={
                  hasStarted
                    ? (e) =>
                        predictionsTooltip?.matchId === match.id
                          ? setPredictionsTooltip(null)
                          : showPredictionsTooltip(match.id, e.currentTarget)
                    : undefined
                }
              >
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
                {statusLabel === "Terminé" ? (
                  <span className="rounded-full bg-sky-50 px-2 py-1 text-[10px] font-semibold text-sky-800">
                    Terminé
                  </span>
                ) : statusLabel === "Ouvert" ? (
                  <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">
                    Ouvert
                  </span>
                ) : (
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">
                    Bloqué
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
                    Score réel
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
              {isAdmin && aggregateTied ? (
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
                  Cote 1-N-2{hasFallbackOdds ? "*" : ""}
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

      {predictionsTooltip ? (
        <div
          style={{
            position: "fixed",
            top: predictionsTooltip.top,
            left: predictionsTooltip.left,
            width: predictionsTooltip.width,
          }}
          className="pointer-events-none z-50 max-h-[70vh] overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700 shadow-[0_18px_45px_rgba(15,23,42,0.18)]"
        >
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            Pronostics des joueurs
          </p>
          {(matchPredictionsByMatch[predictionsTooltip.matchId] ?? []).length ===
          0 ? (
            <p className="text-slate-500">Aucun pronostic saisi.</p>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className="text-[10px] uppercase tracking-wide text-slate-400">
                  <th className="w-5 pb-1"></th>
                  <th className="pb-1 font-medium">Joueur</th>
                  <th className="pb-1 text-center font-medium">Pronostic</th>
                  <th className="pb-1 text-right font-medium">Pts</th>
                </tr>
              </thead>
              <tbody>
                {(matchPredictionsByMatch[predictionsTooltip.matchId] ?? []).map(
                  (entry) => (
                    <tr key={entry.nickname} className="border-t border-slate-100">
                      <td className="w-5 py-1 text-center text-sm font-bold">
                        {renderOutcomeMark(predictionsTooltip.matchId, entry)}
                      </td>
                      <td className="py-1 font-medium text-slate-900">
                        {entry.nickname}
                      </td>
                      <td className="py-1 text-center font-semibold">
                        {entry.predicted_a} - {entry.predicted_b}
                      </td>
                      <td className="py-1 text-right font-semibold">
                        {entry.points !== null ? formatOneDecimal(entry.points) : "-"}
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          )}
        </div>
      ) : null}
    </div>
  );
}
