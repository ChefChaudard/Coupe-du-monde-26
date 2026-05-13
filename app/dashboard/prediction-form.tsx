"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import {
  formatDashboardDate,
  formatMatchDate,
  formatMatchTime,
} from "@/app/lib/time-zone";
import { useUserTimeZone } from "@/app/lib/use-user-time-zone";
import GroupStandingsTooltip from "./group-standings-tooltip";

type Match = {
  id: number;
  phase: string;
  team_a: string;
  team_b: string;
  kickoff_at: string;
  venue?: string | null;
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

type FormValues = Record<number, { a: string; b: string }>;

function getCityFromVenue(venue?: string | null) {
  if (!venue) return "-";
  return venue.split("-")[0].trim();
}

type TabKey = "groupes" | "tours";

function isGroupPhase(phase: string) {
  return phase.toLowerCase().includes("group");
}

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

const knockoutPhaseOrder = [
  "32e de finale",
  "16e de finale",
  "Quarts de finale",
  "Demi-finales",
  "Finale",
];

const round32Placeholders: [string, string][] = [
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

export default function PredictionForm({
  matches,
  existingPredictions,
  userId,
  matchStats,
  isAdmin,
  updateMatchResult,
  createKnockoutMatches,
  initialTab,
}: {
  matches: Match[];
  existingPredictions: Prediction[];
  userId: string;
  matchStats: Record<number, MatchStats>;
  isAdmin: boolean;
  updateMatchResult: (formData: FormData) => Promise<void>;
  createKnockoutMatches: (formData: FormData) => Promise<void>;
  initialTab?: TabKey;
}) {
  const router = useRouter();

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

  const groupedMatches = useMemo(() => {
    const groups: Record<string, Match[]> = {};

    for (const match of matches) {
      if (!groups[match.phase]) groups[match.phase] = [];
      groups[match.phase].push(match);
    }

    return Object.entries(groups);
  }, [matches]);

  const selectedTab = initialTab ?? "groupes";

  const filteredMatches = useMemo(() => {
    const matches = groupedMatches.filter(([phase]) =>
      selectedTab === "groupes" ? isGroupPhase(phase) : !isGroupPhase(phase)
    );

    if (selectedTab === "tours" && matches.length === 0) {
      return buildPlaceholderKnockoutGroups();
    }

    return matches;
  }, [groupedMatches, selectedTab]);

  const [values, setValues] = useState<FormValues>(initialValues);
  const [realScores, setRealScores] = useState<FormValues>(initialRealScores);
  const [savingGroup, setSavingGroup] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [simulatedNow, setSimulatedNow] = useState<string | null>(null);
  const timeZone = useUserTimeZone();

  useEffect(() => {
    setValues(initialValues);
  }, [initialValues]);

  useEffect(() => {
    setRealScores(initialRealScores);
  }, [initialRealScores]);

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

      if (data?.value) {
        setSimulatedNow(data.value);
      } else {
        setSimulatedNow(new Date().toISOString());
      }
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

  const appNowTime = simulatedNow ? new Date(simulatedNow).getTime() : 0;

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
        }
      }

setMessage(`Sauvegarde effectuée pour ${phase}.`);

router.refresh();
    } finally {
      setSavingGroup(null);
    }
  }

  if (!simulatedNow) {
    return <p>Chargement...</p>;
  }

  return (
    <section className="space-y-5 text-slate-900">
      <h1 className="text-3xl font-bold tracking-tight text-slate-950">
        Pronostics Groupes au {formatDashboardDate(simulatedNow, timeZone)}
      </h1>

      <h2 className="text-lg font-semibold text-emerald-950">Mes pronostics</h2>

      {filteredMatches.length === 0 ? (
        <div className="rounded-lg border border-dashed border-emerald-200 bg-white/80 p-6 text-center text-slate-500 shadow-sm">
          {selectedTab === "groupes" ? (
            "Aucun match de groupe n'est disponible pour le moment."
          ) : (
            <>
              <p>Aucun match des tours suivants n&apos;est disponible pour le moment.</p>
              {isAdmin ? (
                <form action={createKnockoutMatches} className="mt-4">
                  <button
                    type="submit"
                    className="rounded bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800"
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
            className="overflow-visible rounded-lg border border-emerald-100 bg-white shadow-[0_12px_30px_rgba(15,118,110,0.07)]"
          >
            <div className="flex items-center justify-between gap-4 rounded-t-lg border-b border-emerald-100 bg-emerald-50/80 px-4 py-3">
              <div className="text-base font-bold">
                {selectedTab === "groupes" ? (
                  <GroupStandingsTooltip
                    groupName={phase}
                    standings={liveGroupStandings[phase] ?? []}
                  />
                ) : (
                  <span className="capitalize">{phase}</span>
                )}
              </div>

              <button
                onClick={() => saveGroup(phaseMatches, phase)}
                disabled={savingGroup === phase}
                className="rounded bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingGroup === phase ? "Sauvegarde..." : "Sauvegarder"}
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full table-fixed text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-left font-semibold text-slate-500">
                    <th className="w-[13%] py-2 pr-1">Équipe A</th>
                    <th className="w-[44px] px-1 py-2 text-center">A</th>
                    <th className="w-[44px] px-1 py-2 text-center">B</th>
                    <th className="w-[13%] px-1 py-2">Équipe B</th>
                    <th className="w-[62px] px-1 py-2">Date</th>
                    <th className="w-[60px] px-1 py-2">Heure</th>
                    <th className="w-[80px] px-1 py-2">Ville</th>
                    <th className="w-[75px] px-1 py-2">Statut</th>
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
                    const canEnterRealScore = isAdmin && hasStarted;

                    const hasOfficialScore =
                      match.is_finished &&
                      match.score_a !== null &&
                      match.score_b !== null;

                    const stats = matchStats[match.id];
                    const myPoints = stats?.myPoints ?? null;
                    const averagePoints = stats?.averagePoints ?? null;

                    return (
                      <tr
                        key={match.id}
                        className="border-b border-slate-100 transition last:border-b-0 hover:bg-emerald-50/45"
                      >
                        <td className="py-2 pr-1 font-medium truncate text-slate-900">
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
                            className="w-10 rounded border border-slate-200 bg-white px-1 py-1 text-center text-slate-900 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100 disabled:text-slate-500"
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
                            className="w-10 rounded border border-slate-200 bg-white px-1 py-1 text-center text-slate-900 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100 disabled:text-slate-500"
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
                          {getCityFromVenue(match.venue)}
                        </td>

                        <td className="px-1 py-2 whitespace-nowrap">
                          {hasOfficialScore ? (
                            <span className="rounded-full bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-800">
                              Terminé
                            </span>
                          ) : canPredict ? (
                            <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">
                              Ouvert
                            </span>
                          ) : (
                            <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                              Bloqué
                            </span>
                          )}
                        </td>

                        <td className="px-1 py-2 text-center font-semibold text-slate-900">
                          {myPoints !== null ? myPoints : "-"}
                        </td>

                        <td className="px-1 py-2 text-center text-slate-600">
                          {averagePoints !== null
                            ? averagePoints.toFixed(1)
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
        <p className="rounded-lg border border-emerald-100 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
          {message}
        </p>
      )}
    </section>
  );
}