import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import PredictionForm from "./prediction-form";
import Leaderboard from "./leaderboard";
import PhaseLeaderboard from "./phase-leaderboard";

type MatchStats = {
  myPoints: number | null;
  averagePoints: number | null;
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

function getPointsForPrediction(
  predictedA: number,
  predictedB: number,
  actualA: number,
  actualB: number,
  isFinished: boolean | null
) {
  if (!isFinished) return 0;
  if (predictedA === actualA && predictedB === actualB) return 3;

  const predictedOutcome =
    predictedA > predictedB ? "A" : predictedA < predictedB ? "B" : "D";
  const actualOutcome =
    actualA > actualB ? "A" : actualA < actualB ? "B" : "D";

  return predictedOutcome === actualOutcome ? 1 : 0;
}

function buildGroupStandings(matches: Match[]) {
  const standings: Record<string, GroupStandingRow[]> = {};

  for (const match of matches) {
    const groupName = match.phase;

    if (!groupName) continue;
    if (!match.is_finished) continue;
    if (match.score_a === null || match.score_b === null) continue;

    if (!standings[groupName]) {
      standings[groupName] = [];
    }

    const getOrCreateTeam = (team: string) => {
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

    const teamA = getOrCreateTeam(match.team_a);
    const teamB = getOrCreateTeam(match.team_b);

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

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) redirect("/login");

  const nickname = user.email?.split("@")[0] || `user_${user.id.slice(0, 8)}`;

  await supabase.from("profiles").upsert({
    id: user.id,
    nickname,
  });

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  const isAdmin = profile?.is_admin === true;

  const { data: matches } = await supabase
    .from("matches")
    .select("*")
    .order("kickoff_at", { ascending: true });

  const { data: predictions } = await supabase
    .from("predictions")
    .select("user_id, match_id, predicted_a, predicted_b");

  const myPredictions = (predictions ?? []).filter(
    (p) => p.user_id === user.id
  );

  const matchStats: Record<number, MatchStats> = {};
  const groupStandings = buildGroupStandings(matches ?? []);

  for (const match of matches ?? []) {
    if (!match.is_finished || match.score_a === null || match.score_b === null) {
      matchStats[match.id] = {
        myPoints: null,
        averagePoints: null,
      };
      continue;
    }

    const matchPredictions = (predictions ?? []).filter(
      (p) => p.match_id === match.id
    );

    const allPoints = matchPredictions.map((prediction) =>
      getPointsForPrediction(
        prediction.predicted_a,
        prediction.predicted_b,
        match.score_a,
        match.score_b,
        match.is_finished
      )
    );

    const averagePoints =
      allPoints.reduce<number>((sum, pts) => sum + pts, 0) /
      (allPoints.length || 1);

    const myPrediction = matchPredictions.find((p) => p.user_id === user.id);

    const myPoints = myPrediction
      ? getPointsForPrediction(
          myPrediction.predicted_a,
          myPrediction.predicted_b,
          match.score_a,
          match.score_b,
          match.is_finished
        )
      : null;

    matchStats[match.id] = {
      myPoints,
      averagePoints,
    };
  }

  async function updateMatchResult(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/login");

    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .single();

    if (!profile?.is_admin) {
      throw new Error("Accès admin refusé");
    }

    const matchId = Number(formData.get("match_id"));
    const scoreA = Number(formData.get("score_a"));
    const scoreB = Number(formData.get("score_b"));

    await supabase
      .from("matches")
      .update({
        score_a: scoreA,
        score_b: scoreB,
        is_finished: true,
      })
      .eq("id", matchId);

    revalidatePath("/dashboard");
  }

  return (
    <main className="p-6 max-w-[1800px] mx-auto space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_280px] gap-6">
        <section>
          <PredictionForm
            matches={matches ?? []}
            existingPredictions={myPredictions}
            userId={user.id}
            userEmail={user.email ?? ""}
            matchStats={matchStats}
            isAdmin={isAdmin}
            updateMatchResult={updateMatchResult}
            groupStandings={groupStandings}
          />
        </section>

        <section>
          <h2 className="text-2xl font-bold mb-4 text-red-600">Classement live</h2>
          <Leaderboard />

          <div className="mt-6">
            <PhaseLeaderboard />
          </div>
        </section>
      </div>
    </main>
  );
}