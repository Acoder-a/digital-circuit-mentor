const page = document.getElementById("page");
const mentorStage = document.getElementById("mentorStage");
const bubbleText = document.getElementById("bubbleText");
const voiceState = document.getElementById("voiceState");
const focusState = document.getElementById("focusState");
const stepHint = document.getElementById("stepHint");
const valueD = document.getElementById("valueD");
const clockState = document.getElementById("clockState");
const displayD = document.getElementById("displayD");
const summaryQ = document.getElementById("summaryQ");
const summaryNotQ = document.getElementById("summaryNotQ");
const latchedInfo = document.getElementById("latchedInfo");
const clockInfo = document.getElementById("clockInfo");
const edgeIndicator = document.getElementById("edgeIndicator");
const truthTableBody = document.getElementById("truthTableBody");
const wireValueD = document.getElementById("wireValueD");
const wireValueClock = document.getElementById("wireValueClock");
const wireData = document.getElementById("wireData");
const wireClock = document.getElementById("wireClock");
const wireQ = document.getElementById("wireQ");
const wireNotQ = document.getElementById("wireNotQ");
const ledQ = document.getElementById("ledQ");
const ledNotQ = document.getElementById("ledNotQ");
const btnData = document.getElementById("btnData");
const btnClock = document.getElementById("btnClock");
const replayBtn = document.getElementById("replayBtn");
const introBtn = document.getElementById("introBtn");
const mouth = document.getElementById("mouth");
const live2dHostApi = window.__live2dHostApi || null;
const audioApi = window.__digitalHumanAudioApi || null;
const voiceProfile = window.__digitalHumanVoiceProfile || null;

const synth = window.speechSynthesis;
let currentUtterance = null;
let talkTimer = null;
let streamTimer = null;
let pulseTimer = null;
let speechCompletionResolve = null;
let speechCompletionPromise = Promise.resolve();

const state = {
    D: 0,
    clock: 0,
    Q: 0,
    latchedValue: null
};

function beginSpeechCompletion() {
    if (speechCompletionResolve) {
        const resolve = speechCompletionResolve;
        speechCompletionResolve = null;
        resolve();
    }

    speechCompletionPromise = new Promise((resolve) => {
        speechCompletionResolve = resolve;
    });
}

function endSpeechCompletion() {
    if (!speechCompletionResolve) {
        return;
    }

    const resolve = speechCompletionResolve;
    speechCompletionResolve = null;
    resolve();
}

function getSpeechCompletionPromise() {
    return speechCompletionPromise;
}

function renderTruthTable() {
    truthTableBody.innerHTML = "";

    const rows = [
        { id: "keep", d: "-", event: "无上升沿", q: "保持原状态", nq: "保持互补" },
        { id: "rise-0", d: "0", event: "上升沿到来", q: "0", nq: "1" },
        { id: "rise-1", d: "1", event: "上升沿到来", q: "1", nq: "0" }
    ];

    rows.forEach((item) => {
        const row = document.createElement("tr");
        row.id = `row-${item.id}`;
        row.innerHTML = `<td>${item.d}</td><td>${item.event}</td><td>${item.q}</td><td>${item.nq}</td>`;
        truthTableBody.appendChild(row);
    });
}

function highlightTruthRow(mode) {
    document.querySelectorAll("#truthTableBody tr").forEach((row) => {
        row.classList.remove("active-row");
    });

    const activeRow = document.getElementById(`row-${mode}`);
    if (activeRow) {
        activeRow.classList.add("active-row");
    }
}

function stopTalkingAnimation() {
    window.clearInterval(talkTimer);
    if (live2dHostApi && typeof live2dHostApi.stopLipSync === "function") {
        live2dHostApi.stopLipSync();
    }
    if (live2dHostApi && typeof live2dHostApi.forceCloseMouth === "function") {
        live2dHostApi.forceCloseMouth();
    }
    if (mouth) {
        mouth.style.setProperty("--talk-scale", 1);
    }
}

function isSpeaking() {
    return Boolean(
        (audioApi && typeof audioApi.isSpeaking === "function" && audioApi.isSpeaking())
        || (synth && (synth.speaking || synth.pending || currentUtterance))
    );
}

