const page = document.getElementById("page");
const avatarStage = document.getElementById("avatarStage");
const modeLabel = document.getElementById("modeLabel");
const bubbleText = document.getElementById("bubbleText");
const currentExperiment = document.getElementById("currentExperiment");
const voiceState = document.getElementById("voiceState");
const interactionState = document.getElementById("interactionState");
const previewTitle = document.getElementById("previewTitle");
const previewLevel = document.getElementById("previewLevel");
const previewDescription = document.getElementById("previewDescription");
const previewPoints = document.getElementById("previewPoints");
const readoutMode = document.getElementById("readoutMode");
const readoutSpeech = document.getElementById("readoutSpeech");
const readoutRecommend = document.getElementById("readoutRecommend");
const readoutNext = document.getElementById("readoutNext");
const speakBtn = document.getElementById("speakBtn");
const pulseBtn = document.getElementById("pulseBtn");
const guideIntro = document.getElementById("guideIntro");
const live2dHostApi = window.__live2dHostApi || null;
const audioApi = window.__digitalHumanAudioApi || null;
const voiceProfile = window.__digitalHumanVoiceProfile || null;
const experimentCards = document.querySelectorAll(".experiment-card");

const assistantLog = document.getElementById("assistantLog");
const assistantInput = document.getElementById("assistantInput");
const assistantSuggestions = document.getElementById("assistantSuggestions");
const assistantSendBtn = document.getElementById("assistantSendBtn");
const assistantSpeechToTextBtn = document.getElementById("assistantSpeechToTextBtn");
const assistantVoiceBtn = document.getElementById("assistantVoiceBtn");
const assistantVoiceStopBtn = document.getElementById("assistantVoiceStopBtn");
const assistantInlineStatus = document.getElementById("assistantInlineStatus");
const voiceWakeStatus = document.getElementById("voiceWakeStatus");
const voiceRecognizeHint = document.getElementById("voiceRecognizeHint");
const assistantQuestionChips = document.querySelectorAll("[data-assistant-question]");
const signalBadge = document.getElementById("signalBadge");
const signalCabinText = document.getElementById("signalCabinText");
const signalModeValue = document.getElementById("signalModeValue");
const signalFreqValue = document.getElementById("signalFreqValue");
const signalFocusValue = document.getElementById("signalFocusValue");
const challengeTitle = document.getElementById("challengeTitle");
const challengeTag = document.getElementById("challengeTag");
const challengeQuestion = document.getElementById("challengeQuestion");
const challengeClues = document.getElementById("challengeClues");
const challengeAnswer = document.getElementById("challengeAnswer");
const challengeRevealBtn = document.getElementById("challengeRevealBtn");
const challengeNextBtn = document.getElementById("challengeNextBtn");
const emotionPanel = document.getElementById("emotionPanel");
const emotionLabel = document.getElementById("emotionLabel");
const emotionConfidence = document.getElementById("emotionConfidence");
const emotionSourceText = document.getElementById("emotionSourceText");
const emotionSourceVoice = document.getElementById("emotionSourceVoice");
const emotionSourceBehavior = document.getElementById("emotionSourceBehavior");
const emotionStrategy = document.getElementById("emotionStrategy");
const emotionOutput = document.getElementById("emotionOutput");

const synth = window.speechSynthesis || null;
const RecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition || null;
const assistantApiBase = window.location.port === "3010" ? "" : "http://127.0.0.1:3010";
const interruptAliases = [
    "\u7b49\u4e00\u4e0b",
    "\u505c\u4e00\u4e0b",
    "\u5148\u522b\u8bf4\u4e86",
    "\u6253\u65ad\u4e00\u4e0b",
    "\u6682\u505c\u4e00\u4e0b",
    "\u7b49\u4f1a",
    "\u505c"
];
const interruptAliasPattern = /(\u7b49\u4e00\u4e0b|\u505c\u4e00\u4e0b|\u5148\u522b\u8bf4\u4e86|\u6253\u65ad\u4e00\u4e0b|\u6682\u505c\u4e00\u4e0b|\u7b49\u4f1a|\u505c)/gu;
const voiceModeStorageKey = "xiaoxin_voice_mode_enabled";
const assistantSessionStorageKey = "xiaoxin_home_assistant_session";
const wakeAliases = ["小芯小芯", "小芯", "小新小新", "小新", "晓芯晓芯", "晓芯", "晓欣晓欣", "晓欣", "小心小心", "小心"];
const wakeAliasPattern = /(小芯小芯|小芯|小新小新|小新|晓芯晓芯|晓芯|晓欣晓欣|晓欣|小心小心|小心)/gu;

let currentKey = "gate";
let currentUtterance = null;
let talkTimer = null;
let streamTimer = null;
let speechTextSyncTimer = null;
let callbackTimer = null;
let speechSession = 0;
let voiceReady = false;

let assistantAbortController = null;
let wakeRecognition = null;
let questionRecognition = null;
let manualSpeechRecognition = null;
let wakeResumeTimer = null;
let interruptFollowupTimer = null;
let wakeRecognitionMode = "full";
let voiceModeEnabled = window.localStorage.getItem(voiceModeStorageKey) === "1";
let wakeAutoStartAttempted = false;
let challengeIndexMap = {
    gate: 0,
    halfAdder: 0,
    decoder: 0,
    flipFlop: 0
};
let liveAnswerState = null;
let assistantLastQuestion = "";
let currentEmotionState = null;
let pendingVoiceTranscript = "";
const emotionBehaviorState = {
    hintCount: 0,
    questionCount: 0,
    repeatedCount: 0,
    failureCount: 0,
    lastNormalizedQuestion: ""
};
const assistantSessionId = getOrCreateAssistantSessionId(assistantSessionStorageKey, "home");
const assistantSuggestionPool = Array.from(
    new Set([
        ...Array.from(assistantQuestionChips).map((chip) => chip.dataset.assistantQuestion || ""),
        "非门和与门有什么区别",
        "为什么非门只需要一个输入",
        "半加器为什么同时有和位和进位",
        "三八译码器怎么接线才不会出错",
        "D触发器为什么要等上升沿",
        "帮我梳理一下这四个实验的区别"
    ].filter(Boolean))
);

const experiments = {
    gate: {
        title: "基础逻辑门实验",
        shortTitle: "基础逻辑门",
        level: "难度：入门",
        recommend: "优先制作",
        next: "讲解后自动进入",
        description: "通过切换输入并选择与门、或门、非门、异或门，直观看到不同逻辑规则的输出变化，适合作为平台的第一个实验。",
        points: ["双输入切换", "输出灯联动", "真值表高亮"],
        speech: "你当前选中的是基础逻辑门实验。这个实验会展示与门、或门、非门和异或门的输入输出关系。讲解结束后，我会自动带你进入实验一界面，开始真正的交互仿真。",
        path: "experiment-gate.html"
    },
    halfAdder: {
        title: "半加器实验",
        shortTitle: "半加器",
        level: "难度：基础",
        recommend: "推荐制作",
        next: "讲解后自动进入",
        description: "观察两个输入位相加后，和位 S 与进位 C 是如何同时产生的，帮助理解二进制加法的基本过程。",
        points: ["和位显示", "进位显示", "加法解释"],
        speech: "你当前选中的是半加器实验。这个实验会让你看到输入 A 和输入 B 相加之后，和位 S 与进位 C 是怎样形成的。讲解结束后，我会自动带你进入实验二界面，观察半加器的输出联动。",
        path: "experiment-half-adder.html"
    },
    decoder: {
        title: "三八译码器实验",
        shortTitle: "三八译码器",
        level: "难度：基础进阶",
        recommend: "展示效果强",
        next: "讲解后自动进入",
        description: "三位输入编码会在八路输出中点亮一路，适合做出直观、好看的信号选通效果，便于理解译码过程。",
        points: ["输入编码", "输出选通", "通道点亮"],
        speech: "你当前选中的是三八译码器实验。这个实验会让三位输入决定八路输出中的哪一路被点亮，视觉反馈非常清晰。讲解结束后，我会自动带你进入实验三界面。",
        path: "experiment-decoder.html"
    },
    flipFlop: {
        title: "D 触发器实验",
        shortTitle: "D 触发器",
        level: "难度：进阶",
        recommend: "后续拓展",
        next: "讲解后自动进入",
        description: "观察时钟到来时输入数据如何被锁存到输出，帮助用户建立时序电路的基本直觉。",
        points: ["时钟脉冲", "数据锁存", "输出保持"],
        speech: "你当前选中的是 D 触发器实验。这个实验会重点展示时钟到来时数据被锁存的过程，适合作为时序逻辑的入门体验。讲解结束后，我会自动带你进入实验四界面。",
        path: "experiment-flip-flop.html"
    }
};

const assistantExperimentNames = {
    gate: "实验一：基础逻辑门",
    halfAdder: "实验二：半加器",
    decoder: "实验三：三八译码器",
    flipFlop: "实验四：D 触发器"
};

const signalCabinPresets = {
    gate: {
        badge: "组合逻辑",
        text: "当前以基础逻辑门为主，脉冲节奏更直接，重点观察输入组合如何立刻映射到输出。",
        mode: "Logic Gate",
        freq: "2.4 kHz",
        focus: "A / B / Y"
    },
    halfAdder: {
        badge: "位运算",
        text: "当前进入半加器观察模式，信号会更强调和位与进位的同步出现关系。",
        mode: "Half Adder",
        freq: "3.1 kHz",
        focus: "S / C / Carry"
    },
    decoder: {
        badge: "选通译码",
        text: "当前脉冲舱会模拟一位有效输出，帮助你形成译码器只点亮一路的视觉记忆。",
        mode: "Decoder 3-8",
        freq: "4.8 kHz",
        focus: "A2 / A1 / A0"
    },
    flipFlop: {
        badge: "时序锁存",
        text: "当前切换到时序节奏，重点突出时钟边沿到来后数据被锁存的过程。",
        mode: "D Flip-Flop",
        freq: "1.6 kHz",
        focus: "D / CLK / Q"
    }
};

