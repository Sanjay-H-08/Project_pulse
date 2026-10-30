// delay-prediction.js: Predictive Milestone Slippage, Earned Schedule (SPI), DAG Ripple Effects & Smart Recommendations
(function() {
  const delayEngine = {};
  PP.delayEngine = delayEngine;

  let currentProjectId = null;
  let statusFilter = "all";
  let critOnlyFilter = false;

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

  // Calculate task-level predicted delays
  delayEngine.predictTask = function(task, cpmTask) {
    const today = PP.day(0);
    const plannedDur = Math.max(1, PP.diff(task.start, task.end) + 1);
    const elapsedDays = Math.max(0, PP.diff(task.start, today));

    let expectedProgress = 0;
    if (today > task.end) {
      expectedProgress = 100;
    } else if (today >= task.start) {
      expectedProgress = Math.min(100, Math.round((elapsedDays / plannedDur) * 100));
    }

    const actualProgress = Number(task.progress) || 0;
    let spi = 1.0;
    if (task.status === "Done") {
      spi = 1.0;
    } else if (expectedProgress > 5) {
      spi = Math.max(0.15, Math.round((actualProgress / expectedProgress) * 100) / 100);
    }

    // Projected duration calculation
    let projectedDur = plannedDur;
    let delayDays = 0;

    if (task.status === "Done") {
      projectedDur = plannedDur;
      delayDays = 0;
    } else if (task.status === "In Progress") {
      if (actualProgress > 0 && elapsedDays > 0) {
        const ratePerDay = actualProgress / elapsedDays;
        const remainingPct = 100 - actualProgress;
        const remainingDays = remainingPct / Math.max(0.01, ratePerDay);
        projectedDur = Math.max(plannedDur, Math.round(elapsedDays + remainingDays));
      } else {
        // In progress but 0% completed
        const overdueDays = Math.max(0, PP.diff(task.end, today));
        projectedDur = plannedDur + Math.max(1, overdueDays);
      }
      delayDays = Math.max(0, projectedDur - plannedDur);
    } else {
      // To Do
      if (today > task.start) {
        // Late start
        const lateStartDays = PP.diff(task.start, today);
        projectedDur = plannedDur + lateStartDays;
        delayDays = lateStartDays;
      }
    }

    const isCritical = cpmTask ? cpmTask.isCritical : false;
    const totalFloat = cpmTask ? cpmTask.totalFloat : 0;

    // Buffer absorption: if task has float, part or all of delay is absorbed
    const milestoneImpact = isCritical ? delayDays : Math.max(0, delayDays - totalFloat);
    const floatRemaining = Math.max(0, totalFloat - delayDays);
    const projectedFinish = addDays(task.start, projectedDur);

    return {
      taskId: task.id,
      name: task.name,
      assignee: task.assignee,
      project: task.project,
      status: task.status,
      plannedStart: task.start,
      plannedEnd: task.end,
      plannedDur,
      actualProgress,
      expectedProgress,
      spi,
      projectedDur,
      delayDays,
      milestoneImpact,
      isCritical,
      totalFloat,
      floatRemaining,
      projectedFinish
    };
  };

  // Run comprehensive prediction across the whole project
  delayEngine.evaluateProject = function(projectId) {
    const pId = projectId ? Number(projectId) : (PP.data.projects[0] ? PP.data.projects[0].id : null);
    const project = PP.data.projects.find(p => p.id === pId) || PP.data.projects[0];
    if (!project) return null;

    const allTasks = PP.data.tasks.filter(t => t.project === project.id);
    const cpmRes = PP.cpm ? PP.cpm.calculate(project.id) : null;
    const cpmTaskMap = new Map((cpmRes ? cpmRes.tasks : []).map(t => [t.id, t]));

    // Successor DAG mapping for cascade ripple analysis
    const successorsMap = new Map();
    allTasks.forEach(t => successorsMap.set(t.id, []));
    allTasks.forEach(t => {
      const preds = Array.isArray(t.deps) ? t.deps : (t.dep ? [t.dep] : []);
      preds.forEach(pId => {
        if (successorsMap.has(Number(pId))) {
          successorsMap.get(Number(pId)).push(t.id);
        }
      });
    });

    // Helper: count downstream dependents (cascade footprint)
    function getCascadeCount(taskId) {
      const visited = new Set();
      const queue = [...(successorsMap.get(taskId) || [])];
      while (queue.length) {
        const curr = queue.shift();
        if (!visited.has(curr)) {
          visited.add(curr);
          (successorsMap.get(curr) || []).forEach(nxt => queue.push(nxt));
        }
      }
      return visited.size;
    }

    const taskPredictions = allTasks.map(t => {
      const pred = delayEngine.predictTask(t, cpmTaskMap.get(t.id));
      pred.cascadeCount = getCascadeCount(t.id);
      return pred;
    });

    // Overall Project Milestone Prediction
    const maxMilestoneSlip = taskPredictions.reduce((m, t) => Math.max(m, t.milestoneImpact), 0);
    const originalDeadline = project.deadline || PP.day(30);
    const projectedDeadline = addDays(originalDeadline, maxMilestoneSlip);

    // Weighted Project SPI
    const totalPlanned = taskPredictions.reduce((s, t) => s + t.expectedProgress, 0);
    const totalActual = taskPredictions.reduce((s, t) => s + t.actualProgress, 0);
    const projectSPI = totalPlanned > 0 ? Math.round((totalActual / totalPlanned) * 100) / 100 : 1.0;

    // Delivery Risk Level
    let riskLevel = "good", riskLabel = "On Schedule / Low Risk";
    if (maxMilestoneSlip > 7 || projectSPI < 0.75) {
      riskLevel = "crit";
      riskLabel = "High Delay Risk (Critical)";
    } else if (maxMilestoneSlip > 0 || projectSPI < 0.9) {
      riskLevel = "warn";
      riskLabel = "Moderate Slippage Risk";
    }

    // On-Time Probability from CPM PERT
    let onTimeProb = 85;
    if (cpmRes && cpmRes.pert && cpmRes.pert.probability) {
      // Adjust probability based on project SPI
      onTimeProb = Math.max(5, Math.min(99, Math.round(cpmRes.pert.probability * Math.min(1.0, projectSPI))));
    }

    // Identify primary bottleneck task
    const primaryBottleneck = taskPredictions
      .filter(t => t.isCritical && t.delayDays > 0)
      .sort((a, b) => b.delayDays - a.delayDays)[0] || null;

    return {
      project,
      tasks: taskPredictions,
      cpmRes,
      maxMilestoneSlip,
      originalDeadline,
      projectedDeadline,
      projectSPI,
      riskLevel,
      riskLabel,
      onTimeProb,
      primaryBottleneck
    };
  };

  // Generate Smart Actionable Mitigation Recommendations
  delayEngine.generateRecommendations = function(evalResult) {
    if (!evalResult) return [];
    const recs = [];
    const { tasks, primaryBottleneck, project } = evalResult;

    // 1. Crashing Critical Bottleneck
    if (primaryBottleneck && primaryBottleneck.delayDays > 0) {
      const recDays = Math.min(primaryBottleneck.delayDays, 3);
      recs.push({
        type: "crashing",
        typeLabel: "Resource Crashing",
        title: `Crash critical activity "${primaryBottleneck.name}" by ${recDays} day(s)`,
        desc: `This task is on the critical path with SPI ${primaryBottleneck.spi} and +${primaryBottleneck.delayDays}d predicted slippage. Adding extra team support can recover up to ${recDays} days of schedule buffer.`,
        benefit: `Recovers ~${recDays} days directly on final project deadline (${formatShortDate(evalResult.projectedDeadline)}).`,
        taskId: primaryBottleneck.taskId,
        actionDelta: -recDays
      });
    }

    // 2. Fast-Tracking / Parallelizing Sequential Dependencies
    const sequentialCritical = tasks.filter(t => t.isCritical && t.status !== "Done");
    if (sequentialCritical.length >= 2) {
      const t1 = sequentialCritical[0], t2 = sequentialCritical[1];
      recs.push({
        type: "fasttrack",
        typeLabel: "Fast-Tracking",
        title: `Fast-track "${t1.name}" and "${t2.name}" in parallel`,
        desc: `Currently executed in series. Overlapping the design/planning and setup stages by 2 to 3 days compresses overall lead time without increasing costs.`,
        benefit: `Reduces sequence length by up to 3 calendar days.`,
        taskId: t2.taskId,
        actionDelta: -2
      });
    }

    // 3. Workload Balance & Resource Reallocation
    const assigneeTaskCounts = {};
    tasks.filter(t => t.status !== "Done").forEach(t => {
      assigneeTaskCounts[t.assignee] = (assigneeTaskCounts[t.assignee] || 0) + 1;
    });
    const overloaded = Object.entries(assigneeTaskCounts).sort((a, b) => b[1] - a[1])[0];
    if (overloaded && overloaded[1] >= 3) {
      const availableMember = PP.data.team.find(m => m !== overloaded[0] && (assigneeTaskCounts[m] || 0) <= 1);
      recs.push({
        type: "rebalance",
        typeLabel: "Workload Reallocation",
        title: `Rebalance tasks from ${overloaded[0]} (${overloaded[1]} active tasks)`,
        desc: `${overloaded[0]} is carrying the largest open task load. Offloading secondary items to ${availableMember || "another team member"} prevents burn-out and queue delays.`,
        benefit: `Eliminates resource wait-times across dependent tasks.`,
        taskId: tasks.find(t => t.assignee === overloaded[0] && !t.isCritical)?.taskId || 0,
        actionDelta: 0
      });
    }

    // 4. Slack Buffer Notice
    const nonCritDelayed = tasks.filter(t => !t.isCritical && t.delayDays > 0);
    if (nonCritDelayed.length > 0) {
      const t = nonCritDelayed[0];
      recs.push({
        type: "buffer",
        typeLabel: "Slack Buffer Monitoring",
        title: `Slippage on non-critical task "${t.name}" (+${t.delayDays}d)`,
        desc: `This task currently has ${t.totalFloat} days of slack. The delay is safely absorbed (${t.floatRemaining} days float left) and will not delay project deadline if capped here.`,
        benefit: `No immediate crashing needed; monitor progress closely.`,
        taskId: t.taskId,
        actionDelta: 0
      });
    }

    return recs;
  };

  // Render the Delay Prediction View
  delayEngine.render = function() {
    const sel = document.getElementById("delay-project-select");
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

    const evalResult = delayEngine.evaluateProject(currentProjectId);
    if (!evalResult) return;

    // 1. Hero Card Updates
    const heroCard = document.getElementById("delay-hero-card");
    if (heroCard) {
      heroCard.className = `delay-hero-card ${evalResult.riskLevel === 'crit' ? 'critical' : evalResult.riskLevel === 'warn' ? 'warning' : ''}`;
    }

    const heroStatus = document.getElementById("delay-hero-status");
    if (heroStatus) {
      heroStatus.textContent = evalResult.riskLabel;
      heroStatus.className = `delay-hero-status-badge status-badge-${evalResult.riskLevel}`;
    }

    const slipDaysElem = document.getElementById("delay-stat-slip");
    if (slipDaysElem) {
      slipDaysElem.textContent = evalResult.maxMilestoneSlip === 0
        ? "0 days (On Track)"
        : `+${evalResult.maxMilestoneSlip} day${evalResult.maxMilestoneSlip === 1 ? '' : 's'} slip`;
      slipDaysElem.style.color = evalResult.maxMilestoneSlip > 0 ? "var(--dp-severe)" : "var(--dp-on-track)";
    }

    const projDeadlineElem = document.getElementById("delay-stat-projected-date");
    if (projDeadlineElem) {
      projDeadlineElem.textContent = formatShortDate(evalResult.projectedDeadline);
    }

    const spiElem = document.getElementById("delay-stat-spi");
    if (spiElem) {
      spiElem.textContent = evalResult.projectSPI.toFixed(2);
      spiElem.style.color = evalResult.projectSPI >= 1.0 ? "var(--dp-on-track)" : (evalResult.projectSPI >= 0.85 ? "var(--dp-minor-lag)" : "var(--dp-severe)");
    }

    const probElem = document.getElementById("delay-stat-prob");
    if (probElem) {
      probElem.textContent = evalResult.onTimeProb + "%";
      probElem.style.color = evalResult.onTimeProb >= 80 ? "var(--dp-on-track)" : (evalResult.onTimeProb >= 50 ? "var(--dp-minor-lag)" : "var(--dp-severe)");
    }

    // 2. Cascade Ripple & Bottleneck Visualizer
    const cascadeList = document.getElementById("cascade-timeline-list");
    if (cascadeList) {
      const slippingTasks = evalResult.tasks
        .filter(t => t.status !== "Done")
        .sort((a, b) => b.milestoneImpact - a.milestoneImpact);

      if (!slippingTasks.length) {
        cascadeList.innerHTML = `<p class="muted small">All tasks are completed or scheduled on track.</p>`;
      } else {
        cascadeList.innerHTML = slippingTasks.slice(0, 5).map(t => {
          const maxDur = Math.max(...evalResult.tasks.map(x => x.projectedDur));
          const plannedPct = Math.round((t.plannedDur / maxDur) * 100);
          const slipPct = Math.round((t.delayDays / maxDur) * 100);

          return `
            <div class="cascade-row">
              <div class="cascade-row-top">
                <span class="cascade-task-title">
                  ${PP.esc(t.name)}
                  ${t.isCritical ? '<span class="badge badge-critical" style="font-size:0.68rem">⚡ Critical</span>' : ''}
                </span>
                <span class="muted small">${t.assignee} · ${t.delayDays > 0 ? `+${t.delayDays}d delay` : 'On track'}</span>
              </div>
              <div class="cascade-bar-wrap" title="Planned: ${t.plannedDur}d, Delay: +${t.delayDays}d">
                <div class="cascade-bar-planned" style="width:${plannedPct}%"></div>
                ${t.delayDays > 0 ? `<div class="cascade-bar-slip" style="width:${slipPct}%"></div>` : ''}
              </div>
              <div class="row-between muted small" style="margin-top:2px;margin-bottom:0">
                <span>Cascade Ripple: <b>${t.cascadeCount} downstream task${t.cascadeCount === 1 ? '' : 's'}</b></span>
                <span>Milestone Impact: <b>${t.milestoneImpact > 0 ? `+${t.milestoneImpact}d` : '0d (Absorbed)'}</b></span>
              </div>
            </div>
          `;
        }).join("");
      }
    }

    // 3. AI Smart Recommendations
    const recContainer = document.getElementById("delay-ai-recommendations");
    if (recContainer) {
      const recommendations = delayEngine.generateRecommendations(evalResult);
      if (!recommendations.length) {
        recContainer.innerHTML = `<p class="muted small">Schedule is currently on track. No urgent recovery actions needed.</p>`;
      } else {
        recContainer.innerHTML = recommendations.map(rec => `
          <div class="ai-recommendation-item">
            <div class="ai-rec-top">
              <strong class="ai-rec-title">${PP.esc(rec.title)}</strong>
              <span class="ai-rec-type rec-${rec.type}">${rec.typeLabel}</span>
            </div>
            <p class="ai-rec-body">${PP.esc(rec.desc)}</p>
            <div class="row-between" style="margin-bottom:0">
              <div class="ai-rec-benefit"><span>✓</span> ${PP.esc(rec.benefit)}</div>
              ${rec.taskId ? `
                <button class="btn ghost small-btn" onclick="PP.delayEngine.jumpToWhatIf(${rec.taskId}, ${rec.actionDelta})" type="button">
                  🧪 Simulate in What-If
                </button>
              ` : ''}
            </div>
          </div>
        `).join("");
      }
    }

    // 4. Delay Prediction Table
    renderPredictionTable(evalResult.tasks);
  };

  function renderPredictionTable(tasks) {
    const tbody = document.getElementById("delay-table-body");
    if (!tbody) return;

    let list = [...tasks];
    if (statusFilter !== "all") list = list.filter(t => t.status === statusFilter);
    if (critOnlyFilter) list = list.filter(t => t.isCritical);

    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="8" class="empty">No tasks match the active filters.</td></tr>`;
      return;
    }

    tbody.innerHTML = list.map(t => {
      const spiClass = t.spi >= 1.0 ? "spi-good" : (t.spi >= 0.85 ? "spi-warn" : "spi-bad");
      const slipClass = t.delayDays > 0 ? "delay" : (t.delayDays < 0 ? "ahead" : "ontime");
      const slipLabel = t.delayDays > 0 ? `+${t.delayDays}d` : (t.delayDays < 0 ? `${t.delayDays}d` : "0d");

      return `
        <tr>
          <td>
            <strong>${PP.esc(t.name)}</strong>
            <div class="muted small">${formatShortDate(t.plannedStart)} – ${formatShortDate(t.plannedEnd)}</div>
          </td>
          <td><b>${PP.esc(t.assignee)}</b></td>
          <td>
            ${t.isCritical
              ? '<span class="badge badge-critical" title="Zero Float bottleneck">⚡ Critical</span>'
              : `<span class="badge badge-slack" title="Float: ${t.totalFloat}d">Slack ${t.totalFloat}d</span>`
            }
          </td>
          <td style="min-width:110px">
            <div class="row-between muted small" style="margin-bottom:2px">
              <span>Actual: ${t.actualProgress}%</span>
              <span>Exp: ${t.expectedProgress}%</span>
            </div>
            <div class="bar"><i style="width:${t.actualProgress}%"></i></div>
          </td>
          <td>
            <span class="spi-badge ${spiClass}">${t.spi.toFixed(2)}</span>
          </td>
          <td>
            <span class="slip-tag ${slipClass}">${slipLabel}</span>
            <div class="muted small">${t.milestoneImpact > 0 ? `+${t.milestoneImpact}d to proj` : 'Buffered'}</div>
          </td>
          <td>
            <strong>${formatShortDate(t.projectedFinish)}</strong>
          </td>
          <td>
            <button class="btn ghost small-btn" onclick="PP.delayEngine.jumpToWhatIf(${t.taskId}, ${t.delayDays > 0 ? t.delayDays : 3})" title="Open interactive simulation for this task">
              🧪 Simulate
            </button>
          </td>
        </tr>
      `;
    }).join("");
  }

  // Deep-link straight into What-If Simulator with pre-selected task & delta!
  delayEngine.jumpToWhatIf = function(taskId, suggestedDelta) {
    if (PP.whatIfEngine) {
      PP.whatIfEngine.loadScenarioForTask(taskId, suggestedDelta);
    }
    PP.showPage("whatif-simulator");
    location.hash = "whatif-simulator";
  };

  // Event Listeners
  document.addEventListener("DOMContentLoaded", () => {
    const pSel = document.getElementById("delay-project-select");
    if (pSel) {
      pSel.addEventListener("change", e => {
        currentProjectId = Number(e.target.value);
        delayEngine.render();
      });
    }

    const stFilter = document.getElementById("delay-filter-status");
    if (stFilter) {
      stFilter.addEventListener("change", e => {
        statusFilter = e.target.value;
        const evalRes = delayEngine.evaluateProject(currentProjectId);
        if (evalRes) renderPredictionTable(evalRes.tasks);
      });
    }

    const critToggle = document.getElementById("delay-toggle-crit-only");
    if (critToggle) {
      critToggle.addEventListener("click", () => {
        critOnlyFilter = !critOnlyFilter;
        critToggle.classList.toggle("active", critOnlyFilter);
        const evalRes = delayEngine.evaluateProject(currentProjectId);
        if (evalRes) renderPredictionTable(evalRes.tasks);
      });
    }

    const exportBtn = document.getElementById("export-delay-btn");
    if (exportBtn) {
      exportBtn.onclick = () => {
        const evalRes = delayEngine.evaluateProject(currentProjectId);
        if (!evalRes) return;
        const headers = ["Task", "Assignee", "Status", "Planned Start", "Planned End", "Planned Dur", "Actual %", "Expected %", "SPI", "Delay Days", "Milestone Impact", "Projected Finish", "Critical Path"];
        const rows = evalRes.tasks.map(t => [
          t.name, t.assignee, t.status, t.plannedStart, t.plannedEnd, t.plannedDur, t.actualProgress, t.expectedProgress, t.spi, t.delayDays, t.milestoneImpact, t.projectedFinish, t.isCritical ? "Yes" : "No"
        ]);
        const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `projectpulse-delay-prediction-${PP.day(0)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        PP.toast("Delay prediction exported.");
      };
    }
  });

  PP.renders["delay-prediction"] = delayEngine.render;
})();
