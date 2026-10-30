// ai-assistant.js: chat UI with mock replies.
// To connect Gemini later: replace askAI() with a fetch() to YOUR backend
// (for example POST http://localhost:3000/api/chat). The backend holds the API key.
const prompts = ["Summarize my project status", "Which tasks are overdue?", "Suggest a plan for a new project", "Who has the most work?"];

function askAI(text) {
  return new Promise(resolve => setTimeout(() => {
    const t = text.toLowerCase(), tasks = PP.data.tasks, today = PP.day(0);
    const open = tasks.filter(x => x.status !== "Done");
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
    resolve("This is a demo reply. Once connected to Gemini through the backend, I'll answer questions like this with real AI.");
  }, 600));
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
