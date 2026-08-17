const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || "https://corona-summer-opening.vercel.app/api/google-callback";
const SCOPE = "https://www.googleapis.com/auth/calendar.events";

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

function insertEvent(accessToken, event) {
  return calendarRequest(accessToken, "POST", "/calendars/primary/events", event);
}
function updateEvent(accessToken, eventId, event) {
  return calendarRequest(accessToken, "PATCH", `/calendars/primary/events/${eventId}`, event);
}
async function deleteEvent(accessToken, eventId) {
  try {
    await calendarRequest(accessToken, "DELETE", `/calendars/primary/events/${eventId}`);
  } catch (err) {
    if (!/404|410/.test(err.message)) throw err;
  }
}

module.exports = { getAuthUrl, exchangeCodeForTokens, refreshAccessToken, insertEvent, updateEvent, deleteEvent };
