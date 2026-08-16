const { createClient } = require("@supabase/supabase-js");

let client = null;
function db() {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Supabase não configurado (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes)");
    client = createClient(url, key);
  }
  return client;
}

async function kvGet(key) {
  const { data, error } = await db().from("kv_store").select("value").eq("key", key).maybeSingle();
  if (error) throw error;
  return data ? data.value : null;
}

async function kvSet(key, value) {
  const { error } = await db().from("kv_store").upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) throw error;
}

module.exports = { kvGet, kvSet };
