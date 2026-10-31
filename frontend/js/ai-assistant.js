// ai-assistant.js: Intelligent Project & Operations Research AI Assistant.
// Connects directly to database models (Projects, Tasks, CPM, PERT, Risks)
// and delivers targeted solutions for EACH and EVERY project in the site.

const DEFAULT_PROMPTS = [
  "⚡ Identify Critical Path (CPM)",
  "📊 PERT on-time probability",
  "⏱️ Predict project delays & SPI",
  "👥 Who has the heaviest workload?",
  "🛡️ Show project risks & 5x5 matrix",
  "📋 360° Complete Project Solution",
  "⚡ How to crash a project schedule?",
  "🛑 How to handle unexpected scope creep?",
  "🔄 Total Float vs Free Float"
];

function formatMarkdown(text) {
  if (!text) return "";
  let esc = PP.esc(text);

  // Math blocks
  esc = esc.replace(/\$\$([^$]+)\$\$/g, '<div class="math-block"><code>$1</code></div>');
  esc = esc.replace(/\$([^$]+)\$/g, '<code class="math-inline">$1</code>');

  // Headings
  esc = esc.replace(/^#### (.*?)$/gm, '<h5 style="margin:10px 0 4px;font-size:0.95rem;color:var(--text);font-weight:700;">$1</h5>');
  esc = esc.replace(/^### (.*?)$/gm, '<h4 style="margin:12px 0 6px;font-size:1.05rem;color:var(--primary);font-weight:700;">$1</h4>');
  esc = esc.replace(/^## (.*?)$/gm, '<h3 style="margin:14px 0 8px;font-size:1.15rem;color:var(--primary);font-weight:700;">$1</h3>');

  // Bold & Italic
  esc = esc.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  esc = esc.replace(/\*(.*?)\*/g, '<em>$1</em>');
  esc = esc.replace(/`([^`]+)`/g, '<code style="background:var(--soft);padding:2px 6px;border-radius:4px;font-size:0.88em;color:var(--primary);">$1</code>');

  // Tables
  if (esc.includes("|")) {
    const lines = esc.split("\n");
    let inTable = false;
    let tableHtml = '<div style="overflow-x:auto;margin:10px 0;"><table class="ai-table" style="width:100%;border-collapse:collapse;font-size:0.85rem;">';
    let newLines = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith("|") && line.endsWith("|")) {
        if (!inTable) {
          inTable = true;
          tableHtml = '<div style="overflow-x:auto;margin:10px 0;"><table class="ai-table" style="width:100%;border-collapse:collapse;font-size:0.85rem;">';
        }
        if (line.includes("---")) continue;
        const cells = line.split("|").slice(1, -1).map(c => c.trim());
        const tag = tableHtml.includes("<th") ? "td" : "th";
        tableHtml += `<tr>${cells.map(c => `<${tag} style="border:1px solid var(--border);padding:6px 10px;text-align:left;">${c}</${tag}>`).join("")}</tr>`;
      } else {
        if (inTable) {
          tableHtml += '</table></div>';
          newLines.push(tableHtml);
          inTable = false;
        }
        newLines.push(lines[i]);
      }
    }
    if (inTable) {
      tableHtml += '</table></div>';
      newLines.push(tableHtml);
    }
    esc = newLines.join("\n");
  }

  // Lists
  esc = esc.replace(/^[•\-\*] (.*?)$/gm, '<li style="margin-left:18px;margin-bottom:4px;">$1</li>');
  esc = esc.replace(/^(\d+)\. (.*?)$/gm, '<li style="margin-left:18px;margin-bottom:4px;" value="$1">$2</li>');

  // Spacing
  esc = esc.replace(/\n\n/g, '<div style="height:8px;"></div>');
  esc = esc.replace(/\n/g, '<br>');

  return esc;
}

function getSelectedProjectId() {
  const sel = $("ai-project-select");
  if (!sel || !sel.value || sel.value === "all") return null;
  return Number(sel.value);
}

function updateProjectSelector() {
  const sel = $("ai-project-select");
  if (!sel) return;

  const currentVal = sel.value;
  const projects = PP.data && PP.data.projects ? PP.data.projects : [];

  let opts = '<option value="all">🌐 All Projects (Portfolio Mode)</option>';
  projects.forEach(p => {
    const isAct = p.status === "Active" ? " ● Active" : "";
    opts += `<option value="${p.id}">${PP.esc(p.name)}${isAct}</option>`;
  });

  sel.innerHTML = opts;

  // Restore previous selection if still exists, or default to first project
  if (projects.some(p => String(p.id) === String(currentVal))) {
    sel.value = currentVal;
  } else if (projects.length) {
    sel.value = String(projects[0].id);
  }

  updateActiveProjectBadge();
}

function updateActiveProjectBadge() {
  const sel = $("ai-project-select");
  const badge = $("ai-project-badge");
  const input = $("chat-input");
  if (!sel || !badge) return;

  if (sel.value === "all") {
    badge.textContent = `Portfolio View (${(PP.data.projects || []).length} projects)`;
    badge.style.background = "var(--soft)";
    badge.style.color = "var(--primary)";
    if (input) input.placeholder = "Ask about portfolio health, comparative critical paths, or any project...";
  } else {
    const proj = (PP.data.projects || []).find(p => String(p.id) === String(sel.value));
    const pName = proj ? proj.name : `Project #${sel.value}`;
    badge.textContent = `Target: ${pName}`;
    badge.style.background = "#e0e7ff";
    badge.style.color = "#3730a3";
    if (input) input.placeholder = `Ask anything about ${pName} (CPM, delays, risks, team)...`;
  }
}

// Local in-browser expert calculation for resilient offline backup
function localProjectSolution(intent, projectId) {
  const projects = PP.data.projects || [];
  const proj = projectId ? projects.find(p => p.id === projectId) : (projects.find(p => p.status === "Active") || projects[0]);

  if (!proj && intent !== "executive") return "No project found in database. Create a project first.";

  const tasks = (PP.data.tasks || []).filter(t => !proj || Number(t.project || t.project_id) === proj.id);

  if (intent === "cpm") {
    if (!PP.cpm || !proj) return "Critical Path calculations require task dependencies.";
    const cpmRes = PP.cpm.calculate(proj.id);
    const critTasks = cpmRes.criticalPath.map(id => cpmRes.tasks.find(x => x.id === id)).filter(Boolean);
    const chain = critTasks.map((t, i) => `${i + 1}. **${t.name}** (${t.assignee}) · ${t.duration}d · Float: 0d`).join("\n");
    return (
      `### ⚡ Critical Path Solution for '${proj.name}'\n\n` +
      `• **Critical Duration:** **${cpmRes.projectDuration} working days**\n` +
      `• **Zero-Float Bottleneck Count:** **${critTasks.length} sequential activities**\n\n` +
      `**Critical Sequence:**\n${chain}\n\n` +
      `💡 **Recommendation:** Any delay in these zero-float tasks will directly push project delivery date (${cpmRes.projectedEndDate}).`
    );
  }

  if (intent === "pert") {
    if (!PP.cpm || !proj) return "PERT analysis requires task duration estimates.";
    const cpmRes = PP.cpm.calculate(proj.id);
    const { pert } = cpmRes;
    return (
      `### 📊 PERT 3-Point Assessment for '${proj.name}'\n\n` +
      `• **Expected Duration (Te):** **${pert.expectedDuration} days** (±${pert.sigma} days)\n` +
      `• **Variance (σ²):** **${pert.variance} days²**\n` +
      `• **On-Time Probability:** **${pert.probability}%** (Z = ${pert.zScore > 0 ? '+' : ''}${pert.zScore})\n\n` +
      `**Confidence Horizons:**\n` +
      `• 68% Confidence: ${pert.confidenceIntervals.p68[0]} – ${pert.confidenceIntervals.p68[1]} days\n` +
      `• 95% Confidence: ${pert.confidenceIntervals.p95[0]} – ${pert.confidenceIntervals.p95[1]} days`
    );
  }

  if (intent === "delay") {
    const today = PP.day(0);
    const overdue = tasks.filter(t => t.end < today && t.status !== "Done");
    return overdue.length
      ? `### ⏱️ Delay Recovery Plan for '${proj.name}'\n\n` +
        `⚠️ **${overdue.length} Overdue Task(s):**\n` +
        overdue.map(t => `• **${t.name}** (${t.assignee}) due on ${t.end}`).join("\n") +
        `\n\n**Recovery Action:** Freeze non-critical floating tasks and assign peer support to critical tasks.`
      : `### ⏱️ Schedule Health for '${proj.name}'\n\nAll ${tasks.length} tasks are currently on track with zero overdue days!`;
  }

  if (intent === "risk") {
    const risks = (PP.data.risks || []).filter(r => !proj || Number(r.project) === proj.id);
    return risks.length
      ? `### 🛡️ Risk Assessment for '${proj.name}'\n\n` +
        risks.map((r, i) => `${i + 1}. **${r.title}** (Score: ${r.likelihood * r.impact}/25, Owner: ${r.owner || 'Unassigned'})\n   Mitigation: ${r.mitigation || 'Monitor weekly'}`).join("\n")
      : `### 🛡️ Risk Assessment for '${proj.name}'\n\nNo active risks recorded in the register for this project.`;
  }

  if (intent === "workload") {
    const counts = {};
    tasks.forEach(t => { counts[t.assignee] = (counts[t.assignee] || 0) + 1; });
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return `### 👥 Team Workload Distribution for '${proj.name}'\n\n` +
      entries.map(([name, count]) => `• **${name}**: ${count} task(s)`).join("\n");
  }

  // 360 solution
  return `### 📋 360° Diagnostic Solution for '${proj.name}'\n\n` +
    `• **Status:** ${proj.status} (Deadline: ${proj.deadline})\n` +
    `• **Total Tasks:** ${tasks.length} tasks registered\n` +
    `• **Immediate Action:** Keep critical tasks on schedule and conduct daily standup reviews.`;
}

async function askAI(text, forcedIntent = null) {
  const pId = getSelectedProjectId();

  // 1. Try Backend API first
  if (PP.api && PP.api.ai && PP.api.ai.chat) {
    try {
      const res = await PP.api.ai.chat(text, pId);
      if (res && res.reply) {
        return {
          reply: res.reply,
          source: res.source || "expert_engine",
          actions: res.suggested_actions || []
        };
      }
    } catch (err) {
      console.warn("Backend AI call failed, using local engine:", err);
    }
  }

  // 2. Seamless local fallback
  await new Promise(r => setTimeout(r, 350));
  return {
    reply: forcedIntent ? localProjectSolution(forcedIntent, pId) : localProjectSolution("360", pId),
    source: "expert_engine",
    actions: []
  };
}

function addMsg(content, who, source = null) {
  const m = document.createElement("div");
  m.className = "msg " + who;

  if (who === "ai") {
    let badgeHtml = "";
    if (source === "gemini") {
      badgeHtml = '<div style="margin-bottom:6px;"><span class="badge" style="background:#e8f0fe;color:#1a73e8;font-size:0.75rem;padding:3px 8px;border-radius:12px;font-weight:600;">✨ Google Gemini AI</span></div>';
    } else if (source === "expert_engine") {
      badgeHtml = '<div style="margin-bottom:6px;"><span class="badge" style="background:#ede9fe;color:#6d28d9;font-size:0.75rem;padding:3px 8px;border-radius:12px;font-weight:600;">🧠 ProjectPulse AI Database Engine</span></div>';
    }
    m.innerHTML = badgeHtml + '<div class="msg-content">' + formatMarkdown(content) + '</div>';
  } else {
    m.textContent = content;
  }

  $("chat-log").appendChild(m);
  $("chat-log").scrollTop = $("chat-log").scrollHeight;
  return m;
}

async function send(text, forcedIntent = null) {
  text = text.trim();
  if (!text) return;

  const cleanText = text.replace(/^[^\w\s]+\s*/, "");
  addMsg(cleanText, "me");

  const input = $("chat-input");
  if (input) input.value = "";

  const typing = document.createElement("div");
  typing.className = "msg ai";
  typing.innerHTML = '<span class="muted small">Analyzing project database & computing algorithms...</span>';
  $("chat-log").appendChild(typing);
  $("chat-log").scrollTop = $("chat-log").scrollHeight;

  const aiResult = await askAI(cleanText, forcedIntent);
  typing.remove();

  addMsg(aiResult.reply, "ai", aiResult.source);
}

PP.renders["ai-assistant"] = () => {
  updateProjectSelector();

  if (!$("chat-log").children.length) {
    const sel = $("ai-project-select");
    const pName = sel && sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].text : "your projects";

    addMsg(
      "### 👋 Welcome to ProjectPulse AI Project Advisor!\n\n" +
      "Connected directly to your SQLite database. You can:\n" +
      "• **Select any project** from the top dropdown to get dedicated solutions.\n" +
      "• Click any of the **Solution Buttons** (CPM, PERT, Delays, Risk, Workload, 360°) for instant analysis.\n" +
      "• Ask questions about **any project in the database** or general operational management.\n\n" +
      `Currently focused on: **${pName}**.`,
      "ai",
      "expert_engine"
    );
  }
};

