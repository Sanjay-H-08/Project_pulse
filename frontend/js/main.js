// main.js: login/signup (simulated) and app startup. Loaded last.
let signupMode = false;

function showApp() {
  const user = JSON.parse(localStorage.getItem("pp_user") || "null");
  $("auth").classList.toggle("hidden", !!user);
  $("app").classList.toggle("hidden", !user);
  if (!user) return;
  $("user-name").textContent = user.name;
  $("user-avatar").textContent = user.name.charAt(0).toUpperCase();
  PP.showPage(location.hash.replace("#", ""));
}

function setAuthMode(signup) {
  signupMode = signup;
  document.querySelector(".signup-only").classList.toggle("hidden", !signup);
  $("auth-sub").textContent = signup ? "Create your ProjectPulse account." : "Welcome back. Log in to your workspace.";
  $("auth-submit").textContent = signup ? "Sign up" : "Log in";
  $("auth-switch-text").textContent = signup ? "Already have an account?" : "New here?";
  $("auth-switch").textContent = signup ? "Log in" : "Create an account";
  $("auth-error").textContent = "";
}

function applyTheme(theme) {
  const selected = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = selected;
  localStorage.setItem("pp_theme", selected);
  const toggle = $("theme-toggle");
  const state = $("theme-state");
  if (toggle) toggle.checked = selected === "dark";
  if (state) state.textContent = selected === "dark" ? "Dark mode is enabled." : "Light mode is enabled.";
}

document.addEventListener("DOMContentLoaded", () => {
  applyTheme(localStorage.getItem("pp_theme") || "light");
  PP.buildNav();
  window.addEventListener("hashchange", () => !$("app").classList.contains("hidden") && PP.showPage(location.hash.replace("#", "")));
  $("menu-button").onclick = PP.openSidebar;
  $("overlay").onclick = PP.closeSidebar;
  $("top-new").onclick = $("new-project").onclick = () => PP.startWizard();

  $("auth-switch").onclick = e => { e.preventDefault(); setAuthMode(!signupMode); };
  $("auth-form").onsubmit = e => {
    e.preventDefault();
    const email = $("auth-email").value.trim(), pass = $("auth-pass").value, name = $("auth-name").value.trim();
    // Basic validation. A real backend would check the password here.
    if (signupMode && !name) return $("auth-error").textContent = "Please enter your name.";
    if (!/^\S+@\S+\.\S+$/.test(email)) return $("auth-error").textContent = "Enter a valid email address.";
    if (pass.length < 6) return $("auth-error").textContent = "Password must be at least 6 characters.";
    const user = { name: name || email.split("@")[0], email };
    localStorage.setItem("pp_user", JSON.stringify(user));
    PP.toast("Welcome to ProjectPulse, " + user.name + "!");
    showApp();
  };
  $("logout").onclick = e => { e.preventDefault(); localStorage.removeItem("pp_user"); showApp(); };

  $("theme-toggle").onchange = event => applyTheme(event.target.checked ? "dark" : "light");

  $("reset-data").onclick = () => {
    if (!confirm("Reset all projects and tasks to the demo data?")) return;
    PP.data = demoData(); PP.save(); PP.toast("Demo data restored."); PP.refresh();
  };
  showApp();
});
