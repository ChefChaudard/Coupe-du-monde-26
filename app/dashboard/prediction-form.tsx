"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import {
  formatDashboardDate,
  formatMatchDate,
  formatMatchTime,
} from "@/app/lib/time-zone";
import { useUserTimeZone } from "@/app/lib/use-user-time-zone";
import GroupStandingsTooltip from "./group-standings-tooltip";
import { formatOneDecimal } from "./format";
import { getMatchCity } from "@/app/lib/fifa-cities";

const LEADERBOARD_REFRESH_EVENT = "leaderboard-data-refresh";

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

type GroupStandingRow = {
  team: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
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

function getPredictionOutcome(predictedA: number, predictedB: number) {
  if (predictedA > predictedB) return "one" as const;
  if (predictedA < predictedB) return "two" as const;
  return "draw" as const;
}

type FormValues = Record<number, { a: string; b: string }>;

type PredictionDraft = {
  sourceSignature: string;
  values: FormValues;
  realScores: FormValues;
};

type TabKey = "groupes" | "tours";

const SIMULATED_DATE_STORAGE_KEY = "simulated-date";


function isGroupPhase(phase: string) {
  return phase.toLowerCase().includes("group");
}

const CHRONO_BLOCK_LABEL = "Premier tour - ordre chronologique";

function buildLiveGroupStandings(matches: Match[], appNowTime: number) {
  const standings: Record<string, GroupStandingRow[]> = {};

  const getOrCreateTeam = (groupName: string, team: string) => {
    if (!standings[groupName]) standings[groupName] = [];

    let row = standings[groupName].find((item) => item.team === team);

    if (!row) {
      row = {
        team,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
        points: 0,
      };

      standings[groupName].push(row);
    }

    return row;
  };

  for (const match of matches) {
    const groupName = match.phase;
    if (!isGroupPhase(groupName)) continue;

    const teamA = getOrCreateTeam(groupName, match.team_a);
    const teamB = getOrCreateTeam(groupName, match.team_b);
    const kickoffTime = new Date(match.kickoff_at).getTime();

    if (
      kickoffTime > appNowTime ||
      !match.is_finished ||
      match.score_a === null ||
      match.score_b === null
    ) {
      continue;
    }

    teamA.played += 1;
    teamB.played += 1;
    teamA.goalsFor += match.score_a;
    teamA.goalsAgainst += match.score_b;
    teamB.goalsFor += match.score_b;
    teamB.goalsAgainst += match.score_a;

    if (match.score_a > match.score_b) {
      teamA.won += 1;
      teamB.lost += 1;
      teamA.points += 3;
    } else if (match.score_a < match.score_b) {
      teamB.won += 1;
      teamA.lost += 1;
      teamB.points += 3;
    } else {
      teamA.drawn += 1;
      teamB.drawn += 1;
      teamA.points += 1;
      teamB.points += 1;
    }

    teamA.goalDifference = teamA.goalsFor - teamA.goalsAgainst;
    teamB.goalDifference = teamB.goalsFor - teamB.goalsAgainst;
  }

  for (const groupName of Object.keys(standings)) {
    standings[groupName].sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.goalDifference !== a.goalDifference) {
        return b.goalDifference - a.goalDifference;
      }
      if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
      return a.team.localeCompare(b.team);
    });
  }

  return standings;
}

function buildPredictedGroupStandings(
  matches: Match[],
  values: FormValues
) {
  const standings: Record<string, GroupStandingRow[]> = {};

  const getOrCreateTeam = (groupName: string, team: string) => {
    if (!standings[groupName]) standings[groupName] = [];

    let row = standings[groupName].find((item) => item.team === team);

    if (!row) {
      row = {
        team,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
        points: 0,
      };

      standings[groupName].push(row);
    }

    return row;
  };

  for (const match of matches) {
    const groupName = match.phase;
    if (!isGroupPhase(groupName)) continue;

    const entry = values[match.id];
    if (!entry || entry.a === "" || entry.b === "") continue;

    const predictedA = Number(entry.a);
    const predictedB = Number(entry.b);
    if (Number.isNaN(predictedA) || Number.isNaN(predictedB)) continue;

    const teamA = getOrCreateTeam(groupName, match.team_a);
    const teamB = getOrCreateTeam(groupName, match.team_b);

    teamA.played += 1;
    teamB.played += 1;
    teamA.goalsFor += predictedA;
    teamA.goalsAgainst += predictedB;
    teamB.goalsFor += predictedB;
    teamB.goalsAgainst += predictedA;

    if (predictedA > predictedB) {
      teamA.won += 1;
      teamB.lost += 1;
      teamA.points += 3;
    } else if (predictedA < predictedB) {
      teamB.won += 1;
      teamA.lost += 1;
      teamB.points += 3;
    } else {
      teamA.drawn += 1;
      teamB.drawn += 1;
      teamA.points += 1;
      teamB.points += 1;
    }

    teamA.goalDifference = teamA.goalsFor - teamA.goalsAgainst;
    teamB.goalDifference = teamB.goalsFor - teamB.goalsAgainst;
  }

  for (const groupName of Object.keys(standings)) {
    standings[groupName].sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.goalDifference !== a.goalDifference) {
        return b.goalDifference - a.goalDifference;
      }
      if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
      return a.team.localeCompare(b.team);
    });
  }

  return standings;
}

