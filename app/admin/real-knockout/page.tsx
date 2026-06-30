import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/roles";
import { FIFA_TEAMS } from "@/app/lib/fifa-group-cities";
import {
  getRealLaterFixture,
  getRealRound32Fixture,
  type RealLaterPhase,
} from "@/app/real-knockout/real-knockout-fixtures";
import Round32SlotSchedule from "./Round32SlotSchedule";

type Fixture = {
  kickoff_at: string;
  venue: string;
  city: string;
};

type KnockoutRound = {
  key: string;
  label: string;
  shortLabel: string;
  phase: "16e de finale" | RealLaterPhase;
  realPhase: string;
  matchNumbers: number[];
  settingKey: string;
};

const knockoutRounds = [
  {
    key: "round32",
    label: "16e de finale",
    shortLabel: "16e",
    phase: "16e de finale",
    realPhase: "Reel - 16e de finale",
    matchNumbers: Array.from({ length: 16 }, (_, index) => 73 + index),
    settingKey: "real_round32_assignments",
  },
  {
    key: "round16",
    label: "8e de finale",
    shortLabel: "8e",
    phase: "8e de finale",
    realPhase: "Reel - 8e de finale",
    matchNumbers: Array.from({ length: 8 }, (_, index) => 89 + index),
    settingKey: "real_round16_assignments",
  },
  {
    key: "quarter",
    label: "Quarts de finale",
    shortLabel: "Quarts",
    phase: "Quarts de finale",
    realPhase: "Reel - Quarts de finale",
    matchNumbers: Array.from({ length: 4 }, (_, index) => 97 + index),
    settingKey: "real_quarter_assignments",
  },
  {
    key: "semi",
    label: "Demi-finales",
    shortLabel: "Demies",
    phase: "Demi-finales",
    realPhase: "Reel - Demi-finales",
    matchNumbers: Array.from({ length: 2 }, (_, index) => 101 + index),
    settingKey: "real_semi_assignments",
  },
  {
  key: "thirdPlace",
  label: "Match pour la troisième place",
  shortLabel: "3e place",
  phase: "Match pour la troisième place",
  realPhase: "Reel - Match pour la troisième place",
  matchNumbers: [103],
  settingKey: "real_third_place_assignments",
},
  {
    key: "final",
    label: "Finale",
    shortLabel: "Finale",
    phase: "Finale",
    realPhase: "Reel - Finale",
    matchNumbers: [104],
    settingKey: "real_final_assignments",
  },
] satisfies KnockoutRound[];

type MatchRow = {
  id: number;
  match_number?: number | null;
  team_a: string;
  team_b: string;
  kickoff_at?: string | null;
  venue?: string | null;
  city?: string | null;
  score_a: number | null;
  score_b: number | null;
  is_finished: boolean | null;
};

type Slot = {
  matchNumber: number;
  kickoffAt: string;
  venue: string;
  city: string;
  teamA: string;
  teamB: string;
};

type Assignment = {
  matchNumber: number;
  teamA: string;
  teamB: string;
};

type MatchWrite = {
  matchNumber: number;
  teamA: string | null;
  teamB: string | null;
  fixture: Fixture;
};

function getRoundByKey(key?: string | null) {
  return knockoutRounds.find((round) => round.key === key) ?? knockoutRounds[0];
}

function getFixture(round: KnockoutRound, index: number): Fixture | null {
  if (round.phase === "16e de finale") {
    return getRealRound32Fixture(index);
  }

  return getRealLaterFixture(round.phase, index);
}

function redirectWithError(roundKey: string, message: string): never {
  redirect(
    `/admin/real-knockout?round=${encodeURIComponent(roundKey)}&error=${encodeURIComponent(
      message
    )}`
  );
}

function parseAssignments(value?: string | null) {
  if (!value) return new Map<number, Assignment>();

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return new Map<number, Assignment>();

    const assignments = new Map<number, Assignment>();

    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;

      const candidate = item as Partial<Assignment>;

      if (
        typeof candidate.matchNumber !== "number" ||
        typeof candidate.teamA !== "string" ||
        typeof candidate.teamB !== "string"
      ) {
        continue;
      }

      assignments.set(candidate.matchNumber, {
        matchNumber: candidate.matchNumber,
        teamA: candidate.teamA,
        teamB: candidate.teamB,
      });
    }

    return assignments;
  } catch {
    return new Map<number, Assignment>();
  }
}

function buildSlots(
  round: KnockoutRound,
  existingRows: MatchRow[],
  assignments: Map<number, Assignment>
): Slot[] {
  const rowByMatchNumber = new Map<number, MatchRow>();

  for (const row of existingRows) {
    if (typeof row.match_number !== "number") continue;
    rowByMatchNumber.set(row.match_number, row);
  }

  return round.matchNumbers.map((matchNumber, index) => {
    const fixture = getFixture(round, index);
    const existing = rowByMatchNumber.get(matchNumber);
    const assignment = assignments.get(matchNumber);

    return {
      matchNumber,
      kickoffAt: fixture?.kickoff_at ?? existing?.kickoff_at ?? "",
      venue: fixture?.venue ?? existing?.venue ?? "",
      city: fixture?.city ?? existing?.city ?? "",
      teamA: assignment?.teamA ?? existing?.team_a ?? "",
      teamB: assignment?.teamB ?? existing?.team_b ?? "",
    };
  });
}