document.addEventListener("DOMContentLoaded", () => {
  // Setup project selector
  const sel = $("ai-project-select");
  if (sel) {
    sel.onchange = () => {
      updateActiveProjectBadge();
      const pName = sel.options[sel.selectedIndex].text;
      addMsg(`🎯 Switched active context to: **${pName}**. You can now request solutions or ask questions for this project.`, "ai", "expert_engine");
    };
  }

  // Setup Solution Section buttons
  document.querySelectorAll(".ai-sec-btn").forEach(btn => {
    btn.onclick = () => {
      const intent = btn.dataset.intent;
      const sel = $("ai-project-select");
      const pName = sel ? sel.options[sel.selectedIndex].text : "this project";

      let promptText = "";
      if (intent === "cpm") promptText = `Provide the Critical Path (CPM) breakdown and zero-float bottleneck solution for ${pName}.`;
      else if (intent === "pert") promptText = `Provide the PERT 3-point expected duration and probability analysis for ${pName}.`;
      else if (intent === "delay") promptText = `Provide delay prediction, SPI forecast, and recovery recommendations for ${pName}.`;
      else if (intent === "risk") promptText = `Provide the 5x5 risk matrix and top mitigation strategies for ${pName}.`;
      else if (intent === "workload") promptText = `Analyze team workload distribution and overload points for ${pName}.`;
      else if (intent === "executive") promptText = `Generate a 360° complete project solution and executive diagnosis for ${pName}.`;

      send(promptText, intent);
    };
  });

  // Setup prompt chips
  const chipsContainer = $("chips");
  if (chipsContainer) {
    chipsContainer.innerHTML = DEFAULT_PROMPTS.map(p => `<button type="button" class="chip" style="cursor:pointer;margin:4px 3px;transition:transform 0.1s;">${p}</button>`).join("");
    chipsContainer.onclick = e => {
      const btn = e.target.closest(".chip");
      if (btn) send(btn.textContent);
    };
  }

  // Setup form
  const form = $("chat-form");
  if (form) {
    form.onsubmit = e => {
      e.preventDefault();
      send($("chat-input").value);
    };
  }
});