function startTalkingAnimation() {
    stopTalkingAnimation();

    let frame = 0;
    talkTimer = window.setInterval(() => {
        frame += 1;
        const scale = 1 + Math.abs(Math.sin(frame * 0.55)) * 2.1;
        if (mouth) {
            mouth.style.setProperty("--talk-scale", scale.toFixed(2));
        }
    }, 80);
}

function legacyStopStreamingText(finalText = "") {
    window.clearTimeout(streamTimer);
    streamTimer = null;
    bubbleText.classList.remove("is-streaming");

    if (finalText) {
        bubbleText.textContent = finalText;
    }
}

function stopSpeech(resetBubble = false) {
    if (synth && (synth.speaking || synth.pending)) {
        synth.cancel();
    }

    if (audioApi && typeof audioApi.stop === "function") {
        audioApi.stop();
    }

    currentUtterance = null;
    voiceState.textContent = "待命";
    stopTalkingAnimation();
    stopStreamingText(resetBubble ? "" : bubbleText.textContent);
    endSpeechCompletion();
}

function getCharacterDelay(character, baseDelay) {
    if ("，、".includes(character)) {
        return baseDelay + 150;
    }

    if ("。！？；".includes(character)) {
        return baseDelay + 300;
    }

    return baseDelay;
}

function streamBubbleText(text, baseDelay = 80) {
    stopStreamingText();
    bubbleText.textContent = "";
    bubbleText.classList.add("is-streaming");

    const characters = Array.from(text);
    let index = 0;

    function next() {
        if (index >= characters.length) {
            stopStreamingText(text);
            return;
        }

        const character = characters[index];
        index += 1;
        bubbleText.textContent = characters.slice(0, index).join("");

        streamTimer = window.setTimeout(next, getCharacterDelay(character, baseDelay));
    }

    next();
}

function getChineseVoice() {
    if (voiceProfile && typeof voiceProfile.getPreferredVoice === "function") {
        return voiceProfile.getPreferredVoice();
    }

    const voices = synth ? synth.getVoices() : [];
    const chineseVoices = voices.filter((voice) => voice.lang === "zh-CN" || voice.lang.includes("zh"));
    const preferredKeywords = ["xiaoxiao", "xiaoyi", "xiaohan", "xiaomeng", "female"];
    return chineseVoices.find((voice) => {
        const name = voice.name.toLowerCase();
        return preferredKeywords.some((keyword) => name.includes(keyword));
    }) || chineseVoices[0] || null;
}

function legacySpeak(text) {
    streamBubbleText(text, 82);

    streamBubbleText(text, 118);
    return;

    beginSpeechCompletion();
    streamBubbleText(text, 118);
    voiceState.textContent = "浜戠璇煶鏆傛椂涓嶅彲鐢紝宸叉樉绀烘枃瀛楄瑙?";
    endSpeechCompletion();
    return;

    if (!synth || typeof SpeechSynthesisUtterance === "undefined") {
        voiceState.textContent = "当前浏览器不支持语音";
        return;
    }

    if (currentUtterance) {
        stopSpeech(true);
        streamBubbleText(text, 82);
    }

    const utterance = new SpeechSynthesisUtterance(text);
    const voice = getChineseVoice();

    if (voice) {
        utterance.voice = voice;
    }

    if (voiceProfile && typeof voiceProfile.applyUtterance === "function") {
        voiceProfile.applyUtterance(utterance);
    } else {
        utterance.lang = "zh-CN";
        utterance.rate = 0.95;
        utterance.pitch = 1.18;
        utterance.volume = 1;
    }

    utterance.onstart = () => {
        currentUtterance = utterance;
        voiceState.textContent = "讲解中";
        startTalkingAnimation();
        if (live2dHostApi && typeof live2dHostApi.startLipSync === "function") {
            live2dHostApi.startLipSync(text);
        }
    };

    utterance.onboundary = (event) => {
        if (live2dHostApi && typeof live2dHostApi.handleSpeechBoundary === "function") {
            live2dHostApi.handleSpeechBoundary(event);
        }
    };

    utterance.onend = () => {
        currentUtterance = null;
        voiceState.textContent = "待命";
        stopTalkingAnimation();
        stopStreamingText(text);
    };

    utterance.onerror = () => {
        currentUtterance = null;
        voiceState.textContent = "讲解失败";
        stopTalkingAnimation();
        stopStreamingText(text);
    };

    synth.speak(utterance);
}

