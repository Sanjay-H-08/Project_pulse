// tasks.js: task table, search/filter, CPM/PERT badges, add/edit/delete modal.
let editingId = null;

function updateModalPertPreview() {
  const o = parseFloat($("f-opt").value) || 0;
  const m = parseFloat($("f-likely").value) || 0;
  const p = parseFloat($("f-pess").value) || 0;

  if (o > 0 && m > 0 && p > 0) {
    const te = (o + 4 * m + p) / 6;
    const v = Math.pow((p - o) / 6, 2);
    const s = (p - o) / 6;
    $("f-preview-te").textContent = te.toFixed(1) + " days";
    $("f-preview-sigma").textContent = s.toFixed(2) + " days";
    $("f-preview-var").textContent = v.toFixed(2);
  } else {
    $("f-preview-te").textContent = "-";
    $("f-preview-sigma").textContent = "-";
    $("f-preview-var").textContent = "-";
  }
}

PP.renders.tasks = () => {
  const q = $("t-search").value.toLowerCase();
  const st = $("t-status").value;
  const pr = $("t-priority").value;
  const cpmFilter = $("t-cpm") ? $("t-cpm").value : "";

  const projectSelect = $("t-project");
  if (projectSelect) {
    const prevProj = projectSelect.value;
    const projOpts = ['<option value="">All Projects</option>']
      .concat(PP.data.projects.map(p => `<option value="${p.id}" ${String(p.id) === String(prevProj) ? "selected" : ""}>${PP.esc(p.name)}</option>`));
    projectSelect.innerHTML = projOpts.join("");
  }
  const projFilter = projectSelect ? projectSelect.value : "";
  const sortOption = $("t-sort") ? $("t-sort").value : "";

  // Pre-calculate CPM for all projects
  const cpmMap = new Map();
  if (PP.cpm) {
    PP.data.projects.forEach(p => {
      cpmMap.set(p.id, PP.cpm.calculate(p.id));
    });
  }

  const list = PP.data.tasks.filter(t => {
    const matchSearch = (!q || (t.name + (t.assignee || "")).toLowerCase().includes(q));
    const matchProject = (!projFilter || String(t.project || t.project_id) === String(projFilter));
    const matchStatus = (!st || t.status === st);
    const matchPriority = (!pr || t.priority === pr);

    let matchCpm = true;
    if (cpmFilter) {
      const pCpm = cpmMap.get(Number(t.project || t.project_id));
      const cTask = pCpm ? pCpm.tasks.find(x => x.id === t.id) : null;
      if (cpmFilter === "critical") matchCpm = cTask && cTask.isCritical;
      else if (cpmFilter === "slack") matchCpm = cTask && !cTask.isCritical;
    }

    return matchSearch && matchProject && matchStatus && matchPriority && matchCpm;
  });

  if (sortOption === "project") {
    list.sort((a, b) => PP.projectName(a.project || a.project_id).localeCompare(PP.projectName(b.project || b.project_id)));
  } else if (sortOption === "priority") {
    const pRank = { High: 3, Medium: 2, Low: 1 };
    list.sort((a, b) => (pRank[b.priority] || 0) - (pRank[a.priority] || 0));
  } else if (sortOption === "name") {
    list.sort((a, b) => a.name.localeCompare(b.name));
  } else if (sortOption === "progress") {
    list.sort((a, b) => b.progress - a.progress);
  } else {
    list.sort((a, b) => (a.end || "").localeCompare(b.end || ""));
  }

  $("task-body").innerHTML = list.map(t => {
    const pCpm = cpmMap.get(Number(t.project));
    const cTask = pCpm ? pCpm.tasks.find(x => x.id === t.id) : null;
    const isCrit = cTask ? cTask.isCritical : false;
    const slack = cTask ? cTask.totalFloat : 0;
    const pathBadge = isCrit
      ? '<span class="badge badge-critical" title="On Critical Path: zero float. Directly dictates completion date.">⚡ Critical</span>'
      : `<span class="badge badge-slack" title="Float / Slack buffer: can be delayed up to ${slack} days without affecting project end date.">Slack ${slack}d</span>`;

    return `<tr>
      <td><b>${PP.esc(t.name)}</b><br><span class="muted small">${PP.esc(PP.projectName(t.project))}</span></td>
      <td>${PP.esc(t.assignee)}</td>
      <td><span class="badge p-${t.priority}">${t.priority}</span></td>
      <td><select onchange="setStatus(${t.id}, this.value)">${["To Do", "In Progress", "Done"].map(s => `<option ${s === t.status ? "selected" : ""}>${s}</option>`).join("")}</select></td>
      <td>${t.end}</td>
      <td style="min-width:90px"><div class="bar"><i style="width:${t.progress}%"></i></div></td>
      <td>${pathBadge}</td>
      <td><button class="link-btn" onclick="PP.openTask(${t.id})">Edit</button><button class="link-btn del" onclick="removeTask(${t.id})">Delete</button></td>
    </tr>`;
  }).join("") || '<tr><td colspan="8" class="empty">No tasks match. Try clearing filters or add a task.</td></tr>';
};

