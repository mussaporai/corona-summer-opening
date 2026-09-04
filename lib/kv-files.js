const { kvGet, kvSet, kvGetWithVersion, kvSetIfUnchanged } = require("./db");

// Biblioteca de arquivos — compartilhada entre Lençóis e Noronha (ao
// contrário do checklist, que é por local). Mora numa chave própria desde
// que os locais foram separados; antes disso vivia dentro de corona:state.
const FILES_KEY = "corona:files";

function seedFiles() {
  return { files: [], log: [] };
}

// V4: arquivo do projeto ganha data de criação (ordenação cronológica) e favorito.
// V5: tipo explícito (arquivo/link) e quem adicionou.
// V6: arquivo pode ser restrito a uma lista de e-mails (vazio = visível pra todo mundo).
// Numeração mantida como estava quando isso vivia em corona:state, pra não
// confundir quem já conhece o histórico — só migrou de módulo, não de versão.
function migrateFiles(data) {
  let changed = false;
  if (!Array.isArray(data.files)) { data.files = []; changed = true; }
  if (!Array.isArray(data.log)) { data.log = []; changed = true; }
  data.files.forEach(f => {
    if (typeof f.createdAt !== "number") { f.createdAt = Date.now(); changed = true; }
    if (typeof f.favorite !== "boolean") { f.favorite = false; changed = true; }
    if (typeof f.principal !== "boolean") { f.principal = false; changed = true; }
    if (f.type !== "file" && f.type !== "link") {
      f.type = (f.link || "").startsWith("r2:") ? "file" : (f.link ? "link" : "file");
      changed = true;
    }
    if (typeof f.addedBy !== "string") { f.addedBy = ""; changed = true; }
    if (!Array.isArray(f.restrictedTo)) { f.restrictedTo = []; changed = true; }
  });
  return changed;
}

async function getFiles() {
  let data = await kvGet(FILES_KEY);
  if (!data || !Array.isArray(data.files)) {
    data = seedFiles();
    await kvSet(FILES_KEY, data);
    return data;
  }
  if (migrateFiles(data)) await kvSet(FILES_KEY, data);
  return data;
}

async function saveFiles(data) {
  await kvSet(FILES_KEY, data);
}

async function getFilesWithVersion() {
  let entry = await kvGetWithVersion(FILES_KEY);
  if (!entry || !entry.value || !Array.isArray(entry.value.files)) {
    const data = seedFiles();
    await kvSet(FILES_KEY, data);
    entry = await kvGetWithVersion(FILES_KEY);
  }
  if (migrateFiles(entry.value)) {
    await kvSet(FILES_KEY, entry.value);
    entry = await kvGetWithVersion(FILES_KEY);
  }
  return entry;
}

async function saveFilesIfUnchanged(data, version) {
  return kvSetIfUnchanged(FILES_KEY, data, version);
}

module.exports = { getFiles, saveFiles, getFilesWithVersion, saveFilesIfUnchanged };