const challengeBank = {
    gate: [
        {
            title: "基础热身题",
            tag: "实验一",
            question: "如果 A=1，B=0，那么与门的输出是什么？",
            clues: ["先看输入组合", "只有全为 1 才输出 1"],
            answer: "答案：0。与门只有在所有输入都为 1 时才会输出 1。"
        },
        {
            title: "异或判断题",
            tag: "实验一",
            question: "当 A=1，B=0 时，异或门的输出是多少？",
            clues: ["异或看是否不同", "不同则输出 1"],
            answer: "答案：1。异或门在两个输入不相同时输出 1。"
        }
    ],
    halfAdder: [
        {
            title: "和位推断题",
            tag: "实验二",
            question: "半加器中 A=1，B=1 时，和位 S 是多少？",
            clues: ["和位对应异或", "1 XOR 1 等于 0"],
            answer: "答案：0。半加器的和位 S 由异或门产生，所以 1 与 1 的和位为 0。"
        },
        {
            title: "进位观察题",
            tag: "实验二",
            question: "半加器里哪一种输入组合会让进位 C 变成 1？",
            clues: ["进位对应与门", "只有双 1 时成立"],
            answer: "答案：A=1 且 B=1。因为进位 C 来自与门输出。"
        }
    ],
    decoder: [
        {
            title: "单路点亮题",
            tag: "实验三",
            question: "三八译码器在任意一个输入组合下，通常会点亮几路输出？",
            clues: ["译码器负责选通", "不是多路同时亮"],
            answer: "答案：一路。三八译码器会根据输入组合选通唯一的一路输出。"
        },
        {
            title: "编码理解题",
            tag: "实验三",
            question: "如果输入编码改变，最直观的现象是什么？",
            clues: ["看输出灯位置", "亮点会切换通道"],
            answer: "答案：被点亮的输出通道会切换到另一条线路。"
        }
    ],
    flipFlop: [
        {
            title: "时钟边沿题",
            tag: "实验四",
            question: "为什么 D 触发器不能像与门那样立刻跟着输入变化？",
            clues: ["它属于时序逻辑", "要等时钟触发"],
            answer: "答案：因为 D 触发器需要等到时钟边沿到来时，才会把输入数据锁存到输出。"
        },
        {
            title: "锁存记忆题",
            tag: "实验四",
            question: "如果时钟没有到来，Q 会不会立即跟着 D 改变？",
            clues: ["想想锁存条件", "没有时钟就先保持"],
            answer: "答案：通常不会。没有触发边沿时，Q 会保持上一次被锁存的状态。"
        }
    ]
};

function buildPreviewPoints(items) {
    if (!previewPoints) {
        return;
    }

    previewPoints.innerHTML = "";
    items.forEach((item) => {
        const tag = document.createElement("span");
        tag.textContent = item;
        previewPoints.appendChild(tag);
    });
}

function setGuideMode(isSpeaking) {
    if (!page) {
        return;
    }

    page.classList.remove("mode-standby", "mode-guide", "mode-speaking");

    if (isSpeaking) {
        page.classList.add("mode-speaking");
        if (modeLabel) {
            modeLabel.textContent = "当前状态：正在讲解";
        }
        if (voiceState) {
            voiceState.textContent = "讲解中";
        }
        if (readoutSpeech) {
            readoutSpeech.textContent = "讲解中";
        }
        if (interactionState) {
            interactionState.textContent = "语音动画已开启";
        }
        return;
    }

    page.classList.add("mode-guide");
    if (modeLabel) {
        modeLabel.textContent = "当前状态：实验讲解";
    }
    if (voiceState) {
        voiceState.textContent = voiceReady ? "待命" : "语音未就绪";
    }
    if (readoutSpeech) {
        readoutSpeech.textContent = voiceReady ? "待命" : "暂不可用";
    }
    if (interactionState) {
        interactionState.textContent = "目光跟随已开启";
    }
}

function isSpeaking() {
    return Boolean(
        (audioApi && typeof audioApi.isSpeaking === "function" && audioApi.isSpeaking())
        || (synth && (synth.speaking || synth.pending || currentUtterance))
    );
}

function stopTalkingAnimation() {
    window.clearInterval(talkTimer);
    talkTimer = null;

    if (live2dHostApi && typeof live2dHostApi.stopLipSync === "function") {
        live2dHostApi.stopLipSync();
    }

    if (live2dHostApi && typeof live2dHostApi.forceCloseMouth === "function") {
        live2dHostApi.forceCloseMouth();
    }
}

function startTalkingAnimation() {
    window.clearInterval(talkTimer);
    talkTimer = null;
}

function stopStreamingText(finalText = "") {
    window.clearTimeout(streamTimer);
    streamTimer = null;
    window.clearTimeout(speechTextSyncTimer);
    speechTextSyncTimer = null;

    if (bubbleText) {
        bubbleText.classList.remove("is-streaming");
        if (finalText) {
            bubbleText.textContent = finalText;
        }
        bubbleText.scrollTop = bubbleText.scrollHeight;
    }
}

function setStreamingBubbleText(text) {
    if (!bubbleText) {
        return;
    }

    bubbleText.textContent = text;
    bubbleText.classList.add("is-streaming");
    bubbleText.scrollTop = bubbleText.scrollHeight;
}

function getCharacterDelay(character, baseDelay) {
    if ("，、".includes(character)) {
        return baseDelay + 160;
    }

    if ("。！？；".includes(character)) {
        return baseDelay + 320;
    }

    if ("：".includes(character)) {
        return baseDelay + 220;
    }

    if (character === " ") {
        return Math.max(50, baseDelay - 10);
    }

    return baseDelay;
}

function streamBubbleText(text, baseDelay = 95) {
    stopStreamingText();

    if (!bubbleText) {
        return;
    }

    bubbleText.textContent = "";
    bubbleText.classList.add("is-streaming");

    const characters = Array.from(text);
    let index = 0;

    function pushNextCharacter() {
        if (!bubbleText) {
            return;
        }

        if (index >= characters.length) {
            stopStreamingText(text);
            return;
        }

        const nextCharacter = characters[index];
        index += 1;
        bubbleText.textContent = characters.slice(0, index).join("");

        streamTimer = window.setTimeout(() => {
            pushNextCharacter();
        }, getCharacterDelay(nextCharacter, baseDelay));
    }

    pushNextCharacter();
}

function startSpeechSyncedBubbleText(text, baseDelay = 126) {
    stopStreamingText();

    if (!bubbleText) {
        return;
    }

    const characters = Array.from(text);
    let index = 0;
    setStreamingBubbleText("");

    function pushNextCharacter() {
        if (!bubbleText || index >= characters.length) {
            return;
        }

        const nextCharacter = characters[index];
        index += 1;
        setStreamingBubbleText(characters.slice(0, index).join(""));

        if (index < characters.length) {
            speechTextSyncTimer = window.setTimeout(
                pushNextCharacter,
                getCharacterDelay(nextCharacter, baseDelay)
            );
        }
    }

    speechTextSyncTimer = window.setTimeout(pushNextCharacter, 180);
}

function syncSpeechBubbleToBoundary(text, event) {
    if (!bubbleText) {
        return;
    }

    window.clearTimeout(speechTextSyncTimer);
    speechTextSyncTimer = null;

    const characters = Array.from(text);
    const nextIndex = Math.min(
        characters.length,
        Math.max(1, Number(event?.charIndex ?? 0) + 1)
    );

    setStreamingBubbleText(characters.slice(0, nextIndex).join(""));
}

function getChineseVoice() {
    if (!synth) {
        voiceReady = false;
        return null;
    }

    if (voiceProfile && typeof voiceProfile.getPreferredVoice === "function") {
        const matchedVoice = voiceProfile.getPreferredVoice();
        voiceReady = synth.getVoices().length > 0;
        return matchedVoice;
    }

    const voices = synth.getVoices();
    const chineseVoices = voices.filter((voice) => voice.lang === "zh-CN" || voice.lang.includes("zh"));
    const preferredKeywords = ["xiaoxiao", "xiaoyi", "xiaohan", "xiaomeng", "tingting", "female"];
    const matchedVoice = chineseVoices.find((voice) => {
        const name = voice.name.toLowerCase();
        return preferredKeywords.some((keyword) => name.includes(keyword));
    }) || chineseVoices[0] || null;

    voiceReady = voices.length > 0;
    return matchedVoice;
}

function clearWakeResumeTimer() {
    window.clearTimeout(wakeResumeTimer);
    wakeResumeTimer = null;
}

function clearInterruptFollowupTimer() {
    window.clearTimeout(interruptFollowupTimer);
    interruptFollowupTimer = null;
}

function queueInterruptFollowup(callback) {
    clearInterruptFollowupTimer();
    interruptFollowupTimer = window.setTimeout(() => {
        interruptFollowupTimer = null;
        callback();
    }, 350);
}

function stopRecognitionInstance(recognition) {
    if (!recognition) {
        return;
    }

    recognition.onstart = null;
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;

    try {
        recognition.stop();
    } catch (_error) {
        // ignore
    }
}

function pauseVoiceRecognition() {
    clearWakeResumeTimer();
    clearInterruptFollowupTimer();

    if (wakeRecognition) {
        stopRecognitionInstance(wakeRecognition);
        wakeRecognition = null;
        wakeRecognitionMode = "full";
    }

    if (questionRecognition) {
        stopRecognitionInstance(questionRecognition);
        questionRecognition = null;
    }

    if (manualSpeechRecognition) {
        stopRecognitionInstance(manualSpeechRecognition);
        manualSpeechRecognition = null;
    }

    if (assistantSpeechToTextBtn) {
        assistantSpeechToTextBtn.classList.remove("is-listening");
        assistantSpeechToTextBtn.textContent = "语音转文字";
    }
}

function queueWakeRecognition(delay = 250, mode = "full") {
    clearWakeResumeTimer();

    if (!voiceModeEnabled || !RecognitionCtor || document.hidden || questionRecognition || manualSpeechRecognition) {
        return;
    }

    if (
        mode === "full"
        && (
            currentUtterance
            || isSpeaking()
            || assistantAbortController
            || (liveAnswerState && (liveAnswerState.speakingSegment || !liveAnswerState.finalized))
        )
    ) {
        return;
    }

    wakeResumeTimer = window.setTimeout(() => {
        startWakeRecognition(true, mode);
    }, delay);
}

function stopSpeech(resetBubble = false) {
    speechSession += 1;
    window.clearTimeout(callbackTimer);
    callbackTimer = null;
    clearInterruptFollowupTimer();
    liveAnswerState = null;

    if (synth && (synth.speaking || synth.pending)) {
        synth.cancel();
    }

    if (audioApi && typeof audioApi.stop === "function") {
        audioApi.stop();
    }

    currentUtterance = null;
    stopTalkingAnimation();
    stopStreamingText(resetBubble ? "" : bubbleText ? bubbleText.textContent : "");
    setGuideMode(false);
}

function applyVoiceSettings(utterance) {
    const voice = getChineseVoice();

    if (voice) {
        utterance.voice = voice;
    }

    if (voiceProfile && typeof voiceProfile.applyUtterance === "function") {
        voiceProfile.applyUtterance(utterance);
        return;
    }

    utterance.lang = "zh-CN";
    utterance.rate = 0.9;
    utterance.pitch = 1.22;
    utterance.volume = 1;
}

