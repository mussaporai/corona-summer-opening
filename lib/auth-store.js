const crypto = require("crypto");
const { kvGet, kvSet } = require("./db");

const AUTH_KEY = "corona:auth";

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(":")) return false;
  const [salt, hash] = stored.split(":");
  const check = crypto.scryptSync(password, salt, 64).toString("hex");
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(check, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function getAuthStore() {
  const data = await kvGet(AUTH_KEY);
  return data || { users: {} };
}

async function saveAuthStore(data) {
  await kvSet(AUTH_KEY, data);
}

async function getUserAuth(email) {
  const store = await getAuthStore();
  return store.users[email.toLowerCase()] || null;
}

async function setUserPassword(email, password, mustChangePassword) {
  const store = await getAuthStore();
  const key = email.toLowerCase();
  const existing = store.users[key] || {};
  store.users[key] = {
    ...existing,
    passwordHash: hashPassword(password),
    mustChangePassword: !!mustChangePassword,
    updatedAt: Date.now(),
    createdAt: existing.createdAt || Date.now()
  };
  await saveAuthStore(store);
  return store.users[key];
}

async function touchLastLogin(email) {
  const store = await getAuthStore();
  const key = email.toLowerCase();
  if (!store.users[key]) return;
  store.users[key].lastLogin = Date.now();
  await saveAuthStore(store);
}

module.exports = { getAuthStore, getUserAuth, setUserPassword, touchLastLogin, verifyPassword };
