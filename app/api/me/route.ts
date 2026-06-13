import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_TIME_ZONE, getSafeTimeZone, isValidTimeZone } from "@/app/lib/time-zone";
import { getRoleLabels } from "@/lib/roles";

type GroupRow = {
  id: string;
  name: string;
};

type GroupRelationRow = {
  groups?: GroupRow | GroupRow[];
};

function firstGroup(value: GroupRelationRow["groups"]) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

export async function GET() {
  const supabase = await createClient();
  const adminSupabase = createAdminClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ user: null });
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("nickname, time_zone, role, roles, is_admin")
    .eq("id", user.id)
    .maybeSingle();

  const { data: memberships, error: membershipsError } = await adminSupabase
    .from("group_members")
    .select("group_id, groups(id, name)")
    .eq("user_id", user.id);

  const { data: adminMemberships, error: adminMembershipsError } = await adminSupabase
    .from("group_admins")
    .select("group_id, groups(id, name)")
    .eq("user_id", user.id);

  if (error) {
    console.error("Failed to fetch profile in /api/me:", error.message);
  }

  if (membershipsError) {
    console.error("Failed to fetch groups in /api/me:", membershipsError.message);
  }

  if (adminMembershipsError) {
    console.error("Failed to fetch admin groups in /api/me:", adminMembershipsError.message);
  }

  const groups = Array.from(
    new Map(
      [...(memberships ?? []), ...(adminMemberships ?? [])]
        .map((row: GroupRelationRow) => firstGroup(row.groups))
        .filter((group): group is GroupRow => Boolean(group))
        .map((group) => [group.id, group])
    ).values()
  );

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      nickname:
        profile?.nickname ??
        user.user_metadata?.nickname ??
        user.email?.split("@")[0] ??
        null,
      timeZone: getSafeTimeZone(profile?.time_zone),
      groups,
      roles: getRoleLabels(profile ?? undefined),
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  const query = profile
    ? supabase.from("profiles").update({ time_zone: timeZone }).eq("id", user.id)
    : supabase.from("profiles").insert({
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