function updateSwitchStyle(button, value) {
    button.classList.toggle("on", value === 1);
    button.classList.toggle("off", value === 0);
}

function updateOutputs() {
    const notQ = state.Q === 1 ? 0 : 1;

    summaryQ.textContent = state.Q;
    summaryNotQ.textContent = notQ;
    displayD.textContent = state.D;
    valueD.textContent = state.D;
    wireValueD.textContent = state.D;
    wireValueClock.textContent = state.clock;
    updateSwitchStyle(btnData, state.D);

    wireData.parentElement.classList.toggle("active", state.D === 1);
    wireClock.parentElement.classList.toggle("active", state.clock === 1);
    wireQ.parentElement.classList.toggle("active", state.Q === 1);
    wireNotQ.parentElement.classList.toggle("active", notQ === 1);
    ledQ.classList.toggle("on", state.Q === 1);
    ledNotQ.classList.toggle("on", notQ === 1);

    if (state.clock === 1) {
        clockState.textContent = "脉冲进行中";
        clockInfo.textContent = "上升沿已到达";
        btnClock.classList.add("is-pulsing");
        edgeIndicator.textContent = "上升沿触发";
        edgeIndicator.classList.add("pulse");
    } else {
        clockState.textContent = "待触发";
        clockInfo.textContent = "低电平等待";
        btnClock.classList.remove("is-pulsing");
        edgeIndicator.textContent = "等待时钟";
        edgeIndicator.classList.remove("pulse");
    }
}

function buildResultExplain() {
    const notQ = state.Q === 1 ? 0 : 1;
    if (state.latchedValue === null) {
        return `当前数据输入 D 是 ${state.D}，但还没有发送时钟上升沿，所以输出 Q 仍保持初始状态 ${state.Q}，Q' 为 ${notQ}。`;
    }

    return `最近一次上升沿已经把 D=${state.latchedValue} 锁存到了输出端，所以现在 Q=${state.Q}，Q'=${notQ}。即使你再改变 D，只要没有新的时钟上升沿，Q 也会保持当前状态。`;
}

function updateStatusByMode(mode) {
    if (mode === "keep") {
        highlightTruthRow("keep");
        latchedInfo.textContent = state.latchedValue === null ? "尚未触发" : `保持 Q=${state.Q}`;
        return;
    }

    highlightTruthRow(`rise-${state.Q}`);
    latchedInfo.textContent = `锁存 D=${state.Q}`;
}

function updateCircuit(mode = "keep", speakText = "") {
    updateOutputs();
    updateStatusByMode(mode);

    if (speakText) {
        speak(speakText);
    }
}

function toggleData() {
    state.D = state.D === 1 ? 0 : 1;
    focusState.textContent = "数据输入更新";
    stepHint.textContent = `你刚刚把 D 切换成了 ${state.D}。现在输出 Q 还不会立刻改变，接下来请点击时钟脉冲，让触发器在上升沿锁存这个值。`;
    updateCircuit("keep", `数据输入 D 已切换为 ${state.D}。请注意，D触发器不会在此刻立刻改写输出，只有收到时钟上升沿后，Q 才会更新为当前的 D。`);
}

function triggerClockPulse() {
    window.clearTimeout(pulseTimer);

    state.clock = 1;
    state.Q = state.D;
    state.latchedValue = state.D;

    focusState.textContent = "时钟上升沿";
    stepHint.textContent = `刚刚发送了一次时钟上升沿，当前 D=${state.D} 已被锁存到输出 Q。你可以继续修改 D，再次触发时钟，对比前后变化。`;
    updateCircuit("rise", `刚刚发送了一次时钟上升沿。由于当前数据输入 D 等于 ${state.D}，所以 D触发器把这个值锁存到了输出 Q。现在 Q=${state.Q}，Q'=${state.Q === 1 ? 0 : 1}。`);

    pulseTimer = window.setTimeout(() => {
        state.clock = 0;
        updateCircuit("rise");
    }, 320);
}

