const page = document.getElementById("page");
const mentorStage = document.getElementById("mentorStage");
const bubbleText = document.getElementById("bubbleText");
const voiceState = document.getElementById("voiceState");
const focusState = document.getElementById("focusState");
const stepHint = document.getElementById("stepHint");
const binaryCode = document.getElementById("binaryCode");
const activeChannelText = document.getElementById("activeChannelText");
const summaryCode = document.getElementById("summaryCode");
const summaryChannel = document.getElementById("summaryChannel");
const truthTableBody = document.getElementById("truthTableBody");
const valueA2 = document.getElementById("valueA2");
const valueA1 = document.getElementById("valueA1");
const valueA0 = document.getElementById("valueA0");
const wireValueA2 = document.getElementById("wireValueA2");
const wireValueA1 = document.getElementById("wireValueA1");
const wireValueA0 = document.getElementById("wireValueA0");
const btnA2 = document.getElementById("btnA2");
const btnA1 = document.getElementById("btnA1");
const btnA0 = document.getElementById("btnA0");
const replayBtn = document.getElementById("replayBtn");
const introBtn = document.getElementById("introBtn");
const outputRows = document.querySelectorAll(".output-row");
const mouth = document.getElementById("mouth");
const live2dHostApi = window.__live2dHostApi || null;
const audioApi = window.__digitalHumanAudioApi || null;
const voiceProfile = window.__digitalHumanVoiceProfile || null;

const synth = window.speechSynthesis;
let currentUtterance = null;
let talkTimer = null;
let streamTimer = null;
let mentorExpressionTimer = null;
let pendingMentorExpression = null;
let speechCompletionResolve = null;
let speechCompletionPromise = Promise.resolve();

const state = {
    A2: 0,
    A1: 0,
    A0: 0
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

const assemblyEncouragementTexts = [
    "没关系，接线时出一点小偏差很正常，你已经很接近正确答案了，我们再试一次。",
    "别着急，这一步很多同学都会接反，按端子对应关系再连一次就好。",
    "这次差一点点就成功了，稳住节奏重新连，小芯继续陪你。"
];

function getAssemblyEncouragementText() {
    const index = Math.floor(Math.random() * assemblyEncouragementTexts.length);
    return assemblyEncouragementTexts[index];
}

function playMentorEncourageExpression(duration = 5600) {
    if (!live2dHostApi || typeof live2dHostApi.playExpression !== "function") {
        return;
    }

    live2dHostApi.playExpression("encourage", duration);
}

function clearQueuedMentorExpression() {
    if (mentorExpressionTimer) {
        window.clearTimeout(mentorExpressionTimer);
        mentorExpressionTimer = null;
    }

    pendingMentorExpression = null;
}

function queueMentorEncourageExpressionAfterSpeech(duration = 5600, delay = 260) {
    clearQueuedMentorExpression();

    pendingMentorExpression = {
        type: "encourage",
        duration,
        delay
    };
    return;

    beginSpeechCompletion();
    streamBubbleText(text, 118);
    voiceState.textContent = "浜戠璇煶鏆傛椂涓嶅彲鐢紝宸叉樉绀烘枃瀛楄瑙?";
    flushPendingMentorExpression();
    endSpeechCompletion();
    return;

    if (!synth || typeof SpeechSynthesisUtterance === "undefined") {
        mentorExpressionTimer = window.setTimeout(() => {
            playMentorEncourageExpression(duration);
            mentorExpressionTimer = null;
        }, delay);
        return;
    }

    pendingMentorExpression = {
        type: "encourage",
        duration,
        delay
    };
}

function flushPendingMentorExpression() {
    if (!pendingMentorExpression) {
        return;
    }

    const { type, duration, delay } = pendingMentorExpression;
    pendingMentorExpression = null;

    mentorExpressionTimer = window.setTimeout(() => {
        if (type === "encourage") {
            playMentorEncourageExpression(duration);
        }
        mentorExpressionTimer = null;
    }, delay);
}

function clearMentorExpression() {
    if (!live2dHostApi || typeof live2dHostApi.clearExpression !== "function") {
        return;
    }

    live2dHostApi.clearExpression();
}

function buildEncouragingAssemblyError(errorText) {
    return `${errorText}${getAssemblyEncouragementText()}`;
}

function getBinaryCode() {
    return `${state.A2}${state.A1}${state.A0}`;
}

function getActiveIndex() {
    return state.A2 * 4 + state.A1 * 2 + state.A0;
}

function buildOutputs() {
    const activeIndex = getActiveIndex();
    return Array.from({ length: 8 }, (_, index) => (index === activeIndex ? 1 : 0));
}

function syncLampBanks(outputs) {
    document.querySelectorAll(".lampbank-module").forEach((module) => {
        module.querySelectorAll(".lamp[data-lamp-index]").forEach((lamp) => {
            const index = Number(lamp.dataset.lampIndex);
            lamp.classList.toggle("on", outputs[index] === 1);
        });
    });
}

function renderTruthTable() {
    truthTableBody.innerHTML = "";

    for (let index = 0; index < 8; index += 1) {
        const a2 = Math.floor(index / 4);
        const a1 = Math.floor((index % 4) / 2);
        const a0 = index % 2;
        const row = document.createElement("tr");
        row.id = `row-${a2}${a1}${a0}`;
        row.innerHTML = `<td>${a2}</td><td>${a1}</td><td>${a0}</td><td>Y${index}</td><td>仅 Y${index} = 1</td>`;
        truthTableBody.appendChild(row);
    }
}

function highlightTruthRow() {
    document.querySelectorAll("#truthTableBody tr").forEach((row) => {
        row.classList.remove("active-row");
    });

    const activeRow = document.getElementById(`row-${getBinaryCode()}`);
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

    clearQueuedMentorExpression();
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
        flushPendingMentorExpression();
    };

    utterance.onerror = () => {
        currentUtterance = null;
        voiceState.textContent = "讲解失败";
        stopTalkingAnimation();
        stopStreamingText(text);
        clearQueuedMentorExpression();
    };

    synth.speak(utterance);
}

