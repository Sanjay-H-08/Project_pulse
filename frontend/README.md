# ProjectPulse — Advanced Project Management Platform
### Critical Path Method (CPM), PERT, Risk Analysis, Delay Prediction & What-If Monte Carlo Simulator

ProjectPulse is an enterprise-grade, responsive project management web application built with vanilla HTML5, CSS3, and modern ES6+ JavaScript. It features zero build-step overhead, runs completely offline, and includes advanced operational research and predictive project management tools:

- ⚡ **Critical Path Method (CPM)**: Topological Forward/Backward pass calculating Early Start ($ES$), Early Finish ($EF$), Late Start ($LS$), Late Finish ($LF$), Total Float ($TF$), and Free Float ($FF$) to identify zero-float bottlenecks that dictate project completion.
- 📊 **PERT Statistical Assessment**: 3-point time estimation ($O, M, P$), task variance ($\sigma^2$), standard deviation ($\sigma$), normal Gaussian error function ($Z$-score), and confidence interval distribution curves.
- 🛡️ **Risk Analysis & 5×5 Matrix**: Interactive $5 \times 5$ Likelihood $\times$ Impact risk heatmap, composite Project Health Index ($0-100$), systemic schedule risk scanner, and full CRUD Risk Register with mitigation & contingency planning.
- ⏱️ **Predictive Delay & Earned Schedule**: Schedule Performance Index ($SPI$), estimated task & milestone completion dates, float buffer absorption, DAG cascading ripple effect visualizer, and AI recovery recommendations (Crashing, Fast-tracking, Rebalancing).
- 🧪 **What-If Scenario Simulator**: Multi-variable scenario studio with real-time CPM recalculation, schedule crashing sliders, critical path shift detection, and 5,000-run Monte Carlo simulation with P50–P95 confidence percentiles and Task Criticality Index.
- 📅 **Interactive Gantt Chart**: Visual timeline with Critical Path highlight mode, slack buffer bars, today indicator, and day/week zoom.
- 🤖 **AI Assistant**: Intelligent project advisor for CPM queries, risk assessment, delay forecasts, and scenario modeling.

---

## 🚀 How to Open and Run in VS Code

### Method 1: Open Directly in VS Code
1. Open VS Code.
2. Click **File** > **Open Folder...**
3. Select this folder:
   ```
   C:\Users\swami\OneDrive\Desktop\Project_pulse\Frontend
   ```
4. Click **Select Folder**.

---

### Running the App (Choose Any of the Following)

#### Option A: Using the VS Code "Live Server" Extension (Recommended)
1. In VS Code, install the extension **"Live Server"** (by Ritwick Dey).
2. Right-click on `index.html` in the File Explorer sidebar.
3. Click **"Open with Live Server"**.
4. The application opens automatically in your browser at `http://127.0.0.1:5500`.