function playIntro() {
    focusState.textContent = "实验介绍";
    stepHint.textContent = "实验介绍已播放。先切换 D，再点击时钟脉冲，观察 Q 是否在上升沿时锁存。";
    updateCircuit("keep", "欢迎进入实验四，D触发器仿真。这个实验会展示一个重要的时序电路特性，也就是数据先准备好，等到时钟上升沿来到时，再把当前数据锁存到输出端。你可以先修改 D，再发送时钟脉冲，观察 Q 和 Q' 的变化。");
}

mentorStage.addEventListener("pointermove", (event) => {
    const rect = mentorStage.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width - 0.5;
    const py = (event.clientY - rect.top) / rect.height - 0.5;

    page.style.setProperty("--avatar-tilt-y", `${(px * 10).toFixed(2)}deg`);
    page.style.setProperty("--avatar-tilt-x", `${(-py * 8).toFixed(2)}deg`);
    page.style.setProperty("--eye-shift-x", `${(px * 6).toFixed(1)}px`);
    page.style.setProperty("--eye-shift-y", `${(py * 4).toFixed(1)}px`);
});

mentorStage.addEventListener("pointerleave", () => {
    page.style.setProperty("--avatar-tilt-y", "0deg");
    page.style.setProperty("--avatar-tilt-x", "0deg");
    page.style.setProperty("--eye-shift-x", "0px");
    page.style.setProperty("--eye-shift-y", "0px");
});

btnData.addEventListener("click", () => {
    toggleData();
});

btnClock.addEventListener("click", () => {
    triggerClockPulse();
});

replayBtn.addEventListener("click", () => {
    if (isSpeaking()) {
        stopSpeech();
        return;
    }

    speak(buildResultExplain());
});

introBtn.addEventListener("click", () => {
    if (isSpeaking()) {
        stopSpeech();
        return;
    }

    playIntro();
});

if (synth) {
    window.speechSynthesis.onvoiceschanged = () => {
        getChineseVoice();
    };
}

function waitForVoiceReady() {
    if (!synth) {
        return Promise.resolve();
    }

    if (synth.getVoices().length > 0) {
        return Promise.resolve();
    }

    return new Promise((resolve) => {
        let done = false;

        function finish() {
            if (done) {
                return;
            }

            done = true;
            resolve();
        }

        const timer = window.setTimeout(finish, 900);
        window.speechSynthesis.onvoiceschanged = () => {
            window.clearTimeout(timer);
            getChineseVoice();
            finish();
        };
    });
}

window.addEventListener("pagehide", () => stopSpeech(true));
window.addEventListener("beforeunload", () => stopSpeech(true));
document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
        stopSpeech(true);
    }
});

let speechTextSyncTimer = null;

function stopStreamingText(finalText = "") {
    window.clearTimeout(streamTimer);
    streamTimer = null;
    window.clearTimeout(speechTextSyncTimer);
    speechTextSyncTimer = null;
    bubbleText.classList.remove("is-streaming");

    if (finalText) {
        bubbleText.textContent = finalText;
    }

    bubbleText.scrollTop = bubbleText.scrollHeight;
}

function setStreamingBubbleText(text) {
    bubbleText.textContent = text;
    bubbleText.classList.add("is-streaming");
    bubbleText.scrollTop = bubbleText.scrollHeight;
}

function startSpeechSyncedBubbleText(text, baseDelay = 118) {
    stopStreamingText();

    const characters = Array.from(text);
    let index = 0;
    setStreamingBubbleText("");

    function next() {
        if (index >= characters.length) {
            return;
        }

        const character = characters[index];
        index += 1;
        setStreamingBubbleText(characters.slice(0, index).join(""));

        if (index < characters.length) {
            speechTextSyncTimer = window.setTimeout(next, getCharacterDelay(character, baseDelay));
        }
    }

    speechTextSyncTimer = window.setTimeout(next, 180);
}

