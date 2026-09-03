import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSuperAdmin } from "@/lib/roles";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Parametres points",
};

const SETTINGS = [
  {
    key: "points_1er_tour_enabled",
    label: "Matchs du 1er tour termines",
    description:
      "Active le calcul des points sur les pronostics de matchs de la phase de ligue.",
  },
  {
    key: "points_classement_equipes_enabled",
    label: "Classement equipes",
    description:
      "Active le calcul des points sur le classement des 36 equipes.",
  },
  {
    key: "points_qualifies_8emes_enabled",
    label: "Equipes qualifiees en 8emes",
    description:
      "Active le calcul des points sur les equipes pronostiquees en 8emes de finale.",
  },
  {
    key: "points_qualifies_autres_tours_enabled",
    label: "Equipes qualifiees (quarts, demi, finale, vainqueur)",
    description:
      "Active le calcul des points sur ces tours une fois les qualifies reellement connus.",
  },
] as const;

async function toggleSetting(key: string, nextValue: boolean) {
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

  if (!profile || !isSuperAdmin(profile)) {
    throw new Error("Accès super administrateur refusé.");
  }

  const adminClient = createAdminClient();

  const { error } = await adminClient
    .from("app_settings")
    .upsert({ key, value: nextValue ? "true" : "false" }, { onConflict: "key" });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/parametres-points");
}

export default async function ParametresPointsPage() {
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

  if (!profile || !isSuperAdmin(profile)) {
    redirect("/");
  }

  const { data: settingsRows } = await supabase
    .from("app_settings")
    .select("key, value")
    .in(
      "key",
      SETTINGS.map((setting) => setting.key)
    );

  const valueByKey = new Map(
    (settingsRows ?? []).map((row) => [row.key, row.value])
  );

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#7a1f2c]">
                SuperAdmin
              </p>
              <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">
                Parametres du calcul des points
              </h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Activez chaque bloc de calcul au fur et a mesure que les
                etapes de la competition se terminent reellement.
              </p>
            </div>
            <Link
              href="/"
              className="shrink-0 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              Accueil
            </Link>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <ul className="divide-y divide-slate-100">
            {SETTINGS.map((setting) => {
              const enabled = valueByKey.get(setting.key) === "true";

              return (
                <li
                  key={setting.key}
                  className="flex items-center justify-between gap-3 px-4 py-4"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {setting.label}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {setting.description}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${
                        enabled
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {enabled ? "Actif" : "Inactif"}
                    </span>
                    <form action={toggleSetting.bind(null, setting.key, !enabled)}>
                      <button
                        type="submit"
                        className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                      >
                        {enabled ? "Desactiver" : "Activer"}
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