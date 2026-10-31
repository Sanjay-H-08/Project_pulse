import os
import re
from datetime import date
from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session

from backend.app.core.config import settings
from backend.app.models.project import Project
from backend.app.models.task import Task
from backend.app.models.dependency import TaskDependency
from backend.app.models.risk import ProjectRisk
from backend.app.schemas.ai import AIChatResponse
from backend.app.services.scheduling_service import get_project_schedule
from backend.app.services.forecast_service import compute_project_forecast


def has_words(text: str, keywords: List[str]) -> bool:
    """Helper to match keywords ensuring short words match as full words."""
    for kw in keywords:
        pattern = r"\b" + re.escape(kw) + r"\b" if len(kw) <= 4 else re.escape(kw)
        if re.search(pattern, text, re.IGNORECASE):
            return True
    return False


def build_project_context(db: Session, project: Optional[Project]) -> Dict[str, Any]:
    """Extracts live project data and algorithmic schedule calculations for a single project."""
    if not project:
        return {}

    tasks = db.query(Task).filter(Task.project_id == project.id).all()
    deps = db.query(TaskDependency).filter(TaskDependency.project_id == project.id).all()
    risks = db.query(ProjectRisk).filter(ProjectRisk.project_id == project.id).all()

    # CPM schedule
    sched = None
    try:
        sched = get_project_schedule(db, project.id)
    except Exception:
        pass

    # Forecast
    forecast = None
    try:
        forecast = compute_project_forecast(db, project.id)
    except Exception:
        pass

    # Team workload
    workload: Dict[str, int] = {}
    for t in tasks:
        assignee = t.assignee or "Unassigned"
        workload[assignee] = workload.get(assignee, 0) + 1

    return {
        "is_portfolio": False,
        "project": project,
        "tasks": tasks,
        "deps": deps,
        "risks": risks,
        "schedule": sched,
        "forecast": forecast,
        "workload": workload
    }


def build_all_projects_context(db: Session) -> Dict[str, Any]:
    """Extracts multi-project portfolio data across all projects in the site."""
    projects = db.query(Project).all()
    all_tasks = db.query(Task).all()
    all_risks = db.query(ProjectRisk).all()

    summaries = []
    global_workload: Dict[str, int] = {}

    for p in projects:
        p_tasks = [t for t in all_tasks if t.project_id == p.id]
        p_risks = [r for r in all_risks if r.project_id == p.id]

        sched = None
        try:
            sched = get_project_schedule(db, p.id)
        except Exception:
            pass

        completed = len([t for t in p_tasks if t.status == "Done"])
        avg_prog = round(sum(t.progress for t in p_tasks) / len(p_tasks)) if p_tasks else 0
        crit_count = len([t for t in sched.tasks if t.is_critical]) if sched else 0
        dur = sched.total_duration if sched else 0

        for t in p_tasks:
            assignee = t.assignee or "Unassigned"
            global_workload[assignee] = global_workload.get(assignee, 0) + 1

        summaries.append({
            "id": p.id,
            "name": p.name,
            "status": p.status,
            "deadline": str(p.deadline or "N/A"),
            "task_count": len(p_tasks),
            "completed_count": completed,
            "avg_progress": avg_prog,
            "critical_tasks_count": crit_count,
            "critical_duration": dur,
            "risk_count": len(p_risks)
        })

    return {
        "is_portfolio": True,
        "projects": projects,
        "summaries": summaries,
        "all_tasks": all_tasks,
        "all_risks": all_risks,
        "workload": global_workload
    }