function getAvailableTeamsForSlot(slots: Slot[], slot: Slot) {
  const usedTeams = new Set<string>();

  for (const currentSlot of slots) {
    if (currentSlot.matchNumber === slot.matchNumber) continue;

    if (currentSlot.teamA) usedTeams.add(currentSlot.teamA);
    if (currentSlot.teamB) usedTeams.add(currentSlot.teamB);
  }

  return FIFA_TEAMS.filter(
    (team) => team === slot.teamA || team === slot.teamB || !usedTeams.has(team)
  );
}

async function saveAssignments(formData: FormData) {
  "use server";

  const round = getRoundByKey(String(formData.get("roundKey") ?? "round32"));

  const supabase = await createClient();
  const adminSupabase = createAdminClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("roles, role, is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !isAdmin(profile)) {
    redirectWithError(round.key, "Accès administration refusé.");
  }

  const payloads = round.matchNumbers.flatMap<MatchWrite>((matchNumber, index) => {
    const teamA = String(formData.get(`match_${matchNumber}_a`) ?? "").trim();
    const teamB = String(formData.get(`match_${matchNumber}_b`) ?? "").trim();
    const fixture = getFixture(round, index);

    if (!fixture) {
      redirectWithError(round.key, `Impossible de retrouver le calendrier du match ${matchNumber}.`);
    }

    if (!teamA && !teamB) {
      return [{ matchNumber, teamA: null, teamB: null, fixture }];
    }

    if (teamA && !FIFA_TEAMS.includes(teamA)) {
      redirectWithError(round.key, `Une équipe invalide a été sélectionnée pour le match ${matchNumber}.`);
    }

    if (teamB && !FIFA_TEAMS.includes(teamB)) {
      redirectWithError(round.key, `Une équipe invalide a été sélectionnée pour le match ${matchNumber}.`);
    }

    if (teamA && teamB && teamA === teamB) {
      redirectWithError(round.key, `Le match ${matchNumber} ne peut pas contenir la même équipe deux fois.`);
    }

    return {
      matchNumber,
      teamA: teamA || null,
      teamB: teamB || null,
      fixture,
    };
  });

  const usedTeams = new Set<string>();

  for (const payload of payloads) {
    for (const team of [payload.teamA, payload.teamB]) {
      if (!team) continue;

      if (usedTeams.has(team)) {
        redirectWithError(
          round.key,
          `Chaque équipe ne peut apparaître qu'une seule fois dans le tour : ${round.label}.`
        );
      }

      usedTeams.add(team);
    }
  }

  const { data: existingRows, error: existingRowsError } = await adminSupabase
    .from("matches")
    .select("id, match_number, score_a, score_b, is_finished")
    .eq("phase", round.realPhase)
    .in("match_number", round.matchNumbers);

  if (existingRowsError) {
    throw new Error(existingRowsError.message);
  }

  const existingRowsByMatchNumber = new Map<number, MatchRow>();

  for (const row of existingRows ?? []) {
    if (typeof row.match_number !== "number") continue;
    existingRowsByMatchNumber.set(row.match_number, row as MatchRow);
  }

  for (const payload of payloads) {
    const existingRow = existingRowsByMatchNumber.get(payload.matchNumber);

    if (!payload.teamA && !payload.teamB) {
      if (!existingRow) continue;

      const { error } = await adminSupabase.from("matches").delete().eq("id", existingRow.id);

      if (error) {
        throw new Error(error.message);
      }

      continue;
    }

    const nextValues = {
      phase: round.realPhase,
      match_number: payload.matchNumber,
      team_a: payload.teamA ?? "",
      team_b: payload.teamB ?? "",
      kickoff_at: payload.fixture.kickoff_at,
      venue: payload.fixture.venue,
      city: payload.fixture.city,
      score_a: existingRow?.score_a ?? null,
      score_b: existingRow?.score_b ?? null,
      is_finished: existingRow?.is_finished ?? false,
    };

    if (existingRow) {
      const { error } = await adminSupabase
        .from("matches")
        .update(nextValues)
        .eq("id", existingRow.id);

      if (error) {
        throw new Error(error.message);
      }
    } else {
      const { error } = await adminSupabase.from("matches").insert(nextValues);

      if (error) {
        throw new Error(error.message);
      }
    }
  }

  const { error: settingsError } = await adminSupabase.from("app_settings").upsert(
    {
      key: round.settingKey,
      value: JSON.stringify(
        payloads.map(({ matchNumber, teamA, teamB }) => ({
          matchNumber,
          teamA,
          teamB,
        }))
      ),
    },
    { onConflict: "key" }
  );

  if (settingsError) {
    throw new Error(settingsError.message);
  }

  revalidatePath("/admin/real-knockout");
  revalidatePath("/real-knockout");
  revalidatePath("/knockout");
  redirect(`/admin/real-knockout?round=${round.key}`);
}

