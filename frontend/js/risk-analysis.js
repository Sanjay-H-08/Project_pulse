// risk-analysis.js: Comprehensive Risk Register, 5x5 Heatmap Matrix, and Systemic Risk Scanner
(function() {
  const riskEngine = {};
  PP.riskEngine = riskEngine;

  // Active filter state
  let currentProjectId = "all";
  let activeMatrixFilter = null; // { likelihood, impact } or null
  let editingRiskId = null;

  // Severity calculator
  riskEngine.getSeverity = function(score) {
    if (score >= 16) return { name: "Critical", class: "critical" };
    if (score >= 10) return { name: "High", class: "high" };
    if (score >= 5)  return { name: "Medium", class: "medium" };
    return { name: "Low", class: "low" };
  };

  // Default industrial risks if none exist
  riskEngine.initDefaultRisks = function() {
    if (!Array.isArray(PP.data.risks) || PP.data.risks.length === 0) {
      const projId = (PP.data.projects[0] || {}).id || 1;
      const tSensors = (PP.data.tasks.find(t => t.name.includes("Sensor")) || {}).id || 4;
      const tPlc = (PP.data.tasks.find(t => t.name.includes("PLC")) || {}).id || 3;
      const tSafety = (PP.data.tasks.find(t => t.name.includes("Safety")) || {}).id || 7;
      const tRobot = (PP.data.tasks.find(t => t.name.includes("Robot")) || {}).id || 6;

      PP.data.risks = [
        {
          id: 1,
          project: projId,
          projectId: projId,
          taskId: tSensors,
          title: "Sensor Supply Chain Component Bottleneck",
          desc: "Global silicon and optoelectronic sensor lead-time delays impacting downstream robot cell integration.",
          category: "External",
          likelihood: 5,
          impact: 4,
          score: 20,
          owner: "David Kalu",
          mitigation: "Expedite emergency air freight for substitute industrial optical sensors from secondary distributor.",
          contingency: "Temporarily bridge optical signals using software simulation harnesses for preliminary testing.",
          status: "Open",
          dateAdded: PP.day(-12)
        },
        {
          id: 2,
          project: projId,
          projectId: projId,
          taskId: tPlc,
          title: "Fieldbus Communication & I/O Mapping Jitter",
          desc: "High packet latency on PROFINET network causing intermittent cyclic communication faults.",
          category: "Technical",
          likelihood: 3,
          impact: 4,
          score: 12,
          owner: "Priya Sharma",
          mitigation: "Conduct isolated loopback packet analysis and implement shielded CAT6A industrial cables.",
          contingency: "Isolate motion-control drives onto a dedicated sub-ring topology with QoS priority.",
          status: "Mitigating",
          dateAdded: PP.day(-8)
        },
        {
          id: 3,
          project: projId,
          projectId: projId,
          taskId: tSafety,
          title: "Emergency E-Stop Hardware Interlock Certification Delay",
          desc: "Third-party regulatory inspector schedule conflict delaying final safety certificate sign-off.",
          category: "Technical",
          likelihood: 2,
          impact: 5,
          score: 10,
          owner: "David Kalu",
          mitigation: "Pre-audit dual-channel safety relays with certified third-party TÜV inspector before formal sign-off.",
          contingency: "Schedule provisional remote inspection with video telemetry to authorize pre-commissioning runs.",
          status: "Open",
          dateAdded: PP.day(-5)
        },
        {
          id: 4,
          project: projId,
          projectId: projId,
          taskId: tRobot,
          title: "Robot Tool-Center-Point Calibration Drift",
          desc: "Vibrational harmonics from high-speed conveyor causing minor TCP offset during carton pick-and-place.",
          category: "Operational",
          likelihood: 2,
          impact: 3,
          score: 6,
          owner: "Marcus Vance",
          mitigation: "Implement daily laser-guided zero-point calibration and routine gripper torque monitoring.",
          contingency: "Reinforce robot floor anchoring plate with epoxy chemical studs.",
          status: "Monitored",
          dateAdded: PP.day(-15)
        }
      ];
      PP.save();
    }
  };

  // Calculate composite Project Health Index (0 - 100)
  riskEngine.calculateHealthIndex = function(projectId) {
    const pId = projectId && projectId !== "all" ? Number(projectId) : null;
    const projectRisks = PP.data.risks.filter(r => !pId || Number(r.project) === pId);
    const projectTasks = PP.data.tasks.filter(t => !pId || Number(t.project || t.project_id) === pId);

    if (!projectTasks.length && !projectRisks.length) {
      return { score: 100, label: "Healthy", class: "safe" };
    }

    let penalty = 0;
    // Risk penalty based on open/mitigating risk scores
    projectRisks.forEach(r => {
      if (r.status !== "Closed") {
        const score = r.likelihood * r.impact;
        if (score >= 16) penalty += 18;
        else if (score >= 10) penalty += 10;
        else if (score >= 5)  penalty += 5;
        else penalty += 2;
      }
    });

    // Schedule penalty based on overdue tasks
    const today = PP.day(0);
    projectTasks.forEach(t => {
      if (t.status !== "Done" && t.end < today) {
        penalty += 12;
      }
    });

    // Critical path penalty if CPM available
    if (PP.cpm && pId) {
      const cpmRes = PP.cpm.calculate(pId);
      const critTasks = cpmRes.tasks.filter(t => t.isCritical);
      critTasks.forEach(t => {
        const durSpread = (Number(t.pess) || t.duration) - (Number(t.opt) || 1);
        if (durSpread > 6) penalty += 8; // High uncertainty on critical path
      });
    }

    const health = Math.max(12, Math.min(100, 100 - penalty));
    let label = "Healthy", cls = "safe";
    if (health < 45) { label = "Critical Exposure"; cls = "crit"; }
    else if (health < 75) { label = "Moderate Risk"; cls = "warn"; }

    return { score: health, label, class: cls };
  };

  // Systemic Early-Warning Schedule Scanner
  riskEngine.scanSystemicRisks = function(projectId) {
    const pId = projectId && projectId !== "all" ? Number(projectId) : null;
    const tasks = PP.data.tasks.filter(t => !pId || Number(t.project || t.project_id) === pId);
    const warnings = [];
    const today = PP.day(0);

    // 1. Critical Path High-Variance Alert
    if (PP.cpm) {
      const targetProjects = pId ? [PP.data.projects.find(p => p.id === pId)].filter(Boolean) : PP.data.projects;
      targetProjects.forEach(proj => {
        const cpmRes = PP.cpm.calculate(proj.id);
        cpmRes.tasks.filter(t => t.isCritical).forEach(ct => {
          const spread = (Number(ct.pess) || ct.duration) - (Number(ct.opt) || 1);
          if (spread >= 5) {
            warnings.push({
              level: "critical",
              title: `High PERT Variance on Critical Path: "${ct.name}"`,
              desc: `Critical activity in '${proj.name}' has a pessimistic spread of ${spread} days. Any variance delay immediately delays final project delivery.`,
              category: "Schedule",
              suggestedLikelihood: 4,
              suggestedImpact: 5,
              owner: ct.assignee,
              project: proj.id,
              taskId: ct.id
            });
          }
        });
      });
    }

    // 2. Imminent Slippage Alert (due within 3 days but progress < 40%)
    tasks.filter(t => t.status !== "Done").forEach(t => {
      const daysLeft = PP.diff(today, t.end);
      if (daysLeft < 0) {
        warnings.push({
          level: "critical",
          title: `Overdue Task: "${t.name}" (${Math.abs(daysLeft)}d overdue)`,
          desc: `Assigned to ${t.assignee}. Progress is currently ${t.progress}%. Needs immediate reprioritization or fast-tracking.`,
          category: "Schedule",
          suggestedLikelihood: 5,
          suggestedImpact: 4,
          owner: t.assignee,
          project: t.project,
          taskId: t.id
        });
      } else if (daysLeft <= 4 && t.progress < 40) {
        warnings.push({
          level: "warning",
          title: `Imminent Slippage Risk: "${t.name}"`,
          desc: `Only ${daysLeft} days remaining to deadline, but task is only ${t.progress}% complete. High likelihood of missing target date.`,
          category: "Schedule",
          suggestedLikelihood: 4,
          suggestedImpact: 4,
          owner: t.assignee,
          project: t.project,
          taskId: t.id
        });
      }
    });

    // 3. Resource Concentration Bottleneck
    const assigneeCriticalCounts = {};
    if (PP.cpm) {
      const targetProjects = pId ? [PP.data.projects.find(p => p.id === pId)].filter(Boolean) : PP.data.projects;
      targetProjects.forEach(proj => {
        const cpmRes = PP.cpm.calculate(proj.id);
        cpmRes.tasks.filter(t => t.isCritical).forEach(ct => {
          if (ct.assignee) {
            assigneeCriticalCounts[ct.assignee] = (assigneeCriticalCounts[ct.assignee] || 0) + 1;
          }
        });
      });
    }
    Object.entries(assigneeCriticalCounts).forEach(([name, count]) => {
      if (count >= 3) {
        warnings.push({
          level: "warning",
          title: `Resource Congestion: ${name} (${count} critical tasks)`,
          desc: `${name} is on the critical path for ${count} simultaneous activities. Illness, delays, or competing priorities will cause systemic project slip.`,
          category: "Resource",
          suggestedLikelihood: 4,
          suggestedImpact: 4,
          owner: name,
          project: pId || 1,
          taskId: 0
        });
      }
    });

    return warnings;
  };

  // Render 5x5 Heatmap Matrix
  function renderHeatmap(risks) {
    const container = document.getElementById("risk-matrix-grid");
    if (!container) return;

    const likelihoods = [5, 4, 3, 2, 1];
    const impacts = [1, 2, 3, 4, 5];
    const lLabels = ["Almost Certain (5)", "Likely (4)", "Moderate (3)", "Unlikely (2)", "Rare (1)"];

    let html = `
      <div class="heatmap-row-axis">
        <div class="heatmap-col-header" style="text-align:right">Likelihood ↓ / Impact →</div>
        <div class="heatmap-col-header">1 - Negligible</div>
        <div class="heatmap-col-header">2 - Minor</div>
        <div class="heatmap-col-header">3 - Moderate</div>
        <div class="heatmap-col-header">4 - Major</div>
        <div class="heatmap-col-header">5 - Catastrophic</div>
      </div>
    `;

    likelihoods.forEach((l, rIdx) => {
      html += `<div class="heatmap-row-axis">`;
      html += `<div class="heatmap-row-label">${lLabels[rIdx]}</div>`;

      impacts.forEach(imp => {
        const score = l * imp;
        const matching = risks.filter(r => Number(r.likelihood) === l && Number(r.impact) === imp);
        const count = matching.length;
        const sev = riskEngine.getSeverity(score);
        const isActive = activeMatrixFilter && activeMatrixFilter.likelihood === l && activeMatrixFilter.impact === imp;

        html += `
          <div class="heatmap-cell heat-${sev.class} ${isActive ? 'active-filter' : ''}" 
               data-l="${l}" data-i="${imp}" 
               title="Likelihood: ${l}, Impact: ${imp} (Score: ${score}) - Click to filter register">
            <span>${count > 0 ? count : "—"}</span>
            <small>${count > 0 ? (count === 1 ? "1 risk" : count + " risks") : sev.name}</small>
          </div>
        `;
      });

      html += `</div>`;
    });

    container.innerHTML = html;

    // Attach click handlers to heatmap cells
    container.querySelectorAll(".heatmap-cell").forEach(cell => {
      cell.onclick = () => {
        const l = Number(cell.dataset.l);
        const imp = Number(cell.dataset.i);
        if (activeMatrixFilter && activeMatrixFilter.likelihood === l && activeMatrixFilter.impact === imp) {
          activeMatrixFilter = null; // Toggle off
        } else {
          activeMatrixFilter = { likelihood: l, impact: imp };
        }
        renderHeatmap(risks);
        renderRiskTable();
      };
    });
  }

  // Render Risk Register Table
  function renderRiskTable() {
    const tbody = document.getElementById("risk-table-body");
    const countBadge = document.getElementById("filtered-risk-count");
    if (!tbody) return;

    const pId = currentProjectId !== "all" ? Number(currentProjectId) : null;
    const catFilter = document.getElementById("risk-filter-cat")?.value || "";
    const sevFilter = document.getElementById("risk-filter-sev")?.value || "";
    const statusFilter = document.getElementById("risk-filter-status")?.value || "";
    const searchVal = (document.getElementById("risk-search-input")?.value || "").toLowerCase().trim();

    const filtered = PP.data.risks.filter(r => {
      if (pId && Number(r.project) !== pId) return false;
      if (catFilter && r.category !== catFilter) return false;
      if (statusFilter && r.status !== statusFilter) return false;
      const score = Number(r.likelihood) * Number(r.impact);
      const sev = riskEngine.getSeverity(score);
      if (sevFilter && sev.class !== sevFilter) return false;

      // Matrix Cell Filter
      if (activeMatrixFilter) {
        if (Number(r.likelihood) !== activeMatrixFilter.likelihood || Number(r.impact) !== activeMatrixFilter.impact) {
          return false;
        }
      }

      if (searchVal) {
        const haystack = (r.title + " " + (r.desc || "") + " " + (r.owner || "") + " " + (r.mitigation || "")).toLowerCase();
        if (!haystack.includes(searchVal)) return false;
      }

      return true;
    });

    if (countBadge) {
      countBadge.textContent = `${filtered.length} of ${PP.data.risks.length} risks shown`;
      if (activeMatrixFilter) {
        countBadge.innerHTML += ` <button class="link-btn small" id="clear-matrix-filter" style="margin-left:8px">Clear Matrix Filter (L:${activeMatrixFilter.likelihood}, I:${activeMatrixFilter.impact}) ✕</button>`;
        setTimeout(() => {
          const clearBtn = document.getElementById("clear-matrix-filter");
          if (clearBtn) clearBtn.onclick = () => {
            activeMatrixFilter = null;
            renderHeatmap(PP.data.risks.filter(r => !pId || Number(r.project) === pId));
            renderRiskTable();
          };
        }, 10);
      }
    }

    if (!filtered.length) {
      tbody.innerHTML = `<tr><td colspan="8" class="empty">No risks match the selected filters. Click "+ Add Risk" or clear filters.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(r => {
      const score = Number(r.likelihood) * Number(r.impact);
      const sev = riskEngine.getSeverity(score);
      const projName = PP.projectName(r.project);
      const linkedTask = r.taskId ? PP.data.tasks.find(t => t.id === Number(r.taskId)) : null;

      return `
        <tr>
          <td class="risk-title-cell">
            <strong>${PP.esc(r.title)}</strong>
            <span>${PP.esc(r.desc || "No description provided.")}</span>
            <div style="margin-top:4px">
              <span class="cat-tag">${PP.esc(r.category || "General")}</span>
              ${linkedTask ? `<span class="cat-tag cat-task">Task: ${PP.esc(linkedTask.name)}</span>` : ''}
            </div>
          </td>
          <td><b>${PP.esc(projName)}</b></td>
          <td style="text-align:center">
            <span class="risk-score-pill ${sev.class}">${score}</span>
            <div class="muted small">${r.likelihood}L &times; ${r.impact}I</div>
          </td>
          <td>
            <span class="risk-badge ${sev.class}">${sev.name}</span>
          </td>
          <td>
            <div style="font-weight:600">${PP.esc(r.owner || "Unassigned")}</div>
          </td>
          <td style="max-width:240px;font-size:0.82rem">
            <div><b>Mitigation:</b> ${PP.esc(r.mitigation || "None specified")}</div>
            ${r.contingency ? `<div class="muted" style="margin-top:3px"><b>Contingency:</b> ${PP.esc(r.contingency)}</div>` : ''}
          </td>
          <td>
            <select class="status-pill-select" onchange="PP.riskEngine.updateRiskStatus(${r.id}, this.value)">
              ${["Open", "Mitigating", "Monitored", "Closed"].map(st => `
                <option value="${st}" ${r.status === st ? 'selected' : ''}>${st}</option>
              `).join('')}
            </select>
          </td>
          <td style="white-space:nowrap">
            <button class="link-btn" onclick="PP.riskEngine.openEditModal(${r.id})">Edit</button>
            <button class="link-btn del" onclick="PP.riskEngine.deleteRisk(${r.id})">Delete</button>
          </td>
        </tr>
      `;
    }).join("");
  }

  // Render Systemic Scanner Alerts
  function renderScannerAlerts(projectId) {
    const container = document.getElementById("risk-scanner-list");
    if (!container) return;

    const warnings = riskEngine.scanSystemicRisks(projectId);
    if (!warnings.length) {
      container.innerHTML = `
        <div class="scanner-item info">
          <div class="scanner-top"><strong>All Project Schedules Stable</strong></div>
          <p class="scanner-desc">No imminent task slippages, high-variance critical paths, or resource congestion bottlenecks detected.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = warnings.slice(0, 6).map((w, idx) => `
      <div class="scanner-item ${w.level}">
        <div class="scanner-top">
          <strong>${PP.esc(w.title)}</strong>
          <span class="badge ${w.level === 'critical' ? 'p-High' : 'p-Medium'}">${w.category}</span>
        </div>
        <p class="scanner-desc">${PP.esc(w.desc)}</p>
        <button class="btn ghost small-btn scanner-action" onclick="PP.riskEngine.adoptSystemicWarning(${idx})" type="button">
          + Add to Risk Register
        </button>
      </div>
    `).join("");

    riskEngine._activeWarnings = warnings;
  }

  // Convert a scanner warning to a register item
  riskEngine.adoptSystemicWarning = function(warningIdx) {
    const w = (riskEngine._activeWarnings || [])[warningIdx];
    if (!w) return;
    riskEngine.openAddModal({
      title: w.title.replace(/^[^:]+:\s*/, "").replace(/["']/g, ""),
      desc: w.desc,
      category: w.category,
      project: w.project,
      taskId: w.taskId,
      likelihood: w.suggestedLikelihood,
      impact: w.suggestedImpact,
      owner: w.owner
    });
  };

  // Render all views on the Risk Analysis Page
  riskEngine.render = function() {
    riskEngine.initDefaultRisks();

    // Populate project selector
    const sel = document.getElementById("risk-project-select");
    if (sel) {
      const oldVal = sel.value || currentProjectId;
      sel.innerHTML = `<option value="all">All Projects</option>` +
        PP.data.projects.map(p => `<option value="${p.id}">${PP.esc(p.name)}</option>`).join("");
      if ([...sel.options].some(o => o.value === oldVal)) {
        sel.value = oldVal;
        currentProjectId = oldVal;
      }
    }

    const pId = currentProjectId !== "all" ? Number(currentProjectId) : null;
    const projectRisks = PP.data.risks.filter(r => !pId || Number(r.project) === pId);

    // Compute Health Index
    const health = riskEngine.calculateHealthIndex(currentProjectId);
    const healthVal = document.getElementById("risk-stat-health");
    const healthBadge = document.getElementById("risk-stat-health-badge");
    if (healthVal) healthVal.textContent = health.score + "/100";
    if (healthBadge) {
      healthBadge.textContent = health.label;
      healthBadge.className = `risk-stat-hint ${health.class}`;
    }

    // Counts breakdown
    const critCount = projectRisks.filter(r => {
      const s = Number(r.likelihood) * Number(r.impact);
      return s >= 16 && r.status !== "Closed";
    }).length;
    const openCount = projectRisks.filter(r => r.status !== "Closed").length;
    const closedCount = projectRisks.filter(r => r.status === "Closed").length;
    const mitigatedPct = projectRisks.length ? Math.round((closedCount / projectRisks.length) * 100) : 0;

    const countOpenElem = document.getElementById("risk-stat-open");
    const countCritElem = document.getElementById("risk-stat-crit");
    const countMitElem = document.getElementById("risk-stat-mitigated");
    if (countOpenElem) countOpenElem.textContent = openCount;
    if (countCritElem) countCritElem.textContent = critCount;
    if (countMitElem) countMitElem.textContent = mitigatedPct + "%";

    renderHeatmap(projectRisks);
    renderScannerAlerts(currentProjectId);
    renderRiskTable();
  };

  // Open Modal to Add or Edit Risk
  riskEngine.openAddModal = function(defaults = {}) {
    editingRiskId = null;
    const modal = document.getElementById("risk-modal");
    if (!modal) return;

    document.getElementById("risk-modal-title").textContent = "Add Project Risk";
    document.getElementById("rm-title").value = defaults.title || "";
    document.getElementById("rm-desc").value = defaults.desc || "";
    document.getElementById("rm-cat").value = defaults.category || "Technical";
    document.getElementById("rm-likelihood").value = defaults.likelihood || 3;
    document.getElementById("rm-impact").value = defaults.impact || 3;
    document.getElementById("rm-mitigation").value = defaults.mitigation || "";
    document.getElementById("rm-contingency").value = defaults.contingency || "";
    document.getElementById("rm-status").value = defaults.status || "Open";

    // Populate Projects Dropdown
    const pSel = document.getElementById("rm-project");
    pSel.innerHTML = PP.data.projects.map(p => `<option value="${p.id}">${PP.esc(p.name)}</option>`).join("");
    if (defaults.project) pSel.value = defaults.project;
    else if (currentProjectId !== "all") pSel.value = currentProjectId;

    // Populate Owners Dropdown
    const oSel = document.getElementById("rm-owner");
    oSel.innerHTML = PP.data.team.map(m => `<option value="${PP.esc(m)}">${PP.esc(m)}</option>`).join("");
    if (defaults.owner) oSel.value = defaults.owner;

    // Populate Tasks
    refreshModalTasks(defaults.taskId);

    updateModalScorePreview();
    modal.classList.remove("hidden");
  };

  riskEngine.openEditModal = function(id) {
    const risk = PP.data.risks.find(r => r.id === id);
    if (!risk) return;
    editingRiskId = id;

    const modal = document.getElementById("risk-modal");
    if (!modal) return;

    document.getElementById("risk-modal-title").textContent = "Edit Project Risk";
    document.getElementById("rm-title").value = risk.title;
    document.getElementById("rm-desc").value = risk.desc || "";
    document.getElementById("rm-cat").value = risk.category || "Technical";
    document.getElementById("rm-likelihood").value = risk.likelihood;
    document.getElementById("rm-impact").value = risk.impact;
    document.getElementById("rm-mitigation").value = risk.mitigation || "";
    document.getElementById("rm-contingency").value = risk.contingency || "";
    document.getElementById("rm-status").value = risk.status || "Open";

    const pSel = document.getElementById("rm-project");
    pSel.innerHTML = PP.data.projects.map(p => `<option value="${p.id}">${PP.esc(p.name)}</option>`).join("");
    pSel.value = risk.project;

    const oSel = document.getElementById("rm-owner");
    oSel.innerHTML = PP.data.team.map(m => `<option value="${PP.esc(m)}">${PP.esc(m)}</option>`).join("");
    oSel.value = risk.owner || PP.data.team[0];

    refreshModalTasks(risk.taskId);
    updateModalScorePreview();
    modal.classList.remove("hidden");
  };

  function refreshModalTasks(selectedTaskId) {
    const pId = Number(document.getElementById("rm-project")?.value || 1);
    const tSel = document.getElementById("rm-task");
    if (!tSel) return;
    const tasks = PP.data.tasks.filter(t => Number(t.project || t.project_id) === pId);
    tSel.innerHTML = `<option value="0">Entire Project (No specific task)</option>` +
      tasks.map(t => `<option value="${t.id}">${PP.esc(t.name)}</option>`).join("");
    if (selectedTaskId) tSel.value = selectedTaskId;
  }

  function updateModalScorePreview() {
    const l = Number(document.getElementById("rm-likelihood")?.value || 3);
    const imp = Number(document.getElementById("rm-impact")?.value || 3);
    const score = l * imp;
    const sev = riskEngine.getSeverity(score);
    const preview = document.getElementById("rm-score-preview");
    if (preview) {
      preview.innerHTML = `Risk Score: <b>${score} / 25</b> (<span class="risk-badge ${sev.class}">${sev.name}</span>)`;
    }
  }

  riskEngine.deleteRisk = async function(id) {
    if (!confirm("Are you sure you want to remove this risk from the register?")) return;
    const r = PP.data.risks.find(x => x.id === id);
    if (r && PP.api && PP.api.risks) {
      try {
        await PP.api.risks.delete(r.project || r.projectId, id);
      } catch (_) {}
    }
    PP.data.risks = PP.data.risks.filter(x => x.id !== id);
    PP.save();
    riskEngine.render();
    PP.toast("Risk removed.");
  };

  riskEngine.updateRiskStatus = function(id, newStatus) {
    const risk = PP.data.risks.find(r => r.id === id);
    if (!risk) return;
    risk.status = newStatus;
    PP.save();
    riskEngine.render();
    PP.toast(`Status updated to ${newStatus}.`);
  };

  // Export Risk Register to CSV
  riskEngine.exportCSV = function() {
    const headers = ["ID", "Project", "Title", "Description", "Category", "Likelihood", "Impact", "Score", "Severity", "Owner", "Mitigation", "Contingency", "Status", "Date Added"];
    const rows = PP.data.risks.map(r => {
      const score = Number(r.likelihood) * Number(r.impact);
      const sev = riskEngine.getSeverity(score).name;
      const projName = PP.projectName(r.project);
      return [
        r.id,
        projName,
        r.title,
        r.desc || "",
        r.category || "",
        r.likelihood,
        r.impact,
        score,
        sev,
        r.owner || "",
        r.mitigation || "",
        r.contingency || "",
        r.status || "Open",
        r.dateAdded || ""
      ];
    });

    const csvContent = [headers, ...rows].map(row =>
      row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",")
    ).join("\r\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `prognix-risks-${PP.day(0)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    PP.toast("Risk register exported to CSV.");
  };

  // Setup Event Listeners
  document.addEventListener("DOMContentLoaded", () => {
    // Project select change
    const pSel = document.getElementById("risk-project-select");
    if (pSel) {
      pSel.addEventListener("change", e => {
        currentProjectId = e.target.value;
        activeMatrixFilter = null;
        riskEngine.render();
      });
    }

    // Filters
    ["risk-filter-cat", "risk-filter-sev", "risk-filter-status"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener("change", renderRiskTable);
    });
    const searchInput = document.getElementById("risk-search-input");
    if (searchInput) searchInput.addEventListener("input", renderRiskTable);

    // Add Risk Button
    const addBtn = document.getElementById("add-risk-btn");
    if (addBtn) addBtn.onclick = () => riskEngine.openAddModal();

    // Export CSV Button
    const expBtn = document.getElementById("export-risks-btn");
    if (expBtn) expBtn.onclick = () => riskEngine.exportCSV();

    // Modal Live Preview
    ["rm-likelihood", "rm-impact"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener("input", updateModalScorePreview);
    });
    const mProjSel = document.getElementById("rm-project");
    if (mProjSel) mProjSel.addEventListener("change", () => refreshModalTasks());

    // Modal Close
    const cancelBtn = document.getElementById("rm-cancel");
    if (cancelBtn) cancelBtn.onclick = () => document.getElementById("risk-modal")?.classList.add("hidden");

    // Modal Form Submit
    const form = document.getElementById("risk-modal-form");
    if (form) {
      form.onsubmit = async e => {
        e.preventDefault();
        const title = document.getElementById("rm-title").value.trim();
        if (!title) {
          document.getElementById("rm-error").textContent = "Please enter a risk title.";
          return;
        }

        const project = Number(document.getElementById("rm-project").value);
        const taskId = Number(document.getElementById("rm-task").value);
        const category = document.getElementById("rm-cat").value;
        const likelihood = Number(document.getElementById("rm-likelihood").value);
        const impact = Number(document.getElementById("rm-impact").value);
        const owner = document.getElementById("rm-owner").value;
        const mitigation = document.getElementById("rm-mitigation").value.trim();
        const contingency = document.getElementById("rm-contingency").value.trim();
        const status = document.getElementById("rm-status").value;
        const desc = document.getElementById("rm-desc").value.trim();

        const riskPayload = {
          title,
          description: desc || null,
          category,
          likelihood,
          impact,
          task_id: taskId > 0 ? taskId : null,
          mitigation: mitigation || null
        };

        try {
          if (editingRiskId) {
            let updatedRisk = null;
            if (PP.api && PP.api.risks) {
              const res = await PP.api.risks.update(project, editingRiskId, riskPayload);
              updatedRisk = res;
            }
            const r = PP.data.risks.find(x => x.id === editingRiskId);
            if (r) {
              Object.assign(r, {
                title, desc, project, taskId, category, likelihood, impact,
                score: likelihood * impact, owner, mitigation, contingency, status
              });
            }
            PP.toast("Risk updated.");
          } else {
            let serverRiskId = Date.now();
            if (PP.api && PP.api.risks) {
              const res = await PP.api.risks.create(project, riskPayload);
              serverRiskId = res.id;
            }
            PP.data.risks.push({
              id: serverRiskId,
              project,
              projectId: project,
              taskId,
              title,
              desc,
              category,
              likelihood,
              impact,
              score: likelihood * impact,
              owner,
              mitigation,
              contingency,
              status,
              dateAdded: PP.day(0)
            });
            PP.toast("New risk added to register.");
          }

          PP.save();
          document.getElementById("risk-modal").classList.add("hidden");
          riskEngine.render();
        } catch (apiErr) {
          document.getElementById("rm-error").textContent = apiErr.message || "Failed to save risk to server.";
        }
      };
    }
  });

  // Attach to PP renderer
  PP.renders["risk-analysis"] = riskEngine.render;
})();
