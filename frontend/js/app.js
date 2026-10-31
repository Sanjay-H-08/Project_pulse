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

// ---- Data store (authoritative source is the backend database) ----
function demoData() {
  return {
    team: [],
    projects: [],
    tasks: [],
    dependencies: [],
    risks: []
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
      <span>${PP.esc(msg || "Could not connect to ProgNix API server at " + apiBase + ". Make sure uvicorn is running.")}</span>
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

  // Purge obsolete demo projects ("Campus Event App", "Website Redesign")
  const rawProjects = Array.isArray(localData.projects) ? localData.projects : [];
  const cleanProjects = rawProjects.filter(p => p && p.name !== "Campus Event App" && p.name !== "Website Redesign");

  const rawTasks = Array.isArray(localData.tasks) ? localData.tasks : [];
  const cleanTasks = rawTasks.filter(t => t && t.name !== "Gather requirements" && t.name !== "Design UI mockups");

  const rawTeam = Array.isArray(localData.team) ? localData.team : [];
  const cleanTeam = rawTeam.filter(m => m && m !== "Unassigned" && String(m).trim().length > 0);

  const rawRisks = Array.isArray(localData.risks) ? localData.risks : [];
  const cleanRisks = rawRisks.filter(r => r && !String(r.title || "").includes("API Gateway Rate-Limiting"));

  return {
    team: cleanTeam,
    teamDetails: localData.teamDetails || {},
    projects: cleanProjects,
    tasks: cleanTasks,
    dependencies: Array.isArray(localData.dependencies) ? localData.dependencies : [],
    risks: cleanRisks
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

    const localData = JSON.parse(localStorage.getItem("pp_data") || "{}");
    const savedProjectMembers = localData.projectMembers || {};

    PP.data.projects = (bpProjects || []).map(p => {
      const fp = PP.adapters.projectFromBackend(p);
      if (savedProjectMembers[fp.id] && Array.isArray(savedProjectMembers[fp.id])) {
        fp.teamMembers = savedProjectMembers[fp.id].slice();
      }
      return fp;
    });
    PP.data.tasks = (bpTasks || []).map(PP.adapters.taskFromBackend);
    PP.data.dependencies = bpDeps || [];

    // Populate teamMembers for projects if empty
    PP.data.projects.forEach(p => {
      if (!Array.isArray(p.teamMembers) || p.teamMembers.length === 0) {
        const pTasks = PP.data.tasks.filter(t => Number(t.project || t.project_id) === Number(p.id));
        const pAssignees = Array.from(new Set(pTasks.map(t => t.assignee).filter(a => a && a !== "Unassigned" && String(a).trim().length > 0)));
        if (pAssignees.length) {
          p.teamMembers = pAssignees;
        } else {
          p.teamMembers = PP.data.team.slice(0, Math.min(Number(p.members || p.team_size || 1), PP.data.team.length));
        }
      }
    });

    // Sync task assignees into team list (excluding Unassigned)
    const assignees = PP.data.tasks
      .map(t => t.assignee)
      .filter(a => a && a !== "Unassigned" && String(a).trim().length > 0);
    const cleanTeam = (PP.data.team || []).filter(m => m && m !== "Unassigned" && String(m).trim().length > 0);
    const teamSet = new Set([...cleanTeam, ...assignees]);
    PP.data.team = Array.from(teamSet);

    // 3. Fetch real risks from backend for all projects
    if (PP.api.risks && PP.data.projects.length) {
      try {
        const riskResults = await Promise.all(
          PP.data.projects.map(p => PP.api.risks.list(p.id).catch(() => []))
        );
        const allRisks = riskResults.flat().map(r => ({
          id: r.id,
          project: r.project_id,
          projectId: r.project_id,
          taskId: r.task_id || 0,
          title: r.title,
          desc: r.description || "",
          category: r.category || "Technical",
          likelihood: r.likelihood,
          impact: r.impact,
          score: r.score,
          mitigation: r.mitigation || "",
          contingency: "",
          status: "Open",
          owner: ""
        }));
        PP.data.risks = allRisks;
      } catch (_) {}
    } else {
      PP.data.risks = [];
    }

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
  const projectMembers = {};
  (PP.data.projects || []).forEach(p => {
    if (Array.isArray(p.teamMembers) && p.teamMembers.length) {
      projectMembers[p.id] = p.teamMembers;
    }
  });

  // Persist auxiliary local state (risks, team preferences, project team members)
  const toSave = {
    team: (PP.data.team || []).filter(m => m && m !== "Unassigned" && String(m).trim().length > 0),
    teamDetails: PP.data.teamDetails || {},
    risks: PP.data.risks,
    projectMembers: projectMembers
  };
  localStorage.setItem("pp_data", JSON.stringify(toSave));
};

PP.nextId = list => list.reduce((m, x) => Math.max(m, x.id), 0) + 1;
PP.projectName = id => (PP.data.projects.find(p => Number(p.id) === Number(id)) || { name: "-" }).name;
PP.projectProgress = id => {
  const t = PP.data.tasks.filter(x => Number(x.project || x.project_id) === Number(id));
  return t.length ? Math.round(t.reduce((s, x) => s + x.progress, 0) / t.length) : 0;
};

// Activity Logging
PP.getActivities = () => {
  try {
    const list = JSON.parse(localStorage.getItem("pp_activities"));
    if (Array.isArray(list) && list.length) return list;
  } catch (_) {}
  const seedActivities = [
    { id: 1, type: "risk", icon: "🛡️", message: "Registered Supply Chain Risk on Sensor Procurement", time: "10 mins ago" },
    { id: 2, type: "blocked", icon: "🚫", message: "Task 'Robot Integration' marked Blocked by pending sensors", time: "25 mins ago" },
    { id: 3, type: "delay", icon: "⚠️", message: "Sensor Procurement supplier lead-time delay (+15d flagged)", time: "1 hour ago" },
    { id: 4, type: "progress", icon: "⚡", message: "PLC Programming reached 80% logic sign-off", time: "3 hours ago" },
    { id: 5, type: "done", icon: "✅", message: "Electrical Panel Fabrication certified complete (100%)", time: "Yesterday" },
    { id: 6, type: "done", icon: "✅", message: "Mechanical & Conveyor Design completed (100%)", time: "2 days ago" }
  ];
  try { localStorage.setItem("pp_activities", JSON.stringify(seedActivities)); } catch (_) {}
  return seedActivities;
};

PP.logActivity = (type, message, details = {}) => {
  const activities = PP.getActivities();
  const iconMap = {
    task: "📋",
    progress: "⚡",
    done: "✅",
    delay: "⚠️",
    blocked: "🚫",
    risk: "🛡️",
    team: "👥",
    project: "📁"
  };
  const entry = {
    id: Date.now(),
    type,
    icon: iconMap[type] || "📌",
    message,
    time: "Just now",
    timestamp: new Date().toISOString(),
    details
  };
  activities.unshift(entry);
  if (activities.length > 25) activities.length = 25;
  try {
    localStorage.setItem("pp_activities", JSON.stringify(activities));
  } catch (_) {}
};

PP.analyzeTask = t => {
  const today = PP.day(0);
  const isDone = t.status === "Done";
  const isOverdue = !isDone && t.end && t.end < today;
  const overdueDays = isOverdue ? Math.max(1, PP.diff(t.end, today)) : 0;

  // Dependencies: predecessors
  const deps = Array.isArray(t.deps) && t.deps.length ? t.deps : (t.dep ? [t.dep] : []);
  const predTasks = PP.data.tasks.filter(p => deps.map(Number).includes(Number(p.id)));
  const unfinishedPreds = predTasks.filter(p => p.status !== "Done");
  const isBlocked = !isDone && unfinishedPreds.length > 0;
  const blockedBy = unfinishedPreds.map(p => p.name);

  // Critical path check
  let isCritical = false;
  let totalFloat = 0;
  if (PP.cpm) {
    const projId = Number(t.project || t.project_id);
    const res = PP.cpm.calculate(projId);
    if (res && res.tasks) {
      const ct = res.tasks.find(x => Number(x.id) === Number(t.id));
      if (ct) {
        isCritical = ct.isCritical;
        totalFloat = ct.totalFloat;
      }
    }
  }

  // Risk check
  const taskRisks = (PP.data.risks || []).filter(r => Number(r.taskId) === Number(t.id));
  const hasHighRisk = taskRisks.some(r => Number(r.score) >= 12);
  const isAtRisk = isOverdue || (isCritical && isBlocked) || hasHighRisk;

  return {
    isDone,
    isOverdue,
    overdueDays,
    isBlocked,
    blockedBy,
    hasHighRisk,
    isCritical,
    totalFloat,
    isAtRisk
  };
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
