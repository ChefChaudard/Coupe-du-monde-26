"use client";

import { useEffect, useMemo, useState } from "react";
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

function getDisplayTeam(match: Match, side: "a" | "b", matchIndex: number, selectedTab: TabKey) {
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
  const [savingGroup, setSavingGroup] = useState<string | null>(null);
  const [message, setMessage] = useState("");
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

  async function saveGroup(matchesInGroup: Match[], phase: string) {
    setMessage("");
    setSavingGroup(phase);

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

    setMessage(`Pronostics sauvegardés pour ${phase}.`);
  }

  if (!simulatedNow) {
    return <p>Chargement...</p>;
  }

  return (
    <section className="space-y-6">
      <h1 className="text-4xl font-bold">
        Pronostics Groupes au {formatDashboardDate(simulatedNow, timeZone)}
      </h1>

      <h2 className="text-2xl font-bold">Mes pronostics</h2>

      {filteredMatches.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-gray-500">
          {selectedTab === "groupes" ? (
            "Aucun match de groupe n'est disponible pour le moment."
          ) : (
            <>
              <p>Aucun match des tours suivants n&apos;est disponible pour le moment.</p>
              {isAdmin ? (
                <form action={createKnockoutMatches} className="mt-4">
                  <button
                    type="submit"
                    className="rounded bg-black px-4 py-2 text-sm font-semibold text-white"
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
      ) : filteredMatches.map(([phase, phaseMatches]) => {
          return (
            <div key={phase} className="rounded-xl border p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-lg font-bold">
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
                  className="rounded bg-black px-3 py-1 text-sm text-white disabled:opacity-50"
                >
                  {savingGroup === phase ? "Saving..." : "SAVE"}
                </button>
              </div>

              <table className="w-full table-fixed text-xs">
                <thead>
                  <tr className="border-b text-left text-gray-500">
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
                        <th className="w-[130px] py-2 pl-1"></th>
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
                    <tr key={match.id} className="border-b last:border-b-0">
                      <td className="py-2 pr-1 font-medium truncate">
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
                          className="w-10 rounded border px-1 py-1 text-center disabled:bg-gray-100 disabled:text-gray-500"
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
                          className="w-10 rounded border px-1 py-1 text-center disabled:bg-gray-100 disabled:text-gray-500"
                        />
                      </td>

                      <td className="px-1 py-2 font-medium truncate">
                        {getDisplayTeam(match, "b", matchIndex, selectedTab)}
                      </td>

                      <td className="px-1 py-2 whitespace-nowrap text-gray-600">
                        {formatMatchDate(kickoffDate, timeZone)}
                      </td>

                      <td className="px-1 py-2 whitespace-nowrap text-gray-600">
                        {formatMatchTime(kickoffDate, timeZone)}
                      </td>

                      <td className="px-1 py-2 truncate text-gray-600">
                        {getCityFromVenue(match.venue)}
                      </td>

                      <td className="px-1 py-2 whitespace-nowrap">
                        {hasOfficialScore ? (
                          <span className="text-blue-700">Terminé</span>
                        ) : canPredict ? (
                          <span className="text-green-600">Ouvert</span>
                        ) : (
                          <span className="text-red-600">Bloqué</span>
                        )}
                      </td>

                      <td className="px-1 py-2 text-center font-semibold">
                        {myPoints !== null ? myPoints : "-"}
                      </td>

                      <td className="px-1 py-2 text-center">
                        {averagePoints !== null
                          ? averagePoints.toFixed(1)
                          : "-"}
                      </td>

                      {isAdmin && (
                        <>
                          <td className="px-1 py-2 text-center font-semibold">
                            {match.score_a ?? "-"}
                          </td>

                          <td className="px-1 py-2 text-center font-semibold">
                            {match.score_b ?? "-"}
                          </td>

                          <td className="py-2 pl-1 text-right">
                            {canEnterRealScore && (
                              <form
                                action={updateMatchResult}
                                className="flex justify-end gap-1"
                              >
                                <input
                                  type="hidden"
                                  name="match_id"
                                  value={match.id}
                                />

                                <input
                                  name="score_a"
                                  type="number"
                                  min={0}
                                  defaultValue={match.score_a ?? ""}
                                  className="w-10 rounded border px-1 py-1 text-center"
                                />

                                <input
                                  name="score_b"
                                  type="number"
                                  min={0}
                                  defaultValue={match.score_b ?? ""}
                                  className="w-10 rounded border px-1 py-1 text-center"
                                />

                                <button className="rounded bg-blue-700 px-2 py-1 text-xs text-white">
                                  Rés.
                                </button>
                              </form>
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
        );
      })}

      {message && <p className="text-sm">{message}</p>}
    </section>
  );
}
