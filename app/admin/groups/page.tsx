import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { isAdmin, isSuperAdmin } from "@/lib/roles";
import GroupMembershipMapper from "./GroupMembershipMapper";

type GroupRow = {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
};

type MembershipRow = {
  group_id: string;
  user_id: string;
  joined_at: string | null;
  profiles?: {
    id: string;
    nickname: string;
  }[];
};

async function createGroup(formData: FormData) {
  "use server";

  const supabase = await createClient();
  const adminSupabase = createAdminClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("roles, role, is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !isAdmin(profile)) {
    throw new Error("Accès administration refusé.");
  }

  const name = String(formData.get("name") ?? "").trim();

  if (!name) {
    throw new Error("Le nom du groupe est obligatoire.");
  }

  const { data: createdGroup, error: createError } = await adminSupabase
    .from("groups")
    .insert({ name, created_by: user.id })
    .select("id")
    .single();

  if (createError || !createdGroup) {
    throw new Error(createError?.message ?? "Impossible de créer le groupe.");
  }

  const { error: adminError } = await adminSupabase.from("group_admins").insert({
    group_id: createdGroup.id,
    user_id: user.id,
  });

  if (adminError) {
    throw new Error(adminError.message);
  }

  const { error: memberError } = await adminSupabase.from("group_members").upsert({
    group_id: createdGroup.id,
    user_id: user.id,
  });

  if (memberError) {
    throw new Error(memberError.message);
  }

  revalidatePath("/admin/groups");
}