window.setStatus = async (id, status) => {
  const t = PP.data.tasks.find(x => Number(x.id) === Number(id));
  if (!t) return;
  const oldStatus = t.status;
  const oldProgress = t.progress;
  let progress = t.progress;
  if (status === "Done") progress = 100;
  if (status === "To Do") progress = 0;
  t.status = status;
  t.progress = progress;

  try {
    if (PP.api && PP.api.tasks) {
      const updated = await PP.api.tasks.update(id, { status, progress });
      Object.assign(t, PP.adapters.taskFromBackend(updated));
    }
    PP.toast("Status updated.");
    PP.refresh();
  } catch (err) {
    t.status = oldStatus;
    t.progress = oldProgress;
    PP.toast("Failed to update status: " + err.message, "error");
    PP.refresh();
  }
};

window.removeTask = async id => {
  if (!confirm("Delete this task?")) return;
  try {
    if (PP.api && PP.api.tasks) {
      await PP.api.tasks.delete(id);
    }
    PP.data.tasks = PP.data.tasks.filter(t => Number(t.id) !== Number(id));
    PP.data.tasks.forEach(t => {
      if (Number(t.dep) === Number(id)) t.dep = 0;
      if (Array.isArray(t.deps)) t.deps = t.deps.filter(d => Number(d) !== Number(id));
    });
    PP.save();
    PP.toast("Task deleted.");
    if (PP.page === "projects" && PP.selectedProjectId) {
      const currentProj = PP.data.projects.find(p => Number(p.id) === Number(PP.selectedProjectId));
      if (currentProj && PP.renderProjectDetails) {
        PP.renderProjectDetails(currentProj);
      } else {
        PP.refresh();
      }
    } else {
      PP.refresh();
    }
  } catch (err) {
    PP.toast("Failed to delete task: " + err.message, "error");
  }
};

const opts = (arr, sel) => arr.map(([v, l]) => `<option value="${v}" ${v == sel ? "selected" : ""}>${PP.esc(l)}</option>`).join("");

function renderDepsCheckboxes(currentTaskId, selectedProjectId, currentDeps) {
  const container = $("f-deps-list");
  if (!container) return;
  const projectTasks = PP.data.tasks.filter(x => Number(x.id) !== Number(currentTaskId) && Number(x.project || x.project_id) === Number(selectedProjectId));
  if (!projectTasks.length) {
    container.innerHTML = '<span class="muted small">No other tasks in this project yet to depend on.</span>';
    return;
  }
  container.innerHTML = projectTasks.map(t => {
    const isChecked = currentDeps.map(Number).includes(Number(t.id));
    return `
      <label class="dep-choice-item">
        <input type="checkbox" value="${t.id}" ${isChecked ? "checked" : ""}>
        <span>${PP.esc(t.name)}</span>
      </label>
    `;
  }).join("");

  container.onchange = () => {
    const checked = [...container.querySelectorAll('input[type="checkbox"]:checked')].map(i => Number(i.value));
    $("f-dep").value = checked[0] || 0;
  };
}

