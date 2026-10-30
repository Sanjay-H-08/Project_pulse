// cpm-pert.js: Critical Path Method (CPM) and PERT analysis engine & interactive views.
(function() {
  const cpm = {};
  PP.cpm = cpm;

  // Active view state
  let currentProjectId = null;
  let currentMode = "pert"; // "pert" or "standard"
  let activeTab = "network"; // "network", "pert-analysis", "schedule-table"

  // Mathematical Gaussian error function approximation (Abramowitz and Stegun 7.1.26)
  function erf(x) {
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
    const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    const sign = x < 0 ? -1 : 1;
    const absX = Math.abs(x);
    const t = 1.0 / (1.0 + p * absX);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);
    return sign * y;
  }

  // Cumulative distribution function of standard normal distribution Phi(Z)
  cpm.normalCDF = function(z) {
    if (isNaN(z)) return 0.5;
    if (z > 6) return 1;
    if (z < -6) return 0;
    return 0.5 * (1 + erf(z / Math.SQRT2));
  };

  // Date helper to add days
  function addDays(dateStr, days) {
    if (!dateStr) return "-";
    const d = new Date(dateStr + "T00:00:00");
    if (isNaN(d.getTime())) return "-";
    d.setDate(d.getDate() + Math.round(days));
    return d.toISOString().slice(0, 10);
  }

  function formatShortDate(val) {
    if (!val || val === "-") return "-";
    const d = new Date(val + "T00:00:00");
    if (isNaN(d.getTime())) return String(val);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  // Compute 3-point estimates for a task
  cpm.getTaskEstimates = function(task) {
    const calDur = Math.max(1, PP.diff(task.start, task.end) + 1);
    const likely = Number(task.likely) > 0 ? Number(task.likely) : calDur;
    const opt = Number(task.opt) > 0 ? Number(task.opt) : Math.max(1, Math.round(likely * 0.75));
    const pess = Number(task.pess) > 0 ? Number(task.pess) : Math.max(likely + 1, Math.round(likely * 1.5));

    // PERT expected duration: Te = (O + 4M + P) / 6
    const te = (opt + 4 * likely + pess) / 6;
    // PERT variance: V = ((P - O) / 6)^2
    const variance = Math.pow((pess - opt) / 6, 2);
    // PERT standard deviation: sigma = (P - O) / 6
    const sigma = (pess - opt) / 6;

    return {
      calendarDuration: calDur,
      opt,
      likely,
      pess,
      te: Math.round(te * 10) / 10,
      teExact: te,
      variance: Math.round(variance * 100) / 100,
      varianceExact: variance,
      sigma: Math.round(sigma * 100) / 100,
      sigmaExact: sigma
    };
  };

  // Main CPM and PERT Calculation Engine
  cpm.calculate = function(projectId, mode = currentMode) {
    const pId = projectId ? Number(projectId) : null;
    const allTasks = PP.data.tasks.filter(t => !pId || Number(t.project) === pId);
    const projectObj = pId ? PP.data.projects.find(p => p.id === pId) : (PP.data.projects[0] || null);

    if (!allTasks.length) {
      return {
        projectId: pId,
        project: projectObj,
        mode,
        tasks: [],
        hasCycle: false,
        criticalPath: [],
        criticalTaskIds: new Set(),
        projectDuration: 0,
        startDate: PP.day(0),
        pert: {
          expectedDuration: 0,
          variance: 0,
          sigma: 0,
          targetDays: 0,
          zScore: 0,
          probability: 0,
          confidenceIntervals: { p68: [0, 0], p90: [0, 0], p95: [0, 0], p99: [0, 0] }
        }
      };
    }

    const taskMap = new Map();
    const taskEstimates = new Map();
    const predecessors = new Map();
    const successors = new Map();
    const inDegree = new Map();

    allTasks.forEach(t => {
      taskMap.set(t.id, t);
      const est = cpm.getTaskEstimates(t);
      taskEstimates.set(t.id, est);
      predecessors.set(t.id, []);
      successors.set(t.id, []);
      inDegree.set(t.id, 0);
    });

    // Resolve dependencies (support both t.deps array and single t.dep)
    allTasks.forEach(t => {
      let rawDeps = [];
      if (Array.isArray(t.deps) && t.deps.length) {
        rawDeps = t.deps.map(Number);
      } else if (t.dep && Number(t.dep) !== 0) {
        rawDeps = [Number(t.dep)];
      }
      // Keep only dependencies that exist in this project's tasks
      const validDeps = rawDeps.filter(id => taskMap.has(id));
      predecessors.set(t.id, validDeps);
      validDeps.forEach(predId => {
        successors.get(predId).push(t.id);
      });
      inDegree.set(t.id, validDeps.length);
    });

    // Topological Sort (Kahn's Algorithm) & Cycle Detection
    const queue = [];
    inDegree.forEach((deg, id) => {
      if (deg === 0) queue.push(id);
    });

    const order = [];
    const inDegCopy = new Map(inDegree);
    while (queue.length) {
      const u = queue.shift();
      order.push(u);
      successors.get(u).forEach(v => {
        inDegCopy.set(v, inDegCopy.get(v) - 1);
        if (inDegCopy.get(v) === 0) queue.push(v);
      });
    }

    // Cyclic dependency detected
    if (order.length < allTasks.length) {
      return {
        hasCycle: true,
        projectId: pId,
        project: projectObj,
        mode,
        tasks: allTasks,
        criticalPath: [],
        criticalTaskIds: new Set(),
        projectDuration: 0,
        pert: { expectedDuration: 0, variance: 0, sigma: 0, probability: 0 }
      };
    }

    // Assign topological rank / level for diagram columns
    const levels = new Map();
    order.forEach(id => {
      const preds = predecessors.get(id);
      if (!preds.length) {
        levels.set(id, 0);
      } else {
        let maxL = 0;
        preds.forEach(p => maxL = Math.max(maxL, (levels.get(p) || 0) + 1));
        levels.set(id, maxL);
      }
    });

    // Determine activity duration: PERT Te or Standard date duration
    const getDuration = id => {
      const est = taskEstimates.get(id);
      return mode === "pert" ? est.teExact : est.calendarDuration;
    };

    // Forward Pass: Early Start (ES) and Early Finish (EF)
    const ES = new Map();
    const EF = new Map();
    order.forEach(id => {
      const preds = predecessors.get(id);
      let es = 0;
      preds.forEach(p => es = Math.max(es, EF.get(p)));
      ES.set(id, es);
      EF.set(id, es + getDuration(id));
    });

    // Project Total Duration
    let projectDuration = 0;
    order.forEach(id => projectDuration = Math.max(projectDuration, EF.get(id)));

    // Backward Pass: Late Start (LS) and Late Finish (LF)
    const LS = new Map();
    const LF = new Map();
    for (let i = order.length - 1; i >= 0; i--) {
      const id = order[i];
      const succs = successors.get(id);
      let lf = projectDuration;
      if (succs.length) {
        lf = Infinity;
        succs.forEach(s => lf = Math.min(lf, LS.get(s)));
      }
      LF.set(id, lf);
      LS.set(id, lf - getDuration(id));
    }

    // Float / Slack Calculations
    const totalFloat = new Map();
    const freeFloat = new Map();
    const isCritical = new Map();
    const criticalTaskIds = new Set();

    order.forEach(id => {
      const tf = LF.get(id) - EF.get(id);
      const tfClean = Math.abs(tf) < 0.001 ? 0 : Math.max(0, tf);
      totalFloat.set(id, tfClean);

      const succs = successors.get(id);
      let minSuccES = projectDuration;
      if (succs.length) {
        minSuccES = Infinity;
        succs.forEach(s => minSuccES = Math.min(minSuccES, ES.get(s)));
      }
      const ff = minSuccES - EF.get(id);
      const ffClean = Math.abs(ff) < 0.001 ? 0 : Math.max(0, ff);
      freeFloat.set(id, ffClean);

      if (tfClean === 0) {
        isCritical.set(id, true);
        criticalTaskIds.add(id);
      } else {
        isCritical.set(id, false);
      }
    });

    // Construct primary Critical Path sequence
    const criticalPath = [];
    let startCrit = order.find(id => isCritical.get(id) && predecessors.get(id).length === 0);
    if (!startCrit && criticalTaskIds.size > 0) {
      startCrit = order.find(id => isCritical.get(id));
    }
    let curr = startCrit;
    const visited = new Set();
    while (curr && !visited.has(curr)) {
      visited.add(curr);
      criticalPath.push(curr);
      const critSuccs = successors.get(curr).filter(s => isCritical.get(s));
      curr = critSuccs.length ? critSuccs[0] : null;
    }

    // Project Base Start Date
    const minStart = allTasks.reduce((min, t) => !min || t.start < min ? t.start : min, "");
    const startDate = (projectObj && projectObj.startDate) || minStart || PP.day(0);

    // Project-level PERT statistical synthesis along critical path
    const criticalTasksList = criticalPath.length ? criticalPath : [...criticalTaskIds];
    let criticalTeSum = 0;
    let criticalVarSum = 0;
    criticalTasksList.forEach(id => {
      const est = taskEstimates.get(id);
      criticalTeSum += est.teExact;
      criticalVarSum += est.varianceExact;
    });

    const criticalSigma = Math.sqrt(criticalVarSum);

    // Target deadline in days from project start
    let targetDays = Math.round(projectDuration);
    if (projectObj && projectObj.deadline) {
      targetDays = Math.max(1, PP.diff(startDate, projectObj.deadline));
    }

    const zScore = criticalSigma > 0
      ? (targetDays - criticalTeSum) / criticalSigma
      : (targetDays >= criticalTeSum ? 4 : -4);
    const completionProb = cpm.normalCDF(zScore);

    // Enriched tasks array
    const calculatedTasks = allTasks.map(t => {
      const est = taskEstimates.get(t.id);
      const es = ES.get(t.id);
      const ef = EF.get(t.id);
      const ls = LS.get(t.id);
      const lf = LF.get(t.id);
      const tf = totalFloat.get(t.id);
      const ff = freeFloat.get(t.id);
      const crit = isCritical.get(t.id);
      const lvl = levels.get(t.id) || 0;

      return {
        ...t,
        estimates: est,
        level: lvl,
        duration: Math.round(getDuration(t.id) * 10) / 10,
        es: Math.round(es * 10) / 10,
        ef: Math.round(ef * 10) / 10,
        ls: Math.round(ls * 10) / 10,
        lf: Math.round(lf * 10) / 10,
        totalFloat: Math.round(tf * 10) / 10,
        freeFloat: Math.round(ff * 10) / 10,
        isCritical: crit,
        preds: predecessors.get(t.id),
        succs: successors.get(t.id),
        calES: addDays(startDate, es),
        calEF: addDays(startDate, ef),
        calLS: addDays(startDate, ls),
        calLF: addDays(startDate, lf)
      };
    });

    return {
      projectId: pId,
      project: projectObj,
      mode,
      tasks: calculatedTasks,
      hasCycle: false,
      order,
      levels,
      criticalPath,
      criticalTaskIds,
      projectDuration: Math.round(projectDuration * 10) / 10,
      startDate,
      projectedEndDate: addDays(startDate, projectDuration),
      pert: {
        expectedDuration: Math.round(criticalTeSum * 10) / 10,
        variance: Math.round(criticalVarSum * 100) / 100,
        sigma: Math.round(criticalSigma * 100) / 100,
        targetDays,
        zScore: Math.round(zScore * 100) / 100,
        probability: Math.round(completionProb * 1000) / 10, // e.g. 89.4%
        targetDate: addDays(startDate, targetDays),
        confidenceIntervals: {
          p68: [Math.max(0, Math.round((criticalTeSum - criticalSigma) * 10) / 10), Math.round((criticalTeSum + criticalSigma) * 10) / 10],
          p90: [Math.max(0, Math.round((criticalTeSum - 1.645 * criticalSigma) * 10) / 10), Math.round((criticalTeSum + 1.645 * criticalSigma) * 10) / 10],
          p95: [Math.max(0, Math.round((criticalTeSum - 1.96 * criticalSigma) * 10) / 10), Math.round((criticalTeSum + 1.96 * criticalSigma) * 10) / 10],
          p99: [Math.max(0, Math.round((criticalTeSum - 2.576 * criticalSigma) * 10) / 10), Math.round((criticalTeSum + 2.576 * criticalSigma) * 10) / 10]
        }
      }
    };
  };

  // ---- Rendering Helpers ----

  function renderStats(result) {
    const { pert, tasks, criticalTaskIds, project, projectDuration, projectedEndDate } = result;
    const critCount = criticalTaskIds.size;
    const totalCount = tasks.length;
    const slackDays = Math.round(pert.targetDays - pert.expectedDuration);

    const probClass = pert.probability >= 85 ? "prob-status-good" : (pert.probability >= 50 ? "prob-status-warn" : "prob-status-risk");
    const probLabel = pert.probability >= 85 ? "High Confidence" : (pert.probability >= 50 ? "Moderate Risk" : "High Risk / Delay");

    $("cpm-stats").innerHTML = `
      <div class="stat crit-stat">
        <b>${projectDuration} <small style="font-size:1.1rem;font-weight:600">days</small></b>
        <span>Critical Path Duration</span>
        <span class="cpm-stat-sub">Finish: ${formatShortDate(projectedEndDate)} (${critCount}/${totalCount} tasks critical)</span>
      </div>
      <div class="stat">
        <b>${pert.expectedDuration} &plusmn; ${pert.sigma} <small style="font-size:1rem">d</small></b>
        <span>PERT Expected Duration</span>
        <span class="cpm-stat-sub">Estimated variation: about ${pert.sigma} days</span>
      </div>
      <div class="stat">
        <b class="${probClass}">${pert.probability}%</b>
        <span>On-Time Probability</span>
        <span class="cpm-stat-sub">${probLabel} · Chance of meeting the target date</span>
      </div>
      <div class="stat schedule-status-stat ${slackDays < 0 ? "schedule-behind" : (slackDays > 0 ? "schedule-buffer" : "schedule-on-target")}">
        <b class="schedule-status-value">${slackDays < 0 ? `${Math.abs(slackDays)} days behind` : (slackDays > 0 ? `${slackDays} days buffer` : "On target")}</b>
        <span>Schedule Status</span>
        <span class="cpm-stat-sub">${slackDays < 0 ? "The current estimate finishes after your target date." : (slackDays > 0 ? "Time available before the target date." : "The estimate matches your target date.")} Target: ${formatShortDate(pert.targetDate)}</span>
      </div>
    `;
  }

  function renderCriticalChain(result) {
    const { criticalPath, tasks, hasCycle } = result;
    const container = $("cpm-chain-container");
    if (!container) return;

    if (hasCycle) {
      container.innerHTML = `
        <div class="cpm-chain-title" style="color:var(--danger)">⚠ Cyclic Dependency Detected</div>
        <p class="muted small" style="margin-top:6px">Two or more tasks depend on each other in a loop. Edit the dependencies to allow CPM/PERT calculation.</p>
      `;
      return;
    }

    if (!criticalPath.length) {
      container.innerHTML = `
        <div class="cpm-chain-header"><span class="cpm-chain-title">Critical Path Sequence</span></div>
        <p class="cpm-chain-empty">No critical path could be formed. Add tasks and dependencies to evaluate the critical path.</p>
      `;
      return;
    }

    const taskLookup = new Map(tasks.map(t => [t.id, t]));
    const stepsHtml = criticalPath.map((id, index) => {
      const t = taskLookup.get(id);
      if (!t) return "";
      const durText = `${t.duration}d`;
      return `
        <div class="cpm-chain-step" onclick="PP.openTask(${t.id})" title="Click to view task details">
          <span>${PP.esc(t.name)}</span>
          <small>(${durText})</small>
        </div>
        ${index < criticalPath.length - 1 ? '<span class="cpm-chain-arrow">&rarr;</span>' : ""}
      `;
    }).join("");

    container.innerHTML = `
      <div class="cpm-chain-header">
        <span class="cpm-chain-title">⚡ Critical activities (${criticalPath.length})</span>
        <span class="muted small">A delay in any of these tasks delays the whole project.</span>
      </div>
      <div class="cpm-chain-flow">${stepsHtml}</div>
    `;
  }

  // Activity-on-Node (AoN) Network Diagram Rendering
  function renderNetworkDiagram(result) {
    const { tasks, hasCycle } = result;
    const columnsWrap = $("network-columns");
    const svg = $("network-svg");
    const canvas = $("network-canvas");
    if (!columnsWrap || !svg) return;

    if (hasCycle) {
      columnsWrap.innerHTML = '<p class="empty" style="color:var(--danger)">Cannot generate network diagram due to circular dependencies.</p>';
      svg.innerHTML = "";
      return;
    }

    if (!tasks.length) {
      columnsWrap.innerHTML = '<p class="empty">No tasks in this project yet. Add tasks to see the activity network.</p>';
      svg.innerHTML = "";
      return;
    }

    // Group tasks by level
    const maxLevel = tasks.reduce((m, t) => Math.max(m, t.level || 0), 0);
    const cols = [];
    for (let l = 0; l <= maxLevel; l++) cols.push([]);
    tasks.forEach(t => cols[t.level || 0].push(t));

    // Render HTML columns and node cards
    columnsWrap.innerHTML = cols.map((colTasks, lvl) => `
      <div class="network-column" data-level="${lvl}">
        <div class="network-col-header">Phase / Level ${lvl + 1}</div>
        ${colTasks.map(t => `
          <div class="aon-node ${t.isCritical ? "critical" : ""}" id="aon-node-${t.id}" data-id="${t.id}" tabindex="0">
            <div class="node-header">
              <span title="Earliest start in days">Start: ${t.es}</span>
              <span class="node-dur" title="Estimated duration">${t.duration} days</span>
              <span title="Earliest finish in days">Finish: ${t.ef}</span>
            </div>
            <div class="node-body">
              <div class="node-title">${PP.esc(t.name)}</div>
              <div class="node-assignee">${PP.esc(t.assignee || "Unassigned")}</div>
              ${t.isCritical
                ? '<span class="node-badge crit-badge">CRITICAL</span>'
                : `<span class="node-badge slack-badge">Slack: ${t.totalFloat}d</span>`}
            </div>

          </div>
        `).join("")}
      </div>
    `).join("");

    // Add click listeners to nodes
    columnsWrap.querySelectorAll(".aon-node").forEach(node => {
      const id = Number(node.dataset.id);
      node.onclick = () => PP.openTask(id);
      node.onmouseenter = () => highlightConnections(id, result);
      node.onmouseleave = () => resetConnections();
    });

    // Draw SVG dependency lines after DOM layout stabilizes
    setTimeout(() => drawNetworkLines(result), 40);
  }

  function drawNetworkLines(result) {
    const svg = $("network-svg");
    const canvas = $("network-canvas");
    if (!svg || !canvas) return;

    const { tasks, criticalPath } = result;
    const critSet = new Set(criticalPath);

    const canvasRect = canvas.getBoundingClientRect();
    const svgWidth = canvas.scrollWidth || canvas.clientWidth || 800;
    const svgHeight = canvas.scrollHeight || canvas.clientHeight || 500;
    svg.setAttribute("width", svgWidth);
    svg.setAttribute("height", svgHeight);

    let defs = `
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 1 L 9 5 L 0 9 z" fill="#94a3b8"/>
        </marker>
        <marker id="arrow-crit" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 1 L 9 5 L 0 9 z" fill="#e5484d"/>
        </marker>
        <marker id="arrow-highlight" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 1 L 9 5 L 0 9 z" fill="#3b6cf6"/>
        </marker>
      </defs>
    `;

    let paths = "";
    tasks.forEach(t => {
      const predNode = $(`aon-node-${t.id}`);
      if (!predNode) return;
      const predRect = predNode.getBoundingClientRect();
      const x1 = predRect.right - canvasRect.left;
      const y1 = predRect.top + predRect.height / 2 - canvasRect.top;

      (t.succs || []).forEach(succId => {
        const succNode = $(`aon-node-${succId}`);
        if (!succNode) return;
        const succRect = succNode.getBoundingClientRect();
        const x2 = succRect.left - canvasRect.left;
        const y2 = succRect.top + succRect.height / 2 - canvasRect.top;

        const isCritConn = t.isCritical && (result.tasks.find(x => x.id === succId) || {}).isCritical;
        const dx = Math.max(30, (x2 - x1) * 0.45);
        const d = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
        const marker = isCritConn ? "url(#arrow-crit)" : "url(#arrow)";

        paths += `<path d="${d}" class="dep-line ${isCritConn ? "crit-line" : ""}" data-from="${t.id}" data-to="${succId}" marker-end="${marker}"/>`;
      });
    });

    svg.innerHTML = defs + paths;
  }

  function highlightConnections(nodeId, result) {
    const svg = $("network-svg");
    if (!svg) return;
    const task = result.tasks.find(t => t.id === nodeId);
    if (!task) return;

    const connectedNodeIds = new Set([nodeId, ...(task.preds || []), ...(task.succs || [])]);

    document.querySelectorAll(".aon-node").forEach(n => {
      const id = Number(n.dataset.id);
      n.classList.toggle("dimmed", !connectedNodeIds.has(id));
      n.classList.toggle("highlighted", id === nodeId);
    });

    svg.querySelectorAll(".dep-line").forEach(line => {
      const from = Number(line.dataset.from);
      const to = Number(line.dataset.to);
      const isDirect = from === nodeId || to === nodeId;
      line.classList.toggle("dimmed", !isDirect);
      line.classList.toggle("highlighted", isDirect);
      if (isDirect) line.setAttribute("marker-end", "url(#arrow-highlight)");
    });
  }

  function resetConnections() {
    document.querySelectorAll(".aon-node").forEach(n => {
      n.classList.remove("dimmed", "highlighted");
    });
    const svg = $("network-svg");
    if (svg) {
      svg.querySelectorAll(".dep-line").forEach(line => {
        line.classList.remove("dimmed", "highlighted");
        const isCrit = line.classList.contains("crit-line");
        line.setAttribute("marker-end", isCrit ? "url(#arrow-crit)" : "url(#arrow)");
      });
    }
  }

  // Render PERT Statistical Analysis Tab & Interactive Simulator
  function renderPertAnalysis(result) {
    const { pert, startDate } = result;
    const slider = $("pert-target-slider");
    if (!slider) return;

    const expected = pert.expectedDuration || 1;
    const sigma = pert.sigma || Math.max(1, expected * 0.1);
    const minD = Math.max(1, Math.floor(expected - 3.5 * sigma));
    const maxD = Math.max(minD + 1, Math.ceil(expected + 3.5 * sigma));

    slider.min = minD;
    slider.max = maxD;
    slider.value = pert.targetDays || expected;

    $("pert-slider-min").textContent = minD + "d";
    $("pert-slider-max").textContent = maxD + "d";
    $("pert-slider-expected").textContent = expected + "d";

    updatePertSimulator(Number(slider.value), result);

    // Confidence Table
    const conf = pert.confidenceIntervals;
    const confTbody = $("pert-confidence-tbody");
    if (confTbody) {
      const rows = [
        ["68.27% (&plusmn;1&sigma;)", "&plusmn;1.00", `${conf.p68[0]} – ${conf.p68[1]} days`, `${formatShortDate(addDays(startDate, conf.p68[0]))} – ${formatShortDate(addDays(startDate, conf.p68[1]))}`],
        ["90.00% (&plusmn;1.645&sigma;)", "&plusmn;1.65", `${conf.p90[0]} – ${conf.p90[1]} days`, `${formatShortDate(addDays(startDate, conf.p90[0]))} – ${formatShortDate(addDays(startDate, conf.p90[1]))}`],
        ["95.45% (&plusmn;1.96&sigma;)", "&plusmn;1.96", `${conf.p95[0]} – ${conf.p95[1]} days`, `${formatShortDate(addDays(startDate, conf.p95[0]))} – ${formatShortDate(addDays(startDate, conf.p95[1]))}`],
        ["99.00% (&plusmn;2.58&sigma;)", "&plusmn;2.58", `${conf.p99[0]} – ${conf.p99[1]} days`, `${formatShortDate(addDays(startDate, conf.p99[0]))} – ${formatShortDate(addDays(startDate, conf.p99[1]))}`]
      ];
      confTbody.innerHTML = rows.map(r => `
        <tr>
          <td><strong>${r[0]}</strong></td>
          <td><code>${r[1]}</code></td>
          <td><b>${r[2]}</b></td>
          <td>${r[3]}</td>
        </tr>
      `).join("");
    }

    renderBellCurve(Number(slider.value), result);
  }

  function updatePertSimulator(targetDays, result) {
    const { pert, startDate, project } = result;
    const mu = pert.expectedDuration || 1;
    const sigma = pert.sigma || 0.1;
    const z = sigma > 0 ? (targetDays - mu) / sigma : (targetDays >= mu ? 4 : -4);
    const prob = cpm.normalCDF(z);
    const probPct = Math.round(prob * 1000) / 10;

    const targetDate = addDays(startDate, targetDays);
    const zDisplay = (z > 0 ? "+" : "") + z.toFixed(2);

    $("pert-slider-days").textContent = targetDays;
    $("pert-slider-date").textContent = formatShortDate(targetDate);
    $("pert-prob-pct").textContent = probPct + "%";
    $("pert-stat-z").textContent = zDisplay;
    $("pert-stat-deadline").textContent = `${formatShortDate(targetDate)} (${targetDays} days)`;
    $("pert-stat-official").textContent = project && project.deadline ? formatShortDate(project.deadline) : "Not set";

    const statStatus = $("pert-stat-status");
    if (probPct >= 85) {
      statStatus.textContent = "High Confidence";
      statStatus.className = "prob-status-good";
      $("pert-prob-pct").style.color = "var(--success)";
    } else if (probPct >= 50) {
      statStatus.textContent = "Moderate Risk";
      statStatus.className = "prob-status-warn";
      $("pert-prob-pct").style.color = "var(--warn)";
    } else {
      statStatus.textContent = "High Delay Risk";
      statStatus.className = "prob-status-risk";
      $("pert-prob-pct").style.color = "var(--danger)";
    }
  }

  // Gaussian Bell Curve SVG Chart
  function renderBellCurve(targetDays, result) {
    const svg = $("pert-bell-svg");
    if (!svg) return;

    const { pert } = result;
    const mu = pert.expectedDuration || 30;
    const sigma = Math.max(0.5, pert.sigma || 3);

    const width = 500, height = 260;
    const padX = 45, padY = 30;
    const plotW = width - 2 * padX;
    const plotH = height - 2 * padY;

    const xMin = mu - 3.5 * sigma;
    const xMax = mu + 3.5 * sigma;

    const scaleX = x => padX + ((x - xMin) / (xMax - xMin)) * plotW;
    const gaussian = x => Math.exp(-0.5 * Math.pow((x - mu) / sigma, 2));
    const scaleY = yNorm => (height - padY) - (yNorm * plotH * 0.9);

    // Build curve path
    const points = [];
    const steps = 80;
    for (let i = 0; i <= steps; i++) {
      const curX = xMin + (i / steps) * (xMax - xMin);
      const curY = gaussian(curX);
      points.push({ x: scaleX(curX), y: scaleY(curY), origX: curX });
    }

    const pathD = "M " + points.map(p => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" L ");
    const areaD = pathD + ` L ${points[points.length - 1].x} ${height - padY} L ${points[0].x} ${height - padY} Z`;

    // Target shaded area
    const targetPoints = points.filter(p => p.origX <= targetDays);
    let targetAreaD = "";
    if (targetPoints.length) {
      const last = targetPoints[targetPoints.length - 1];
      targetAreaD = "M " + targetPoints.map(p => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" L ") +
        ` L ${last.x.toFixed(1)} ${height - padY} L ${targetPoints[0].x.toFixed(1)} ${height - padY} Z`;
    }

    const muX = scaleX(mu);
    const targetX = Math.max(padX, Math.min(width - padX, scaleX(targetDays)));

    svg.innerHTML = `
      <defs>
        <linearGradient id="bellGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#3b6cf6" stop-opacity="0.25"/>
          <stop offset="100%" stop-color="#3b6cf6" stop-opacity="0.02"/>
        </linearGradient>
        <linearGradient id="targetGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#1fa971" stop-opacity="0.45"/>
          <stop offset="100%" stop-color="#1fa971" stop-opacity="0.08"/>
        </linearGradient>
      </defs>

      <!-- Baseline axis -->
      <line x1="${padX}" y1="${height - padY}" x2="${width - padX}" y2="${height - padY}" stroke="#cbd5e1" stroke-width="1.5"/>

      <!-- Full distribution area -->
      <path d="${areaD}" fill="url(#bellGrad)"/>

      <!-- Shaded Target Probability Area -->
      ${targetAreaD ? `<path d="${targetAreaD}" fill="url(#targetGrad)"/>` : ""}

      <!-- Gaussian line -->
      <path d="${pathD}" fill="none" stroke="#3b6cf6" stroke-width="2.5"/>

      <!-- Mean Line (Expected Duration) -->
      <line x1="${muX}" y1="${padY}" x2="${muX}" y2="${height - padY}" stroke="#7c4dff" stroke-width="2" stroke-dasharray="4 3"/>
      <text x="${muX}" y="${padY - 8}" text-anchor="middle" font-size="11" font-weight="700" fill="#7c4dff">&mu; = ${mu}d</text>

      <!-- Sigma markers -->
      <line x1="${scaleX(mu - sigma)}" y1="${scaleY(gaussian(mu - sigma))}" x2="${scaleX(mu - sigma)}" y2="${height - padY}" stroke="#94a3b8" stroke-dasharray="2 2"/>
      <line x1="${scaleX(mu + sigma)}" y1="${scaleY(gaussian(mu + sigma))}" x2="${scaleX(mu + sigma)}" y2="${height - padY}" stroke="#94a3b8" stroke-dasharray="2 2"/>
      <text x="${scaleX(mu - sigma)}" y="${height - padY + 16}" text-anchor="middle" font-size="10" fill="#64748b">-1&sigma;</text>
      <text x="${scaleX(mu + sigma)}" y="${height - padY + 16}" text-anchor="middle" font-size="10" fill="#64748b">+1&sigma;</text>

      <!-- Target Slider Marker -->
      <line x1="${targetX}" y1="${padY + 10}" x2="${targetX}" y2="${height - padY}" stroke="#e5484d" stroke-width="2.5"/>
      <circle cx="${targetX}" cy="${padY + 10}" r="4" fill="#e5484d"/>
      <text x="${targetX}" y="${padY + 4}" text-anchor="middle" font-size="11" font-weight="800" fill="#e5484d">Target: ${targetDays}d</text>
    `;
  }

  // Render Schedule & Float Table
  function renderScheduleTable(result) {
    const tbody = $("cpm-table-body");
    if (!tbody) return;

    const { tasks, hasCycle } = result;
    if (hasCycle) {
      tbody.innerHTML = '<tr><td colspan="10" class="empty" style="color:var(--danger)">Cyclic dependency detected. Please fix predecessor loops.</td></tr>';
      return;
    }

    if (!tasks.length) {
      tbody.innerHTML = '<tr><td colspan="10" class="empty">No tasks in this project yet.</td></tr>';
      return;
    }

    tbody.innerHTML = tasks.map(t => {
      const predsText = (t.preds && t.preds.length)
        ? t.preds.map(id => {
            const p = PP.data.tasks.find(x => x.id === id);
            return p ? PP.esc(p.name) : id;
          }).join(", ")
        : "-";

      return `
        <tr class="${t.isCritical ? "cpm-row-critical" : ""}">
          <td><b>${PP.esc(t.name)}</b><br><span class="muted small">${t.calES} → ${t.calEF}</span></td>
          <td>${PP.esc(t.assignee || "-")}</td>
          <td><span class="muted small" title="Tasks that must finish first">${predsText === "-" ? "None" : predsText}</span></td>
          <td><b>${t.duration} days</b></td>
          <td>${t.es} days</td>
          <td>${t.ef} days</td>
          <td><strong style="color:${t.isCritical ? "var(--cpm-critical)" : "var(--primary)"}">${t.totalFloat} days</strong></td>
          <td>${t.isCritical
              ? '<span class="badge badge-critical">Critical</span>'
              : '<span class="badge badge-slack">Flexible</span>'}</td>
          <td><button class="link-btn" onclick="PP.openTask(${t.id})">Edit</button></td>
        </tr>
      `;
    }).join("");
  }

  // Main Page Render Hook
  PP.renders["cpm-pert"] = function() {
    const projectSelect = $("cpm-project-select");
    if (projectSelect) {
      const options = PP.data.projects.map(p => `<option value="${p.id}">${PP.esc(p.name)}</option>`).join("");
      projectSelect.innerHTML = options || '<option value="">No projects</option>';

      if (PP.cpmProjectId && PP.data.projects.some(p => p.id === PP.cpmProjectId)) {
        currentProjectId = PP.cpmProjectId;
        PP.cpmProjectId = null;
      } else if (!currentProjectId || !PP.data.projects.some(p => p.id === currentProjectId)) {
        currentProjectId = PP.data.projects[0] ? PP.data.projects[0].id : null;
      }
      projectSelect.value = currentProjectId || "";
    }

    const result = cpm.calculate(currentProjectId, currentMode);

    const context = $("cpm-project-context");
    if (context) {
      const projectName = result.project ? result.project.name : "No project selected";
      const taskCount = result.tasks ? result.tasks.length : 0;
      context.innerHTML = `<div class="cpm-context-heading"><strong>CPM &amp; PERT for: ${PP.esc(projectName)}</strong><span>${taskCount} ${taskCount === 1 ? "activity" : "activities"}</span></div>
        <p>Only this project's tasks are included. Add the activities and connect each task to its predecessors. For PERT, enter optimistic, most-likely, and pessimistic estimates when available.</p>
        <p class="cpm-context-tip">The critical path, schedule status, and on-time chance are recalculated for this project's own scenario.</p>
        ${taskCount ? "" : '<p class="cpm-context-tip">Getting started: add tasks for this project, then connect each task to the work that must finish before it starts.</p>'}`;
    }

    renderStats(result);
    renderCriticalChain(result);
    renderNetworkDiagram(result);
    renderPertAnalysis(result);
    renderScheduleTable(result);
  };

  // Event Listeners Initialization
  document.addEventListener("DOMContentLoaded", () => {
    // Project selection change
    const pSel = $("cpm-project-select");
    if (pSel) {
      pSel.onchange = () => {
        currentProjectId = pSel.value ? Number(pSel.value) : null;
        PP.renders["cpm-pert"]();
      };
    }

    // Mode Toggle (PERT Te vs Standard Dates)
    const btnPert = $("cpm-mode-pert");
    const btnStd = $("cpm-mode-standard");
    if (btnPert && btnStd) {
      btnPert.onclick = () => {
        currentMode = "pert";
        btnPert.classList.add("active");
        btnStd.classList.remove("active");
        PP.renders["cpm-pert"]();
      };
      btnStd.onclick = () => {
        currentMode = "standard";
        btnStd.classList.add("active");
        btnPert.classList.remove("active");
        PP.renders["cpm-pert"]();
      };
    }

    // Tabs
    document.querySelectorAll(".cpm-tab").forEach(tab => {
      tab.onclick = () => {
        document.querySelectorAll(".cpm-tab").forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        activeTab = tab.dataset.tab;

        $("cpm-pane-network").classList.toggle("hidden", activeTab !== "network");
        $("cpm-pane-pert-analysis").classList.toggle("hidden", activeTab !== "pert-analysis");
        $("cpm-pane-schedule-table").classList.toggle("hidden", activeTab !== "schedule-table");

        if (activeTab === "network") {
          const res = cpm.calculate(currentProjectId, currentMode);
          setTimeout(() => drawNetworkLines(res), 30);
        }
      };
    });

    // Target duration slider
    const slider = $("pert-target-slider");
    if (slider) {
      slider.oninput = () => {
        const res = cpm.calculate(currentProjectId, currentMode);
        updatePertSimulator(Number(slider.value), res);
        renderBellCurve(Number(slider.value), res);
      };
    }

    // Add Task from CPM Page
    const addBtn = $("cpm-add-task-btn");
    if (addBtn) {
      addBtn.onclick = () => {
        if (!PP.data.projects.length) return PP.toast("Create a project first.", "error");
        PP.openTask(null, currentProjectId);
      };
    }

    // Export / Print Report
    const exportBtn = $("cpm-export-btn");
    if (exportBtn) {
      exportBtn.onclick = () => {
        window.print();
      };
    }

    // Redraw SVG on window resize
    window.addEventListener("resize", () => {
      if (PP.page === "cpm-pert" && activeTab === "network") {
        const res = cpm.calculate(currentProjectId, currentMode);
        drawNetworkLines(res);
      }
    });
  });
})();
