// tasks.js: task table, search/filter, add/edit/delete modal.
let editingId = null;

PP.renders.tasks = () => {
  const q = $("t-search").value.toLowerCase(), st = $("t-status").value, pr = $("t-priority").value;
  const list = PP.data.tasks.filter(t => (!q || (t.name + t.assignee).toLowerCase().includes(q)) && (!st || t.status === st) && (!pr || t.priority === pr));
  $("task-body").innerHTML = list.map(t => `<tr>
    <td><b>${PP.esc(t.name)}</b><br><span class="muted small">${PP.esc(PP.projectName(t.project))}</span></td>
    <td>${PP.esc(t.assignee)}</td><td><span class="badge p-${t.priority}">${t.priority}</span></td>
    <td><select onchange="setStatus(${t.id}, this.value)">${["To Do", "In Progress", "Done"].map(s => `<option ${s === t.status ? "selected" : ""}>${s}</option>`).join("")}</select></td>
    <td>${t.end}</td><td style="min-width:90px"><div class="bar"><i style="width:${t.progress}%"></i></div></td>
    <td><button class="link-btn" onclick="PP.openTask(${t.id})">Edit</button><button class="link-btn del" onclick="removeTask(${t.id})">Delete</button></td></tr>`).join("")
    || '<tr><td colspan="7" class="empty">No tasks match. Try clearing the filters or add a task.</td></tr>';
};

window.setStatus = (id, status) => {
  const t = PP.data.tasks.find(x => x.id === id);
  t.status = status;
  if (status === "Done") t.progress = 100;
  if (status === "To Do") t.progress = 0;
  PP.save(); PP.refresh(); PP.toast("Status updated.");
};
window.removeTask = id => {
  if (!confirm("Delete this task?")) return;
  PP.data.tasks = PP.data.tasks.filter(t => t.id !== id);
  PP.data.tasks.forEach(t => { if (t.dep === id) t.dep = 0; });
  PP.save(); PP.refresh(); PP.toast("Task deleted.");
};

const opts = (arr, sel) => arr.map(([v, l]) => `<option value="${v}" ${v == sel ? "selected" : ""}>${PP.esc(l)}</option>`).join("");

PP.openTask = (id, projectId) => {
  editingId = id || null;
  const t = id ? PP.data.tasks.find(x => x.id === id) : { project: projectId || (PP.data.projects[0] || {}).id, assignee: PP.data.team[0], name: "", start: PP.day(0), end: PP.day(7), priority: "Medium", status: "To Do", progress: 0, dep: 0 };
  $("modal-title").textContent = id ? "Edit task" : "Add task";
  $("f-project").innerHTML = opts(PP.data.projects.map(p => [p.id, p.name]), t.project);
  $("f-assignee").innerHTML = opts(PP.data.team.map(m => [m, m]), t.assignee);
  $("f-dep").innerHTML = opts([[0, "None"]].concat(PP.data.tasks.filter(x => x.id !== id).map(x => [x.id, x.name])), t.dep);
  $("f-name").value = t.name; $("f-start").value = t.start; $("f-end").value = t.end;
  $("f-priority").value = t.priority; $("f-status").value = t.status; $("f-progress").value = t.progress;
  $("f-error").textContent = ""; $("task-modal").classList.remove("hidden");
};

document.addEventListener("DOMContentLoaded", () => {
  ["t-search", "t-status", "t-priority"].forEach(i => $(i).addEventListener("input", PP.renders.tasks));
  $("add-task").onclick = () => PP.data.projects.length ? PP.openTask() : PP.toast("Create a project first.", "error");
  $("f-cancel").onclick = () => $("task-modal").classList.add("hidden");
  $("task-form").onsubmit = e => {
    e.preventDefault();
    const name = $("f-name").value.trim(), s = $("f-start").value, en = $("f-end").value, pg = +$("f-progress").value;
    if (!name) return $("f-error").textContent = "Task name is required.";
    if (!s || !en) return $("f-error").textContent = "Choose start and deadline dates.";
    if (en < s) return $("f-error").textContent = "The deadline can't be before the start date.";
    if (!(pg >= 0 && pg <= 100)) return $("f-error").textContent = "Progress must be 0 to 100.";
    const data = { project: +$("f-project").value, name, start: s, end: en, progress: pg, assignee: $("f-assignee").value, status: $("f-status").value, priority: $("f-priority").value, dep: +$("f-dep").value };
    if (editingId) Object.assign(PP.data.tasks.find(t => t.id === editingId), data);
    else PP.data.tasks.push(Object.assign({ id: PP.nextId(PP.data.tasks) }, data));
    PP.save(); $("task-modal").classList.add("hidden"); PP.refresh(); PP.toast(editingId ? "Task updated." : "Task added.");
  };
});
