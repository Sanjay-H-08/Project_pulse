// team.js: members, assigned tasks, completion and workload.
PP.renders.team = () => {
  const open = PP.data.tasks.filter(t => t.status !== "Done");
  const maxLoad = Math.max(1, ...PP.data.team.map(m => open.filter(t => t.assignee === m).length));
  $("team-cards").innerHTML = PP.data.team.map(m => {
    const mine = PP.data.tasks.filter(t => t.assignee === m), done = mine.filter(t => t.status === "Done").length;
    const load = open.filter(t => t.assignee === m).length;
    const pct = mine.length ? Math.round(done / mine.length * 100) : 0;
    return `<div class="card member"><div class="avatar">${PP.esc(m[0])}</div><h3>${PP.esc(m)}</h3>
      <span class="muted small">${mine.length} assigned · ${done} completed (${pct}%)</span>
      <div class="member-stats"><span>Workload</span><span>${load} open task${load === 1 ? "" : "s"}</span></div>
      <div class="bar"><i style="width:${load / maxLoad * 100}%"></i></div></div>`;
  }).join("");
};
