import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Paiement requis",
};

async function handleSignOut() {
  "use server";
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export default async function PaiementRequisPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-8 text-slate-900">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#7a1f2c]">
          Acces restreint
        </p>
        <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">
          Paiement requis
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          L&apos;acces a la competition necessite le paiement de la
          participation. Contactez l&apos;organisateur pour regulariser
          votre statut.
        </p>
        <form action={handleSignOut} className="mt-6">
          <button
            type="submit"
            className="rounded-full border border-slate-300 bg-white px-5 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            Se deconnecter
          </button>
        </form>
      </section>
    </main>
  );
}