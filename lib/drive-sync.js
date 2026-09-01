const { JWT } = require("google-auth-library");
const { uid } = require("./kv-state");

const FOLDER_MIME = "application/vnd.google-apps.folder";

let authClient = null;
function driveAuth() {
  if (!authClient) {
    const keyJson = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_KEY;
    if (!keyJson) throw new Error("Drive não configurado (GOOGLE_DRIVE_SERVICE_ACCOUNT_KEY ausente)");
    let key;
    try { key = JSON.parse(keyJson); }
    catch (e) { throw new Error("GOOGLE_DRIVE_SERVICE_ACCOUNT_KEY não é um JSON válido"); }
    authClient = new JWT({
      email: key.client_email,
      key: key.private_key,
      scopes: ["https://www.googleapis.com/auth/drive.readonly"],
    });
  }
  return authClient;
}

function rootFolderId() {
  const id = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
  if (!id) throw new Error("GOOGLE_DRIVE_ROOT_FOLDER_ID não configurado");
  return id;
}

async function driveFilesList(auth, folderId) {
  const { token } = await auth.getAccessToken();
  const items = [];
  let pageToken;
  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "nextPageToken, files(id,name,mimeType,webViewLink,modifiedTime)",
      pageSize: "1000",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Drive API error ${res.status}: ${body.slice(0, 300)}`);
    }
    const data = await res.json();
    items.push(...(data.files || []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return items;
}

// Anda a árvore inteira a partir da pasta raiz, recursivamente. pathPrefix
// acumula o caminho de pastas (ex: "Jurídico/Contratos") pra cada arquivo
// carregar o caminho real de onde ele está no Drive — é isso que vira a
// seção dele na Biblioteca.
async function walkFolder(auth, folderId, pathPrefix, out) {
  const items = await driveFilesList(auth, folderId);
  for (const item of items) {
    if (item.mimeType === FOLDER_MIME) {
      const nextPath = pathPrefix ? `${pathPrefix}/${item.name}` : item.name;
      await walkFolder(auth, item.id, nextPath, out);
    } else {
      out.push({
        driveFileId: item.id,
        title: item.name,
        link: item.webViewLink || "",
        drivePath: pathPrefix,
        driveModifiedAt: item.modifiedTime ? new Date(item.modifiedTime).getTime() : Date.now(),
      });
    }
  }
}

// Espelha a pasta do Drive pra dentro de state.files. Casa pelo
// driveFileId (não pelo nome — nome pode repetir ou ser renomeado): quem
// já existe é atualizado no lugar, quem é novo é criado, e quem não
// apareceu mais nesta passada vira "driveMissing" (esmaecido na tela) em
// vez de apagado — preserva notas/favoritos que já tinham sido colocados.
// Read-only por design: nada aqui edita o Drive, só lê.
async function syncDriveFiles(state) {
  const auth = driveAuth();
  const found = [];
  await walkFolder(auth, rootFolderId(), "", found);

  const foundIds = new Set(found.map(f => f.driveFileId));
  let added = 0, updated = 0, missing = 0, restored = 0;

  found.forEach(f => {
    const existing = state.files.find(x => x.driveFileId === f.driveFileId);
    if (existing) {
      let changed = false;
      if (existing.title !== f.title) { existing.title = f.title; changed = true; }
      if (existing.link !== f.link) { existing.link = f.link; changed = true; }
      if (existing.drivePath !== f.drivePath) { existing.drivePath = f.drivePath; changed = true; }
      if (existing.driveModifiedAt !== f.driveModifiedAt) { existing.driveModifiedAt = f.driveModifiedAt; changed = true; }
      if (existing.driveMissing) { existing.driveMissing = false; restored++; }
      if (changed) updated++;
    } else {
      state.files.push({
        id: uid(), type: "link", source: "drive",
        driveFileId: f.driveFileId, title: f.title, link: f.link,
        drivePath: f.drivePath, driveModifiedAt: f.driveModifiedAt,
        driveMissing: false, category: "Outro", frente: "",
        addedBy: "", createdAt: Date.now(), favorite: false, restrictedTo: [],
      });
      added++;
    }
  });

  state.files.forEach(f => {
    if (f.source === "drive" && !f.driveMissing && !foundIds.has(f.driveFileId)) {
      f.driveMissing = true;
      missing++;
    }
  });

  return { added, updated, missing, restored, total: found.length };
}

module.exports = { syncDriveFiles };