function detectUserEmotion(text) {
    const emotionApi = window.__digitalHumanEmotion;
    if (!emotionApi || typeof emotionApi.detectText !== "function") {
        return {
            label: "neutral",
            confidence: 0.35,
            source: "fallback"
        };
    }

    return emotionApi.detectText(text);
}

function rewriteReplyWithEmotion(text, emotion) {
    const emotionApi = window.__digitalHumanEmotion;
    if (!emotionApi || typeof emotionApi.rewriteReply !== "function") {
        return text;
    }

    return emotionApi.rewriteReply(text, emotion);
}

function getEmotionSpeechOptions(emotion) {
    const emotionApi = window.__digitalHumanEmotion;
    if (!emotionApi || typeof emotionApi.speechOptions !== "function") {
        return {
            playbackRate: 1,
            browserRate: 0.92,
            browserPitch: 1.18,
            expression: "neutral"
        };
    }

    return emotionApi.speechOptions(emotion);
}

function applyDigitalHumanEmotion(emotion, duration = 3600) {
    const emotionApi = window.__digitalHumanEmotion;
    if (!emotionApi || typeof emotionApi.applyExpression !== "function") {
        return false;
    }

    return emotionApi.applyExpression(emotion, duration);
}

function readEmotionLabel(emotion) {
    if (!emotion) {
        return "未输入";
    }

    if (emotion.inactive) {
        return "未启用";
    }

    const profile = emotion.profile || {};
    const label = profile.label || emotion.label || "中性";
    const confidence = Math.round(Number(emotion.confidence || 0) * 100);
    return `${label} ${confidence}%`;
}

function updateEmotionDashboard(state) {
    if (!state) {
        return;
    }

    if (emotionPanel) {
        emotionPanel.dataset.emotion = state.label || "neutral";
    }
    if (emotionLabel) {
        emotionLabel.textContent = state.labelText || "中性";
    }
    if (emotionConfidence) {
        emotionConfidence.textContent = `${Math.round(Number(state.confidence || 0.35) * 100)}%`;
    }
    if (emotionSourceText) {
        emotionSourceText.textContent = readEmotionLabel(state.sources?.text);
    }
    if (emotionSourceVoice) {
        emotionSourceVoice.textContent = readEmotionLabel(state.sources?.voice);
    }
    if (emotionSourceBehavior) {
        emotionSourceBehavior.textContent = readEmotionLabel(state.sources?.behavior);
    }
    if (emotionStrategy) {
        emotionStrategy.textContent = `教学策略：${state.strategy || "正常讲解"}`;
    }
    if (emotionOutput) {
        emotionOutput.textContent = `输出方式：${state.output || "默认表情 / 正常语速 / 按流程讲解"}`;
    }
    if (interactionState) {
        interactionState.textContent = state.strategy || "目光跟随已开启";
    }
}

function createMultimodalEmotionState(text, options = {}) {
    const emotionApi = window.__digitalHumanEmotion;
    if (!emotionApi || typeof emotionApi.buildState !== "function") {
        return detectUserEmotion(text);
    }

    const normalizedQuestion = normalizeAssistantKeyword(text);
    emotionBehaviorState.questionCount += 1;
    if (normalizedQuestion && normalizedQuestion === emotionBehaviorState.lastNormalizedQuestion) {
        emotionBehaviorState.repeatedCount += 1;
    }
    emotionBehaviorState.lastNormalizedQuestion = normalizedQuestion;

    const isVoiceInput = options.inputMode === "voice" || (pendingVoiceTranscript && pendingVoiceTranscript === String(text || "").trim());
    const textEmotion = emotionApi.detectText(text);
    const voiceEmotion = typeof emotionApi.detectVoice === "function"
        ? emotionApi.detectVoice(text, {
            enabled: isVoiceInput || voiceModeEnabled,
            fromWake: options.fromWake,
            interrupted: options.interrupted
        })
        : null;
    const behaviorEmotion = typeof emotionApi.detectBehavior === "function"
        ? emotionApi.detectBehavior(emotionBehaviorState)
        : null;

    const state = emotionApi.buildState({
        text: textEmotion,
        voice: voiceEmotion,
        behavior: behaviorEmotion
    });

    updateEmotionDashboard(state);
    return state;
}

function refreshBehaviorEmotionDashboard() {
    const emotionApi = window.__digitalHumanEmotion;
    if (!emotionApi || typeof emotionApi.buildState !== "function") {
        return;
    }

    const behaviorEmotion = typeof emotionApi.detectBehavior === "function"
        ? emotionApi.detectBehavior(emotionBehaviorState)
        : null;
    const state = emotionApi.buildState({
        text: currentEmotionState?.sources?.text || null,
        voice: currentEmotionState?.sources?.voice || {
            label: "neutral",
            confidence: 0,
            source: "voice",
            inactive: true
        },
        behavior: behaviorEmotion
    });

    currentEmotionState = state;
    updateEmotionDashboard(state);
    applyDigitalHumanEmotion(state, 4200);
}

function beginLiveAnswerStream() {
    const sessionId = ++speechSession;

    liveAnswerState = {
        sessionId,
        displayText: "",
        spokenCursor: 0,
        visualCursor: 0,
        activeSegmentStart: 0,
        queue: [],
        speakingSegment: false,
        finalized: false,
        emotion: currentEmotionState
    };

    if (bubbleText) {
        bubbleText.textContent = "";
        bubbleText.classList.add("is-streaming");
    }

    setGuideMode(true);
    return liveAnswerState;
}

function renderLiveAnswerBubble(state) {
    if (!state || !bubbleText) {
        return;
    }

    bubbleText.textContent = state.displayText.slice(0, state.visualCursor);
    bubbleText.classList.add("is-streaming");
    bubbleText.scrollTop = bubbleText.scrollHeight;
}

function collectSpeakableSegments(state, forceFlush = false) {
    if (!state) {
        return;
    }

    const pendingText = state.displayText.slice(state.spokenCursor);

    if (!pendingText) {
        return;
    }

    const matcher = /.+?[。！？；\n]/g;
    let match;
    let consumed = 0;

    while ((match = matcher.exec(pendingText)) !== null) {
        const segment = match[0].replace(/\s+/g, " ").trim();
        consumed = match.index + match[0].length;

        if (segment) {
            state.queue.push(segment);
        }
    }

    state.spokenCursor += consumed;

    if (forceFlush) {
        const tail = state.displayText.slice(state.spokenCursor).replace(/\s+/g, " ").trim();
        if (tail) {
            state.queue.push(tail);
            state.spokenCursor = state.displayText.length;
        }
    }
}

function finishLiveAnswerStream(state, finalText, resumeWake = true) {
    if (!state || state.sessionId !== speechSession) {
        return;
    }

    liveAnswerState = null;
    currentUtterance = null;
    stopTalkingAnimation();
    stopStreamingText(finalText);
    setGuideMode(false);

    if (resumeWake) {
        queueWakeRecognition(700, "full");
    }
}

function pumpLiveAnswerSpeechQueue() {
    const state = liveAnswerState;

    if (!state || state.sessionId !== speechSession || state.speakingSegment) {
        return;
    }

    if (!state.queue.length) {
        if (state.finalized) {
            finishLiveAnswerStream(state, state.displayText, true);
        }
        return;
    }

    const segment = state.queue.shift();

    if (!segment) {
        pumpLiveAnswerSpeechQueue();
        return;
    }

    if (audioApi && typeof audioApi.speak === "function" && typeof audioApi.stop === "function") {
        state.speakingSegment = true;
        const speechOptions = getEmotionSpeechOptions(state.emotion);

        audioApi.speak(segment, {
            playbackRate: speechOptions.playbackRate,
            onStart: () => {
                if (!liveAnswerState || liveAnswerState.sessionId !== state.sessionId) {
                    return;
                }

                pauseVoiceRecognition();
                applyDigitalHumanEmotion(state.emotion, 3600);
                currentUtterance = { mode: "audio", segment };
                queueWakeRecognition(120, "interrupt");
                state.activeSegmentStart = state.visualCursor;
                startTalkingAnimation();
                renderLiveAnswerBubble(state);
                setGuideMode(true);
            },
            onBoundary: (event) => {
                state.visualCursor = Math.min(
                    state.displayText.length,
                    state.activeSegmentStart + Math.max(1, Number(event?.charIndex ?? 0) + 1)
                );
                renderLiveAnswerBubble(state);
            },
            onEnd: () => {
                if (!liveAnswerState || liveAnswerState.sessionId !== state.sessionId) {
                    return;
                }

                state.speakingSegment = false;
                currentUtterance = null;
                state.visualCursor = Math.min(
                    state.displayText.length,
                    state.activeSegmentStart + segment.length
                );
                renderLiveAnswerBubble(state);
                stopTalkingAnimation();
                pumpLiveAnswerSpeechQueue();
            },
            onError: () => {
                if (!liveAnswerState || liveAnswerState.sessionId !== state.sessionId) {
                    return;
                }

                state.speakingSegment = false;
                currentUtterance = null;
                stopTalkingAnimation();
                pumpLiveAnswerSpeechQueue();
            }
        }).catch(() => {
            if (!liveAnswerState || liveAnswerState.sessionId !== state.sessionId) {
                return;
            }

            state.speakingSegment = false;
            currentUtterance = null;
            stopTalkingAnimation();
            pumpLiveAnswerSpeechQueue();
        });

        return;
    }

    state.queue = [];
    if (state.finalized) {
        finishLiveAnswerStream(state, state.displayText, true);
    }
    return;

    if (!synth || typeof SpeechSynthesisUtterance === "undefined") {
        state.queue = [];
        if (state.finalized) {
            finishLiveAnswerStream(state, state.displayText, true);
        }
        return;
    }

    const utterance = new SpeechSynthesisUtterance(segment);
    state.speakingSegment = true;
    applyVoiceSettings(utterance);

    utterance.onstart = () => {
        if (!liveAnswerState || liveAnswerState.sessionId !== state.sessionId) {
            return;
        }

        pauseVoiceRecognition();
        currentUtterance = utterance;
        queueWakeRecognition(120, "interrupt");
        state.activeSegmentStart = state.visualCursor;
        startTalkingAnimation();
        if (live2dHostApi && typeof live2dHostApi.startLipSync === "function") {
            live2dHostApi.startLipSync(segment);
        }
        renderLiveAnswerBubble(state);
        setGuideMode(true);
    };

    utterance.onboundary = (event) => {
        if (live2dHostApi && typeof live2dHostApi.handleSpeechBoundary === "function") {
            live2dHostApi.handleSpeechBoundary(event);
        }

        state.visualCursor = Math.min(
            state.displayText.length,
            state.activeSegmentStart + Math.max(1, Number(event?.charIndex ?? 0) + 1)
        );
        renderLiveAnswerBubble(state);
    };

    utterance.onend = () => {
        if (!liveAnswerState || liveAnswerState.sessionId !== state.sessionId) {
            return;
        }

        state.speakingSegment = false;
        currentUtterance = null;
        state.visualCursor = Math.min(
            state.displayText.length,
            state.activeSegmentStart + segment.length
        );
        renderLiveAnswerBubble(state);
        stopTalkingAnimation();
        pumpLiveAnswerSpeechQueue();
    };

    utterance.onerror = () => {
        if (!liveAnswerState || liveAnswerState.sessionId !== state.sessionId) {
            return;
        }

        state.speakingSegment = false;
        currentUtterance = null;
        stopTalkingAnimation();
        pumpLiveAnswerSpeechQueue();
    };

    synth.speak(utterance);
}

