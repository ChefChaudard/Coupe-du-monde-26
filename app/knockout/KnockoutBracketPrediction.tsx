"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { formatOneDecimal } from "@/app/dashboard/format";
import { round32Placeholders, type Round32Teams } from "./bracket-data";
import {
  getTopScorerProbability,
  topScorerCandidates,
} from "./top-scorer-candidates";
import { type RealLaterPhase } from "../real-knockout/real-knockout-fixtures";

const LEADERBOARD_REFRESH_EVENT = "leaderboard-data-refresh";
const FIFA_TABLEAU_URL = "https://www.footmercato.net/international/coupe-du-monde/tableau-matchs";

type BracketMatch = {
  id: number;
  phase: string;
  teamA: string;
  teamB: string;
  leftMatchId?: number;
  rightMatchId?: number;
};

type SelectedWinners = Record<number, string>;

type KnockoutPredictionRow = {
  match_key: string;
  team_a: string | null;
  team_b: string | null;
  winner: string | null;
};

type SelectedMatchTeams = Record<number, { a: string; b: string }>;

type TeamOddsByPhase = Record<string, Record<string, number>>;

type TeamOddsCountByPhase = Record<string, Record<string, number>>;

export type BracketMatchInfo = {
  teamA: string;
  teamB: string;
  kickoffAt: string;
  venue?: string | null;
  city?: string | null;
  scoreA: number | null;
  scoreB: number | null;
  isFinished: boolean | null;
};

type MatchStatus = "Ouvert" | "Bloque" | "Termine";

const SIMULATED_DATE_STORAGE_KEY = "simulated-date";
const TOP_SCORER_MATCH_KEY = "top_scorer";
const TOP_SCORER_LABEL = "Meilleur buteur";

function readStoredSimulatedDate() {
  if (typeof window === "undefined") return null;

  return window.localStorage.getItem(SIMULATED_DATE_STORAGE_KEY) || null;
}

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

function isSyntheticTeamLabel(value: string) {
  return /^(Vainqueur|1er du groupe|2eme du groupe|3eme du groupe)\b/i.test(
    value.trim()
  );
}

function normalizeTeamSelection(value?: string | null) {
  if (!value || isSyntheticTeamLabel(value)) return "";
  return value.trim();
}

