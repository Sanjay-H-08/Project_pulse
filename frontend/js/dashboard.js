// dashboard.js: stat cards, overall progress, recent projects, deadlines, activity feed, intelligence summary.
PP.renders.dashboard = () => {
  const { projects, tasks } = PP.data;
  const active = projects.filter(p => p.status === "Active").length;
  const pending = tasks.filter(t => t.status !== "Done").length;

  // Task analysis across all projects
  const analyzedTasks = tasks.map(t => ({
    task: t,
    info: PP.analyzeTask ? PP.analyzeTask(t) : { isOverdue: false, isBlocked: false, isCritical: false }
  }));

  const overdueCount = analyzedTasks.filter(x => x.info.isOverdue).length;
  const blockedCount = analyzedTasks.filter(x => x.info.isBlocked).length;
  const criticalCount = analyzedTasks.filter(x => x.info.isCritical).length;

  const stats = [
    { label: "Total projects", val: projects.length, color: "var(--primary)" },
    { label: "Active projects", val: active, color: "var(--secondary)" },
    { label: "Pending tasks", val: pending, color: "var(--muted)" },
    { label: "Overdue tasks", val: overdueCount, color: overdueCount > 0 ? "var(--danger)" : "var(--muted)", warn: overdueCount > 0 },
    { label: "Blocked tasks", val: blockedCount, color: blockedCount > 0 ? "var(--warn)" : "var(--muted)", warn: blockedCount > 0 },
    { label: "Critical activities", val: criticalCount, color: "var(--cpm-critical)" }
  ];

  $("stats").innerHTML = stats.map(s => `
    <div class="stat ${s.warn ? 'stat-warning' : ''}" style="border-left-color: ${s.color}">
      <b style="color: ${s.warn ? s.color : 'inherit'}">${s.val}</b>
      <span>${s.label}</span>
    </div>
  `).join("");

  const overall = tasks.length ? Math.round(tasks.reduce((a, t) => a + t.progress, 0) / tasks.length) : 0;
  $("overall").innerHTML = `<div class="big-pct">${overall}%</div><div class="bar"><i style="width:${overall}%"></i></div>`;

  $("recent").innerHTML = projects.slice(-4).reverse().map(p => {
    const pr = PP.projectProgress(p.id);
    return `
      <div class="item">
        <div class="item-top">
          <a href="#projects" onclick="PP.selectedProjectId=${p.id}; PP.showPage('projects'); return false;">
            <b>${PP.esc(p.name)}</b>
          </a>
          <span>${pr}%</span>
        </div>
        <div class="bar"><i style="width:${pr}%"></i></div>
      </div>
    `;
  }).join("") || '<p class="empty">No projects yet. Create your first one.</p>';

  const today = PP.day(0);

  // Deadlines & Radar
  const upcoming = analyzedTasks
    .filter(x => !x.info.isDone)
    .sort((a, b) => {
      // Prioritize overdue, then earliest end date
      if (a.info.isOverdue && !b.info.isOverdue) return -1;
      if (!a.info.isOverdue && b.info.isOverdue) return 1;
      return (a.task.end || "").localeCompare(b.task.end || "");
    })
    .slice(0, 7);

  $("deadlines").innerHTML = upcoming.map(({ task: t, info }) => {
    const left = PP.diff(today, t.end);
    let txt = left < 0 ? `${Math.abs(left)}d overdue` : left === 0 ? "Due today" : `${left}d left`;
    
    let badges = [];
    if (info.isCritical) badges.push('<span class="badge badge-critical" style="font-size:0.65rem;padding:1px 6px">⚡ Critical</span>');
    if (info.isOverdue) badges.push(`<span class="badge badge-overdue" style="font-size:0.65rem;padding:1px 6px">⚠️ Overdue (${info.overdueDays}d)</span>`);
    if (info.isBlocked) badges.push(`<span class="badge badge-blocked" style="font-size:0.65rem;padding:1px 6px" title="Blocked by ${PP.esc(info.blockedBy.join(', '))}">🚫 Blocked</span>`);

    return `
      <div class="item deadline-item ${info.isOverdue ? 'item-overdue' : (info.isBlocked ? 'item-blocked' : '')}" onclick="PP.openTask(${t.id})" style="cursor:pointer" title="Click to view/edit task">
        <div class="item-top">
          <span><b>${PP.esc(t.name)}</b> ${badges.join(" ")}</span>
          <span class="${left < 0 ? "late" : "muted"} small">${txt}</span>
        </div>
        <div class="row-between" style="margin-bottom:0">
          <span class="muted small">${PP.esc(t.assignee || 'Unassigned')} · ${PP.esc(PP.projectName(t.project))}</span>
          <span class="small" style="font-weight:600">${t.progress}%</span>
        </div>
      </div>
    `;
  }).join("") || '<p class="empty">No pending deadlines. Nice work!</p>';

  // Render Recent Activity Feed
  const activityContainer = $("activity-feed-box");
  if (activityContainer) {
    const activities = PP.getActivities ? PP.getActivities().slice(0, 5) : [];
    activityContainer.innerHTML = activities.map(act => `
      <div class="activity-row">
        <div class="activity-icon">${act.icon || '📌'}</div>
        <div class="activity-content">
          <div class="activity-msg">${PP.esc(act.message)}</div>
          <div class="activity-time">${PP.esc(act.time || 'Recently')}</div>
        </div>
      </div>
    `).join("") || '<p class="empty">No recent activity recorded.</p>';
  }

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
      <div class="card" style="border-left: 4px solid var(--primary); padding: 18px 22px;">
        <div class="row-between" style="flex-wrap: wrap; margin-bottom: 12px;">
          <div>
            <span class="eyebrow" style="color:var(--primary)">INDUSTRIAL INTELLIGENCE & TELEMETRY</span>
            <h3 style="font-size:1.1rem; margin-top:2px;">Project Health, Delay Forecast & Monte Carlo Radar</h3>
          </div>
          <div style="display:flex; gap:8px; flex-wrap:wrap">
            <a href="#risk-analysis" class="btn ghost small-btn">🛡️ Risk Matrix</a>
            <a href="#delay-prediction" class="btn ghost small-btn">⏱️ Delay Prediction</a>
            <a href="#whatif-simulator" class="btn ghost small-btn">🧪 What-If Simulator</a>
          </div>
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px;">
          <div style="background:var(--bg); padding:12px 14px; border-radius:8px; border:1px solid var(--border)">
            <span class="muted small" style="display:block; font-weight:600">Project Health Score</span>
            <strong style="font-size:1.45rem">${health.score}/100</strong>
            <div class="small" style="color:${health.class === 'crit' ? 'var(--danger)' : (health.class === 'warn' ? 'var(--warn)' : 'var(--success)')}; font-weight:600">${health.label}</div>
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
            <div class="small muted">5,000 runs DAG ready</div>
          </div>
        </div>
      </div>
    `;
  }
};
