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
  const isAdmin = String(formData.get("is_admin")) === "on";

  if (!email || !password || !nickname) {
    throw new Error("Email, mot de passe et pseudo obligatoires.");
  }

  const adminSupabase = createAdminClient();

  const { data: createdUser, error } = await adminSupabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) {
    throw new Error(error.message);
  }

  if (!createdUser.user) {
    throw new Error("Utilisateur non créé.");
  }

  await adminSupabase.from("profiles").upsert({
    id: createdUser.user.id,
    nickname,
    is_admin: isAdmin,
  });

  await adminSupabase.from("user_scores").upsert({
    user_id: createdUser.user.id,
    points: 0,
  });

  revalidatePath("/admin/users");
}

async function updateUser(formData: FormData) {
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

  const userId = String(formData.get("user_id") ?? "").trim();
  const nickname = String(formData.get("nickname") ?? "").trim();
  const isAdmin = String(formData.get("is_admin")) === "on";
  const password = String(formData.get("password") ?? "").trim();

  if (!userId || !nickname) {
    throw new Error("Utilisateur et pseudo obligatoires.");
  }

  const adminSupabase = createAdminClient();

  if (password) {
    const { error } = await adminSupabase.auth.admin.updateUserById(userId, {
      password,
    });
    if (error) {
      throw new Error(error.message);
    }
  }

  const { error: profileError } = await adminSupabase.from("profiles").upsert({
    id: userId,
    nickname,
    is_admin: isAdmin,
  });

  if (profileError) {
    throw new Error(profileError.message);
  }

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

  const adminSupabase = createAdminClient();
  const { data: usersData, error: usersError } = await adminSupabase.auth.admin.listUsers({
    perPage: 100,
  });

  if (usersError || !usersData) {
    throw new Error(usersError?.message ?? "Impossible de charger les utilisateurs.");
  }

  const userIds = usersData.users.map((existingUser) => existingUser.id);
  const { data: profileRows } = await adminSupabase
    .from("profiles")
    .select("id, nickname, is_admin")
    .in("id", userIds);

  const profileMap = new Map(profileRows?.map((row) => [row.id, row]));

  return (
    <main className="mx-auto max-w-6xl p-8 space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link href="/" className="text-blue-600 hover:underline">
          ← Accueil
        </Link>

        <Link href="/dashboard" className="text-blue-600 hover:underline">
          Dashboard →
        </Link>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
        Seuls les administrateurs peuvent créer et modifier des comptes.
      </div>

      <h1 className="mb-6 text-3xl font-bold">Créer un utilisateur</h1>

      <form action={createUser} className="space-y-4">
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

        <label className="flex items-center gap-3 text-sm font-medium">
          <input name="is_admin" type="checkbox" className="h-4 w-4 rounded border-gray-300" />
          Créer un compte administrateur
        </label>

        <button className="w-full rounded bg-black px-4 py-3 font-semibold text-white">
          Créer le compte
        </button>
      </form>

      <section className="rounded-2xl border p-6">
        <h2 className="mb-4 text-2xl font-bold">Comptes existants</h2>

        <div className="space-y-4">
          {usersData.users.map((existingUser) => {
            const profile = profileMap.get(existingUser.id);
            return (
              <form
                key={existingUser.id}
                action={updateUser}
                className="rounded-2xl border border-slate-200 bg-slate-50 p-5"
              >
                <input type="hidden" name="user_id" value={existingUser.id} />

                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm text-slate-500">ID utilisateur</p>
                    <p className="font-mono text-sm">{existingUser.id}</p>
                  </div>

                  <div className="text-right text-sm text-slate-600">
                    <p>{existingUser.email}</p>
                    <p className="mt-1">Créé le {new Date(existingUser.created_at).toLocaleDateString()}</p>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <label className="space-y-2 text-sm font-medium">
                    <span>Pseudo</span>
                    <input
                      name="nickname"
                      type="text"
                      defaultValue={profile?.nickname ?? ""}
                      required
                      className="w-full rounded border p-3"
                    />
                  </label>

                  <label className="space-y-2 text-sm font-medium">
                    <span>Mot de passe</span>
                    <input
                      name="password"
                      type="password"
                      placeholder="Laisser vide pour ne pas modifier"
                      className="w-full rounded border p-3"
                    />
                  </label>

                  <label className="flex items-center gap-3 text-sm font-medium">
                    <input
                      name="is_admin"
                      type="checkbox"
                      defaultChecked={profile?.is_admin ?? false}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    Compte admin
                  </label>
                </div>

                <button className="mt-4 rounded bg-black px-4 py-3 font-semibold text-white">
                  Mettre à jour le compte
                </button>
              </form>
            );
          })}
        </div>
      </section>
    </main>
  );
}