function updateSwitchStyle(button, value) {
    button.classList.toggle("on", value === 1);
    button.classList.toggle("off", value === 0);
}

function buildResultExplain() {
    const code = getBinaryCode();
    const activeIndex = getActiveIndex();
    return `当前输入编码是 ${code}。三八译码器会把这个三位二进制编码翻译成唯一的一路输出，所以现在被点亮的是 Y${activeIndex}，其余输出保持为 0。`;
}

function updateCircuit(speakText = "") {
    const code = getBinaryCode();
    const activeIndex = getActiveIndex();
    const outputs = buildOutputs();

    valueA2.textContent = state.A2;
    valueA1.textContent = state.A1;
    valueA0.textContent = state.A0;
    wireValueA2.textContent = state.A2;
    wireValueA1.textContent = state.A1;
    wireValueA0.textContent = state.A0;
    binaryCode.textContent = `当前编码：${code}`;
    activeChannelText.textContent = `当前点亮：Y${activeIndex}`;
    summaryCode.textContent = code;
    summaryChannel.textContent = `Y${activeIndex}`;

    updateSwitchStyle(btnA2, state.A2);
    updateSwitchStyle(btnA1, state.A1);
    updateSwitchStyle(btnA0, state.A0);

    ["A2", "A1", "A0"].forEach((key) => {
        const wire = document.getElementById(`wire${key}`);
        if (wire && wire.parentElement) {
            wire.parentElement.classList.toggle("active", state[key] === 1);
        }
    });

    outputs.forEach((value, index) => {
        const wire = document.getElementById(`wireY${index}`);
        const led = document.getElementById(`ledY${index}`);
        const row = document.querySelector(`.output-row[data-output="${index}"]`);

        if (wire && wire.parentElement) {
            wire.parentElement.classList.toggle("active", value === 1);
        }
        if (led) {
            led.classList.toggle("on", value === 1);
        }
        if (row) {
            row.classList.toggle("active-output", value === 1);
        }
    });

    syncLampBanks(outputs);

    highlightTruthRow();
    renderAssemblyBuilder();
    clearMentorExpression();

    if (speakText) {
        speak(speakText);
    }
}

function describeInputChange(inputKey) {
    const activeIndex = getActiveIndex();
    const code = getBinaryCode();
    const text = `${inputKey} 已切换为 ${state[inputKey]}。现在三位输入组成的编码是 ${code}，所以译码器会选通输出 Y${activeIndex}。你可以继续切换其他输入位，观察选通通道如何改变。`;
    stepHint.textContent = `你刚刚修改了 ${inputKey}。当前编码是 ${code}，继续调整其余输入位，看看高亮通道是否按顺序变化。`;
    focusState.textContent = `${inputKey} 输入更新`;
    updateCircuit(text);
}

function toggleInput(inputKey) {
    state[inputKey] = state[inputKey] === 1 ? 0 : 1;
    describeInputChange(inputKey);
}

