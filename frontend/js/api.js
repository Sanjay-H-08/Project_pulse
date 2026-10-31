// api.js: ProgNix API client, endpoints, and data adapters.
// Connects vanilla JS frontend to FastAPI backend (/api).
(function() {
  // Configurable base URL: uses current origin if hosted together or window override, otherwise defaults to port 8000.
  const DEFAULT_API_BASE = (window.PROGNIX_API_URL || window.PROJECTPULSE_API_URL ||
    (window.location.port === "8000" ? window.location.origin + "/api" : "http://localhost:8000/api")
  ).replace(/\/+$/, "");

  class ApiError extends Error {
    constructor(message, status = 0, detail = null) {
      super(message);
      this.name = "ApiError";
      this.status = status;
      this.detail = detail;
    }
  }

  // Generic HTTP request wrapper around native fetch
  async function request(endpoint, options = {}) {
    const url = endpoint.startsWith("http") ? endpoint : `${DEFAULT_API_BASE}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;
    const headers = {
      "Accept": "application/json",
      ...(options.headers || {})
    };

    // Attach active JWT token if authenticated
    try {
      const token = localStorage.getItem("pp_token");
      if (token && !headers["Authorization"]) {
        headers["Authorization"] = `Bearer ${token}`;
      }
    } catch (_) {}

    if (options.body && !(options.body instanceof FormData) && typeof options.body === "object") {
      headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(options.body);
    }

    let response;
    try {
      response = await fetch(url, { ...options, headers });
    } catch (networkErr) {
      throw new ApiError(
        `Unable to connect to ProgNix API server at ${DEFAULT_API_BASE}. Please ensure the backend is running.`,
        0,
        networkErr.message
      );
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return null;
    }

    let payload = null;
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      try {
        payload = await response.json();
      } catch (jsonErr) {
        payload = null;
      }
    } else {
      payload = await response.text();
    }

    if (!response.ok) {
      let errorMessage = `HTTP error ${response.status}: ${response.statusText}`;
      if (payload) {
        if (typeof payload === "object" && payload.detail) {
          if (Array.isArray(payload.detail)) {
            // FastAPI Pydantic validation error array
            errorMessage = payload.detail.map(d => {
              const loc = Array.isArray(d.loc) ? d.loc.filter(x => x !== "body").join(".") : "";
              return loc ? `${loc}: ${d.msg}` : d.msg;
            }).join("; ");
          } else if (typeof payload.detail === "string") {
            errorMessage = payload.detail;
          }
        } else if (typeof payload === "string" && payload.trim()) {
          errorMessage = payload;
        }
      }
      throw new ApiError(errorMessage, response.status, payload);
    }

    return payload;
  }

  // HTTP method shortcuts
  const http = {
    get: (endpoint, params = null) => {
      let path = endpoint;
      if (params && typeof params === "object") {
        const qry = new URLSearchParams();
        Object.entries(params).forEach(([k, v]) => {
          if (v !== null && v !== undefined && v !== "") qry.append(k, String(v));
        });
        const str = qry.toString();
        if (str) path += (path.includes("?") ? "&" : "?") + str;
      }
      return request(path, { method: "GET" });
    },
    post: (endpoint, body) => request(endpoint, { method: "POST", body }),
    put: (endpoint, body) => request(endpoint, { method: "PUT", body }),
    patch: (endpoint, body) => request(endpoint, { method: "PATCH", body }),
    delete: endpoint => request(endpoint, { method: "DELETE" })
  };

  // Structured API endpoints matching FastAPI backend routes
  const api = {
    baseUrl: DEFAULT_API_BASE,
    ApiError,

    // Authentication (/auth)
    auth: {
      register: data => http.post("/auth/register", data),
      login: data => http.post("/auth/login", data),
      me: () => http.get("/auth/me")
    },

    // Health
    health: {
      check: () => http.get("/health")
    },

    // Projects (/projects)
    projects: {
      list: (params = {}) => http.get("/projects", params),
      get: id => http.get(`/projects/${id}`),
      create: data => http.post("/projects", data),
      update: (id, data) => http.put(`/projects/${id}`, data),
      delete: id => http.delete(`/projects/${id}`),
      getTasks: id => http.get(`/projects/${id}/tasks`),
      getDependencies: id => http.get(`/projects/${id}/dependencies`)
    },

    // Tasks (/tasks)
    tasks: {
      list: (params = {}) => http.get("/tasks", params),
      get: id => http.get(`/tasks/${id}`),
      create: data => http.post("/tasks", data),
      update: (id, data) => http.put(`/tasks/${id}`, data),
      delete: id => http.delete(`/tasks/${id}`),
      getDependencies: id => http.get(`/tasks/${id}/dependencies`),
      addDependency: (taskId, data) => http.post(`/tasks/${taskId}/dependencies`, data)
    },

    // Dependencies (/dependencies)
    dependencies: {
      list: (params = {}) => http.get("/dependencies", params),
      get: id => http.get(`/dependencies/${id}`),
      create: data => http.post("/dependencies", data),
      delete: id => http.delete(`/dependencies/${id}`)
    },

    // Project Risks (/projects/{id}/risks)
    risks: {
      list: projectId => http.get(`/projects/${projectId}/risks`),
      get: (projectId, riskId) => http.get(`/projects/${projectId}/risks/${riskId}`),
      create: (projectId, data) => http.post(`/projects/${projectId}/risks`, data),
      update: (projectId, riskId, data) => http.put(`/projects/${projectId}/risks/${riskId}`, data),
      delete: (projectId, riskId) => http.delete(`/projects/${projectId}/risks/${riskId}`),
      summary: projectId => http.get(`/projects/${projectId}/risks/summary`)
    },

    // Schedules (/projects/{id}/schedule)
    schedules: {
      calculate: (projectId, usePert = false, data = null) =>
        http.post(`/projects/${projectId}/schedule${usePert ? "?use_pert=true" : ""}`, data || {}),
      get: (projectId, usePert = false) =>
        http.get(`/projects/${projectId}/schedule${usePert ? "?use_pert=true" : ""}`)
    }
  };

  // ==========================================
  // DATA ADAPTERS
  // Converts between frontend model and backend schemas
  // ==========================================
  const adapters = {
    // Backend ProjectResponse -> Frontend project object
    projectFromBackend(bp) {
      if (!bp) return null;
      let existingTeamMembers = [];
      let existingPriority = "Medium";
      let existingReq = "";
      if (typeof PP !== "undefined" && PP.data && Array.isArray(PP.data.projects)) {
        const found = PP.data.projects.find(p => Number(p.id) === Number(bp.id));
        if (found) {
          if (Array.isArray(found.teamMembers) && found.teamMembers.length) {
            existingTeamMembers = found.teamMembers.slice();
          }
          if (found.priority) existingPriority = found.priority;
          if (found.req) existingReq = found.req;
        }
      }
      return {
        id: bp.id,
        name: bp.name || "",
        desc: bp.description || "",
        description: bp.description || "",
        status: bp.status || "Active",
        startDate: bp.start_date || "",
        start_date: bp.start_date || "",
        deadline: bp.deadline || "",
        members: bp.team_size || (existingTeamMembers.length || 1),
        team_size: bp.team_size || (existingTeamMembers.length || 1),
        teamMembers: existingTeamMembers,
        priority: existingPriority,
        tasks_count: bp.tasks_count || 0,
        req: existingReq
      };
    },

    // Frontend project object -> Backend ProjectCreate / ProjectUpdate payload
    projectToBackend(fp, isUpdate = false) {
      const payload = {};
      if (fp.name !== undefined) payload.name = String(fp.name).trim();
      if (fp.desc !== undefined || fp.description !== undefined) {
        payload.description = fp.desc || fp.description || null;
      }
      if (fp.status !== undefined) {
        const allowed = ["Planned", "Active", "Completed", "On Hold", "Cancelled"];
        payload.status = allowed.includes(fp.status) ? fp.status : "Active";
      }
      if (fp.startDate !== undefined || fp.start_date !== undefined) {
        payload.start_date = fp.startDate || fp.start_date || null;
      }
      if (fp.deadline !== undefined) {
        payload.deadline = fp.deadline || null;
      }
      if (fp.members !== undefined || fp.team_size !== undefined) {
        payload.team_size = Math.max(1, Number(fp.members || fp.team_size || 1));
      }

      // Ensure deadline >= start_date if both are present
      if (payload.start_date && payload.deadline && payload.deadline < payload.start_date) {
        payload.deadline = payload.start_date;
      }

      return payload;
    },

    // Backend TaskResponse -> Frontend task object
    taskFromBackend(bt) {
      if (!bt) return null;
      const deps = Array.isArray(bt.dependencies) ? bt.dependencies.map(Number) : [];
      const dur = bt.duration || 1;
      const s = bt.start_date || (typeof PP !== "undefined" && PP.day ? PP.day(0) : new Date().toISOString().slice(0, 10));
      let e = bt.end_date;
      if (!e) {
        const d = new Date(s + "T00:00:00");
        if (!isNaN(d.getTime())) {
          d.setDate(d.getDate() + Math.max(0, dur - 1));
          e = d.toISOString().slice(0, 10);
        } else {
          e = s;
        }
      }
      const likely = bt.most_likely_duration || dur;
      const opt = bt.optimistic_duration || Math.max(1, Math.round(likely * 0.75));
      const pess = bt.pessimistic_duration || Math.max(likely + 1, Math.round(likely * 1.5));

      return {
        id: bt.id,
        project: bt.project_id,
        project_id: bt.project_id,
        name: bt.name || "",
        description: bt.description || "",
        start: s,
        end: e,
        duration: dur,
        progress: Number(bt.progress) || 0,
        assignee: bt.assignee ? bt.assignee : "",
        status: bt.status || "To Do",
        priority: bt.priority || "Medium",
        dep: deps[0] || 0,
        deps: deps,
        opt: Number(opt),
        likely: Number(likely),
        pess: Number(pess)
      };
    },

    // Frontend task object -> Backend TaskCreate / TaskUpdate payload
    taskToBackend(ft, isUpdate = false) {
      const s = ft.start || ft.start_date || null;
      let e = ft.end || ft.end_date || null;

      // Ensure valid end date >= start date
      if (s && e && e < s) {
        e = s;
      }

      let dur = ft.duration;
      if (!dur && s && e) {
        dur = Math.max(1, PP.diff(s, e) + 1);
      }
      dur = Math.max(1, Math.round(dur || 1));

      let opt = parseFloat(ft.opt);
      let likely = parseFloat(ft.likely) || dur;
      let pess = parseFloat(ft.pess);

      if (isNaN(opt) || opt <= 0) opt = Math.max(1, Math.round(likely * 0.75));
      if (isNaN(pess) || pess <= 0) pess = Math.max(likely + 1, Math.round(likely * 1.5));

      // Satisfy O <= M <= P triplet constraint
      if (opt > likely) opt = likely;
      if (pess < likely) pess = likely;

      let status = ft.status || "To Do";
      const allowedStatus = ["To Do", "In Progress", "Done", "Blocked"];
      if (!allowedStatus.includes(status)) status = "To Do";

      let progress = parseInt(ft.progress, 10);
      if (isNaN(progress)) progress = 0;
      progress = Math.max(0, Math.min(100, progress));

      // Backend status and progress consistency validation
      if (status === "Done") {
        progress = 100;
      } else if (status === "To Do") {
        if (progress === 100) progress = 99;
      } else if (progress === 100) {
        status = "Done";
      }

      const payload = {
        name: String(ft.name).trim(),
        description: ft.description || null,
        duration: dur,
        start_date: s,
        end_date: e,
        status: status,
        priority: ft.priority || "Medium",
        progress: progress,
        assignee: (ft.assignee && ft.assignee !== "Unassigned" && String(ft.assignee).trim().length > 0) ? String(ft.assignee).trim() : null,
        optimistic_duration: opt,
        most_likely_duration: likely,
        pessimistic_duration: pess
      };

      if (!isUpdate) {
        payload.project_id = Number(ft.project || ft.project_id);
        const deps = Array.isArray(ft.deps) && ft.deps.length ? ft.deps.map(Number) : (ft.dep ? [Number(ft.dep)] : []);
        if (deps.length) {
          payload.depends_on_ids = deps;
        }
      }

      return payload;
    },

    // Synchronizes dependencies for an updated task with the backend
    async syncTaskDependencies(taskId, targetDepIds = []) {
      const normalizedTargets = (Array.isArray(targetDepIds) ? targetDepIds : [])
        .map(Number)
        .filter(id => id > 0 && id !== taskId);

      // Get current dependencies for this task
      const currentDeps = await api.tasks.getDependencies(taskId);
      const existingMap = new Map(); // depends_on_id -> dependency_id
      currentDeps.forEach(d => existingMap.set(d.depends_on_id, d.id));

      // Delete dependencies that are no longer selected
      for (const [predId, depId] of existingMap.entries()) {
        if (!normalizedTargets.includes(predId)) {
          await api.dependencies.delete(depId);
        }
      }

      // Add newly selected dependencies
      for (const predId of normalizedTargets) {
        if (!existingMap.has(predId)) {
          await api.tasks.addDependency(taskId, {
            depends_on_id: predId,
            dependency_type: "finish_to_start",
            lag_days: 0
          });
        }
      }
    }
  };

  // Expose on global PP namespace
  if (typeof window !== "undefined") {
    window.PP = window.PP || {};
    window.PP.api = api;
    window.PP.adapters = adapters;
  }
  if (typeof global !== "undefined") {
    global.PP = global.PP || {};
    global.PP.api = api;
    global.PP.adapters = adapters;
  }
})();
