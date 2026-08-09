# LangChain 接入说明

## 当前状态

- 已接入 Node 后端服务
- 已接入 LangChain
- 已配置通义千问兼容接口
- 已预留普通问答接口和流式接口

## 启动方式

在项目根目录运行：

```bash
npm.cmd --prefix .\06_配置与说明 run dev
```

启动后访问：

```text
http://127.0.0.1:3000
```

## 环境变量

环境变量文件：

- `.env`
- `.env.example`

主要配置项：

- `DASHSCOPE_API_KEY`
- `DASHSCOPE_BASE_URL`
- `QWEN_MODEL_ID`
- `PORT`

## 可用接口

健康检查：

```text
GET /api/health
```

普通问答：

```text
POST /api/chat
```

请求体示例：

```json
{
  "question": "什么是与门",
  "experimentName": "实验一",
  "experimentState": {
    "gate": "AND",
    "A": 1,
    "B": 1
  }
}
```

流式问答：

```text
GET /api/chat/stream
```

## 当前注意事项

当前模型 `qwen3-omni-flash-realtime` 通过兼容接口调用时，上游返回了 `500 internal_error`。

这说明：

- 本地 LangChain 骨架已经搭好
- 本地服务可正常启动
- 健康检查接口可用
- 但这个模型当前经兼容接口直连时，回答接口还不稳定

后续可以继续做两件事：

1. 保留当前模型，等上游恢复后直接继续接前端
2. 临时切换到同样走兼容接口、但更稳定的文本模型做联调
