import { STARTER_EXAMPLES } from "./examples-panel.js";
import { createLocalProjectStore, safeFilename } from "../storage/local-projects.js";

export function initializeLearningTools({ getProject, loadProject, saveProject, compileSource, output }) {
  const store = createLocalProjectStore();
  const projectsDialog = document.querySelector("#projects-dialog");
  const examplesDialog = document.querySelector("#examples-dialog");
  const projectList = document.querySelector("#projects-list");
  const exampleList = document.querySelector("#examples-list");

  const renderProjects = () => {
    projectList.replaceChildren();
    const projects = store.list();
    if (!projects.length) return appendEmpty(projectList, "No saved projects yet. Save the current source to create one.");
    projects.forEach((project) => {
      const row = document.createElement("article"); row.className = "project-row";
      const details = document.createElement("div");
      details.innerHTML = `<strong></strong><small></small>`;
      details.querySelector("strong").textContent = project.name;
      details.querySelector("small").textContent = `${project.filename} · saved ${new Date(project.updatedAt).toLocaleString()}`;
      const actions = document.createElement("div"); actions.className = "project-row-actions";
      actions.append(button("Open", () => { if (loadProject(project, true)) projectsDialog.close(); }), button("Delete", () => {
        if (window.confirm(`Delete '${project.name}' from this browser?`)) {
          if (store.remove(project.id)) { renderProjects(); output.write("Deleted local project.", "system"); }
          else output.write("Could not delete the local project because browser storage is unavailable.", "error");
        }
      }, "button-quiet"));
      row.append(details, actions); projectList.append(row);
    });
  };

  const renderExamples = () => {
    exampleList.replaceChildren();
    STARTER_EXAMPLES.forEach((example) => {
      const row = document.createElement("article"); row.className = "example-row";
      const details = document.createElement("div");
      details.innerHTML = `<strong></strong><small></small>`;
      details.querySelector("strong").textContent = example.name;
      details.querySelector("small").textContent = example.description;
      row.append(details, button("Use example", () => { if (loadProject({ id: null, name: example.name, filename: "Main.java", source: example.source }, false)) { examplesDialog.close(); output.write(`Loaded '${example.name}' starter example.`, "system"); } }));
      exampleList.append(row);
    });
  };

  document.querySelector("#open-project-button").addEventListener("click", () => { renderProjects(); projectsDialog.showModal(); });
  document.querySelector("#close-projects-button").addEventListener("click", () => projectsDialog.close());
  document.querySelector("#examples-button").addEventListener("click", () => { renderExamples(); examplesDialog.showModal(); });
  document.querySelector("#close-examples-button").addEventListener("click", () => examplesDialog.close());
  document.querySelector("#rename-project-button").addEventListener("click", () => { const current = getProject(); const name = window.prompt("Project name", current.name); if (name?.trim() && loadProject({ ...current, name: name.trim() }, false)) { saveProject(); renderProjects(); } });
  document.querySelector("#export-project-button").addEventListener("click", () => { const project = getProject(); download(safeFilename(project.filename), project.source, "text/x-java"); });
  document.querySelector("#download-js-button").addEventListener("click", () => { const result = compileSource(); if (result.generatedJavaScript) download(getProject().filename.replace(/\.java$/, ".js"), result.generatedJavaScript, "text/javascript"); });
  document.querySelector("#import-project-button").addEventListener("click", () => document.querySelector("#import-project-input").click());
  document.querySelector("#import-project-input").addEventListener("change", async (event) => {
    const file = event.target.files[0]; if (!file) return;
    const loaded = loadProject({ id: null, name: file.name.replace(/\.java$/i, "") || "Imported Project", filename: safeFilename(file.name), source: await file.text() }, false);
    if (loaded) { projectsDialog.close(); output.write(`Imported '${file.name}'. Save to keep it locally.`, "system"); } event.target.value = "";
  });
}

function button(label, action, extraClass = "") { const element = document.createElement("button"); element.className = `button ${extraClass}`; element.type = "button"; element.textContent = label; element.addEventListener("click", action); return element; }
function appendEmpty(container, text) { const element = document.createElement("p"); element.className = "empty-state"; element.textContent = text; container.append(element); }
function download(filename, text, type) { const url = URL.createObjectURL(new Blob([text], { type })); const link = document.createElement("a"); link.href = url; link.download = filename; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 0); }
