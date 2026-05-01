"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import {
  formatMatchDate,
  formatMatchTime,
} from "@/app/lib/time-zone";
import { useUserTimeZone } from "@/app/lib/use-user-time-zone";
import { round32Placeholders, type Round32Teams } from "./bracket-data";

type BracketMatch = {
  id: number;
  phase: string;
  teamA: string;
  teamB: string;
  leftMatchId?: number;
  rightMatchId?: number;
};

type SelectedWinners = Record<number, string>;

export type BracketMatchInfo = {
  teamA: string;
  teamB: string;
  kickoffAt: string;
  venue?: string | null;
  scoreA: number | null;
  scoreB: number | null;
  isFinished: boolean | null;
};

type MatchStatus = "Ouvert" | "Bloque" | "Termine";

function buildBracket(round32Teams?: Round32Teams): BracketMatch[] {
  const matches: BracketMatch[] = [];

  for (let i = 0; i < 16; i += 1) {
    const [teamA, teamB] = round32Teams?.[i] ?? round32Placeholders[i] ?? [
      `1er du groupe ${String.fromCharCode(65 + (i % 8))}`,
      `2eme du groupe ${String.fromCharCode(65 + (i % 8))}`,
    ];

    matches.push({
      id: i + 1,
      phase: "16e de finale",
      teamA,
      teamB,
    });
  }

  const rounds = [
    { phase: "8e de finale", count: 8, label: "16e de finale" },
    { phase: "Quarts de finale", count: 4, label: "8e de finale" },
    { phase: "Demi-finales", count: 2, label: "Quarts de finale" },
    { phase: "Finale", count: 1, label: "Demi-finales" },
  ];

  let nextMatchId = 17;
  let previousRoundStart = 1;

  for (const round of rounds) {
    for (let i = 0; i < round.count; i += 1) {
      const leftMatchId = previousRoundStart + i * 2;
      const rightMatchId = leftMatchId + 1;

      matches.push({
        id: nextMatchId,
        phase: round.phase,
        teamA: `Vainqueur ${round.label} ${leftMatchId}`,
        teamB: `Vainqueur ${round.label} ${rightMatchId}`,
        leftMatchId,
        rightMatchId,
      });

      nextMatchId += 1;
    }

    previousRoundStart += round.count * 2;
  }

  return matches;
}

function dedupe(values: string[]) {
  return Array.from(new Set(values));
}

function getSelectedOrPossibleTeams(
  match: BracketMatch,
  matchesById: Record<number, BracketMatch>,
  selectedWinners: SelectedWinners
): string[] {
  const selected = selectedWinners[match.id];
  if (selected) return [selected];

  if (!match.leftMatchId || !match.rightMatchId) {
    return [match.teamA, match.teamB];
  }

  const leftMatch = matchesById[match.leftMatchId];
  const rightMatch = matchesById[match.rightMatchId];

  const leftTeams = leftMatch
    ? getSelectedOrPossibleTeams(leftMatch, matchesById, selectedWinners)
    : [];
  const rightTeams = rightMatch
    ? getSelectedOrPossibleTeams(rightMatch, matchesById, selectedWinners)
    : [];

  return dedupe([...leftTeams, ...rightTeams]);
}

function getPossibleTeams(
  match: BracketMatch,
  matchesById: Record<number, BracketMatch>,
  selectedWinners: SelectedWinners
): string[] {
  if (!match.leftMatchId || !match.rightMatchId) {
    return [match.teamA, match.teamB];
  }

  const leftMatch = matchesById[match.leftMatchId];
  const rightMatch = matchesById[match.rightMatchId];

  const leftTeams = leftMatch
    ? getSelectedOrPossibleTeams(leftMatch, matchesById, selectedWinners)
    : [];
  const rightTeams = rightMatch
    ? getSelectedOrPossibleTeams(rightMatch, matchesById, selectedWinners)
    : [];

  return dedupe([...leftTeams, ...rightTeams]);
}

function getChildMatchIds(matches: BracketMatch[]) {
  return matches.reduce<Record<number, number[]>>((acc, match) => {
    if (match.leftMatchId) {
      acc[match.leftMatchId] = acc[match.leftMatchId] || [];
      acc[match.leftMatchId].push(match.id);
    }

    if (match.rightMatchId) {
      acc[match.rightMatchId] = acc[match.rightMatchId] || [];
      acc[match.rightMatchId].push(match.id);
    }

    return acc;
  }, {});
}

