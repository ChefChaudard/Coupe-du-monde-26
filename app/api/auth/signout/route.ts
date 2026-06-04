import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();

  await supabase.auth.signOut();

  const response = NextResponse.json({ ok: true });

  const cookieStore = await cookies();

  for (const cookie of cookieStore.getAll()) {
    if (!cookie.name.startsWith("sb-")) continue;

    response.cookies.set(cookie.name, "", {
      path: "/",
      expires: new Date(0),
    });
  }

  return response;
}