"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { listAdminUsers } from "@/lib/supabase/admin-users";
import { isAdmin, isSuperAdmin } from "@/lib/roles";

async function ensureAdmin() {
  const supabase = await createClient();
  const adminSupabase = createAdminClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("roles, role, is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !isAdmin(profile)) {
    throw new Error("Accès administration refusé.");
  }

  return { user, profile, adminSupabase };
}

export async function addGroupMemberById(formData: FormData) {
  const { user, profile, adminSupabase } = await ensureAdmin();

  const groupId = String(formData.get("group_id") ?? "").trim();
  const userId = String(formData.get("user_id") ?? "").trim();
  const isGroupAdmin = String(formData.get("is_group_admin")) === "on";

  if (!groupId || !userId) {
    throw new Error("Groupe et utilisateur obligatoires.");
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

  const { error: membershipError } = await adminSupabase.from("group_members").upsert({
    group_id: groupId,
    user_id: userId,
  });

  if (membershipError) {
    throw new Error(membershipError.message);
  }

  if (isGroupAdmin) {
    const { error: adminError } = await adminSupabase.from("group_admins").upsert({
      group_id: groupId,
      user_id: userId,
    });

    if (adminError) {
      throw new Error(adminError.message);
    }
  }

  revalidatePath("/admin/groups");
}

export async function removeGroupMemberById(formData: FormData) {
  const { user, profile, adminSupabase } = await ensureAdmin();

  const groupId = String(formData.get("group_id") ?? "").trim();
  const userId = String(formData.get("user_id") ?? "").trim();

  if (!groupId || !userId) {
    throw new Error("Groupe et utilisateur obligatoires.");
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

  const { error: membershipError } = await adminSupabase
    .from("group_members")
    .delete()
    .eq("group_id", groupId)
    .eq("user_id", userId);

  if (membershipError) {
    throw new Error(membershipError.message);
  }

  const { error: adminError } = await adminSupabase
    .from("group_admins")
    .delete()
    .eq("group_id", groupId)
    .eq("user_id", userId);

  if (adminError) {
    throw new Error(adminError.message);
  }

  revalidatePath("/admin/groups");
}

export async function resetGroupsToDefault(formData: FormData) {
  const { user, profile, adminSupabase } = await ensureAdmin();

  if (!isSuperAdmin(profile)) {
    throw new Error("Cette action est réservée aux super administrateurs.");
  }

  const defaultGroupName = String(formData.get("default_group_name") ?? "").trim();

  if (defaultGroupName !== "7eme WC2026") {
    throw new Error("Le groupe par défaut doit être '7eme WC2026'.");
  }

  const { data: existingGroup, error: groupLookupError } = await adminSupabase
    .from("groups")
    .select("id, name, created_by, created_at")
    .eq("name", defaultGroupName)
    .maybeSingle();

  if (groupLookupError) {
    throw new Error(groupLookupError.message);
  }

  if (!existingGroup) {
    const { data: createdGroup, error: createError } = await adminSupabase
      .from("groups")
      .insert({ name: defaultGroupName, created_by: user.id })
      .select("id")
      .single();

    if (createError || !createdGroup) {
      throw new Error(createError?.message ?? "Impossible de créer le groupe par défaut.");
    }
  }

  const { data: groupRow, error: groupRowError } = await adminSupabase
    .from("groups")
    .select("id")
    .eq("name", defaultGroupName)
    .single();

  if (groupRowError || !groupRow) {
    throw new Error(groupRowError?.message ?? "Impossible de retrouver le groupe par défaut.");
  }

  const users = await listAdminUsers(1000);
  const userIds = users.map((user) => user.id);

  const { error: cleanupMembershipError } = await adminSupabase
    .from("group_members")
    .delete()
    .neq("group_id", groupRow.id);

  if (cleanupMembershipError) {
    throw new Error(cleanupMembershipError.message);
  }

  const { error: cleanupAdminError } = await adminSupabase
    .from("group_admins")
    .delete()
    .neq("group_id", groupRow.id);

  if (cleanupAdminError) {
    throw new Error(cleanupAdminError.message);
  }

  const { error: deleteGroupsError } = await adminSupabase
    .from("groups")
    .delete()
    .neq("id", groupRow.id);

  if (deleteGroupsError) {
    throw new Error(deleteGroupsError.message);
  }

  const memberships = userIds.map((userId) => ({
    group_id: groupRow.id,
    user_id: userId,
  }));

  const { error: memberInsertError } = await adminSupabase
    .from("group_members")
    .upsert(memberships, { onConflict: "group_id,user_id" });

  if (memberInsertError) {
    throw new Error(memberInsertError.message);
  }

  revalidatePath("/admin/groups");
}