function collectDescendants(
  matchId: number,
  childMap: Record<number, number[]>
): number[] {
  const visited = new Set<number>();
  const stack = [...(childMap[matchId] ?? [])];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || visited.has(current)) continue;

    visited.add(current);
    stack.push(...(childMap[current] ?? []));
  }

  return Array.from(visited);
}

function getCityFromVenue(venue?: string | null) {
  if (!venue) return "-";
  return venue.split("-")[0].trim();
}

function getActualWinner(matchInfo?: BracketMatchInfo) {
  if (
    !matchInfo?.isFinished ||
    matchInfo.scoreA === null ||
    matchInfo.scoreB === null
  ) {
    return null;
  }

  if (matchInfo.scoreA > matchInfo.scoreB) return "A";
  if (matchInfo.scoreB > matchInfo.scoreA) return "B";
  return null;
}

function getPointsForWinnerPrediction(
  selectedWinner: string,
  matchInfo?: BracketMatchInfo
) {
  const actualWinnerSide = getActualWinner(matchInfo);
  if (!actualWinnerSide || !selectedWinner || !matchInfo) return null;

  const actualWinner =
    actualWinnerSide === "A" ? matchInfo.teamA : matchInfo.teamB;

  return selectedWinner === actualWinner ? 1 : 0;
}

function getMatchStatus(
  matchInfo: BracketMatchInfo | undefined,
  appNowTime: number
): MatchStatus {
  if (
    matchInfo?.isFinished &&
    matchInfo.scoreA !== null &&
    matchInfo.scoreB !== null
  ) {
    return "Termine";
  }

  if (matchInfo && new Date(matchInfo.kickoffAt).getTime() <= appNowTime) {
    return "Bloque";
  }

  return "Ouvert";
}

function getStatusClass(status: MatchStatus) {
  if (status === "Termine") return "text-blue-700";
  if (status === "Ouvert") return "text-green-700";
  return "text-red-700";
}

