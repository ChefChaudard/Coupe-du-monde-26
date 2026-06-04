import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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

  const adminSupabase = createAdminClient();

  let groupMemberIds: Set<string> | null = null;

  if (groupId) {
    const { data: memberships, error: membershipError } = await adminSupabase
      .from("group_members")
      .select("user_id")
      .eq("group_id", groupId);

    if (membershipError) {
      return NextResponse.json(
        { error: membershipError.message },
        { status: 500 }
      );
    }

    groupMemberIds = new Set(
      (memberships ?? []).map((row: { user_id: string }) => row.user_id)
    );
  }

  const [{ data: predictions, error: predictionsError }, { data: profiles, error: profilesError }] = await Promise.all([
    adminSupabase
      .from("predictions")
      .select(`
        user_id,
        match_id,
        predicted_a,
        predicted_b,
        matches (
          phase,
          score_a,
          score_b,
          is_finished
        )
      `),
    adminSupabase.from("profiles").select("id, nickname"),
  ]);

  if (predictionsError) {
    return NextResponse.json({ error: predictionsError.message }, { status: 500 });
  }

  if (profilesError) {
    return NextResponse.json({ error: profilesError.message }, { status: 500 });
  }

  const payload = computeLeaderboardData(
    (predictions ?? []) as unknown as Parameters<typeof computeLeaderboardData>[0],
    (profiles ?? []) as unknown as Parameters<typeof computeLeaderboardData>[1],
    groupMemberIds
  );

  return NextResponse.json(payload);
}