PP.openTask = (id, projectId) => {
  editingId = id || null;
  const defProj = projectId || PP.selectedProjectId || (PP.data.projects[0] || {}).id;
  const t = id
    ? PP.data.tasks.find(x => Number(x.id) === Number(id))
    : { project: defProj, assignee: "", name: "", start: PP.day(0), end: PP.day(7), priority: "Medium", status: "To Do", progress: 0, dep: 0, deps: [] };

  PP.ensureTaskDefaults(t);

  $("modal-title").textContent = id ? "Edit task" : "Add task";
  $("f-project").innerHTML = opts(PP.data.projects.map(p => [p.id, p.name]), t.project || t.project_id);

  const cleanTeam = (PP.data.team || []).filter(m => m && m !== "Unassigned" && String(m).trim().length > 0);
  const assigneeOpts = [["", "Unassigned"]].concat(cleanTeam.map(m => [m, m]));
  const currentAssignee = (t.assignee && t.assignee !== "Unassigned") ? t.assignee : "";
  $("f-assignee").innerHTML = opts(assigneeOpts, currentAssignee);

  const deleteBtn = $("f-delete");
  if (deleteBtn) {
    deleteBtn.classList.toggle("hidden", !id);
    deleteBtn.onclick = () => {
      $("task-modal").classList.add("hidden");
      window.removeTask(id);
    };
  }

  const availableTasks = PP.data.tasks.filter(x => Number(x.id) !== Number(id) && Number(x.project || x.project_id) === Number(t.project || t.project_id));
  $("f-dep").innerHTML = opts([[0, "None"]].concat(availableTasks.map(x => [x.id, x.name])), t.dep);

  $("f-name").value = t.name;
  $("f-start").value = t.start;
  $("f-end").value = t.end;
  $("f-priority").value = t.priority;
  $("f-status").value = t.status;
  $("f-progress").value = t.progress;

  // PERT inputs
  const dur = Math.max(1, PP.diff(t.start, t.end) + 1);
  $("f-likely").value = t.likely || dur;
  $("f-opt").value = t.opt || Math.max(1, Math.round(Number($("f-likely").value) * 0.75));
  $("f-pess").value = t.pess || Math.max(Number($("f-likely").value) + 1, Math.round(Number($("f-likely").value) * 1.5));

  updateModalPertPreview();

  // Multi-predecessor checkboxes
  const currentDeps = Array.isArray(t.deps) && t.deps.length ? t.deps : (t.dep ? [t.dep] : []);
  renderDepsCheckboxes(id, t.project || t.project_id, currentDeps);

  $("f-project").onchange = () => {
    const selProj = Number($("f-project").value);
    const avail = PP.data.tasks.filter(x => Number(x.id) !== Number(id) && Number(x.project || x.project_id) === selProj);
    $("f-dep").innerHTML = opts([[0, "None"]].concat(avail.map(x => [x.id, x.name])), 0);
    renderDepsCheckboxes(id, selProj, []);
  };

  $("f-dep").onchange = () => {
    const selDep = Number($("f-dep").value);
    const container = $("f-deps-list");
    if (container) {
      container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.checked = Number(cb.value) === selDep;
      });
    }
  };

  $("f-error").textContent = "";
  $("task-modal").classList.remove("hidden");
};

