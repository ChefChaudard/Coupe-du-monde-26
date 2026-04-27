import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let isAdmin = false;

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .single();

    isAdmin = !!profile?.is_admin;
  }

  return (
    <main className="p-8 max-w-3xl mx-auto space-y-6">
      <h1 className="text-4xl font-bold">
        Pronostics Coupe du Monde 2026
      </h1>

      <div className="flex gap-4">
        <Link
          href="/dashboard"
          className="rounded bg-blue-600 px-4 py-2 text-white"
        >
          Accéder au dashboard
        </Link>

        {isAdmin && (
          <Link
            href="/admin/security"
            className="rounded bg-red-700 px-4 py-2 text-white"
          >
            Administration sécurité
          </Link>
        )}
      </div>
    </main>
  );
}