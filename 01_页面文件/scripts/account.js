document.addEventListener("DOMContentLoaded", async () => {
    const auth = window.DigitalMentorAuth;
    const status = document.getElementById("accountStatus");
    const profile = document.getElementById("profileContent");
    const toast = document.getElementById("accountToast");
    if (!auth?.token()) { window.location.href = "auth.html?next=account.html"; return; }

    const labels = { progress: "学习进度", weakness: "薄弱知识点", common_error: "常见错误", preference: "学习偏好", milestone: "重要经历" };
    let toastTimer;
    function notify(text, error = false) {
        toast.textContent = text;
        toast.classList.toggle("is-error", error);
        toast.classList.add("is-visible");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2600);
    }
    function emptyState(title, detail) {
        return `<li class="account-empty"><span class="empty-mark" aria-hidden="true">✦</span><span><strong>${escapeHtml(title)}</strong><br>${escapeHtml(detail)}</span></li>`;
    }
    function renderProgress(items) {
        const list = document.getElementById("progressList");
        if (!items.length) { list.innerHTML = emptyState("学习旅程刚刚开始", "完成一次实验或向小芯提问，进度就会记录在这里。"); return; }
        list.innerHTML = items.map((item) => {
            const mastery = Math.max(0, Math.min(100, Math.round(Number(item.mastery || 0) * 100)));
            const attempts = Number(item.attempts || 0);
            const statusText = item.status === "mastered" ? "已掌握" : item.status === "completed" ? "已完成" : "学习中";
            return `<li class="progress-item"><div class="progress-item-top"><strong>${escapeHtml(item.experiment_type || "数字电路实验")}</strong><span class="progress-status">${statusText}</span></div><div class="progress-item-meta">互动 ${attempts} 次 <span>·</span> 掌握度 ${mastery}%</div><div class="progress-track"><div class="progress-fill" style="width:${mastery}%"></div></div></li>`;
        }).join("");
    }
    function renderMemories(items) {
        const list = document.getElementById("memoryList");
        if (!items.length) { list.innerHTML = emptyState("还没有长期记忆", "多和小芯交流实验思路，它会逐步整理你的学习偏好和知识进展。" ); return; }
        list.innerHTML = items.map((item) => `<li class="memory-item" data-id="${escapeHtml(item.id)}"><div class="memory-item-head"><span class="memory-category">${labels[item.category] || "学习记录"}</span><span class="panel-heading-mark">已保存</span></div><textarea aria-label="编辑${labels[item.category] || "学习记录"}">${escapeHtml(item.content)}</textarea><div class="memory-actions"><button type="button" data-delete class="memory-delete">删除</button><button type="button" data-save>保存修改</button></div></li>`).join("");
    }
    async function load() {
        status.textContent = "正在加载你的学习空间…";
        try {
            const data = await auth.api("/api/student/profile");
            const student = data.student || {};
            const progress = data.progress || [];
            const memories = data.memories || [];
            document.getElementById("studentName").value = student.display_name || student.displayName || "";
            document.getElementById("profileTitle").textContent = `${student.display_name || student.displayName || "同学"}，继续探索数字电路吧`;
            document.getElementById("accountAvatar").textContent = (student.display_name || student.displayName || "芯").trim().slice(0, 1);
            document.getElementById("studentContact").textContent = student.phone || student.email || "学生账号";
            document.getElementById("memoryEnabled").checked = student.memory_enabled ?? student.memoryEnabled ?? true;
            document.getElementById("experimentCount").textContent = progress.length;
            document.getElementById("questionCount").textContent = progress.reduce((sum, item) => sum + Number(item.attempts || 0), 0);
            document.getElementById("memoryCount").textContent = memories.filter((item) => item.active !== false).length;
            renderProgress(progress);
            renderMemories(memories);
            status.hidden = true;
            profile.hidden = false;
        } catch (error) {
            status.textContent = error.message;
            if (/登录|令牌|学生账号/.test(error.message)) { auth.clearSession(); window.location.href = "auth.html?next=account.html"; }
        }
    }

    document.getElementById("saveProfile").addEventListener("click", async () => {
        const button = document.getElementById("saveProfile");
        button.disabled = true;
        try {
            await auth.api("/api/student/profile", { method: "PATCH", body: JSON.stringify({ displayName: document.getElementById("studentName").value, memoryEnabled: document.getElementById("memoryEnabled").checked }) });
            await load();
            notify("个人设置已保存");
        } catch (error) { notify(error.message, true); }
        finally { button.disabled = false; }
    });
    document.getElementById("logoutButton").addEventListener("click", async () => {
        try { await auth.api("/api/auth/logout", { method: "POST" }); } catch (_error) {}
        auth.clearSession(); window.location.href = "index.html";
    });
    document.getElementById("memoryList").addEventListener("click", async (event) => {
        const row = event.target.closest("li[data-id]");
        if (!row) return;
        try {
            if (event.target.matches("[data-save]")) {
                await auth.api(`/api/student/memories/${encodeURIComponent(row.dataset.id)}`, { method: "PATCH", body: JSON.stringify({ content: row.querySelector("textarea").value }) });
                notify("记忆已更新");
            } else if (event.target.matches("[data-delete]")) {
                await auth.api(`/api/student/memories/${encodeURIComponent(row.dataset.id)}`, { method: "DELETE" });
                notify("记忆已删除");
            } else return;
            await load();
        } catch (error) { notify(error.message, true); }
    });
    await load();
});

function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}
