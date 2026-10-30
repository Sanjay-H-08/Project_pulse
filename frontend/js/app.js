// app.js: shared helpers, demo data, LocalStorage and navigation.
// Every other file uses the single shared object "PP".
window.PP = { renders: {}, page: "dashboard" };
const $ = id => document.getElementById(id);

// ---- Small helpers ----
PP.esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
PP.day = n => { const x = new Date(); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
PP.diff = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);
PP.toast = (msg, type) => {
  const t = document.createElement("div");
  t.className = "toast " + (type || "success"); t.textContent = msg;
  $("toasts").appendChild(t); setTimeout(() => t.remove(), 3000);
};

// ---- Demo data (used the first time, then saved in LocalStorage) ----
function demoData() {
  const T = (id, project, name, s, e, progress, assignee, status, priority, dep) =>
    ({ id, project, name, start: PP.day(s), end: PP.day(e), progress, assignee, status, priority, dep });
  return {
    team: ["Aisha", "Rahul", "Meera", "Dev"],
    projects: [
      { id: 1, name: "Campus Event App", desc: "Mobile app for the college fest", deadline: PP.day(40), members: 4, status: "Active" },
      { id: 2, name: "Website Redesign", desc: "New department website", deadline: PP.day(-5), members: 2, status: "Completed" }
    ],
    tasks: [
      T(1, 1, "Gather requirements", -12, -6, 100, "Aisha", "Done", "High", 0),
      T(2, 1, "Design UI mockups", -6, 4, 70, "Meera", "In Progress", "High", 1),
      T(3, 1, "Build login and API", 0, 14, 35, "Rahul", "In Progress", "High", 1),
      T(4, 1, "Event listing screens", 8, 22, 0, "Dev", "To Do", "Medium", 2),
      T(5, 1, "Testing and bug fixes", 22, 32, 0, "Aisha", "To Do", "Medium", 4),
      T(6, 1, "Launch and demo", 32, 40, 0, "Rahul", "To Do", "Low", 5),
      T(7, 2, "Collect content", -30, -20, 100, "Meera", "Done", "Low", 0),
      T(8, 2, "Publish site", -20, -5, 100, "Dev", "Done", "Medium", 7)
    ]
  };
}
PP.load = () => { try { return JSON.parse(localStorage.getItem("pp_data")) || demoData(); } catch (e) { return demoData(); } };
PP.data = PP.load();
PP.save = () => localStorage.setItem("pp_data", JSON.stringify(PP.data));
PP.nextId = list => list.reduce((m, x) => Math.max(m, x.id), 0) + 1;
PP.projectName = id => (PP.data.projects.find(p => p.id == id) || { name: "-" }).name;
PP.projectProgress = id => {
  const t = PP.data.tasks.filter(x => x.project == id);
  return t.length ? Math.round(t.reduce((s, x) => s + x.progress, 0) / t.length) : 0;
};

// ---- Navigation ----
const PAGES = {
  dashboard: ["Dashboard", '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>'],
  projects: ["My Projects", '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>'],
  gantt: ["Gantt Chart", '<line x1="3" y1="6" x2="14" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="5" y1="18" x2="16" y2="18"/>'],
  tasks: ["Tasks", '<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>'],
  team: ["Team", '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'],
  "ai-assistant": ["AI Assistant", '<polygon points="12 2 15 9 22 12 15 15 12 22 9 15 2 12 9 9"/>'],
  settings: ["Settings", '<line x1="4" y1="21" x2="4" y2="14"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>']
};

PP.buildNav = () => {
  $("nav").innerHTML = Object.keys(PAGES).map(k =>
    `<a href="#${k}" class="nav-link" data-page="${k}"><svg class="icon" viewBox="0 0 24 24">${PAGES[k][1]}</svg><span>${PAGES[k][0]}</span></a>`).join("");
};

PP.showPage = name => {
  if (!PAGES[name]) name = "dashboard";
  PP.page = name;
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  $("page-" + name).classList.add("active");
  document.querySelectorAll(".nav-link").forEach(l => l.classList.toggle("active", l.dataset.page === name));
  $("page-title").textContent = PAGES[name][0];
  PP.closeSidebar();
  if (PP.renders[name]) PP.renders[name]();
};
PP.refresh = () => PP.renders[PP.page] && PP.renders[PP.page]();
PP.openSidebar = () => { $("sidebar").classList.add("open"); $("overlay").classList.add("show"); };
PP.closeSidebar = () => { $("sidebar").classList.remove("open"); $("overlay").classList.remove("show"); };
