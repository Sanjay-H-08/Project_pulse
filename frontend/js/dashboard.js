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
  // Pre-calculate CPM across projects to flag critical path tasks
  const criticalSet = new Set();
  if (PP.cpm) {
    projects.forEach(p => {
      const res = PP.cpm.calculate(p.id);
      res.criticalTaskIds.forEach(id => criticalSet.add(id));
    });
  }

  const upcoming = tasks.filter(t => t.status !== "Done").sort((a, b) => a.end.localeCompare(b.end)).slice(0, 6);
  $("deadlines").innerHTML = upcoming.map(t => {
    const left = PP.diff(today, t.end);
    const txt = left < 0 ? Math.abs(left) + " days overdue" : left === 0 ? "Due today" : left + " days left";
    const isCrit = criticalSet.has(t.id);
    const critTag = isCrit ? '<span class="badge badge-critical" style="font-size:0.65rem;padding:1px 6px;margin-left:6px" title="Critical Path Activity">⚡ Critical</span>' : '';
    return `<div class="item"><div class="item-top"><span>${PP.esc(t.name)}${critTag}</span><span class="${left < 0 ? "late" : "muted"} small">${txt}</span></div><span class="muted small">${PP.esc(t.assignee)} · ${PP.esc(PP.projectName(t.project))}</span></div>`;
  }).join("") || '<p class="empty">No pending deadlines. Nice work!</p>';

  // Project Health, Delay & What-If Intelligence Summary Widget
  const intelElem = $("dashboard-intelligence");
  if (intelElem) {
    const activeProject = projects.find(p => p.status === "Active") || projects[0];
    let health = { score: 85, label: "Healthy", class: "safe" };
    if (PP.riskEngine) {
      health = PP.riskEngine.calculateHealthIndex(activeProject ? activeProject.id : "all");
    }

    let delayInfo = { slip: 0, spi: 1.0, label: "On Track" };
    if (PP.delayEngine && activeProject) {
      const dRes = PP.delayEngine.evaluateProject(activeProject.id);
      if (dRes) {
        delayInfo = {
          slip: dRes.maxMilestoneSlip,
          spi: dRes.projectSPI,
          label: dRes.riskLabel
        };
      }
    }

    const openRisks = (PP.data.risks || []).filter(r => r.status !== "Closed").length;
    const critRisks = (PP.data.risks || []).filter(r => {
      const s = Number(r.likelihood) * Number(r.impact);
      return s >= 16 && r.status !== "Closed";
    }).length;

    intelElem.innerHTML = `
      <div class="card" style="border-left: 4px solid var(--primary); padding: 20px 24px;">
        <div class="row-between" style="flex-wrap: wrap; margin-bottom: 14px;">
          <div>
            <span class="eyebrow" style="color:var(--primary)">INTELLIGENCE & RISK SUMMARY</span>
            <h3 style="font-size:1.15rem; margin-top:2px;">Project Health, Delay Forecast & Simulation</h3>
          </div>
          <div style="display:flex; gap:8px; flex-wrap:wrap">
            <a href="#risk-analysis" class="btn ghost small-btn">🛡️ Risk Matrix</a>
            <a href="#delay-prediction" class="btn ghost small-btn">⏱️ Delay Prediction</a>
            <a href="#whatif-simulator" class="btn ghost small-btn">🧪 What-If Simulator</a>
          </div>
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px;">
          <div style="background:var(--bg); padding:12px 14px; border-radius:8px; border:1px solid var(--border)">
            <span class="muted small" style="display:block; font-weight:600">Project Health Score</span>
            <strong style="font-size:1.45rem">${health.score}/100</strong>
            <div class="small" style="color:${health.class === 'crit' ? 'var(--danger)' : (health.class === 'warn' ? '#b45309' : 'var(--success)')}; font-weight:600">${health.label}</div>
          </div>
          <div style="background:var(--bg); padding:12px 14px; border-radius:8px; border:1px solid var(--border)">
            <span class="muted small" style="display:block; font-weight:600">Active Risk Register</span>
            <strong style="font-size:1.45rem">${openRisks} Open</strong>
            <div class="small ${critRisks > 0 ? 'late' : 'muted'}">${critRisks} critical exposure</div>
          </div>
          <div style="background:var(--bg); padding:12px 14px; border-radius:8px; border:1px solid var(--border)">
            <span class="muted small" style="display:block; font-weight:600">Predictive Delay</span>
            <strong style="font-size:1.45rem">${delayInfo.slip > 0 ? `+${delayInfo.slip}d slip` : '0d (On Time)'}</strong>
            <div class="small muted">SPI: ${delayInfo.spi.toFixed(2)} (${delayInfo.label})</div>
          </div>
          <div style="background:var(--bg); padding:12px 14px; border-radius:8px; border:1px solid var(--border)">
            <span class="muted small" style="display:block; font-weight:600">What-If Scenarios</span>
            <strong style="font-size:1.45rem">Monte Carlo</strong>
            <div class="small muted">5,000-run simulation ready</div>
          </div>
        </div>
      </div>
    `;
  }
};
