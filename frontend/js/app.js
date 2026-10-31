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
  const T = (id, project, name, s, e, progress, assignee, status, priority, dep, opt, likely, pess) => {
    const dur = PP.diff(PP.day(s), PP.day(e)) + 1;
    const l = likely || dur;
    const o = opt || Math.max(1, Math.round(l * 0.75));
    const p = pess || Math.max(l + 1, Math.round(l * 1.5));
    const depsArr = Array.isArray(dep) ? dep : (dep ? [dep] : []);
    return {
      id, project, name,
      start: PP.day(s),
      end: PP.day(e),
      progress, assignee, status, priority,
      dep: depsArr[0] || 0,
      deps: depsArr,
      opt: o,
      likely: l,
      pess: p
    };
  };
  return {
    team: ["Aisha", "Rahul", "Meera", "Dev"],
    projects: [
      { id: 1, name: "Campus Event App", desc: "Mobile app for the college fest", deadline: PP.day(40), members: 4, status: "Active" },
      { id: 2, name: "Website Redesign", desc: "New department website", deadline: PP.day(-5), members: 2, status: "Completed" }
    ],
    tasks: [
      T(1, 1, "Gather requirements", -12, -6, 100, "Aisha", "Done", "High", 0, 5, 7, 11),
      T(2, 1, "Design UI mockups", -6, 4, 70, "Meera", "In Progress", "High", 1, 8, 11, 16),
      T(3, 1, "Build login and API", 0, 14, 35, "Rahul", "In Progress", "High", 1, 10, 15, 22),
      T(4, 1, "Event listing screens", 8, 22, 0, "Dev", "To Do", "Medium", 2, 12, 15, 20),
      T(5, 1, "Testing and bug fixes", 22, 32, 0, "Aisha", "To Do", "Medium", [3, 4], 8, 11, 17),
      T(6, 1, "Launch and demo", 32, 40, 0, "Rahul", "To Do", "Low", 5, 6, 9, 14),
      T(7, 2, "Collect content", -30, -20, 100, "Meera", "Done", "Low", 0, 8, 11, 15),
      T(8, 2, "Publish site", -20, -5, 100, "Dev", "Done", "Medium", 7, 12, 16, 22)
    ],
    risks: [
      {
        id: 1,
        project: 1,
        taskId: 3,
        title: "API Gateway Rate-Limiting & Auth Bottlenecks",
        desc: "External API rate-limits and database concurrency locks during high-traffic authentication bursts.",
        category: "Technical",
        likelihood: 4,
        impact: 4,
        owner: "Rahul",
        mitigation: "Deploy Redis in-memory token cache and implement exponential backoff retry policies.",
        contingency: "Switch non-essential calls to read-only replica cluster and enable request queueing.",
        status: "Mitigating",
        dateAdded: PP.day(-8)
      },
      {
        id: 2,
        project: 1,
        taskId: 5,
        title: "Critical Path Integration Testing Flaws",
        desc: "End-to-end event ticketing workflows have complex dependencies; unexpected defects could delay final launch.",
        category: "Schedule",
        likelihood: 3,
        impact: 5,
        owner: "Aisha",
        mitigation: "Introduce automated Cypress/Playwright regression testing suites early during development.",
        contingency: "Crash schedule by allocating Dev and Meera to manual smoke testing sprints.",
        status: "Open",
        dateAdded: PP.day(-5)
      },
      {
        id: 3,
        project: 1,
        taskId: 2,
        title: "UI Design Revision Latency",
        desc: "Design stakeholder reviews taking longer than planned, delaying frontend screen development.",
        category: "Scope",
        likelihood: 3,
        impact: 3,
        owner: "Meera",
        mitigation: "Freeze core screen wireframes after sprint 2; defer optional animations to v1.1.",
        contingency: "Use standard component libraries (Tailwind/Material) for secondary screens.",
        status: "Monitored",
        dateAdded: PP.day(-10)
      },
      {
        id: 4,
        project: 1,
        taskId: 0,
        title: "Single Point of Failure on Backend Engineer",
        desc: "Rahul is assigned to 3 major concurrent activities on the critical path.",
        category: "Resource",
        likelihood: 4,
        impact: 4,
        owner: "Rahul",
        mitigation: "Pair programming sessions with Aisha to cross-train on database endpoints.",
        contingency: "Reassign non-critical documentation and setup tasks to Dev.",
        status: "Mitigating",
        dateAdded: PP.day(-3)
      },
      {
        id: 5,
        project: 2,
        taskId: 8,
        title: "Domain DNS & SSL Propagation Delays",
        desc: "Hosting migration DNS propagation takes up to 48 hours for department website launch.",
        category: "External",
        likelihood: 2,
        impact: 3,
        owner: "Dev",
        mitigation: "Pre-configure TTL to 300 seconds 3 days prior to production cutover.",
        contingency: "Keep staging proxy URL active as immediate fallback.",
        status: "Closed",
        dateAdded: PP.day(-25)
      }
    ]
  };
}