def format_context_for_prompt(ctx: Dict[str, Any]) -> str:
    if not ctx:
        return "No project data available."

    if ctx.get("is_portfolio"):
        summaries = ctx.get("summaries", [])
        lines = [f"=== MULTI-PROJECT PORTFOLIO CONTEXT (Total: {len(summaries)} projects) ==="]
        for s in summaries:
            lines.append(f"• Project #{s['id']} '{s['name']}': Status: {s['status']}, Progress: {s['avg_progress']}%, Deadline: {s['deadline']}, Tasks: {s['task_count']} ({s['critical_tasks_count']} critical, {s['critical_duration']}d duration)")
        return "\n".join(lines)

    p: Project = ctx["project"]
    tasks: List[Task] = ctx.get("tasks", [])
    risks: List[ProjectRisk] = ctx.get("risks", [])
    sched = ctx.get("schedule")
    workload: Dict[str, int] = ctx.get("workload", {})

    lines = [
        f"Project: '{p.name}' (ID: {p.id})",
        f"Status: {p.status}, Start: {p.start_date}, Deadline: {p.deadline}, Team Size: {p.team_size}",
        f"Total Tasks: {len(tasks)}"
    ]

    if sched:
        lines.append(f"Critical Path Duration: {sched.total_duration} days")
        crit_names = [t.task_name for t in sched.tasks if t.is_critical]
        lines.append(f"Critical Path Activities: {', '.join(crit_names) if crit_names else 'None'}")

    completed = [t.name for t in tasks if t.status == "Done"]
    in_prog = [t.name for t in tasks if t.status == "In Progress"]
    todo = [t.name for t in tasks if t.status == "To Do"]
    lines.append(f"Completed ({len(completed)}): {', '.join(completed)}")
    lines.append(f"In Progress ({len(in_prog)}): {', '.join(in_prog)}")
    lines.append(f"To Do ({len(todo)}): {', '.join(todo)}")

    today = date.today()
    overdue = [t for t in tasks if t.end_date and t.end_date < today and t.status != "Done"]
    if overdue:
        lines.append(f"Overdue Tasks: {', '.join([f'{t.name} (due {t.end_date}, owner {t.assignee})' for t in overdue])}")

    lines.append(f"Workload by Assignee: {', '.join([f'{k}: {v} tasks' for k, v in workload.items()])}")
    return "\n".join(lines)


def call_gemini_api(api_key: str, message: str, context_str: str) -> Optional[str]:
    """Attempts to call Google Gemini API."""
    try:
        from google import genai
        client = genai.Client(api_key=api_key)
        system_instruction = (
            "You are ProjectPulse AI, an elite operational research, industrial engineering, and project management advisor.\n"
            "You have deep expertise in Critical Path Method (CPM), PERT 3-point estimation, Earned Schedule/SPI, "
            "Risk Management (5x5 matrix, Monte Carlo simulation), Agile/Scrum, and enterprise project governance.\n"
            "You provide high-impact, practical, and mathematically sound solutions for the user's SELECTED project "
            "(using the live database context provided) as well as ANY general project (software, engineering, "
            "construction, business, research, operations).\n"
            "Always structure your response with clean Markdown: use bolding, bullet points, numbered steps, "
            "and mathematical formulas where applicable. Be direct, authoritative, and helpful."
        )
        prompt = f"### System & Live Database Context:\n{context_str}\n\n### User Question:\n{message}"

        for model_name in ["gemini-2.5-flash", "gemini-1.5-flash"]:
            try:
                response = client.models.generate_content(
                    model=model_name,
                    contents=prompt,
                    config={"system_instruction": system_instruction}
                )
                if response and response.text:
                    return response.text.strip()
            except Exception:
                continue
    except Exception:
        pass
    return None