function syncLiveAnswerOutput(text) {
    const state = liveAnswerState;
    if (!state || state.sessionId !== speechSession) {
        return;
    }

    state.displayText = sanitizeAssistantText(text);
    renderLiveAnswerBubble(state);

    collectSpeakableSegments(state, false);
    pumpLiveAnswerSpeechQueue();
}

function finalizeLiveAnswerOutput(text) {
    const state = liveAnswerState;
    if (!state || state.sessionId !== speechSession) {
        return;
    }

    state.displayText = rewriteReplyWithEmotion(sanitizeAssistantText(text).trim(), state.emotion);
    renderLiveAnswerBubble(state);

    collectSpeakableSegments(state, true);
    state.finalized = true;
    pumpLiveAnswerSpeechQueue();
}

function speak(text, options = {}) {
    const content = String(text || "").trim();
    if (!content) {
        if (typeof options.afterEnd === "function") {
            options.afterEnd();
        }
        return;
    }

    const sessionId = ++speechSession;
    const afterEnd = typeof options.afterEnd === "function" ? options.afterEnd : null;
    const resumeWake = Boolean(options.resumeWake);
    const speechEmotion = options.emotion || currentEmotionState || detectUserEmotion(content);
    const emotionSpeechOptions = getEmotionSpeechOptions(speechEmotion);
    const remotePlaybackRate = Number.isFinite(options.remotePlaybackRate)
        ? Number(options.remotePlaybackRate)
        : emotionSpeechOptions.playbackRate;
    let hasFinished = false;

    function finishSpeech() {
        if (hasFinished || sessionId !== speechSession) {
            return;
        }

        hasFinished = true;
        window.clearTimeout(callbackTimer);
        callbackTimer = null;
        stopTalkingAnimation();
        stopStreamingText(content);
        setGuideMode(false);
        currentUtterance = null;

        if (afterEnd) {
            afterEnd();
        }

        if (resumeWake || voiceModeEnabled) {
            queueWakeRecognition(700, "full");
        }
    }

    function recoverSpeech(statusText = "") {
        if (hasFinished || sessionId !== speechSession) {
            return;
        }

        currentUtterance = null;
        stopTalkingAnimation();
        setGuideMode(true);

        if (statusText) {
            if (voiceState) {
                voiceState.textContent = statusText;
            }
            if (readoutSpeech) {
                readoutSpeech.textContent = statusText;
            }
        }

        streamBubbleText(content, 126);
        callbackTimer = window.setTimeout(() => {
            finishSpeech();
        }, Math.max(2200, content.length * 140));
    }

    function fallbackToBrowserSpeech(statusText = "Audio fallback") {
        if (hasFinished || sessionId !== speechSession) {
            return;
        }

        if (!synth || typeof SpeechSynthesisUtterance === "undefined") {
            recoverSpeech(statusText);
            return;
        }

        if (currentUtterance) {
            stopSpeech(true);
        }

        const utterance = new SpeechSynthesisUtterance(content);
        const voice = getChineseVoice();

        if (voice) {
            utterance.voice = voice;
        }

        if (voiceProfile && typeof voiceProfile.applyUtterance === "function") {
            voiceProfile.applyUtterance(utterance);
        } else {
            utterance.lang = "zh-CN";
            utterance.rate = 0.92;
            utterance.pitch = 1.22;
            utterance.volume = 1;
        }
        utterance.rate = emotionSpeechOptions.browserRate;
        utterance.pitch = emotionSpeechOptions.browserPitch;

        utterance.onstart = () => {
            if (sessionId !== speechSession) {
                return;
            }

            pauseVoiceRecognition();
            applyDigitalHumanEmotion(speechEmotion, 3600);
            currentUtterance = utterance;
            queueWakeRecognition(120, "interrupt");
            setGuideMode(true);
            startTalkingAnimation();
            if (live2dHostApi && typeof live2dHostApi.startLipSync === "function") {
                live2dHostApi.startLipSync(content);
            }
            startSpeechSyncedBubbleText(content, 126);

            callbackTimer = window.setTimeout(
                finishSpeech,
                Math.max(2800, content.length * 260)
            );
        };

        utterance.onboundary = (event) => {
            if (live2dHostApi && typeof live2dHostApi.handleSpeechBoundary === "function") {
                live2dHostApi.handleSpeechBoundary(event);
            }
            syncSpeechBubbleToBoundary(content, event);
        };

        utterance.onend = () => {
            finishSpeech();
        };

        utterance.onerror = () => {
            if (sessionId !== speechSession) {
                return;
            }

            recoverSpeech(statusText);
        };

        synth.speak(utterance);
    }

    pauseVoiceRecognition();

    if (audioApi && typeof audioApi.speak === "function" && typeof audioApi.stop === "function") {
        if (currentUtterance || (audioApi.isSpeaking && audioApi.isSpeaking())) {
            stopSpeech(true);
        }

        audioApi.speak(content, {
            playbackRate: remotePlaybackRate,
            onStart: () => {
                if (sessionId !== speechSession) {
                    return;
                }

                pauseVoiceRecognition();
                applyDigitalHumanEmotion(speechEmotion, 3600);
                currentUtterance = { mode: "audio", text: content };
                queueWakeRecognition(120, "interrupt");
                setGuideMode(true);
                startTalkingAnimation();
                startSpeechSyncedBubbleText(content, 126);

                callbackTimer = window.setTimeout(
                    finishSpeech,
                    Math.max(2800, content.length * 260)
                );
            },
            onBoundary: (event) => {
                syncSpeechBubbleToBoundary(content, event);
            },
            onEnd: () => {
                finishSpeech();
            },
            onError: () => {
                if (sessionId !== speechSession) {
                    return;
                }

                recoverSpeech("语音补播中");
                return;

                stopTalkingAnimation();
                stopStreamingText(content);
                setGuideMode(false);
                currentUtterance = null;

                if (voiceState) {
                    voiceState.textContent = "璁茶В澶辫触";
                }
                if (readoutSpeech) {
                    readoutSpeech.textContent = "璁茶В澶辫触";
                }

                if (afterEnd) {
                    afterEnd();
                }

                if (resumeWake || voiceModeEnabled) {
                    queueWakeRecognition(700, "full");
                }
            }
        }).catch(() => {
            if (sessionId !== speechSession) {
                return;
            }

            recoverSpeech("语音补播中");
            return;

            stopTalkingAnimation();
            stopStreamingText(content);
            setGuideMode(false);
            currentUtterance = null;
        });

        return;
    }

    recoverSpeech("云端语音暂不可用");
    return;

    streamBubbleText(content, 126);
    if (voiceState) {
        voiceState.textContent = "云端语音不可用";
    }
    if (readoutSpeech) {
        readoutSpeech.textContent = "云端语音不可用";
    }
    callbackTimer = window.setTimeout(() => {
        finishSpeech();
    }, Math.max(2200, content.length * 140));
    return;

    if (!synth || typeof SpeechSynthesisUtterance === "undefined") {
        streamBubbleText(content, 126);
        if (voiceState) {
            voiceState.textContent = "当前浏览器不支持语音";
        }
        if (readoutSpeech) {
            readoutSpeech.textContent = "当前浏览器不支持语音";
        }
        callbackTimer = window.setTimeout(() => {
            finishSpeech();
        }, Math.max(2200, content.length * 140));
        return;
    }

    if (currentUtterance) {
        stopSpeech(true);
    }

    const utterance = new SpeechSynthesisUtterance(content);
    const voice = getChineseVoice();

    if (voice) {
        utterance.voice = voice;
    }

    if (voiceProfile && typeof voiceProfile.applyUtterance === "function") {
        voiceProfile.applyUtterance(utterance);
    } else {
        utterance.lang = "zh-CN";
        utterance.rate = 0.92;
        utterance.pitch = 1.22;
        utterance.volume = 1;
    }
    utterance.rate = emotionSpeechOptions.browserRate;
    utterance.pitch = emotionSpeechOptions.browserPitch;

    utterance.onstart = () => {
        if (sessionId !== speechSession) {
            return;
        }

        pauseVoiceRecognition();
        applyDigitalHumanEmotion(speechEmotion, 3600);
        currentUtterance = utterance;
        queueWakeRecognition(120, "interrupt");
        setGuideMode(true);
        startTalkingAnimation();
        if (live2dHostApi && typeof live2dHostApi.startLipSync === "function") {
            live2dHostApi.startLipSync(content);
        }
        startSpeechSyncedBubbleText(content, 126);

        callbackTimer = window.setTimeout(
            finishSpeech,
            Math.max(2800, content.length * 260)
        );
    };

    utterance.onboundary = (event) => {
        if (live2dHostApi && typeof live2dHostApi.handleSpeechBoundary === "function") {
            live2dHostApi.handleSpeechBoundary(event);
        }
        syncSpeechBubbleToBoundary(content, event);
    };

    utterance.onend = () => {
        finishSpeech();
    };

    utterance.onerror = () => {
        if (sessionId !== speechSession) {
            return;
        }

        stopTalkingAnimation();
        stopStreamingText(content);
        setGuideMode(false);
        currentUtterance = null;

        if (voiceState) {
            voiceState.textContent = "讲解失败";
        }
        if (readoutSpeech) {
            readoutSpeech.textContent = "讲解失败";
        }

        if (afterEnd) {
            afterEnd();
        }

        if (resumeWake || voiceModeEnabled) {
            queueWakeRecognition(700, "full");
        }
    };

    synth.speak(utterance);
}

function splitSpeechSegments(text) {
    return String(text || "")
        .split(/(?<=[。！？!?；;])/u)
        .map((segment) => segment.replace(/\s+/g, " ").trim())
        .filter(Boolean);
}

