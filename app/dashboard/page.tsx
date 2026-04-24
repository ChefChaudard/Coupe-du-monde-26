import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PredictionForm from "./prediction-form";
import Leaderboard from "./leaderboard";

type MatchStats = {
  myPoints: number | null;
  averagePoints: number | null;
};

function getPointsForPrediction(
  predictedA: number,
  predictedB: number,
  actualA: number,
  actualB: number,
  isFinished: boolean | null
) {
  if (!isFinished) return 0;

  if (predictedA === actualA && predictedB === actualB) {
    return 3;
  }

  const predictedOutcome =
    predictedA > predictedB ? "A" : predictedA < predictedB ? "B" : "D";
  const actualOutcome =
    actualA > actualB ? "A" : actualA < actualB ? "B" : "D";

  if (predictedOutcome === actualOutcome) {
    return 1;
  }

  return 0;
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login");
  }

  const nickname =
    user.email?.split("@")[0] || `user_${user.id.slice(0, 8)}`;

  await supabase.from("profiles").upsert({
    id: user.id,
    nickname,
  });

  const { data: matches, error: matchesError } = await supabase
    .from("matches")
    .select("*")
    .order("kickoff_at", { ascending: true });

  const { data: predictions, error: predictionsError } = await supabase
    .from("predictions")
    .select("user_id, match_id, predicted_a, predicted_b");

  if (matchesError) {
    return (
      <main className="p-10">
        <h1 className="text-4xl font-bold mb-6">Tableau de bord</h1>
        <p>Erreur chargement matchs : {matchesError.message}</p>
      </main>
    );
  }

  if (predictionsError) {
    return (
      <main className="p-10">
        <h1 className="text-4xl font-bold mb-6">Tableau de bord</h1>
        <p>Erreur chargement pronostics : {predictionsError.message}</p>
      </main>
    );
  }

  const myPredictions = (predictions ?? []).filter((p) => p.user_id === user.id);

  const matchStats: Record<number, MatchStats> = {};

  for (const match of matches ?? []) {
    if (
      !match.is_finished ||
      match.score_a === null ||
      match.score_b === null
    ) {
      matchStats[match.id] = {
        myPoints: null,
        averagePoints: null,
      };
      continue;
    }

    const matchPredictions = (predictions ?? []).filter(
      (p) => p.match_id === match.id
    );

    if (matchPredictions.length === 0) {
      matchStats[match.id] = {
        myPoints: null,
        averagePoints: null,
      };
      continue;
    }

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
      allPoints.reduce<number>((sum, pts) => sum + pts, 0) / allPoints.length;

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

  return (
    <main className="p-10 max-w-7xl mx-auto">
      <h1 className="text-4xl font-bold mb-8">Tableau de bord</h1>

      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-8">
        <PredictionForm
          matches={matches ?? []}
          existingPredictions={myPredictions ?? []}
          userId={user.id}
          matchStats={matchStats}
        />

        <Leaderboard />
      </div>
    </main>
  );
}