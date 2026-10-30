// ai-assistant.js: chat UI with intelligent project answers including CPM & PERT.
// To connect Gemini later: replace askAI() with a fetch() to YOUR backend
// (for example POST http://localhost:3000/api/chat). The backend holds the API key.
const prompts = [
  "Identify Critical Path (CPM)",
  "PERT duration & probability",
  "Predict project delays & bottlenecks",
  "Show project risk register & health",
  "Run what-if delay scenario",
  "Which tasks have slack / float?",
  "Summarize my project status",
  "Which tasks are overdue?",
  "Who has the most work?"
];

function askAI(text) {
  return new Promise(resolve => setTimeout(() => {
    const t = text.toLowerCase(), tasks = PP.data.tasks, today = PP.day(0);
    const open = tasks.filter(x => x.status !== "Done");
    const activeProject = PP.data.projects.find(p => p.status === "Active") || PP.data.projects[0];

    // CPM / Critical Path query
    if (t.includes("critical") || t.includes("cpm") || t.includes("path")) {
      if (!activeProject || !PP.cpm) return resolve("No active projects found to calculate the critical path.");
      const cpmRes = PP.cpm.calculate(activeProject.id);
      if (cpmRes.hasCycle) return resolve(`⚠ Project '${activeProject.name}' contains cyclic dependencies. Please resolve predecessor loops.`);
      if (!cpmRes.criticalPath.length) return resolve(`Project '${activeProject.name}' has no critical path yet. Add task dependencies to evaluate.`);

      const critTasks = cpmRes.criticalPath.map(id => cpmRes.tasks.find(x => x.id === id)).filter(Boolean);
      const chainStr = critTasks.map((ct, idx) => `${idx + 1}. ${ct.name} (${ct.assignee}) · ${ct.duration} days`).join("\n");
      return resolve(
        `⚡ Critical Path Analysis for "${activeProject.name}":\n\n` +
        `The critical path length is ${cpmRes.projectDuration} days across ${critTasks.length} sequential activities:\n` +
        chainStr +
        `\n\n📌 Key Rule: These activities have ZERO total float (slack = 0). Any delay in any of them will directly delay the project delivery date (${cpmRes.projectedEndDate}).`
      );
    }

    // PERT / Probability query
    if (t.includes("pert") || t.includes("probab") || t.includes("uncertain") || t.includes("confidence")) {
      if (!activeProject || !PP.cpm) return resolve("No active projects found for PERT evaluation.");
      const cpmRes = PP.cpm.calculate(activeProject.id);
      const { pert } = cpmRes;
      const ci = pert.confidenceIntervals;
      return resolve(
        `📊 PERT 3-Point Statistical Assessment for "${activeProject.name}":\n\n` +
        `• Expected Duration (Te): ${pert.expectedDuration} days (±${pert.sigma} days)\n` +
        `• Critical Path Variance (σ²): ${pert.variance}\n` +
        `• Target Project Limit: ${pert.targetDays} days (${pert.targetDate})\n` +
        `• On-Time Completion Probability: ${pert.probability}% (Z = ${pert.zScore > 0 ? "+" : ""}${pert.zScore})\n\n` +
        `Normal Distribution Confidence Ranges:\n` +
        `• 68% Confidence: ${ci.p68[0]} – ${ci.p68[1]} days\n` +
        `• 95% Confidence: ${ci.p95[0]} – ${ci.p95[1]} days\n` +
        `• 99% Confidence: ${ci.p99[0]} – ${ci.p99[1]} days`
      );
    }

    // Slack / Float query
    if (t.includes("slack") || t.includes("float") || t.includes("buffer")) {
      if (!activeProject || !PP.cpm) return resolve("No active projects found.");
      const cpmRes = PP.cpm.calculate(activeProject.id);
      const nonCrit = cpmRes.tasks.filter(x => !x.isCritical && x.totalFloat > 0);
      if (!nonCrit.length) return resolve(`In "${activeProject.name}", all activities are on the critical path or have zero float.`);
      const listStr = nonCrit.map(x => `• ${x.name}: ${x.totalFloat} days of slack (Assigned to ${x.assignee})`).join("\n");
      return resolve(
        `🕒 Activities with Float / Slack in "${activeProject.name}":\n\n` +
        listStr +
        `\n\nThese activities can be safely delayed or paused by their slack duration without affecting the final project completion date.`
      );
    }

    // Delay Prediction query
    if (t.includes("delay") || t.includes("predict") || t.includes("bottleneck") || t.includes("spi")) {
      if (!activeProject || !PP.delayEngine) return resolve("No active projects found for delay prediction.");
      const dRes = PP.delayEngine.evaluateProject(activeProject.id);
      if (!dRes) return resolve("Unable to run delay prediction.");

      const slipStr = dRes.maxMilestoneSlip > 0 ? `+${dRes.maxMilestoneSlip} days slip` : "On Track (0 days slip)";
      const bottleneckStr = dRes.primaryBottleneck
        ? `• Primary Bottleneck: "${dRes.primaryBottleneck.name}" (Assigned to ${dRes.primaryBottleneck.assignee}, SPI: ${dRes.primaryBottleneck.spi})`
        : "• No major critical-path bottleneck currently identified.";

      const slippingTasks = dRes.tasks.filter(x => x.delayDays > 0);
      const taskListStr = slippingTasks.length
        ? slippingTasks.map(x => `  - ${x.name}: +${x.delayDays}d (${x.isCritical ? '⚡ Critical Path' : 'Float: ' + x.totalFloat + 'd'})`).join("\n")
        : "  - All project tasks are currently on track.";

      return resolve(
        `⏱️ Delay Prediction & SPI Forecast for "${activeProject.name}":\n\n` +
        `• Schedule Health: ${dRes.riskLabel}\n` +
        `• Projected Milestone Slippage: ${slipStr}\n` +
        `• Schedule Performance Index (SPI): ${dRes.projectSPI.toFixed(2)}\n` +
        `• Projected Completion Date: ${dRes.projectedDeadline}\n` +
        `• On-Time Confidence: ${dRes.onTimeProb}%\n\n` +
        `${bottleneckStr}\n\n` +
        `Tasks with Slipped Durations:\n${taskListStr}\n\n` +
        `💡 Recommendation: Open the Delay Prediction page or What-If Simulator to evaluate crashing the critical bottleneck.`
      );
    }

    // Risk Analysis query
    if (t.includes("risk") || t.includes("hazard") || t.includes("matrix") || t.includes("threat")) {
      const risks = (PP.data.risks || []).filter(r => !activeProject || Number(r.project) === activeProject.id);
      const health = PP.riskEngine ? PP.riskEngine.calculateHealthIndex(activeProject ? activeProject.id : "all") : { score: 85, label: "Healthy" };
      const open = risks.filter(r => r.status !== "Closed");
      const crit = open.filter(r => (Number(r.likelihood) * Number(r.impact)) >= 16);

      const topRisks = open.sort((a, b) => (b.likelihood * b.impact) - (a.likelihood * a.impact)).slice(0, 4);
      const topStr = topRisks.length
        ? topRisks.map((r, i) => `${i + 1}. ${r.title} (Score: ${r.likelihood * r.impact}/25, Owner: ${r.owner || "Unassigned"})\n   Mitigation: ${r.mitigation || "None"}`).join("\n")
        : "No open risks recorded in the register.";

      return resolve(
        `🛡️ Risk Analysis & Health Index for "${activeProject ? activeProject.name : 'All Projects'}":\n\n` +
        `• Project Health Score: ${health.score}/100 (${health.label})\n` +
        `• Total Open Risks: ${open.length} (${crit.length} Critical Severity)\n\n` +
        `Top Ranked Risks in Register:\n` +
        topStr +
        `\n\n💡 Tip: Check the 5x5 Heatmap Matrix in the Risk Analysis tab for systemic warnings and full mitigation plans.`
      );
    }

    // What-If Simulator query
    if (t.includes("what if") || t.includes("what-if") || t.includes("simulat") || t.includes("scenario") || t.includes("monte carlo")) {
      if (!activeProject || !PP.whatIfEngine) return resolve("What-If simulator is available in the sidebar.");
      const scenario = PP.whatIfEngine.evaluateScenario();

      return resolve(
        `🧪 What-If Scenario Simulator for "${activeProject.name}":\n\n` +
        `• Baseline Critical Path Duration: ${scenario.baseDuration} days\n` +
        `• Baseline Completion Date: ${scenario.baseDeadline}\n` +
        `• Currently Simulated Duration: ${scenario.simDuration} days (Delta: ${scenario.durationDelta >= 0 ? '+' : ''}${scenario.durationDelta} days)\n` +
        `• Critical Path Shift: ${scenario.newlyCritical.length ? 'Shifted! New bottleneck: ' + scenario.newlyCritical.join(', ') : 'Stable'}\n\n` +
        `Monte Carlo Analysis Capability:\n` +
        `• The simulator executes 1,000 to 5,000 probabilistic iterations sampling from task Beta/Triangular (O, M, P) distributions to compute P50, P75, P90 confidence horizons.\n\n` +
        `👉 Navigate to "What-If Simulator" in the left sidebar to drag duration sliders, crash activities, or run Monte Carlo runs!`
      );
    }

    if (t.includes("overdue") || t.includes("late")) {
      const late = open.filter(x => x.end < today);
      return resolve(late.length ? "Overdue tasks:\n" + late.map(x => "• " + x.name + " (" + x.assignee + ")").join("\n") : "Nothing is overdue. Great job!");
    }
    if (t.includes("status") || t.includes("summar")) {
      const avg = tasks.length ? Math.round(tasks.reduce((a, x) => a + x.progress, 0) / tasks.length) : 0;
      return resolve("You have " + PP.data.projects.length + " projects, " + open.length + " open tasks and overall progress is " + avg + "%.");
    }
    if (t.includes("work") || t.includes("workload") || t.includes("who")) {
      const c = {}; open.forEach(x => c[x.assignee] = (c[x.assignee] || 0) + 1);
      const top = Object.entries(c).sort((a, b) => b[1] - a[1])[0];
      return resolve(top ? top[0] + " has the most open tasks (" + top[1] + "). Consider rebalancing." : "No open tasks right now.");
    }
    if (t.includes("plan") || t.includes("suggest")) return resolve("Suggested phases:\n1. Research and planning (15%)\n2. Design (20%)\n3. Development (35%)\n4. Testing (20%)\n5. Launch (10%)\nUse New Project > Generate Project Plan to create it.");
    resolve("I can answer project questions, identify your Critical Path (CPM), calculate PERT 3-point durations and on-time probabilities, and check task slack/float buffers.");
  }, 500));
}

function addMsg(text, who) {
  const m = document.createElement("div");
  m.className = "msg " + who; m.textContent = text;
  $("chat-log").appendChild(m); $("chat-log").scrollTop = $("chat-log").scrollHeight;
  return m;
}

async function send(text) {
  text = text.trim(); if (!text) return;
  addMsg(text, "me"); $("chat-input").value = "";
  const typing = addMsg("Thinking...", "ai");
  typing.textContent = await askAI(text);
}

PP.renders["ai-assistant"] = () => {
  if (!$("chat-log").children.length) addMsg("Hi! I'm your ProjectPulse assistant. Ask me about your projects, tasks or workload.", "ai");
};

document.addEventListener("DOMContentLoaded", () => {
  $("chips").innerHTML = prompts.map(p => `<button type="button" class="chip">${p}</button>`).join("");
  $("chips").onclick = e => e.target.classList.contains("chip") && send(e.target.textContent);
  $("chat-form").onsubmit = e => { e.preventDefault(); send($("chat-input").value); };
});