function speakSegmentedIntro(text, options = {}) {
    const content = String(text || "").trim();
    const segments = splitSpeechSegments(content);

    if (segments.length <= 1 || !audioApi || typeof audioApi.speak !== "function" || typeof audioApi.stop !== "function") {
        speak(content, options);
        return;
    }

    const sessionId = ++speechSession;
    const afterEnd = typeof options.afterEnd === "function" ? options.afterEnd : null;
    const resumeWake = Boolean(options.resumeWake);
    const remotePlaybackRate = Number.isFinite(options.remotePlaybackRate)
        ? Number(options.remotePlaybackRate)
        : 1;
    const segmentGap = Number.isFinite(options.segmentGap)
        ? Math.max(0, Number(options.segmentGap))
        : 950;
    const characters = Array.from(content);
    let segmentIndex = 0;
    let visualCursor = 0;
    let searchCursor = 0;
    let activeSegmentStart = 0;
    let finished = false;
    let playbackStarted = false;
    let fallbackTriggered = false;

    function prefetchSegment(index) {
        if (!audioApi || typeof audioApi.prefetch !== "function") {
            return;
        }

        const segment = segments[index];
        if (!segment) {
            return;
        }

        audioApi.prefetch(segment, {
            playbackRate: remotePlaybackRate
        }).catch(() => {});
    }

    function setSegmentBubbleCursor(nextIndex) {
        visualCursor = Math.min(characters.length, Math.max(0, nextIndex));
        setStreamingBubbleText(characters.slice(0, visualCursor).join(""));
    }

    function locateSegmentStart(segment) {
        const segmentText = String(segment || "");
        const locatedIndex = content.indexOf(segmentText, searchCursor);
        const resolvedIndex = locatedIndex >= 0 ? locatedIndex : searchCursor;
        searchCursor = resolvedIndex + segmentText.length;
        return Array.from(content.slice(0, resolvedIndex)).length;
    }

    function finishSequence() {
        if (finished || sessionId !== speechSession) {
            return;
        }

        finished = true;
        window.clearTimeout(callbackTimer);
        callbackTimer = null;
        stopTalkingAnimation();
        stopStreamingText(content);
        setGuideMode(false);
        currentUtterance = null;

        if (afterEnd) {
            afterEnd();
        }

        if (resumeWake || voiceModeEnabled) {
            queueWakeRecognition(700, "full");
        }
    }

    function recoverSequence(statusText = "") {
        if (finished || fallbackTriggered || sessionId !== speechSession) {
            return;
        }

        fallbackTriggered = true;
        currentUtterance = null;
        stopTalkingAnimation();
        setGuideMode(true);

        if (statusText) {
            if (voiceState) {
                voiceState.textContent = statusText;
            }
            if (readoutSpeech) {
                readoutSpeech.textContent = statusText;
            }
        }

        streamBubbleText(content, 118);
        callbackTimer = window.setTimeout(() => {
            finishSequence();
        }, Math.max(2600, content.length * 150));
    }

    function playNextSegment() {
        if (finished || sessionId !== speechSession) {
            return;
        }

        if (segmentIndex >= segments.length) {
            finishSequence();
            return;
        }

        const segment = segments[segmentIndex];
        const segmentStart = locateSegmentStart(segment);
        const segmentLength = Array.from(segment).length;
        segmentIndex += 1;
        prefetchSegment(segmentIndex);

        audioApi.speak(segment, {
            playbackRate: remotePlaybackRate,
            onStart: () => {
                if (sessionId !== speechSession) {
                    return;
                }

                playbackStarted = true;
                pauseVoiceRecognition();
                currentUtterance = { mode: "audio", text: content, segment };
                queueWakeRecognition(120, "interrupt");
                setGuideMode(true);
                startTalkingAnimation();
                activeSegmentStart = segmentStart;
                if (visualCursor < activeSegmentStart) {
                    setSegmentBubbleCursor(activeSegmentStart);
                }
            },
            onBoundary: (event) => {
                if (sessionId !== speechSession) {
                    return;
                }

                const nextIndex = activeSegmentStart + Math.max(1, Number(event?.charIndex ?? 0) + 1);
                setSegmentBubbleCursor(nextIndex);
            },
            onEnd: () => {
                if (sessionId !== speechSession) {
                    return;
                }

                currentUtterance = null;
                setSegmentBubbleCursor(segmentStart + segmentLength);
                if (segmentIndex >= segments.length) {
                    finishSequence();
                    return;
                }

                window.setTimeout(() => {
                    if (finished || sessionId !== speechSession) {
                        return;
                    }

                    playNextSegment();
                }, segmentGap);
            },
            onError: () => {
                if (sessionId !== speechSession) {
                    return;
                }

                currentUtterance = null;
                recoverSequence("语音补讲中");
            }
        }).catch(() => {
            if (sessionId !== speechSession) {
                return;
            }

            currentUtterance = null;
            recoverSequence(playbackStarted ? "语音补讲中" : "语音准备中");
        });
    }

    pauseVoiceRecognition();
    if (currentUtterance || (audioApi.isSpeaking && audioApi.isSpeaking())) {
        stopSpeech(true);
    }

    setGuideMode(true);
    stopStreamingText();
    setStreamingBubbleText("");
    prefetchSegment(0);
    prefetchSegment(1);

    playNextSegment();
}

function pulseStage() {
    if (!avatarStage || typeof avatarStage.animate !== "function") {
        return;
    }

    avatarStage.animate(
        [
            { transform: "scale(1)", filter: "brightness(1)" },
            { transform: "scale(1.012)", filter: "brightness(1.16)" },
            { transform: "scale(1)", filter: "brightness(1)" }
        ],
        {
            duration: 900,
            easing: "ease-out"
        }
    );
}

function navigateToExperiment(key) {
    const experiment = experiments[key];
    if (!experiment || !experiment.path) {
        return;
    }

    if (bubbleText) {
        bubbleText.textContent = "讲解结束，正在进入实验界面。";
    }
    if (voiceState) {
        voiceState.textContent = "准备跳转";
    }
    if (readoutSpeech) {
        readoutSpeech.textContent = "准备跳转";
    }

    window.setTimeout(() => {
        window.location.href = experiment.path;
    }, 520);
}

function updateSignalCabin(key) {
    const preset = signalCabinPresets[key] || signalCabinPresets.gate;

    if (signalBadge) {
        signalBadge.textContent = preset.badge;
    }
    if (signalCabinText) {
        signalCabinText.textContent = preset.text;
    }
    if (signalModeValue) {
        signalModeValue.textContent = preset.mode;
    }
    if (signalFreqValue) {
        signalFreqValue.textContent = preset.freq;
    }
    if (signalFocusValue) {
        signalFocusValue.textContent = preset.focus;
    }
}

function getChallengeByKey(key) {
    const list = challengeBank[key] || challengeBank.gate;
    const nextIndex = challengeIndexMap[key] % list.length;
    return list[nextIndex];
}

function renderChallenge(key) {
    const challenge = getChallengeByKey(key);
    if (!challenge) {
        return;
    }

    if (challengeTitle) {
        challengeTitle.textContent = challenge.title;
    }
    if (challengeTag) {
        challengeTag.textContent = challenge.tag;
    }
    if (challengeQuestion) {
        challengeQuestion.textContent = challenge.question;
    }
    if (challengeClues) {
        challengeClues.innerHTML = "";
        challenge.clues.forEach((clue) => {
            const item = document.createElement("span");
            item.textContent = clue;
            challengeClues.appendChild(item);
        });
    }
    if (challengeAnswer) {
        challengeAnswer.textContent = challenge.answer;
        challengeAnswer.classList.add("is-hidden");
    }
    if (challengeRevealBtn) {
        challengeRevealBtn.textContent = "显示提示";
    }
}

function updateExperiment(key, options = {}) {
    const experiment = experiments[key];
    if (!experiment) {
        return;
    }

    currentKey = key;

    if (currentExperiment) {
        currentExperiment.textContent = experiment.shortTitle;
    }
    if (previewTitle) {
        previewTitle.textContent = experiment.title;
    }
    if (previewLevel) {
        previewLevel.textContent = experiment.level;
    }
    if (previewDescription) {
        previewDescription.textContent = experiment.description;
    }
    if (readoutMode) {
        readoutMode.textContent = experiment.shortTitle;
    }
    if (readoutRecommend) {
        readoutRecommend.textContent = experiment.recommend;
    }
    if (readoutNext) {
        readoutNext.textContent = experiment.next;
    }
    if (bubbleText) {
        bubbleText.textContent = options.autoSpeak ? "" : experiment.speech;
    }
    if (guideIntro) {
        guideIntro.textContent = `当前已切换到${experiment.title}。如果这个方向合适，下一步我会继续带你进入对应实验页。`;
    }

    buildPreviewPoints(experiment.points);
    updateSignalCabin(key);
    renderChallenge(key);

    experimentCards.forEach((card) => {
        card.classList.toggle("active", card.dataset.experiment === key);
    });

    pulseStage();
    setGuideMode(false);

    if (options.autoSpeak) {
        const speechRunner = options.segmentedIntro ? speakSegmentedIntro : speak;
        speechRunner(experiment.speech, {
            ...(options.speechOptions || {}),
            afterEnd: options.afterEnd || null
        });
    }
}

function prefetchExperimentSpeech(key) {
    const experiment = experiments[key];
    if (!experiment || !audioApi || typeof audioApi.prefetch !== "function") {
        return;
    }

    const [firstSegment] = splitSpeechSegments(experiment.speech);
    if (!firstSegment) {
        return;
    }

    audioApi.prefetch(firstSegment).catch(() => {
        // ignore prefetch failures; click path will retry normally
    });
}

function setAssistantStatus(text) {
    if (assistantInlineStatus) {
        assistantInlineStatus.textContent = text;
    }
}

function setVoiceWakeText(text) {
    if (voiceWakeStatus) {
        voiceWakeStatus.textContent = text;
    }
}

function setVoiceRecognizeText(text) {
    if (voiceRecognizeHint) {
        voiceRecognizeHint.textContent = text;
    }
}

function appendAssistantMessage(role, text = "") {
    if (!assistantLog) {
        return null;
    }

    const item = document.createElement("article");
    item.className = `assistant-inline-message ${role}`;

    const roleTag = document.createElement("div");
    roleTag.className = "assistant-inline-role";
    roleTag.textContent = role === "assistant" ? "小芯" : "你";

    const content = document.createElement("p");
    content.textContent = text;

    item.appendChild(roleTag);
    item.appendChild(content);
    assistantLog.appendChild(item);
    assistantLog.scrollTop = assistantLog.scrollHeight;

    return content;
}

function sanitizeAssistantText(text) {
    return String(text || "")
        .replace(/\r/g, "")
        .replace(/```[\w-]*\n?/g, "")
        .replace(/```/g, "")
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
        .replace(/`([^`]+)`/g, "$1")
        .replace(/\*\*([^*]+)\*\*/g, "$1")
        .replace(/__([^_]+)__/g, "$1")
        .replace(/\*([^*\n]+)\*/g, "$1")
        .replace(/_([^_\n]+)_/g, "$1")
        .replace(/^#{1,6}\s*/gm, "")
        .replace(/^\s*>\s?/gm, "")
        .replace(/\*\*/g, "")
        .replace(/__/g, "")
        .replace(/`/g, "")
        .trim();
}

