import Link from "next/link";
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

    const myPrediction = matchPredictions.find(
      (p) => p.user_id === user.id
    );

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

  // ✅ 👉 FORMATAGE DATE (IMPORTANT : AVANT return)
  const simulatedDate = new Date();

  const day = simulatedDate.getDate().toString().padStart(2, "0");

  const monthRaw = simulatedDate.toLocaleDateString("fr-FR", {
    month: "long",
  });

  const month = monthRaw.charAt(0).toLowerCase() + monthRaw.slice(1);

  const hours = simulatedDate.getHours().toString().padStart(2, "0");
  const minutes = simulatedDate.getMinutes().toString().padStart(2, "0");

  const formattedDate = `${day} ${month} - ${hours}h${minutes}`;

  return (
    <main className="p-10 max-w-7xl mx-auto space-y-6">
      {/* NAV */}
      <div className="flex justify-between items-center">
        <Link
          href="/"
          className="text-blue-600 hover:underline font-medium"
        >
          ← Retour à l’accueil
        </Link>

        <span className="text-sm text-gray-500">
          {user.email}
        </span>
      </div>

      {/* ✅ TITRE CORRIGÉ */}
      <h1 className="text-4xl font-bold">
        Tableau de bord au {formattedDate}
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-8">
        <PredictionForm
          matches={matches ?? []}
          existingPredictions={myPredictions}
          userId={user.id}
          matchStats={matchStats}
        />

        <Leaderboard />
      </div>
    </main>
  );
}