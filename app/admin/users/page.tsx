import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

async function createUser(formData: FormData) {
  "use server";

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) {
    throw new Error("Accès admin refusé.");
  }

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "").trim();
  const nickname = String(formData.get("nickname") ?? "").trim();

  if (!email || !password || !nickname) {
    throw new Error("Email, mot de passe et pseudo obligatoires.");
  }

  const adminSupabase = createAdminClient();

  const { data: createdUser, error } = await adminSupabase.auth.admin.createUser(
    {
      email,
      password,
      email_confirm: true,
    }
  );

  if (error) {
    throw new Error(error.message);
  }

  if (!createdUser.user) {
    throw new Error("Utilisateur non créé.");
  }

  await adminSupabase.from("profiles").upsert({
    id: createdUser.user.id,
    nickname,
    is_admin: false,
  });

  await adminSupabase.from("user_scores").upsert({
    user_id: createdUser.user.id,
    points: 0,
  });

  revalidatePath("/admin/users");
}

export default async function AdminUsersPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) {
    redirect("/dashboard");
  }

  return (
    <main className="mx-auto max-w-xl p-8">
      <div className="mb-8 flex items-center justify-between">
        <Link href="/" className="text-blue-600 hover:underline">
          ← Accueil
        </Link>

        <Link href="/dashboard" className="text-blue-600 hover:underline">
          Dashboard →
        </Link>
      </div>

      <h1 className="mb-6 text-3xl font-bold">Créer un utilisateur</h1>

      <form action={createUser} className="space-y-4 rounded-2xl border p-6">
        <div>
          <label className="mb-1 block text-sm font-medium">Pseudo</label>
          <input
            name="nickname"
            type="text"
            required
            placeholder="ex: fabrice"
            className="w-full rounded border p-3"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">
            Email / identifiant
          </label>
          <input
            name="email"
            type="email"
            required
            placeholder="ami@email.com"
            className="w-full rounded border p-3"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">
            Mot de passe
          </label>
          <input
            name="password"
            type="password"
            required
            minLength={6}
            placeholder="Mot de passe"
            className="w-full rounded border p-3"
          />
        </div>

        <button className="w-full rounded bg-black px-4 py-3 font-semibold text-white">
          Créer le compte
        </button>
      </form>
    </main>
  );
}