const knockoutPhaseOrder = [
  "32e de finale",
  "16e de finale",
  "Quarts de finale",
  "Demi-finales",
  "Finale",
];

const round32Placeholders: [string, string][] = [
  ["1er du groupe A", "3eme du groupe L"],
  ["1er du groupe B", "3eme du groupe K"],
  ["1er du groupe C", "3eme du groupe J"],
  ["1er du groupe D", "3eme du groupe I"],
  ["1er du groupe E", "3eme du groupe H"],
  ["1er du groupe F", "3eme du groupe G"],
  ["1er du groupe G", "2eme du groupe F"],
  ["1er du groupe H", "2eme du groupe E"],
  ["2eme du groupe A", "2eme du groupe L"],
  ["2eme du groupe B", "2eme du groupe K"],
  ["2eme du groupe C", "2eme du groupe J"],
  ["2eme du groupe D", "2eme du groupe I"],
  ["2eme du groupe E", "2eme du groupe H"],
  ["2eme du groupe F", "2eme du groupe G"],
  ["3eme du groupe A", "3eme du groupe C"],
  ["3eme du groupe B", "3eme du groupe D"],
];

function getKnockoutTeamLabel(match: Match, side: "a" | "b", matchIndex: number) {
  if (!knockoutPhaseOrder.includes(match.phase)) {
    return side === "a" ? match.team_a : match.team_b;
  }

  const phaseIndex = knockoutPhaseOrder.indexOf(match.phase);

  if (match.phase === "32e de finale") {
    const placeholder = round32Placeholders[matchIndex] ?? [
      `1er du groupe ${String.fromCharCode(65 + (matchIndex % 12))}`,
      `3eme du groupe ${String.fromCharCode(65 + ((matchIndex + 5) % 12))}`,
    ];

    return side === "a" ? placeholder[0] : placeholder[1];
  }

  const previousPhase = knockoutPhaseOrder[phaseIndex - 1];
  const position = side === "a" ? matchIndex * 2 + 1 : matchIndex * 2 + 2;

  return `Vainqueur ${previousPhase} ${position}`;
}

function getDisplayTeam(
  match: Match,
  side: "a" | "b",
  matchIndex: number,
  selectedTab: TabKey
) {
  if (selectedTab !== "tours") {
    return side === "a" ? match.team_a : match.team_b;
  }

  return getKnockoutTeamLabel(match, side, matchIndex);
}

function getPlaceholderLabel(phase: string, index: number) {
  if (phase === "32e de finale") {
    const placeholder = round32Placeholders[Math.floor((index - 1) / 2)] ?? [
      `1er du groupe ${String.fromCharCode(65 + ((index - 1) % 12))}`,
      `3eme du groupe ${String.fromCharCode(65 + ((index + 4) % 12))}`,
    ];

    return index % 2 === 1 ? placeholder[0] : placeholder[1];
  }

  const previousPhase = knockoutPhaseOrder[knockoutPhaseOrder.indexOf(phase) - 1];
  return `Vainqueur ${previousPhase} ${index}`;
}