def expert_intelligence_engine(message: str, ctx: Dict[str, Any]) -> str:
    """
    Built-in ProjectPulse Cognitive Engine:
    Delivers expert-level solutions for the SELECTED project, ALL site projects, or ANY general project.
    """
    q = message.lower().strip()
    is_portfolio = ctx.get("is_portfolio", False)

    # ========================================================
    # CASE 1: PORTFOLIO MODE (ALL PROJECTS IN THE SITE)
    # ========================================================
    if is_portfolio:
        summaries = ctx.get("summaries", [])
        all_tasks = ctx.get("all_tasks", [])
        all_risks = ctx.get("all_risks", [])
        workload = ctx.get("workload", {})
        today = date.today()
        all_overdue = [t for t in all_tasks if t.end_date and t.end_date < today and t.status != "Done"]

        # 360 or Summary for All Projects
        if has_words(q, ["360", "executive", "summary", "overview", "portfolio", "all project", "all projects"]):
            proj_rows = "\n".join([f"| **{s['name']}** | {s['status']} | {s['avg_progress']}% | {s['critical_duration']}d | {s['task_count']} ({s['critical_tasks_count']} crit) | {s['deadline']} |" for s in summaries])
            return (
                f"### 🌐 Executive Portfolio 360° Report (All {len(summaries)} Projects in Database)\n\n"
                f"**Portfolio Health Overview:**\n"
                f"• **Total Projects in Database:** **{len(summaries)}** ({len([s for s in summaries if s['status'] == 'Active'])} Active, {len([s for s in summaries if s['status'] == 'Completed'])} Completed)\n"
                f"• **Total Tasks Across Site:** **{len(all_tasks)}** (Overdue: **{len(all_overdue)}**)\n"
                f"• **Recorded Risks Across Site:** **{len(all_risks)}**\n\n"
                f"| Project Name | Status | Progress | Critical Duration | Tasks | Deadline |\n"
                f"|---|---|---|---|---|---|\n"
                f"{proj_rows}\n\n"
                f"💡 **Strategic Portfolio Directive:**\n"
                f"1. **Primary Priority:** Focus on active projects with pending critical activities.\n"
                f"2. **Cross-Project Allocation:** Monitor engineers shared across multiple active projects to prevent bottleneck delays.\n"
                f"3. Select any individual project from the top dropdown to view its dedicated CPM, PERT, and risk solution!"
            )

        if has_words(q, ["critical path", "cpm", "bottleneck"]):
            lines = [f"• **{s['name']}**: Critical Path Length = **{s['critical_duration']} days** across **{s['critical_tasks_count']}** critical activities." for s in summaries]
            return (
                f"### ⚡ Critical Path Portfolio Summary (All Projects)\n\n"
                + "\n".join(lines) +
                "\n\n👉 *Select a specific project from the dropdown above to view its full task-by-task zero-float sequence!*"
            )

        if has_words(q, ["delay", "spi", "late", "overdue"]):
            if all_overdue:
                od_lines = "\n".join([f"• **{t.name}** (Project ID: {t.project_id}, Assigned: {t.assignee or 'Unassigned'}, Due: {t.end_date})" for t in all_overdue])
                return (
                    f"### ⏱️ Portfolio Slippage Alert ({len(all_overdue)} Overdue Tasks Found Across Site)\n\n"
                    f"{od_lines}\n\n"
                    f"**Action:** Prioritize these tasks immediately to avoid cascading project slips."
                )
            return "### ⏱️ Portfolio Delay Status\n\nAll tasks across all registered site projects are currently on track!"

    # ========================================================
    # CASE 2: SINGLE SPECIFIC PROJECT (FROM DATABASE)
    # ========================================================
    proj: Optional[Project] = ctx.get("project")
    tasks: List[Task] = ctx.get("tasks", [])
    sched = ctx.get("schedule")
    risks: List[ProjectRisk] = ctx.get("risks", [])
    workload: Dict[str, int] = ctx.get("workload", {})
    today = date.today()

    # 360° Comprehensive Project Solution
    if has_words(q, ["360", "executive", "complete solution", "full diagnosis", "solution for"]):
        crit_tasks = [t for t in sched.tasks if t.is_critical] if sched else []
        overdue_tasks = [t for t in tasks if t.end_date and t.end_date < today and t.status != "Done"]
        completed = [t for t in tasks if t.status == "Done"]
        avg_progress = round(sum(t.progress for t in tasks) / len(tasks)) if tasks else 0

        # Critical path string
        cp_str = " ➔ ".join([t.task_name for t in crit_tasks]) if crit_tasks else "None computed"

        return (
            f"### 📋 360° Complete Solution & Diagnostic Report for '{proj.name}'\n\n"
            f"#### 1. Executive Status & Progress\n"
            f"• **Project Status:** **{proj.status}** (Start: `{proj.start_date}` | Deadline: `{proj.deadline}`)\n"
            f"• **Overall Completion:** **{avg_progress}%** ({len(completed)}/{len(tasks)} tasks finished)\n"
            f"• **Team Size:** {proj.team_size} members assigned\n\n"
            f"#### 2. Critical Path Method (CPM) Diagnosis\n"
            f"• **Total Critical Duration:** **{sched.total_duration if sched else 0} working days**\n"
            f"• **Zero-Float Bottleneck Sequence:**\n"
            f"  `{cp_str}`\n"
            f"• **Recommendation:** Guard these tasks from any delay. Total Float = 0 days.\n\n"
            f"#### 3. Schedule Slippage & Delays\n"
            f"• **Overdue Tasks:** {len(overdue_tasks)} task(s) currently behind deadline.\n"
            f"• **Schedule Health:** {'⚠️ Action Required (Overdue items present)' if overdue_tasks else '✅ Healthy & On Schedule'}\n\n"
            f"#### 4. Immediate 48-Hour Action Plan\n"
            f"1. **Standup Priority:** Focus team review on the first active critical task (**{crit_tasks[0].task_name if crit_tasks else 'N/A'}**).\n"
            f"2. **Resource Protection:** Reassign non-critical floating tasks away from the primary developer.\n"
            f"3. **Milestone Buffer:** Ensure a 15% time reserve is maintained before the final delivery date (`{proj.deadline}`)."
        )

    # Critical Path / CPM
    if has_words(q, ["critical path", "cpm", "bottleneck", "zero float", "slack"]):
        if not proj or not sched:
            return f"### ⚡ Critical Path Analysis\n\nNo task dependencies found for '{proj.name if proj else 'this project'}'. Add task dependencies in the Gantt or Tasks page to calculate the Critical Path."

        crit_tasks = [t for t in sched.tasks if t.is_critical]
        chain = "\n".join([f"{i+1}. **{t.task_name}** · Duration: {t.duration}d · Float: 0d (Early: Day {t.early_start} ➔ {t.early_finish})" for i, t in enumerate(crit_tasks)])
        non_crit = [t for t in sched.tasks if not t.is_critical and getattr(t, 'slack', 0) > 0]
        slack_summary = ", ".join([f"{t.task_name} ({getattr(t, 'slack', 0)}d slack)" for t in non_crit[:4]]) or "None (all tasks critical)"

        return (
            f"### ⚡ Critical Path Solution for '{proj.name}'\n\n"
            f"• **Total Critical Duration:** **{sched.total_duration} working days**\n"
            f"• **Total Critical Activities:** **{len(crit_tasks)} tasks with 0 days float**\n\n"
            f"**Critical Activity Sequence (Zero Float Bottlenecks):**\n"
            f"{chain}\n\n"
            f"**Activities with Float / Buffer Slack:**\n"
            f"{slack_summary}\n\n"
            f"💡 **Actionable Recommendation:**\n"
            f"Focus daily reviews on **{crit_tasks[0].task_name if crit_tasks else 'active tasks'}**. "
            f"Any delay in these activities directly pushes the final project delivery date."
        )

    # PERT & Probability / Uncertainty
    if has_words(q, ["pert", "probab", "uncertain", "optimistic", "pessimistic", "z-score", "confidence"]):
        if proj and tasks:
            pert_tasks = [t for t in tasks if t.optimistic_duration and t.pessimistic_duration]
            if pert_tasks:
                te_sum = sum((t.optimistic_duration + 4 * (t.most_likely_duration or t.duration) + t.pessimistic_duration) / 6 for t in pert_tasks)
                var_sum = sum(((t.pessimistic_duration - t.optimistic_duration) / 6) ** 2 for t in pert_tasks)
                sigma = (var_sum ** 0.5)
                return (
                    f"### 📊 PERT 3-Point Probabilistic Assessment for '{proj.name}'\n\n"
                    f"**Statistical Parameters:**\n"
                    f"• **Expected Duration ($T_e$):** **{te_sum:.1f} days**\n"
                    f"• **Schedule Uncertainty Standard Deviation ($\\sigma$):** **±{sigma:.2f} days**\n"
                    f"• **Critical Variance ($\\sigma^2$):** **{var_sum:.2f} days²**\n\n"
                    f"**Normal Gaussian Confidence Ranges (Central Limit Theorem):**\n"
                    f"• **68.2% Confidence (±1σ):** {max(1, te_sum - sigma):.1f} to {te_sum + sigma:.1f} days\n"
                    f"• **95.4% Confidence (±2σ):** {max(1, te_sum - 2*sigma):.1f} to {te_sum + 2*sigma:.1f} days\n"
                    f"• **99.7% Confidence (±3σ):** {max(1, te_sum - 3*sigma):.1f} to {te_sum + 3*sigma:.1f} days\n\n"
                    "📌 **Jury Defense Script:**\n"
                    "*\"We use PERT beta-distribution weighting (Te = (O + 4M + P) / 6) to convert subjective 3-point estimates into an objective probability distribution, allowing the team to commit to realistic delivery commitments.\"*"
                )

        return (
            f"### 📊 PERT Assessment for '{proj.name if proj else 'Project'}'\n\n"
            f"**Expected Duration Formula:** Te = (O + 4M + P) ÷ 6\n"
            f"**Standard Deviation Formula:** σ = (P - O) ÷ 6\n\n"
            f"To view project-specific probability distribution, input Optimistic (O) and Pessimistic (P) durations in the Tasks or CPM & PERT view."
        )

    # Delays, Slippage, Forecast & SPI
    if has_words(q, ["delay", "predict", "spi", "behind schedule", "slip", "late", "overdue"]):
        overdue_tasks = [t for t in tasks if t.end_date and t.end_date < today and t.status != "Done"]
        in_progress = [t for t in tasks if t.status == "In Progress"]

        if overdue_tasks:
            overdue_list = "\n".join([f"• **{t.name}** (Assigned: {t.assignee or 'Unassigned'}, Due: {t.end_date}, Progress: {t.progress}%)" for t in overdue_tasks])
            return (
                f"### ⏱️ Delay & Slippage Alert for '{proj.name}'\n\n"
                f"⚠️ **{len(overdue_tasks)} Overdue Task(s) Detected:**\n"
                f"{overdue_list}\n\n"
                f"**Immediate 3-Step Recovery Action Plan:**\n"
                f"1. **Triage:** Freeze non-critical feature work and assign secondary peer support to the overdue owners.\n"
                f"2. **Float Absorption Check:** If an overdue task has Total Float ($TF > 0$), calculate remaining buffer before it triggers downstream delays.\n"
                f"3. **Scope Descoping / Crashing:** Split large remaining work items into MVP subtasks and reassign backlog items to the next sprint."
            )
        else:
            return (
                f"### ⏱️ Schedule Health & Delay Forecast for '{proj.name}'\n\n"
                f"• **Status:** On Track (Zero overdue tasks currently recorded)\n"
                f"• **Active Tasks In Progress:** {len(in_progress)}\n\n"
                "**Formula for Delay Prediction:**\n"
                "• **Earned Schedule (ES):** Planned Duration × Progress (%) ÷ 100\n"
                "• **Schedule Performance Index (SPI):** Earned Progress ÷ Planned Progress\n"
                "• **SPI > 1.0**: Ahead of schedule | **SPI = 1.0**: On schedule | **SPI < 1.0**: Slipping."
            )

    # Risks & Threat Matrix (Current Project)
    if has_words(q, ["risk", "hazard", "threat", "matrix", "mitigat", "fmea"]):
        if risks:
            top_risks = sorted(risks, key=lambda r: r.severity_score or (r.likelihood * r.impact), reverse=True)[:3]
            r_list = "\n".join([f"{i+1}. **{r.title}** (Severity: {r.severity_score}/25, Owner: {r.owner or 'Unassigned'})\n   • *Mitigation:* {r.mitigation_strategy or 'Review weekly'}" for i, r in enumerate(top_risks)])
            return (
                f"### 🛡️ Risk Assessment & Mitigation for '{proj.name}'\n\n"
                f"**Top High-Priority Risks in Register:**\n"
                f"{r_list}\n\n"
                f"**5x5 Risk Matrix Classification:**\n"
                f"• **Critical (16 - 25):** Immediate executive mitigation required; weekly checkpoint.\n"
                f"• **Medium (6 - 15):** Assigned owner with active contingency plan.\n"
                f"• **Low (1 - 5):** Accept and monitor."
            )
        else:
            return f"### 🛡️ Risk Assessment for '{proj.name}'\n\nNo active risks logged in the risk register for this project yet. Use the **Risk Analysis** page to log technical, schedule, or resource risks."

    # Team Workload & Capacity Rebalancing
    if has_words(q, ["workload", "team", "who has", "overload", "resource", "assignee", "capacity"]):
        if workload:
            sorted_wl = sorted(workload.items(), key=lambda x: x[1], reverse=True)
            top_person, top_count = sorted_wl[0]
            wl_str = "\n".join([f"• **{name}**: {cnt} assigned task(s)" for name, cnt in sorted_wl])

            return (
                f"### 👥 Team Workload Distribution for '{proj.name}'\n\n"
                f"{wl_str}\n\n"
                f"**Resource Balancing Insight:**\n"
                f"• **Highest Allocation:** **{top_person}** ({top_count} tasks).\n"
                f"• **Recommendation:** If {top_person} is on the **Critical Path**, reassign floating tasks to teammates with lighter workload."
            )

    # Planning a new project from scratch
    if has_words(q, ["plan", "build", "create a project", "start a project", "steps to build", "new project"]):
        match = re.search(r"(?:plan|build|create|for|a)\s+([a-zA-Z0-9\s\-]{3,30})(?:\?|$)", message, re.IGNORECASE)
        topic = match.group(1).strip() if match else "New Strategic Project"

        return (
            f"### 📋 Strategic Execution Plan: {topic.title()}\n\n"
            f"Here is a complete, industry-standard 5-Phase Project Architecture with CPM/PERT planning:\n\n"
            f"#### Phase 1: Initiation & Requirements (Days 1–5)\n"
            f"• Define project charter, success criteria, and non-negotiable constraints (budget, fixed deadline).\n"
            f"• Create Stakeholder RACI Matrix (Responsible, Accountable, Consulted, Informed).\n\n"
            f"#### Phase 2: Design & Work Breakdown Structure (Days 6–12)\n"
            f"• Decompose the project into atomic work packages (1 to 5 days each).\n"
            f"• Map explicit dependencies: Identify prerequisites (Finish-to-Start).\n"
            f"• Run Initial CPM: Pinpoint the baseline Critical Path sequence.\n\n"
            f"#### Phase 3: Core Implementation & Milestones (Days 13–35)\n"
            f"• Execute in 2-week iterative development sprints.\n"
            f"• Track Schedule Performance Index (SPI) twice weekly.\n\n"
            f"#### Phase 4: Integration, QA & Security Testing (Days 36–44)\n"
            f"• End-to-end regression, performance stress testing, and vulnerability audit.\n\n"
            f"#### Phase 5: Deployment, Launch & Handover (Days 45–50)\n"
            f"• Staged canary deployment or blue-green rollout."
        )

    # Universal Comprehensive Solution Fallback
    return (
        f"### 💡 Solution & Strategic Recommendations for: '{message.title()}'\n\n"
        f"**Context:** Project '{proj.name if proj else 'ProjectPulse'}'\n\n"
        "#### 1. Immediate Diagnosis (Next 24 Hours)\n"
        "• Audit all tasks currently in progress and identify dependencies that block downstream deliverables.\n"
        "• Determine if this question affects the **Critical Path** (zero float) or non-critical buffer tasks.\n\n"
        "#### 2. Algorithmic Optimization (CPM & Resource Allocation)\n"
        "• Apply **Critical Path Method (CPM)** to isolate zero-float bottlenecks from tasks that have buffer.\n"
        "• Rebalance team workload: ensure primary engineers are focused on critical tasks while secondary members absorb support duties.\n"
        "• Use PERT beta-estimates (Te = (O + 4M + P) / 6) to factor in technical uncertainty.\n\n"
        "#### 3. Risk Mitigation & Contingency\n"
        "• Log potential schedule or architectural risks into the 5x5 Risk Register.\n"
        "• Establish a 15–20% time buffer on high-uncertainty milestones."
    )