function syncSpeechBubbleToBoundary(text, event) {
    window.clearTimeout(speechTextSyncTimer);
    speechTextSyncTimer = null;

    const characters = Array.from(text);
    const nextIndex = Math.min(characters.length, Math.max(1, Number(event?.charIndex ?? 0) + 1));
    setStreamingBubbleText(characters.slice(0, nextIndex).join(""));
}

function speak(text) {
    if (audioApi && typeof audioApi.speak === "function") {
        if (currentUtterance || (audioApi.isSpeaking && audioApi.isSpeaking())) {
            stopSpeech(true);
        }

        beginSpeechCompletion();
        currentUtterance = { mode: "audio", text };
        voiceState.textContent = "璁茶В涓?";
        startTalkingAnimation();
        startSpeechSyncedBubbleText(text, 118);

        audioApi.speak(text, {
            onBoundary: (event) => {
                syncSpeechBubbleToBoundary(text, event);
            },
            onEnd: () => {
                currentUtterance = null;
                voiceState.textContent = "寰呭懡";
                stopTalkingAnimation();
                stopStreamingText(text);
                endSpeechCompletion();
            },
            onError: () => {
                currentUtterance = null;
                voiceState.textContent = "璁茶В澶辫触";
                stopTalkingAnimation();
                stopStreamingText(text);
                endSpeechCompletion();
            }
        }).catch(() => {
            currentUtterance = null;
            voiceState.textContent = "璁茶В澶辫触";
            stopTalkingAnimation();
            stopStreamingText(text);
            endSpeechCompletion();
        });

        return;
    }

    if (!synth || typeof SpeechSynthesisUtterance === "undefined") {
        streamBubbleText(text, 118);
        voiceState.textContent = "当前浏览器不支持语音";
        return;
    }

    if (currentUtterance) {
        stopSpeech(true);
    }

    const utterance = new SpeechSynthesisUtterance(text);
    const voice = getChineseVoice();

    if (voice) {
        utterance.voice = voice;
    }

    if (voiceProfile && typeof voiceProfile.applyUtterance === "function") {
        voiceProfile.applyUtterance(utterance);
    } else {
        utterance.lang = "zh-CN";
        utterance.rate = 0.95;
        utterance.pitch = 1.18;
        utterance.volume = 1;
    }

    utterance.onstart = () => {
        currentUtterance = utterance;
        voiceState.textContent = "讲解中";
        startTalkingAnimation();
        if (live2dHostApi && typeof live2dHostApi.startLipSync === "function") {
            live2dHostApi.startLipSync(text);
        }
        startSpeechSyncedBubbleText(text, 118);
    };

    utterance.onboundary = (event) => {
        if (live2dHostApi && typeof live2dHostApi.handleSpeechBoundary === "function") {
            live2dHostApi.handleSpeechBoundary(event);
        }
        syncSpeechBubbleToBoundary(text, event);
    };

    utterance.onend = () => {
        currentUtterance = null;
        voiceState.textContent = "待命";
        stopTalkingAnimation();
        stopStreamingText(text);
    };

    utterance.onerror = () => {
        currentUtterance = null;
        voiceState.textContent = "讲解失败";
        stopTalkingAnimation();
        stopStreamingText(text);
    };

    synth.speak(utterance);
}

let demoRunId = 0;
const demoTimers = new Set();

function queueDemoDelay(delay) {
    return new Promise((resolve) => {
        const timer = window.setTimeout(() => {
            demoTimers.delete(timer);
            resolve();
        }, delay);
        demoTimers.add(timer);
    });
}

function clearDemoTimers() {
    demoTimers.forEach((timer) => window.clearTimeout(timer));
    demoTimers.clear();
}

async function waitForDemoSpeech(runId, extraDelay = 120, timeout = 30000) {
    const startedAt = Date.now();
    const speechDone = getSpeechCompletionPromise();

    while (runId === demoRunId && !isSpeaking() && Date.now() - startedAt < 800) {
        await queueDemoDelay(60);
    }

    const remaining = Math.max(0, timeout - (Date.now() - startedAt));
    if (remaining > 0) {
        await Promise.race([
            speechDone,
            queueDemoDelay(remaining)
        ]);
    }

    while (runId === demoRunId && isSpeaking() && Date.now() - startedAt < timeout) {
        await queueDemoDelay(80);
    }

    if (runId !== demoRunId) {
        throw new Error("demo-cancelled");
    }

    await queueDemoDelay(extraDelay);
}

