// projects.js: project list, details view and the 3-step creation wizard.
let step = 1, plan = [];
PP.wizardOpen = false;
PP.selectedProjectId = null;

PP.startWizard = () => {
  PP.wizardOpen = true; PP.selectedProjectId = null; step = 1; plan = [];
  PP._wizardMembers = PP.data.team.slice(0, Math.min(3, PP.data.team.length));
  ["p-name", "p-desc", "p-deadline", "p-req"].forEach(id => $(id).value = "");
  $("plan-preview").innerHTML = "";
  if (location.hash === "#projects") PP.showPage("projects"); else location.hash = "projects";
};

function showStep() {
  [1, 2, 3].forEach(n => $("step-" + n).classList.toggle("hidden", n !== step));
  $("steps").innerHTML = ["Basics", "Schedule and team", "Requirements and AI"].map((t, i) =>
    `<div class="step ${i + 1 === step ? "on" : i + 1 < step ? "done" : ""}">${i + 1}. ${t}</div>`).join("");
  $("wiz-back").textContent = step === 1 ? "Cancel" : "Back";
  $("wiz-next").textContent = step === 3 ? "Create project" : "Next";
  $("wizard-error").textContent = "";
}

function validateStep() {
  if (step === 1 && !$("p-name").value.trim()) return "Give your project a name.";
  if (step === 2) {
    if (!$("p-deadline").value) return "Choose a deadline.";
    if ($("p-deadline").value <= PP.day(0)) return "The deadline must be in the future.";
    const m = +$("p-members").value;
    if (!(m >= 1 && m <= PP.data.team.length)) return "Team size must be between 1 and " + PP.data.team.length + ".";
  }
  return "";
}

// MOCK AI: later, replace the body with fetch(...) so your backend calls Gemini.
// Never put the API key in this file.
function generatePlan() {
  const total = Math.max(PP.diff(PP.day(0), $("p-deadline").value), 5);
  const names = ["Research and planning", "Design", "Development", "Testing", "Launch"];
  const share = [.15, .2, .35, .2, .1];
  let cursor = 0;
  plan = names.map((n, i) => {
    const len = Math.max(1, Math.round(total * share[i]));
    const t = { name: n, start: PP.day(cursor), end: PP.day(Math.min(cursor + len, total)), assignee: PP.data.team[i % PP.data.team.length] };
    cursor += len; return t;
  });
  $("plan-preview").innerHTML = plan.map(t => `<div class="plan-row"><b>${PP.esc(t.name)}</b><span class="muted">${PP.esc(t.assignee)} · ${t.start} to ${t.end}</span></div>`).join("");
  PP.toast("Sample AI plan generated. Review it, then create the project.");
}