export default async function AdminRealKnockoutPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; round?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const selectedRound = getRoundByKey(resolvedSearchParams?.round);
  const errorMessage = resolvedSearchParams?.error ?? null;

  const supabase = await createClient();
  const adminSupabase = createAdminClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("roles, role, is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !isAdmin(profile)) {
    redirect("/dashboard");
  }

  const { data: existingRows, error } = await adminSupabase
    .from("matches")
    .select("id, match_number, team_a, team_b, kickoff_at, venue, city, score_a, score_b, is_finished")
    .eq("phase", selectedRound.realPhase)
    .in("match_number", selectedRound.matchNumbers)
    .order("match_number", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const { data: settingsRow } = await adminSupabase
    .from("app_settings")
    .select("value")
    .eq("key", selectedRound.settingKey)
    .maybeSingle();

  const slots = buildSlots(
    selectedRound,
    (existingRows ?? []) as MatchRow[],
    parseAssignments(settingsRow?.value ?? null)
  );

  const firstMatchNumber = selectedRound.matchNumbers[0];
  const lastMatchNumber = selectedRound.matchNumbers[selectedRound.matchNumbers.length - 1];

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(122,31,44,0.12),_transparent_38%),linear-gradient(180deg,_#f8fafc_0%,_#f1f5f9_100%)] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white/90 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl space-y-4">
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#7a1f2c]">
                Administration
              </p>
              <h1 className="text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
                Qualification Phases Finales
              </h1>
              <p className="max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
                Sélectionne un tour, puis saisis les équipes qualifiées dans chaque match réel.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/real-knockout"
                className="rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
              >
                Voir les phases finales
              </Link>
              <Link
                href="/admin"
                className="rounded-full border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-50"
              >
                Retour admin
              </Link>
            </div>
          </div>

          {errorMessage ? (
            <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-900">
              {errorMessage}
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap gap-2">
            {knockoutRounds.map((round) => {
              const isActive = round.key === selectedRound.key;

              return (
                <Link
                  key={round.key}
                  href={`/admin/real-knockout?round=${round.key}`}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                    isActive
                      ? "bg-[#7a1f2c] text-white shadow-sm"
                      : "border border-slate-300 bg-white text-slate-900 hover:border-slate-400 hover:bg-slate-50"
                  }`}
                >
                  {round.label}
                </Link>
              );
            })}
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Tour sélectionné
              </p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{selectedRound.shortLabel}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Matchs à remplir
              </p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">{slots.length}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Matchs prévus
              </p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">
                {firstMatchNumber === lastMatchNumber
                  ? firstMatchNumber
                  : `${firstMatchNumber} - ${lastMatchNumber}`}
              </p>
            </div>
          </div>
        </header>

        <form action={saveAssignments} className="space-y-4" suppressHydrationWarning>
          <input type="hidden" name="roundKey" value={selectedRound.key} />

          {slots.map((slot) => {
            const availableTeams = getAvailableTeamsForSlot(slots, slot);

            return (
              <section
                key={slot.matchNumber}
                className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)]"
              >
                <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="inline-flex rounded-full bg-[#7a1f2c]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#7a1f2c]">
                      Match {slot.matchNumber}
                    </div>
                    <h2 className="mt-3 text-xl font-semibold text-slate-950">{slot.venue}</h2>
                    <Round32SlotSchedule city={slot.city} kickoffAt={slot.kickoffAt} />
                  </div>

                  <p className="max-w-xl text-sm leading-6 text-slate-500">
                    Les sélections doivent rester uniques sur l&apos;ensemble du tour sélectionné.
                  </p>
                </div>

                <div className="mt-5 grid gap-4 lg:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-slate-700">Équipe A</span>
                    <select
                      name={`match_${slot.matchNumber}_a`}
                      defaultValue={slot.teamA}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#7a1f2c] focus:bg-white focus:ring-4 focus:ring-[#7a1f2c]/10"
                    >
                      <option value="">Sélectionner une équipe</option>
                      {availableTeams.map((team) => (
                        <option key={`${slot.matchNumber}-a-${team}`} value={team}>
                          {team}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-slate-700">Équipe B</span>
                    <select
                      name={`match_${slot.matchNumber}_b`}
                      defaultValue={slot.teamB}
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[#7a1f2c] focus:bg-white focus:ring-4 focus:ring-[#7a1f2c]/10"
                    >
                      <option value="">Sélectionner une équipe</option>
                      {availableTeams.map((team) => (
                        <option key={`${slot.matchNumber}-b-${team}`} value={team}>
                          {team}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </section>
            );
          })}

          <div className="flex flex-col items-start justify-between gap-4 rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-[0_16px_40px_rgba(15,23,42,0.06)] lg:flex-row lg:items-center">
            <p className="text-sm leading-6 text-slate-600">
              Après sauvegarde, les matchs du tour {selectedRound.label} sont réinjectés dans la table
              des matchs et réapparaissent dans la page publique des phases finales.
            </p>
            <button
              type="submit"
              className="rounded-full bg-[#7a1f2c] px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#5f1822]"
            >
              Enregistrer {selectedRound.label}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}