import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureRoles, isAdmin, isSuperAdmin } from "@/lib/roles";
import AccountEmailField from "./AccountEmailField";

async function updateUser(formData: FormData) {
  "use server";

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("roles, role, is_admin")
    .eq("id", user.id)
    .single();

    if (!profile || !isAdmin(profile)) {
    throw new Error("Accès admin refusé.");
  }

  const canGrantAdmin = isSuperAdmin(profile);
  const canGrantSuperAdmin = isSuperAdmin(profile);

  const userId = String(formData.get("user_id") ?? "").trim();
  const email = String(formData.get("account_email") ?? "").trim().toLowerCase();
  const isAdminFlag = canGrantAdmin && String(formData.get("is_admin")) === "on";
  const isSuperAdminFlag = canGrantSuperAdmin && String(formData.get("is_super_admin")) === "on";
  const password = String(formData.get("password") ?? "").trim();

  if (!userId || !email) {
    throw new Error("Utilisateur et email obligatoires.");
  }

  const adminSupabase = createAdminClient();

  const { error: emailError } = await adminSupabase.auth.admin.updateUserById(userId, {
    email,
  });

  if (emailError) {
    throw new Error(emailError.message);
  }

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
    nickname: profile?.nickname ?? email.split("@")[0] ?? email,
    is_admin: isAdminFlag,
    roles: ensureRoles(undefined, isAdminFlag).concat(
      isSuperAdminFlag ? ["super_admin"] : []
    ),
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
    .select("roles, role, is_admin")
    .eq("id", user.id)
    .single();

    if (!profile || !isAdmin(profile)) {
    redirect("/dashboard");
  }

  const currentUserIsSuperAdmin = isSuperAdmin(profile);

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
    .select("id, nickname, is_admin, roles")
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
        Seuls les administrateurs peuvent modifier des comptes. Ce tableau sert aussi à définir un nouveau mot de passe pour un joueur qui en fait la demande.
      </div>

      <h1 className="mb-6 text-3xl font-bold">Comptes existants et mots de passe</h1>

      <section className="rounded-2xl border p-6">
        <h2 className="mb-4 text-2xl font-bold">Réinitialiser un mot de passe</h2>

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
                    <p className="font-semibold text-slate-900">
                      {profile?.nickname ?? existingUser.user_metadata?.nickname ?? "—"}
                    </p>
                    <p className="mt-1">Créé le {new Date(existingUser.created_at).toLocaleDateString()}</p>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <label className="space-y-2 text-sm font-medium">
                    <span>Userid / adresse mail</span>
                    <AccountEmailField
                      name="account_email"
                      initialEmail={existingUser.email ?? ""}
                    />
                  </label>

                  <label className="space-y-2 text-sm font-medium">
                    <span>Nouveau mot de passe</span>
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

                  {currentUserIsSuperAdmin && (
                    <label className="flex items-center gap-3 text-sm font-medium">
                      <input
                        name="is_super_admin"
                        type="checkbox"
                        defaultChecked={profile?.roles?.includes("super_admin") ?? false}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      Super Administrateur
                    </label>
                  )}
                </div>

                <button className="mt-4 rounded bg-black px-4 py-3 font-semibold text-white">
                  Enregistrer le compte
                </button>
              </form>
            );
          })}
        </div>
      </section>
    </main>
  );
}