PP.ensureTaskDefaults = t => {
  const dur = Math.max(1, PP.diff(t.start, t.end) + 1);
  if (!t.likely) t.likely = dur;
  if (!t.opt) t.opt = Math.max(1, Math.round(t.likely * 0.75));
  if (!t.pess) t.pess = Math.max(t.likely + 1, Math.round(t.likely * 1.5));
  if (!Array.isArray(t.deps)) t.deps = t.dep ? [t.dep] : [];
  return t;
};

PP.isBackendConnected = false;

PP.showBackendError = msg => {
  const banner = $("backend-banner");
  if (!banner) return;
  banner.className = "backend-banner error";
  const apiBase = (PP.api && PP.api.baseUrl) ? PP.api.baseUrl : "http://localhost:8000/api";
  banner.innerHTML = `
    <div>
      <strong>⚠️ Backend Connection Error:</strong>
      <span>${PP.esc(msg || "Could not connect to ProjectPulse API server at " + apiBase + ". Make sure uvicorn is running.")}</span>
    </div>
    <button class="btn small-btn ghost" id="btn-retry-backend" type="button">Retry Connection</button>
  `;
  const retryBtn = $("btn-retry-backend");
  if (retryBtn) {
    retryBtn.onclick = () => {
      PP.toast("Reconnecting to backend...");
      PP.syncWithBackend().then(() => {
        PP.toast("Connected to backend!");
      }).catch(err => {
        PP.toast(err.message, "error");
      });
    };
  }
};

PP.hideBackendError = () => {
  const banner = $("backend-banner");
  if (banner) banner.className = "backend-banner hidden";
};

PP.load = () => {
  let localData = {};
  try {
    localData = JSON.parse(localStorage.getItem("pp_data")) || {};
  } catch (e) {
    localData = {};
  }

  return {
    team: localData.team || ["Aisha", "Rahul", "Meera", "Dev"],
    teamDetails: localData.teamDetails || {},
    projects: [], // Authoritative source is backend
    tasks: [],    // Authoritative source is backend
    dependencies: [],
    risks: (Array.isArray(localData.risks) && localData.risks.length) ? localData.risks : demoData().risks
  };
};

PP.data = PP.load();

PP.syncWithBackend = async () => {
  if (!PP.api) return false;
  try {
    // 1. Check health
    await PP.api.health.check();

    // 2. Fetch projects, tasks, dependencies
    const [bpProjects, bpTasks, bpDeps] = await Promise.all([
      PP.api.projects.list(),
      PP.api.tasks.list(),
      PP.api.dependencies.list()
    ]);

    PP.data.projects = (bpProjects || []).map(PP.adapters.projectFromBackend);
    PP.data.tasks = (bpTasks || []).map(PP.adapters.taskFromBackend);
    PP.data.dependencies = bpDeps || [];

    // Sync task assignees into team list
    const assignees = PP.data.tasks.map(t => t.assignee).filter(Boolean);
    const teamSet = new Set([...PP.data.team, ...assignees]);
    PP.data.team = Array.from(teamSet);

    PP.isBackendConnected = true;
    PP.hideBackendError();
    PP.refresh();
    return true;
  } catch (err) {
    PP.isBackendConnected = false;
    PP.showBackendError(err.message);
    PP.refresh();
    throw err;
  }
};

PP.save = () => {
  // Persist auxiliary local state (risks, team preferences) without overriding server data
  const toSave = {
    team: PP.data.team,
    teamDetails: PP.data.teamDetails,
    risks: PP.data.risks
  };
  localStorage.setItem("pp_data", JSON.stringify(toSave));
};

PP.nextId = list => list.reduce((m, x) => Math.max(m, x.id), 0) + 1;
PP.projectName = id => (PP.data.projects.find(p => Number(p.id) === Number(id)) || { name: "-" }).name;
PP.projectProgress = id => {
  const t = PP.data.tasks.filter(x => Number(x.project || x.project_id) === Number(id));
  return t.length ? Math.round(t.reduce((s, x) => s + x.progress, 0) / t.length) : 0;
};

// ---- Navigation ----
const PAGES = {
  dashboard: ["Dashboard", '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>'],
  projects: ["My Projects", '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>'],
  gantt: ["Gantt Chart", '<line x1="3" y1="6" x2="14" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="5" y1="18" x2="16" y2="18"/>'],
  "cpm-pert": ["CPM & PERT", '<circle cx="5" cy="12" r="3"/><circle cx="12" cy="5" r="3"/><circle cx="12" cy="19" r="3"/><circle cx="19" cy="12" r="3"/><line x1="7.5" y1="10" x2="9.5" y2="7"/><line x1="7.5" y1="14" x2="9.5" y2="17"/><line x1="14.5" y1="7" x2="16.5" y2="10"/><line x1="14.5" y1="17" x2="16.5" y2="14"/>'],
  "risk-analysis": ["Risk Analysis", '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" y1="8" x2="12" y2="12"/><circle cx="12" cy="16" r="1"/>'],
  "delay-prediction": ["Delay Prediction", '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/><path d="M18 18l3 3"/>'],
  "whatif-simulator": ["What-If Simulator", '<path d="M10 2v7.31L4.14 19.38A2 2 0 0 0 5.86 22h12.28a2 2 0 0 0 1.72-2.62L14 9.31V2"/><line x1="8.5" y1="2" x2="15.5" y2="2"/><line x1="7" y1="14" x2="17" y2="14"/>'],
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