function formatDate(value) {
  if (!value) return "Not set";
  const d = new Date(value + "T00:00:00");
  return Number.isNaN(d.getTime()) ? PP.esc(value) : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function renderMemberChoices(containerId, selectedNames) {
  const container = $(containerId);
  if (!container) return;
  container.innerHTML = PP.data.team.map(name => `
    <label class="member-choice"><input type="checkbox" value="${PP.esc(name)}" ${selectedNames.includes(name) ? "checked" : ""}>
      <span>${PP.esc(name)}</span></label>`).join("") || '<p class="muted small">Add team members in the Team section first.</p>';
  if (containerId === "p-team-choices") {
    $("p-members").value = selectedMemberNames(containerId).length;
    container.onchange = () => { $("p-members").value = selectedMemberNames(containerId).length; };
  }
}
function selectedMemberNames(containerId) {
  return [...$(containerId).querySelectorAll('input[type="checkbox"]:checked')].map(input => input.value);
}

function renderProjectDetails(project) {
  const tasks = PP.data.tasks.filter(t => t.project == project.id).sort((a, b) => (a.start || "").localeCompare(b.start || ""));
  const progress = PP.projectProgress(project.id);
  const assigned = Array.isArray(project.teamMembers) ? project.teamMembers :
    [...new Set(tasks.map(t => t.assignee).filter(Boolean))];
  const taskCount = tasks.length;
  const doneCount = tasks.filter(t => t.status === "Done").length;
  const inProgressCount = tasks.filter(t => t.status === "In Progress").length;
  const startDate = project.startDate || (tasks.length ? tasks.reduce((min, t) => !min || t.start < min ? t.start : min, "") : "");
  const statusClass = project.status === "Completed" ? "status-Completed" : "status-Active";

  $("project-details").innerHTML = `
    <div class="project-detail-top">
      <button class="btn ghost" id="back-to-projects">← Back to Projects</button>
      <div class="project-detail-actions">
        <button class="btn ghost" id="detail-view-gantt">View Gantt chart</button>
        <button class="btn ghost" id="detail-toggle-status">${project.status === "Active" ? "Mark completed" : "Mark active"}</button>
        <button class="btn danger" id="detail-delete-project">Delete project</button>
      </div>
    </div>

    <section class="card project-hero">
      <div class="project-hero-heading">
        <div>
          <span class="eyebrow">PROJECT OVERVIEW</span>
          <h2>${PP.esc(project.name)}</h2>
          <p class="muted">${PP.esc(project.desc || "No project description has been added yet.")}</p>
        </div>
        <span class="badge ${statusClass}">${PP.esc(project.status || "Active")}</span>
      </div>
      <div class="project-progress-line">
        <div class="row-between"><strong>Overall progress</strong><strong>${progress}%</strong></div>
        <div class="bar"><i style="width:${progress}%"></i></div>
      </div>
      <div class="project-facts">
        <div><span>Start date</span><strong>${formatDate(startDate)}</strong></div>
        <div><span>Deadline</span><strong>${formatDate(project.deadline)}</strong></div>
        <div><span>Team size planned</span><strong>${Number(project.members) || assigned.length || 0} members</strong></div>
        <div><span>Total tasks</span><strong>${taskCount}</strong></div>
      </div>
    </section>

    <div class="project-detail-stats">
      <div class="card"><span>Total tasks</span><strong>${taskCount}</strong></div>
      <div class="card"><span>Completed</span><strong>${doneCount}</strong></div>
      <div class="card"><span>In progress</span><strong>${inProgressCount}</strong></div>
      <div class="card"><span>To do</span><strong>${tasks.filter(t => t.status === "To Do").length}</strong></div>
    </div>

    <div class="project-detail-grid">
      <section class="card">
        <div class="row-between">
          <h2>Project tasks</h2>
          <button class="btn small-btn" id="detail-add-task">+ Add task</button>
        </div>
        ${tasks.length ? `
          <div class="project-task-list">
            ${tasks.map(t => `
              <div class="project-task-row">
                <div class="project-task-main">
                  <strong>${PP.esc(t.name)}</strong>
                  <span class="muted small">${PP.esc(t.assignee || "Unassigned")} · ${formatDate(t.start)} – ${formatDate(t.end)}</span>
                </div>
                <div class="project-task-status">
                  <span class="badge p-${PP.esc(t.priority || "Medium")}">${PP.esc(t.priority || "Medium")}</span>
                  <span class="badge task-status-${t.status === "Done" ? "done" : t.status === "In Progress" ? "progress" : "todo"}">${PP.esc(t.status || "To Do")}</span>
                  <button class="link-btn" data-edit-task="${t.id}">Edit</button>
                </div>
                <div class="project-task-progress"><div class="bar"><i style="width:${Math.max(0, Math.min(100, Number(t.progress) || 0))}%"></i></div><span>${Math.max(0, Math.min(100, Number(t.progress) || 0))}%</span></div>
              </div>`).join("")}
          </div>` : `<p class="empty">No tasks have been added to this project yet.</p>`}
      </section>

      <div class="project-detail-side">
        <section class="card">
          <h2>Team members</h2>
          <div class="project-member-list">${assigned.map(name => `
            <div class="project-member"><span class="avatar">${PP.esc(name.charAt(0).toUpperCase())}</span><div><strong>${PP.esc(name)}</strong><span class="muted small">${PP.esc((PP.data.teamDetails || {})[name]?.role || "Assigned to this project")}</span></div></div>`).join("") || '<p class="empty">No members assigned yet.</p>'}</div>
          <details class="assign-members"><summary>Manage project members</summary>
            <div id="detail-team-choices" class="member-choices"></div>
            <button class="btn small-btn" id="save-project-members" type="button">Save members</button>
          </details>
          <p class="muted small project-team-note">Planned team size: ${Number(project.members) || assigned.length || 0}</p>
        </section>
        <section class="card">
          <h2>Project requirements</h2>
          <p class="project-requirements">${PP.esc(project.req || "No additional requirements have been recorded for this project.")}</p>
        </section>
      </div>
    </div>`;

  renderMemberChoices("detail-team-choices", assigned);
  $("save-project-members").onclick = () => {
    project.teamMembers = selectedMemberNames("detail-team-choices");
    project.members = project.teamMembers.length;
    PP.save(); renderProjectDetails(project); PP.toast("Project team updated.");
  };
  $("back-to-projects").onclick = () => { PP.selectedProjectId = null; renderProjects(); };
  $("detail-view-gantt").onclick = () => {
    PP.ganttProjectId = project.id;
    PP.showPage("gantt");
  };
  $("detail-toggle-status").onclick = () => window.toggleProject(project.id);
  $("detail-delete-project").onclick = () => window.deleteProject(project.id);
  $("detail-add-task").onclick = () => PP.openTask(null, project.id);
  $("project-details").querySelectorAll("[data-edit-task]").forEach(button => {
    button.onclick = () => PP.openTask(Number(button.dataset.editTask));
  });
}

function renderProjects() {
  const list = $("project-list");
  const details = $("project-details");
  const wizard = $("wizard");
  list.classList.toggle("hidden", PP.wizardOpen || PP.selectedProjectId !== null);
  details.classList.toggle("hidden", PP.wizardOpen || PP.selectedProjectId === null);
  wizard.classList.toggle("hidden", !PP.wizardOpen);

  if (PP.wizardOpen) return showStep();
  if (PP.selectedProjectId !== null) {
    const selected = PP.data.projects.find(p => p.id == PP.selectedProjectId);
    if (selected) return renderProjectDetails(selected);
    PP.selectedProjectId = null;
  }

  $("project-cards").innerHTML = PP.data.projects.map(p => {
    const pr = PP.projectProgress(p.id);
    return `<article class="card proj-card project-click-card" data-open-project="${p.id}" tabindex="0" role="button" aria-label="Open details for ${PP.esc(p.name)}">
      <div class="row-between"><h3>${PP.esc(p.name)}</h3><span class="badge status-${p.status === "Completed" ? "Completed" : "Active"}">${PP.esc(p.status)}</span></div>
      <p>${PP.esc(p.desc || "No description")}</p><div class="bar"><i style="width:${pr}%"></i></div>
      <div class="proj-meta"><span>${pr}% done</span><span>Due ${formatDate(p.deadline)}</span></div>
      <span class="project-open-hint">Click to view project details →</span>
      <div class="project-card-actions">
        <button class="link-btn" data-toggle-project="${p.id}">Mark ${p.status === "Active" ? "completed" : "active"}</button>
        <button class="link-btn del" data-delete-project="${p.id}">Delete</button>
      </div>
    </article>`;
  }).join("") || '<p class="empty">No projects yet. Click "New Project" to start.</p>';

  $("project-cards").querySelectorAll("[data-open-project]").forEach(card => {
    const open = () => { PP.selectedProjectId = Number(card.dataset.openProject); renderProjects(); window.scrollTo({ top: 0, behavior: "smooth" }); };
    card.addEventListener("click", event => {
      if (event.target.closest("button")) return;
      open();
    });
    card.addEventListener("keydown", event => {
      if ((event.key === "Enter" || event.key === " ") && event.target === card) {
        event.preventDefault(); open();
      }
    });
  });
  $("project-cards").querySelectorAll("[data-toggle-project]").forEach(button => {
    button.onclick = event => { event.stopPropagation(); window.toggleProject(Number(button.dataset.toggleProject)); };
  });
  $("project-cards").querySelectorAll("[data-delete-project]").forEach(button => {
    button.onclick = event => { event.stopPropagation(); window.deleteProject(Number(button.dataset.deleteProject)); };
  });
}
PP.renders.projects = renderProjects;

window.toggleProject = id => {
  const p = PP.data.projects.find(x => x.id === id);
  if (!p) return;
  p.status = p.status === "Active" ? "Completed" : "Active";
  PP.save(); renderProjects();
};
window.deleteProject = id => {
  if (!confirm("Delete this project and all its tasks?")) return;
  PP.data.projects = PP.data.projects.filter(p => p.id !== id);
  PP.data.tasks = PP.data.tasks.filter(t => t.project !== id);
  PP.selectedProjectId = null;
  PP.save(); renderProjects(); PP.toast("Project deleted.");
};

document.addEventListener("DOMContentLoaded", () => {
  $("gen-plan").onclick = () => $("p-deadline").value ? generatePlan() : ($("wizard-error").textContent = "Set a deadline in step 2 first.");
  $("wiz-back").onclick = () => { if (step === 1) { PP.wizardOpen = false; renderProjects(); } else { step--; showStep(); } };
  $("wiz-next").onclick = () => {
    const err = validateStep();
    if (err) return $("wizard-error").textContent = err;
    if (step < 3) { if (step === 2) PP._wizardMembers = selectedMemberNames("p-team-choices"); step++; return showStep(); }
    const id = PP.nextId(PP.data.projects);
    PP.data.projects.push({ id, name: $("p-name").value.trim(), desc: $("p-desc").value.trim(), deadline: $("p-deadline").value, members: PP._wizardMembers.length, teamMembers: PP._wizardMembers.slice(), status: "Active", req: $("p-req").value.trim() });
    let tid = PP.nextId(PP.data.tasks);
    plan.forEach((t, i) => PP.data.tasks.push({ id: tid + i, project: id, name: t.name, start: t.start, end: t.end, progress: 0, assignee: t.assignee, status: "To Do", priority: "Medium", dep: i ? tid + i - 1 : 0 }));
    PP.save(); PP.wizardOpen = false; PP.selectedProjectId = id; PP.toast("Project created!"); renderProjects();
  };
});
