(function () {
    const emotionProfiles = {
        happy: {
            label: "积极理解",
            expression: "happy",
            playbackRate: 1.16,
            browserRate: 1.08,
            browserPitch: 1.36,
            prefix: "太好了，你已经抓住关键了。我们可以顺着这个理解继续推进。",
            strategy: "推进下一步",
            output: "微笑表情 / 轻快语速 / 鼓励式反馈",
            action: "continue"
        },
        confused: {
            label: "困惑",
            expression: "thinking",
            playbackRate: 0.82,
            browserRate: 0.78,
            browserPitch: 1.04,
            prefix: "没关系，这里确实容易混。我换一种更直白的方式讲。",
            strategy: "放慢讲解并换一种说法",
            output: "思考表情 / 慢速语音 / 分步解释",
            action: "explain_again"
        },
        anxious: {
            label: "焦虑",
            expression: "calm",
            playbackRate: 0.76,
            browserRate: 0.74,
            browserPitch: 0.98,
            prefix: "别急，我们先把问题拆小。现在只看最关键的一步。",
            strategy: "降低任务难度",
            output: "安抚表情 / 柔和语音 / 最小步骤提示",
            action: "reduce_load"
        },
        frustrated: {
            label: "受挫",
            expression: "encourage",
            playbackRate: 0.8,
            browserRate: 0.76,
            browserPitch: 1.02,
            prefix: "这一步有点绕，不代表你学不会。我先把最容易错的地方单独拎出来。",
            strategy: "鼓励并定位错误点",
            output: "鼓励表情 / 稳定语速 / 错因提示",
            action: "encourage"
        },
        neutral: {
            label: "中性",
            expression: "neutral",
            playbackRate: 1,
            browserRate: 0.92,
            browserPitch: 1.18,
            prefix: "",
            strategy: "正常讲解",
            output: "默认表情 / 正常语速 / 按流程讲解",
            action: "normal"
        }
    };

    const keywordGroups = {
        happy: [
            "听懂", "懂了", "明白", "会了", "理解了", "学会", "成功", "太好了", "不错", "可以了", "对了", "好耶", "简单", "清楚"
        ],
        confused: [
            "没懂", "不懂", "不会", "什么意思", "为什么", "看不懂", "不明白", "没理解", "再讲", "换一种", "哪里", "解释一下", "听不懂"
        ],
        anxious: [
            "焦虑", "紧张", "着急", "来不及", "怕", "担心", "慌", "压力", "完不成", "怎么办", "要考", "考核"
        ],
        frustrated: [
            "烦", "崩溃", "太难", "好难", "又错", "错了", "复杂", "麻烦", "不会做", "做不出来", "算了", "放弃"
        ]
    };

    const sourceWeights = {
        text: 1.25,
        voice: 1,
        behavior: 1.15
    };

    function normalize(text) {
        return String(text || "").replace(/\s+/g, " ").trim();
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function scoreText(text) {
        const normalized = normalize(text);
        const scores = {
            happy: 0,
            confused: 0,
            anxious: 0,
            frustrated: 0,
            neutral: 0.2
        };

        Object.entries(keywordGroups).forEach(([emotion, words]) => {
            words.forEach((word) => {
                if (normalized.includes(word)) {
                    scores[emotion] += 1;
                }
            });
        });

        if (/！|!/.test(normalized)) {
            scores.happy += scores.happy > 0 ? 0.4 : 0;
            scores.frustrated += scores.frustrated > 0 ? 0.3 : 0;
        }

        if (/？|\?/.test(normalized)) {
            scores.confused += 0.45;
        }

        if (normalized.length <= 6 && /什么|咋|怎么|为啥/.test(normalized)) {
            scores.confused += 0.35;
        }

        return scores;
    }

    function resultFromScores(scores, source, weight = 1) {
        const entries = Object.entries(scores).sort((a, b) => b[1] - a[1]);
        const [emotion, score] = entries[0] || ["neutral", 0];
        const label = score > 0.35 ? emotion : "neutral";
        const confidence = clamp(0.42 + score * 0.2 * weight, 0.35, 0.96);

        return {
            label,
            confidence,
            source,
            score,
            profile: emotionProfiles[label] || emotionProfiles.neutral
        };
    }

    function detectTextEmotion(text) {
        return resultFromScores(scoreText(text), "text", 1);
    }

    function detectVoiceEmotion(text, meta = {}) {
        if (!meta || !meta.enabled) {
            return {
                label: "neutral",
                confidence: 0,
                source: "voice",
                inactive: true,
                profile: emotionProfiles.neutral
            };
        }

        if (meta.audioEmotion && !meta.audioEmotion.inactive) {
            const acoustic = meta.audioEmotion;
            const scores = scoreText(text);
            scores[acoustic.label] = (scores[acoustic.label] || 0) + Number(acoustic.confidence || 0.35) * 3.2;

            return resultFromScores(scores, "voice", 1.08);
        }

        const scores = scoreText(text);
        const normalized = normalize(text);
        if (normalized.length <= 8) {
            scores.confused += 0.15;
        }
        if (meta.interrupted) {
            scores.anxious += 0.35;
        }
        if (meta.fromWake) {
            scores.neutral += 0.1;
        }

        return resultFromScores(scores, "voice", 0.85);
    }

    function detectBehaviorEmotion(metrics = {}) {
        const scores = {
            happy: 0,
            confused: 0,
            anxious: 0,
            frustrated: 0,
            neutral: 0.25
        };

        const hintCount = Number(metrics.hintCount || 0);
        const repeatedCount = Number(metrics.repeatedCount || 0);
        const failureCount = Number(metrics.failureCount || 0);
        const questionCount = Number(metrics.questionCount || 0);

        if (hintCount >= 1) {
            scores.confused += 0.45 + hintCount * 0.12;
        }
        if (repeatedCount >= 1) {
            scores.confused += 0.45 + repeatedCount * 0.16;
        }
        if (failureCount >= 1) {
            scores.frustrated += 0.5 + failureCount * 0.14;
        }
        if (questionCount >= 4 && hintCount === 0 && failureCount === 0) {
            scores.happy += 0.35;
        }

        return resultFromScores(scores, "behavior", 0.9);
    }

    function mergeEmotion(...items) {
        const valid = items.filter((item) => item && !item.inactive);
        if (!valid.length) {
            return buildEmotionState({ text: detectTextEmotion("") });
        }

        const totals = {
            happy: 0,
            confused: 0,
            anxious: 0,
            frustrated: 0,
            neutral: 0
        };
        let totalWeight = 0;

        valid.forEach((item) => {
            const source = item.source || "text";
            const weight = sourceWeights[source] || 1;
            const label = item.label || "neutral";
            totals[label] = (totals[label] || 0) + Number(item.confidence || 0.35) * weight;
            totalWeight += weight;
        });

        const [label, score] = Object.entries(totals).sort((a, b) => b[1] - a[1])[0];
        const confidence = clamp(score / Math.max(totalWeight, 1), 0.35, 0.96);

        return {
            label,
            confidence,
            source: valid.map((item) => item.source).join("+"),
            profile: emotionProfiles[label] || emotionProfiles.neutral
        };
    }

    function buildEmotionState({ text, voice, behavior } = {}) {
        const merged = mergeEmotion(text, voice, behavior);
        const profile = merged.profile || emotionProfiles.neutral;
        return {
            label: merged.label,
            labelText: profile.label,
            confidence: merged.confidence,
            strategy: profile.strategy,
            output: profile.output,
            action: profile.action,
            profile,
            sources: {
                text: text || null,
                voice: voice || null,
                behavior: behavior || null
            }
        };
    }

    function rewriteReply(text, emotion) {
        const content = normalize(text);
        const profile = (emotion && emotion.profile) || emotionProfiles.neutral;
        if (!content || !profile.prefix) {
            return content;
        }

        if (content.startsWith(profile.prefix)) {
            return content;
        }

        return `${profile.prefix}\n${content}`;
    }

    function speechOptions(emotion) {
        const profile = (emotion && emotion.profile) || emotionProfiles.neutral;
        const emotionLabel = (emotion && emotion.label) || "neutral";
        let ttsInstruction = "请用自然、清晰、平稳的语气讲解。";

        if (emotionLabel === "happy") {
            ttsInstruction = "请用轻快、积极、带一点高兴的语气讲解。";
        } else if (emotionLabel === "confused") {
            ttsInstruction = "请用耐心、安抚、循序渐进的语气讲解。";
        } else if (emotionLabel === "anxious") {
            ttsInstruction = "请用平静、安慰、稳定情绪的语气讲解。";
        } else if (emotionLabel === "frustrated") {
            ttsInstruction = "请用鼓励、支持、温和安慰的语气讲解。";
        }

        return {
            emotion: emotionLabel,
            expression: profile.expression,
            playbackRate: profile.playbackRate,
            browserRate: profile.browserRate,
            browserPitch: profile.browserPitch,
            strategy: profile.strategy,
            output: profile.output,
            ttsInstruction
        };
    }

    function applyExpression(emotion, duration = 5600) {
        const options = speechOptions(emotion);
        const api = window.__live2dHostApi;
        if (!api || typeof api.playExpression !== "function") {
            return false;
        }

        if (options.expression === "neutral") {
            if (typeof api.clearExpression === "function") {
                api.clearExpression();
            }
            return true;
        }

        return api.playExpression(options.expression, duration);
    }

    window.__digitalHumanEmotion = {
        profiles: emotionProfiles,
        detectText: detectTextEmotion,
        detectVoice: detectVoiceEmotion,
        detectBehavior: detectBehaviorEmotion,
        buildState: buildEmotionState,
        merge: mergeEmotion,
        rewriteReply,
        speechOptions,
        applyExpression
    };
})();
