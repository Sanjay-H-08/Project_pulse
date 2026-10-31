// gantt.js: custom Gantt chart with interactive dependency links, blocked/overdue flags, and Critical Path highlighting.
let dayWidth = 28;
let showCriticalPath = false;
const cls = { "To Do": "s-todo", "In Progress": "s-prog", "Done": "s-done" };

PP.renders.gantt = () => {
  const selector = $("gantt-project");
  if (selector) {
    const previous = PP.ganttProjectId ? String(PP.ganttProjectId) : (selector.value || "all");
    selector.innerHTML = '<option value="all">All projects</option>' +
      PP.data.projects.map(p => `<option value="${p.id}">${PP.esc(p.name)}</option>`).join("");
    selector.value = PP.data.projects.some(p => String(p.id) === previous) ? previous : "all";
    PP.ganttProjectId = selector.value === "all" ? null : Number(selector.value);
  }
  const chosen = selector && selector.value !== "all" ? Number(selector.value) : null;
  const tasks = PP.data.tasks.filter(t => chosen === null || Number(t.project || t.project_id) === chosen)
    .slice().sort((a, b) => a.start.localeCompare(b.start));

  const critLegend = $("gantt-crit-legend");
  if (critLegend) critLegend.classList.toggle("hidden", !showCriticalPath);

  const critBtn = $("toggle-critical-path");
  if (critBtn) {
    critBtn.classList.toggle("active", showCriticalPath);
    critBtn.textContent = showCriticalPath ? "✓ Critical Path On" : "⚡ Highlight Critical Path";
  }

  if (!tasks.length) return $("gantt").innerHTML = '<p class="empty">No tasks yet. Add tasks to see the timeline.</p>';

  // Calculate CPM to identify critical path tasks and floats
  const cpmTasksMap = new Map();
  if (PP.cpm) {
    if (chosen !== null) {
      const res = PP.cpm.calculate(chosen);
      res.tasks.forEach(ct => cpmTasksMap.set(ct.id, ct));
    } else {
      PP.data.projects.forEach(p => {
        const res = PP.cpm.calculate(p.id);
        res.tasks.forEach(ct => cpmTasksMap.set(ct.id, ct));
      });
    }
  }

  const first = tasks.reduce((m, t) => t.start < m ? t.start : m, PP.day(0));
  const last = tasks.reduce((m, t) => t.end > m ? t.end : m, PP.day(0));
  const total = PP.diff(first, last) + 2;

  let days = "";
  for (let i = 0; i < total; i++) {
    const d = new Date(first); d.setDate(d.getDate() + i);
    const label = dayWidth >= 24 ? d.getDate() : (i % 7 === 0 ? d.toLocaleDateString("en", { day: "numeric", month: "short" }) : "");
    days += `<div class="g-day" style="width:${dayWidth}px">${label}</div>`;
  }

  const left = tasks.map(t => {
    const ct = cpmTasksMap.get(t.id);
    const isCrit = ct ? ct.isCritical : false;
    const slack = ct ? ct.totalFloat : 0;
    const tInfo = PP.analyzeTask ? PP.analyzeTask(t) : { isOverdue: false, isBlocked: false };

    let statusTags = [];
    if (tInfo.isOverdue) statusTags.push(`<span class="badge badge-overdue" style="font-size:0.65rem;padding:1px 5px">⚠️ Overdue (${tInfo.overdueDays}d)</span>`);
    if (tInfo.isBlocked) statusTags.push(`<span class="badge badge-blocked" style="font-size:0.65rem;padding:1px 5px" title="Blocked by ${PP.esc(tInfo.blockedBy.join(', '))}">🚫 Blocked</span>`);

    if (showCriticalPath) {
      if (isCrit) statusTags.push('<span class="badge badge-critical" style="font-size:0.65rem;padding:1px 5px">CRITICAL</span>');
      else statusTags.push(`<span class="badge badge-slack" style="font-size:0.65rem;padding:1px 5px">Slack ${slack}d</span>`);
    }

    return `<div class="g-row g-info" data-task-id="${t.id}" onclick="PP.openTask(${t.id})" style="cursor:pointer" title="Click to edit task">
      <div><b>${PP.esc(t.name)}</b> ${statusTags.join(" ")}</div>
      <small>${PP.esc(t.assignee || 'Unassigned')} · ${PP.diff(t.start, t.end) + 1} days${t.dep ? " · after " + PP.esc((PP.data.tasks.find(x => x.id === t.dep) || { name: "?" }).name) : ""}</small>
    </div>`;
  }).join("");

  // Build SVG dependency links
  const taskIndexMap = new Map(tasks.map((t, idx) => [Number(t.id), idx]));
  const depPaths = [];
  tasks.forEach((t, succIdx) => {
    const deps = Array.isArray(t.deps) && t.deps.length ? t.deps : (t.dep ? [t.dep] : []);
    deps.forEach(predId => {
      const predIdx = taskIndexMap.get(Number(predId));
      if (predIdx !== undefined) {
        const pred = tasks[predIdx];
        const x1 = PP.diff(first, pred.start) * dayWidth + (PP.diff(pred.start, pred.end) + 1) * dayWidth;
        const y1 = predIdx * 64 + 32;
        const x2 = PP.diff(first, t.start) * dayWidth;
        const y2 = succIdx * 64 + 32;
        const ctPred = cpmTasksMap.get(pred.id);
        const ctSucc = cpmTasksMap.get(t.id);
        const isCritPath = ctPred && ctPred.isCritical && ctSucc && ctSucc.isCritical;
        
        const pathClass = isCritPath ? "g-dep-path crit" : "g-dep-path";
        const midX = x1 + Math.max(8, (x2 - x1) / 2);
        const d = `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`;
        depPaths.push(`<path d="${d}" class="${pathClass}" marker-end="url(#${isCritPath ? 'g-arrow-crit' : 'g-arrow'})" data-pred="${pred.id}" data-succ="${t.id}" />`);
      }
    });
  });

  const svgOverlay = `
    <svg class="g-dep-svg" style="position:absolute;top:44px;left:0;width:${total * dayWidth}px;height:${tasks.length * 64}px;pointer-events:none;z-index:2">
      <defs>
        <marker id="g-arrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="var(--muted)" />
        </marker>
        <marker id="g-arrow-crit" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#ef9292" />
        </marker>
      </defs>
      ${depPaths.join("")}
    </svg>
  `;

  const rows = tasks.map(t => {
    const ct = cpmTasksMap.get(t.id);
    const isCrit = ct ? ct.isCritical : false;
    const slack = ct ? ct.totalFloat : 0;
    const tInfo = PP.analyzeTask ? PP.analyzeTask(t) : { isOverdue: false, isBlocked: false };

    const x = PP.diff(first, t.start) * dayWidth;
    const w = (PP.diff(t.start, t.end) + 1) * dayWidth;

    const barClass = (showCriticalPath && isCrit) ? "s-crit" : cls[t.status];
    const critTitle = isCrit ? "[CRITICAL PATH - 0 Float] " : (slack > 0 ? `[Slack: ${slack}d] ` : "");
    const blockedTitle = tInfo.isBlocked ? `[BLOCKED: Waiting on ${tInfo.blockedBy.join(', ')}] ` : "";
    const overdueTitle = tInfo.isOverdue ? `[OVERDUE: ${tInfo.overdueDays} days late] ` : "";

    // Ghost float bar for non-critical activities when critical path is toggled on
    let floatBar = "";
    if (showCriticalPath && !isCrit && slack > 0) {
      const floatX = x + w;
      const floatW = slack * dayWidth;
      floatBar = `<div class="g-float-bar" style="left:${floatX}px;width:${floatW}px" title="${PP.esc(t.name)}: Can slip up to ${slack} days without delaying project completion (Total Float)."></div>`;
    }

    let extraBarClass = "";
    if (tInfo.isBlocked) extraBarClass += " s-blocked";
    if (tInfo.isOverdue) extraBarClass += " s-overdue";

    return `<div class="g-row" data-task-id="${t.id}">
      ${floatBar}
      <div class="g-bar ${barClass}${extraBarClass}" style="left:${x}px;width:${w}px" title="${critTitle}${blockedTitle}${overdueTitle}${PP.esc(t.name)}: ${t.start} to ${t.end}, ${t.progress}% (${t.status})" onclick="PP.openTask(${t.id})">
        <div class="g-fill" style="width:${t.progress}%"></div>
        <span>${tInfo.isBlocked ? '🚫 ' : (tInfo.isOverdue ? '⚠️ ' : '')}${t.progress}%</span>
      </div>
    </div>`;
  }).join("");

  const todayX = PP.diff(first, PP.day(0)) * dayWidth + dayWidth / 2;
  $("gantt").innerHTML = `
    <div class="g-wrap">
      <div class="g-left"><div class="g-head">Task &amp; Status</div>${left}</div>
      <div class="g-right" style="width:${total * dayWidth}px">
        <div class="g-days">${days}</div>
        ${svgOverlay}
        ${rows}
        <div class="g-today" style="left:${todayX}px" title="Today"></div>
      </div>
    </div>
  `;
};

document.addEventListener("DOMContentLoaded", () => {
  const zoom = (w, on, off) => { dayWidth = w; $(on).classList.add("active"); $(off).classList.remove("active"); PP.renders.gantt(); };
  $("gantt-project").onchange = () => { PP.ganttProjectId = $("gantt-project").value === "all" ? null : Number($("gantt-project").value); PP.renders.gantt(); };
  $("zoom-day").onclick = () => zoom(28, "zoom-day", "zoom-week");
  $("zoom-week").onclick = () => zoom(10, "zoom-week", "zoom-day");

  const critToggle = $("toggle-critical-path");
  if (critToggle) {
    critToggle.onclick = () => {
      showCriticalPath = !showCriticalPath;
      PP.renders.gantt();
      PP.toast(showCriticalPath ? "Critical Path & Slack buffers highlighted." : "Critical Path highlighting disabled.");
    };
  }
});