function stopDemoPlayback() {
    demoRunId += 1;
    clearDemoTimers();
    window.clearTimeout(pulseTimer);
}

function applyDemoData(nextD, narration) {
    state.clock = 0;
    state.D = nextD;
    updateCircuit("keep", narration);
}

async function startDemoPlayback() {
    stopDemoPlayback();
    const runId = demoRunId;

    focusState.textContent = "自动演示";
    stepHint.textContent = "小芯正在自动演示 D 触发器，请观察数据输入、时钟上升沿和输出锁存之间的关系。";

    try {
        applyDemoData(0, "第一步，先把数据输入 D 保持在 0。这时还没有触发时钟，所以输出 Q 保持当前状态。");
        await waitForDemoSpeech(runId);

        if (runId !== demoRunId) {
            return;
        }
        applyDemoData(1, "现在把数据输入 D 调成 1。请注意，虽然输入已经变化，但只要没有时钟上升沿，Q 还不会立刻改变。");
        await waitForDemoSpeech(runId);

        if (runId !== demoRunId) {
            return;
        }
        triggerClockPulse();
        await waitForDemoSpeech(runId, 180);

        if (runId !== demoRunId) {
            return;
        }
        applyDemoData(0, "接着把 D 再改回 0，但这时不触发时钟，所以 Q 仍然保持刚才锁存下来的 1。");
        await waitForDemoSpeech(runId);

        if (runId !== demoRunId) {
            return;
        }
        triggerClockPulse();
        await waitForDemoSpeech(runId, 180);

        if (runId !== demoRunId) {
            return;
        }
        applyDemoData(1, "最后再把 D 改成 1，并准备再次发送时钟脉冲，重新锁存新的输入值。");
        await waitForDemoSpeech(runId);

        if (runId !== demoRunId) {
            return;
        }
        triggerClockPulse();
        await waitForDemoSpeech(runId, 180);

        if (runId !== demoRunId) {
            return;
        }

        focusState.textContent = "自动演示完成";
        stepHint.textContent = "D 触发器整套演示已完成。你可以继续自己修改 D 并触发时钟，观察输出锁存过程。";
        speak("整个 D 触发器实验已经演示完成。你现在可以自己继续操作。");
    } catch (_error) {
        // ignore cancellation
    }
}

const mentorTitle = document.querySelector(".mentor-bubble h2");
if (mentorTitle) {
    mentorTitle.textContent = "实验助手“小芯”";
}

window.__experimentVoiceHooks = {
    getExperimentName() {
        return "实验四：D触发器";
    },
    getExperimentState() {
        return {
            D: state.D,
            clock: state.clock,
            Q: state.Q,
            notQ: state.Q === 1 ? 0 : 1,
            latchedValue: state.latchedValue,
            stepHint: stepHint ? stepHint.textContent : "",
            focusState: focusState ? focusState.textContent : "",
            voiceState: voiceState ? voiceState.textContent : "",
            clockInfo: clockInfo ? clockInfo.textContent : "",
            latchedInfo: latchedInfo ? latchedInfo.textContent : "",
            edgeIndicator: edgeIndicator ? edgeIndicator.textContent : "",
            explanation: `当前 D=${state.D}，CLK=${state.clock}，Q=${state.Q}，Q'=${state.Q === 1 ? 0 : 1}。`
        };
    },
    interrupt() {
        stopDemoPlayback();
        stopSpeech(true);
    },
    startDemo() {
        return startDemoPlayback();
    },
    setVoiceStatus(text) {
        voiceState.textContent = text;
    },
    setFocusStatus(text) {
        focusState.textContent = text;
    },
    setStepHint(text) {
        stepHint.textContent = text;
    }
};

renderTruthTable();
updateCircuit("keep");
waitForVoiceReady().then(() => {
    playIntro();
});
