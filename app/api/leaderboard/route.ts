import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "@/lib/supabase/fetch-all-rows";
import { computeLeaderboardData } from "@/app/dashboard/leaderboard-data";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const groupId = url.searchParams.get("groupId");

  let groupMemberIds: Set<string> | null = null;

  const loadLeaderboard = async (useAdminClient: boolean) => {
    let client = supabase;

    if (useAdminClient) {
      try {
        client = createAdminClient();
      } catch {
        client = supabase;
      }
    }

    if (groupId) {
      try {
        const { data: memberships } = await client
          .from("group_members")
          .select("user_id")
          .eq("group_id", groupId);

        groupMemberIds = new Set(
          (memberships ?? []).map((row: { user_id: string }) => row.user_id)
        );
      } catch {
        groupMemberIds = null;
      }
    }

    const [{ data: predictions, error: predictionsError }, { data: profiles, error: profilesError }, { data: matches, error: matchesError }, { data: knockoutPredictions, error: knockoutPredictionsError }] = await Promise.all([
      fetchAllRows<{
        user_id: string;
        match_id: number;
        predicted_a: number;
        predicted_b: number;
      }>(() =>
        client
          .from("predictions")
          .select(`
            user_id,
            match_id,
            predicted_a,
            predicted_b
          `)
          .order("match_id", { ascending: true })
          .order("user_id", { ascending: true })
      ),
      client.from("profiles").select("id, nickname"),
      client
        .from("matches")
        .select("id, phase, team_a, team_b, kickoff_at, venue, city, score_a, score_b, is_finished"),
      fetchAllRows<{
        user_id: string;
        match_key: string;
        team_a: string | null;
        team_b: string | null;
        winner: string | null;
        round: string | null;
      }>(() =>
        client
          .from("knockout_predictions")
          .select("user_id, match_key, team_a, team_b, winner, round")
          .order("match_key", { ascending: true })
          .order("user_id", { ascending: true })
      ),
    ]);

    return { predictions, profiles, matches, knockoutPredictions, predictionsError, profilesError, matchesError, knockoutPredictionsError };
  };

  let leaderboardData = await loadLeaderboard(true);

  if (leaderboardData.predictionsError || leaderboardData.profilesError || leaderboardData.matchesError || leaderboardData.knockoutPredictionsError) {
    leaderboardData = await loadLeaderboard(false);
  }

  const { predictions, profiles, matches, knockoutPredictions, predictionsError, profilesError, matchesError, knockoutPredictionsError } = leaderboardData;

  if (predictionsError) {
    return NextResponse.json({ error: predictionsError.message }, { status: 500 });
  }

  if (profilesError) {
    return NextResponse.json({ error: profilesError.message }, { status: 500 });
  }

  if (matchesError) {
    return NextResponse.json({ error: matchesError.message }, { status: 500 });
  }

  if (knockoutPredictionsError) {
    return NextResponse.json({ error: knockoutPredictionsError.message }, { status: 500 });
  }

  const matchesById = new Map(
    (matches ?? []).map((match: { id: number; phase: string; team_a: string; team_b: string; kickoff_at?: string | null; venue?: string | null; city?: string | null; score_a: number | null; score_b: number | null; is_finished: boolean | null }) => [match.id, match])
  );

  const predictionsWithMatches = (predictions ?? []).map(
    (prediction: { user_id: string; match_id: number; predicted_a: number; predicted_b: number }) => ({
      ...prediction,
      matches: matchesById.get(prediction.match_id) ?? null,
    })
  );

  const payload = computeLeaderboardData(
    predictionsWithMatches as unknown as Parameters<typeof computeLeaderboardData>[0],
    (profiles ?? []) as unknown as Parameters<typeof computeLeaderboardData>[1],
    groupMemberIds,
    (knockoutPredictions ?? []) as unknown as Parameters<typeof computeLeaderboardData>[3],
    (matches ?? []) as unknown as Parameters<typeof computeLeaderboardData>[4]
  );

  return NextResponse.json(payload);
}