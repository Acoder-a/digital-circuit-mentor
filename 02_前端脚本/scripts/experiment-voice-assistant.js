(function () {
    const hooks = window.__experimentVoiceHooks;
    if (!hooks) {
        return;
    }

    const RecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition || null;
    const synth = window.speechSynthesis || null;
    const bubbleText = document.getElementById("bubbleText");
    const voiceState = document.getElementById("voiceState");
    const focusState = document.getElementById("focusState");
    const mentorTitle = document.querySelector(".mentor-bubble h2");
    const emotionPanel = document.getElementById("emotionPanel");
    const emotionLabel = document.getElementById("emotionLabel");
    const emotionConfidence = document.getElementById("emotionConfidence");
    const emotionSourceText = document.getElementById("emotionSourceText");
    const emotionSourceVoice = document.getElementById("emotionSourceVoice");
    const emotionSourceBehavior = document.getElementById("emotionSourceBehavior");
    const emotionStrategy = document.getElementById("emotionStrategy");
    const emotionOutput = document.getElementById("emotionOutput");
    const live2dHostApi = window.__live2dHostApi || null;
    const audioApi = window.__digitalHumanAudioApi || null;
    const voiceProfile = window.__digitalHumanVoiceProfile || null;
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
    const wakeAliases = ["小芯小芯", "小芯", "小新小新", "小新", "晓芯晓芯", "晓芯", "晓欣晓欣", "晓欣", "小心小心", "小心"];
    const wakeAliasPattern = /(小芯小芯|小芯|小新小新|小新|晓芯晓芯|晓芯|晓欣晓欣|晓欣|小心小心|小心)/gu;
    const assistantSessionStorageKey = `xiaoxin_experiment_session:${window.location.pathname}`;

    let wakeRecognition = null;
    let questionRecognition = null;
    let wakeResumeTimer = null;
    let assistantAbortController = null;
    let currentUtterance = null;
    let speechTextSyncTimer = null;
    let interruptFollowupTimer = null;
    let autoBootTried = false;
    let wakeRecognitionMode = "full";
    let wakeHealthTimer = null;
    let wakeListening = false;
    let liveAnswerState = null;
    let currentEmotionState = null;
    let speechSession = 0;
    let pendingVoiceTranscript = "";
    let activeAcousticCapture = null;
    const emotionBehaviorState = {
        hintCount: 0,
        questionCount: 0,
        repeatedCount: 0,
        failureCount: 0,
        lastNormalizedQuestion: ""
    };
    const assistantSessionId = getOrCreateAssistantSessionId(assistantSessionStorageKey, "experiment");

    if (mentorTitle) {
        mentorTitle.textContent = "实验助手“小芯”";
    }

    function setVoiceStatus(text) {
        if (typeof hooks.setVoiceStatus === "function") {
            hooks.setVoiceStatus(text);
            return;
        }
        if (voiceState) {
            voiceState.textContent = text;
        }
    }

    function setFocusStatus(text) {
        if (typeof hooks.setFocusStatus === "function") {
            hooks.setFocusStatus(text);
            return;
        }
        if (focusState) {
            focusState.textContent = text;
        }
    }

    function setStepHint(text) {
        if (typeof hooks.setStepHint === "function") {
            hooks.setStepHint(text);
        }
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

    function clampNumber(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function summarizeAcousticFrames(frames, durationMs) {
        if (!frames.length) {
            return {
                label: "neutral",
                confidence: 0.12,
                source: "voice",
                inactive: true,
                acoustic: true
            };
        }

        const avg = (key) => frames.reduce((sum, frame) => sum + frame[key], 0) / frames.length;
        const rms = avg("rms");
        const zcr = avg("zcr");
        const peak = avg("peak");
        const voicedRatio = frames.filter((frame) => frame.rms > 0.018).length / frames.length;
        const energyVariance = frames.reduce((sum, frame) => sum + Math.pow(frame.rms - rms, 2), 0) / frames.length;
        const energyStd = Math.sqrt(energyVariance);
        const durationSeconds = Math.max(Number(durationMs || 0) / 1000, 0.1);

        const scores = {
            happy: 0.18,
            confused: 0.12,
            anxious: 0.14,
            frustrated: 0.12,
            neutral: 0.28
        };

        if (rms > 0.045 && energyStd > 0.018) {
            scores.frustrated += 0.48;
        }
        if (zcr > 0.15 || energyStd > 0.026) {
            scores.anxious += 0.42;
        }
        if (rms > 0.026 && rms < 0.065 && zcr < 0.16 && voicedRatio > 0.62) {
            scores.happy += 0.32;
        }
        if (voicedRatio < 0.42 || (durationSeconds > 2.2 && rms < 0.032)) {
            scores.confused += 0.32;
        }
        if (peak > 0.28 && energyStd > 0.022) {
            scores.frustrated += 0.2;
        }

        const [label, score] = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
        return {
            label,
            confidence: clampNumber(0.38 + score * 0.42, 0.28, 0.84),
            source: "voice",
            acoustic: true,
            metrics: {
                rms,
                zcr,
                peak,
                voicedRatio,
                energyStd,
                durationSeconds
            }
        };
    }

    function mergeAudioChunks(chunks, totalLength) {
        const merged = new Float32Array(totalLength);
        let offset = 0;

        chunks.forEach((chunk) => {
            merged.set(chunk, offset);
            offset += chunk.length;
        });

        return merged;
    }

    function encodeWav(samples, sampleRate) {
        const dataLength = samples.length * 2;
        const buffer = new ArrayBuffer(44 + dataLength);
        const view = new DataView(buffer);

        function writeString(offset, value) {
            for (let index = 0; index < value.length; index += 1) {
                view.setUint8(offset + index, value.charCodeAt(index));
            }
        }

        writeString(0, "RIFF");
        view.setUint32(4, 36 + dataLength, true);
        writeString(8, "WAVE");
        writeString(12, "fmt ");
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * 2, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        writeString(36, "data");
        view.setUint32(40, dataLength, true);

        let offset = 44;
        for (let index = 0; index < samples.length; index += 1) {
            const sample = Math.max(-1, Math.min(1, samples[index] || 0));
            view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
            offset += 2;
        }

        return buffer;
    }

    function arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = "";

        for (let index = 0; index < bytes.length; index += 1) {
            binary += String.fromCharCode(bytes[index]);
        }

        return window.btoa(binary);
    }

    async function requestAudioEmotionFromModel(audioBase64) {
        const response = await fetch(`${assistantApiBase}/api/audio-emotion`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ audioBase64 })
        });

        const payload = await response.json().catch(() => null);
        if (!response.ok) {
            throw new Error(payload?.detail || payload?.error || `HTTP ${response.status}`);
        }

        return payload;
    }

    async function startAcousticEmotionCapture() {
        const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
        if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function" || !AudioContextCtor) {
            return null;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });
            const audioContext = new AudioContextCtor();
            const source = audioContext.createMediaStreamSource(stream);
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 1024;
            analyser.smoothingTimeConstant = 0.25;
            source.connect(analyser);

            const processor = audioContext.createScriptProcessor(4096, 1, 1);
            source.connect(processor);
            processor.connect(audioContext.destination);

            const pcmChunks = [];
            let pcmLength = 0;
            const frames = [];
            const startedAt = performance.now();

            processor.onaudioprocess = (event) => {
                const input = event.inputBuffer.getChannelData(0);
                const chunk = new Float32Array(input.length);
                chunk.set(input);
                pcmChunks.push(chunk);
                pcmLength += chunk.length;

                let sumSquares = 0;
                let crossings = 0;
                let peak = 0;
                let previous = chunk[0] || 0;

                for (let index = 0; index < chunk.length; index += 1) {
                    const value = chunk[index] || 0;
                    sumSquares += value * value;
                    peak = Math.max(peak, Math.abs(value));
                    if ((previous >= 0 && value < 0) || (previous < 0 && value >= 0)) {
                        crossings += 1;
                    }
                    previous = value;
                }

                frames.push({
                    rms: Math.sqrt(sumSquares / chunk.length),
                    zcr: crossings / chunk.length,
                    peak
                });
            };

            return {
                async stop() {
                    processor.onaudioprocess = null;
                    try {
                        processor.disconnect();
                    } catch (_error) {
                        // ignore
                    }
                    try {
                        source.disconnect();
                    } catch (_error) {
                        // ignore
                    }
                    stream.getTracks().forEach((track) => track.stop());
                    if (typeof audioContext.close === "function") {
                        audioContext.close().catch(() => {});
                    }

                    const fallbackEmotion = summarizeAcousticFrames(frames, performance.now() - startedAt);
                    if (!pcmLength) {
                        return fallbackEmotion;
                    }

                    try {
                        const merged = mergeAudioChunks(pcmChunks, pcmLength);
                        const wavBuffer = encodeWav(merged, audioContext.sampleRate || 44100);
                        const remoteEmotion = await requestAudioEmotionFromModel(arrayBufferToBase64(wavBuffer));
                        return {
                            label: String(remoteEmotion?.label || fallbackEmotion.label || "neutral"),
                            confidence: Number(remoteEmotion?.confidence || fallbackEmotion.confidence || 0.35),
                            source: "voice",
                            model: remoteEmotion?.model || "",
                            rawLabel: remoteEmotion?.rawLabel || ""
                        };
                    } catch (_error) {
                        return fallbackEmotion;
                    }
                }
            };
        } catch (_error) {
            return null;
        }
    }

    async function stopActiveAcousticCapture() {
        if (!activeAcousticCapture || typeof activeAcousticCapture.stop !== "function") {
            activeAcousticCapture = null;
            return null;
        }

        const result = await activeAcousticCapture.stop();
        activeAcousticCapture = null;
        return result;
    }

    async function fetchAssistantStreamResponse(query, signal, maxAttempts = 2) {
        let attempt = 0;
        const accessToken = window.DigitalMentorAuth?.token?.();

        while (attempt < maxAttempts) {
            try {
                const response = await fetch(
                    `${assistantApiBase}/api/chat/stream?${query.toString()}`,
                    { signal, headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} }
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

                setVoiceStatus("网络重试中");
                setFocusStatus("小芯问答");
                setStepHint(`请求有点波动，我正在第 ${attempt + 1} 次尝试重新连接。`);
                await waitAssistantDelay(320 * attempt);
            }
        }

        throw new Error("请求失败");
    }

    function stopRecognition(recognition) {
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

    function clearWakeResumeTimer() {
        window.clearTimeout(wakeResumeTimer);
        wakeResumeTimer = null;
    }

    function clearInterruptFollowupTimer() {
        window.clearTimeout(interruptFollowupTimer);
        interruptFollowupTimer = null;
    }

    function clearWakeHealthTimer() {
        window.clearInterval(wakeHealthTimer);
        wakeHealthTimer = null;
    }

function queueInterruptFollowup(callback) {
    clearInterruptFollowupTimer();
    interruptFollowupTimer = window.setTimeout(() => {
        interruptFollowupTimer = null;
        callback();
    }, 350);
}

    function pauseVoiceRecognition() {
        clearWakeResumeTimer();
        clearInterruptFollowupTimer();
        wakeListening = false;
        stopActiveAcousticCapture().catch(() => {});

        if (wakeRecognition) {
            stopRecognition(wakeRecognition);
            wakeRecognition = null;
        }

        if (questionRecognition) {
            stopRecognition(questionRecognition);
            questionRecognition = null;
        }
    }

    function getChineseVoice() {
        if (!synth) {
            return null;
        }

        if (voiceProfile && typeof voiceProfile.getPreferredVoice === "function") {
            return voiceProfile.getPreferredVoice();
        }

        const voices = synth.getVoices();
        const chineseVoices = voices.filter((voice) => voice.lang === "zh-CN" || voice.lang.includes("zh"));
        const preferredKeywords = ["xiaoxiao", "xiaoyi", "xiaohan", "xiaomeng", "tingting", "female"];

        return chineseVoices.find((voice) => {
            const name = voice.name.toLowerCase();
            return preferredKeywords.some((keyword) => name.includes(keyword));
        }) || chineseVoices[0] || null;
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
                browserRate: 0.9,
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
    }

    function createMultimodalEmotionState(text, options = {}) {
        const emotionApi = window.__digitalHumanEmotion;
        if (!emotionApi || typeof emotionApi.buildState !== "function") {
            return detectUserEmotion(text);
        }

        const normalizedQuestion = normalizeTranscript(text);
        emotionBehaviorState.questionCount += 1;
        if (normalizedQuestion && normalizedQuestion === emotionBehaviorState.lastNormalizedQuestion) {
            emotionBehaviorState.repeatedCount += 1;
        }
        emotionBehaviorState.lastNormalizedQuestion = normalizedQuestion;

        const isVoiceInput = options.inputMode === "voice" || (pendingVoiceTranscript && pendingVoiceTranscript === String(text || "").trim());
        const textEmotion = emotionApi.detectText(text);
        const voiceEmotion = typeof emotionApi.detectVoice === "function"
            ? emotionApi.detectVoice(text, {
                enabled: isVoiceInput || wakeListening,
                fromWake: options.fromWake,
                interrupted: options.interrupted,
                audioEmotion: options.audioEmotion || null
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

    function stopSpeech() {
        clearInterruptFollowupTimer();

        if (assistantAbortController) {
            assistantAbortController.abort();
            assistantAbortController = null;
        }

        clearSpeechTextSyncTimer();

        if (synth && (synth.speaking || synth.pending)) {
            synth.cancel();
        }

        if (audioApi && typeof audioApi.stop === "function") {
            audioApi.stop();
        }

        speechSession += 1;
        liveAnswerState = null;
        currentUtterance = null;
        if (live2dHostApi && typeof live2dHostApi.stopLipSync === "function") {
            live2dHostApi.stopLipSync();
        }
        if (live2dHostApi && typeof live2dHostApi.forceCloseMouth === "function") {
            live2dHostApi.forceCloseMouth();
        }
    }

    function setBubbleText(text, isStreaming = false) {
        if (!bubbleText) {
            return;
        }

        bubbleText.textContent = text;
        bubbleText.classList.toggle("is-streaming", isStreaming);
        bubbleText.scrollTop = bubbleText.scrollHeight;
    }

    function clearSpeechTextSyncTimer() {
        window.clearTimeout(speechTextSyncTimer);
        speechTextSyncTimer = null;
    }

    function startSpeechSyncedBubbleText(text, baseDelay = 126) {
        clearSpeechTextSyncTimer();
        setBubbleText("", true);

        const characters = Array.from(text);
        let index = 0;

        function next() {
            if (index >= characters.length) {
                return;
            }

            const character = characters[index];
            index += 1;
            setBubbleText(characters.slice(0, index).join(""), true);

            if (index < characters.length) {
                speechTextSyncTimer = window.setTimeout(
                    next,
                    baseDelay + ("，。！？；".includes(character) ? 120 : 0)
                );
            }
        }

        speechTextSyncTimer = window.setTimeout(next, 180);
    }

    function syncSpeechBubbleToBoundary(text, event) {
        clearSpeechTextSyncTimer();
        const characters = Array.from(text);
        const nextIndex = Math.min(characters.length, Math.max(1, Number(event?.charIndex ?? 0) + 1));
        setBubbleText(characters.slice(0, nextIndex).join(""), true);
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

        setBubbleText("", true);
        return liveAnswerState;
    }

    function renderLiveAnswerBubble(state) {
        if (!state || state.sessionId !== speechSession) {
            return;
        }

        setBubbleText(state.displayText.slice(0, state.visualCursor), true);
    }

    function collectSpeakableSegments(state, forceFlush = false) {
        if (!state) {
            return;
        }

        const pendingText = state.displayText.slice(state.spokenCursor);
        if (!pendingText) {
            return;
        }

        const matcher = /.+?[。！？；\n]/gu;
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
        setBubbleText(finalText, false);
        setVoiceStatus("待命");

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

        if (audioApi && typeof audioApi.speak === "function") {
            state.speakingSegment = true;
            const speechOptions = getEmotionSpeechOptions(state.emotion);

            audioApi.speak(segment, {
                playbackRate: speechOptions.playbackRate,
                ttsInstruction: speechOptions.ttsInstruction,
                onStart: () => {
                    if (!liveAnswerState || liveAnswerState.sessionId !== state.sessionId) {
                        return;
                    }

                    pauseVoiceRecognition();
                    applyDigitalHumanEmotion(state.emotion, 3600);
                    currentUtterance = { mode: "audio", segment };
                    queueWakeRecognition(120, "interrupt");
                    state.activeSegmentStart = state.visualCursor;
                    setVoiceStatus("讲解中");
                    setFocusStatus("小芯回答");
                    renderLiveAnswerBubble(state);
                },
                onBoundary: (event) => {
                    if (!liveAnswerState || liveAnswerState.sessionId !== state.sessionId) {
                        return;
                    }

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
                    pumpLiveAnswerSpeechQueue();
                },
                onError: () => {
                    if (!liveAnswerState || liveAnswerState.sessionId !== state.sessionId) {
                        return;
                    }

                    state.speakingSegment = false;
                    currentUtterance = null;
                    pumpLiveAnswerSpeechQueue();
                }
            }).catch(() => {
                if (!liveAnswerState || liveAnswerState.sessionId !== state.sessionId) {
                    return;
                }

                state.speakingSegment = false;
                currentUtterance = null;
                pumpLiveAnswerSpeechQueue();
            });

            return;
        }

        state.queue = [];
        if (state.finalized) {
            finishLiveAnswerStream(state, state.displayText, true);
        }
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

    function speakWithWakeSyncFallback(text, afterEnd = null) {
        const content = sanitizeAssistantText(text);
        if (!content) {
            if (afterEnd) {
                afterEnd();
            }
            return;
        }

        stopSpeech();
        setBubbleText(content, false);
        setVoiceStatus("讲解中");
        setFocusStatus("小芯回答");

        const speechEmotion = currentEmotionState || detectUserEmotion(content);
        const emotionSpeechOptions = getEmotionSpeechOptions(speechEmotion);

        if (audioApi && typeof audioApi.speak === "function") {
            currentUtterance = { mode: "audio", text: content };

            audioApi.speak(content, {
                playbackRate: emotionSpeechOptions.playbackRate,
                ttsInstruction: emotionSpeechOptions.ttsInstruction,
                onStart: () => {
                    pauseVoiceRecognition();
                    applyDigitalHumanEmotion(speechEmotion, 3600);
                    queueWakeRecognition(120, "interrupt");
                    startSpeechSyncedBubbleText(content, 126);
                },
                onBoundary: (event) => {
                    syncSpeechBubbleToBoundary(content, event);
                },
                onEnd: () => {
                    currentUtterance = null;
                    setVoiceStatus("寰呭懡");
                    setBubbleText(content, false);
                    queueWakeRecognition(700, "full");
                    if (afterEnd) {
                        afterEnd();
                    }
                },
                onError: () => {
                    currentUtterance = null;
                    setVoiceStatus("寰呭懡");
                    setBubbleText(content, false);
                    queueWakeRecognition(900, "full");
                    if (afterEnd) {
                        afterEnd();
                    }
                }
            }).catch(() => {
                currentUtterance = null;
                setVoiceStatus("寰呭懡");
                setBubbleText(content, false);
                if (afterEnd) {
                    afterEnd();
                }
            });

            return;
        }

        if (afterEnd) {
            afterEnd();
        }
        return;

        if (audioApi && typeof audioApi.speak === "function") {
            currentUtterance = { mode: "audio", text: content };

            audioApi.speak(content, {
                playbackRate: 1,
                onStart: () => {
                    pauseVoiceRecognition();
                    queueWakeRecognition(120, "interrupt");
                    startSpeechSyncedBubbleText(content, 126);
                },
                onBoundary: (event) => {
                    syncSpeechBubbleToBoundary(content, event);
                },
                onEnd: () => {
                    currentUtterance = null;
                    setVoiceStatus("寰呭懡");
                    setBubbleText(content, false);
                    queueWakeRecognition(700, "full");
                    if (afterEnd) {
                        afterEnd();
                    }
                },
                onError: () => {
                    currentUtterance = null;
                    setVoiceStatus("寰呭懡");
                    setBubbleText(content, false);
                    queueWakeRecognition(900, "full");
                    if (afterEnd) {
                        afterEnd();
                    }
                }
            }).catch(() => {
                currentUtterance = null;
                setVoiceStatus("寰呭懡");
                setBubbleText(content, false);
                if (afterEnd) {
                    afterEnd();
                }
            });

            return;
        }

        if (audioApi && typeof audioApi.speak === "function") {
            currentUtterance = { mode: "audio", text: content };

            audioApi.speak(content, {
                playbackRate: 1,
                onStart: () => {
                    pauseVoiceRecognition();
                    queueWakeRecognition(120, "interrupt");
                    startSpeechSyncedBubbleText(content, 126);
                },
                onBoundary: (event) => {
                    syncSpeechBubbleToBoundary(content, event);
                },
                onEnd: () => {
                    currentUtterance = null;
                    setVoiceStatus("寰呭懡");
                    setBubbleText(content, false);
                    queueWakeRecognition(700, "full");
                    if (afterEnd) {
                        afterEnd();
                    }
                },
                onError: () => {
                    currentUtterance = null;
                    setVoiceStatus("寰呭懡");
                    setBubbleText(content, false);
                    queueWakeRecognition(900, "full");
                    if (afterEnd) {
                        afterEnd();
                    }
                }
            }).catch(() => {
                currentUtterance = null;
                setVoiceStatus("寰呭懡");
                setBubbleText(content, false);
                if (afterEnd) {
                    afterEnd();
                }
            });

            return;
        }

        if (!synth || typeof SpeechSynthesisUtterance === "undefined") {
            setVoiceStatus("待命");
            if (afterEnd) {
                afterEnd();
            }
            return;
        }

        const utterance = new SpeechSynthesisUtterance(content);
        const voice = getChineseVoice();
        currentUtterance = utterance;

        if (voice) {
            utterance.voice = voice;
        }

        if (voiceProfile && typeof voiceProfile.applyUtterance === "function") {
            voiceProfile.applyUtterance(utterance);
        } else {
            utterance.lang = "zh-CN";
            utterance.rate = 0.9;
            utterance.pitch = 1.2;
            utterance.volume = 1;
        }
        utterance.rate = emotionSpeechOptions.browserRate;
        utterance.pitch = emotionSpeechOptions.browserPitch;

        utterance.onstart = () => {
            applyDigitalHumanEmotion(speechEmotion, 3600);
            if (live2dHostApi && typeof live2dHostApi.startLipSync === "function") {
                live2dHostApi.startLipSync(content);
            }
        };

        utterance.onboundary = (event) => {
            if (live2dHostApi && typeof live2dHostApi.handleSpeechBoundary === "function") {
                live2dHostApi.handleSpeechBoundary(event);
            }
        };

        utterance.onend = () => {
            currentUtterance = null;
            setVoiceStatus("待命");
            if (live2dHostApi && typeof live2dHostApi.stopLipSync === "function") {
                live2dHostApi.stopLipSync();
            }
            if (live2dHostApi && typeof live2dHostApi.forceCloseMouth === "function") {
                live2dHostApi.forceCloseMouth();
            }
            if (afterEnd) {
                afterEnd();
            }
        };

        utterance.onerror = () => {
            currentUtterance = null;
            setVoiceStatus("待命");
            if (live2dHostApi && typeof live2dHostApi.stopLipSync === "function") {
                live2dHostApi.stopLipSync();
            }
            if (live2dHostApi && typeof live2dHostApi.forceCloseMouth === "function") {
                live2dHostApi.forceCloseMouth();
            }
            if (afterEnd) {
                afterEnd();
            }
        };

        synth.speak(utterance);
    }

    function speak(text, afterEnd = null) {
        const content = sanitizeAssistantText(text);
        if (!content) {
            if (afterEnd) {
                afterEnd();
            }
            return;
        }

        speakWithWakeSyncFallback(content, afterEnd);
        return;

        stopSpeech();
        setBubbleText("", true);
        setVoiceStatus("讲解中");
        setFocusStatus("小芯回答");

        if (!synth || typeof SpeechSynthesisUtterance === "undefined") {
            setBubbleText(content, false);
            setVoiceStatus("待命");
            if (afterEnd) {
                afterEnd();
            }
            return;
        }

        const utterance = new SpeechSynthesisUtterance(content);
        const voice = getChineseVoice();
        currentUtterance = utterance;

        if (voice) {
            utterance.voice = voice;
        }

        if (voiceProfile && typeof voiceProfile.applyUtterance === "function") {
            voiceProfile.applyUtterance(utterance);
        } else {
            utterance.lang = "zh-CN";
            utterance.rate = 0.9;
            utterance.pitch = 1.2;
            utterance.volume = 1;
        }

        utterance.onstart = () => {
            pauseVoiceRecognition();
            queueWakeRecognition(120, "interrupt");
            if (live2dHostApi && typeof live2dHostApi.startLipSync === "function") {
                live2dHostApi.startLipSync(content);
            }
            startSpeechSyncedBubbleText(content, 126);
        };

        utterance.onboundary = (event) => {
            if (live2dHostApi && typeof live2dHostApi.handleSpeechBoundary === "function") {
                live2dHostApi.handleSpeechBoundary(event);
            }
            syncSpeechBubbleToBoundary(content, event);
        };

        utterance.onend = () => {
            currentUtterance = null;
            setVoiceStatus("待命");
            if (live2dHostApi && typeof live2dHostApi.stopLipSync === "function") {
                live2dHostApi.stopLipSync();
            }
            if (live2dHostApi && typeof live2dHostApi.forceCloseMouth === "function") {
                live2dHostApi.forceCloseMouth();
            }
            setBubbleText(content, false);
            queueWakeRecognition(700, "full");
            if (afterEnd) {
                afterEnd();
            }
        };

        utterance.onerror = () => {
            currentUtterance = null;
            setVoiceStatus("待命");
            if (live2dHostApi && typeof live2dHostApi.stopLipSync === "function") {
                live2dHostApi.stopLipSync();
            }
            if (live2dHostApi && typeof live2dHostApi.forceCloseMouth === "function") {
                live2dHostApi.forceCloseMouth();
            }
            setBubbleText(content, false);
            queueWakeRecognition(900, "full");
            if (afterEnd) {
                afterEnd();
            }
        };

        synth.speak(utterance);
    }

    function normalizeTranscript(text) {
        return String(text || "")
            .replace(/\s+/g, "")
            .replace(/[，。！？、,.!?：；"'`]/g, "");
    }

    function extractQuestionAfterWake(text) {
        return String(text || "")
            .replace(wakeAliasPattern, "")
            .replace(/^[，。！？、,.!?：；\s]+/u, "")
            .trim();
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
        return Boolean(
            assistantAbortController
            || currentUtterance
            || (audioApi && typeof audioApi.isSpeaking === "function" && audioApi.isSpeaking())
            || (synth && (synth.speaking || synth.pending))
        );
    }

    // Canonical interrupt question extractor used by the active wake/interrupt flow.
    function extractQuestionAfterInterrupt(text) {
        return String(text || "")
            .replace(interruptAliasPattern, "")
            .replace(/^[,.;:!?\uFF0C\u3002\uFF01\uFF1F\uFF1A\uFF1B\s]+/u, "")
            .trim();
    }

    function queueWakeRecognition(delay = 250, mode = "full") {
        clearWakeResumeTimer();

        if (
            !RecognitionCtor
            || document.hidden
            || questionRecognition
        ) {
            return;
        }

        if (
            mode === "full"
            && (
                currentUtterance
                || assistantAbortController
                || (audioApi && typeof audioApi.isSpeaking === "function" && audioApi.isSpeaking())
                || (synth && (synth.speaking || synth.pending))
            )
        ) {
            return;
        }

        wakeResumeTimer = window.setTimeout(() => {
            startWakeRecognition(true, mode);
        }, delay);
    }

    function ensureWakeRecognitionActive() {
        if (
            !RecognitionCtor
            || document.hidden
            || wakeRecognition
            || questionRecognition
            || wakeRecognitionMode === "interrupt"
            || currentUtterance
            || assistantAbortController
            || interruptFollowupTimer
            || (audioApi && typeof audioApi.isSpeaking === "function" && audioApi.isSpeaking())
            || (synth && (synth.speaking || synth.pending))
        ) {
            return;
        }

        queueWakeRecognition(180, "full");
    }

    function startWakeHealthMonitor() {
        clearWakeHealthTimer();
        wakeHealthTimer = window.setInterval(() => {
            if (wakeListening) {
                return;
            }

            ensureWakeRecognitionActive();
        }, 2200);
    }

    function isDemoIntent(text) {
        const normalized = String(text || "")
            .replace(/\s+/g, "")
            .replace(/[，。！？；、,.!?]/g, "");

        const keywords = [
            "演示一遍整个实验",
            "演示整个实验",
            "完整演示整个实验",
            "完整演示一遍",
            "自动演示整个实验",
            "你可以演示一遍整个实验吗",
            "帮我演示一遍",
            "示范一遍整个实验",
            "完整示范一遍"
        ];

        return keywords.some((keyword) => normalized.includes(keyword));
    }

    function isAssemblyDemoIntent(text) {
        const normalized = String(text || "")
            .replace(/\s+/g, "")
            .replace(/[锛屻€傦紒锛燂紱銆?.!?]/g, "");

        const keywords = [
            "演示实验台部分",
            "请演示实验台部分",
            "演示实验台",
            "请演示实验台",
            "演示拼装部分",
            "演示连线部分",
            "演示拖拽连线",
            "自动演示实验台",
            "实验台也演示一下",
            "帮我演示实验台"
        ];

        return keywords.some((keyword) => normalized.includes(keyword));
    }

    function tryStartAssemblyDemo(question) {
        if (!isAssemblyDemoIntent(question) || typeof hooks.startAssemblyDemo !== "function") {
            return false;
        }

        if (typeof hooks.interrupt === "function") {
            hooks.interrupt();
        } else {
            stopSpeech();
        }

        pauseVoiceRecognition();
        setVoiceStatus("准备演示");
        setFocusStatus("实验台自动演示");
        setStepHint("小芯即将自动演示当前实验的实验台拼装与连线过程，请观察器件放置和接线顺序。");

        speak("可以，我来为你演示实验台部分。我会一边讲解，一边完成器件拼装和连线。", () => {
            Promise.resolve(hooks.startAssemblyDemo())
                .catch(() => {})
                .finally(() => {
                    queueWakeRecognition(900);
                });
        });

        return true;
    }

    const experimentNavigationIntents = [
        {
            key: "gate",
            path: "experiment-gate.html",
            title: "基础逻辑门实验",
            aliases: ["基础逻辑门", "逻辑门", "实验一"]
        },
        {
            key: "half-adder",
            path: "experiment-half-adder.html",
            title: "半加器实验",
            aliases: ["半加器", "实验二"]
        },
        {
            key: "decoder",
            path: "experiment-decoder.html",
            title: "三八译码器实验",
            aliases: ["三八译码器", "38译码器", "译码器", "实验三"]
        },
        {
            key: "flip-flop",
            path: "experiment-flip-flop.html",
            title: "D触发器实验",
            aliases: ["d触发器", "d 触发器", "触发器", "实验四"]
        }
    ];

    function getExperimentNavigationTarget(text) {
        const normalized = String(text || "")
            .toLowerCase()
            .replace(/\s+/g, "")
            .replace(/[锛屻€傦紒锛燂紱銆?,.!?:;]/g, "");

        const hasNavigationIntent = [
            "想做",
            "想去",
            "我要做",
            "我要去",
            "切换到",
            "跳转到",
            "进入",
            "打开",
            "去做",
            "去"
        ].some((keyword) => normalized.includes(keyword));

        if (!hasNavigationIntent) {
            return null;
        }

        return experimentNavigationIntents.find((item) => {
            return item.aliases.some((alias) => normalized.includes(alias.toLowerCase().replace(/\s+/g, "")));
        }) || null;
    }

    function tryNavigateToExperiment(question) {
        const target = getExperimentNavigationTarget(question);
        if (!target) {
            return false;
        }

        const currentPath = String(window.location.pathname || "").toLowerCase();
        const targetPath = `/${target.path}`.toLowerCase();
        const alreadyHere = currentPath.endsWith(targetPath) || currentPath.endsWith(target.path.toLowerCase());

        if (typeof hooks.interrupt === "function") {
            hooks.interrupt();
        } else {
            stopSpeech();
        }

        pauseVoiceRecognition();
        setVoiceStatus("准备跳转");
        setFocusStatus("实验切换");

        if (alreadyHere) {
            setStepHint(`当前已经在${target.title}，你可以直接开始提问或让我演示。`);
            speak(`当前已经在${target.title}，你可以直接开始操作，我也可以继续为你讲解。`, () => {
                queueWakeRecognition(900);
            });
            return true;
        }

        setStepHint(`小芯即将带你跳转到${target.title}。`);
        speak(`好的，我现在带你进入${target.title}。`, () => {
            window.location.href = target.path;
        });
        return true;
    }

    function tryStartLocalDemo(question) {
        if (!isDemoIntent(question) || typeof hooks.startDemo !== "function") {
            return false;
        }

        if (typeof hooks.interrupt === "function") {
            hooks.interrupt();
        } else {
            stopSpeech();
        }

        pauseVoiceRecognition();
        setVoiceStatus("准备演示");
        setFocusStatus("自动演示");
        setStepHint("小芯即将自动演示当前实验的完整过程，请观察实验台上的每一步操作。");

        speak("可以，我来为你完整演示一遍这个实验。你可以边看边听我的讲解。", () => {
            Promise.resolve(hooks.startDemo())
                .catch(() => {})
                .finally(() => {
                    queueWakeRecognition(900);
                });
        });

        return true;
    }

    // Legacy whole-answer implementation retained only for rollback reference.
    async function askAssistantLegacy(question, options = {}) {
        const content = String(question || "").trim();
        if (!content) {
            return;
        }

        if (tryNavigateToExperiment(content)) {
            return;
        }

        if (tryStartAssemblyDemo(content)) {
            return;
        }

        if (tryStartLocalDemo(content)) {
            return;
        }

        currentEmotionState = createMultimodalEmotionState(content, options);
        applyDigitalHumanEmotion(currentEmotionState, 5600);

        if (typeof hooks.interrupt === "function") {
            hooks.interrupt();
        } else {
            stopSpeech();
        }

        pauseVoiceRecognition();

        if (assistantAbortController) {
            assistantAbortController.abort();
        }

        const experimentName = typeof hooks.getExperimentName === "function"
            ? hooks.getExperimentName()
            : document.title;
        const experimentState = typeof hooks.getExperimentState === "function"
            ? hooks.getExperimentState()
            : {};

        assistantAbortController = new AbortController();
        setVoiceStatus("思考中");
        setFocusStatus("小芯问答");
        setStepHint(`小芯已收到你的问题：${content}`);
        setBubbleText("小芯正在结合当前实验思考，请稍等。", true);

        try {
            const query = new URLSearchParams({
                question: content,
                experimentName,
                experimentState: JSON.stringify(experimentState),
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
                        setBubbleText(sanitizeAssistantText(finalText), true);
                    }
                }
            }

            finalText = sanitizeAssistantText(finalText).trim() || "我刚刚没有组织出合适的回答，你可以再问我一次。";
            setBubbleText(finalText, false);
            speak(finalText, () => {
                queueWakeRecognition(600);
            });
        } catch (error) {
            if (error instanceof DOMException && error.name === "AbortError") {
                return;
            }

            const message = error instanceof Error ? error.message : "调用失败";
            const fallback = `抱歉，我刚刚没有回答成功。${message}`;
            setBubbleText(fallback, false);
            speak(fallback, () => {
                queueWakeRecognition(800);
            });
        } finally {
            assistantAbortController = null;
        }
    }

    askAssistant = async function askAssistantStreaming(question, options = {}) {
        const content = String(question || "").trim();
        if (!content) {
            return;
        }

        if (tryNavigateToExperiment(content)) {
            return;
        }

        if (tryStartAssemblyDemo(content)) {
            return;
        }

        if (tryStartLocalDemo(content)) {
            return;
        }

        currentEmotionState = createMultimodalEmotionState(content, options);
        applyDigitalHumanEmotion(currentEmotionState, 5600);

        if (typeof hooks.interrupt === "function") {
            hooks.interrupt();
        } else {
            stopSpeech();
        }

        pauseVoiceRecognition();

        if (assistantAbortController) {
            assistantAbortController.abort();
        }

        const experimentName = typeof hooks.getExperimentName === "function"
            ? hooks.getExperimentName()
            : document.title;
        const experimentState = typeof hooks.getExperimentState === "function"
            ? hooks.getExperimentState()
            : {};

        assistantAbortController = new AbortController();
        setVoiceStatus("思考中");
        setFocusStatus("小芯问答");
        setStepHint(`小芯已收到你的问题：${content}`);
        setBubbleText("小芯正在结合当前实验思考，请稍等。", true);

        try {
            const query = new URLSearchParams({
                question: content,
                experimentName,
                experimentState: JSON.stringify(experimentState),
                sessionId: assistantSessionId
            });

            const response = await fetchAssistantStreamResponse(query, assistantAbortController.signal);
            const reader = response.body.getReader();
            const decoder = new TextDecoder("utf-8");
            let buffer = "";
            let finalText = "";

            beginLiveAnswerStream();

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
                        syncLiveAnswerOutput(finalText);
                    }
                }
            }

            finalText = sanitizeAssistantText(finalText).trim() || "我刚刚没有组织出合适的回答，你可以再问我一次。";
            finalizeLiveAnswerOutput(finalText);
        } catch (error) {
            if (error instanceof DOMException && error.name === "AbortError") {
                return;
            }

            const message = error instanceof Error ? error.message : "调用失败";
            emotionBehaviorState.failureCount += 1;
            const fallback = `抱歉，我刚刚没有回答成功。${message}`;
            stopSpeech();
            setBubbleText(fallback, false);
            speak(fallback, () => {
                queueWakeRecognition(800);
            });
        } finally {
            assistantAbortController = null;
            if (pendingVoiceTranscript === content) {
                pendingVoiceTranscript = "";
            }
        }
    };

    function startQuestionRecognition() {
        if (!RecognitionCtor) {
            return;
        }

        pauseVoiceRecognition();
        const recognition = new RecognitionCtor();
        questionRecognition = recognition;
        recognition.lang = "zh-CN";
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;

        let finalTranscript = "";
        let earlySubmitTimer = null;
        let submitted = false;
        startAcousticEmotionCapture().then((capture) => {
            if (questionRecognition === recognition) {
                activeAcousticCapture = capture;
            } else if (capture && typeof capture.stop === "function") {
                capture.stop().catch(() => {});
            }
        }).catch(() => {});

        async function submitRecognizedQuestion(rawText) {
            const question = String(rawText || "").trim();
            if (!question || submitted) {
                return;
            }

            submitted = true;
            window.clearTimeout(earlySubmitTimer);
            earlySubmitTimer = null;
            questionRecognition = null;
            stopRecognition(recognition);
            setVoiceStatus("分析语音情绪");
            const audioEmotion = await stopActiveAcousticCapture();
            askAssistant(question, {
                inputMode: "voice",
                fromWake: true,
                audioEmotion
            });
        }

        setVoiceStatus("正在听题");
        setFocusStatus("小芯待命");
        setBubbleText("小芯已唤醒，请直接说出你的问题。", true);

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

            const preview = `${finalTranscript}${interimTranscript}`.trim();
            if (preview) {
                setBubbleText(`小芯正在听：${preview}`, true);
                window.clearTimeout(earlySubmitTimer);
                if (!finalTranscript.trim() && preview.length >= 6) {
                    earlySubmitTimer = window.setTimeout(() => {
                        submitRecognizedQuestion(preview);
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
            stopActiveAcousticCapture().catch(() => {});
            if (event?.error === "aborted") {
                return;
            }

            setVoiceStatus("待命");
            if (event?.error === "network") {
                setBubbleText("语音识别网络不稳定，这次没有完整收到。你可以再说一次“小芯小芯”。", false);
            } else if (event?.error === "no-speech") {
                setBubbleText("没有听清你的问题，你可以再说一次“小芯小芯”。", false);
            } else {
                setBubbleText(`语音识别异常：${event?.error || "unknown"}，你可以再说一次“小芯小芯”。`, false);
            }
            queueWakeRecognition(800);
        };

        recognition.onend = () => {
            questionRecognition = null;
            window.clearTimeout(earlySubmitTimer);
            if (!submitted && finalTranscript.trim()) {
                submitRecognizedQuestion(finalTranscript);
                return;
            }
            if (!submitted) {
                stopActiveAcousticCapture().catch(() => {});
                queueWakeRecognition(250);
            }
        };

        try {
            recognition.start();
        } catch (_error) {
            questionRecognition = null;
            queueWakeRecognition(900);
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

        if (!audioApi || typeof audioApi.speak !== "function") {
            if (afterEnd) {
                afterEnd();
            }
            return;
        }

        stopSpeech();
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
                setVoiceStatus("唤醒回应中");
                setFocusStatus("小芯回应");
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
            askAssistant(directQuestion, {
                inputMode: "voice",
                fromWake: true
            });
            return;
        }

        setVoiceStatus("正在听题");
        setFocusStatus("小芯待命");
        const wakeReply = "哎，我在，有什么需要帮助的嘛。";
        setStepHint(wakeReply);

        const listenAfterWakeReply = () => {
            setVoiceStatus("正在听题");
            setFocusStatus("小芯待命");
            setStepHint("请直接说出你的问题。");
            startQuestionRecognition();
        };

        speakWakeReplyFast(wakeReply, listenAfterWakeReply);
    }

    function handleInterruptDetected(questionText) {
        pauseVoiceRecognition();

        if (typeof hooks.interrupt === "function") {
            hooks.interrupt();
        } else {
            stopSpeech();
        }

        setVoiceStatus("绛夊緟杩借");
        setFocusStatus("璇煶杩借");

        const directQuestion = String(questionText || "").trim();

        if (directQuestion) {
            setStepHint(`宸叉墦鏂綋鍓嶈瑙ｏ紝姝ｅ湪澶勭悊锛?{directQuestion}`);
            askAssistant(directQuestion, {
                inputMode: "voice",
                interrupted: true
            });
            return;
        }

        setStepHint("宸插仠姝㈠綋鍓嶈瑙ｏ紝璇风户缁鍑轰綘鐨勯棶棰樸€?");
        startQuestionRecognition();
    }

    function handleInterruptDetected(questionText) {
        pauseVoiceRecognition();

        if (typeof hooks.interrupt === "function") {
            hooks.interrupt();
        } else {
            stopSpeech();
        }

        setVoiceStatus("\u7b49\u5f85\u8ffd\u95ee");
        setFocusStatus("\u8bed\u97f3\u8ffd\u95ee");

        const directQuestion = String(questionText || "").trim();
        if (directQuestion) {
            setStepHint(`已打断当前讲解，正在处理：${directQuestion}`);
            askAssistant(directQuestion, {
                inputMode: "voice",
                interrupted: true
            });
            return;
        }

        setStepHint("\u5df2\u7acb\u5373\u505c\u6b62\u5f53\u524d\u8bb2\u89e3\uff0c\u6b63\u5728\u63a5\u6536\u4f60\u7684\u65b0\u95ee\u9898\u3002");
        queueInterruptFollowup(() => {
            setStepHint("\u5df2\u505c\u6b62\u5f53\u524d\u8bb2\u89e3\uff0c\u8bf7\u7ee7\u7eed\u8bf4\u51fa\u4f60\u7684\u95ee\u9898\u3002");
            startQuestionRecognition();
        });
    }

    function startWakeRecognition(isRestart = false, mode = "full") {
        if (!RecognitionCtor || document.hidden) {
            return;
        }

        if (questionRecognition) {
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

        recognition.onstart = () => {
            wakeListening = true;
        };

        setVoiceStatus("语音待命");
        setFocusStatus("小芯待命");

        if (recognitionMode === "interrupt") {
            setVoiceStatus("\u8bb2\u89e3\u4e2d");
            setFocusStatus("\u4ec5\u76d1\u542c\u6253\u65ad");
            setStepHint("\u5c0f\u82af\u6b63\u5728\u8bb2\u89e3\uff0c\u6b64\u65f6\u53ea\u4f1a\u76d1\u542c\u201c\u6253\u65ad\u4e00\u4e0b\u201d\u6216\u201c\u505c\u4e00\u4e0b\u201d\u3002");
        }

        if (!isRestart && recognitionMode !== "interrupt") {
            setStepHint("当前实验已支持语音唤醒。你可以直接说“小芯小芯”，边做实验边提问。");
        }

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
                setStepHint(`语音待命中，已听到：${transcript}`);
            }

            if (recognitionMode === "interrupt") {
                if (!interruptAlias || !isAssistantBusyForInterrupt()) {
                    return;
                }

                wakeRecognition = null;
                wakeListening = false;
                wakeRecognitionMode = "full";
                stopRecognition(recognition);
                handleInterruptDetected(extractQuestionAfterInterrupt(transcript));
                return;
            }

            if (interruptAlias && isAssistantBusyForInterrupt()) {
                wakeRecognition = null;
                wakeListening = false;
                wakeRecognitionMode = "full";
                stopRecognition(recognition);
                handleInterruptDetected(extractQuestionAfterInterrupt(transcript));
                return;
            }

            const hit = findWakeAlias(normalized);

            if (!hit) {
                return;
            }

            wakeRecognition = null;
            wakeListening = false;
            wakeRecognitionMode = "full";
            stopRecognition(recognition);
            handleWakeDetected(extractQuestionAfterWake(transcript));
        };

        recognition.onerror = () => {
            wakeRecognition = null;
            wakeListening = false;
            wakeRecognitionMode = "full";
            queueWakeRecognition(1000, recognitionMode);
        };

        recognition.onend = () => {
            wakeRecognition = null;
            wakeListening = false;
            wakeRecognitionMode = "full";
            queueWakeRecognition(180, recognitionMode);
        };

        try {
            recognition.start();
        } catch (_error) {
            wakeRecognition = null;
            wakeListening = false;
            wakeRecognitionMode = "full";
            queueWakeRecognition(500, recognitionMode);
        }
    }

    function bootVoiceAssistant() {
        if (!RecognitionCtor) {
            return;
        }

        if (autoBootTried) {
            return;
        }

        autoBootTried = true;
        if (audioApi && typeof audioApi.prefetch === "function") {
            audioApi.prefetch("哎，我在，有什么需要帮助的嘛。").catch(() => {});
        }
        startWakeHealthMonitor();
        queueWakeRecognition(260);
        queueWakeRecognition(1200);
    }

    window.addEventListener("pagehide", () => {
        stopSpeech();
        pauseVoiceRecognition();
    });

    window.addEventListener("beforeunload", () => {
        stopSpeech();
        pauseVoiceRecognition();
        clearWakeHealthTimer();
    });

    window.addEventListener("pageshow", () => {
        startWakeHealthMonitor();
        queueWakeRecognition(280);
    });

    window.addEventListener("focus", () => {
        queueWakeRecognition(240);
    });

    document.addEventListener("visibilitychange", () => {
        if (document.hidden) {
            stopSpeech();
            pauseVoiceRecognition();
            return;
        }

        startWakeHealthMonitor();
        queueWakeRecognition(700);
    });

    const resumeByGesture = () => {
        queueWakeRecognition(300);
    };

    document.addEventListener("pointerdown", resumeByGesture, { passive: true });
    document.addEventListener("keydown", resumeByGesture);
    currentEmotionState = createMultimodalEmotionState("");
    window.addEventListener("load", bootVoiceAssistant);
})();