function playIntro() {
    const text = "欢迎进入实验三，三八译码器仿真。你可以通过切换 A2、A1、A0 三位输入，让译码器从八路输出中唯一选中一路。每次输入变化后，我都会告诉你当前编码对应的是哪一个输出通道。";
    stepHint.textContent = "实验介绍已播放。现在请点击任意输入开关，观察 Y0 到 Y7 的点亮变化。";
    focusState.textContent = "实验介绍";
    updateCircuit(text);
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

btnA2.addEventListener("click", () => toggleInput("A2"));
btnA1.addEventListener("click", () => toggleInput("A1"));
btnA0.addEventListener("click", () => toggleInput("A0"));

outputRows.forEach((row) => {
    row.addEventListener("click", () => {
        const index = Number(row.dataset.output);
        const code = index.toString(2).padStart(3, "0");
        const text = `这一行是输出 Y${index}。只有当输入编码正好等于 ${code} 时，它才会被译码器选通点亮。`;
        focusState.textContent = `查看 Y${index}`;
        stepHint.textContent = `你正在查看输出 Y${index}。试着把输入调成 ${code}，验证它是否会被点亮。`;
        speak(text);
    });
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
                flushPendingMentorExpression();
                endSpeechCompletion();
            },
            onError: () => {
                currentUtterance = null;
                voiceState.textContent = "璁茶В澶辫触";
                stopTalkingAnimation();
                stopStreamingText(text);
                flushPendingMentorExpression();
                endSpeechCompletion();
            }
        }).catch(() => {
            currentUtterance = null;
            voiceState.textContent = "璁茶В澶辫触";
            stopTalkingAnimation();
            stopStreamingText(text);
            flushPendingMentorExpression();
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

function applyDemoCode(code, narration) {
    state.A2 = Number(code[0]);
    state.A1 = Number(code[1]);
    state.A0 = Number(code[2]);
    updateCircuit(narration);
}

async function startDemoPlayback() {
    stopDemoPlayback();
    const runId = demoRunId;

    focusState.textContent = "自动演示";
    stepHint.textContent = "小芯正在自动演示三八译码器，请观察不同输入编码如何选通不同输出通道。";

    const steps = [
        ["000", "先看编码 000，这时三八译码器会点亮 Y0。"],
        ["001", "接着切换到 001，选通通道就移动到 Y1。"],
        ["010", "当输入变成 010 时，被点亮的输出变成 Y2。"],
        ["011", "输入继续变成 011，现在选通的是 Y3。"],
        ["100", "当最高位变成 1，编码 100 会对应点亮 Y4。"],
        ["101", "接下来是 101，对应的输出通道会变成 Y5。"],
        ["110", "输入变成 110 时，译码器会选通 Y6。"],
        ["111", "最后输入 111，对应最后一条输出通道 Y7。这样一位有效的选通规律就完整演示了一遍。"]
    ];

    try {
        for (const [code, narration] of steps) {
            if (runId !== demoRunId) {
                return;
            }

            applyDemoCode(code, narration);
            await waitForDemoSpeech(runId);
        }

        if (runId !== demoRunId) {
            return;
        }

        focusState.textContent = "自动演示完成";
        stepHint.textContent = "三八译码器整套演示已完成。你可以继续自己切换三位输入，观察 Y0 到 Y7 的点亮顺序。";
        speak("整个三八译码器实验已经演示完成。你可以继续自己操作验证。");
    } catch (_error) {
        // ignore cancellation
    }
}

function getAssemblyPartCard(partId) {
    return assemblyPartCards.find((card) => card.dataset.part === partId) || null;
}

function getAssemblySlot(slotId) {
    return assemblySlots.find((slot) => slot.dataset.slot === slotId) || null;
}

async function previewAssemblyPlacement(partId, slotId, delay = 320) {
    const card = getAssemblyPartCard(partId);
    const slot = getAssemblySlot(slotId);

    if (card) {
        card.classList.add("is-dragging");
    }
    if (slot) {
        slot.classList.add("is-target");
    }

    await queueDemoDelay(delay);

    if (card) {
        card.classList.remove("is-dragging");
    }
    if (slot) {
        slot.classList.remove("is-target");
    }
}

async function narrateAssemblyPlacement(runId, partId, narration) {
    if (runId !== demoRunId) {
        throw new Error("demo-cancelled");
    }

    await previewAssemblyPlacement(partId, partId, 280);
    handleAssemblyPlacement(partId, partId);
    stepHint.textContent = narration;
    if (assemblyHint) {
        assemblyHint.textContent = narration;
    }
    speak(narration);
    await waitForDemoSpeech(runId);
}

async function narrateAssemblyConnection(runId, fromPort, toPort, narration) {
    if (runId !== demoRunId) {
        throw new Error("demo-cancelled");
    }

    handleAssemblyPortClick(fromPort);
    await queueDemoDelay(180);

    if (runId !== demoRunId) {
        throw new Error("demo-cancelled");
    }

    handleAssemblyPortClick(toPort);
    stepHint.textContent = narration;
    if (assemblyHint) {
        assemblyHint.textContent = narration;
    }
    speak(narration);
    await waitForDemoSpeech(runId);
}

async function startAssemblyDemoPlayback() {
    stopDemoPlayback();
    const runId = demoRunId;

    resetAssemblyBuilder();
    focusState.textContent = "实验台自动演示";
    stepHint.textContent = "小芯正在自动演示实验台的拼装与连线过程，请观察器件放置和接线顺序。";
    if (assemblyHint) {
        assemblyHint.textContent = stepHint.textContent;
    }

    try {
        await narrateAssemblyPlacement(runId, "input-a2", "第一步，把 A2 输入开关拖到左上角安装位，让最高位输入先就位。");
        await narrateAssemblyPlacement(runId, "input-a1", "第二步，把 A1 输入开关放到中间安装位，形成三位输入中的第二位。");
        await narrateAssemblyPlacement(runId, "input-a0", "第三步，把 A0 输入开关安装到下方，让三位输入端全部准备完成。");
        await narrateAssemblyPlacement(runId, "decoder-chip", "第四步，把三八译码器核心芯片放到中央区域，作为整个实验台的控制核心。");
        await narrateAssemblyPlacement(runId, "output-bank", "第五步，把输出灯组拖到右侧，后面译码结果就会在这组灯上显示出来。");

        await narrateAssemblyConnection(runId, "a2-out", "decoder-a2", "接下来开始连线，先把 A2 开关输出端接到译码器的 A2 输入端。");
        await narrateAssemblyConnection(runId, "a1-out", "decoder-a1", "然后把 A1 开关输出端接到译码器的 A1 输入端。");
        await narrateAssemblyConnection(runId, "a0-out", "decoder-a0", "再把 A0 开关输出端接到译码器的 A0 输入端，三路地址输入就都接好了。");
        await narrateAssemblyConnection(runId, "decoder-y", "output-in", "最后把译码器输出总线接到灯组输入端，这样译码结果就能同步显示到右侧灯组。");

        if (runId !== demoRunId) {
            return;
        }

        focusState.textContent = "实验台演示完成";
        stepHint.textContent = "实验台的拼装与连线已经演示完成。现在你可以继续切换 A2、A1、A0，观察灯组选通结果。";
        if (assemblyHint) {
            assemblyHint.textContent = stepHint.textContent;
        }
        speak("实验台部分已经演示完成。现在你可以自己继续切换三位输入，观察灯组从 Y0 到 Y7 的选通变化。");
    } catch (_error) {
        // ignore cancellation
    }
}

const assemblyBuilder = document.getElementById("assemblyBuilder");
const assemblyProgress = document.getElementById("assemblyProgress");
const assemblyHint = document.getElementById("assemblyHint");
const assemblyCode = document.getElementById("assemblyCode");
const assemblyActive = document.getElementById("assemblyActive");
const resetAssemblyBtn = document.getElementById("resetAssemblyBtn");
const assemblyPartCards = Array.from(document.querySelectorAll(".part-card[data-part]"));
const assemblySlots = Array.from(document.querySelectorAll(".assembly-slot[data-slot]"));

const assemblyPartMeta = {
    "input-a2": {
        label: "A2 开关"
    },
    "input-a1": {
        label: "A1 开关"
    },
    "input-a0": {
        label: "A0 开关"
    },
    "decoder-chip": {
        label: "3-8 译码器"
    },
    "output-bank": {
        label: "Y0-Y7 灯组"
    }
};

const assemblyState = {
    placed: {}
};

let draggingAssemblyPart = "";

function getAssemblyPlacedCount() {
    return Object.keys(assemblyState.placed).length;
}

getAssemblySlotValue = function getAssemblySlotValueExt(partId) {
    switch (partId) {
        case "input-a2":
            return `A2 已接入，当前值 ${state.A2}`;
        case "input-a1":
            return `A1 已接入，当前值 ${state.A1}`;
        case "input-a0":
            return `A0 已接入，当前值 ${state.A0}`;
        case "decoder-chip":
            return `3-8 译码器已就位`;
        case "output-bank":
            return `灯组已接入，当前点亮 Y${getActiveIndex()}`;
        default:
            return "";
    }
};

clearAssemblySlotStates = function clearAssemblySlotStatesExt() {
    assemblySlots.forEach((slot) => {
        slot.classList.remove("is-target", "is-wrong");
    });
};

renderAssemblyBuilder = function renderAssemblyBuilderExt() {
    if (!assemblyBuilder) {
        return;
    }

    const placedCount = getAssemblyPlacedCount();
    const isComplete = placedCount === assemblyPartCards.length;

    assemblyBuilder.dataset.complete = isComplete ? "true" : "false";

    if (assemblyProgress) {
        assemblyProgress.textContent = `已拼接 ${placedCount} / ${assemblyPartCards.length}`;
    }

    if (assemblyCode) {
        assemblyCode.textContent = getBinaryCode();
    }

    if (assemblyActive) {
        assemblyActive.textContent = `Y${getActiveIndex()}`;
    }

    if (assemblyHint) {
        assemblyHint.textContent = isComplete
            ? "拼接完成，可以继续切换输入验证选通结果"
            : "等待拖拽元器件";
    }

    assemblyPartCards.forEach((card) => {
        const partId = card.dataset.part;
        const placed = Boolean(assemblyState.placed[partId]);
        card.classList.toggle("is-placed", placed);
        card.draggable = !placed;
        card.setAttribute("aria-disabled", placed ? "true" : "false");
    });

    assemblySlots.forEach((slot) => {
        const slotId = slot.dataset.slot;
        const placed = Boolean(assemblyState.placed[slotId]);
        const valueNode = slot.querySelector("[data-slot-value]");

        slot.classList.toggle("is-filled", placed);
        if (valueNode) {
            valueNode.textContent = placed ? getAssemblySlotValue(slotId) : "";
        }
    });
};

handleAssemblyPlacement = function handleAssemblyPlacementExt(partId, slotId) {
    const meta = assemblyPartMeta[partId];
    if (!meta) {
        return;
    }

    if (partId !== slotId) {
        stepHint.textContent = `${meta.label} 还没有放到正确位置。请把它拖到对应的拼接槽位。`;
        focusState.textContent = "拖拽拼接";
        return;
    }

    if (assemblyState.placed[partId]) {
        return;
    }

    assemblyState.placed[partId] = true;
    renderAssemblyBuilder();

    const isComplete = getAssemblyPlacedCount() === assemblyPartCards.length;
    focusState.textContent = isComplete ? "拼接完成" : "拖拽拼接";
    stepHint.textContent = isComplete
        ? "太好了，三八译码器拼接完成。现在你可以继续切换输入，观察画布和译码器联动。"
        : `已完成 ${meta.label} 的拼接。继续把剩余元器件拖到正确位置。`;
};

resetAssemblyBuilder = function resetAssemblyBuilderExt() {
    assemblyState.placed = {};
    draggingAssemblyPart = "";
    clearAssemblySlotStates();
    renderAssemblyBuilder();
    focusState.textContent = "拼接画布";
    stepHint.textContent = "拖拽拼接区已重置。把 A2、A1、A0、译码器和输出灯组拖到正确位置。";
};

assemblyPartCards.forEach((card) => {
    card.addEventListener("dragstart", (event) => {
        if (card.classList.contains("is-placed")) {
            event.preventDefault();
            return;
        }

        draggingAssemblyPart = card.dataset.part || "";
        card.classList.add("is-dragging");
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", draggingAssemblyPart);
    });

    card.addEventListener("dragend", () => {
        draggingAssemblyPart = "";
        card.classList.remove("is-dragging");
        clearAssemblySlotStates();
    });
});

assemblySlots.forEach((slot) => {
    slot.addEventListener("dragover", (event) => {
        const partId = draggingAssemblyPart || event.dataTransfer.getData("text/plain");
        if (!partId) {
            return;
        }

        event.preventDefault();
        slot.classList.toggle("is-target", slot.dataset.slot === partId);
        slot.classList.toggle("is-wrong", slot.dataset.slot !== partId);
    });

    slot.addEventListener("dragleave", () => {
        slot.classList.remove("is-target", "is-wrong");
    });

    slot.addEventListener("drop", (event) => {
        event.preventDefault();
        const partId = draggingAssemblyPart || event.dataTransfer.getData("text/plain");
        clearAssemblySlotStates();

        if (!partId) {
            return;
        }

        handleAssemblyPlacement(partId, slot.dataset.slot || "");
    });
});

if (resetAssemblyBtn) {
    resetAssemblyBtn.addEventListener("click", () => {
        resetAssemblyBuilder();
    });
}

const mentorTitle = document.querySelector(".mentor-bubble h2");
if (mentorTitle) {
    mentorTitle.textContent = "实验助手“小芯”";
}

window.__experimentVoiceHooks = {
    getExperimentName() {
        return "实验三：三八译码器";
    },
    getExperimentState() {
        return {
            A2: state.A2,
            A1: state.A1,
            A0: state.A0,
            binaryCode: getBinaryCode(),
            activeChannel: `Y${getActiveIndex()}`
        };
    },
    interrupt() {
        stopDemoPlayback();
        stopSpeech(true);
    },
    startDemo() {
        return startDemoPlayback();
    },
    startAssemblyDemo() {
        return startAssemblyDemoPlayback();
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

const assemblyCanvasExt = document.getElementById("assemblyCanvas");
const assemblyWiresExt = document.getElementById("assemblyWires");
const wiringProgressExt = document.getElementById("wiringProgress");
const assemblyPortNodesExt = Array.from(document.querySelectorAll(".port-node[data-port]"));

assemblyPartMeta["input-a2"].label = "A2 开关";
assemblyPartMeta["input-a1"].label = "A1 开关";
assemblyPartMeta["input-a0"].label = "A0 开关";
assemblyPartMeta["decoder-chip"].label = "3-8 译码器";
assemblyPartMeta["output-bank"].label = "Y0-Y7 灯组";

assemblyState.connections = {};
assemblyState.selectedPort = "";
assemblyState.completionNarrated = false;

const assemblyPortOwnersExt = {
    "a2-out": "input-a2",
    "a1-out": "input-a1",
    "a0-out": "input-a0",
    "decoder-a2": "decoder-chip",
    "decoder-a1": "decoder-chip",
    "decoder-a0": "decoder-chip",
    "decoder-y": "decoder-chip",
    "output-in": "output-bank"
};

const assemblyWiringRulesExt = [
    { id: "wire-a2", from: "a2-out", to: "decoder-a2", type: "input-wire", label: "A2 接到译码器 A2" },
    { id: "wire-a1", from: "a1-out", to: "decoder-a1", type: "input-wire", label: "A1 接到译码器 A1" },
    { id: "wire-a0", from: "a0-out", to: "decoder-a0", type: "input-wire", label: "A0 接到译码器 A0" },
    { id: "wire-output", from: "decoder-y", to: "output-in", type: "output-wire", label: "译码器输出接到灯组" }
];

const assemblyPortLabelsExt = {
    "a2-out": "A2 开关输出端",
    "a1-out": "A1 开关输出端",
    "a0-out": "A0 开关输出端",
    "decoder-a2": "译码器 A2 输入端",
    "decoder-a1": "译码器 A1 输入端",
    "decoder-a0": "译码器 A0 输入端",
    "decoder-y": "译码器输出总线",
    "output-in": "灯组输入端"
};

function getAssemblyPortLabel(portId) {
    return assemblyPortLabelsExt[portId] || portId;
}

function getExpectedPortPartner(portId) {
    const matchedRule = assemblyWiringRulesExt.find((rule) => rule.from === portId || rule.to === portId);
    if (!matchedRule) {
        return "";
    }

    return matchedRule.from === portId ? matchedRule.to : matchedRule.from;
}

function buildAssemblyConnectionError(selectedPortId, targetPortId) {
    const firstLabel = getAssemblyPortLabel(selectedPortId);
    const secondLabel = getAssemblyPortLabel(targetPortId);
    const firstExpected = getExpectedPortPartner(selectedPortId);
    const secondExpected = getExpectedPortPartner(targetPortId);
    const firstExpectedLabel = getAssemblyPortLabel(firstExpected);
    const secondExpectedLabel = getAssemblyPortLabel(secondExpected);
    const selectedOwner = assemblyPortOwnersExt[selectedPortId];
    const targetOwner = assemblyPortOwnersExt[targetPortId];

    if (selectedPortId === "decoder-y" || targetPortId === "decoder-y") {
        return "译码器输出总线不能接到输入端子上。它只能从译码器输出端接到灯组输入端。";
    }

    if (selectedPortId === "output-in" || targetPortId === "output-in") {
        return "灯组输入端不能直接接开关输出端。请先把 A2、A1、A0 接到译码器，再把译码器输出总线接到灯组。";
    }

    if (
        (selectedOwner && selectedOwner.startsWith("input-")) &&
        (targetOwner && targetOwner.startsWith("input-"))
    ) {
        return `${firstLabel} 不能和 ${secondLabel} 直接相连。三个开关输出端都应该分别接到译码器对应的输入端。`;
    }

    if (selectedOwner === "decoder-chip" && targetOwner === "decoder-chip") {
        return `${firstLabel} 不能和 ${secondLabel} 在译码器内部直接短接。A2、A1、A0 是独立输入端，输出总线也要单独接到灯组。`;
    }

    if (firstExpected && firstExpected !== targetPortId) {
        return `${firstLabel} 接错了，它不应该接到 ${secondLabel}。正确做法是把它接到 ${firstExpectedLabel}。`;
    }

    if (secondExpected && secondExpected !== selectedPortId) {
        return `${secondLabel} 接错了，它不应该接到 ${firstLabel}。正确做法是把它接到 ${secondExpectedLabel}。`;
    }

    return `${firstLabel} 不能直接接到 ${secondLabel}。请按照 A2 对 A2、A1 对 A1、A0 对 A0 的顺序接入译码器，再把译码器输出总线接到灯组。`;
}

function getAssemblyConnectionCount() {
    return Object.keys(assemblyState.connections).length;
}

function isAssemblyReadyForWiring() {
    return getAssemblyPlacedCount() === assemblyPartCards.length;
}

function getAssemblyRuleForPorts(firstPort, secondPort) {
    return assemblyWiringRulesExt.find((rule) => {
        return (
            (rule.from === firstPort && rule.to === secondPort) ||
            (rule.from === secondPort && rule.to === firstPort)
        );
    }) || null;
}

function getAssemblyConnectionByPort(portId) {
    return assemblyWiringRulesExt.find((rule) => {
        return Boolean(assemblyState.connections[rule.id]) && (rule.from === portId || rule.to === portId);
    }) || null;
}

function getAssemblyPortNode(portId) {
    return assemblyPortNodesExt.find((node) => node.dataset.port === portId) || null;
}

function isAssemblyPortAvailable(portId) {
    const owner = assemblyPortOwnersExt[portId];
    return Boolean(owner && assemblyState.placed[owner]);
}

getAssemblySlotValue = function getAssemblySlotValueOverride(partId) {
    switch (partId) {
        case "input-a2":
            return `A2=${state.A2}`;
        case "input-a1":
            return `A1=${state.A1}`;
        case "input-a0":
            return `A0=${state.A0}`;
        case "decoder-chip":
            return "74HC138";
        case "output-bank":
            return `Y${getActiveIndex()} 亮`;
        default:
            return "";
    }
};

clearAssemblySlotStates = function clearAssemblySlotStatesOverride() {
    assemblySlots.forEach((slot) => {
        slot.classList.remove("is-target", "is-wrong");
    });
};

function clearAssemblyPortSelection() {
    assemblyState.selectedPort = "";
}

function createAssemblyWirePath(startX, startY, endX, endY) {
    const distance = Math.max(48, Math.abs(endX - startX) * 0.42);
    return `M ${startX} ${startY} C ${startX + distance} ${startY}, ${endX - distance} ${endY}, ${endX} ${endY}`;
}

function getAssemblyPortCenter(portNode) {
    if (!assemblyCanvasExt || !portNode || !portNode.offsetParent) {
        return null;
    }

    const canvasRect = assemblyCanvasExt.getBoundingClientRect();
    const portRect = portNode.getBoundingClientRect();

    return {
        x: portRect.left - canvasRect.left + portRect.width / 2,
        y: portRect.top - canvasRect.top + portRect.height / 2
    };
}

function renderAssemblyWires() {
    if (!assemblyCanvasExt || !assemblyWiresExt) {
        return;
    }

    const width = assemblyCanvasExt.clientWidth;
    const height = assemblyCanvasExt.clientHeight;
    assemblyWiresExt.setAttribute("viewBox", `0 0 ${width} ${height}`);

    const defs = `
        <defs>
            <linearGradient id="wireInputGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#66f8ff"></stop>
                <stop offset="100%" stop-color="#7fffc0"></stop>
            </linearGradient>
            <linearGradient id="wireOutputGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#ffbe5c"></stop>
                <stop offset="100%" stop-color="#ffd996"></stop>
            </linearGradient>
        </defs>
    `;

    const paths = assemblyWiringRulesExt.map((rule) => {
        if (!assemblyState.connections[rule.id]) {
            return "";
        }

        const fromPoint = getAssemblyPortCenter(getAssemblyPortNode(rule.from));
        const toPoint = getAssemblyPortCenter(getAssemblyPortNode(rule.to));

        if (!fromPoint || !toPoint) {
            return "";
        }

        return `<path class="assembly-wire ${rule.type}" d="${createAssemblyWirePath(fromPoint.x, fromPoint.y, toPoint.x, toPoint.y)}"></path>`;
    }).join("");

    assemblyWiresExt.innerHTML = defs + paths;
}

renderAssemblyBuilder = function renderAssemblyBuilderOverride() {
    if (!assemblyBuilder) {
        return;
    }

    const placedCount = getAssemblyPlacedCount();
    const connectionCount = getAssemblyConnectionCount();
    const allPlaced = placedCount === assemblyPartCards.length;
    const isComplete = allPlaced && connectionCount === assemblyWiringRulesExt.length;

    assemblyBuilder.dataset.complete = isComplete ? "true" : "false";
    assemblyBuilder.dataset.readyForWiring = allPlaced ? "true" : "false";
    assemblyBuilder.dataset.wiringComplete = connectionCount === assemblyWiringRulesExt.length ? "true" : "false";

    if (assemblyProgress) {
        assemblyProgress.textContent = `已拼装 ${placedCount} / ${assemblyPartCards.length}`;
    }

    if (wiringProgressExt) {
        wiringProgressExt.textContent = `已连线 ${connectionCount} / ${assemblyWiringRulesExt.length}`;
    }

    if (assemblyCode) {
        assemblyCode.textContent = getBinaryCode();
    }

    if (assemblyActive) {
        assemblyActive.textContent = `Y${getActiveIndex()}`;
    }

    if (assemblyHint) {
        if (!allPlaced) {
            assemblyHint.textContent = "等待拖拽器件";
        } else if (!connectionCount) {
            assemblyHint.textContent = "器件已就位，请点击端子开始连线";
        } else if (!isComplete) {
            assemblyHint.textContent = `已完成 ${connectionCount} 条连线，继续接好剩余线路`;
        } else {
            assemblyHint.textContent = "拼装和连线都完成了，可以继续切换输入验证结果";
        }
    }

    assemblyPartCards.forEach((card) => {
        const partId = card.dataset.part;
        const placed = Boolean(assemblyState.placed[partId]);
        card.classList.toggle("is-placed", placed);
        card.draggable = !placed;
        card.setAttribute("aria-disabled", placed ? "true" : "false");
    });

    assemblySlots.forEach((slot) => {
        const slotId = slot.dataset.slot;
        const placed = Boolean(assemblyState.placed[slotId]);
        const valueNode = slot.querySelector("[data-slot-value]");

        slot.classList.toggle("is-filled", placed);
        if (valueNode) {
            valueNode.textContent = placed ? getAssemblySlotValue(slotId) : "";
        }
    });

    assemblyPortNodesExt.forEach((node) => {
        const portId = node.dataset.port || "";
        node.disabled = !isAssemblyPortAvailable(portId);
        node.classList.toggle("is-selected", assemblyState.selectedPort === portId);
        node.classList.toggle("is-connected", Boolean(getAssemblyConnectionByPort(portId)));
    });

    renderAssemblyWires();

    if (isComplete && !assemblyState.completionNarrated) {
        assemblyState.completionNarrated = true;
        speak("线路已经连接完成了。现在整个三八译码器实验台已经组装成功，你可以继续切换输入，观察译码结果。");
    } else if (!isComplete) {
        assemblyState.completionNarrated = false;
    }
};

handleAssemblyPlacement = function handleAssemblyPlacementOverride(partId, slotId) {
    const meta = assemblyPartMeta[partId];
    if (!meta) {
        return;
    }

    if (partId !== slotId) {
        stepHint.textContent = `${meta.label} 还没有放到正确位置，请把它拖到对应的安装位。`;
        focusState.textContent = "拖拽拼装";
        return;
    }

    if (assemblyState.placed[partId]) {
        return;
    }

    assemblyState.placed[partId] = true;
    renderAssemblyBuilder();

    const allPlaced = getAssemblyPlacedCount() === assemblyPartCards.length;
    focusState.textContent = allPlaced ? "拼装完成" : "拖拽拼装";
    stepHint.textContent = allPlaced
        ? "器件已经全部摆好。下一步请点击端子，把三路输入和输出总线接起来。"
        : `已完成 ${meta.label} 的安装，继续把剩余器件拖到正确位置。`;
};

resetAssemblyBuilder = function resetAssemblyBuilderOverride() {
    assemblyState.placed = {};
    assemblyState.connections = {};
    assemblyState.selectedPort = "";
    assemblyState.completionNarrated = false;
    draggingAssemblyPart = "";
    clearAssemblySlotStates();
    renderAssemblyBuilder();
    focusState.textContent = "拼装画布";
    stepHint.textContent = "实验台已重置。先把 A2、A1、A0、译码器和灯组拖到位，再开始连线。";
};

function removeAssemblyConnection(rule) {
    if (!rule || !assemblyState.connections[rule.id]) {
        return;
    }

    delete assemblyState.connections[rule.id];
    clearAssemblyPortSelection();
    renderAssemblyBuilder();
    focusState.textContent = "实验连线";
    stepHint.textContent = `已断开 ${rule.label}，你可以重新连接这一段线路。`;
}

function handleAssemblyPortClickOverride(portId) {
    if (!isAssemblyReadyForWiring()) {
        focusState.textContent = "拖拽拼装";
        stepHint.textContent = "请先把全部器件拖到实验台上，再开始端子连线。";
        return;
    }

    if (!isAssemblyPortAvailable(portId)) {
        return;
    }

    const existingConnection = getAssemblyConnectionByPort(portId);
    if (existingConnection && !assemblyState.selectedPort) {
        removeAssemblyConnection(existingConnection);
        return;
    }

    if (!assemblyState.selectedPort) {
        assemblyState.selectedPort = portId;
        renderAssemblyBuilder();
        focusState.textContent = "实验连线";
        stepHint.textContent = "端子已选中，请再点击一个匹配端子完成连线。";
        return;
    }

    if (assemblyState.selectedPort === portId) {
        clearAssemblyPortSelection();
        renderAssemblyBuilder();
        focusState.textContent = "实验连线";
        stepHint.textContent = "已取消当前端子选择。";
        return;
    }

    if (getAssemblyConnectionByPort(assemblyState.selectedPort) || getAssemblyConnectionByPort(portId)) {
        clearAssemblyPortSelection();
        renderAssemblyBuilder();
        focusState.textContent = "实验连线";
        stepHint.textContent = "这个端子已经有线路连接了，点击已连接端子可以先拆线。";
        return;
    }

    const rule = getAssemblyRuleForPorts(assemblyState.selectedPort, portId);
    if (!rule) {
        const errorText = buildAssemblyConnectionError(assemblyState.selectedPort, portId);
        const feedbackText = buildEncouragingAssemblyError(errorText);
        clearAssemblyPortSelection();
        renderAssemblyBuilder();
        focusState.textContent = "接线检查";
        stepHint.textContent = "这两个端子不能直接相连，请按照 A2、A1、A0 对应译码器输入，再把译码器输出接到灯组。";
        return;
    }

    assemblyState.connections[rule.id] = true;
    clearAssemblyPortSelection();
    renderAssemblyBuilder();
    clearMentorExpression();
    focusState.textContent = "实验连线";
    stepHint.textContent = getAssemblyConnectionCount() === assemblyWiringRulesExt.length
        ? "所有线路都已经接好。现在可以切换输入位，观察灯组点亮通道的变化。"
        : `已连接 ${rule.label}，继续完成剩余连线。`;
}

function handleAssemblyPortClick(portId) {
    if (!isAssemblyReadyForWiring()) {
        focusState.textContent = "拖拽拼装";
        stepHint.textContent = "请先把全部器件拖到实验台上，再开始端子连线。";
        if (assemblyHint) {
            assemblyHint.textContent = stepHint.textContent;
        }
        return;
    }

    if (!isAssemblyPortAvailable(portId)) {
        return;
    }

    const existingConnection = getAssemblyConnectionByPort(portId);
    if (existingConnection && !assemblyState.selectedPort) {
        removeAssemblyConnection(existingConnection);
        return;
    }

    if (!assemblyState.selectedPort) {
        assemblyState.selectedPort = portId;
        renderAssemblyBuilder();
        focusState.textContent = "实验连线";
        stepHint.textContent = "端子已选中，请再点击一个匹配端子完成连线。";
        if (assemblyHint) {
            assemblyHint.textContent = stepHint.textContent;
        }
        return;
    }

    if (assemblyState.selectedPort === portId) {
        clearAssemblyPortSelection();
        renderAssemblyBuilder();
        focusState.textContent = "实验连线";
        stepHint.textContent = "已取消当前端子选择。";
        if (assemblyHint) {
            assemblyHint.textContent = stepHint.textContent;
        }
        return;
    }

    if (getAssemblyConnectionByPort(assemblyState.selectedPort) || getAssemblyConnectionByPort(portId)) {
        clearAssemblyPortSelection();
        renderAssemblyBuilder();
        focusState.textContent = "实验连线";
        stepHint.textContent = "这个端子已经有线路连接了，点击已连接端子可以先拆线。";
        if (assemblyHint) {
            assemblyHint.textContent = stepHint.textContent;
        }
        return;
    }

    const rule = getAssemblyRuleForPorts(assemblyState.selectedPort, portId);
    if (!rule) {
        const errorText = buildAssemblyConnectionError(assemblyState.selectedPort, portId);
        const feedbackText = buildEncouragingAssemblyError(errorText);
        clearAssemblyPortSelection();
        renderAssemblyBuilder();
        focusState.textContent = "连线检查";
        stepHint.textContent = feedbackText;
        if (assemblyHint) {
            assemblyHint.textContent = feedbackText;
        }
        speak(feedbackText);
        queueMentorEncourageExpressionAfterSpeech();
        return;
    }

    assemblyState.connections[rule.id] = true;
    clearAssemblyPortSelection();
    renderAssemblyBuilder();
    focusState.textContent = "实验连线";
    stepHint.textContent = getAssemblyConnectionCount() === assemblyWiringRulesExt.length
        ? "所有线路都已经接好。现在可以切换输入位，观察灯组点亮通道的变化。"
        : `已连接 ${rule.label}，继续完成剩余连线。`;
    if (assemblyHint) {
        assemblyHint.textContent = stepHint.textContent;
    }
}

function handleAssemblyPortClickActive(portId) {
    if (!isAssemblyReadyForWiring()) {
        focusState.textContent = "拖拽拼装";
        stepHint.textContent = "请先把全部器件拖到实验台上，再开始端子连线。";
        if (assemblyHint) {
            assemblyHint.textContent = stepHint.textContent;
        }
        return;
    }

    if (!isAssemblyPortAvailable(portId)) {
        return;
    }

    const existingConnection = getAssemblyConnectionByPort(portId);
    if (existingConnection && !assemblyState.selectedPort) {
        removeAssemblyConnection(existingConnection);
        return;
    }

    if (!assemblyState.selectedPort) {
        assemblyState.selectedPort = portId;
        renderAssemblyBuilder();
        focusState.textContent = "实验连线";
        stepHint.textContent = "端子已选中，请再点击一个匹配端子完成连线。";
        if (assemblyHint) {
            assemblyHint.textContent = stepHint.textContent;
        }
        return;
    }

    if (assemblyState.selectedPort === portId) {
        clearAssemblyPortSelection();
        renderAssemblyBuilder();
        focusState.textContent = "实验连线";
        stepHint.textContent = "已取消当前端子选择。";
        if (assemblyHint) {
            assemblyHint.textContent = stepHint.textContent;
        }
        return;
    }

    if (getAssemblyConnectionByPort(assemblyState.selectedPort) || getAssemblyConnectionByPort(portId)) {
        clearAssemblyPortSelection();
        renderAssemblyBuilder();
        focusState.textContent = "实验连线";
        stepHint.textContent = "这个端子已经有线路连接了，点击已连接端子可以先拆线。";
        if (assemblyHint) {
            assemblyHint.textContent = stepHint.textContent;
        }
        return;
    }

    const rule = getAssemblyRuleForPorts(assemblyState.selectedPort, portId);
    if (!rule) {
        const errorText = buildAssemblyConnectionError(assemblyState.selectedPort, portId);
        const feedbackText = buildEncouragingAssemblyError(errorText);
        clearAssemblyPortSelection();
        renderAssemblyBuilder();
        focusState.textContent = "连线检查";
        stepHint.textContent = feedbackText;
        if (assemblyHint) {
            assemblyHint.textContent = feedbackText;
        }
        speak(feedbackText);
        queueMentorEncourageExpressionAfterSpeech();
        return;
    }

    assemblyState.connections[rule.id] = true;
    clearAssemblyPortSelection();
    renderAssemblyBuilder();
    focusState.textContent = "实验连线";

    const successText = getAssemblyConnectionCount() === assemblyWiringRulesExt.length
        ? "所有线路都已经接好。现在可以切换输入位，观察灯组点亮通道的变化。"
        : `已连接 ${rule.label}，继续完成剩余连线。`;

    stepHint.textContent = successText;
    if (assemblyHint) {
        assemblyHint.textContent = successText;
    }
    speak(successText);
}

assemblyPortNodesExt.forEach((node) => {
    node.addEventListener("click", () => {
        handleAssemblyPortClick(node.dataset.port || "");
    });
});

window.addEventListener("resize", () => {
    window.requestAnimationFrame(renderAssemblyWires);
});

if (mentorTitle) {
    mentorTitle.textContent = "实验助手“小芯”";
}

window.__experimentVoiceHooks.getExperimentName = function getExperimentName() {
    return "实验三：三八译码器";
};

window.__experimentVoiceHooks.getExperimentState = function getExperimentState() {
    return {
        A2: state.A2,
        A1: state.A1,
        A0: state.A0,
        binaryCode: getBinaryCode(),
        activeChannel: `Y${getActiveIndex()}`,
        assemblyPlaced: getAssemblyPlacedCount(),
        assemblyConnected: getAssemblyConnectionCount(),
        assemblyReady: isAssemblyReadyForWiring(),
        assemblySelectedPort: assemblyState.selectedPort || "",
        assemblyCompleted: getAssemblyConnectionCount() === assemblyWiringRulesExt.length,
        assemblyWiringProgress: `${getAssemblyConnectionCount()}/${assemblyWiringRulesExt.length}`,
        assemblyPlacementProgress: `${getAssemblyPlacedCount()}/${assemblyPartCards.length}`,
        stepHint: stepHint ? stepHint.textContent : "",
        assemblyHint: assemblyHint ? assemblyHint.textContent : "",
        focusState: focusState ? focusState.textContent : "",
        voiceState: voiceState ? voiceState.textContent : "",
        outputs: buildOutputs()
    };
};

renderTruthTable();
updateCircuit();
renderAssemblyBuilder();
waitForVoiceReady().then(() => {
    playIntro();
});
