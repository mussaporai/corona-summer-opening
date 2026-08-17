const { getGoogleAuth, getMeetingEventMap, setMeetingEvent, removeMeetingEvent } = require("./kv-google");
const { refreshAccessToken, insertEvent, updateEvent, deleteEvent } = require("./google-calendar");
const { getTeam } = require("./kv-team");

const SYNCED_FIELDS = new Set(["theme", "when", "link"]);

async function participantLabel(email) {
  const team = await getTeam();
  const tm = (team.members || []).find(m => (m.email || "").toLowerCase() === email.toLowerCase());
  return tm ? (tm.name || tm.email) : email;
}

async function buildEvent(meeting) {
  const start = new Date(meeting.when);
  if (isNaN(start.getTime())) return null;
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const participantNames = await Promise.all((meeting.participantes || []).map(participantLabel));
  const lines = [];
  if (meeting.who) lines.push(`Convocado por: ${meeting.who}`);
  if (participantNames.length) lines.push(`Participantes: ${participantNames.join(", ")}`);
  if (meeting.link) lines.push(`Link da call: ${meeting.link}`);
  lines.push("— sincronizado automaticamente do Corona Summer Opening");
  return {
    summary: meeting.theme || "Reunião — Corona Summer Opening",
    description: lines.join("\n"),
    location: meeting.link || undefined,
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
  };
}

// Best-effort: mantém eventos do Calendar do produtor master em sincronia com as
// reuniões cadastradas no app. Nunca lança erro — uma falha aqui não pode derrubar
// a mutação principal (o estado já foi salvo com sucesso antes desta chamada).
async function syncMeetingToGoogle(type, payload, state) {
  if (type === "edit-meeting-field" && !SYNCED_FIELDS.has(payload && payload.field)) return;
  const meetingId = payload && payload.id;
  if (!meetingId) return;

  try {
    const auth = await getGoogleAuth();
    if (!auth.connected || !auth.refreshToken) return;
    const { access_token: accessToken } = await refreshAccessToken(auth.refreshToken);
    const events = await getMeetingEventMap();
    const existingEventId = events[meetingId];

    if (type === "rm-meeting") {
      if (existingEventId) {
        await deleteEvent(accessToken, existingEventId);
        await removeMeetingEvent(meetingId);
      }
      return;
    }

    const meeting = (state.meetings || []).find(m => m.id === meetingId);
    const eventBody = meeting ? await buildEvent(meeting) : null;

    if (!eventBody) {
      if (existingEventId) {
        await deleteEvent(accessToken, existingEventId);
        await removeMeetingEvent(meetingId);
      }
      return;
    }

    if (existingEventId) {
      await updateEvent(accessToken, existingEventId, eventBody);
    } else {
      const created = await insertEvent(accessToken, eventBody);
      await setMeetingEvent(meetingId, created.id);
    }
  } catch (err) {
    console.error("google-calendar sync falhou:", err.message);
  }
}

module.exports = { syncMeetingToGoogle };
