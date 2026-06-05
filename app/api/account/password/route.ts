import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const adminSupabase = createAdminClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return NextResponse.json({ error: "Non authentifie." }, { status: 401 });
  }

  const payload = (await request.json().catch(() => ({}))) as {
    oldPassword?: string;
    newPassword?: string;
  };

  const oldPassword = String(payload.oldPassword ?? "");
  const newPassword = String(payload.newPassword ?? "");

  if (!oldPassword || !newPassword) {
    return NextResponse.json(
      { error: "Veuillez remplir tous les champs." },
      { status: 400 }
    );
  }

  if (newPassword.length < 6) {
    return NextResponse.json(
      { error: "Le nouveau mot de passe doit contenir au moins 6 caractères." },
      { status: 400 }
    );
  }

  const { error: authError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: oldPassword,
  });

  if (authError) {
    return NextResponse.json(
      { error: "Ancien mot de passe incorrect." },
      { status: 400 }
    );
  }

  const { error: updateError } = await adminSupabase.auth.admin.updateUserById(
    user.id,
    {
      password: newPassword,
    }
  );

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
