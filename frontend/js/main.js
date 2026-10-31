// main.js: ProgNix real authentication, login/signup and app startup. Loaded last.
let signupMode = false;

async function showApp() {
  const token = localStorage.getItem("pp_token");
  const user = JSON.parse(localStorage.getItem("pp_user") || "null");

  if (!token || !user) {
    $("auth").classList.remove("hidden");
    $("app").classList.add("hidden");
    return;
  }

  $("auth").classList.add("hidden");
  $("app").classList.remove("hidden");
  $("user-name").textContent = user.name || user.email || "User";
  $("user-avatar").textContent = (user.name || user.email || "U").charAt(0).toUpperCase();
  PP.showPage(location.hash.replace("#", "") || "dashboard");

  // Verify active session with backend /auth/me
  if (PP.api && PP.api.auth) {
    try {
      const me = await PP.api.auth.me();
      if (me && me.full_name) {
        user.name = me.full_name;
        user.email = me.email;
        localStorage.setItem("pp_user", JSON.stringify(user));
        $("user-name").textContent = user.name;
        $("user-avatar").textContent = user.name.charAt(0).toUpperCase();
      }
    } catch (authErr) {
      if (authErr.status === 401) {
        localStorage.removeItem("pp_token");
        localStorage.removeItem("pp_user");
        $("auth").classList.remove("hidden");
        $("app").classList.add("hidden");
        $("auth-error").textContent = "Session expired. Please log in again.";
        return;
      }
    }
  }

  // Synchronize authoritative state with backend on login / startup
  if (PP.syncWithBackend) {
    PP.syncWithBackend().catch(err => {
      // Backend error is displayed via PP.showBackendError banner
    });
  }
}

function setAuthMode(signup) {
  signupMode = signup;
  document.querySelector(".signup-only").classList.toggle("hidden", !signup);
  $("auth-sub").textContent = signup ? "Create your ProgNix account." : "Welcome back. Log in to your workspace.";
  $("auth-submit").textContent = signup ? "Sign up" : "Log in";
  $("auth-switch-text").textContent = signup ? "Already have an account?" : "New here?";
  $("auth-switch").textContent = signup ? "Log in" : "Create an account";
  $("auth-error").textContent = "";
}

function applyTheme(theme) {
  const selected = theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = selected;
  localStorage.setItem("pp_theme", selected);
  const toggle = $("theme-toggle");
  const state = $("theme-state");
  if (toggle) toggle.checked = selected === "dark";
  if (state) state.textContent = selected === "dark" ? "Dark mode is enabled." : "Light mode is enabled.";
}

document.addEventListener("DOMContentLoaded", () => {
  applyTheme(localStorage.getItem("pp_theme") || "dark");
  PP.buildNav();
  window.addEventListener("hashchange", () => !$("app").classList.contains("hidden") && PP.showPage(location.hash.replace("#", "")));
  $("menu-button").onclick = PP.openSidebar;
  $("overlay").onclick = PP.closeSidebar;
  $("top-new").onclick = $("new-project").onclick = () => PP.startWizard();

  $("auth-switch").onclick = e => { e.preventDefault(); setAuthMode(!signupMode); };
  $("auth-form").onsubmit = async e => {
    e.preventDefault();
    const email = $("auth-email").value.trim();
    const pass = $("auth-pass").value;
    const name = $("auth-name").value.trim();

    if (signupMode && !name) return $("auth-error").textContent = "Please enter your full name.";
    if (!/^\S+@\S+\.\S+$/.test(email)) return $("auth-error").textContent = "Enter a valid email address.";
    if (pass.length < 6) return $("auth-error").textContent = "Password must be at least 6 characters.";

    $("auth-submit").disabled = true;
    $("auth-error").textContent = "";

    try {
      let res;
      if (signupMode) {
        res = await PP.api.auth.register({ email, password: pass, full_name: name });
        PP.toast("Account created! Welcome to ProgNix, " + res.user.full_name + "!");
      } else {
        res = await PP.api.auth.login({ email, password: pass });
        PP.toast("Welcome back, " + res.user.full_name + "!");
      }

      localStorage.setItem("pp_token", res.access_token);
      localStorage.setItem("pp_user", JSON.stringify({
        id: res.user.id,
        name: res.user.full_name,
        email: res.user.email
      }));

      await showApp();
    } catch (err) {
      $("auth-error").textContent = err.message || "Authentication failed.";
    } finally {
      $("auth-submit").disabled = false;
    }
  };

  $("logout").onclick = e => {
    e.preventDefault();
    localStorage.removeItem("pp_token");
    localStorage.removeItem("pp_user");
    PP.toast("Logged out successfully.");
    showApp();
  };

  $("theme-toggle").onchange = event => applyTheme(event.target.checked ? "dark" : "light");

  $("reset-data").onclick = async () => {
    if (!confirm("Clear local cache and reload fresh from the database?")) return;
    localStorage.removeItem("pp_data");
    PP.data = PP.load();
    await PP.syncWithBackend();
    PP.toast("Data synchronized from database.");
    PP.refresh();
  };

  showApp();
});