function buildPlaceholderKnockoutGroups() {
  const groups: [string, Match[]][] = [];
  const matchCounts = [16, 8, 4, 2, 1];

  for (let phaseIndex = 0; phaseIndex < knockoutPhaseOrder.length; phaseIndex += 1) {
    const phase = knockoutPhaseOrder[phaseIndex];
    const count = matchCounts[phaseIndex];

    const phaseMatches: Match[] = Array.from({ length: count }, (_, matchIndex) => ({
      id: -(phaseIndex * 100 + matchIndex + 1),
      phase,
      team_a: getPlaceholderLabel(phase, matchIndex * 2 + 1),
      team_b: getPlaceholderLabel(phase, matchIndex * 2 + 2),
      kickoff_at: new Date(Date.now() + (phaseIndex + 1) * 86400000).toISOString(),
      venue: null,
      score_a: null,
      score_b: null,
      is_finished: false,
    }));

    groups.push([phase, phaseMatches]);
  }

  return groups;
}

function getDraftStorageKey(userId: string) {
  return `dashboard-prediction-draft:${userId}`;
}

function getPredictionSourceSignature(predictions: Prediction[]) {
  return predictions
    .slice()
    .sort((left, right) => left.match_id - right.match_id)
    .map((prediction) => `${prediction.match_id}:${prediction.predicted_a}-${prediction.predicted_b}`)
    .join("|");
}

function readPredictionDraft(userId: string, expectedSignature: string): PredictionDraft | null {
  if (typeof window === "undefined") return null;

  const raw = window.localStorage.getItem(getDraftStorageKey(userId));
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as PredictionDraft;
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.sourceSignature !== expectedSignature) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writePredictionDraft(userId: string, draft: PredictionDraft) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(getDraftStorageKey(userId), JSON.stringify(draft));
}

function mergeFormValues(base: FormValues, draft?: FormValues) {
  if (!draft) return base;

  const merged: FormValues = { ...base };

  for (const [matchIdString, entry] of Object.entries(draft)) {
    const matchId = Number(matchIdString);
    if (!Number.isFinite(matchId)) continue;

    merged[matchId] = {
      a: entry.a ?? merged[matchId]?.a ?? "",
      b: entry.b ?? merged[matchId]?.b ?? "",
    };
  }

  return merged;
}

