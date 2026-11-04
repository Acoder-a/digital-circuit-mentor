(() => {
    const auth = window.DigitalMentorAuth;
    const message = document.getElementById("authMessage");
    const title = document.getElementById("authTitle");
    const description = document.getElementById("authDescription");
    const modes = {
        login: ["欢迎回来", "登录后继续你的实验和学习记录。"],
        register: ["认识一下，小芯的新伙伴", "创建账号，让每次学习都有迹可循。"],
        reset: ["找回密码", "用注册手机号接收验证码，设置一个新密码。"]
    };
    const params = new URLSearchParams(location.search);
    const requestedNext = params.get("next") || "index.html";
    const next = /^[a-z0-9-]+\.html$/i.test(requestedNext) ? requestedNext : "index.html";

    function showMessage(value = "", success = false) {
        message.textContent = value;
        message.classList.toggle("is-success", success);
    }
    function switchMode(mode) {
        if (!modes[mode]) mode = "login";
        title.textContent = modes[mode][0];
        description.textContent = modes[mode][1];
        document.querySelectorAll("[data-panel]").forEach((panel) => { panel.hidden = panel.dataset.panel !== mode; });
        document.querySelectorAll(".auth-tabs [data-mode]").forEach((tab) => {
            tab.setAttribute("aria-selected", String(tab.dataset.mode === mode));
        });
        document.querySelector(".auth-tabs").hidden = mode === "reset";
        showMessage();
        history.replaceState(null, "", `auth.html?mode=${mode}&next=${encodeURIComponent(next)}`);
    }
    document.querySelectorAll("[data-mode]").forEach((button) => button.addEventListener("click", () => switchMode(button.dataset.mode)));
    document.querySelectorAll(".auth-reveal").forEach((button) => button.addEventListener("click", () => {
        const input = button.parentElement.querySelector("input");
        input.type = input.type === "password" ? "text" : "password";
        button.textContent = input.type === "password" ? "显示" : "隐藏";
    }));
    document.querySelectorAll("[data-send-code]").forEach((button) => button.addEventListener("click", async () => {
        const purpose = button.dataset.sendCode;
        const phone = document.getElementById(purpose === "register" ? "registerPhone" : "resetPhone").value.trim();
        if (!/^1[3-9]\d{9}$/.test(phone)) return showMessage("请输入正确的中国大陆手机号");
        button.disabled = true;
        try {
            const result = await auth.api("/api/auth/sms/send", { method: "POST", body: JSON.stringify({ phone, purpose }) });
            showMessage(result.devCode ? `开发模式验证码：${result.devCode}` : (result.message || "验证码已发送"), true);
            let seconds = 60;
            button.textContent = `${seconds}s 后重试`;
            const interval = setInterval(() => {
                seconds -= 1;
                button.textContent = seconds > 0 ? `${seconds}s 后重试` : "重新获取";
                if (seconds <= 0) { clearInterval(interval); button.disabled = false; }
            }, 1000);
        } catch (error) { showMessage(error.message); button.disabled = false; }
    }));

    async function submit(form, endpoint, body, onSuccess) {
        const button = form.querySelector("[type=submit]");
        button.disabled = true;
        showMessage();
        try { await onSuccess(await auth.api(endpoint, { method: "POST", body: JSON.stringify(body) })); }
        catch (error) { showMessage(error.message); }
        finally { button.disabled = false; }
    }
    document.getElementById("loginForm").addEventListener("submit", (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = Object.fromEntries(new FormData(form));
        submit(form, "/api/auth/login", { phone: data.account.trim(), password: data.password }, (result) => {
            auth.saveSession(result); location.href = next;
        });
    });
    document.getElementById("registerForm").addEventListener("submit", (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = Object.fromEntries(new FormData(form));
        if (data.password !== data.confirm) return showMessage("两次输入的密码不一致");
        submit(form, "/api/auth/register", { phone: data.phone.trim(), code: data.code.trim(), displayName: data.displayName.trim(), password: data.password }, (result) => {
            auth.saveSession(result); location.href = next;
        });
    });
    document.getElementById("resetForm").addEventListener("submit", (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = Object.fromEntries(new FormData(form));
        if (data.password !== data.confirm) return showMessage("两次输入的新密码不一致");
        submit(form, "/api/auth/password/reset", { phone: data.phone.trim(), code: data.code.trim(), password: data.password }, () => {
            switchMode("login");
            document.getElementById("loginAccount").value = data.phone.trim();
            showMessage("密码已重置，请使用新密码登录", true);
        });
    });
    switchMode(params.get("mode") || "login");
})();
