(() => {
    const API_BASE = window.location.port === "3010" ? "" : "http://127.0.0.1:3010";
    const TOKEN_KEY = "digital_mentor_access_token";
    const STUDENT_KEY = "digital_mentor_student";
    function token() { return localStorage.getItem(TOKEN_KEY) || ""; }
    function student() { try { return JSON.parse(localStorage.getItem(STUDENT_KEY) || "null"); } catch (_error) { return null; } }
    async function api(path, options = {}) {
        const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
        if (token()) headers.Authorization = `Bearer ${token()}`;
        const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || `请求失败 (${response.status})`);
        return payload;
    }
    function saveSession(payload) {
        localStorage.setItem(TOKEN_KEY, payload.accessToken);
        localStorage.setItem(STUDENT_KEY, JSON.stringify(payload.student));
        renderButton();
    }
    function clearSession() { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(STUDENT_KEY); renderButton(); }
    const host = document.createElement("div");
    host.id = "studentAccountWidget";
    host.innerHTML = `<button class="student-account-button" type="button" aria-label="学生账号"></button>`;
    if (document.querySelector(".topbar")) host.style.cssText = "position:static;right:auto;top:auto;flex:0 0 auto;z-index:20";
    if (!document.body.classList.contains("account-page")) {
        (document.querySelector(".topbar") || document.body).appendChild(host);
    }
    const button = host.querySelector("button");
    function renderButton() {
        const current = student();
        button.textContent = current ? `👤 ${current.displayName || current.display_name}` : "登录 / 注册";
    }
    button.addEventListener("click", () => {
        window.location.href = student() ? "account.html" : `auth.html?next=${encodeURIComponent(location.pathname.split("/").pop() || "index.html")}`;
    });
    renderButton();
    window.DigitalMentorAuth = { API_BASE, token, student, api, clearSession, saveSession };
})();
