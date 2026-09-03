import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdmin, isSuperAdmin } from "@/lib/roles";

export const metadata: Metadata = {
  title: "Accueil",
};

async function handleSignOut() {
  "use server";
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export default async function Home() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let canManageAdmin = false;
  let canManageSuperAdmin = false;

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("roles, role, is_admin, nickname")
      .eq("id", user.id)
      .maybeSingle();

    canManageAdmin = isAdmin(profile ?? undefined);
    canManageSuperAdmin = isSuperAdmin(profile ?? undefined);
  }

  return (
    <main className="py-8 sm:py-10">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        {/* Bloc Général */}
        <section className="rounded-3xl border border-slate-200 bg-white/85 p-8 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
            Général
          </h2>

          <div className="mt-4 flex flex-wrap gap-3">
              <Link
                href="/groupes/mobile"
                className="rounded-full bg-slate-900 px-6 py-3 font-semibold text-white shadow-sm transition hover:bg-slate-800"
              >
                CL 26-27
              </Link>

            {user ? (
              <Link
                href="/account/password"
                className="rounded-full border border-slate-300 bg-white px-6 py-3 font-semibold text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-50"
              >
                Changer mon mot de passe
              </Link>
            ) : null}

            {user ? (
              <form action={handleSignOut}>
                <button
                  type="submit"
                  className="rounded-full border border-slate-300 bg-white px-6 py-3 font-semibold text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-50"
                >
                  Déconnexion
                </button>
              </form>
            ) : null}

            <Link
              href="/world-cup-26/classement"
              className="rounded-full bg-slate-300 px-6 py-3 font-semibold text-slate-900 shadow-sm transition hover:bg-slate-400"
            >
              World Cup 26
            </Link>
          </div>
        </section>

        {/* Bloc Admin */}
        {canManageAdmin ? (
          <section className="rounded-3xl border border-slate-200 bg-white/85 p-8 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
            <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
              Admin
            </h2>

            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                href="/admin/users"
                className="rounded-full border border-slate-300 bg-white px-6 py-3 font-semibold text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-50"
              >
                Comptes et mots de passe
              </Link>

              <Link
                href="/paiements"
                className="rounded-full bg-emerald-700 px-6 py-3 font-semibold text-white shadow-sm transition hover:bg-emerald-800"
              >
                Payé
              </Link>
            </div>
          </section>
        ) : null}

        {/* Bloc Super Admin */}
        {canManageSuperAdmin ? (
          <section className="rounded-3xl border border-slate-200 bg-white/85 p-8 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur">
            <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
              Super Admin
            </h2>

            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                href="/admin/groups"
                className="rounded-full border border-slate-300 bg-white px-6 py-3 font-semibold text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-50"
              >
                Créer / gérer groupes
              </Link>
                <Link
                  href="/parametres-points"
                  className="rounded-full border border-slate-300 bg-white px-6 py-3 font-semibold text-slate-900 shadow-sm transition hover:border-slate-400 hover:bg-slate-50"
                >
                  Parametres Points
                </Link>
              <Link
                href="/administration"
                className="rounded-full bg-slate-900 px-6 py-3 font-semibold text-white shadow-sm transition hover:bg-slate-800"
              >
                Administration
              </Link>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}