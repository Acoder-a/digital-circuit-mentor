(function () {
    const hosts = Array.from(document.querySelectorAll("[data-live2d-host]"));
    const localDistBase = "./live2d-widget-master/dist/";
    const localBuildBase = "./live2d-widget-master/build/";
    const assistantApiBase = window.location.port === "3010" ? "" : "http://127.0.0.1:3010";
    const speechModeStorageKey = "xiaoxin_speech_mode";
    const remoteSpeechPlaybackRate = 1;
    const defaultModel = {
        id: "shizuku",
        label: "诗音",
        path: "https://cdn.jsdelivr.net/npm/live2d-widget-model-shizuku@1.0.5/assets/shizuku.model.json"
    };

    if (!hosts.length) {
        return;
    }

    const assetState = window.__live2dHostState || {
        loading: null,
        widget: null,
        isReady: false,
        expression: {
            rafId: 0,
            activePreset: "",
            until: 0
        },
        speech: {
            rafId: 0,
            active: false,
            lastFrame: 0,
            lastBoundaryTime: 0,
            lastExciteAt: 0,
            estimatedGap: 180,
            amplitude: 0.82,
            currentValue: 0,
            pulse: 0,
            speed: 4.2,
            phase: 0
        }
    };

    assetState.audio = assetState.audio || {
        token: 0,
        rafId: 0,
        speaking: false,
        currentMode: "",
        currentText: "",
        lastBoundaryCharIndex: -1,
        smoothedEnergy: 0,
        audioContext: null,
        analyser: null,
        sourceNode: null,
        audioElement: null,
        dataArray: null,
        objectUrl: "",
        fetchController: null,
        fallbackUtterance: null,
        prefetchCache: new Map(),
        lowEnergyFrames: 0
    };

    window.__live2dHostState = assetState;

    const voiceProfile = {
        getPreferredVoice() {
            const synth = window.speechSynthesis;
            const voices = synth ? synth.getVoices() : [];
            const chineseVoices = voices.filter((voice) => voice.lang === "zh-CN" || voice.lang.includes("zh"));
            const preferredNames = [
                "Microsoft Xiaoxiao Online (Natural) - Chinese (Mainland)",
                "Microsoft Xiaoyi Online (Natural) - Chinese (Mainland)",
                "Microsoft Xiaoxiao - Chinese (Simplified, PRC)",
                "Microsoft Xiaoyi - Chinese (Simplified, PRC)"
            ];
            const preferredKeywords = ["xiaoxiao", "xiaoyi", "xiaohan", "xiaomeng", "tingting", "female"];
            const exactMatch = chineseVoices.find((voice) => preferredNames.includes(voice.name));

            if (exactMatch) {
                return exactMatch;
            }

            return chineseVoices.find((voice) => {
                const name = voice.name.toLowerCase();
                return preferredKeywords.some((keyword) => name.includes(keyword));
            }) || chineseVoices[0] || null;
        },
        applyUtterance(utterance) {
            const voice = this.getPreferredVoice();

            if (voice) {
                utterance.voice = voice;
            }

            utterance.lang = "zh-CN";
            utterance.rate = 0.92;
            utterance.pitch = 1.18;
            utterance.volume = 1;
        }
    };

    window.__digitalHumanVoiceProfile = voiceProfile;

    assetState.audio.preferredMode = "remote";

    function getAudioContextCtor() {
        return window.AudioContext || window.webkitAudioContext || null;
    }

    function supportsRemoteSpeech() {
        return Boolean(window.fetch && getAudioContextCtor() && window.Audio);
    }

    function supportsBrowserSpeech() {
        return Boolean(window.speechSynthesis && typeof window.SpeechSynthesisUtterance !== "undefined");
    }

    function readPreferredSpeechMode() {
        return "remote";
    }

    function getPreferredSpeechMode() {
        return "remote";
    }

    function hasPreferredBrowserVoice() {
        if (!supportsBrowserSpeech()) {
            return false;
        }

        if (!voiceProfile || typeof voiceProfile.getPreferredVoice !== "function") {
            return false;
        }

        return Boolean(voiceProfile.getPreferredVoice());
    }

    function getEffectiveSpeechMode() {
        return "remote";
    }

    function shouldPreferBrowserVoice() {
        return false;
    }

    function buildSpeechModeStatusText() {
        const preferredMode = getPreferredSpeechMode();
        const effectiveMode = getEffectiveSpeechMode();

        if (preferredMode === "remote") {
            return "当前：云端 TTS";
        }

        if (effectiveMode === "browser") {
            return "当前：本地女声";
        }

        return "当前：云端 TTS（本地不可用）";
    }

    function ensureSpeechModeStyles() {
        if (document.getElementById("speechModeToggleStyle")) {
            return;
        }

        const style = document.createElement("style");
        style.id = "speechModeToggleStyle";
        style.textContent = `
            .speech-mode-panel {
                width: 100%;
                padding: 14px 16px;
                border: 1px solid rgba(130, 214, 255, 0.28);
                border-radius: 24px;
                background: linear-gradient(180deg, rgba(7, 18, 35, 0.88), rgba(9, 28, 50, 0.82));
                box-shadow: 0 14px 30px rgba(0, 0, 0, 0.26), 0 0 0 1px rgba(95, 240, 255, 0.08) inset;
                backdrop-filter: blur(14px);
                color: #e9f7ff;
            }

            .speech-mode-panel.home-sidebar {
                margin-top: 14px;
            }

            .speech-mode-panel.stage-floating {
                position: absolute;
                left: 12px;
                bottom: 12px;
                z-index: 20;
                width: min(220px, calc(100% - 24px));
                border-radius: 18px;
            }

            .speech-mode-title {
                display: block;
                margin-bottom: 8px;
                font-size: 13px;
                font-weight: 700;
                letter-spacing: 0.06em;
                color: rgba(233, 247, 255, 0.88);
            }

            .speech-mode-status {
                margin: 0 0 10px;
                font-size: 12px;
                line-height: 1.45;
                color: rgba(233, 247, 255, 0.74);
            }

            .speech-mode-actions {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 8px;
            }

            .speech-mode-btn {
                border: 1px solid rgba(130, 214, 255, 0.18);
                border-radius: 12px;
                background: rgba(9, 28, 50, 0.72);
                color: rgba(233, 247, 255, 0.84);
                font: inherit;
                font-size: 13px;
                font-weight: 700;
                padding: 11px 10px;
                cursor: pointer;
                transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease;
            }

            .speech-mode-btn:hover {
                transform: translateY(-1px);
                border-color: rgba(120, 255, 200, 0.36);
            }

            .speech-mode-btn.is-active {
                color: #07111f;
                background: linear-gradient(135deg, rgba(95, 240, 255, 0.96), rgba(120, 255, 200, 0.92));
                border-color: transparent;
                box-shadow: 0 8px 20px rgba(95, 240, 255, 0.2);
            }
        `;

        document.head.appendChild(style);
    }

    function getSpeechModePanels() {
        return Array.from(document.querySelectorAll(".speech-mode-panel"));
    }

    function renderSpeechModePanels() {
        getSpeechModePanels().forEach((panel) => panel.remove());
    }

    function setPreferredSpeechMode(mode) {
        assetState.audio.preferredMode = "remote";

        try {
            window.localStorage.removeItem(speechModeStorageKey);
        } catch (_error) {
            // ignore
        }

        renderSpeechModePanels();
    }

    function installSpeechModePanels() {
        ensureSpeechModeStyles();

        hosts.forEach((host) => {
            if (host.querySelector(".speech-mode-panel")) {
                return;
            }

            host.style.position = host.style.position || "relative";

            const panel = document.createElement("section");
            panel.className = "speech-mode-panel";
            panel.innerHTML = `
                <strong class="speech-mode-title">语音模式</strong>
                <p class="speech-mode-status"></p>
                <div class="speech-mode-actions">
                    <button class="speech-mode-btn" type="button" data-mode="browser">本地女声</button>
                    <button class="speech-mode-btn" type="button" data-mode="remote">云端 TTS</button>
                </div>
            `;

            panel.querySelectorAll(".speech-mode-btn").forEach((button) => {
                button.addEventListener("click", () => {
                    setPreferredSpeechMode(button.dataset.mode || "browser");
                });
            });

            host.appendChild(panel);
        });

        renderSpeechModePanels();
    }

    function installSpeechModePanels() {
        ensureSpeechModeStyles();
        getSpeechModePanels().forEach((panel) => panel.remove());

        function createPanel(extraClassName = "") {
            const panel = document.createElement("section");
            panel.className = `speech-mode-panel ${extraClassName}`.trim();
            panel.innerHTML = `
                <strong class="speech-mode-title">璇煶妯″紡</strong>
                <p class="speech-mode-status"></p>
                <div class="speech-mode-actions">
                    <button class="speech-mode-btn" type="button" data-mode="browser">鏈湴濂冲០</button>
                    <button class="speech-mode-btn" type="button" data-mode="remote">浜戠 TTS</button>
                </div>
            `;

            panel.querySelectorAll(".speech-mode-btn").forEach((button) => {
                button.addEventListener("click", () => {
                    setPreferredSpeechMode(button.dataset.mode || "browser");
                });
            });

            return panel;
        }

        const sidebarTarget = document.querySelector(".left-panel .panel-inner");
        const challengeCard = document.querySelector(".challenge-card");

        if (sidebarTarget && challengeCard && challengeCard.parentElement === sidebarTarget) {
            const panel = createPanel("home-sidebar");
            challengeCard.insertAdjacentElement("afterend", panel);
        } else if (hosts[0]) {
            hosts[0].style.position = hosts[0].style.position || "relative";
            const panel = createPanel("stage-floating");
            hosts[0].appendChild(panel);
        }

        renderSpeechModePanels();
    }

    function buildSpeechModeStatusText() {
        const preferredMode = getPreferredSpeechMode();
        const effectiveMode = getEffectiveSpeechMode();

        if (preferredMode === "remote") {
            return "\u5f53\u524d\uff1a\u4e91\u7aef TTS";
        }

        if (effectiveMode === "browser") {
            return "\u5f53\u524d\uff1a\u672c\u5730\u5973\u58f0";
        }

        return "\u5f53\u524d\uff1a\u4e91\u7aef TTS\uff08\u672c\u5730\u4e0d\u53ef\u7528\uff09";
    }

    function installSpeechModePanels() {
        getSpeechModePanels().forEach((panel) => panel.remove());
        renderSpeechModePanels();
    }

    function releaseAudioUrl() {
        const audioState = assetState.audio;

        if (audioState.objectUrl) {
            URL.revokeObjectURL(audioState.objectUrl);
            audioState.objectUrl = "";
        }
    }

    function applyAudioPlaybackRate(audioElement, playbackRate) {
        if (!audioElement) {
            return;
        }

        const safeRate = Number.isFinite(playbackRate)
            ? Math.max(0.25, Math.min(1.15, Number(playbackRate)))
            : remoteSpeechPlaybackRate;

        audioElement.playbackRate = safeRate;
        audioElement.defaultPlaybackRate = safeRate;
        audioElement.preservesPitch = true;
        audioElement.webkitPreservesPitch = true;
        audioElement.mozPreservesPitch = true;
    }

    function stopAudioAnalysisLoop() {
        const audioState = assetState.audio;

        if (audioState.rafId) {
            window.cancelAnimationFrame(audioState.rafId);
            audioState.rafId = 0;
        }
    }

    function resetAudioPlaybackState() {
        const audioState = assetState.audio;

        audioState.speaking = false;
        audioState.currentMode = "";
        audioState.currentText = "";
        audioState.lastBoundaryCharIndex = -1;
        audioState.smoothedEnergy = 0;
        audioState.lowEnergyFrames = 0;
        audioState.fallbackUtterance = null;
        audioState.fetchController = null;
        stopAudioAnalysisLoop();
        setLipSyncValue(0);
    }

    function ensureAudioPipeline() {
        const audioState = assetState.audio;

        if (audioState.audioContext && audioState.analyser && audioState.audioElement) {
            return audioState;
        }

        const AudioContextCtor = getAudioContextCtor();
        if (!AudioContextCtor) {
            return null;
        }

        const audioContext = new AudioContextCtor();
        const analyser = audioContext.createAnalyser();
        const audioElement = new Audio();
        const sourceNode = audioContext.createMediaElementSource(audioElement);

        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.16;
        sourceNode.connect(analyser);
        analyser.connect(audioContext.destination);
        audioElement.preload = "auto";
        audioElement.crossOrigin = "anonymous";

        audioState.audioContext = audioContext;
        audioState.analyser = analyser;
        audioState.audioElement = audioElement;
        audioState.sourceNode = sourceNode;
        audioState.dataArray = new Uint8Array(analyser.fftSize);
        return audioState;
    }

    function computeSpeechEnergy(dataArray) {
        if (!dataArray || !dataArray.length) {
            return 0;
        }

        let squaredTotal = 0;

        for (let index = 0; index < dataArray.length; index += 1) {
            const centered = (dataArray[index] - 128) / 128;
            squaredTotal += centered * centered;
        }

        const rms = Math.sqrt(squaredTotal / dataArray.length);
        return Math.max(0, Math.min(1, rms * 4.4));
    }

    function emitAudioBoundary(audioState, options) {
        const onBoundary = typeof options.onBoundary === "function" ? options.onBoundary : null;
        const audioElement = audioState.audioElement;

        if (!onBoundary || !audioElement) {
            return;
        }

        const characters = Array.from(audioState.currentText || "");
        const duration = Number.isFinite(audioElement.duration) && audioElement.duration > 0
            ? audioElement.duration
            : Number(options.duration || 0);

        if (!characters.length || duration <= 0) {
            return;
        }

        const progress = Math.max(0, Math.min(1, audioElement.currentTime / duration));
        const charIndex = Math.min(
            characters.length - 1,
            Math.max(0, Math.floor(progress * characters.length))
        );

        if (charIndex === audioState.lastBoundaryCharIndex) {
            return;
        }

        audioState.lastBoundaryCharIndex = charIndex;
        onBoundary({
            mode: "audio",
            charIndex,
            elapsedTime: audioElement.currentTime,
            currentTime: audioElement.currentTime,
            duration
        });
    }

    function tickAudioLipSync(now, token, options) {
        const audioState = assetState.audio;

        if (!audioState.speaking || audioState.token !== token || audioState.currentMode !== "audio") {
            stopAudioAnalysisLoop();
            return;
        }

        if (audioState.analyser && audioState.dataArray) {
            audioState.analyser.getByteTimeDomainData(audioState.dataArray);
            let targetEnergy = computeSpeechEnergy(audioState.dataArray);

            if (targetEnergy < 0.014) {
                audioState.lowEnergyFrames += 1;
            } else {
                audioState.lowEnergyFrames = 0;
            }

            // Remote TTS occasionally returns playable audio while the analyser keeps
            // producing near-zero energy, which makes the mouth look frozen. In that
            // case, fall back to a light synthetic pulse so lip sync still looks alive.
            if (audioState.lowEnergyFrames >= 10) {
                const pulse = 0.16 + Math.abs(Math.sin(now / 58)) * 0.24;
                targetEnergy = Math.max(targetEnergy, pulse);
            }

            const riseSmoothing = 0.42;
            const fallSmoothing = 0.22;
            const smoothing = targetEnergy > audioState.smoothedEnergy ? riseSmoothing : fallSmoothing;

            audioState.smoothedEnergy += (targetEnergy - audioState.smoothedEnergy) * smoothing;
            setLipSyncValue(audioState.smoothedEnergy);
        }

        emitAudioBoundary(audioState, options);
        audioState.rafId = window.requestAnimationFrame((nextNow) => {
            tickAudioLipSync(nextNow, token, options);
        });
    }

    function buildSpeechCacheKey(text, options = {}) {
        return JSON.stringify({
            text: String(text || "").trim(),
            voiceId: String(options.voiceId || "").trim(),
            modelId: String(options.modelId || "").trim()
        });
    }

    function cloneSpeechAudioPayload(payload) {
        if (!payload) {
            return null;
        }

        return {
            buffer: payload.buffer.slice(0),
            duration: payload.duration,
            contentType: payload.contentType
        };
    }

    function rememberSpeechAudio(cacheKey, payload) {
        const cache = assetState.audio.prefetchCache;
        if (!(cache instanceof Map)) {
            return;
        }

        if (cache.has(cacheKey)) {
            cache.delete(cacheKey);
        }

        cache.set(cacheKey, payload);

        while (cache.size > 12) {
            const firstKey = cache.keys().next().value;
            cache.delete(firstKey);
        }
    }

    async function fetchSpeechAudio(text, options) {
        const audioState = assetState.audio;
        const cacheKey = buildSpeechCacheKey(text, options);
        const cachedPayload = audioState.prefetchCache instanceof Map ? audioState.prefetchCache.get(cacheKey) : null;
        if (cachedPayload) {
            return cloneSpeechAudioPayload(cachedPayload);
        }

        const controller = new AbortController();
        audioState.fetchController = controller;

        const response = await fetch(`${assistantApiBase}/api/tts`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                text,
                voiceId: options.voiceId,
                modelId: options.modelId,
                speed: options.speed,
                pitch: options.pitch,
                volume: options.volume,
                ttsInstruction: options.ttsInstruction
            }),
            signal: controller.signal
        });

        if (!response.ok) {
            let detail = `HTTP ${response.status}`;

            try {
                const payload = await response.json();
                detail = payload?.detail || payload?.error || detail;
            } catch (_error) {
                // ignore
            }

            throw new Error(detail);
        }

        const payload = {
            buffer: await response.arrayBuffer(),
            duration: Number(response.headers.get("X-TTS-Audio-Length") || 0) / 1000,
            contentType: String(response.headers.get("Content-Type") || "audio/mpeg").trim() || "audio/mpeg"
        };

        rememberSpeechAudio(cacheKey, payload);
        return cloneSpeechAudioPayload(payload);
    }

    async function prefetchSpeechAudio(text, options = {}) {
        const content = String(text || "").trim();
        if (!content || !supportsRemoteSpeech()) {
            return false;
        }

        const cacheKey = buildSpeechCacheKey(content, options);
        if (assetState.audio.prefetchCache instanceof Map && assetState.audio.prefetchCache.has(cacheKey)) {
            return true;
        }

        try {
            await fetchSpeechAudio(content, options);
            return true;
        } catch (_error) {
            return false;
        }
    }

    function stopAudioPlayback() {
        const audioState = assetState.audio;

        if (audioState.fetchController) {
            audioState.fetchController.abort();
        }

        if (audioState.audioElement) {
            try {
                audioState.audioElement.pause();
            } catch (_error) {
                // ignore
            }

            audioState.audioElement.onended = null;
            audioState.audioElement.onerror = null;
            audioState.audioElement.onloadedmetadata = null;
            audioState.audioElement.oncanplay = null;
            audioState.audioElement.removeAttribute("src");
            audioState.audioElement.load();
        }

        if (audioState.fallbackUtterance && supportsBrowserSpeech()) {
            try {
                window.speechSynthesis.cancel();
            } catch (_error) {
                // ignore
            }
        }

        releaseAudioUrl();
        resetAudioPlaybackState();
        forceCloseMouth();
    }

    function finalizeAudioSpeech(token, options) {
        const audioState = assetState.audio;

        if (audioState.token !== token) {
            return;
        }

        releaseAudioUrl();
        resetAudioPlaybackState();
        forceCloseMouth();

        if (typeof options.onEnd === "function") {
            options.onEnd({
                mode: "audio"
            });
        }
    }

    function speakWithBrowserFallback(text, options) {
        return new Promise((resolve, reject) => {
            if (!supportsBrowserSpeech()) {
                reject(new Error("当前浏览器不支持语音播放"));
                return;
            }

            const synth = window.speechSynthesis;
            const utterance = new SpeechSynthesisUtterance(text);
            const token = ++assetState.audio.token;

            if (voiceProfile && typeof voiceProfile.applyUtterance === "function") {
                voiceProfile.applyUtterance(utterance);
            } else {
                utterance.lang = "zh-CN";
                utterance.rate = 0.95;
                utterance.pitch = 1.18;
                utterance.volume = 1;
            }

            assetState.audio.speaking = true;
            assetState.audio.currentMode = "browser";
            assetState.audio.currentText = text;
            assetState.audio.fallbackUtterance = utterance;

            utterance.onstart = () => {
                if (assetState.audio.token !== token) {
                    return;
                }

                startLipSync(text);

                if (typeof options.onStart === "function") {
                    options.onStart({ mode: "browser" });
                }
            };

            utterance.onboundary = (event) => {
                if (assetState.audio.token !== token) {
                    return;
                }

                handleSpeechBoundary(event);

                if (typeof options.onBoundary === "function") {
                    options.onBoundary({
                        mode: "browser",
                        charIndex: Number(event?.charIndex ?? 0),
                        elapsedTime: Number(event?.elapsedTime ?? 0)
                    });
                }
            };

            utterance.onend = () => {
                if (assetState.audio.token !== token) {
                    return;
                }

                resetAudioPlaybackState();
                stopLipSync();
                forceCloseMouth();

                if (typeof options.onEnd === "function") {
                    options.onEnd({ mode: "browser" });
                }

                resolve({ mode: "browser" });
            };

            utterance.onerror = (event) => {
                if (assetState.audio.token !== token) {
                    return;
                }

                resetAudioPlaybackState();
                stopLipSync();
                forceCloseMouth();
                const error = new Error(event?.error || "浏览器语音播放失败");

                if (typeof options.onError === "function") {
                    options.onError(error);
                }

                reject(error);
            };

            synth.speak(utterance);
        });
    }

    async function speakWithRealTimeAudio(text, options = {}) {
        const content = String(text || "").trim();

        if (!content) {
            if (typeof options.onEnd === "function") {
                options.onEnd({ mode: "empty" });
            }
            return { mode: "empty" };
        }

        stopAudioPlayback();

        if (!supportsRemoteSpeech()) {
            throw new Error("当前环境不支持云端语音播放");
        }

        try {
            const audioState = ensureAudioPipeline();

            if (!audioState || !audioState.audioElement || !audioState.audioContext) {
                throw new Error("云端语音播放链路初始化失败");
            }

            const token = ++audioState.token;
            audioState.speaking = true;
            audioState.currentMode = "audio";
            audioState.currentText = content;
            audioState.lastBoundaryCharIndex = -1;
            audioState.smoothedEnergy = 0;

            const speechAudio = await fetchSpeechAudio(content, options);
            if (audioState.token !== token) {
                return { mode: "cancelled" };
            }

            const audioBlob = new Blob([speechAudio.buffer], { type: speechAudio.contentType || "audio/mpeg" });
            const objectUrl = URL.createObjectURL(audioBlob);
            audioState.objectUrl = objectUrl;
            audioState.audioElement.src = objectUrl;
            const playbackRate = Number.isFinite(options.playbackRate)
                ? Number(options.playbackRate)
                : remoteSpeechPlaybackRate;
            applyAudioPlaybackRate(audioState.audioElement, playbackRate);

            if (audioState.audioContext.state === "suspended") {
                await audioState.audioContext.resume().catch(() => {});
            }

            await new Promise((resolve, reject) => {
                let settled = false;

                function cleanup() {
                    audioState.audioElement.onloadedmetadata = null;
                    audioState.audioElement.oncanplay = null;
                    audioState.audioElement.onerror = null;
                }

                audioState.audioElement.onloadedmetadata = () => {
                    if (settled) {
                        return;
                    }

                    applyAudioPlaybackRate(audioState.audioElement, playbackRate);
                    settled = true;
                    cleanup();
                    resolve();
                };

                audioState.audioElement.oncanplay = () => {
                    if (settled) {
                        return;
                    }

                    applyAudioPlaybackRate(audioState.audioElement, playbackRate);
                    settled = true;
                    cleanup();
                    resolve();
                };

                audioState.audioElement.onerror = () => {
                    if (settled) {
                        return;
                    }

                    settled = true;
                    cleanup();
                    reject(new Error("音频资源加载失败"));
                };
            });

            if (audioState.token !== token) {
                return { mode: "cancelled" };
            }

            audioState.audioElement.onended = () => {
                finalizeAudioSpeech(token, options);
            };

            audioState.audioElement.onerror = () => {
                if (audioState.token !== token) {
                    return;
                }

                const error = new Error("音频播放失败");
                stopAudioPlayback();

                if (typeof options.onError === "function") {
                    options.onError(error);
                }
            };

            if (typeof options.onStart === "function") {
                options.onStart({
                    mode: "audio",
                    duration: Number.isFinite(audioState.audioElement.duration) && audioState.audioElement.duration > 0
                        ? audioState.audioElement.duration
                        : speechAudio.duration
                });
            }

            tickAudioLipSync(performance.now(), token, {
                ...options,
                duration: speechAudio.duration
            });

            applyAudioPlaybackRate(audioState.audioElement, playbackRate);
            await audioState.audioElement.play();
            return { mode: "audio" };
        } catch (error) {
            stopAudioPlayback();

            if (typeof options.onError === "function") {
                options.onError(error);
            }

            throw error;
        }
    }

    function showHostMessage(message) {
        hosts.forEach((host) => {
            let fallback = host.querySelector(".live2d-fallback");

            if (!fallback) {
                fallback = document.createElement("div");
                fallback.className = "live2d-fallback";
                host.appendChild(fallback);
            }

            fallback.textContent = message;
        });
    }

    function clearHostMessage() {
        hosts.forEach((host) => {
            const fallback = host.querySelector(".live2d-fallback");

            if (fallback) {
                fallback.remove();
            }
        });
    }

    function loadStyle(href) {
        const existing = document.querySelector(`link[data-live2d-asset="${href}"]`);

        if (existing) {
            return Promise.resolve();
        }

        return new Promise((resolve, reject) => {
            const link = document.createElement("link");
            link.rel = "stylesheet";
            link.href = href;
            link.dataset.live2dAsset = href;
            link.addEventListener("load", () => resolve(), { once: true });
            link.addEventListener("error", () => reject(new Error(`load failed: ${href}`)), { once: true });
            document.head.appendChild(link);
        });
    }

    function loadScript(src, options = {}) {
        const type = options.type || "text/javascript";
        const existing = document.querySelector(`script[data-live2d-asset="${src}"][type="${type}"]`);

        if (existing) {
            if (existing.dataset.loaded === "true") {
                return Promise.resolve();
            }

            return new Promise((resolve, reject) => {
                existing.addEventListener("load", () => resolve(), { once: true });
                existing.addEventListener("error", () => reject(new Error(`load failed: ${src}`)), { once: true });
            });
        }

        return new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = src;
            script.async = false;
            script.type = type;
            script.dataset.live2dAsset = src;
            script.addEventListener("load", () => {
                script.dataset.loaded = "true";
                resolve();
            }, { once: true });
            script.addEventListener("error", () => reject(new Error(`load failed: ${src}`)), { once: true });
            document.head.appendChild(script);
        });
    }

    function waitForWidget() {
        if (assetState.widget && document.body.contains(assetState.widget)) {
            return Promise.resolve(assetState.widget);
        }

        const existing = document.getElementById("waifu");
        if (existing) {
            assetState.widget = existing;
            return Promise.resolve(existing);
        }

        return new Promise((resolve, reject) => {
            const timeoutId = window.setTimeout(() => {
                observer.disconnect();
                reject(new Error("live2d widget timeout"));
            }, 8000);

            const observer = new MutationObserver(() => {
                const widget = document.getElementById("waifu");

                if (!widget) {
                    return;
                }

                window.clearTimeout(timeoutId);
                observer.disconnect();
                assetState.widget = widget;
                resolve(widget);
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        });
    }

    function mountWidgetInto(host) {
        return waitForWidget().then((widget) => {
            clearHostMessage();
            host.appendChild(widget);
            host.dataset.live2dReady = "true";
            assetState.widget = widget;
            assetState.isReady = true;
            return widget;
        });
    }

    function getModelManager() {
        return window.__live2dWidgetModelManager || null;
    }

    function getCubism2Model() {
        const manager = getModelManager();

        if (!manager || !manager.cubism2model || !manager.cubism2model.live2DMgr) {
            return null;
        }

        if (typeof manager.cubism2model.live2DMgr.getModel !== "function") {
            return null;
        }

        return manager.cubism2model.live2DMgr.getModel();
    }

    function setLipSyncValue(value) {
        const model = getCubism2Model();

        if (!model) {
            return false;
        }

        const nextValue = Math.max(0, Math.min(1, value));
        model.lipSync = null;

        if (typeof model.setLipSyncValue === "function") {
            model.setLipSyncValue(nextValue);
            return true;
        }

        if (model.live2DModel && typeof model.live2DModel.setParamFloat === "function") {
            model.live2DModel.setParamFloat("PARAM_MOUTH_OPEN_Y", nextValue);
            return true;
        }

        return false;
    }

    function forceCloseMouth(frameCount = 18) {
        let remaining = frameCount;

        function closeFrame() {
            const model = getCubism2Model();
            setLipSyncValue(0);

            if (model) {
                model.lipSyncValue = 0;
                model.lipSync = null;
            }

            if (model && model.live2DModel && typeof model.live2DModel.setParamFloat === "function") {
                model.live2DModel.setParamFloat("PARAM_MOUTH_OPEN_Y", 0, 1);
                model.live2DModel.setParamFloat("PARAM_MOUTH_FORM", 0, 1);

                if (typeof model.live2DModel.saveParam === "function") {
                    model.live2DModel.saveParam();
                }

                if (typeof model.live2DModel.update === "function") {
                    model.live2DModel.update();
                }
            }

            remaining -= 1;

            if (remaining > 0) {
                window.requestAnimationFrame(closeFrame);
            }
        }

        closeFrame();
    }

    function applyModelParams(params) {
        const model = getCubism2Model();

        if (!model || !model.live2DModel || typeof model.live2DModel.setParamFloat !== "function") {
            return false;
        }

        Object.entries(params).forEach(([paramId, value]) => {
            model.live2DModel.setParamFloat(paramId, value, 1);
        });

        if (typeof model.live2DModel.saveParam === "function") {
            model.live2DModel.saveParam();
        }

        if (typeof model.live2DModel.update === "function") {
            model.live2DModel.update();
        }

        return true;
    }

    function getExpressionPreset(name) {
        const presets = {
            encourage: {
                active: {
                    PARAM_EYE_SMILE: 1,
                    PARAM_EYE_L_OPEN: 0,
                    PARAM_EYE_R_OPEN: 0,
                    PARAM_CHEEK: 0.9,
                    PARAM_MOUTH_FORM: 1,
                    PARAM_BROW_L_Y: 0.18,
                    PARAM_BROW_R_Y: 0.18
                }
            },
            happy: {
                active: {
                    PARAM_EYE_SMILE: 1,
                    PARAM_EYE_L_OPEN: 0.12,
                    PARAM_EYE_R_OPEN: 0.12,
                    PARAM_CHEEK: 1,
                    PARAM_MOUTH_FORM: 1,
                    PARAM_BROW_L_Y: 0.2,
                    PARAM_BROW_R_Y: 0.2
                }
            },
            thinking: {
                active: {
                    PARAM_EYE_SMILE: 0,
                    PARAM_EYE_L_OPEN: 0.72,
                    PARAM_EYE_R_OPEN: 0.72,
                    PARAM_CHEEK: 0.15,
                    PARAM_MOUTH_FORM: -0.22,
                    PARAM_BROW_L_Y: 0.12,
                    PARAM_BROW_R_Y: -0.04
                }
            },
            calm: {
                active: {
                    PARAM_EYE_SMILE: 0.28,
                    PARAM_EYE_L_OPEN: 0.82,
                    PARAM_EYE_R_OPEN: 0.82,
                    PARAM_CHEEK: 0.3,
                    PARAM_MOUTH_FORM: 0.18,
                    PARAM_BROW_L_Y: 0.04,
                    PARAM_BROW_R_Y: 0.04
                }
            }
        };
        const preset = presets[name];

        if (!preset) {
            return null;
        }

        return {
            active: preset.active,
            reset: {
                PARAM_EYE_SMILE: 0,
                PARAM_EYE_L_OPEN: 1,
                PARAM_EYE_R_OPEN: 1,
                PARAM_CHEEK: 0,
                PARAM_MOUTH_FORM: 0,
                PARAM_BROW_L_Y: 0,
                PARAM_BROW_R_Y: 0
            }
        };
    }

    function stopExpressionLoop(reset = true) {
        if (assetState.expression.rafId) {
            window.cancelAnimationFrame(assetState.expression.rafId);
            assetState.expression.rafId = 0;
        }

        if (reset && assetState.expression.activePreset) {
            const preset = getExpressionPreset(assetState.expression.activePreset);

            if (preset) {
                applyModelParams(preset.reset);
            }
        }

        assetState.expression.activePreset = "";
        assetState.expression.until = 0;
    }

    function tickExpression(now) {
        const expression = assetState.expression;
        const preset = getExpressionPreset(expression.activePreset);

        if (!preset) {
            stopExpressionLoop(false);
            return;
        }

        applyModelParams(preset.active);

        if (now >= expression.until) {
            stopExpressionLoop(true);
            return;
        }

        expression.rafId = window.requestAnimationFrame(tickExpression);
    }

    function playExpression(name, duration = 4200) {
        const preset = getExpressionPreset(name);

        if (!preset) {
            return false;
        }

        stopExpressionLoop(true);
        assetState.expression.activePreset = name;
        assetState.expression.until = performance.now() + duration;
        assetState.expression.rafId = window.requestAnimationFrame(tickExpression);
        return true;
    }

    function stopLipSyncLoop() {
        if (assetState.speech.rafId) {
            window.cancelAnimationFrame(assetState.speech.rafId);
            assetState.speech.rafId = 0;
        }
    }

    function tickLipSync(now) {
        const speech = assetState.speech;
        const delta = speech.lastFrame ? now - speech.lastFrame : 16;
        const sinceExcite = speech.lastExciteAt > 0 ? now - speech.lastExciteAt : Number.POSITIVE_INFINITY;
        const openWindow = Math.max(120, Math.min(250, speech.estimatedGap * 0.92));
        const attackTime = Math.min(42, openWindow * 0.24);
        const holdTime = Math.min(28, openWindow * 0.14);
        const releaseTime = Math.max(56, openWindow - attackTime - holdTime);
        let envelope = 0;

        speech.lastFrame = now;
        speech.phase += (speech.speed * delta) / 1000;
        speech.pulse *= speech.active ? 0.62 : 0.5;

        if (speech.active) {
            if (sinceExcite <= attackTime) {
                envelope = sinceExcite / Math.max(1, attackTime);
            } else if (sinceExcite <= attackTime + holdTime) {
                envelope = 1;
            } else if (sinceExcite <= openWindow) {
                envelope = 1 - (sinceExcite - attackTime - holdTime) / Math.max(1, releaseTime);
            }
        }

        envelope = Math.max(0, envelope);

        const mouthWave = 0.9 + Math.sin(speech.phase) * 0.1;
        const target = Math.min(0.92, envelope * speech.amplitude * mouthWave);
        const smoothing = target > speech.currentValue ? 0.34 : 0.18;
        speech.currentValue += (target - speech.currentValue) * smoothing;

        if (target < 0.02 && speech.currentValue < 0.06) {
            speech.currentValue *= 0.5;
        }

        setLipSyncValue(speech.currentValue);

        if (!speech.active && speech.currentValue < 0.02 && speech.pulse < 0.02) {
            speech.currentValue = 0;
            speech.lastFrame = 0;
            speech.lastExciteAt = 0;
            speech.estimatedGap = 180;
            setLipSyncValue(0);
            stopLipSyncLoop();
            return;
        }

        speech.rafId = window.requestAnimationFrame(tickLipSync);
    }

    function startLipSync(text = "") {
        if (assetState.audio.speaking && assetState.audio.currentMode === "audio") {
            return;
        }

        const speech = assetState.speech;
        const textLength = Array.from(text).length;

        speech.active = true;
        speech.lastExciteAt = performance.now();
        speech.estimatedGap = Math.max(150, Math.min(235, 210 - textLength * 0.4));
        speech.amplitude = 0.84;
        speech.pulse = Math.max(speech.pulse, 0.8);
        speech.speed = Math.min(4.8, Math.max(2.8, 3.4 + textLength / 180));

        if (!speech.rafId) {
            speech.rafId = window.requestAnimationFrame(tickLipSync);
        }
    }

    function handleSpeechBoundary(event) {
        if (assetState.audio.speaking && assetState.audio.currentMode === "audio") {
            return;
        }

        const speech = assetState.speech;
        speech.lastExciteAt = performance.now();
        speech.pulse = Math.max(speech.pulse, 0.92);

        if (typeof event.elapsedTime === "number" && event.elapsedTime > 0) {
            if (speech.lastBoundaryTime > 0) {
                const gap = Math.max(0.08, event.elapsedTime - speech.lastBoundaryTime);
                speech.estimatedGap = Math.max(135, Math.min(240, gap * 1000));
                speech.speed = Math.min(4.9, Math.max(2.6, 0.42 / gap));
            }

            speech.lastBoundaryTime = event.elapsedTime;
        }
    }

    function stopLipSync() {
        const speech = assetState.speech;

        speech.active = false;
        speech.lastBoundaryTime = 0;
        speech.lastExciteAt = 0;
        speech.estimatedGap = 180;
        speech.amplitude = 0.82;
        speech.speed = 3.8;
        speech.pulse = 0;
        speech.phase = 0;
        speech.currentValue = 0;
        speech.lastFrame = 0;
        stopLipSyncLoop();

        if (!assetState.audio.speaking) {
            forceCloseMouth();
            return;
        }

        forceCloseMouth();
    }

    function ensureWidget() {
        if (assetState.loading) {
            return assetState.loading;
        }

        assetState.loading = (async function () {
            const OriginalImage = window.Image;

            window.Image = function (...args) {
                const image = new OriginalImage(...args);
                image.crossOrigin = "anonymous";
                return image;
            };
            window.Image.prototype = OriginalImage.prototype;

            window.localStorage.removeItem("waifu-display");
            window.localStorage.removeItem("modelId");
            window.localStorage.removeItem("modelTexturesId");

            await loadStyle(`${localDistBase}waifu.css`);
            await loadScript(`${localBuildBase}waifu-tips.js`, { type: "module" });

            if (typeof window.initWidget !== "function") {
                throw new Error("initWidget is not available");
            }

            if (!document.getElementById("waifu-toggle")) {
                window.initWidget({
                    waifuPath: `${localDistBase}waifu-tips.json`,
                    cubism2Path: `${localDistBase}live2d.min.js`,
                    modelId: 0,
                    models: [
                        {
                            name: defaultModel.id,
                            message: `已连接${defaultModel.label}形象`,
                            paths: [defaultModel.path]
                        }
                    ],
                    tools: [],
                    drag: false,
                    logLevel: "warn"
                });
            }

            return waitForWidget();
        })().catch((error) => {
            assetState.loading = null;
            throw error;
        });

        return assetState.loading;
    }

    window.__live2dHostApi = {
        getCurrentModel: () => defaultModel,
        startLipSync,
        handleSpeechBoundary,
        stopLipSync,
        forceCloseMouth,
        playExpression,
        clearExpression: () => stopExpressionLoop(true)
    };

    window.__digitalHumanAudioApi = {
        isAvailable: () => supportsRemoteSpeech(),
        isSpeaking: () => assetState.audio.speaking,
        getCurrentMode: () => assetState.audio.currentMode,
        getPreferredMode: () => getPreferredSpeechMode(),
        setPreferredMode: (mode) => setPreferredSpeechMode(mode),
        speak: speakWithRealTimeAudio,
        stop: stopAudioPlayback,
        prefetch: prefetchSpeechAudio
    };

    function boot() {
        installSpeechModePanels();
        if (location.protocol === "file:") {
            showHostMessage("请通过本地服务打开页面，数字人才能正常加载");
        }

        ensureWidget()
            .then(() => mountWidgetInto(hosts[0]))
            .catch((error) => {
                showHostMessage("数字人加载失败，请使用本地服务方式预览");
                console.error("Live2D load failed:", error);
            });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot, { once: true });
    } else {
        boot();
    }

    if (window.speechSynthesis && typeof window.speechSynthesis.addEventListener === "function") {
        window.speechSynthesis.addEventListener("voiceschanged", () => {
            renderSpeechModePanels();
        });
    }
})();
