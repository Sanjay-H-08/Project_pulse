// projects.js: project list and the 3-step creation wizard.
let step = 1, plan = [];
PP.wizardOpen = false;

PP.startWizard = () => {
  PP.wizardOpen = true; step = 1; plan = [];
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

// MOCK AI: later, replace the body with fetch("http://localhost:3000/api/generate-plan", ...)
// so your backend calls Gemini. Never put the API key in this file.
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
  $("plan-preview").innerHTML = plan.map(t => `<div class="plan-row"><b>${t.name}</b><span class="muted">${t.assignee} · ${t.start} to ${t.end}</span></div>`).join("");
  PP.toast("Sample AI plan generated. Review it, then create the project.");
}

function renderProjects() {
  $("project-list").classList.toggle("hidden", PP.wizardOpen);
  $("wizard").classList.toggle("hidden", !PP.wizardOpen);
  if (PP.wizardOpen) return showStep();
  $("project-cards").innerHTML = PP.data.projects.map(p => {
    const pr = PP.projectProgress(p.id);
    return `<div class="card proj-card"><div class="row-between"><h3>${PP.esc(p.name)}</h3><span class="badge status-${p.status}">${p.status}</span></div>
      <p>${PP.esc(p.desc || "No description")}</p><div class="bar"><i style="width:${pr}%"></i></div>
      <div class="proj-meta"><span>${pr}% done</span><span>Due ${p.deadline}</span></div>
      <button class="link-btn" onclick="toggleProject(${p.id})">Mark ${p.status === "Active" ? "completed" : "active"}</button>
      <button class="link-btn del" onclick="deleteProject(${p.id})">Delete</button></div>`;
  }).join("") || '<p class="empty">No projects yet. Click "New Project" to start.</p>';
}
PP.renders.projects = renderProjects;

window.toggleProject = id => {
  const p = PP.data.projects.find(x => x.id === id);
  p.status = p.status === "Active" ? "Completed" : "Active"; PP.save(); renderProjects();
};
window.deleteProject = id => {
  if (!confirm("Delete this project and all its tasks?")) return;
  PP.data.projects = PP.data.projects.filter(p => p.id !== id);
  PP.data.tasks = PP.data.tasks.filter(t => t.project !== id);
  PP.save(); renderProjects(); PP.toast("Project deleted.");
};

document.addEventListener("DOMContentLoaded", () => {
  $("gen-plan").onclick = () => $("p-deadline").value ? generatePlan() : ($("wizard-error").textContent = "Set a deadline in step 2 first.");
  $("wiz-back").onclick = () => { if (step === 1) { PP.wizardOpen = false; renderProjects(); } else { step--; showStep(); } };
  $("wiz-next").onclick = () => {
    const err = validateStep();
    if (err) return $("wizard-error").textContent = err;
    if (step < 3) { step++; return showStep(); }
    const id = PP.nextId(PP.data.projects);
    PP.data.projects.push({ id, name: $("p-name").value.trim(), desc: $("p-desc").value.trim(), deadline: $("p-deadline").value, members: +$("p-members").value, status: "Active", req: $("p-req").value.trim() });
    let tid = PP.nextId(PP.data.tasks);
    plan.forEach((t, i) => PP.data.tasks.push({ id: tid + i, project: id, name: t.name, start: t.start, end: t.end, progress: 0, assignee: t.assignee, status: "To Do", priority: "Medium", dep: i ? tid + i - 1 : 0 }));
    PP.save(); PP.wizardOpen = false; PP.toast("Project created!"); renderProjects();
  };
});
