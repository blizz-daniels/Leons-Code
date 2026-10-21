const PROJECTS_KEY = "javalab.projects.v1";

export function createLocalProjectStore(storage = browserStorage()) {
  const read = () => {
    try {
      const value = JSON.parse(storage.getItem(PROJECTS_KEY) || "[]");
      return Array.isArray(value) ? value.filter(isProject) : [];
    } catch {
      return [];
    }
  };
  const write = (projects) => {
    try { storage.setItem(PROJECTS_KEY, JSON.stringify(projects)); return true; } catch { return false; }
  };
  return {
    list: () => read().sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    save(project) {
      const projects = read();
      const saved = normalize(project);
      const index = projects.findIndex((item) => item.id === saved.id);
      if (index >= 0) projects[index] = saved; else projects.push(saved);
      if (!write(projects)) throw new Error("Browser storage is unavailable or full.");
      return saved;
    },

    remove(id) { return write(read().filter((project) => project.id !== id)); },
  };
}


function browserStorage() {
  try {
    return globalThis.localStorage || unavailableStorage();
  } catch {
    return unavailableStorage();
  }
}

function unavailableStorage() {
  return { getItem: () => null, setItem: () => { throw new Error("Browser storage is unavailable."); } };
}

function normalize(project) {
  const now = new Date().toISOString();
  return {
    id: project.id || crypto.randomUUID(),
    name: String(project.name || "My Java Project").trim() || "My Java Project",
    filename: safeFilename(project.filename || "Main.java"),
    source: String(project.source || ""),
    updatedAt: now,
  };
}

function isProject(value) {
  return value && typeof value.id === "string" && typeof value.name === "string" && typeof value.filename === "string" && typeof value.source === "string" && typeof value.updatedAt === "string";
}

export function safeFilename(filename) {
  const clean = String(filename).replace(/[^a-zA-Z0-9_.-]/g, "-") || "Main.java";
  return clean.endsWith(".java") ? clean : `${clean}.java`;
}
