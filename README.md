# 数字电路交互仿真平台 · digital-circuit-mentor

> 面向大一新生的数字电路（数电）交互式仿真教学平台。融合 **Live2D 数字人讲解**、**语音唤醒问答**、**多模态情绪融合** 与 **AI 智能答疑**，帮助学生更快看懂实验、敢于动手、及时纠错。

[![License](https://img.shields.io/badge/license-MIT%20(live2d--widget)-blue.svg)](https://opensource.org/licenses/MIT)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org/)
[![LangChain](https://img.shields.io/badge/LangChain-%40langchain%2Fopenai-orange.svg)](https://js.langchain.com/)
[![DashScope](https://img.shields.io/badge/TTS%20%2F%20LLM-%E9%80%9A%E4%B9%89%E5%8D%83%E9%97%AE-9cf.svg)](https://help.aliyun.com/zh/dashscope/)

---

## ✨ 项目亮点

- **四大数电仿真实验**：基础逻辑门、半加器、三八译码器、D 触发器，纯前端交互，切换输入即可观察输出联动与真值规律。
- **Live2D 数字人「小芯」**：网页内嵌二次元看板娘（默认 `shizuku` 模型），随实验节奏做口型、表情与肢体动画。
- **多模态情绪融合**：综合「文本 / 语音 / 行为」三类信号，识别 中性 / 困惑 / 焦虑 / 受挫 / 积极 五种状态，自动调整讲解语速、表情与教学策略。
- **语音唤醒 + 语音问答**：基于浏览器 Web Speech API 的唤醒词「小芯小芯」与语音转文字；后端提供 TTS 实时语音合成，让数字人「开口说话」。
- **AI 智能答疑**：基于 LangChain + 通义千问（OpenAI 兼容接口），结合当前实验上下文与历史对话，给出带教学引导的中文回答，支持流式输出。
- **音频情绪识别**：独立的 Python 服务，用 `wav2vec2` 模型（带 RMS/ZCR 兜底算法）从麦克风音频推断学习者情绪，回馈前端策略。

---

## 🧰 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | 原生 HTML / CSS / JavaScript（无框架）、[Live2D Widget](https://github.com/stevenjoezhang/live2d-widget) |
| 后端 | Node.js · Express · LangChain(`@langchain/openai` `ChatOpenAI`) · `ws`(WebSocket) |
| 大模型 | 阿里云百炼 / DashScope 通义千问（Qwen，OpenAI 兼容模式） |
| 语音合成 | 阿里云 DashScope 实时语音合成（`qwen-tts-realtime`，默认音色 `Cherry`），浏览器 `SpeechSynthesis` 兜底 |
| 音频情绪 | Python · FastAPI · Transformers(`wav2vec2-base-superb-er`) · `uvicorn` |
| 运行入口 | `06_配置与说明/start.js`（静态服务 + 拉起后端） |

---

## 📂 目录结构

```
.
├── 01_页面文件/            # 前端页面（HTML + 资源）
│   ├── index.html         #   首页：实验选择 + 数字人讲解区 + 语音问答 + 信号脉冲舱
│   ├── experiment-gate.html        # 实验一：基础逻辑门
│   ├── experiment-half-adder.html   # 实验二：半加器
│   ├── experiment-decoder.html      # 实验三：三八译码器
│   ├── experiment-flip-flop.html    # 实验四：D 触发器
│   └── logo.png
├── 02_前端脚本/            # 前端 JS（scripts/）
│   └── scripts/
│       ├── app.js                      # 首页主逻辑：语音助手、情绪、挑战、信号舱
│       ├── experiment-voice-assistant.js # 实验页语音助手（唤醒/问答/情绪）
│       ├── experiment-gate.js / -half-adder.js / -decoder.js / -flip-flop.js
│       ├── live2d-host.js              # Live2D 看板娘集成 + 口型/表情驱动
│       └── emotion-utils.js           # 多模态情绪融合配置与判定
├── 03_样式文件/            # 前端 CSS（styles/）：main / 各实验 / emotion-panel / live2d-host
├── 04_后端服务/            # Node 后端源码 + 音频情绪 Python 服务
│   ├── server.js                   # Express + LangChain + TTS(WebSocket) + 流式问答
│   ├── audio_emotion_service.py    # FastAPI 音频情绪识别（wav2vec2）
│   └── package.json
├── 05_代表性素材/          # logo.png / logo.zip 等素材
├── 06_配置与说明/          # 运行配置与说明
│   ├── package.json       # 项目元信息（digital-circuit-mentor），dev 脚本 = node start.js
│   ├── start.js           # 前端静态服务器 + 拉起 04 后端
│   ├── .env / .env.example# 环境变量（密钥请走 .env，勿提交）
│   └── LANGCHAIN-SETUP.md # LangChain 接入说明
├── 07_数字人组件/          # Live2D Widget 源码（第三方，MIT）
│   └── live2d-widget-master/
├── 08_依赖文件/            # 依赖缓存（node_modules，体积大，忽略提交）
└── 09_缓存与临时/          # 临时文件、IDE 缓存（忽略提交）
```

> `01_页面文件` 中的 `scripts`、`styles`、`live2d-widget-master` 为指向 `02/03/07` 的符号链接，便于页面以相对路径直接引用。

---

## 🚀 快速开始

### 环境要求

- Node.js ≥ 18
- Python ≥ 3.9（音频情绪识别为可选；未安装 `torch` 时会自动降级为 RMS/ZCR 兜底算法）
- 一个可用的 **阿里云百炼 / DashScope API Key**（通义千问）

### 1. 安装依赖

后端有两个 `package.json`，均需安装（分别位于 `06_配置与说明` 与 `04_后端服务`）：

```bash
# Windows
npm.cmd --prefix .\06_配置与说明 install
npm.cmd --prefix .\04_后端服务 install

# macOS / Linux
npm --prefix ./06_配置与说明 install
npm --prefix ./04_后端服务 install
```

Python 音频情绪服务（可选）：

```bash
pip install fastapi uvicorn transformers torch numpy pydantic
```

### 2. 配置环境变量

复制模板并填入你的 Key：

```bash
cp 06_配置与说明/.env.example 06_配置与说明/.env
```

```dotenv
DASHSCOPE_API_KEY=你的_api_key_here
DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
QWEN_MODEL_ID=qwen-max
PORT=3010
```

### 3. 启动

```bash
# Windows
npm.cmd --prefix .\06_配置与说明 run dev

# macOS / Linux
npm --prefix ./06_配置与说明 run dev
```

启动后会自动：
1. 在 `http://127.0.0.1:3001` 提供前端静态服务；
2. 拉起 Node 后端（默认 `3000`，本仓库 `.env` 设为 `3010`）；
3. 按需拉起 Python 音频情绪服务（`PORT+1`）。

### 4. 访问

打开 **http://127.0.0.1:3001/index.html** 即可使用。后端健康检查：`GET /api/health`。

---

## ⚙️ 配置项说明

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `DASHSCOPE_API_KEY` | （空） | 阿里云百炼 / DashScope 密钥 |
| `DASHSCOPE_BASE_URL` | `https://dashscope.aliyuncs.com/compatible-mode/v1` | 通义千问 OpenAI 兼容端点 |
| `QWEN_MODEL_ID` | `qwen-max` | 文本问答模型 |
| `DASHSCOPE_TTS_MODEL` | `qwen-tts-realtime` | 语音合成模型 |
| `DASHSCOPE_TTS_VOICE_ID` | `Cherry` | TTS 音色 |
| `PORT` | `3000` | 后端 API 端口（`.env` 设为 `3010`） |
| `FRONTEND_PORT` | `3001` | 前端静态服务端口 |
| `AUDIO_EMOTION_PORT` | `PORT+1` | 音频情绪服务端口 |
| `AUDIO_EMOTION_MODEL_ID` | `superb/wav2vec2-base-superb-er` | 情绪识别模型 |

---

## 🔌 后端 API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/health` | 健康检查（返回模型、baseUrl） |
| `POST` | `/api/chat` | 普通问答，body：`{ question, experimentName, experimentState, sessionId }` |
| `GET` | `/api/chat/stream` | SSE 流式问答，query：`question / experimentName / experimentState / sessionId` |
| `POST` | `/api/tts` | 文本转语音，返回 `audio/wav` 或 `audio/mpeg` |
| `GET` | `/api/audio-emotion/health` | 音频情绪服务健康 |
| `POST` | `/api/audio-emotion` | 音频情绪识别，body：`{ audioBase64 }` |

**问答示例（含实验上下文）：**

```json
POST /api/chat
{
  "question": "什么是与门",
  "experimentName": "实验一",
  "experimentState": { "gate": "AND", "A": 1, "B": 1 }
}
```

**会话与流式：** 通过 `sessionId` 维护最近 6 轮历史（TTL 6 小时），`/api/chat/stream` 以 `data: {token}` 增量推送。

**语音合成：** 非 `qwen-tts-realtime` 模型走 DashScope inference WebSocket（MP3）；实时模型走 realtime WebSocket（PCM→WAV）。

---

## 🧪 实验模块

| 实验 | 页面 | 学习内容 |
| --- | --- | --- |
| 一 · 基础逻辑门 | `experiment-gate.html` | 与门 / 或门 / 非门 / 异或门 的输入输出规律，真值表高亮 |
| 二 · 半加器 | `experiment-half-adder.html` | 两位相加，和位 `S` 与进位 `C` 的形成，二进制加法基础 |
| 三 · 三八译码器 | `experiment-decoder.html` | 三位输入 `A2 A1 A0` 到八路输出 `Y0–Y7` 的选通关系 |
| 四 · D 触发器 | `experiment-flip-flop.html` | 时钟上升沿数据锁存，时序电路入门 |

每个实验页都内嵌数字人讲解区，能跟随用户每一步操作实时讲解，并提供同款语音唤醒与问答能力。

---

## 🤖 数字人与多模态情绪

- **数字人**：基于 `live2d-widget-master`（第三方 MIT 项目），默认加载 `shizuku` 模型（`live2d-host.js` 中可替换）。`live2d-host.js` 负责口型随 TTS 音频能量起伏、表情预设切换，以及「讲解 / 思考 / 鼓励 / 安抚」等状态驱动。
- **多模态情绪融合**（`emotion-utils.js`）：将文本关键词、语音情绪识别结果、用户行为（连续追问 / 重复提问 / 答错次数）融合为五种情绪状态，并映射到：
  - 表情（`happy / thinking / calm / encourage / neutral`）
  - 语速（`playbackRate` / 浏览器 `rate` / `pitch`）
  - 教学策略（推进 / 换种说法 / 降低难度 / 鼓励定位错误 / 正常）

---

## 🎙️ 语音助手

- **唤醒词**：「小芯小芯 / 小芯 / 小新 / 晓芯 / 晓欣 / 小心」等别名（`wakeAliasPattern`）。
- **打断**：「等一下 / 停一下 / 先别说了 / 打断一下 / 暂停一下 / 等会 / 停」可中断当前讲解。
- **识别**：浏览器 Web Speech API（`webkitSpeechRecognition`），中文 `zh-CN`；语音待命状态持久化到 `localStorage`。
- **播报**：优先后端 DashScope TTS，降级为浏览器 `SpeechSynthesis`（偏好 Microsoft Xiaoxiao / Xiaoyi 中文音色）。

---

## ⚠️ 开源 / 上线前必读（安全）

1. **不要提交任何密钥。** 本仓库 `.env` 已被 `.gitignore` 忽略；但 **`04_后端服务/server.js` 中硬编码了一个 DashScope API Key**（`embeddedDashScopeApiKey = "sk-..."`）。上传 GitHub 前请：
   - 立即在阿里云控制台 **吊销并轮换** 该 Key；
   - 将 `server.js` 中的硬编码值改为从环境变量读取（例如 `process.env.DASHSCOPE_API_KEY`），或置空后仅依赖 `.env` / 运行环境注入。
2. **忽略体积目录。** 已提供根 `.gitignore`，忽略 `node_modules/`、`*.tmp`、`__pycache__/`、`.idea/`、`.env` 等。务必确认 `08_依赖文件`、`04/06` 下的 `node_modules` **未被提交**。
3. **模型与资源外链。** Live2D 模型默认从 jsDelivr CDN 加载；如需离线部署，请改为本地 `model.json` 路径。

---

## 📜 许可证

- `07_数字人组件/live2d-widget-master` 为第三方项目，遵循其自身 **MIT** 许可证（© stevenjoezhang）。
- 本平台其余源码（前端页面、脚本、样式、后端服务、说明文档）许可证未单独声明；如用于公开发布，请补充合适的开源协议（如 MIT / Apache-2.0）。

---

## 🙏 致谢

- [live2d-widget](https://github.com/stevenjoezhang/live2d-widget) —— 网页 Live2D 看板娘组件。
- 阿里云百炼 / DashScope —— 通义千问大模型与实时语音合成能力。
- Hugging Face `superb/wav2vec2-base-superb-er` —— 音频情绪识别基座模型。