export default function KnockoutBracketPrediction({
  userName,
  round32Teams,
  matchInfoById = {},
  storageKey = "knockoutBracketPredictions",
  title = "Pronostics Tours Eliminatoires",
  description = "Les equipes du tableau des 32 sont deduites des resultats de groupes. Pour les tours suivants, selectionnez le vainqueur de chaque match en respectant la logique des tours precedents.",
}: {
  userName: string;
  round32Teams?: Round32Teams;
  matchInfoById?: Record<number, BracketMatchInfo>;
  storageKey?: string;
  title?: string;
  description?: string;
}) {
  const bracket = useMemo(() => buildBracket(round32Teams), [round32Teams]);
  const matchesById = useMemo(
    () => Object.fromEntries(bracket.map((match) => [match.id, match])),
    [bracket]
  );
  const childMap = useMemo(() => getChildMatchIds(bracket), [bracket]);

  const [selectedWinners, setSelectedWinners] = useState<SelectedWinners>(() => {
    if (typeof window === "undefined") return {};

    const saved = window.localStorage.getItem(storageKey);
    if (!saved) return {};

    try {
      return JSON.parse(saved) as SelectedWinners;
    } catch {
      return {};
    }
  });
  const [message, setMessage] = useState<string | null>(null);
  const [simulatedNow, setSimulatedNow] = useState<string | null>(null);
  const timeZone = useUserTimeZone();

  useEffect(() => {
    function handleSimulatedDateUpdated(event: Event) {
      const nextValue = (event as CustomEvent<string>).detail;
      if (nextValue) setSimulatedNow(nextValue);
    }

    async function loadSimulatedDate() {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "simulated_date")
        .single();

      setSimulatedNow(data?.value ?? new Date().toISOString());
    }

    window.addEventListener(
      "simulated-date-updated",
      handleSimulatedDateUpdated
    );
    void loadSimulatedDate();

    return () => {
      window.removeEventListener(
        "simulated-date-updated",
        handleSimulatedDateUpdated
      );
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify(selectedWinners)
    );
  }, [selectedWinners, storageKey]);

  function handleWinnerChange(matchId: number, value: string) {
    setSelectedWinners((prev) => {
      const next = { ...prev, [matchId]: value };
      const descendants = collectDescendants(matchId, childMap);

      for (const descendantId of descendants) {
        delete next[descendantId];
      }

      return next;
    });
    setMessage(null);
  }

  function resetBracket() {
    setSelectedWinners({});
    setMessage("Tableau reinitialise.");
  }

  const phaseGroups = useMemo(() => {
    return bracket.reduce<Record<string, BracketMatch[]>>((acc, match) => {
      if (!acc[match.phase]) acc[match.phase] = [];
      acc[match.phase].push(match);
      return acc;
    }, {});
  }, [bracket]);

  const champion = selectedWinners[31] ?? null;
  const firstRoundPhase = "16e de finale";
  const nextPhaseOrder = [
    "8e de finale",
    "Quarts de finale",
    "Demi-finales",
    "Finale",
  ];

  function renderPhaseCard(phase: string, matches: BracketMatch[]) {
    return (
      <div
        key={phase}
        className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <h2 className="mb-4 text-2xl font-bold">{phase}</h2>
        <div className="space-y-4">
          {matches.map((match) => {
            const possibleTeams = getPossibleTeams(
              match,
              matchesById,
              selectedWinners
            );
            const selected = selectedWinners[match.id] ?? "";
            const matchInfo = matchInfoById[match.id];
            const appNowTime = simulatedNow
              ? new Date(simulatedNow).getTime()
              : Date.now();
            const status = getMatchStatus(matchInfo, appNowTime);
            const points = getPointsForWinnerPrediction(
              selected,
              matchInfo
            );
            const kickoffDate = matchInfo
              ? new Date(matchInfo.kickoffAt)
              : null;
            const canPredict = status === "Ouvert";

            const leftLabel = match.leftMatchId
              ? getSelectedOrPossibleTeams(
                  matchesById[match.leftMatchId],
                  matchesById,
                  selectedWinners
                ).join(" / ")
              : match.teamA;
            const rightLabel = match.rightMatchId
              ? getSelectedOrPossibleTeams(
                  matchesById[match.rightMatchId],
                  matchesById,
                  selectedWinners
                ).join(" / ")
              : match.teamB;

            return (
              <div
                key={match.id}
                className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
              >
                <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500">
                    <span>Match #{match.id}</span>
                    <span>Ville: {getCityFromVenue(matchInfo?.venue)}</span>
                    <span>
                      Date:{" "}
                      {kickoffDate
                        ? formatMatchDate(kickoffDate, timeZone)
                        : "-"}
                    </span>
                    <span>
                      Heure:{" "}
                      {kickoffDate
                        ? formatMatchTime(kickoffDate, timeZone)
                        : "-"}
                    </span>
                    <span>Pts: {points ?? "-"}</span>
                    <span className={getStatusClass(status)}>
                      {status === "Termine" ? "Termine" : status}
                    </span>
                  </p>
                  <p className="min-w-0 font-semibold text-slate-900 sm:text-right">
                    {leftLabel} vs {rightLabel}
                  </p>
                </div>

                <select
                  value={selected}
                  onChange={(e) => handleWinnerChange(match.id, e.target.value)}
                  disabled={!canPredict}
                  className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-slate-900"
                >
                  <option value="">Selectionner</option>
                  {possibleTeams.map((team) => (
                    <option key={team} value={team}>
                      {team}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-gray-500">Utilisateur connecte :</p>
          <p className="text-lg font-semibold text-slate-900">{userName}</p>
        </div>

        <button
          type="button"
          onClick={resetBracket}
          className="rounded bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
        >
          Reinitialiser le tableau
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-6">
        <h1 className="mb-3 text-3xl font-bold">{title}</h1>
        <p className="text-sm leading-6 text-slate-600">
          {description}
        </p>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        {phaseGroups[firstRoundPhase]
          ? renderPhaseCard(firstRoundPhase, phaseGroups[firstRoundPhase])
          : null}

        <div className="space-y-6">
          {nextPhaseOrder.map((phase) =>
            phaseGroups[phase] ? renderPhaseCard(phase, phaseGroups[phase]) : null
          )}
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-slate-100 p-6">
        <h2 className="text-2xl font-bold">Resume</h2>
        <p className="mt-2 text-slate-600">
          Champion pronostique :{" "}
          <span className="font-semibold text-slate-900">
            {champion ?? "Aucun choix"}
          </span>
        </p>
        {message && <p className="mt-3 text-sm text-green-700">{message}</p>}
      </div>
    </section>
  );
}