async function renameGroup(formData: FormData) {
  "use server";

  const supabase = await createClient();
  const adminSupabase = createAdminClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("roles, role, is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !isAdmin(profile)) {
    throw new Error("Accès administration refusé.");
  }

  const groupId = String(formData.get("group_id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();

  if (!groupId || !name) {
    throw new Error("Groupe et nom sont obligatoires.");
  }

  const { data: allowedGroup } = await adminSupabase
    .from("group_admins")
    .select("group_id")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!allowedGroup && !isSuperAdmin(profile)) {
    throw new Error("Accès groupe refusé.");
  }

  const { error } = await adminSupabase
    .from("groups")
    .update({ name })
    .eq("id", groupId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/groups");
}

async function deleteGroup(formData: FormData) {
  "use server";

  const supabase = await createClient();
  const adminSupabase = createAdminClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("roles, role, is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !isAdmin(profile)) {
    throw new Error("Accès administration refusé.");
  }

  const groupId = String(formData.get("group_id") ?? "").trim();

  if (!groupId) {
    throw new Error("Groupe obligatoire.");
  }

  const { data: allowedGroup } = await adminSupabase
    .from("group_admins")
    .select("group_id")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!allowedGroup && !isSuperAdmin(profile)) {
    throw new Error("Accès groupe refusé.");
  }

  const { error } = await adminSupabase.from("groups").delete().eq("id", groupId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/admin/groups");
}

export default async function AdminGroupsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("roles, role, is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !isAdmin(profile)) {
    redirect("/dashboard");
  }

  const superAdmin = isSuperAdmin(profile);

  const adminSupabase = createAdminClient();

  const { data: adminGroups } = await adminSupabase
    .from("group_admins")
    .select("group_id")
    .eq("user_id", user.id);

  const managedGroupIds = (adminGroups ?? []).map((row: { group_id: string }) => row.group_id);

  const groupsQuery = superAdmin
    ? adminSupabase.from("groups").select("id, name, created_by, created_at").order("created_at", { ascending: false })
    : adminSupabase.from("groups").select("id, name, created_by, created_at").in("id", managedGroupIds).order("created_at", { ascending: false });

  const { data: groups, error: groupsError } = await groupsQuery;
  if (groupsError) {
    if (groupsError.message?.includes("Could not find the table 'public.groups'")) {
      throw new Error(
        "La table 'groups' est introuvable dans la base de données. Exécutez la migration SQL `scripts/migrate-groups-roles.sql` ou initialisez votre base Supabase."
      );
    }
    throw new Error(groupsError.message);
  }

  const groupIds = (groups ?? []).map((group: GroupRow) => group.id);

  const { data: memberships, error: membershipsError } = await adminSupabase
    .from("group_members")
    .select("group_id, user_id, joined_at, profiles(id, nickname)")
    .in("group_id", groupIds);

  if (membershipsError) {
    throw new Error(membershipsError.message);
  }

  const { data: usersData, error: usersError } = await adminSupabase.auth.admin.listUsers({
    perPage: 200,
  });

  if (usersError || !usersData) {
    throw new Error(usersError?.message ?? "Impossible de charger les comptes utilisateur.");
  }

  const userIds = usersData.users.map((existingUser) => existingUser.id);
  const { data: profileRows } = await adminSupabase
    .from("profiles")
    .select("id, nickname")
    .in("id", userIds);

  const profileMap = new Map(profileRows?.map((row: { id: string; nickname: string | null }) => [row.id, row.nickname]));

  const users = usersData.users.map((existingUser) => ({
    id: existingUser.id,
    email: existingUser.email ?? null,
    nickname: profileMap.get(existingUser.id) ?? existingUser.user_metadata?.nickname ?? null,
  }));

  const membershipsByGroup = new Map<string, MembershipRow[]>();
  (memberships ?? []).forEach((membership: MembershipRow) => {
    const groupList = membershipsByGroup.get(membership.group_id) ?? [];
    groupList.push(membership);
    membershipsByGroup.set(membership.group_id, groupList);
  });

  const membershipsByGroupData = Object.fromEntries(
    Array.from(membershipsByGroup.entries())
  );

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
        Seuls les administrateurs peuvent créer et modifier des groupes. La suppression d’un groupe ne supprime pas les utilisateurs, pronostics ou historiques.
      </div>

      <section className="rounded-2xl border p-6">
        <h1 className="mb-4 text-3xl font-bold">Créer un groupe</h1>

        <form action={createGroup} className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <label className="space-y-2 text-sm font-medium">
            <span>Nom du groupe</span>
            <input name="name" type="text" required className="w-full rounded border p-3" />
          </label>
          <button className="h-fit rounded bg-black px-4 py-3 text-white">Créer</button>
        </form>
      </section>

      <section className="rounded-2xl border p-6">
        <h2 className="mb-4 text-3xl font-bold">Modifier ou supprimer un groupe existant</h2>

        {groups && groups.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">
            Aucun groupe administré pour le moment. Créez un groupe ci-dessus pour le gérer depuis cette page.
          </div>
        ) : (
          <div className="grid gap-6">
            <form action={renameGroup} className="grid gap-4 lg:grid-cols-[1fr_auto]">
              <label className="space-y-2 text-sm font-medium">
                <span>Groupe</span>
                <select name="group_id" required className="w-full rounded border p-3">
                  {(groups ?? []).map((group: GroupRow) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2 text-sm font-medium">
                <span>Nouveau nom</span>
                <input name="name" type="text" required className="w-full rounded border p-3" />
              </label>

              <button className="h-fit rounded bg-slate-700 px-4 py-3 text-white">Renommer</button>
            </form>

            <form action={deleteGroup} className="grid gap-4 lg:grid-cols-[1fr_auto]">
              <label className="space-y-2 text-sm font-medium">
                <span>Groupe</span>
                <select name="group_id" required className="w-full rounded border p-3">
                  {(groups ?? []).map((group: GroupRow) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </label>

              <button className="h-fit rounded bg-red-600 px-4 py-3 text-white">Supprimer</button>
            </form>
          </div>
        )}
      </section>

      <GroupMembershipMapper
        groups={groups ?? []}
        users={users}
        membershipsByGroup={membershipsByGroupData}
      />
    </main>
  );
}
