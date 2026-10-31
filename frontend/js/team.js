// team.js: add and display team members, assigned tasks and workload.
PP.renders.team = () => {
  const cleanTeam = (PP.data.team || []).filter(m => m && m !== "Unassigned" && String(m).trim().length > 0);
  const open = PP.data.tasks.filter(t => t.status !== "Done");
  const maxLoad = Math.max(1, ...cleanTeam.map(m => open.filter(t => t.assignee === m).length));
  $("team-cards").innerHTML = cleanTeam.map(m => {
    const mine = PP.data.tasks.filter(t => t.assignee === m);
    const done = mine.filter(t => t.status === "Done").length;
    const load = open.filter(t => t.assignee === m).length;
    const pct = mine.length ? Math.round(done / mine.length * 100) : 0;
    const info = (PP.data.teamDetails || {})[m] || {};
    const projectCount = PP.data.projects.filter(p => (Array.isArray(p.teamMembers) && p.teamMembers.includes(m)) || PP.data.tasks.some(t => Number(t.project || t.project_id) === Number(p.id) && t.assignee === m)).length;
    return `<div class="card member"><div class="row-between"><div class="avatar">${PP.esc(m[0].toUpperCase())}</div><span class="badge">${projectCount} project${projectCount === 1 ? "" : "s"}</span></div>
      <h3>${PP.esc(m)}</h3><span class="muted small">${PP.esc(info.role || "Team member")}</span>
      ${info.email ? `<p class="muted small">${PP.esc(info.email)}</p>` : ""}
      <span class="muted small">${mine.length} assigned · ${done} completed (${pct}%)</span>
      <div class="member-stats"><span>Workload</span><span>${load} open task${load === 1 ? "" : "s"}</span></div>
      <div class="bar"><i style="width:${load / maxLoad * 100}%"></i></div></div>`;
  }).join("") || '<p class="empty">No team members yet. Add your first member.</p>';
};

document.addEventListener("DOMContentLoaded", () => {
  $("add-member").onclick = () => {
    $("member-form").reset(); $("member-error").textContent = "";
    $("member-modal").classList.remove("hidden");
    $("member-name").focus();
  };
  $("member-cancel").onclick = () => $("member-modal").classList.add("hidden");
  $("member-form").onsubmit = event => {
    event.preventDefault();
    const name = $("member-name").value.trim();
    const email = $("member-email").value.trim();
    const role = $("member-role").value.trim();
    if (!name) return $("member-error").textContent = "Enter the member's name.";
    if (name.toLowerCase() === "unassigned")
      return $("member-error").textContent = "Name cannot be 'Unassigned'.";
    if (PP.data.team.some(m => m.toLowerCase() === name.toLowerCase()))
      return $("member-error").textContent = "This team member already exists.";
    PP.data.team.push(name);
    PP.data.teamDetails = PP.data.teamDetails || {};
    PP.data.teamDetails[name] = { email, role };
    PP.save();
    $("member-modal").classList.add("hidden");
    PP.renders.team();
    PP.toast("Team member added. You can now assign them to projects and tasks.");
  };
});
