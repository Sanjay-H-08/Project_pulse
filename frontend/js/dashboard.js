// dashboard.js: stat cards, overall progress, recent projects, deadlines.
PP.renders.dashboard = () => {
  const { projects, tasks } = PP.data;
  const active = projects.filter(p => p.status === "Active").length;
  const pending = tasks.filter(t => t.status !== "Done").length;
  const stats = [["Total projects", projects.length], ["Active projects", active],
                 ["Completed projects", projects.length - active], ["Pending tasks", pending]];
  $("stats").innerHTML = stats.map(s => `<div class="stat"><b>${s[1]}</b><span>${s[0]}</span></div>`).join("");

  const overall = tasks.length ? Math.round(tasks.reduce((a, t) => a + t.progress, 0) / tasks.length) : 0;
  $("overall").innerHTML = `<div class="big-pct">${overall}%</div><div class="bar"><i style="width:${overall}%"></i></div>`;

  $("recent").innerHTML = projects.slice(-4).reverse().map(p => {
    const pr = PP.projectProgress(p.id);
    return `<div class="item"><div class="item-top"><span>${PP.esc(p.name)}</span><span>${pr}%</span></div><div class="bar"><i style="width:${pr}%"></i></div></div>`;
  }).join("") || '<p class="empty">No projects yet. Create your first one.</p>';

  const today = PP.day(0);
  const upcoming = tasks.filter(t => t.status !== "Done").sort((a, b) => a.end.localeCompare(b.end)).slice(0, 6);
  $("deadlines").innerHTML = upcoming.map(t => {
    const left = PP.diff(today, t.end);
    const txt = left < 0 ? Math.abs(left) + " days overdue" : left === 0 ? "Due today" : left + " days left";
    return `<div class="item"><div class="item-top"><span>${PP.esc(t.name)}</span><span class="${left < 0 ? "late" : "muted"} small">${txt}</span></div><span class="muted small">${PP.esc(t.assignee)} · ${PP.esc(PP.projectName(t.project))}</span></div>`;
  }).join("") || '<p class="empty">No pending deadlines. Nice work!</p>';
};
