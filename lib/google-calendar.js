const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || "https://corona-summer-opening.vercel.app/api/google-callback";
const SCOPE = "https://www.googleapis.com/auth/calendar";
const CALENDAR_NAME = "Corona Summer Opening";

function getAuthUrl() {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

async function exchangeCodeForTokens(code) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code, client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI, grant_type: "authorization_code",
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.error || "falha ao trocar código por token");
  return data;
}

async function refreshAccessToken(refreshToken) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken, client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.error || "falha ao renovar token do Google");
  return data;
}

async function calendarRequest(accessToken, method, path, body) {
  const res = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    method,
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error && data.error.message) || `erro Google Calendar (${res.status})`);
  return data;
}

function insertEvent(accessToken, calendarId, event) {
  return calendarRequest(accessToken, "POST", `/calendars/${encodeURIComponent(calendarId)}/events`, event);
}
function updateEvent(accessToken, calendarId, eventId, event) {
  return calendarRequest(accessToken, "PATCH", `/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`, event);
}
async function deleteEvent(accessToken, calendarId, eventId) {
  try {
    await calendarRequest(accessToken, "DELETE", `/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`);
  } catch (err) {
    if (!/404|410/.test(err.message)) throw err;
  }
}

// Acha a agenda "Corona Summer Opening" já criada nessa conta, ou cria uma nova
// caso ainda não exista — mantém tudo separado da agenda pessoal do produtor.
async function findOrCreateCoronaCalendar(accessToken) {
  const list = await calendarRequest(accessToken, "GET", "/users/me/calendarList?minAccessRole=owner");
  const existing = (list.items || []).find(c => c.summary === CALENDAR_NAME);
  if (existing) return existing.id;
  const created = await calendarRequest(accessToken, "POST", "/calendars", {
    summary: CALENDAR_NAME,
    description: "Agenda de reuniões do Corona Summer Opening — sincronizada automaticamente pelo painel de produção.",
    timeZone: "America/Sao_Paulo",
  });
  return created.id;
}

module.exports = {
  getAuthUrl, exchangeCodeForTokens, refreshAccessToken,
  insertEvent, updateEvent, deleteEvent, findOrCreateCoronaCalendar,
};
