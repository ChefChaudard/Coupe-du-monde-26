"use client";

import { useEffect, useMemo, useState } from "react";

type BracketMatch = {
  id: number;
  phase: string;
  teamA: string;
  teamB: string;
  leftMatchId?: number;
  rightMatchId?: number;
};

type SelectedWinners = Record<number, string>;

type Round32Teams = [string, string][];

export const round32Placeholders: Round32Teams = [
  ["1er du groupe A", "3eme du groupe F"],
  ["1er du groupe C", "3eme du groupe E"],
  ["1er du groupe B", "3eme du groupe D"],
  ["1er du groupe D", "3eme du groupe C"],
  ["1er du groupe E", "3eme du groupe B"],
  ["1er du groupe F", "3eme du groupe A"],
  ["1er du groupe G", "2eme du groupe H"],
  ["1er du groupe H", "2eme du groupe G"],
  ["2eme du groupe A", "2eme du groupe F"],
  ["2eme du groupe C", "2eme du groupe E"],
  ["2eme du groupe B", "2eme du groupe D"],
  ["2eme du groupe D", "2eme du groupe C"],
  ["2eme du groupe E", "2eme du groupe B"],
  ["2eme du groupe F", "2eme du groupe A"],
  ["3eme du groupe G", "3eme du groupe H"],
  ["3eme du groupe H", "3eme du groupe G"],
];

function buildBracket(round32Teams?: Round32Teams): BracketMatch[] {
  const matches: BracketMatch[] = [];

  for (let i = 0; i < 16; i += 1) {
    const [teamA, teamB] = round32Teams?.[i] ?? round32Placeholders[i] ?? [
      `1er du groupe ${String.fromCharCode(65 + (i % 8))}`,
      `2eme du groupe ${String.fromCharCode(65 + (i % 8))}`,
    ];

    matches.push({
      id: i + 1,
      phase: "32e de finale",
      teamA,
      teamB,
    });
  }

  const rounds = [
    { phase: "16e de finale", count: 8, label: "32e de finale" },
    { phase: "Quarts de finale", count: 4, label: "16e de finale" },
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

function getSelectedOrPossibleTeams(
  match: BracketMatch,
  matchesById: Record<number, BracketMatch>,
  selectedWinners: SelectedWinners
): string[] {
  const selected = selectedWinners[match.id];
  if (selected) {
    return [selected];
  }

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

export default function KnockoutBracketPrediction({
  userName,
  round32Teams,
}: {
  userName: string;
  round32Teams?: Round32Teams;
}) {
  const bracket = useMemo(() => buildBracket(round32Teams), [round32Teams]);
  const matchesById = useMemo(
    () => Object.fromEntries(bracket.map((match) => [match.id, match])),
    [bracket]
  );
  const childMap = useMemo(() => getChildMatchIds(bracket), [bracket]);

  const [selectedWinners, setSelectedWinners] = useState<SelectedWinners>(() => {
    if (typeof window === "undefined") return {};

    const saved = window.localStorage.getItem("knockoutBracketPredictions");
    if (!saved) return {};

    try {
      return JSON.parse(saved) as SelectedWinners;
    } catch {
      return {};
    }
  });
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    window.localStorage.setItem(
      "knockoutBracketPredictions",
      JSON.stringify(selectedWinners)
    );
  }, [selectedWinners]);

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
    setMessage("Tableau réinitialisé.");
  }

  const phaseGroups = useMemo(() => {
    return bracket.reduce<Record<string, BracketMatch[]>>((acc, match) => {
      if (!acc[match.phase]) acc[match.phase] = [];
      acc[match.phase].push(match);
      return acc;
    }, {});
  }, [bracket]);

  const champion = selectedWinners[31] ?? null;

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-gray-500">Utilisateur connecté :</p>
          <p className="text-lg font-semibold text-slate-900">{userName}</p>
        </div>

        <button
          type="button"
          onClick={resetBracket}
          className="rounded bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
        >
          Réinitialiser le tableau
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-6">
        <h1 className="text-3xl font-bold mb-3">Pronostics Tours Eliminatoires</h1>
        <p className="text-sm leading-6 text-slate-600">
          Les équipes du tableau des 32 sont déduites des résultats de groupes.
          Pour les tours suivants, sélectionnez le vainqueur de chaque match en
          respectant la logique des tours précédents.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {Object.entries(phaseGroups).map(([phase, matches]) => (
          <div key={phase} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-2xl font-bold">{phase}</h2>
            <div className="space-y-4">
              {matches.map((match) => {
                const possibleTeams = getPossibleTeams(match, matchesById, selectedWinners);
                const selected = selectedWinners[match.id] ?? "";

                const leftLabel = match.leftMatchId
                  ? getSelectedOrPossibleTeams(matchesById[match.leftMatchId], matchesById, selectedWinners).join(" / ")
                  : match.teamA;
                const rightLabel = match.rightMatchId
                  ? getSelectedOrPossibleTeams(matchesById[match.rightMatchId], matchesById, selectedWinners).join(" / ")
                  : match.teamB;

                return (
                  <div key={match.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm text-slate-500">Match #{match.id}</p>
                        <p className="font-semibold">{leftLabel} vs {rightLabel}</p>
                      </div>
                    </div>

                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Choisir le vainqueur
                    </label>
                    <select
                      value={selected}
                      onChange={(e) => handleWinnerChange(match.id, e.target.value)}
                      className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-slate-900"
                    >
                      <option value="">Sélectionner</option>
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
        ))}
      </div>

      <div className="rounded-3xl border border-slate-200 bg-slate-100 p-6">
        <h2 className="text-2xl font-bold">Résumé</h2>
        <p className="mt-2 text-slate-600">
          Champion pronostiqué : <span className="font-semibold text-slate-900">{champion ?? "Aucun choix"}</span>
        </p>
        {message && <p className="mt-3 text-sm text-green-700">{message}</p>}
      </div>
    </section>
  );
}