export default function PredictionForm({
  matches,
  existingPredictions,
  userId,
  matchStats,
  matchPredictionCounts,
  isAdmin,
  createKnockoutMatches,
  syncRealKnockoutMatches,
  initialTab,
  chronological = false,
}: {
  matches: Match[];
  existingPredictions: Prediction[];
  userId: string;
  matchStats: Record<number, MatchStats>;
  matchPredictionCounts: Record<number, MatchOdds>;
  isAdmin: boolean;
  createKnockoutMatches: (formData: FormData) => Promise<void>;
  syncRealKnockoutMatches: (formData: FormData) => Promise<void>;
  initialTab?: TabKey;
  chronological?: boolean;
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

  const predictionSourceSignature = useMemo(
    () => getPredictionSourceSignature(existingPredictions),
    [existingPredictions]
  );

  const router = useRouter();

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

  const selectedTab = initialTab ?? "groupes";

  const filteredMatches = useMemo<[string, Match[]][]>(() => {
    const grouped = groupedMatches.filter(([phase]) =>
      selectedTab === "groupes" ? isGroupPhase(phase) : !isGroupPhase(phase)
    );

    if (chronological) {
      const allMatches = grouped
        .flatMap(([, phaseMatches]) => phaseMatches)
        .slice()
        .sort(
          (a, b) =>
            new Date(a.kickoff_at).getTime() - new Date(b.kickoff_at).getTime() ||
            a.id - b.id
        );

      return allMatches.length > 0 ? [[CHRONO_BLOCK_LABEL, allMatches]] : [];
    }

    if (selectedTab === "tours" && grouped.length === 0) {
      return buildPlaceholderKnockoutGroups();
    }

    return grouped;
  }, [groupedMatches, selectedTab, chronological]);

  const [values, setValues] = useState<FormValues>(() => {
    const draft = readPredictionDraft(userId, predictionSourceSignature);
    return draft ? mergeFormValues(initialValues, draft.values) : initialValues;
  });
  const [realScores, setRealScores] = useState<FormValues>(() => {
    const draft = readPredictionDraft(userId, predictionSourceSignature);
    const merged = draft
      ? mergeFormValues(initialRealScores, draft.realScores)
      : initialRealScores;

    // The database is the source of truth for matches that already have an
    // official score. A stale local draft must never hide a confirmed result.
    const result: FormValues = { ...merged };
    for (const match of matches) {
      if (match.score_a !== null && match.score_b !== null) {
        result[match.id] = {
          a: String(match.score_a),
          b: String(match.score_b),
        };
      }
    }

    return result;
  });
  const [savingGroup, setSavingGroup] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [simulatedNow, setSimulatedNow] = useState<string | null>(null);
  const [serverNowTime] = useState(() => Date.now());
  const timeZone = useUserTimeZone();

  useEffect(() => {
    writePredictionDraft(userId, {
      sourceSignature: predictionSourceSignature,
      values,
      realScores,
    });
  }, [predictionSourceSignature, realScores, userId, values]);

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

    window.addEventListener(
      "simulated-date-updated",
      handleSimulatedDateUpdated
    );
    window.addEventListener("storage", handleStorageEvent);

    void loadSimulatedDate();
    // Re-check the global setting periodically so an already-open tab
    // reflects a live admin toggle without needing a page refresh.
    const intervalId = window.setInterval(loadSimulatedDate, 15000);

    return () => {
      cancelled = true;
      window.removeEventListener(
        "simulated-date-updated",
        handleSimulatedDateUpdated
      );
      window.removeEventListener("storage", handleStorageEvent);
      window.clearInterval(intervalId);
    };
  }, []);

  const appNowTime = simulatedNow
    ? new Date(simulatedNow).getTime()
    : serverNowTime;

  const predictedGroupStandings = useMemo(() => {
    if (!appNowTime) return {};
    return buildPredictedGroupStandings(matches, values);
  }, [matches, appNowTime, values]);

  const liveGroupStandings = useMemo(() => {
    if (!appNowTime) return {};
    return buildLiveGroupStandings(matches, appNowTime);
  }, [matches, appNowTime]);

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

  async function saveGroup(matchesInGroup: Match[], phase: string) {
    setMessage("");
    setSavingGroup(phase);

    try {
      const rowsToSave = [];

      for (const match of matchesInGroup) {
        const entry = values[match.id];
        if (!entry || entry.a === "" || entry.b === "") continue;

        const hasStarted = new Date(match.kickoff_at).getTime() <= appNowTime;
        if (hasStarted) continue;

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

      if (rowsToSave.length > 0) {
        const { error } = await supabase.from("predictions").upsert(rowsToSave, {
          onConflict: "user_id,match_id",
        });

        if (error) {
          setMessage(`Erreur sauvegarde pronostics : ${error.message}`);
          return;
        }

        window.dispatchEvent(new Event(LEADERBOARD_REFRESH_EVENT));
        router.refresh();
      }

      if (isAdmin) {
        for (const match of matchesInGroup) {
          const real = realScores[match.id];
          if (!real || real.a === "" || real.b === "") continue;

          const hasStarted = new Date(match.kickoff_at).getTime() <= appNowTime;
          if (!hasStarted) continue;

          const scoreA = Number(real.a);
          const scoreB = Number(real.b);

          if (Number.isNaN(scoreA) || Number.isNaN(scoreB)) continue;
          if (scoreA < 0 || scoreB < 0) continue;

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

          window.dispatchEvent(new Event(LEADERBOARD_REFRESH_EVENT));
          router.refresh();
        }

        await syncRealKnockoutMatches(new FormData());
        window.dispatchEvent(new Event(LEADERBOARD_REFRESH_EVENT));
        router.refresh();
      }

setMessage(`Sauvegarde effectuée pour ${phase}.`);
} catch (error) {
  console.error("Erreur saveGroup:", error);
  setMessage("Erreur lors de la sauvegarde.");
} finally {
  setSavingGroup(null);
}
  }

  async function saveAllGroupPredictions() {
    if (selectedTab !== "groupes") return;

    const groupPhases = chronological
      ? filteredMatches
      : filteredMatches.filter(([phase]) => isGroupPhase(phase));

    if (groupPhases.length === 0) {
      setMessage("Aucun groupe à sauvegarder pour le moment.");
      return;
    }

    for (const [phase, phaseMatches] of groupPhases) {
      await saveGroup(phaseMatches, phase);
    }
  }

  useEffect(() => {
    const handler = () => {
      void saveAllGroupPredictions();
    };

    window.addEventListener("save-all-group-predictions", handler);
    return () => window.removeEventListener("save-all-group-predictions", handler);
  }, [filteredMatches, selectedTab, values, realScores, appNowTime, isAdmin, userId]);

  return (
    <section className="space-y-5 text-slate-900">
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-950">
            Pronostics Groupes
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Consulte les pronostics de groupe ou passe à la vue chronologique.
          </p>
        </div>

        <Link
          href={chronological ? "/dashboard?tab=groupes" : "/groupes/matchs"}
          className="inline-flex items-center justify-center rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
        >
          {chronological ? "Matchs par groupe" : "Ordre chronologique"}
        </Link>
      </div>

      <h2 className="text-lg font-semibold text-slate-950">Mes pronostics</h2>

      {filteredMatches.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white/80 p-6 text-center text-slate-500 shadow-sm">
          {selectedTab === "groupes" ? (
            "Aucun match de groupe n'est disponible pour le moment."
          ) : (
            <>
              <p>Aucun match des tours suivants n&apos;est disponible pour le moment.</p>
              {isAdmin ? (
                <form action={createKnockoutMatches} className="mt-4">
                  <button
                    type="submit"
                    className="rounded bg-slate-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                  >
                    Créer les matchs des tours suivants
                  </button>
                </form>
              ) : (
                <p className="mt-3 text-sm text-gray-500">
                  Contactez un administrateur pour générer ces matchs.
                </p>
              )}
            </>
          )}
        </div>
      ) : (
        filteredMatches.map(([phase, phaseMatches]) => (
          <div
            key={phase}
            className="overflow-visible rounded-2xl border border-slate-900/12 bg-white shadow-[0_14px_36px_rgba(15,23,42,0.08)]"
          >
            <div className="flex items-center justify-between gap-4 rounded-t-2xl border-b border-slate-900/10 bg-slate-900 px-4 py-3 text-white">
              <div className="text-base font-bold">
                {selectedTab === "groupes" && !chronological ? (
                  <GroupStandingsTooltip
                    groupName={phase}
                    predictedStandings={predictedGroupStandings[phase] ?? []}
                    actualStandings={liveGroupStandings[phase] ?? []}
                  />
                ) : (
                  <span className="capitalize">{phase}</span>
                )}
              </div>

              <button
                onClick={() => saveGroup(phaseMatches, phase)}
                disabled={savingGroup === phase}
                className="rounded-full bg-[#7a1f2c] px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#5f1822] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingGroup === phase ? "Sauvegarde..." : "Sauvegarder"}
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full table-fixed text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-left font-semibold text-slate-500">
                    <th className="w-[13%] py-2 pl-4 pr-1">Équipe A</th>
                    <th className="w-[44px] px-1 py-2 text-center">A</th>
                    <th className="w-[44px] px-1 py-2 text-center">B</th>
                    <th className="w-[13%] px-1 py-2">Équipe B</th>
                    <th className="w-[62px] px-1 py-2">Date</th>
                    <th className="w-[60px] px-1 py-2">Heure</th>
                    <th className="w-[80px] px-1 py-2">Ville</th>
                    <th className="w-[75px] px-1 py-2">Statut</th>
                    <th className="w-[110px] px-1 py-2 text-center">Cote 1-N-2</th>
                    <th className="w-[55px] px-1 py-2 text-center">Mes pts</th>
                    <th className="w-[65px] px-1 py-2 text-center">Moy. pts</th>

                    {isAdmin && (
                      <>
                        <th className="w-[55px] px-1 py-2 text-center">A réel</th>
                        <th className="w-[55px] px-1 py-2 text-center">B réel</th>
                      </>
                    )}
                  </tr>
                </thead>

                <tbody>
                  {phaseMatches.map((match, matchIndex) => {
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
                    const currentEntry = values[match.id];
                    const predictionCounts = {
                      ...(matchPredictionCounts[match.id] ?? {
                        one: 0,
                        draw: 0,
                        two: 0,
                      }),
                    };

                    const initialEntry = initialValues[match.id];
                    if (initialEntry?.a !== undefined && initialEntry?.b !== undefined) {
                      const initialA = Number(initialEntry.a);
                      const initialB = Number(initialEntry.b);

                      if (!Number.isNaN(initialA) && !Number.isNaN(initialB)) {
                        const initialOutcome = getPredictionOutcome(initialA, initialB);
                        predictionCounts[initialOutcome] = Math.max(
                          0,
                          predictionCounts[initialOutcome] - 1
                        );
                      }
                    }

                    if (currentEntry && currentEntry.a !== "" && currentEntry.b !== "") {
                      const predictedA = Number(currentEntry.a);
                      const predictedB = Number(currentEntry.b);

                      if (!Number.isNaN(predictedA) && !Number.isNaN(predictedB)) {
                        const currentOutcome = getPredictionOutcome(
                          predictedA,
                          predictedB
                        );
                        predictionCounts[currentOutcome] += 1;
                      }
                    }

                    const odds = computeOddsFromCounts(predictionCounts);

                    return (
                      <tr
                        key={match.id}
                        className="border-b border-slate-100 transition last:border-b-0 hover:bg-slate-100/70"
                      >
                        <td className="py-2 pl-4 pr-1 font-medium truncate text-slate-900">
                          {getDisplayTeam(match, "a", matchIndex, selectedTab)}
                        </td>

                        <td className="px-1 py-2">
                          <input
                            type="number"
                            min={0}
                            value={values[match.id]?.a ?? ""}
                            onChange={(e) =>
                              updateValue(match.id, "a", e.target.value)
                            }
                            disabled={!canPredict}
                            className="w-10 rounded border border-slate-200 bg-white px-1 py-1 text-center text-slate-900 shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-100 disabled:bg-slate-100 disabled:text-slate-500"
                          />
                        </td>

                        <td className="px-1 py-2">
                          <input
                            type="number"
                            min={0}
                            value={values[match.id]?.b ?? ""}
                            onChange={(e) =>
                              updateValue(match.id, "b", e.target.value)
                            }
                            disabled={!canPredict}
                            className="w-10 rounded border border-slate-200 bg-white px-1 py-1 text-center text-slate-900 shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-100 disabled:bg-slate-100 disabled:text-slate-500"
                          />
                        </td>

                        <td className="px-1 py-2 font-medium truncate text-slate-900">
                          {getDisplayTeam(match, "b", matchIndex, selectedTab)}
                        </td>

                        <td className="px-1 py-2 whitespace-nowrap text-slate-600">
                          {formatMatchDate(kickoffDate, timeZone)}
                        </td>

                        <td className="px-1 py-2 whitespace-nowrap text-slate-600">
                          {formatMatchTime(kickoffDate, timeZone)}
                        </td>

                        <td className="px-1 py-2 truncate text-slate-600">
                          {getMatchCity(
                            match.venue,
                            match.city,
                            match.team_a,
                            match.team_b
                          )}
                        </td>

                        <td className="px-1 py-2 whitespace-nowrap">
                          {statusLabel === "Terminé" ? (
                            <span className="rounded-full bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-800">
                              Terminé
                            </span>
                          ) : statusLabel === "Ouvert" ? (
                            <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                              Ouvert
                            </span>
                          ) : (
                            <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                              Bloqué
                            </span>
                          )}
                        </td>

                        <td className="px-1 py-2 text-center font-mono text-[11px] text-slate-700">
                          {formatOneDecimal(odds.one)} / {formatOneDecimal(odds.draw)} / {formatOneDecimal(odds.two)}
                        </td>

                        <td className="px-1 py-2 text-center font-semibold text-slate-900">
                          {myPoints !== null ? formatOneDecimal(myPoints) : "-"}
                        </td>

                        <td className="px-1 py-2 text-center text-slate-600">
                          {averagePoints !== null
                            ? formatOneDecimal(averagePoints)
                            : "-"}
                        </td>

                        {isAdmin && (
                          <>
                            <td className="px-1 py-2 text-center">
                              {canEnterRealScore ? (
                                <input
                                  type="number"
                                  min={0}
                                  value={realScores[match.id]?.a ?? ""}
                                  onChange={(e) =>
                                    updateRealScore(match.id, "a", e.target.value)
                                  }
                                  className="w-10 rounded border border-slate-200 px-1 py-1 text-center shadow-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                                />
                              ) : (
                                <span className="font-semibold text-slate-900">
                                  {match.score_a ?? "-"}
                                </span>
                              )}
                            </td>

                            <td className="px-1 py-2 text-center">
                              {canEnterRealScore ? (
                                <input
                                  type="number"
                                  min={0}
                                  value={realScores[match.id]?.b ?? ""}
                                  onChange={(e) =>
                                    updateRealScore(match.id, "b", e.target.value)
                                  }
                                  className="w-10 rounded border border-slate-200 px-1 py-1 text-center shadow-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                                />
                              ) : (
                                <span className="font-semibold text-slate-900">
                                  {match.score_b ?? "-"}
                                </span>
                              )}
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}

      {message && (
        <p className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
          {message}
        </p>
      )}
    </section>
  );
}
