const page = document.getElementById("page");
const mentorStage = document.getElementById("mentorStage");
const bubbleText = document.getElementById("bubbleText");
const voiceState = document.getElementById("voiceState");
const focusState = document.getElementById("focusState");
const stepHint = document.getElementById("stepHint");
const sumValue = document.getElementById("sumValue");
const carryValue = document.getElementById("carryValue");
const truthTableBody = document.getElementById("truthTableBody");
const wireA = document.getElementById("wireA");
const wireB = document.getElementById("wireB");
const wireSum = document.getElementById("wireSum");
const wireCarry = document.getElementById("wireCarry");
const wireValueA = document.getElementById("wireValueA");
const wireValueB = document.getElementById("wireValueB");
const valueA = document.getElementById("valueA");
const valueB = document.getElementById("valueB");
const btnA = document.getElementById("btnA");
const btnB = document.getElementById("btnB");
const ledSum = document.getElementById("ledSum");
const ledCarry = document.getElementById("ledCarry");
const mouth = document.getElementById("mouth");
const live2dHostApi = window.__live2dHostApi || null;
const audioApi = window.__digitalHumanAudioApi || null;
const voiceProfile = window.__digitalHumanVoiceProfile || null;
const replayBtn = document.getElementById("replayBtn");
const introBtn = document.getElementById("introBtn");

const synth = window.speechSynthesis;
let currentUtterance = null;
let talkTimer = null;
let streamTimer = null;
let introText = "";
let speechCompletionResolve = null;
let speechCompletionPromise = Promise.resolve();

const state = {
    A: 0,
    B: 0
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

function calculateHalfAdder(a, b) {
    return {
        sum: a !== b ? 1 : 0,
        carry: a === 1 && b === 1 ? 1 : 0
    };
}

function renderTruthTable() {
    truthTableBody.innerHTML = "";

    [[0, 0], [0, 1], [1, 0], [1, 1]].forEach(([a, b]) => {
        const result = calculateHalfAdder(a, b);
        const row = document.createElement("tr");
        row.id = `row-${a}${b}`;
        row.innerHTML = `<td>${a}</td><td>${b}</td><td>${result.sum}</td><td>${result.carry}</td>`;
        truthTableBody.appendChild(row);
    });
}

function highlightTruthRow() {
    document.querySelectorAll("#truthTableBody tr").forEach((row) => {
        row.classList.remove("active-row");
    });

    const activeRow = document.getElementById(`row-${state.A}${state.B}`);
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
    const preferredKeywords = ["xiaoxiao", "xiaoyi", "xiaohan", "xiaomeng", "female", "女"];
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

function updateCircuit(speakText = "") {
    const result = calculateHalfAdder(state.A, state.B);

    valueA.textContent = state.A;
    valueB.textContent = state.B;
    wireValueA.textContent = state.A;
    wireValueB.textContent = state.B;
    sumValue.textContent = result.sum;
    carryValue.textContent = result.carry;

    updateSwitchStyle(btnA, state.A);
    updateSwitchStyle(btnB, state.B);

    wireA.parentElement.classList.toggle("active", state.A === 1);
    wireB.parentElement.classList.toggle("active", state.B === 1);
    wireSum.parentElement.classList.toggle("active", result.sum === 1);
    wireCarry.parentElement.classList.toggle("active", result.carry === 1);
    ledSum.classList.toggle("on", result.sum === 1);
    ledCarry.classList.toggle("on", result.carry === 1);

    renderTruthTable();
    highlightTruthRow();

    if (speakText) {
        speak(speakText);
    }
}

function buildResultExplain() {
    const result = calculateHalfAdder(state.A, state.B);
    return `当前输入 A 为 ${state.A}，输入 B 为 ${state.B}。半加器的和位 S 等于 ${result.sum}，进位 C 等于 ${result.carry}。也就是说，S 负责表示当前位的结果，C 负责表示是否向高位进 1。`;
}

function describeInputChange(inputKey) {
    const result = calculateHalfAdder(state.A, state.B);
    const text = `${inputKey === "A" ? "输入 A" : "输入 B"} 已切换为 ${state[inputKey]}。半加器里，和位 S 由异或门产生，进位 C 由与门产生。当前 S 为 ${result.sum}，C 为 ${result.carry}。`;
    stepHint.textContent = `你刚刚修改了输入 ${inputKey}。继续切换另一个输入，看看和位和进位会不会同时改变。`;
    focusState.textContent = `输入 ${inputKey} 已更新`;
    updateCircuit(text);
}

function toggleInput(inputKey) {
    state[inputKey] = state[inputKey] === 1 ? 0 : 1;
    describeInputChange(inputKey);
}

function playIntro() {
    introText = "欢迎进入实验二，半加器仿真。你将看到输入 A 和输入 B 经过异或门生成和位 S，经过与门生成进位 C。每次点击输入后，我都会解释为什么这两个输出会变化。";
    stepHint.textContent = "实验介绍已播放。现在请点击输入 A 或输入 B，开始观察和位与进位的联动。";
    focusState.textContent = "实验介绍";
    updateCircuit(introText);
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

btnA.addEventListener("click", () => toggleInput("A"));
btnB.addEventListener("click", () => toggleInput("B"));

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
}

function applyDemoState(config, narration) {
    if (typeof config.A === "number") {
        state.A = config.A;
    }

    if (typeof config.B === "number") {
        state.B = config.B;
    }

    updateCircuit(narration);
}

async function startDemoPlayback() {
    stopDemoPlayback();
    const runId = demoRunId;

    focusState.textContent = "自动演示";
    stepHint.textContent = "小芯正在自动演示半加器实验，请观察和位 S 与进位 C 的联动。";

    const steps = [
        {
            A: 0,
            B: 0,
            narration: "第一步，先让 A 和 B 都为 0。这时和位 S 等于 0，进位 C 也等于 0。"
        },
        {
            A: 1,
            B: 0,
            narration: "接着把 A 调成 1，B 保持 0。两个输入不同，所以和位 S 变成 1，而进位 C 仍然是 0。"
        },
        {
            A: 1,
            B: 1,
            narration: "现在把 B 也调成 1。此时两个输入相同，所以和位 S 回到 0，但因为两个输入都为 1，进位 C 变成 1。"
        },
        {
            A: 0,
            B: 1,
            narration: "最后把 A 调回 0，只保留 B 为 1。这样又回到输入不同的情况，所以 S 等于 1，C 等于 0。"
        }
    ];

    try {
        for (const step of steps) {
            if (runId !== demoRunId) {
                return;
            }

            applyDemoState(step, step.narration);
            await waitForDemoSpeech(runId);
        }

        if (runId !== demoRunId) {
            return;
        }

        focusState.textContent = "自动演示完成";
        stepHint.textContent = "半加器整套演示已完成。你可以继续自己切换输入，比较和位与进位的变化规律。";
        speak("整个半加器实验已经演示完成。你现在可以自己继续操作。");
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
        return "实验二：半加器";
    },
    getExperimentState() {
        const result = calculateHalfAdder(state.A, state.B);
        return {
            A: state.A,
            B: state.B,
            sum: result.sum,
            carry: result.carry,
            binaryInputs: `${state.A}${state.B}`,
            binaryOutput: `${result.carry}${result.sum}`,
            stepHint: stepHint ? stepHint.textContent : "",
            focusState: focusState ? focusState.textContent : "",
            voiceState: voiceState ? voiceState.textContent : "",
            explanation: `当前 A=${state.A}，B=${state.B}，和位 S=${result.sum}，进位 C=${result.carry}。`
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
updateCircuit();
waitForVoiceReady().then(() => {
    playIntro();
});