document.addEventListener("DOMContentLoaded", () => {
  ["t-search", "t-status", "t-priority", "t-cpm", "t-project", "t-sort"].forEach(i => {
    const el = $(i);
    if (el) {
      el.addEventListener("input", PP.renders.tasks);
      el.addEventListener("change", PP.renders.tasks);
    }
  });

  $("add-task").onclick = () => PP.data.projects.length ? PP.openTask() : PP.toast("Create a project first.", "error");
  $("f-cancel").onclick = () => $("task-modal").classList.add("hidden");

  // Real-time preview of PERT calculation in task modal
  ["f-opt", "f-likely", "f-pess"].forEach(id => {
    const el = $(id);
    if (el) el.addEventListener("input", updateModalPertPreview);
  });

  // Auto-fill PERT estimates button
  const autoBtn = $("f-autofill-pert");
  if (autoBtn) {
    autoBtn.onclick = () => {
      const s = $("f-start").value, en = $("f-end").value;
      if (!s || !en) return ($("f-error").textContent = "Set start and deadline dates first.");
      const dur = Math.max(1, PP.diff(s, en) + 1);
      $("f-likely").value = dur;
      $("f-opt").value = Math.max(1, Math.round(dur * 0.75));
      $("f-pess").value = Math.max(dur + 1, Math.round(dur * 1.5));
      updateModalPertPreview();
      PP.toast("PERT estimates auto-calculated from schedule dates.");
    };
  }

  $("task-form").onsubmit = async e => {
    e.preventDefault();
    const name = $("f-name").value.trim(), s = $("f-start").value, en = $("f-end").value, pg = +$("f-progress").value;
    if (!name) return $("f-error").textContent = "Task name is required.";
    if (!s || !en) return $("f-error").textContent = "Choose start and deadline dates.";
    if (en < s) return $("f-error").textContent = "The deadline can't be before the start date.";
    if (!(pg >= 0 && pg <= 100)) return $("f-error").textContent = "Progress must be 0 to 100.";

    let opt = parseFloat($("f-opt").value) || Math.max(1, Math.round((PP.diff(s, en) + 1) * 0.75));
    let likely = parseFloat($("f-likely").value) || Math.max(1, PP.diff(s, en) + 1);
    let pess = parseFloat($("f-pess").value) || Math.max(likely + 1, Math.round(likely * 1.5));

    if (opt > likely) opt = likely;
    if (pess < likely) pess = likely;

    // Collect checked predecessors
    const depBoxes = [...($("f-deps-list") ? $("f-deps-list").querySelectorAll('input[type="checkbox"]:checked') : [])];
    let deps = depBoxes.map(b => Number(b.value));
    const singleDep = +$("f-dep").value;
    if (singleDep && !deps.includes(singleDep)) deps.push(singleDep);
    if (!deps.length && singleDep) deps = [singleDep];

    if (editingId) {
      deps = deps.filter(id => Number(id) !== Number(editingId));
    }

    const data = {
      project: +$("f-project").value,
      project_id: +$("f-project").value,
      name,
      start: s,
      end: en,
      progress: pg,
      assignee: $("f-assignee").value,
      status: $("f-status").value,
      priority: $("f-priority").value,
      dep: deps[0] || 0,
      deps: deps,
      opt,
      likely,
      pess
    };

    const submitBtn = $("task-form").querySelector('button:not([type="button"])');
    if (submitBtn) submitBtn.disabled = true;
    $("f-error").textContent = "";

    try {
      if (PP.api && PP.api.tasks) {
        if (editingId) {
          const updatePayload = PP.adapters.taskToBackend(data, true);
          await PP.api.tasks.update(editingId, updatePayload);
          if (PP.adapters.syncTaskDependencies) {
            await PP.adapters.syncTaskDependencies(editingId, deps);
          }
          const fresh = await PP.api.tasks.get(editingId);
          const adapted = PP.adapters.taskFromBackend(fresh);
          const idx = PP.data.tasks.findIndex(t => Number(t.id) === Number(editingId));
          if (idx !== -1) PP.data.tasks[idx] = adapted;
        } else {
          const createPayload = PP.adapters.taskToBackend(data, false);
          const serverTask = await PP.api.tasks.create(createPayload);
          const adapted = PP.adapters.taskFromBackend(serverTask);
          PP.data.tasks.push(adapted);
        }
      } else {
        if (editingId) Object.assign(PP.data.tasks.find(t => Number(t.id) === Number(editingId)), data);
        else PP.data.tasks.push(Object.assign({ id: PP.nextId(PP.data.tasks) }, data));
      }

      PP.save();
      $("task-modal").classList.add("hidden");
      if (PP.page === "projects" && PP.selectedProjectId) {
        const currentProj = PP.data.projects.find(p => Number(p.id) === Number(PP.selectedProjectId));
        if (currentProj && PP.renderProjectDetails) {
          PP.renderProjectDetails(currentProj);
        } else {
          PP.refresh();
        }
      } else {
        PP.refresh();
      }
      PP.toast(editingId ? "Task updated." : "Task added.");
    } catch (apiErr) {
      $("f-error").textContent = apiErr.message;
      PP.toast(apiErr.message, "error");
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  };
});
