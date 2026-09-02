import type { Metadata } from "next";
export const dynamic = "force-dynamic";
export const revalidate = 0;

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
        <MobileLeaderboard />
      </div>
    </main>
  );
}