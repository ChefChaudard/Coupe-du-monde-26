import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const defaultGroupName = "7eme WC2026";

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Variables Supabase manquantes dans .env.local");
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function main() {
  const { data: groups, error: groupsError } = await supabase
    .from("groups")
    .select("id, name, created_by, created_at")
    .eq("name", defaultGroupName)
    .order("created_at", { ascending: true });

  if (groupsError) throw groupsError;

  let targetGroup = groups?.[0] ?? null;

  if (!targetGroup) {
    const { data: firstProfile, error: firstProfileError } = await supabase
      .from("profiles")
      .select("id")
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (firstProfileError) throw firstProfileError;

    const { data: createdGroup, error: createError } = await supabase
      .from("groups")
      .insert({ name: defaultGroupName, created_by: firstProfile?.id ?? null })
      .select("id, name")
      .single();

    if (createError || !createdGroup) {
      throw createError ?? new Error("Impossible de creer le groupe par defaut.");
    }

    targetGroup = createdGroup;
  }

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id");

  if (profilesError) throw profilesError;

  const profileIds = (profiles ?? []).map((row) => row.id).filter(Boolean);

  const { data: groupsToDelete, error: groupsToDeleteError } = await supabase
    .from("groups")
    .select("id, name")
    .neq("id", targetGroup.id);

  if (groupsToDeleteError) throw groupsToDeleteError;

  if ((groupsToDelete ?? []).length > 0) {
    const { error: deleteGroupsError } = await supabase
      .from("groups")
      .delete()
      .neq("id", targetGroup.id);

    if (deleteGroupsError) throw deleteGroupsError;
  }

  if (profileIds.length > 0) {
    const membershipRows = profileIds.map((userId) => ({
      group_id: targetGroup.id,
      user_id: userId,
    }));

    const { error: membershipError } = await supabase
      .from("group_members")
      .upsert(membershipRows, { onConflict: "group_id,user_id" });

    if (membershipError) throw membershipError;
  }

  console.log(
    JSON.stringify(
      {
        group: targetGroup.name,
        groupId: targetGroup.id,
        profilesAffected: profileIds.length,
        groupsRemoved: (groupsToDelete ?? []).length,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});