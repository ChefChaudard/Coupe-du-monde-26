import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_TIME_ZONE, getSafeTimeZone, isValidTimeZone } from "@/app/lib/time-zone";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ user: null });
  }

  const adminSupabase = createAdminClient();
  const { data: profile } = await adminSupabase
    .from("profiles")
    .select("nickname, time_zone")
    .eq("id", user.id)
    .maybeSingle();

  return NextResponse.json({
    user: {
      email: user.email,
      nickname:
        profile?.nickname ??
        user.user_metadata?.nickname ??
        user.email?.split("@")[0] ??
        null,
      timeZone: getSafeTimeZone(profile?.time_zone),
    },
  });
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifie." }, { status: 401 });
  }

  const payload = (await request.json()) as { timeZone?: string };
  const timeZone = payload.timeZone ?? DEFAULT_TIME_ZONE;

  if (!isValidTimeZone(timeZone)) {
    return NextResponse.json({ error: "Fuseau horaire invalide." }, { status: 400 });
  }

  const adminSupabase = createAdminClient();
  const { data: profile } = await adminSupabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  const query = profile
    ? adminSupabase
        .from("profiles")
        .update({ time_zone: timeZone })
        .eq("id", user.id)
    : adminSupabase.from("profiles").insert({
        id: user.id,
        nickname: user.email?.split("@")[0] ?? `user_${user.id.slice(0, 8)}`,
        time_zone: timeZone,
      });

  const { error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ timeZone });
}
