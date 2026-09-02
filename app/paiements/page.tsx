import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/roles";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Statut de paiement",
};

async function togglePaidStatus(userId: string, nextValue: boolean) {
  "use server";

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("roles, role, is_admin, nickname")
    .eq("id", user.id)
    .single();

  if (!profile || !isAdmin(profile)) {
    throw new Error("Accès administrateur refusé.");
  }

  const adminClient = createAdminClient();

  const { error } = await adminClient
    .from("profiles")
    .update({ has_paid: nextValue })
    .eq("id", userId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/paiements");
}

type PlayerRow = {
  id: string;
  nickname: string | null;
  has_paid: boolean | null;
};

export default async function PaiementsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("roles, role, is_admin, nickname")
    .eq("id", user.id)
    .single();

  if (!profile || !isAdmin(profile)) {
    redirect("/");
  }

  const { data: playersData } = await supabase
    .from("profiles")
    .select("id, nickname, has_paid")
    .order("nickname", { ascending: true });

  const players = (playersData ?? []) as PlayerRow[];
  const paidCount = players.filter((player) => player.has_paid).length;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#7a1f2c]">
                Admin
              </p>
              <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">
                Statut de paiement
              </h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Suivi du paiement de la participation pour chaque joueur.
                Non paye par defaut.
              </p>
            </div>
            <Link
              href="/"
              className="shrink-0 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              Accueil
            </Link>
          </div>

          <p className="mt-4 text-sm font-semibold text-slate-900">
            {paidCount} / {players.length} joueur
            {players.length > 1 ? "s" : ""} paye
            {paidCount > 1 ? "s" : ""}
          </p>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <ul className="divide-y divide-slate-100">
            {players.map((player) => {
              const hasPaid = player.has_paid ?? false;

              return (
                <li
                  key={player.id}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <span className="text-sm font-semibold text-slate-900">
                    {player.nickname || "Joueur"}
                  </span>

                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${
                        hasPaid
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {hasPaid ? "Paye" : "Non paye"}
                    </span>

                    <form action={togglePaidStatus.bind(null, player.id, !hasPaid)}>
                      <button
                        type="submit"
                        className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                      >
                        Marquer {hasPaid ? "non paye" : "paye"}
                      </button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </main>
  );
}