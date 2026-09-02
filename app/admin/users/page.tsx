import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { listAdminUsers } from "@/lib/supabase/admin-users";
import { isAdmin } from "@/lib/roles";
import PasswordResetPanel from "./PasswordResetPanel";

async function updateUser(formData: FormData) {
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
    throw new Error("Accès admin refusé.");
  }

  const userId = String(formData.get("user_id") ?? "").trim();
  const password = String(formData.get("password") ?? "").trim();

  if (!userId) {
    throw new Error("Utilisateur obligatoire.");
  }

  if (!password) {
    throw new Error("Nouveau mot de passe obligatoire.");
  }

  const adminSupabase = createAdminClient();

  const { error } = await adminSupabase.auth.admin.updateUserById(userId, {
    password,
  });

  if (error) {
    throw new Error(error.message);
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
    .select("roles, role, is_admin, nickname")
    .eq("id", user.id)
    .single();

    if (!profile || !isAdmin(profile)) {
    redirect("/dashboard");
  }

  const adminUsers = await listAdminUsers(200);
  const { data: userRows, error: profilesError } = await supabase
    .from("profiles")
    .select("id, nickname, is_admin, roles")
    .order("id", { ascending: true });

  if (profilesError || !userRows) {
    throw new Error(profilesError?.message ?? "Impossible de charger les comptes utilisateur.");
  }

  const authUserMap = new Map(adminUsers.map((authUser) => [authUser.id, authUser]));
  const managedUsers = userRows
    .map((existingUser) => {
      const authUser = authUserMap.get(existingUser.id);

      return {
        id: existingUser.id,
        nickname: existingUser.nickname ?? "",
        isAdmin: existingUser.is_admin ?? false,
        email: authUser?.email ?? existingUser.id,
      };
    })
    .sort((left, right) => left.email.localeCompare(right.email));

return (
    <main className="mx-auto max-w-6xl p-8 space-y-8">
      <h1 className="mb-6 text-3xl font-bold">Comptes existants et mots de passe</h1>

      <section className="rounded-2xl border p-6">
        <h2 className="mb-4 text-2xl font-bold">Réinitialiser un mot de passe</h2>
        <PasswordResetPanel users={managedUsers} action={updateUser} />
      </section>
    </main>
  );
}