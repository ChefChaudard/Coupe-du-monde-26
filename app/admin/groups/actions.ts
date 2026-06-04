"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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