function createAssistantSessionId(prefix = "assistant") {
    const randomPart = Math.random().toString(36).slice(2, 10);
    return `${prefix}-${Date.now().toString(36)}-${randomPart}`;
}

function getOrCreateAssistantSessionId(storageKey, prefix) {
    try {
        const cached = window.localStorage.getItem(storageKey);
        if (cached) {
            return cached;
        }

        const created = createAssistantSessionId(prefix);
        window.localStorage.setItem(storageKey, created);
        return created;
    } catch (_error) {
        return createAssistantSessionId(prefix);
    }
}

function waitAssistantDelay(delay) {
    return new Promise((resolve) => {
        window.setTimeout(resolve, delay);
    });
}

function normalizeAssistantKeyword(text) {
    return String(text || "")
        .replace(/\s+/g, "")
        .replace(/[，。！？；、,.!?]/g, "")
        .trim()
        .toLowerCase();
}

function getLatestAssistantPreview() {
    if (!assistantLog) {
        return "";
    }

    const messages = Array.from(assistantLog.querySelectorAll(".assistant-inline-message p"));
    const last = messages[messages.length - 1];
    return last ? String(last.textContent || "").trim().slice(0, 120) : "";
}

function renderAssistantSuggestions(keyword = "") {
    if (!assistantSuggestions) {
        return;
    }

    const normalizedKeyword = normalizeAssistantKeyword(keyword);
    const candidates = assistantSuggestionPool
        .filter((item) => {
            if (!normalizedKeyword) {
                return true;
            }

            return normalizeAssistantKeyword(item).includes(normalizedKeyword);
        })
        .slice(0, normalizedKeyword ? 6 : 4);

    assistantSuggestions.innerHTML = "";

    candidates.forEach((text) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "assistant-suggestion-chip";
        button.textContent = text;
        button.addEventListener("click", () => {
            fillAssistantInput(text);
        });
        assistantSuggestions.appendChild(button);
    });
}

function getAssistantExperimentState() {
    const challengeList = challengeBank[currentKey] || challengeBank.gate;
    const currentChallenge = challengeList[challengeIndexMap[currentKey] || 0] || null;

    return {
        sessionId: assistantSessionId,
        experimentKey: currentKey,
        selectedExperiment: assistantExperimentNames[currentKey] || "首页",
        previewTitle: previewTitle ? previewTitle.textContent : "",
        previewLevel: previewLevel ? previewLevel.textContent : "",
        previewDescription: previewDescription ? previewDescription.textContent : "",
        previewPoints: previewPoints
            ? Array.from(previewPoints.querySelectorAll("span")).map((item) => item.textContent.trim())
            : [],
        recommendation: readoutRecommend ? readoutRecommend.textContent : "",
        nextStep: readoutNext ? readoutNext.textContent : "",
        guideIntro: guideIntro ? guideIntro.textContent : "",
        signal: {
            badge: signalBadge ? signalBadge.textContent : "",
            focus: signalFocusValue ? signalFocusValue.textContent : "",
            mode: signalModeValue ? signalModeValue.textContent : "",
            frequency: signalFreqValue ? signalFreqValue.textContent : ""
        },
        challenge: currentChallenge ? {
            title: currentChallenge.title,
            tag: currentChallenge.tag,
            question: currentChallenge.question,
            clues: currentChallenge.clues,
            answerVisible: Boolean(challengeAnswer && !challengeAnswer.classList.contains("is-hidden"))
        } : null,
        uiStatus: {
            assistantStatus: assistantInlineStatus ? assistantInlineStatus.textContent : "",
            voiceWakeStatus: voiceWakeStatus ? voiceWakeStatus.textContent : "",
            voiceRecognizeHint: voiceRecognizeHint ? voiceRecognizeHint.textContent : "",
            interactionState: interactionState ? interactionState.textContent : ""
        },
        emotionState: currentEmotionState ? {
            label: currentEmotionState.label,
            labelText: currentEmotionState.labelText,
            confidence: currentEmotionState.confidence,
            strategy: currentEmotionState.strategy,
            output: currentEmotionState.output
        } : null,
        latestPreview: getLatestAssistantPreview(),
        lastQuestion: assistantLastQuestion
    };
}

async function fetchAssistantStreamResponse(query, signal, maxAttempts = 2) {
    let attempt = 0;

    while (attempt < maxAttempts) {
        try {
            const response = await fetch(
                `${assistantApiBase}/api/chat/stream?${query.toString()}`,
                { signal }
            );

            if (!response.ok || !response.body) {
                throw new Error(`请求失败：${response.status}`);
            }

            return response;
        } catch (error) {
            if (error instanceof DOMException && error.name === "AbortError") {
                throw error;
            }

            attempt += 1;
            if (attempt >= maxAttempts) {
                throw error;
            }

            setAssistantStatus("当前状态：网络波动，正在重试");
            setVoiceRecognizeText(`第 ${attempt + 1} 次请求准备中`);
            await waitAssistantDelay(320 * attempt);
        }
    }

    throw new Error("请求失败");
}

function abortAssistantRequest() {
    if (assistantAbortController) {
        assistantAbortController.abort();
        assistantAbortController = null;
    }
}

async function streamAssistantAnswer(question, options = {}) {
    const content = String(question || "").trim();
    if (!content) {
        return;
    }

    assistantLastQuestion = content;
    currentEmotionState = createMultimodalEmotionState(content, options);
    applyDigitalHumanEmotion(currentEmotionState, 5600);
    abortAssistantRequest();
    stopSpeech(true);
    pauseVoiceRecognition();

    appendAssistantMessage("user", content);
    const assistantContent = appendAssistantMessage("assistant", "");
    const experimentName = assistantExperimentNames[currentKey] || "首页";
    const experimentState = JSON.stringify(getAssistantExperimentState());

    setAssistantStatus("当前状态：小芯思考中");
    setVoiceRecognizeText("正在生成回答");

    beginLiveAnswerStream();
    assistantAbortController = new AbortController();

    try {
        const query = new URLSearchParams({
            question: content,
            experimentName,
            experimentState,
            sessionId: assistantSessionId
        });

        const response = await fetchAssistantStreamResponse(query, assistantAbortController.signal);

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";
        let finalText = "";

        while (true) {
            const { value, done } = await reader.read();
            if (done) {
                break;
            }

            buffer += decoder.decode(value, { stream: true });
            const events = buffer.split("\n\n");
            buffer = events.pop() || "";

            for (const eventBlock of events) {
                if (!eventBlock.trim()) {
                    continue;
                }

                const line = eventBlock
                    .split("\n")
                    .find((item) => item.startsWith("data: "));

                if (!line) {
                    continue;
                }

                const payload = JSON.parse(line.slice(6));

                if (payload.error) {
                    throw new Error(payload.error);
                }

                if (payload.token) {
                    finalText += payload.token;
                    const syncedText = sanitizeAssistantText(finalText);
                    if (assistantContent) {
                        assistantContent.textContent = syncedText;
                    }
                    syncLiveAnswerOutput(syncedText);
                    if (assistantLog) {
                        assistantLog.scrollTop = assistantLog.scrollHeight;
                    }
                }
            }
        }

        finalText = sanitizeAssistantText(finalText).trim() || "我刚刚没有组织出合适的回答，你可以再问我一次。";
        finalText = rewriteReplyWithEmotion(finalText, currentEmotionState);
        if (assistantContent) {
            assistantContent.textContent = finalText;
        }

        setAssistantStatus("当前状态：小芯讲解中");
        setVoiceRecognizeText("回答已生成");
        finalizeLiveAnswerOutput(finalText);
    } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
            return;
        }

        const message = error instanceof Error ? error.message : "调用失败";
        emotionBehaviorState.failureCount += 1;
        refreshBehaviorEmotionDashboard();
        if (assistantContent) {
            assistantContent.textContent = `抱歉，我刚刚没有回答成功。${message}`;
        }
        setAssistantStatus("当前状态：回答失败");
        setVoiceRecognizeText("可以重新提问");
        liveAnswerState = null;
        queueWakeRecognition(800);
    } finally {
        assistantAbortController = null;
        if (pendingVoiceTranscript === content) {
            pendingVoiceTranscript = "";
        }
    }
}

function submitAssistantQuestion(rawQuestion, options = {}) {
    const question = String(rawQuestion || "").trim();
    if (!question) {
        return;
    }

    if (assistantInput) {
        assistantInput.value = "";
    }

    renderAssistantSuggestions("");
    window.setTimeout(() => {
        Object.keys(experiments).forEach((key, index) => {
            window.setTimeout(() => {
                prefetchExperimentSpeech(key);
            }, index * 220);
        });
    }, 260);
    const submitOptions = {
        ...options,
        inputMode: options.inputMode || (pendingVoiceTranscript === question ? "voice" : "text")
    };
    streamAssistantAnswer(question, submitOptions);
}

function handleRecognitionUnsupported() {
    setVoiceWakeText("语音待命：当前浏览器不支持");
    setVoiceRecognizeText("请使用最新版 Chrome 或 Edge");
    setAssistantStatus("当前状态：仅支持文字提问");
}

function fillAssistantInput(text) {
    if (!assistantInput) {
        return;
    }

    assistantInput.value = text;
    renderAssistantSuggestions(text);
    assistantInput.focus();
    assistantInput.setSelectionRange(text.length, text.length);
}

