// projects.js: project list, details view and the 3-step creation wizard.
let step = 1, plan = [];
PP.wizardOpen = false;
PP.selectedProjectId = null;

PP.startWizard = () => {
  PP.wizardOpen = true; PP.selectedProjectId = null; step = 1; plan = [];
  PP._wizardMembers = PP.data.team.slice(0, Math.min(3, PP.data.team.length));
  ["p-name", "p-desc", "p-deadline", "p-req"].forEach(id => $(id).value = "");
  if ($("p-priority")) $("p-priority").value = "Medium";
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
  const tasks = PP.data.tasks.filter(t => Number(t.project || t.project_id) === Number(project.id)).sort((a, b) => (a.start || "").localeCompare(b.start || ""));
  const progress = PP.projectProgress(project.id);
  const assigned = Array.isArray(project.teamMembers) ? project.teamMembers :
    [...new Set(tasks.map(t => t.assignee).filter(Boolean))];
  const taskCount = tasks.length;
  const doneCount = tasks.filter(t => t.status === "Done").length;
  const inProgressCount = tasks.filter(t => t.status === "In Progress").length;
  const startDate = project.startDate || (tasks.length ? tasks.reduce((min, t) => !min || t.start < min ? t.start : min, "") : "");
  const statusClass = project.status === "Completed" ? "status-Completed" : "status-Active";

  // Calculate CPM & PERT for project
  const cpmRes = PP.cpm ? PP.cpm.calculate(project.id) : null;
  const cpmTasksMap = new Map((cpmRes ? cpmRes.tasks : []).map(t => [t.id, t]));

  $("project-details").innerHTML = `
    <div class="project-detail-top">
      <button class="btn ghost" id="back-to-projects">← Back to Projects</button>
      <div class="project-detail-actions">
        <button class="btn ghost" id="detail-view-cpm">⚡ CPM & PERT</button>
        <button class="btn ghost" id="detail-view-risk">🛡️ Risk Register</button>
        <button class="btn ghost" id="detail-view-delay">⏱️ Delay Prediction</button>
        <button class="btn ghost" id="detail-view-whatif">🧪 What-If Simulator</button>
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
        <div class="project-hero-badges"><span class="badge project-priority priority-${PP.esc(project.priority || "Medium").toLowerCase()}">${PP.esc(project.priority || "Medium")} priority</span><span class="badge ${statusClass}">${PP.esc(project.status || "Active")}</span></div>
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

    <!-- CPM & PERT Analysis Summary Card -->
    <section class="card project-cpm-card">
      <div class="project-cpm-header">
        <div>
          <span class="eyebrow" style="color:var(--cpm-critical)">SCHEDULE ANALYSIS (CPM & PERT)</span>
          <h3 style="margin-top:2px;font-size:1.1rem">Critical Path & Delivery Risk</h3>
        </div>
        <button class="btn small-btn" id="open-cpm-details">Open Full Analysis &rarr;</button>
      </div>
      <div class="project-cpm-grid">
        <div class="project-cpm-stat">
          <span>Critical Path Duration</span>
          <strong>${cpmRes ? cpmRes.projectDuration : 0} days</strong>
          <small class="muted small">${cpmRes ? cpmRes.criticalTaskIds.size : 0} critical activities (0 float)</small>
        </div>
        <div class="project-cpm-stat">
          <span>PERT Expected Duration</span>
          <strong>${cpmRes ? cpmRes.pert.expectedDuration : 0} &plusmn; ${cpmRes ? cpmRes.pert.sigma : 0}d</strong>
          <small class="muted small">Variance &sigma;&sup2;: ${cpmRes ? cpmRes.pert.variance : 0}</small>
        </div>
        <div class="project-cpm-stat">
          <span>On-Time Probability</span>
          <strong style="color:${cpmRes && cpmRes.pert.probability >= 85 ? 'var(--success)' : (cpmRes && cpmRes.pert.probability >= 50 ? 'var(--warn)' : 'var(--danger)')}">
            ${cpmRes ? cpmRes.pert.probability : 0}%
          </strong>
          <small class="muted small">Z-Score: ${cpmRes ? (cpmRes.pert.zScore > 0 ? '+' : '') + cpmRes.pert.zScore : 0}</small>
        </div>
      </div>
      ${cpmRes && cpmRes.criticalPath && cpmRes.criticalPath.length ? `
        <div style="margin-top:10px">
          <span class="muted small" style="font-weight:700">CRITICAL SEQUENCE (Zero Float):</span>
          <div class="cpm-chain-flow" style="margin-top:6px">
            ${cpmRes.criticalPath.map((id, idx) => {
              const ct = cpmTasksMap.get(id);
              return `<div class="cpm-chain-step" data-edit-task="${id}"><span>${PP.esc(ct ? ct.name : id)}</span><small>(${ct ? ct.duration : 0}d)</small></div>` +
                (idx < cpmRes.criticalPath.length - 1 ? '<span class="cpm-chain-arrow">&rarr;</span>' : '');
            }).join('')}
          </div>
        </div>
      ` : ''}
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
            ${tasks.map(t => {
              const ct = cpmTasksMap.get(t.id);
              const isCrit = ct ? ct.isCritical : false;
              const slack = ct ? ct.totalFloat : 0;
              const cpmBadge = isCrit
                ? '<span class="badge badge-critical" title="Critical Path: 0 float">⚡ Critical</span>'
                : `<span class="badge badge-slack" title="Slack buffer">Slack ${slack}d</span>`;

              return `
              <div class="project-task-row">
                <div class="project-task-main">
                  <strong>${PP.esc(t.name)}</strong>
                  <span class="muted small">${PP.esc(t.assignee || "Unassigned")} · ${formatDate(t.start)} – ${formatDate(t.end)}</span>
                </div>
                <div class="project-task-status">
                  <span class="badge p-${PP.esc(t.priority || "Medium")}">${PP.esc(t.priority || "Medium")}</span>
                  <span class="badge task-status-${t.status === "Done" ? "done" : t.status === "In Progress" ? "progress" : "todo"}">${PP.esc(t.status || "To Do")}</span>
                  ${cpmBadge}
                  <button class="link-btn" data-edit-task="${t.id}">Edit</button>
                </div>
                <div class="project-task-progress"><div class="bar"><i style="width:${Math.max(0, Math.min(100, Number(t.progress) || 0))}%"></i></div><span>${Math.max(0, Math.min(100, Number(t.progress) || 0))}%</span></div>
              </div>`;
            }).join("")}
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
  $("save-project-members").onclick = async () => {
    const selected = selectedMemberNames("detail-team-choices");
    project.teamMembers = selected;
    project.members = selected.length;
    try {
      if (PP.api && PP.api.projects) {
        await PP.api.projects.update(project.id, { team_size: Math.max(1, selected.length) });
      }
      PP.save();
      renderProjectDetails(project);
      PP.toast("Project team updated.");
    } catch (err) {
      PP.toast("Failed to update project team: " + err.message, "error");
    }
  };
  $("back-to-projects").onclick = () => { PP.selectedProjectId = null; renderProjects(); };
  $("detail-view-gantt").onclick = () => {
    PP.ganttProjectId = project.id;
    PP.showPage("gantt");
  };
  const openCpm = () => {
    PP.cpmProjectId = project.id;
    location.hash = "cpm-pert";
  };
  const openRisk = () => {
    location.hash = "risk-analysis";
    PP.showPage("risk-analysis");
    const sel = $("risk-project-select");
    if (sel) { sel.value = project.id; sel.dispatchEvent(new Event("change")); }
  };
  const openDelay = () => {
    location.hash = "delay-prediction";
    PP.showPage("delay-prediction");
    const sel = $("delay-project-select");
    if (sel) { sel.value = project.id; sel.dispatchEvent(new Event("change")); }
  };
  const openWhatIf = () => {
    location.hash = "whatif-simulator";
    PP.showPage("whatif-simulator");
    const sel = $("whatif-project-select");
    if (sel) { sel.value = project.id; sel.dispatchEvent(new Event("change")); }
  };
  if ($("detail-view-cpm")) $("detail-view-cpm").onclick = openCpm;
  if ($("open-cpm-details")) $("open-cpm-details").onclick = openCpm;
  if ($("detail-view-risk")) $("detail-view-risk").onclick = openRisk;
  if ($("detail-view-delay")) $("detail-view-delay").onclick = openDelay;
  if ($("detail-view-whatif")) $("detail-view-whatif").onclick = openWhatIf;

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
      <div class="project-priority-line"><span class="badge project-priority priority-${PP.esc(p.priority || "Medium").toLowerCase()}">${PP.esc(p.priority || "Medium")} priority</span></div>
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
    const open = async () => {
      const pId = Number(card.dataset.openProject);
      PP.selectedProjectId = pId;
      renderProjects();
      window.scrollTo({ top: 0, behavior: "smooth" });
      if (PP.api && PP.api.projects) {
        try {
          const [serverProj, serverTasks] = await Promise.all([
            PP.api.projects.get(pId),
            PP.api.projects.getTasks(pId)
          ]);
          const pIdx = PP.data.projects.findIndex(p => Number(p.id) === pId);
          if (pIdx !== -1) {
            Object.assign(PP.data.projects[pIdx], PP.adapters.projectFromBackend(serverProj));
          }
          const adaptedTasks = (serverTasks || []).map(PP.adapters.taskFromBackend);
          PP.data.tasks = PP.data.tasks.filter(t => Number(t.project || t.project_id) !== pId).concat(adaptedTasks);
          if (PP.selectedProjectId === pId) {
            renderProjects();
          }
        } catch (err) {
          // Keep current state if network fails
        }
      }
    };
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

window.toggleProject = async id => {
  const p = PP.data.projects.find(x => Number(x.id) === Number(id));
  if (!p) return;
  const newStatus = p.status === "Active" ? "Completed" : "Active";
  try {
    if (PP.api && PP.api.projects) {
      const updated = await PP.api.projects.update(id, { status: newStatus });
      Object.assign(p, PP.adapters.projectFromBackend(updated));
    } else {
      p.status = newStatus;
    }
    PP.toast(`Project marked as ${newStatus.toLowerCase()}.`);
    renderProjects();
    PP.refresh();
  } catch (err) {
    PP.toast("Failed to update project status: " + err.message, "error");
  }
};

window.deleteProject = async id => {
  if (!confirm("Delete this project and all its tasks?")) return;
  try {
    if (PP.api && PP.api.projects) {
      await PP.api.projects.delete(id);
    }
    PP.data.projects = PP.data.projects.filter(p => Number(p.id) !== Number(id));
    PP.data.tasks = PP.data.tasks.filter(t => Number(t.project || t.project_id) !== Number(id));
    PP.selectedProjectId = null;
    PP.toast("Project deleted.");
    renderProjects();
    PP.refresh();
  } catch (err) {
    PP.toast("Failed to delete project: " + err.message, "error");
  }
};

document.addEventListener("DOMContentLoaded", () => {
  $("gen-plan").onclick = () => $("p-deadline").value ? generatePlan() : ($("wizard-error").textContent = "Set a deadline in step 2 first.");
  $("wiz-back").onclick = () => { if (step === 1) { PP.wizardOpen = false; renderProjects(); } else { step--; showStep(); } };
  $("wiz-next").onclick = async () => {
    const err = validateStep();
    if (err) return $("wizard-error").textContent = err;
    if (step < 3) {
      if (step === 2) PP._wizardMembers = selectedMemberNames("p-team-choices");
      step++;
      return showStep();
    }

    const name = $("p-name").value.trim();
    const desc = $("p-desc").value.trim();
    const deadline = $("p-deadline").value;
    const priority = ($("p-priority") && $("p-priority").value) || "Medium";
    const members = (PP._wizardMembers && PP._wizardMembers.length) || 1;
    const teamMembers = PP._wizardMembers ? PP._wizardMembers.slice() : [];
    const req = $("p-req").value.trim();
    const startDate = plan.length ? plan[0].start : PP.day(0);

    const projectPayload = {
      name: name,
      description: desc || null,
      status: "Active",
      start_date: startDate,
      deadline: deadline || null,
      team_size: Math.max(1, members)
    };

    $("wiz-next").disabled = true;
    $("wizard-error").textContent = "";

    try {
      let createdProject;
      if (PP.api && PP.api.projects) {
        const serverProject = await PP.api.projects.create(projectPayload);
        createdProject = PP.adapters.projectFromBackend(serverProject);
      } else {
        const id = PP.nextId(PP.data.projects);
        createdProject = { id, ...projectPayload, desc, startDate, members };
      }

      createdProject.priority = priority;
      createdProject.teamMembers = teamMembers;
      createdProject.req = req;
      PP.data.projects.push(createdProject);

      // If an AI plan was generated with tasks, create them in sequence
      if (plan.length) {
        let prevTaskId = null;
        for (let i = 0; i < plan.length; i++) {
          const pt = plan[i];
          const dur = Math.max(1, PP.diff(pt.start, pt.end) + 1);
          const taskPayload = {
            project_id: createdProject.id,
            name: pt.name,
            duration: dur,
            start_date: pt.start,
            end_date: pt.end,
            status: "To Do",
            priority: "Medium",
            progress: 0,
            assignee: pt.assignee || null,
            optimistic_duration: Math.max(1, Math.round(dur * 0.75)),
            most_likely_duration: dur,
            pessimistic_duration: Math.max(dur + 1, Math.round(dur * 1.5))
          };
          if (prevTaskId) {
            taskPayload.depends_on_ids = [prevTaskId];
          }

          if (PP.api && PP.api.tasks) {
            const serverTask = await PP.api.tasks.create(taskPayload);
            prevTaskId = serverTask.id;
            PP.data.tasks.push(PP.adapters.taskFromBackend(serverTask));
          } else {
            const tid = PP.nextId(PP.data.tasks);
            prevTaskId = tid;
            PP.data.tasks.push({
              id: tid,
              project: createdProject.id,
              project_id: createdProject.id,
              name: pt.name,
              start: pt.start,
              end: pt.end,
              progress: 0,
              assignee: pt.assignee,
              status: "To Do",
              priority: "Medium",
              dep: i ? prevTaskId : 0,
              deps: i ? [prevTaskId] : [],
              opt: taskPayload.optimistic_duration,
              likely: dur,
              pess: taskPayload.pessimistic_duration
            });
          }
        }
      }

      PP.save();
      PP.wizardOpen = false;
      PP.selectedProjectId = createdProject.id;
      PP.toast("Project created successfully!");
      renderProjects();
      PP.refresh();
    } catch (apiErr) {
      $("wizard-error").textContent = apiErr.message;
      PP.toast(apiErr.message, "error");
    } finally {
      $("wiz-next").disabled = false;
    }
  };
});
