import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureRoles } from "@/lib/roles";

function normalizeField(value: unknown) {
  return String(value ?? "").trim();
}

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch(() => ({}))) as {
    firstName?: string;
    lastName?: string;
    nickname?: string;
    email?: string;
    password?: string;
  };

  const firstName = normalizeField(payload.firstName);
  const lastName = normalizeField(payload.lastName);
  const nickname = normalizeField(payload.nickname);
  const email = normalizeField(payload.email).toLowerCase();
  const password = normalizeField(payload.password);

  if (!firstName || !lastName || !email || !password) {
    return NextResponse.json(
      { error: "Prenom, nom, email et mot de passe sont obligatoires." },
      { status: 400 }
    );
  }

  const adminSupabase = createAdminClient();
  const defaultGroupName = "7eme WC2026";

  const { data: createdUser, error: createError } = await adminSupabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      first_name: firstName,
      last_name: lastName,
    },
  });

  if (createError || !createdUser.user) {
    return NextResponse.json(
      { error: createError?.message ?? "Impossible de créer le compte." },
      { status: 400 }
    );
  }

  const { error: profileError } = await adminSupabase.from("profiles").upsert({
    id: createdUser.user.id,
    nickname: nickname || `${firstName} ${lastName}`.trim(),
    roles: ensureRoles(undefined, false),
  });

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  const { error: scoreError } = await adminSupabase.from("user_scores").upsert({
    user_id: createdUser.user.id,
    points: 0,
  });

  if (scoreError) {
    return NextResponse.json({ error: scoreError.message }, { status: 500 });
  }

  const { data: defaultGroup, error: groupError } = await adminSupabase
    .from("groups")
    .select("id")
    .eq("name", defaultGroupName)
    .maybeSingle();

  if (groupError) {
    return NextResponse.json({ error: groupError.message }, { status: 500 });
  }

  let targetGroupId = defaultGroup?.id ?? null;

  if (!targetGroupId) {
    const { data: createdGroup, error: createGroupError } = await adminSupabase
      .from("groups")
      .insert({ name: defaultGroupName, created_by: null })
      .select("id")
      .single();

    if (createGroupError || !createdGroup) {
      return NextResponse.json(
        { error: createGroupError?.message ?? "Impossible de créer le groupe par défaut." },
        { status: 500 }
      );
    }

    targetGroupId = createdGroup.id;
  }

  const { error: membershipError } = await adminSupabase.from("group_members").upsert({
    group_id: targetGroupId,
    user_id: createdUser.user.id,
  });

  if (membershipError) {
    return NextResponse.json({ error: membershipError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
  });
}