// gantt.js: custom Gantt chart made of plain HTML + CSS with Critical Path highlighting.
// Each bar is positioned with: left = days from timeline start * pixels per day.
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
  const tasks = PP.data.tasks.filter(t => chosen === null || Number(t.project) === chosen)
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
    const cpmTag = showCriticalPath
      ? (isCrit
          ? '<span class="badge badge-critical" style="font-size:0.68rem;padding:1px 6px;margin-left:4px">CRITICAL</span>'
          : `<span class="badge badge-slack" style="font-size:0.68rem;padding:1px 6px;margin-left:4px">Slack ${slack}d</span>`)
      : "";

    return `<div class="g-row g-info">
      <div><b>${PP.esc(t.name)}</b>${cpmTag}</div>
      <small>${PP.esc(t.assignee)} · ${PP.diff(t.start, t.end) + 1} days${t.dep ? " · after " + PP.esc((PP.data.tasks.find(x => x.id === t.dep) || { name: "?" }).name) : ""}</small>
    </div>`;
  }).join("");

  const rows = tasks.map(t => {
    const ct = cpmTasksMap.get(t.id);
    const isCrit = ct ? ct.isCritical : false;
    const slack = ct ? ct.totalFloat : 0;

    const x = PP.diff(first, t.start) * dayWidth;
    const w = (PP.diff(t.start, t.end) + 1) * dayWidth;

    const barClass = (showCriticalPath && isCrit) ? "s-crit" : cls[t.status];
    const critTitle = isCrit ? "[CRITICAL PATH - 0 Float] " : (slack > 0 ? `[Slack: ${slack}d] ` : "");

    // Ghost float bar for non-critical activities when critical path is toggled on
    let floatBar = "";
    if (showCriticalPath && !isCrit && slack > 0) {
      const floatX = x + w;
      const floatW = slack * dayWidth;
      floatBar = `<div class="g-float-bar" style="left:${floatX}px;width:${floatW}px" title="${PP.esc(t.name)}: Can slip up to ${slack} days without delaying project completion (Total Float)."></div>`;
    }

    return `<div class="g-row">
      ${floatBar}
      <div class="g-bar ${barClass}" style="left:${x}px;width:${w}px" title="${critTitle}${PP.esc(t.name)}: ${t.start} to ${t.end}, ${t.progress}% (${t.status})" onclick="PP.openTask(${t.id})">
        <div class="g-fill" style="width:${t.progress}%"></div>
        <span>${t.progress}%</span>
      </div>
    </div>`;
  }).join("");

  const todayX = PP.diff(first, PP.day(0)) * dayWidth + dayWidth / 2;
  $("gantt").innerHTML = `<div class="g-wrap"><div class="g-left"><div class="g-head">Task</div>${left}</div>
    <div class="g-right" style="width:${total * dayWidth}px"><div class="g-days">${days}</div>${rows}<div class="g-today" style="left:${todayX}px"></div></div></div>`;
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
