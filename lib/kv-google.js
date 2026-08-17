const { kvGet, kvSet } = require("./db");

const AUTH_KEY = "corona:google-auth";
const EVENTS_KEY = "corona:google-events";

async function getGoogleAuth() {
  const data = await kvGet(AUTH_KEY);
  return data || { connected: false, refreshToken: "", calendarId: "", connectedBy: "", connectedAt: 0 };
}

async function saveGoogleAuth(data) {
  await kvSet(AUTH_KEY, data);
}

async function getMeetingEventMap() {
  const data = await kvGet(EVENTS_KEY);
  return data || {};
}

async function setMeetingEvent(meetingId, eventId) {
  const map = await getMeetingEventMap();
  map[meetingId] = eventId;
  await kvSet(EVENTS_KEY, map);
}

async function removeMeetingEvent(meetingId) {
  const map = await getMeetingEventMap();
  if (!(meetingId in map)) return;
  delete map[meetingId];
  await kvSet(EVENTS_KEY, map);
}

module.exports = { getGoogleAuth, saveGoogleAuth, getMeetingEventMap, setMeetingEvent, removeMeetingEvent };
