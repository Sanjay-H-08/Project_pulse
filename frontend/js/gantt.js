// gantt.js: custom Gantt chart made of plain HTML + CSS.
// Each bar is positioned with: left = days from timeline start * pixels per day.
let dayWidth = 28;
const cls = { "To Do": "s-todo", "In Progress": "s-prog", "Done": "s-done" };

PP.renders.gantt = () => {
  const tasks = PP.data.tasks.slice().sort((a, b) => a.start.localeCompare(b.start));
  if (!tasks.length) return $("gantt").innerHTML = '<p class="empty">No tasks yet. Add tasks to see the timeline.</p>';
  const first = tasks.reduce((m, t) => t.start < m ? t.start : m, PP.day(0));
  const last = tasks.reduce((m, t) => t.end > m ? t.end : m, PP.day(0));
  const total = PP.diff(first, last) + 2;

  let days = "";
  for (let i = 0; i < total; i++) {
    const d = new Date(first); d.setDate(d.getDate() + i);
    const label = dayWidth >= 24 ? d.getDate() : (i % 7 === 0 ? d.toLocaleDateString("en", { day: "numeric", month: "short" }) : "");
    days += `<div class="g-day" style="width:${dayWidth}px">${label}</div>`;
  }

  const left = tasks.map(t => `<div class="g-row g-info"><b>${PP.esc(t.name)}</b><small>${PP.esc(t.assignee)} · ${PP.diff(t.start, t.end) + 1} days${t.dep ? " · after " + PP.esc((PP.data.tasks.find(x => x.id === t.dep) || { name: "?" }).name) : ""}</small></div>`).join("");

  const rows = tasks.map(t => {
    const x = PP.diff(first, t.start) * dayWidth, w = (PP.diff(t.start, t.end) + 1) * dayWidth;
    return `<div class="g-row"><div class="g-bar ${cls[t.status]}" style="left:${x}px;width:${w}px" title="${PP.esc(t.name)}: ${t.start} to ${t.end}, ${t.progress}% (${t.status})" onclick="PP.openTask(${t.id})">
      <div class="g-fill" style="width:${t.progress}%"></div><span>${t.progress}%</span></div></div>`;
  }).join("");

  const todayX = PP.diff(first, PP.day(0)) * dayWidth + dayWidth / 2;
  $("gantt").innerHTML = `<div class="g-wrap"><div class="g-left"><div class="g-head">Task</div>${left}</div>
    <div class="g-right" style="width:${total * dayWidth}px"><div class="g-days">${days}</div>${rows}<div class="g-today" style="left:${todayX}px"></div></div></div>`;
};

document.addEventListener("DOMContentLoaded", () => {
  const zoom = (w, on, off) => { dayWidth = w; $(on).classList.add("active"); $(off).classList.remove("active"); PP.renders.gantt(); };
  $("zoom-day").onclick = () => zoom(28, "zoom-day", "zoom-week");
  $("zoom-week").onclick = () => zoom(10, "zoom-week", "zoom-day");
});
