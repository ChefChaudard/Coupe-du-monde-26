import type { Metadata } from "next";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import MobileLeaderboard from "./MobileLeaderboard";

export const metadata: Metadata = {
  title: "Mobile Classement",
};

export default async function MobileLeaderboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) redirect("/login");

  return (
    <main className="min-h-screen bg-slate-50 px-3 py-4 text-slate-900">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        <section className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-700">
            Mobile
          </p>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">
            Classement
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Vue optimisée pour mobile. Touchez un joueur pour voir le détail de
            ses points.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/dashboard?tab=groupes"
              className="inline-flex items-center justify-center rounded-full bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800"
            >
              Vue groupes
            </Link>
            <Link
              href="/groupes/mobile"
              className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              Mobile T1
            </Link>
          </div>
        </section>

        <MobileLeaderboard />
      </div>
    </main>
  );
}