function startManualSpeechToText() {
    if (!RecognitionCtor) {
        handleRecognitionUnsupported();
        return;
    }

    if (manualSpeechRecognition) {
        pauseVoiceRecognition();
        setVoiceRecognizeText("已停止本次语音转文字");
        setAssistantStatus("当前状态：待命");
        return;
    }

    stopSpeech(true);
    abortAssistantRequest();
    pauseVoiceRecognition();

    const recognition = new RecognitionCtor();
    manualSpeechRecognition = recognition;
    recognition.lang = "zh-CN";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    let finalTranscript = "";

    if (assistantSpeechToTextBtn) {
        assistantSpeechToTextBtn.classList.add("is-listening");
        assistantSpeechToTextBtn.textContent = "停止转写";
    }

    setAssistantStatus("当前状态：语音转文字中");
    setVoiceRecognizeText("请直接说出你想提问的内容");

    recognition.onresult = (event) => {
        let interimTranscript = "";

        for (let index = event.resultIndex; index < event.results.length; index += 1) {
            const result = event.results[index];
            const transcript = result[0]?.transcript || "";

            if (result.isFinal) {
                finalTranscript += transcript;
            } else {
                interimTranscript += transcript;
            }
        }

        const previewText = (finalTranscript || interimTranscript).trim();
        if (previewText) {
            setVoiceRecognizeText(`转写中：${previewText}`);
        }

        if (finalTranscript.trim()) {
            const text = finalTranscript.trim();
            pendingVoiceTranscript = text;
            fillAssistantInput(text);
            setVoiceRecognizeText(`转写完成：${text}`);
            setAssistantStatus("当前状态：已填入输入框");
        }
    };

    recognition.onerror = (event) => {
        manualSpeechRecognition = null;

        if (assistantSpeechToTextBtn) {
            assistantSpeechToTextBtn.classList.remove("is-listening");
            assistantSpeechToTextBtn.textContent = "语音转文字";
        }

        if (event.error === "aborted") {
            return;
        }

        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
            setVoiceRecognizeText("麦克风权限未开启，请先允许浏览器访问麦克风");
            setAssistantStatus("当前状态：语音权限未开启");
            return;
        }

        if (event.error === "no-speech") {
            setVoiceRecognizeText("没有听清，可以再点一次“语音转文字”");
        } else {
            setVoiceRecognizeText(`转写失败：${event.error}`);
        }
        setAssistantStatus("当前状态：待命");
    };

    recognition.onend = () => {
        manualSpeechRecognition = null;

        if (assistantSpeechToTextBtn) {
            assistantSpeechToTextBtn.classList.remove("is-listening");
            assistantSpeechToTextBtn.textContent = "语音转文字";
        }

        if (voiceModeEnabled) {
            queueWakeRecognition(500);
        }
    };

    try {
        recognition.start();
    } catch (error) {
        manualSpeechRecognition = null;

        if (assistantSpeechToTextBtn) {
            assistantSpeechToTextBtn.classList.remove("is-listening");
            assistantSpeechToTextBtn.textContent = "语音转文字";
        }

        const message = error instanceof Error ? error.message : "启动失败";
        setVoiceRecognizeText(`语音转文字启动失败：${message}`);
        setAssistantStatus("当前状态：待命");
    }
}

function disableVoiceMode() {
    voiceModeEnabled = false;
    window.localStorage.removeItem(voiceModeStorageKey);
    pauseVoiceRecognition();
    setVoiceWakeText("语音待命：未开启");
    setVoiceRecognizeText("麦克风未启动");
    setAssistantStatus("当前状态：待命");
}

function normalizeTranscript(text) {
    return String(text || "")
        .replace(/\s+/g, "")
        .replace(/[，。！？、,.!?：；"'`]/g, "");
}

function findWakeAlias(normalizedText) {
    const exactAlias = wakeAliases.find((alias) => normalizedText.includes(alias));
    if (exactAlias) {
        return exactAlias;
    }

    if (/小.{0,2}[芯新心欣]/u.test(normalizedText) || /晓.{0,2}[芯新心欣]/u.test(normalizedText)) {
        return "小芯";
    }

    return "";
}

function extractQuestionAfterWake(text) {
    return String(text || "")
        .replace(wakeAliasPattern, "")
        .replace(/^[，。！？、,.!?：；\s]+/u, "")
        .trim();
}

function findInterruptAlias(normalizedText) {
    return interruptAliases.find((alias) => normalizedText.includes(alias)) || "";
}

function extractQuestionAfterInterrupt(text) {
    return String(text || "")
        .replace(interruptAliasPattern, "")
        .replace(/^[锛屻€傦紒锛熴€?.!?锛氾紱\s]+/u, "")
        .trim();
}

function isAssistantBusyForInterrupt() {
    return Boolean(assistantAbortController || liveAnswerState || currentUtterance || isSpeaking());
}

function extractInterruptQuestion(text) {
    return String(text || "")
        .replace(interruptAliasPattern, "")
        .replace(/^[,.;:!?\uFF0C\u3002\uFF01\uFF1F\uFF1A\uFF1B\s]+/u, "")
        .trim();
}

function startQuestionRecognition() {
    if (!voiceModeEnabled) {
        return;
    }

    if (!RecognitionCtor) {
        handleRecognitionUnsupported();
        return;
    }

    if (questionRecognition) {
        pauseVoiceRecognition();
    }

    const recognition = new RecognitionCtor();
    questionRecognition = recognition;
    recognition.lang = "zh-CN";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    let finalTranscript = "";
    let earlySubmitTimer = null;
    let submitted = false;

    function submitRecognizedQuestion(rawText) {
        const question = String(rawText || "").trim();
        if (!question || submitted) {
            return;
        }

        submitted = true;
        window.clearTimeout(earlySubmitTimer);
        earlySubmitTimer = null;
        finalTranscript = "";
        questionRecognition = null;
        stopRecognitionInstance(recognition);
        setVoiceRecognizeText(`已识别：${question}`);
        submitAssistantQuestion(question, {
            inputMode: "voice",
            fromWake: true
        });
    }

    setAssistantStatus("当前状态：等待你的问题");
    setVoiceWakeText("语音待命：已开启");
    setVoiceRecognizeText("请直接说出你的问题");

    recognition.onresult = (event) => {
        let interimTranscript = "";

        for (let index = event.resultIndex; index < event.results.length; index += 1) {
            const result = event.results[index];
            const transcript = result[0]?.transcript || "";

            if (result.isFinal) {
                finalTranscript += transcript;
            } else {
                interimTranscript += transcript;
            }
        }

        const previewText = `${finalTranscript}${interimTranscript}`.trim();
        if (previewText) {
            setVoiceRecognizeText(`识别中：${previewText}`);
            window.clearTimeout(earlySubmitTimer);
            if (!finalTranscript.trim() && previewText.length >= 6) {
                earlySubmitTimer = window.setTimeout(() => {
                    submitRecognizedQuestion(previewText);
                }, 1400);
            }
        }

        if (finalTranscript.trim()) {
            submitRecognizedQuestion(finalTranscript);
        }
    };

    recognition.onerror = (event) => {
        questionRecognition = null;
        window.clearTimeout(earlySubmitTimer);

        if (event.error === "aborted") {
            return;
        }

        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
            setVoiceWakeText("语音待命：麦克风权限被拒绝");
            setVoiceRecognizeText("请允许浏览器访问麦克风后重试");
            setAssistantStatus("当前状态：语音权限未开启");
            return;
        }

        if (event.error === "network") {
            setVoiceRecognizeText("语音识别网络不稳定，这次没有完整收到，请再说一次“小芯小芯”");
        } else if (event.error === "no-speech") {
            setVoiceRecognizeText("没有听清问题，可以再说一次“小芯小芯”");
        } else {
            setVoiceRecognizeText(`提问识别异常：${event.error}`);
        }

        queueWakeRecognition(700);
    };

    recognition.onend = () => {
        questionRecognition = null;
        window.clearTimeout(earlySubmitTimer);
        if (!submitted && finalTranscript.trim()) {
            submitRecognizedQuestion(finalTranscript);
            return;
        }
        if (!submitted) {
            queueWakeRecognition(250);
        }
    };

    try {
        recognition.start();
    } catch (error) {
        questionRecognition = null;
        const message = error instanceof Error ? error.message : "启动失败";
        setVoiceRecognizeText(`提问识别启动失败：${message}`);
        queueWakeRecognition(900, "full");
    }
}

function speakWakeReplyFast(text, afterEnd = null) {
    const content = sanitizeAssistantText(text);

    if (!content) {
        if (afterEnd) {
            afterEnd();
        }
        return;
    }

    if (!audioApi || typeof audioApi.speak !== "function" || typeof audioApi.stop !== "function") {
        if (afterEnd) {
            afterEnd();
        }
        return;
    }

    stopSpeech(false);
    currentUtterance = null;
    let finished = false;
    const fallbackTimer = window.setTimeout(() => {
        finish();
    }, 4200);

    function finish() {
        if (finished) {
            return;
        }

        finished = true;
        window.clearTimeout(fallbackTimer);
        currentUtterance = null;
        if (live2dHostApi && typeof live2dHostApi.stopLipSync === "function") {
            live2dHostApi.stopLipSync();
        }
        if (live2dHostApi && typeof live2dHostApi.forceCloseMouth === "function") {
            live2dHostApi.forceCloseMouth();
        }
        if (afterEnd) {
            window.setTimeout(afterEnd, 280);
        }
    }

    audioApi.speak(content, {
        playbackRate: 1.08,
        onStart: () => {
            currentUtterance = { mode: "audio", text: content, wakeReply: true };
            setVoiceRecognizeText("小芯正在回应");
            if (voiceState) {
                voiceState.textContent = "唤醒回应中";
            }
        },
        onEnd: finish,
        onError: finish
    }).catch(() => {
        finish();
    });
}

function handleWakeDetected(questionText) {
    const directQuestion = String(questionText || "").trim();

    if (directQuestion) {
        setAssistantStatus("当前状态：已收到语音问题");
        setVoiceWakeText("语音待命：已开启");
        setVoiceRecognizeText(`已识别：${directQuestion}`);
        submitAssistantQuestion(directQuestion, {
            inputMode: "voice",
            fromWake: true
        });
        return;
    }

    setAssistantStatus("当前状态：已唤醒小芯");
    setVoiceWakeText("语音待命：已开启");
    setVoiceRecognizeText("小芯已回应，请直接说问题");
    const wakeReply = "哎，我在，有什么需要帮助的嘛。";
    if (bubbleText) {
        bubbleText.textContent = wakeReply;
        bubbleText.classList.remove("is-streaming");
    }

    const listenAfterWakeReply = () => {
        setVoiceRecognizeText("请直接说出你的问题");
        startQuestionRecognition();
    };

    speakWakeReplyFast(wakeReply, listenAfterWakeReply);
}

function processInterruptDetected(questionText) {
    abortAssistantRequest();
    stopSpeech(true);

    setAssistantStatus("褰撳墠鐘舵€侊細宸叉墦鏂紝绛夊緟杩借");
    setVoiceWakeText("璇煶寰呭懡锛氬凡寮€鍚?");

    const directQuestion = String(questionText || "").trim();

    if (directQuestion) {
        setVoiceRecognizeText(`宸叉墦鏂紝姝ｅ湪澶勭悊锛?{directQuestion}`);
        submitAssistantQuestion(directQuestion, {
            inputMode: "voice",
            interrupted: true
        });
        return;
    }

    setVoiceRecognizeText("宸插仠姝㈠綋鍓嶈瑙ｏ紝璇风户缁鍑轰綘鐨勯棶棰?");
    startQuestionRecognition();
}

function handleInterruptDetected(questionText) {
    pauseVoiceRecognition();
    abortAssistantRequest();
    stopSpeech(true);

    setAssistantStatus("\u5f53\u524d\u72b6\u6001\uff1a\u5df2\u6253\u65ad\uff0c\u7b49\u5f85\u8ffd\u95ee");
    setVoiceWakeText("\u8bed\u97f3\u5f85\u547d\uff1a\u5df2\u5f00\u542f");

    const directQuestion = String(questionText || "").trim();
    if (directQuestion) {
        setVoiceRecognizeText(`已打断，正在处理：${directQuestion}`);
        submitAssistantQuestion(directQuestion, {
            inputMode: "voice",
            interrupted: true
        });
        return;
    }

    setVoiceRecognizeText("\u5df2\u7acb\u5373\u505c\u6b62\u5f53\u524d\u8bb2\u89e3\uff0c\u6b63\u5728\u63a5\u6536\u4f60\u7684\u65b0\u95ee\u9898");
    queueInterruptFollowup(() => {
        setVoiceRecognizeText("\u5df2\u505c\u6b62\u5f53\u524d\u8bb2\u89e3\uff0c\u8bf7\u7ee7\u7eed\u8bf4\u51fa\u4f60\u7684\u95ee\u9898");
        startQuestionRecognition();
    });
}

function startWakeRecognition(isRestart = false, mode = "full") {
    if (!voiceModeEnabled) {
        return;
    }

    if (!RecognitionCtor) {
        handleRecognitionUnsupported();
        return;
    }

    if (document.hidden || questionRecognition || manualSpeechRecognition) {
        return;
    }

    clearWakeResumeTimer();
    pauseVoiceRecognition();

    const recognitionMode = mode === "interrupt" ? "interrupt" : "full";
    wakeRecognitionMode = recognitionMode;

    const recognition = new RecognitionCtor();
    wakeRecognition = recognition;
    recognition.lang = "zh-CN";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    setVoiceWakeText("语音待命：已开启");
    setVoiceRecognizeText(isRestart ? "继续等待“小芯小芯”" : "等待唤醒词“小芯小芯”");
    setAssistantStatus("当前状态：语音待命中");

    recognition.onstart = () => {
        wakeRecognition = recognition;
    };

    recognition.onresult = (event) => {
        const transcript = Array.from(event.results)
            .map((result) => result[0]?.transcript || "")
            .join("")
            .trim();

        if (!transcript) {
            return;
        }

        const normalized = normalizeTranscript(transcript);
        const interruptAlias = findInterruptAlias(normalized);
        if (recognitionMode !== "interrupt") {
            setVoiceRecognizeText(`待命中，已听到：${transcript}`);
        }

        if (recognitionMode === "interrupt") {
            if (!interruptAlias || !isAssistantBusyForInterrupt()) {
                return;
            }

            wakeRecognition = null;
            wakeRecognitionMode = "full";
            stopRecognitionInstance(recognition);
            handleInterruptDetected(extractInterruptQuestion(transcript));
            return;
        }

        if (interruptAlias && isAssistantBusyForInterrupt()) {
            wakeRecognition = null;
            wakeRecognitionMode = "full";
            stopRecognitionInstance(recognition);
            handleInterruptDetected(extractInterruptQuestion(transcript));
            return;
        }

        const alias = findWakeAlias(normalized);

        if (!alias) {
            return;
        }

        wakeRecognition = null;
        wakeRecognitionMode = "full";
        stopRecognitionInstance(recognition);
        handleWakeDetected(extractQuestionAfterWake(transcript));
    };

    recognition.onerror = (event) => {
        wakeRecognition = null;
        wakeRecognitionMode = "full";

        if (event.error === "aborted") {
            return;
        }

        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
            setVoiceWakeText("语音待命：麦克风权限被拒绝");
            setVoiceRecognizeText("请允许浏览器访问麦克风后重新开启");
            setAssistantStatus("当前状态：语音权限未开启");
            return;
        }

        setVoiceRecognizeText(`待命异常：${event.error}`);
        queueWakeRecognition(900, recognitionMode);
    };

    recognition.onend = () => {
        wakeRecognition = null;
        wakeRecognitionMode = "full";
        queueWakeRecognition(180, recognitionMode);
    };

    try {
        recognition.start();
    } catch (error) {
        wakeRecognition = null;
        wakeRecognitionMode = "full";
        const message = error instanceof Error ? error.message : "启动失败";
        setVoiceRecognizeText(`待命启动失败：${message}`);
        queueWakeRecognition(500, recognitionMode);
    }
}