function normalizeTeamKey(value?: string | null) {
  return (value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function getAvailableTeamsForMatch(
  match: BracketMatch,
  matchesById: Record<number, BracketMatch>,
  phaseSourceTeams: string[],
  firstRoundTeams: string[]
) {
  if (!match.leftMatchId || !match.rightMatchId) {
    return firstRoundTeams;
  }

  return phaseSourceTeams;
}

function filterTeamsForPhase(
  options: string[],
  phaseSelectedTeams: string[],
  currentSelection: string
) {
  const blockedTeams = new Set(
    phaseSelectedTeams.filter((team) => team !== currentSelection)
  );

  return options.filter((team) => !blockedTeams.has(team));
}

function getTeamsSelectedInPhase(
  phaseMatches: BracketMatch[],
  selectedTeams: SelectedMatchTeams
) {
  return dedupe(
    phaseMatches.flatMap((match) => {
      const selected = selectedTeams[match.id];
      return [
        normalizeTeamSelection(selected?.a),
        normalizeTeamSelection(selected?.b),
      ].filter(Boolean);
    })
  );
}

function getPreviousPhaseName(phase: string) {
  switch (phase) {
    case "8e de finale":
      return "16e de finale";
    case "Quarts de finale":
      return "8e de finale";
    case "Demi-finales":
      return "Quarts de finale";
    case "Finale":
      return "Demi-finales";
    default:
      return null;
  }
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

function getWinnerPointsBase(phase: string) {
  const normalizedPhase = phase.toLowerCase();

  if (normalizedPhase.includes("16e")) return 2;
  if (normalizedPhase.includes("8e")) return 2;
  if (normalizedPhase.includes("quart")) return 2;
  if (normalizedPhase.includes("demi")) return 3;
  if (normalizedPhase.includes("finale")) return 3;

  return 1;
}

function getPointsForWinnerPrediction(
  selectedWinner: string,
  matchInfo?: BracketMatchInfo,
  phase?: string
) {
  const actualWinnerSide = getActualWinner(matchInfo);
  if (!actualWinnerSide || !selectedWinner || !matchInfo) return null;

  const actualWinner =
    actualWinnerSide === "A" ? matchInfo.teamA : matchInfo.teamB;

  return selectedWinner === actualWinner ? 4 : 0;
}

function getChampionBonusPoints(
  selectedWinner: string | null,
  matchInfo?: BracketMatchInfo
) {
  const actualWinnerSide = getActualWinner(matchInfo);
  if (!actualWinnerSide || !selectedWinner || !matchInfo) return null;

  const actualWinner =
    actualWinnerSide === "A" ? matchInfo.teamA : matchInfo.teamB;

  return selectedWinner === actualWinner ? 4 : 0;
}

function getPlacementPointsForTeam(
  selectedTeam: string,
  actualTeams: Array<string | undefined>,
  phase: string,
  odds: number
) {
  if (!selectedTeam) return null;

  const selectedKey = normalizeTeamKey(selectedTeam);

  return actualTeams.some((team) => normalizeTeamKey(team) === selectedKey)
    ? Math.max(1, Math.round(odds * 100) / 100)
    : 0;
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
  if (status === "Termine") {
    return "rounded-full bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-800";
  }

  if (status === "Ouvert") {
    return "rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800";
  }

  return "rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600";
}

function formatTheoreticalTeamLabel(label: string) {
  const trimmed = label.trim();

  if (/^1er\s+du\s+groupe\s+/i.test(trimmed)) {
    return trimmed.replace(/^1er\s+du\s+groupe\s+/i, "Vainqueur du groupe ");
  }

  return trimmed;
}

function getRound32QualificationRuleLabel() {
  return [
    "Règle FIFA 2026 pour le tour à 32:",
    "12 premiers de groupe + 12 deuxièmes + 8 meilleurs troisièmes.",
    "Les groupes vont de A à L.",
  ].join(" ");
}

function getTheoreticalMatchLabel(match: BracketMatch) {
  if (match.phase === "16e de finale") {
    const placeholder = round32Placeholders[match.id - 1] ?? [match.teamA, match.teamB];

    return `${getRound32QualificationRuleLabel()} ${formatTheoreticalTeamLabel(placeholder[0])} contre ${formatTheoreticalTeamLabel(placeholder[1])}`;
  }

  const previousPhase = getPreviousPhaseName(match.phase);

  if (!previousPhase || !match.leftMatchId || !match.rightMatchId) {
    return `Vainqueur ${match.teamA} contre ${match.teamB}`;
  }

  return `Vainqueur ${previousPhase} ${match.leftMatchId} contre Vainqueur ${previousPhase} ${match.rightMatchId}`;
}

function getMatchTooltipLabel(match: BracketMatch) {
  return `En théorie: ${getTheoreticalMatchLabel(match)}`;
}

function formatDisplayedPoints(value: number | null) {
  return value === null ? "-" : formatOneDecimal(value);
}

function getKnockoutOddsCoefficient(phase: string) {
  const normalizedPhase = phase.toLowerCase();

  if (normalizedPhase.includes("16e")) return 1;
  if (normalizedPhase.includes("8e")) return 1.5;
  if (normalizedPhase.includes("quart")) return 2;
  if (normalizedPhase.includes("demi")) return 3;
  if (normalizedPhase.includes("finale")) return 5;

  return 1;
}

function computeOddsFromCounts(totalPlayersCount: number, teamCount: number, phase: string) {
  const coefficient = getKnockoutOddsCoefficient(phase);

  return Math.max(
    1,
    Math.round((totalPlayersCount / Math.max(teamCount, 1)) * coefficient * 100) / 100
  );
}

export default function KnockoutBracketPrediction({
  userId,
  round32Teams,
  groupTeamsByLetter = {},
  matchInfoById = {},
  actualTeamsByPhase = {},
  teamOddsByPhase = {},
  teamOddsCountsByPhase = {},
  totalPlayersCount = 0,
  tournamentStartAt = null,
  storageKey = "knockoutBracketPredictions",
  title = "Pronostics Tours Eliminatoires",
  description = "Les 16e se jouent avec les 48 pays qualifies. Pour les tours suivants, les listes proposent uniquement les equipes du tour precedent, sans doublon possible dans un meme tour. Chaque equipe correctement pronostiquee rapporte 2 points multiplies par sa cote. La cote d'une issue correspond au total des joueurs ayant pronostiqué ce match divisé par le nombre de joueurs ayant joué cette issue.",
}: {
  userId: string;
  round32Teams?: Round32Teams;
  groupTeamsByLetter?: Record<string, string[]>;
  matchInfoById?: Record<number, BracketMatchInfo>;
  actualTeamsByPhase?: Record<string, string[]>;
  teamOddsByPhase?: TeamOddsByPhase;
  teamOddsCountsByPhase?: TeamOddsCountByPhase;
  totalPlayersCount?: number;
  tournamentStartAt?: number | null;
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
const [selectedWinners, setSelectedWinners] = useState<SelectedWinners>({});
const [selectedTeams, setSelectedTeams] = useState<SelectedMatchTeams>({});
const [selectedTopScorer, setSelectedTopScorer] = useState("");
const [hasLoadedStorage, setHasLoadedStorage] = useState(false);
const [message, setMessage] = useState<string | null>(null);
const [saving, setSaving] = useState(false);
const [saveMessage, setSaveMessage] = useState<string | null>(null);
const [simulatedNow, setSimulatedNow] = useState<string | null>(null);
const [serverNowTime] = useState(() => Date.now());
const appNowTime = simulatedNow ? new Date(simulatedNow).getTime() : serverNowTime;
const isTournamentLocked =
  tournamentStartAt !== null && Number.isFinite(tournamentStartAt) && appNowTime >= tournamentStartAt;

useEffect(() => {
  async function loadKnockoutPredictions() {
    const { data, error } = await supabase
      .from("knockout_predictions")
      .select("match_key, team_a, team_b, winner")
      .eq("user_id", userId);

    if (error) {
      console.error(
        "Erreur chargement knockout:",
        JSON.stringify(error, null, 2)
      );
      setHasLoadedStorage(true);
      return;
    }

    const next: SelectedWinners = {};
    const nextTeams: SelectedMatchTeams = {};
    let nextTopScorer = "";

    for (const row of (data ?? []) as KnockoutPredictionRow[]) {
      const matchKey = Number(row.match_key);
      if (row.match_key === TOP_SCORER_MATCH_KEY) {
        nextTopScorer = row.team_a ?? row.winner ?? "";
        continue;
      }

      if (row.winner && Number.isFinite(matchKey)) {
        next[matchKey] = row.winner;
      }

      const teamA = normalizeTeamSelection(row.team_a);
      const teamB = normalizeTeamSelection(row.team_b);

      if (Number.isFinite(matchKey) && (teamA || teamB)) {
        nextTeams[matchKey] = {
          a: teamA,
          b: teamB,
        };
      }
    }

    setSelectedWinners(next);
    setSelectedTeams(nextTeams);
    setSelectedTopScorer(nextTopScorer);
    setHasLoadedStorage(true);
  }

  void loadKnockoutPredictions();
}, [userId]);

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

    setSimulatedNow(data?.value ?? readStoredSimulatedDate());
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

useEffect(() => {
  if (!hasLoadedStorage) return;
}, [selectedWinners, hasLoadedStorage]);

function handleWinnerChange(matchId: number, value: string) {
  if (isTournamentLocked) return;

  setSelectedWinners((prev) => {
    const next = { ...prev, [matchId]: value };
    const descendants = collectDescendants(matchId, childMap);

    for (const descendantId of descendants) {
      delete next[descendantId];
    }

    return next;
  });

  setMessage(null);
  setSaveMessage(null);
}

function handleTopScorerChange(value: string) {
  if (isTournamentLocked) return;

  setSelectedTopScorer(value);
  setMessage(null);
  setSaveMessage(null);
}

function handleTeamChange(
  matchId: number,
  phase: string,
  side: "a" | "b",
  value: string
) {
  if (isTournamentLocked) return;

  setSelectedTeams((prev) => {
    const next = { ...prev };
    const phaseMatches = bracket.filter((match) => match.phase === phase);
    const descendantIds = collectDescendants(matchId, childMap);

    if (value) {
      for (const phaseMatch of phaseMatches) {
        if (phaseMatch.id === matchId) continue;

        const current = next[phaseMatch.id];
        if (!current) continue;

        let changed = false;

        if (current.a === value) {
          current.a = "";
          changed = true;
        }

        if (current.b === value) {
          current.b = "";
          changed = true;
        }

        if (changed && !current.a && !current.b) {
          delete next[phaseMatch.id];
        }
      }
    }

    const currentMatch = next[matchId] ?? { a: "", b: "" };
    const nextMatch = {
      ...currentMatch,
      [side]: value,
    };

    if (nextMatch.a && nextMatch.a === nextMatch.b) {
      if (side === "a") {
        nextMatch.b = "";
      } else {
        nextMatch.a = "";
      }
    }

    if (!nextMatch.a && !nextMatch.b) {
      delete next[matchId];
    } else {
      next[matchId] = nextMatch;
    }

    return next;
  });

  setSelectedWinners((prev) => {
    const next = { ...prev };
    const descendantIds = collectDescendants(matchId, childMap);

    for (const descendantId of descendantIds) {
      delete next[descendantId];
    }

    return next;
  });

  setMessage(null);
  setSaveMessage(null);
}

async function handleSaveKnockout() {
  if (isTournamentLocked) return;

  setSaving(true);
  setSaveMessage(null);

  const rows = bracket.map((match) => ({
    user_id: userId,
    match_key: String(match.id),
    round: match.phase,
    team_a: normalizeTeamSelection(selectedTeams[match.id]?.a) || null,
    team_b: normalizeTeamSelection(selectedTeams[match.id]?.b) || null,
    winner: selectedWinners[match.id] ?? null,
    updated_at: new Date().toISOString(),
  }));

  const finalMatch = matchesById[31];
  const champion = selectedWinners[31] ?? null;

  if (champion && finalMatch) {
    rows.push({
      user_id: userId,
      match_key: "champion",
      round: "Vainqueur",
      team_a: finalMatch.teamA,
      team_b: finalMatch.teamB,
      winner: champion,
      updated_at: new Date().toISOString(),
    });
  }

  if (selectedTopScorer) {
    rows.push({
      user_id: userId,
      match_key: TOP_SCORER_MATCH_KEY,
      round: TOP_SCORER_LABEL,
      team_a: selectedTopScorer,
      team_b: null,
      winner: selectedTopScorer,
      updated_at: new Date().toISOString(),
    });
  }

  const { error } = await supabase
    .from("knockout_predictions")
    .upsert(rows, {
      onConflict: "user_id,match_key",
    });

  setSaving(false);

if (error) {
  console.error(
    "Erreur Supabase knockout:",
    JSON.stringify(error, null, 2)
  );

  setSaveMessage("Erreur lors de la sauvegarde.");
  return;
}

  window.dispatchEvent(new Event(LEADERBOARD_REFRESH_EVENT));
  setSaveMessage("Pronostics sauvegard├®s.");
}

  function resetBracket() {
    setSelectedWinners({});
    setSelectedTeams({});
    setSelectedTopScorer("");
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
  const championBonus = getChampionBonusPoints(champion, matchInfoById[31]);
  const totalPoints = useMemo(() => {
    const roundPoints = bracket.reduce((sum, match) => {
      const selected = selectedWinners[match.id];
      const matchInfo = matchInfoById[match.id];
      const points = selected
        ? getPointsForWinnerPrediction(selected, matchInfo, match.phase)
        : null;

      return sum + (points ?? 0);
    }, 0);

    return roundPoints + (championBonus ?? 0);
  }, [bracket, championBonus, matchInfoById, selectedWinners]);
  const firstRoundPhase = "16e de finale";
  const nextPhaseOrder = [
    "8e de finale",
    "Quarts de finale",
    "Demi-finales",
    "Finale",
  ];
  const laterPhases: RealLaterPhase[] = [
    "8e de finale",
    "Quarts de finale",
    "Demi-finales",
    "Finale",
  ];
  const allRound32Teams = useMemo(
    () => dedupe(Object.values(groupTeamsByLetter).flat()).sort((left, right) => left.localeCompare(right)),
    [groupTeamsByLetter]
  );

  function getLiveTeamOdds(phase: string, team: string) {
    const phaseMatches = phaseGroups[phase] ?? [];
    const baseTeamCount = teamOddsCountsByPhase[phase]?.[team] ?? 0;
    let teamCount = baseTeamCount;

    for (const match of phaseMatches) {
      const selectedTeamA = normalizeTeamSelection(selectedTeams[match.id]?.a);
      const selectedTeamB = normalizeTeamSelection(selectedTeams[match.id]?.b);

      if (selectedTeamA === team) {
        teamCount += 1;
      }

      if (selectedTeamB === team) {
        teamCount += 1;
      }
    }

    return computeOddsFromCounts(totalPlayersCount, teamCount, phase);
  }

  function renderPhaseCard(phase: string, matches: BracketMatch[]) {
    const phaseSelectedTeams = getTeamsSelectedInPhase(matches, selectedTeams);
    const previousPhase = getPreviousPhaseName(phase);
    const previousPhaseTeams = previousPhase
      ? phaseGroups[previousPhase]
        ? getTeamsSelectedInPhase(phaseGroups[previousPhase], selectedTeams)
        : []
      : phase === firstRoundPhase
        ? allRound32Teams
        : [];

    function formatTeamOption(team: string) {
      const odds = getLiveTeamOdds(phase, team);
      return `${team} (${formatOneDecimal(odds)})`;
    }

    return (
      <div
        key={phase}
        className="overflow-visible rounded-2xl border border-slate-900/12 bg-white shadow-[0_14px_36px_rgba(15,23,42,0.08)]"
      >
        <div className="flex items-center justify-between gap-4 rounded-t-2xl border-b border-slate-900/10 bg-slate-900 px-4 py-3 text-white">
          <h2 className="text-base font-bold tracking-wide">{phase}</h2>
        </div>

        <div className="space-y-4 p-5">
          {matches.map((match) => {
            const selected = selectedWinners[match.id] ?? "";
            const selectedTeamA = normalizeTeamSelection(selectedTeams[match.id]?.a);
            const selectedTeamB = normalizeTeamSelection(selectedTeams[match.id]?.b);
            const teamOptions = getAvailableTeamsForMatch(
              match,
              matchesById,
              previousPhaseTeams,
              allRound32Teams
            );
            const teamAOptions = filterTeamsForPhase(
              teamOptions,
              phaseSelectedTeams,
              selectedTeamA
            );
            const teamBOptions = filterTeamsForPhase(
              teamOptions,
              phaseSelectedTeams,
              selectedTeamB
            );
            const matchInfo = matchInfoById[match.id];
            const status = getMatchStatus(matchInfo, appNowTime);
            const actualTeams =
              actualTeamsByPhase[phase] ??
              [matchInfo?.teamA, matchInfo?.teamB].filter(
                (team): team is string => Boolean(team)
              );
            const isFinal = phase === "Finale";
            const winnerOptions = dedupe([selectedTeamA, selectedTeamB].filter(Boolean));
            const selectedValueA = teamAOptions.includes(selectedTeamA)
              ? selectedTeamA
              : "";
            const selectedValueB = teamBOptions.includes(selectedTeamB)
              ? selectedTeamB
              : "";

            return (
              <div
                key={match.id}
                className="relative rounded-lg border border-slate-200 bg-slate-50/80 p-4 pt-16 transition hover:border-emerald-200 hover:bg-emerald-50/55"
              >
                <div className="absolute left-4 right-4 top-3 flex flex-col items-start gap-1 text-left">
                  <div className="flex w-full flex-wrap items-center justify-start gap-x-2 gap-y-1 rounded-md bg-slate-200 px-3 py-2 text-[11px] font-semibold leading-tight text-slate-600">
                    <div className="group relative shrink-0">
                      <span
                        title={getMatchTooltipLabel(match)}
                        className="inline-flex cursor-help rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 hover:text-slate-950"
                      >
                        Match {match.id}
                      </span>

                      <div className="pointer-events-none absolute left-0 top-full z-20 mt-2 w-[min(420px,calc(100vw-3rem))] translate-y-1 rounded-xl border border-slate-200 bg-white p-3 text-xs font-normal text-slate-700 opacity-0 shadow-[0_12px_30px_rgba(15,23,42,0.12)] transition duration-150 group-hover:translate-y-0 group-hover:opacity-100 whitespace-pre-line">
                        {getMatchTooltipLabel(match)}
                      </div>
                    </div>

                    <span className={`${getStatusClass(status)} ml-auto whitespace-nowrap text-right`}>
                      {status === "Termine" ? "Termine" : status}
                    </span>
                  </div>
                </div>

                <div className="mb-3 grid gap-3 rounded-md border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-2">
                  <label className="space-y-1 text-sm font-medium text-slate-600">
                    <span>Equipe A</span>
                    <select
                      value={selectedValueA}
                      onChange={(event) =>
                        handleTeamChange(match.id, phase, "a", event.target.value)
                      }
                      disabled={isTournamentLocked}
                      className="w-full rounded border border-slate-200 bg-white px-3 py-2 text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-100"
                    >
                      <option value="">Selectionner</option>
                      {teamAOptions.map((team) => (
                        <option key={`a-${team}`} value={team}>
                          {formatTeamOption(team)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-1 text-sm font-medium text-slate-600">
                    <span>Equipe B</span>
                    <select
                      value={selectedValueB}
                      onChange={(event) =>
                        handleTeamChange(match.id, phase, "b", event.target.value)
                      }
                      disabled={isTournamentLocked}
                      className="w-full rounded border border-slate-200 bg-white px-3 py-2 text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-100"
                    >
                      <option value="">Selectionner</option>
                      {teamBOptions.map((team) => (
                        <option key={`b-${team}`} value={team}>
                          {formatTeamOption(team)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {isFinal ? (
                  <label className="space-y-1 text-sm font-medium text-slate-600">
                    <span>Vainqueur</span>
                    <select
                      value={selected}
                      onChange={(event) =>
                        handleWinnerChange(match.id, event.target.value)
                      }
                      disabled={isTournamentLocked}
                      className="w-full rounded border border-slate-200 bg-white px-3 py-2 text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-100"
                    >
                      <option value="">Selectionner le vainqueur</option>
                      {winnerOptions.map((team) => (
                        <option key={`winner-${match.id}-${team}`} value={team}>
                          {formatTeamOption(team)}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>
            );
          })}

        </div>
      </div>
    );
  }

  return (
    <section className="space-y-6 text-slate-900">
      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleSaveKnockout}
            disabled={saving || isTournamentLocked}
            className="rounded bg-[#7a1f2c] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#5f1822] disabled:opacity-60"
          >
            {saving ? "Sauvegarde..." : "Sauvegarder"}
          </button>

          <button
            type="button"
            onClick={resetBracket}
            disabled={isTournamentLocked}
            className="rounded bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700"
          >
            Reinitialiser le tableau
          </button>

          <a
            href={FIFA_TABLEAU_URL}
            target="_blank"
            rel="noreferrer"
            className="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
          >
            Tableau FIFA
          </a>
        </div>
      </div>

      {isTournamentLocked ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
          Les pronostics sont verrouilles depuis le debut du premier match de la Coupe du monde.
        </p>
      ) : null}

      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="mb-3 text-3xl font-bold tracking-tight text-slate-950">{title}</h1>
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

      <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-orange-50 p-5 shadow-[0_14px_36px_rgba(15,23,42,0.08)]">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-slate-950">
              Meilleur buteur
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Faites votre choix avant le coup d'envoi du premier match.
            </p>
          </div>
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
            {isTournamentLocked ? "Verrouille" : "Ouvert"}
          </span>
        </div>

        <label className="block space-y-2 text-sm font-medium text-slate-700">
          <span>Selectionner le meilleur buteur de la Coupe du monde</span>
          <select
            value={selectedTopScorer}
            onChange={(event) => handleTopScorerChange(event.target.value)}
            disabled={isTournamentLocked}
            className="w-full rounded-xl border border-amber-200 bg-white px-4 py-3 text-slate-900 shadow-sm outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-100 disabled:bg-slate-100"
          >
            <option value="">Selectionner le meilleur buteur</option>
            {topScorerCandidates.map((player, index) => {
              const probability = getTopScorerProbability(index);

              return (
                <option key={player} value={player}>
                  {player} ({formatOneDecimal(probability)}%)
                </option>
              );
            })}
          </select>
        </label>
      </div>

      {message && <p className="text-sm">{message}</p>}
      {saveMessage && <p className="text-sm">{saveMessage}</p>}
    </section>
  );
}