#### Option B: Using Python Built-in Server
Open the built-in terminal in VS Code (``Ctrl + ` ``) and run:
```bash
python -m http.server 3000
```
Then visit [http://localhost:3000](http://localhost:3000).

#### Option C: Using Node.js / npm
In the VS Code terminal, run:
```bash
npm start
```
Then visit [http://localhost:3000](http://localhost:3000).

#### Option D: Double-Click to Run (No Server Needed!)
Because ProjectPulse is pure frontend web code with zero build steps or external dependencies:
- Simply double-click `index.html` in Windows File Explorer.
- It will open and run in any modern web browser (Edge, Chrome, Firefox, Brave).

---

## 📁 Project Structure

```
Frontend/
├── index.html               # Main SPA entry point with all view sections and modals
├── package.json             # NPM metadata and scripts (npm start / dev)
├── README.md                # Comprehensive documentation and user guide
├── .vscode/
│   └── settings.json        # Live Server configuration
├── css/
│   ├── style.css            # Base styles, color palette, dark mode variables, modals
│   ├── dashboard.css        # Dashboard grid, statistics, intelligence cards
│   ├── gantt.css            # Gantt chart bars, float indicators, today marker
│   ├── cpm-pert.css         # Activity-on-Node graph, CPM cards, Gaussian curve
│   ├── risk-analysis.css    # 5x5 Heatmap matrix, severity badges, risk register table
│   ├── delay-prediction.css # Predictive hero cards, SPI indicators, cascade visualizer
│   ├── whatif-simulator.css # Scenario sliders, comparison table, Monte Carlo histogram
│   └── responsive.css       # Mobile and tablet layout adaptations
└── js/
    ├── app.js               # Shared PP object, LocalStorage persistence, demo data, navigation
    ├── cpm-pert.js          # CPM forward/backward passes, AoN diagram, normal CDF Phi(Z)
    ├── risk-analysis.js     # 5x5 heatmap, health score, systemic scanner, CSV export
    ├── delay-prediction.js  # Earned schedule, SPI, slippage prediction, cascade impact
    ├── whatif-simulator.js  # Real-time CPM delta, scenario presets, 5,000-run Monte Carlo
    ├── dashboard.js         # Stat cards, deadlines, intelligence health summary
    ├── projects.js          # Project list, details view, CPM/Risk/Delay action shortcuts
    ├── tasks.js             # Tasks table, filter, multi-predecessors, PERT modal
    ├── gantt.js             # Interactive Gantt chart with Critical Path toggle
    ├── team.js              # Team member management and workload cards
    ├── ai-assistant.js      # Assistant answering CPM, PERT, risk, delay, and simulation queries
    └── main.js              # Bootstrapper, theme switcher, simulated authentication
```

---

## 🧮 Mathematical & Algorithmic Foundations

### 1. Risk Matrix & Project Health Score
- **Risk Exposure Score**:
  $$\text{Score} = \text{Likelihood} \times \text{Impact} \quad (1 \le \text{Score} \le 25)$$
  - **Low**: $1 - 4$ (Green)
  - **Medium**: $5 - 9$ (Yellow)
  - **High**: $10 - 15$ (Orange)
  - **Critical**: $16 - 25$ (Red)
- **Composite Health Index ($0 - 100$)**:
  $$\text{Health} = \max\left(10, 100 - \sum \text{Risk Penalties} - \sum \text{Overdue Penalties} - \text{CPM Variance Penalty}\right)$$

### 2. Delay Prediction & Schedule Performance Index (SPI)
- **Schedule Performance Index**:
  $$SPI = \frac{\text{Actual Progress (\%) } \times \text{Planned Duration}}{\text{Elapsed Days} \times 100\%} = \frac{\text{Earned Progress}}{\text{Expected Progress}}$$
- **Predicted Duration**:
  $$\text{Projected Duration} = \text{Elapsed Days} + \frac{100 - \text{Actual Progress}}{\text{Burn Rate}}$$
- **Critical Path Propagation**:
  $$\text{Milestone Slip} = \begin{cases} \text{Delay Days} & \text{if Task is Critical} \\ \max(0, \text{Delay Days} - \text{Total Float}) & \text{if Task has Slack} \end{cases}$$

### 3. CPM Schedule & Topological Sort
- **Forward Pass**:
  $$ES_j = \max_{i \in \text{Pred}(j)} (EF_i), \quad EF_j = ES_j + D_j$$
- **Backward Pass**:
  $$LF_i = \min_{j \in \text{Succ}(i)} (LS_j), \quad LS_i = LF_i - D_i$$
- **Total Float (Slack)**:
  $$TF_i = LS_i - ES_i = LF_i - EF_i$$
  Activities where $TF_i = 0$ constitute the **Critical Path**.

### 4. PERT & Monte Carlo Simulation
- **PERT Expected Duration**:
  $$T_e = \frac{O + 4M + P}{6}$$
- **Variance**:
  $$\sigma^2 = \left(\frac{P - O}{6}\right)^2$$
- **Monte Carlo Triangular Sampling**:
  Given uniform random $u \sim U(0, 1)$ and mode fraction $f = \frac{M - O}{P - O}$:
  $$D_{\text{sim}} = \begin{cases} O + \sqrt{u(P - O)(M - O)} & u < f \\ P - \sqrt{(1 - u)(P - O)(P - M)} & u \ge f \end{cases}$$
- **Task Criticality Index ($CI$)**:
  $$CI_i = \frac{\text{Number of Iterations where Task } i \in \text{Critical Path}}{\text{Total Iterations (5,000)}} \times 100\%$$