function enableVoiceMode(fromAuto = false) {
    if (!RecognitionCtor) {
        handleRecognitionUnsupported();
        return;
    }

    voiceModeEnabled = true;
    window.localStorage.setItem(voiceModeStorageKey, "1");

    if (fromAuto) {
        setVoiceWakeText("语音待命：尝试自动开启");
        setVoiceRecognizeText("正在恢复上次的语音待命");
        setAssistantStatus("当前状态：尝试恢复语音待命");
    } else {
        setVoiceWakeText("语音待命：正在开启");
        setVoiceRecognizeText("请允许浏览器使用麦克风");
        setAssistantStatus("当前状态：准备开启语音待命");
    }

    if (audioApi && typeof audioApi.prefetch === "function") {
        audioApi.prefetch("哎，我在，有什么需要帮助的嘛。").catch(() => {});
    }

    startWakeRecognition(false);
}

function tryAutoResumeVoiceMode() {
    if (!voiceModeEnabled || wakeAutoStartAttempted) {
        return;
    }

    wakeAutoStartAttempted = true;
    enableVoiceMode(true);
}

if (avatarStage) {
    avatarStage.addEventListener("pointermove", (event) => {
        const rect = avatarStage.getBoundingClientRect();
        const px = (event.clientX - rect.left) / rect.width - 0.5;
        const py = (event.clientY - rect.top) / rect.height - 0.5;

        page?.style.setProperty("--avatar-tilt-y", `${(px * 10).toFixed(2)}deg`);
        page?.style.setProperty("--avatar-tilt-x", `${(-py * 8).toFixed(2)}deg`);
        page?.style.setProperty("--eye-shift-x", `${(px * 6).toFixed(1)}px`);
        page?.style.setProperty("--eye-shift-y", `${(py * 4).toFixed(1)}px`);
    });

    avatarStage.addEventListener("pointerleave", () => {
        page?.style.setProperty("--avatar-tilt-y", "0deg");
        page?.style.setProperty("--avatar-tilt-x", "0deg");
        page?.style.setProperty("--eye-shift-x", "0px");
        page?.style.setProperty("--eye-shift-y", "0px");
    });
}

experimentCards.forEach((card) => {
    card.addEventListener("pointerenter", () => {
        const key = card.dataset.experiment;
        if (key) {
            prefetchExperimentSpeech(key);
        }
    });

    card.addEventListener("focus", () => {
        const key = card.dataset.experiment;
        if (key) {
            prefetchExperimentSpeech(key);
        }
    });

    card.addEventListener("click", () => {
        if (isSpeaking()) {
            stopSpeech(true);
        }

        const key = card.dataset.experiment;
        if (!key || !experiments[key]) {
            return;
        }

        updateExperiment(key, {
            autoSpeak: true,
            segmentedIntro: true,
            afterEnd: () => navigateToExperiment(key)
        });
    });
});

if (speakBtn) {
    speakBtn.addEventListener("click", () => {
        if (isSpeaking()) {
            stopSpeech();
            return;
        }

        speak(experiments[currentKey].speech, {
            afterEnd: () => navigateToExperiment(currentKey)
        });
    });
}

if (pulseBtn) {
    pulseBtn.addEventListener("click", () => {
        pulseStage();
    });
}

if (assistantSendBtn && assistantInput) {
    assistantSendBtn.addEventListener("click", () => {
        submitAssistantQuestion(assistantInput.value);
    });

    assistantInput.addEventListener("input", () => {
        renderAssistantSuggestions(assistantInput.value);
    });

    assistantInput.addEventListener("focus", () => {
        renderAssistantSuggestions(assistantInput.value);
    });

    assistantInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            submitAssistantQuestion(assistantInput.value);
        }
    });
}

if (assistantSpeechToTextBtn) {
    assistantSpeechToTextBtn.addEventListener("click", () => {
        startManualSpeechToText();
    });
}

if (assistantVoiceBtn) {
    assistantVoiceBtn.addEventListener("click", () => {
        enableVoiceMode(false);
        refreshBehaviorEmotionDashboard();
    });
}

if (assistantVoiceStopBtn) {
    assistantVoiceStopBtn.addEventListener("click", () => {
        disableVoiceMode();
    });
}

assistantQuestionChips.forEach((chip) => {
    chip.addEventListener("click", () => {
        submitAssistantQuestion(chip.dataset.assistantQuestion || "");
    });
});

if (challengeRevealBtn) {
    challengeRevealBtn.addEventListener("click", () => {
        if (!challengeAnswer) {
            return;
        }

        const hidden = challengeAnswer.classList.toggle("is-hidden");
        challengeRevealBtn.textContent = hidden ? "显示提示" : "收起答案";
        if (!hidden) {
            emotionBehaviorState.hintCount += 1;
            refreshBehaviorEmotionDashboard();
        }
    });
}

if (challengeNextBtn) {
    challengeNextBtn.addEventListener("click", () => {
        const list = challengeBank[currentKey] || challengeBank.gate;
        challengeIndexMap[currentKey] = (challengeIndexMap[currentKey] + 1) % list.length;
        renderChallenge(currentKey);
    });
}

refreshBehaviorEmotionDashboard();

if (synth) {
    getChineseVoice();
    window.speechSynthesis.onvoiceschanged = () => {
        getChineseVoice();
        setGuideMode(false);
    };
}

window.addEventListener("load", () => {
    updateExperiment(currentKey);
    setAssistantStatus("当前状态：待命");
    renderAssistantSuggestions("");

    if (!RecognitionCtor) {
        handleRecognitionUnsupported();
        return;
    }

    if (voiceModeEnabled) {
        setVoiceWakeText("语音待命：准备自动恢复");
        setVoiceRecognizeText("如果浏览器允许，将自动进入待命");
        window.setTimeout(() => {
            tryAutoResumeVoiceMode();
        }, 600);
    } else {
        setVoiceWakeText("语音待命：未开启");
        setVoiceRecognizeText("点击“开启语音待命”后，可直接说“小芯小芯”");
    }
});

window.addEventListener("focus", () => {
    if (voiceModeEnabled && !isSpeaking()) {
        queueWakeRecognition(300);
    }
});

window.addEventListener("pagehide", () => {
    stopSpeech(true);
    abortAssistantRequest();
    pauseVoiceRecognition();
});

window.addEventListener("beforeunload", () => {
    stopSpeech(true);
    abortAssistantRequest();
    pauseVoiceRecognition();
});

document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
        stopSpeech(true);
        pauseVoiceRecognition();
        return;
    }

    if (voiceModeEnabled) {
        queueWakeRecognition(400);
    }
});