def ask_ai_assistant(db: Session, message: str, project_id: Optional[int] = None) -> AIChatResponse:
    """
    Main entry point for AI Assistant.
    Connects directly to SQLite database for the selected project or all projects.
    """
    # If project_id is 0 or None, check if user specifically asked for "all" or if a project was selected
    is_all = (project_id == 0 or project_id is None) and any(w in message.lower() for w in ["all", "portfolio", "every", "compare"])

    if is_all:
        ctx = build_all_projects_context(db)
        project_obj = None
    else:
        project_obj = None
        if project_id and project_id > 0:
            project_obj = db.query(Project).filter(Project.id == project_id).first()
        if not project_obj:
            project_obj = db.query(Project).filter(Project.status == "Active").first()
        if not project_obj:
            project_obj = db.query(Project).first()

        ctx = build_project_context(db, project_obj) if project_obj else build_all_projects_context(db)

    context_str = format_context_for_prompt(ctx)

    gemini_key = settings.GEMINI_API_KEY or os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")

    if gemini_key:
        gemini_reply = call_gemini_api(gemini_key, message, context_str)
        if gemini_reply:
            return AIChatResponse(
                reply=gemini_reply,
                source="gemini",
                project_id=project_obj.id if project_obj else None,
                project_name=project_obj.name if project_obj else "All Projects",
                suggested_actions=[
                    "Calculate Critical Path (CPM)",
                    "Run PERT uncertainty estimate",
                    "Check team workload & rebalance",
                    "Predict milestone delays (SPI)"
                ]
            )

    expert_reply = expert_intelligence_engine(message, ctx)
    return AIChatResponse(
        reply=expert_reply,
        source="expert_engine",
        project_id=project_obj.id if project_obj else None,
        project_name=project_obj.name if project_obj else "All Projects",
        suggested_actions=[
            "Identify Critical Path (CPM)",
            "Predict project delays & SPI",
            "Show project risks & 5x5 matrix",
            "How to crash a project schedule?",
            "360 Complete Solution"
        ]
    )
