import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const targetEmails = ["fabtrash49@gmail.com"];

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Variables Supabase manquantes dans .env.local");
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function deleteUserByEmail(user) {
  console.log(`Suppression: ${user.email}`);

  const userId = user.id;

  const { error: membershipError } = await supabase
    .from("group_members")
    .delete()
    .eq("user_id", userId);

  if (membershipError) throw membershipError;

  const { error: adminError } = await supabase
    .from("group_admins")
    .delete()
    .eq("user_id", userId);

  if (adminError) throw adminError;

  const { error: predictionsError } = await supabase
    .from("predictions")
    .delete()
    .eq("user_id", userId);

  if (predictionsError) throw predictionsError;

  const { error: scoresError } = await supabase
    .from("user_scores")
    .delete()
    .eq("user_id", userId);

  if (scoresError) throw scoresError;

  const { error: knockoutPredictionsError } = await supabase
    .from("knockout_predictions")
    .delete()
    .eq("user_id", userId);

  if (knockoutPredictionsError) throw knockoutPredictionsError;

  const { error: profileError } = await supabase
    .from("profiles")
    .delete()
    .eq("id", userId);

  if (profileError) throw profileError;

  const { error: deleteError } = await supabase.auth.admin.deleteUser(userId);

  if (deleteError) throw deleteError;
}

async function main() {
  const { data, error } = await supabase.auth.admin.listUsers();

  if (error) throw error;

  const users = data.users.filter((user) => targetEmails.includes(user.email ?? ""));

  if (users.length === 0) {
    console.log("Aucun compte correspondant trouvé.");
    return;
  }

  for (const user of users) {
    await deleteUserByEmail(user);
  }

  console.log(
    JSON.stringify(
      {
        deletedEmails: users.map((user) => user.email),
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