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
    email?: string;
  };

  const firstName = normalizeField(payload.firstName);
  const lastName = normalizeField(payload.lastName);
  const email = normalizeField(payload.email).toLowerCase();

  if (!firstName || !lastName || !email) {
    return NextResponse.json(
      { error: "Prenom, nom et email sont obligatoires." },
      { status: 400 }
    );
  }

  const adminSupabase = createAdminClient();
  const temporaryPassword = `${crypto.randomUUID()}Aa1!`;

  const { data: createdUser, error: createError } = await adminSupabase.auth.admin.createUser({
    email,
    password: temporaryPassword,
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
    nickname: `${firstName} ${lastName}`.trim(),
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

  const redirectTo = new URL("/reset-password", request.nextUrl.origin).toString();
  const { error: recoveryError } = await adminSupabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  });

  return NextResponse.json({
    ok: true,
    warning: recoveryError
      ? "Le compte a ete cree, mais l'email de finalisation n'a pas pu etre envoye. Un admin pourra reinitialiser le mot de passe au besoin."
      : null,
  });
}