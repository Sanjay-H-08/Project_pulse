// whatif-simulator.js: Interactive Multi-Variable Scenario Studio, Baseline vs What-If Delta, and 5,000-Run Monte Carlo Simulation
(function() {
  const whatIf = {};
  PP.whatIfEngine = whatIf;

  let currentProjectId = null;
  // Map of taskId -> { durationDelta: number }
  let adjustments = new Map();

  function addDays(dateStr, days) {
    if (!dateStr || dateStr === "-") return "-";
    const cleanStr = String(dateStr).includes("T") ? String(dateStr).split("T")[0] : String(dateStr);
    const d = new Date(cleanStr + "T00:00:00");
    if (isNaN(d.getTime())) return "-";
    const delta = Number(days);
    if (isNaN(delta) || !isFinite(delta)) return cleanStr;
    d.setDate(d.getDate() + Math.round(delta));
    if (isNaN(d.getTime())) return "-";
    return d.toISOString().slice(0, 10);
  }

  function formatShortDate(val) {
    if (!val || val === "-") return "-";
    const d = new Date(val + "T00:00:00");
    if (isNaN(d.getTime())) return String(val);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  // Preload a task adjustment from external buttons (e.g. from Delay Prediction)
  whatIf.loadScenarioForTask = function(taskId, durationDelta = 3) {
    adjustments.clear();
    const t = PP.data.tasks.find(x => x.id === taskId);
    if (t) {
      currentProjectId = Number(t.project);
      adjustments.set(taskId, { durationDelta });
    }
  };

  // Run CPM forward/backward passes on a simulated task set
  whatIf.calculateSimulatedCPM = function(projectId, taskOverrides = new Map()) {
    const pId = projectId ? Number(projectId) : (PP.data.projects[0] ? PP.data.projects[0].id : 1);
    const project = PP.data.projects.find(p => Number(p.id) === pId);
    const rawTasks = PP.data.tasks.filter(t => Number(t.project || t.project_id) === pId);

    if (!rawTasks.length) {
      return { projectDuration: 0, criticalTaskIds: new Set(), tasks: [] };
    }

    // Build simulated tasks with applied adjustments
    const simTasks = rawTasks.map(t => {
      const baseDur = Math.max(1, PP.diff(t.start, t.end) + 1);
      const adj = taskOverrides.get(t.id);
      const delta = adj ? adj.durationDelta : 0;
      const simDur = Math.max(1, baseDur + delta);
      const simEnd = addDays(t.start, simDur - 1);

      return {
        ...t,
        baseDur,
        simDur,
        simEnd,
        durationDelta: delta,
        predecessors: Array.isArray(t.deps) && t.deps.length ? t.deps.map(Number) : (t.dep ? [Number(t.dep)] : []),
        successors: []
      };
    });

    const taskMap = new Map(simTasks.map(t => [t.id, t]));

    // Build adjacency
    simTasks.forEach(t => {
      t.predecessors = t.predecessors.filter(id => taskMap.has(id));
      t.predecessors.forEach(pId => {
        taskMap.get(pId).successors.push(t.id);
      });
    });

    // Topological Sort (Kahn's Algorithm)
    const inDegree = new Map(simTasks.map(t => [t.id, t.predecessors.length]));
    const queue = [];
    inDegree.forEach((deg, id) => { if (deg === 0) queue.push(id); });

    const order = [];
    while (queue.length) {
      const u = queue.shift();
      order.push(u);
      (taskMap.get(u).successors || []).forEach(v => {
        inDegree.set(v, inDegree.get(v) - 1);
        if (inDegree.get(v) === 0) queue.push(v);
      });
    }

    // Forward pass
    const ES = new Map(), EF = new Map();
    order.forEach(id => {
      const t = taskMap.get(id);
      let es = 0;
      t.predecessors.forEach(p => es = Math.max(es, EF.get(p) || 0));
      ES.set(id, es);
      EF.set(id, es + t.simDur);
    });

    let projectDuration = 0;
    order.forEach(id => projectDuration = Math.max(projectDuration, EF.get(id) || 0));

    // Backward pass
    const LS = new Map(), LF = new Map();
    for (let i = order.length - 1; i >= 0; i--) {
      const id = order[i];
      const t = taskMap.get(id);
      let lf = projectDuration;
      if (t.successors.length) {
        lf = Infinity;
        t.successors.forEach(s => lf = Math.min(lf, LS.get(s)));
      }
      LF.set(id, lf);
      LS.set(id, lf - t.simDur);
    }

    // Float & Criticality
    const criticalTaskIds = new Set();
    simTasks.forEach(t => {
      const es = ES.get(t.id) || 0;
      const ef = EF.get(t.id) || t.simDur;
      const ls = LS.get(t.id) || 0;
      const lf = LF.get(t.id) || t.simDur;
      const tf = Math.max(0, lf - ef);

      t.es = es;
      t.ef = ef;
      t.ls = ls;
      t.lf = lf;
      t.totalFloat = tf;
      t.isCritical = tf === 0;
      if (t.isCritical) criticalTaskIds.add(t.id);
    });

    return {
      project,
      projectDuration,
      criticalTaskIds,
      tasks: simTasks
    };
  };

  // Run full simulation comparison
  whatIf.evaluateScenario = function() {
    const pId = currentProjectId ? Number(currentProjectId) : (PP.data.projects[0] ? PP.data.projects[0].id : 1);
    const baselineCPM = whatIf.calculateSimulatedCPM(pId, new Map());
    const simulatedCPM = whatIf.calculateSimulatedCPM(pId, adjustments);

    const project = PP.data.projects.find(p => p.id === pId);
    if (!project) return null;
    const baseDuration = baselineCPM.projectDuration;
    const simDuration = simulatedCPM.projectDuration;
    const durationDelta = simDuration - baseDuration;

    const baseDeadline = project.deadline || PP.day(30);
    const simDeadline = addDays(baseDeadline, durationDelta);

    // Detect critical path shifts
    const newlyCritical = [];
    simulatedCPM.criticalTaskIds.forEach(id => {
      if (!baselineCPM.criticalTaskIds.has(id)) {
        const t = simulatedCPM.tasks.find(x => x.id === id);
        if (t) newlyCritical.push(t.name);
      }
    });

    return {
      project,
      baseDuration,
      simDuration,
      durationDelta,
      baseDeadline,
      simDeadline,
      baselineCPM,
      simulatedCPM,
      newlyCritical
    };
  };

  // Apply Quick Simulation Presets
  whatIf.applyPreset = function(presetName) {
    const pId = currentProjectId ? Number(currentProjectId) : 1;
    const tasks = PP.data.tasks.filter(t => Number(t.project) === pId);
    adjustments.clear();

    if (presetName === "crit-delay") {
      const baseCPM = whatIf.calculateSimulatedCPM(pId, new Map());
      const critTask = tasks.find(t => baseCPM.criticalTaskIds.has(t.id));
      if (critTask) adjustments.set(critTask.id, { durationDelta: 5 });
      PP.toast("Preset applied: +5 days delay on critical activity.");
    } else if (presetName === "crash-schedule") {
      const baseCPM = whatIf.calculateSimulatedCPM(pId, new Map());
      tasks.filter(t => baseCPM.criticalTaskIds.has(t.id)).forEach(ct => {
        const dur = Math.max(1, PP.diff(ct.start, ct.end) + 1);
        const crashDays = Math.max(1, Math.round(dur * 0.25));
        adjustments.set(ct.id, { durationDelta: -crashDays });
      });
      PP.toast("Preset applied: -25% duration crashed on critical path.");
    } else if (presetName === "pessimistic-pert") {
      tasks.forEach(t => {
        const dur = Math.max(1, PP.diff(t.start, t.end) + 1);
        const pess = Number(t.pess) || Math.round(dur * 1.5);
        adjustments.set(t.id, { durationDelta: pess - dur });
      });
      PP.toast("Preset applied: All tasks set to Worst-Case PERT Pessimistic durations.");
    } else if (presetName === "resource-out") {
      const leadTasks = tasks.filter(t => t.assignee === "David Kalu" || t.assignee === "Chen Wei" || t.assignee === tasks[0]?.assignee);
      leadTasks.forEach(t => {
        adjustments.set(t.id, { durationDelta: 5 });
      });
      PP.toast("Preset applied: Lead engineer unavailable (+5d delay on assigned tasks).");
    }

    whatIf.render();
  };

  // Reset simulation to baseline
  whatIf.resetSimulation = function() {
    adjustments.clear();
    PP.toast("Simulation reset to baseline.");
    whatIf.render();
  };

  // Apply simulated dates to live project data
  whatIf.applyToLiveProject = function() {
    if (!adjustments.size) {
      PP.toast("No adjustments to apply.", "error");
      return;
    }
    if (!confirm("Are you sure you want to commit these simulated task dates to your live project?")) return;

    const scenario = whatIf.evaluateScenario();
    scenario.simulatedCPM.tasks.forEach(simT => {
      const liveT = PP.data.tasks.find(x => x.id === simT.id);
      if (liveT && simT.durationDelta !== 0) {
        liveT.end = simT.simEnd;
        liveT.likely = simT.simDur;
        liveT.pess = Math.max(liveT.pess, Math.round(simT.simDur * 1.4));
      }
    });

    if (scenario.durationDelta !== 0 && scenario.project) {
      scenario.project.deadline = scenario.simDeadline;
    }

    PP.save();
    adjustments.clear();
    PP.toast("Simulated scenario committed to live project!");
    whatIf.render();
  };

  // Monte Carlo Simulation Engine (1,000 to 5,000 runs)
  whatIf.runMonteCarlo = function(runs = 1000) {
    const pId = currentProjectId ? Number(currentProjectId) : 1;
    const project = PP.data.projects.find(p => p.id === pId);
    const tasks = PP.data.tasks.filter(t => Number(t.project) === pId);

    if (!tasks.length) {
      PP.toast("No tasks found for Monte Carlo simulation.", "error");
      return;
    }

    const taskCount = tasks.length;
    const predecessorsMap = new Map();
    tasks.forEach(t => {
      const preds = Array.isArray(t.deps) && t.deps.length ? t.deps.map(Number) : (t.dep ? [Number(t.dep)] : []);
      predecessorsMap.set(t.id, preds.filter(id => tasks.some(x => x.id === id)));
    });

    // Topological order
    const inDeg = new Map(tasks.map(t => [t.id, predecessorsMap.get(t.id).length]));
    const queue = [];
    inDeg.forEach((deg, id) => { if (deg === 0) queue.push(id); });
    const order = [];
    while (queue.length) {
      const u = queue.shift();
      order.push(u);
      tasks.forEach(t => {
        if (predecessorsMap.get(t.id).includes(u)) {
          inDeg.set(t.id, inDeg.get(t.id) - 1);
          if (inDeg.get(t.id) === 0) queue.push(t.id);
        }
      });
    }

    // Criticality tally
    const criticalityCounts = new Map(tasks.map(t => [t.id, 0]));
    const sampleDurations = new Float64Array(runs);

    // Random Triangular Distribution sampler
    function sampleTriangular(o, m, p) {
      const u = Math.random();
      const f = (m - o) / (p - o || 1);
      if (u < f) return o + Math.sqrt(u * (p - o) * (m - o));
      return p - Math.sqrt((1 - u) * (p - o) * (p - m));
    }

    // Execute Monte Carlo iterations
    for (let r = 0; r < runs; r++) {
      const durMap = new Map();
      tasks.forEach(t => {
        const calDur = Math.max(1, PP.diff(t.start, t.end) + 1);
        const likely = Number(t.likely) || calDur;
        const opt = Number(t.opt) || Math.max(1, Math.round(likely * 0.75));
        const pess = Number(t.pess) || Math.max(likely + 1, Math.round(likely * 1.5));
        durMap.set(t.id, sampleTriangular(opt, likely, pess));
      });

      // Forward pass
      const EF = new Map();
      order.forEach(id => {
        const preds = predecessorsMap.get(id);
        let es = 0;
        preds.forEach(p => es = Math.max(es, EF.get(p) || 0));
        EF.set(id, es + durMap.get(id));
      });

      let projDur = 0;
      order.forEach(id => projDur = Math.max(projDur, EF.get(id)));
      sampleDurations[r] = projDur;

      // Backward pass to identify critical activities for this run
      const LS = new Map();
      for (let i = order.length - 1; i >= 0; i--) {
        const id = order[i];
        let minSuccLS = projDur;
        tasks.forEach(succ => {
          if (predecessorsMap.get(succ.id).includes(id)) {
            minSuccLS = Math.min(minSuccLS, LS.get(succ.id) || projDur);
          }
        });
        const ls = minSuccLS - durMap.get(id);
        LS.set(id, ls);
      }

      order.forEach(id => {
        const ef = EF.get(id);
        const lf = (LS.get(id) || 0) + durMap.get(id);
        if (Math.abs(lf - ef) < 0.05) {
          criticalityCounts.set(id, criticalityCounts.get(id) + 1);
        }
      });
    }

    // Sort durations for percentiles
    sampleDurations.sort();
    const sum = sampleDurations.reduce((a, b) => a + b, 0);
    const mean = sum / runs;
    const min = sampleDurations[0];
    const max = sampleDurations[runs - 1];

    const p50 = sampleDurations[Math.floor(runs * 0.50)];
    const p75 = sampleDurations[Math.floor(runs * 0.75)];
    const p85 = sampleDurations[Math.floor(runs * 0.85)];
    const p90 = sampleDurations[Math.floor(runs * 0.90)];
    const p95 = sampleDurations[Math.floor(runs * 0.95)];

    // Target deadline probability
    const availableDays = project.deadline ? Math.max(0, PP.diff(PP.day(0), project.deadline)) : 40;
    const onTimeRuns = sampleDurations.filter(d => d <= availableDays).length;
    const probOnTime = Math.round((onTimeRuns / runs) * 100);

    // Criticality Index percentage for each task
    const criticalityList = tasks.map(t => ({
      taskId: t.id,
      name: t.name,
      assignee: t.assignee,
      indexPct: Math.round(((criticalityCounts.get(t.id) || 0) / runs) * 100)
    })).sort((a, b) => b.indexPct - a.indexPct);

    // Update UI
    renderMonteCarloResults({
      runs,
      mean,
      min,
      max,
      p50,
      p75,
      p85,
      p90,
      p95,
      availableDays,
      probOnTime,
      sampleDurations,
      criticalityList
    });
  };

  function renderMonteCarloResults(res) {
    const p50Elem = document.getElementById("mc-p50");
    const p75Elem = document.getElementById("mc-p75");
    const p85Elem = document.getElementById("mc-p85");
    const p90Elem = document.getElementById("mc-p90");
    const p95Elem = document.getElementById("mc-p95");
    const probElem = document.getElementById("mc-ontime-prob");

    if (p50Elem) p50Elem.textContent = res.p50.toFixed(1) + "d";
    if (p75Elem) p75Elem.textContent = res.p75.toFixed(1) + "d";
    if (p85Elem) p85Elem.textContent = res.p85.toFixed(1) + "d";
    if (p90Elem) p90Elem.textContent = res.p90.toFixed(1) + "d";
    if (p95Elem) p95Elem.textContent = res.p95.toFixed(1) + "d";
    if (probElem) {
      probElem.textContent = res.probOnTime + "%";
      probElem.style.color = res.probOnTime >= 80 ? "var(--dp-on-track)" : (res.probOnTime >= 50 ? "var(--dp-minor-lag)" : "var(--dp-severe)");
    }

    // Render Histogram SVG
    renderMCHistogram(res);

    // Render Criticality Index List
    const critTable = document.getElementById("mc-criticality-tbody");
    if (critTable) {
      critTable.innerHTML = res.criticalityList.map(item => `
        <tr>
          <td><strong>${PP.esc(item.name)}</strong></td>
          <td>${PP.esc(item.assignee)}</td>
          <td style="min-width:140px">
            <div class="row-between muted small" style="margin-bottom:2px">
              <span>Criticality Index</span>
              <b>${item.indexPct}%</b>
            </div>
            <div class="criticality-bar-wrap">
              <div class="criticality-bar-fill" style="width:${item.indexPct}%"></div>
            </div>
          </td>
          <td>
            <span class="badge ${item.indexPct >= 75 ? 'p-High' : (item.indexPct >= 30 ? 'p-Medium' : 'p-Low')}">
              ${item.indexPct >= 75 ? 'Pacing Bottleneck' : (item.indexPct >= 30 ? 'Near-Critical' : 'Safe Float')}
            </span>
          </td>
        </tr>
      `).join("");
    }
  }

  function renderMCHistogram(res) {
    const svg = document.getElementById("mc-histogram-svg");
    if (!svg) return;

    const w = 560, h = 240;
    const padding = { top: 20, right: 30, bottom: 40, left: 40 };
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;

    const bins = 28;
    const binSize = (res.max - res.min) / bins;
    const counts = new Array(bins).fill(0);

    for (let i = 0; i < res.sampleDurations.length; i++) {
      const val = res.sampleDurations[i];
      const bIdx = Math.min(bins - 1, Math.floor((val - res.min) / binSize));
      counts[bIdx]++;
    }

    const maxCount = Math.max(...counts, 1);
    const barW = chartW / bins;

    let svgInner = `
      <defs>
        <linearGradient id="mcBarGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#6366f1" stop-opacity="0.85"/>
          <stop offset="100%" stop-color="#818cf8" stop-opacity="0.4"/>
        </linearGradient>
      </defs>
    `;

    // Draw bars
    counts.forEach((cnt, idx) => {
      const bH = (cnt / maxCount) * chartH;
      const x = padding.left + idx * barW;
      const y = padding.top + (chartH - bH);
      const binVal = (res.min + (idx + 0.5) * binSize).toFixed(1);

      svgInner += `
        <rect x="${x + 1}" y="${y}" width="${Math.max(1, barW - 2)}" height="${bH}" fill="url(#mcBarGrad)" rx="2">
          <title>${cnt} iterations around ${binVal} days</title>
        </rect>
      `;
    });

    // P50 line
    const p50X = padding.left + ((res.p50 - res.min) / (res.max - res.min)) * chartW;
    svgInner += `
      <line x1="${p50X}" y1="${padding.top}" x2="${p50X}" y2="${padding.top + chartH}" stroke="#10b981" stroke-width="2" stroke-dasharray="4 3"/>
      <text x="${p50X + 4}" y="${padding.top + 16}" font-size="10" font-weight="700" fill="#10b981">P50: ${res.p50.toFixed(1)}d</text>
    `;

    // Target deadline line if within range
    if (res.availableDays >= res.min && res.availableDays <= res.max) {
      const deadX = padding.left + ((res.availableDays - res.min) / (res.max - res.min)) * chartW;
      svgInner += `
        <line x1="${deadX}" y1="${padding.top}" x2="${deadX}" y2="${padding.top + chartH}" stroke="#ef4444" stroke-width="2"/>
        <text x="${deadX + 4}" y="${padding.top + 32}" font-size="10" font-weight="700" fill="#ef4444">Deadline: ${res.availableDays}d</text>
      `;
    }

    // Bottom axis line
    svgInner += `
      <line x1="${padding.left}" y1="${padding.top + chartH}" x2="${w - padding.right}" y2="${padding.top + chartH}" stroke="#cbd5e1" stroke-width="1"/>
      <text x="${padding.left}" y="${h - 10}" font-size="10" fill="#94a3b8">${res.min.toFixed(0)}d (Min)</text>
      <text x="${w / 2}" y="${h - 10}" text-anchor="middle" font-size="10" fill="#94a3b8">Expected: ${res.mean.toFixed(1)}d</text>
      <text x="${w - padding.right}" y="${h - 10}" text-anchor="end" font-size="10" fill="#94a3b8">${res.max.toFixed(0)}d (Max)</text>
    `;

    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    svg.innerHTML = svgInner;
  }

  // Render the entire What-If Simulator Page
  whatIf.render = function() {
    const sel = document.getElementById("whatif-project-select");
    if (sel) {
      const oldVal = sel.value || (currentProjectId ? String(currentProjectId) : (PP.data.projects[0] ? String(PP.data.projects[0].id) : "1"));
      sel.innerHTML = PP.data.projects.map(p => `<option value="${p.id}">${PP.esc(p.name)}</option>`).join("");
      if ([...sel.options].some(o => o.value === oldVal)) {
        sel.value = oldVal;
        currentProjectId = Number(oldVal);
      } else if (PP.data.projects[0]) {
        currentProjectId = PP.data.projects[0].id;
        sel.value = currentProjectId;
      }
    }

    const scenario = whatIf.evaluateScenario();
    if (!scenario) return;

    // 1. Update Impact Summary Cards
    const durBaseElem = document.getElementById("sim-stat-duration-base");
    const durSimElem = document.getElementById("sim-stat-duration-sim");
    const durDeltaElem = document.getElementById("sim-stat-duration-delta");
    if (durBaseElem) durBaseElem.textContent = scenario.baseDuration + " days";
    if (durSimElem) durSimElem.textContent = scenario.simDuration + " days";
    if (durDeltaElem) {
      const d = scenario.durationDelta;
      durDeltaElem.textContent = d > 0 ? `+${d}d (Delayed)` : (d < 0 ? `${d}d (Compressed)` : "0d (Identical)");
      durDeltaElem.className = `impact-delta ${d > 0 ? 'delta-delay' : (d < 0 ? 'delta-crash' : 'delta-same')}`;
    }

    const finishBaseElem = document.getElementById("sim-stat-finish-base");
    const finishSimElem = document.getElementById("sim-stat-finish-sim");
    const finishDeltaElem = document.getElementById("sim-stat-finish-delta");
    if (finishBaseElem) finishBaseElem.textContent = formatShortDate(scenario.baseDeadline);
    if (finishSimElem) finishSimElem.textContent = formatShortDate(scenario.simDeadline);
    if (finishDeltaElem) {
      const d = scenario.durationDelta;
      finishDeltaElem.textContent = d > 0 ? `+${d} days slip` : (d < 0 ? `${Math.abs(d)} days recovered` : "On schedule");
      finishDeltaElem.className = `impact-delta ${d > 0 ? 'delta-delay' : (d < 0 ? 'delta-crash' : 'delta-same')}`;
    }

    // 2. Critical Path Shift Alert
    const shiftBox = document.getElementById("sim-path-shift-alert");
    if (shiftBox) {
      if (scenario.newlyCritical.length > 0) {
        shiftBox.classList.remove("hidden");
        shiftBox.innerHTML = `
          <span>⚠️ <b>Critical Path Shift Detected!</b> The following task(s) became zero-float bottlenecks under this scenario:
          <b>${scenario.newlyCritical.map(PP.esc).join(", ")}</b>.</span>
        `;
      } else {
        shiftBox.classList.add("hidden");
      }
    }

    // 3. Populate Task Selector for Slider Controls
    const taskSel = document.getElementById("sim-task-select");
    const pTasks = PP.data.tasks.filter(t => Number(t.project) === currentProjectId);
    if (taskSel) {
      const curSelected = taskSel.value;
      taskSel.innerHTML = pTasks.map(t => `<option value="${t.id}">${PP.esc(t.name)} (${t.assignee})</option>`).join("");
      if ([...taskSel.options].some(o => o.value === curSelected)) {
        taskSel.value = curSelected;
      }
    }

    // Update Slider with current selected task's active delta
    updateSliderUI();

    // 4. Render Active Adjustments List
    const adjContainer = document.getElementById("sim-active-adjustments");
    if (adjContainer) {
      if (!adjustments.size) {
        adjContainer.innerHTML = `<span class="muted small">No modifications active. Drag the slider or choose a preset above.</span>`;
      } else {
        adjContainer.innerHTML = Array.from(adjustments.entries()).map(([tId, adj]) => {
          const t = PP.data.tasks.find(x => x.id === tId);
          const d = adj.durationDelta;
          return `
            <span class="adjustment-pill">
              <b>${PP.esc(t ? t.name : tId)}</b>: ${d > 0 ? `+${d}d` : `${d}d`}
              <button onclick="PP.whatIfEngine.removeAdjustment(${tId})" title="Remove adjustment">&times;</button>
            </span>
          `;
        }).join("");
      }
    }

    // 5. Render Comparison Table
    renderComparisonTable(scenario);
  };

  function updateSliderUI() {
    const taskSel = document.getElementById("sim-task-select");
    const slider = document.getElementById("sim-delta-slider");
    const bubble = document.getElementById("sim-slider-val");
    if (!taskSel || !slider) return;

    const tId = Number(taskSel.value);
    const existing = adjustments.get(tId);
    const val = existing ? existing.durationDelta : 0;

    slider.value = val;
    if (bubble) {
      bubble.textContent = val > 0 ? `+${val} days (Delay)` : (val < 0 ? `${val} days (Crashed)` : "0 days (Baseline)");
      bubble.style.color = val > 0 ? "var(--sim-delayed)" : (val < 0 ? "var(--sim-crashed)" : "var(--muted)");
    }
  }

  whatIf.removeAdjustment = function(taskId) {
    adjustments.delete(taskId);
    whatIf.render();
  };

  function renderComparisonTable(scenario) {
    const tbody = document.getElementById("sim-compare-tbody");
    if (!tbody) return;

    tbody.innerHTML = scenario.simulatedCPM.tasks.map(simT => {
      const baseT = scenario.baselineCPM.tasks.find(x => x.id === simT.id) || simT;
      const delta = simT.durationDelta;
      const dClass = delta > 0 ? 'delta-delay' : (delta < 0 ? 'delta-crash' : 'delta-same');
      const dLabel = delta > 0 ? `+${delta}d` : (delta < 0 ? `${delta}d` : '0d');

      return `
        <tr>
          <td>
            <strong>${PP.esc(simT.name)}</strong>
            <div class="muted small">${PP.esc(simT.assignee)}</div>
          </td>
          <td>${baseT.baseDur} days</td>
          <td>
            <b>${simT.simDur} days</b>
          </td>
          <td>
            <span class="impact-delta ${dClass}">${dLabel}</span>
          </td>
          <td>${formatShortDate(simT.start)} &rarr; ${formatShortDate(simT.simEnd)}</td>
          <td>
            ${simT.isCritical
              ? '<span class="badge badge-critical">⚡ Critical</span>'
              : `<span class="badge badge-slack">Slack ${simT.totalFloat}d</span>`
            }
          </td>
        </tr>
      `;
    }).join("");
  }

  // Event Listeners
  document.addEventListener("DOMContentLoaded", () => {
    const pSel = document.getElementById("whatif-project-select");
    if (pSel) {
      pSel.addEventListener("change", e => {
        currentProjectId = Number(e.target.value);
        adjustments.clear();
        whatIf.render();
      });
    }

    // Task select changed
    const taskSel = document.getElementById("sim-task-select");
    if (taskSel) {
      taskSel.addEventListener("change", updateSliderUI);
    }

    // Slider changed
    const slider = document.getElementById("sim-delta-slider");
    if (slider) {
      slider.addEventListener("input", e => {
        const val = Number(e.target.value);
        const tId = Number(document.getElementById("sim-task-select").value);
        if (val === 0) {
          adjustments.delete(tId);
        } else {
          adjustments.set(tId, { durationDelta: val });
        }
        whatIf.render();
      });
    }

    // Preset buttons
    document.querySelectorAll("[data-preset]").forEach(btn => {
      btn.onclick = () => whatIf.applyPreset(btn.dataset.preset);
    });

    // Reset button
    const resetBtn = document.getElementById("sim-reset-btn");
    if (resetBtn) resetBtn.onclick = whatIf.resetSimulation;

    // Apply to live project
    const applyBtn = document.getElementById("sim-apply-btn");
    if (applyBtn) applyBtn.onclick = whatIf.applyToLiveProject;

    // Monte Carlo run button
    const mcBtn = document.getElementById("mc-run-btn");
    if (mcBtn) {
      mcBtn.onclick = () => {
        const runs = Number(document.getElementById("mc-runs-select")?.value || 1000);
        whatIf.runMonteCarlo(runs);
        PP.toast(`Monte Carlo simulation completed with ${runs.toLocaleString()} runs.`);
      };
    }
  });

  PP.renders["whatif-simulator"] = () => {
    whatIf.render();
    whatIf.runMonteCarlo(1000); // Precompute baseline Monte Carlo on page entry!
  };
})();
