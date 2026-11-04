# RAG、学生账号与个性化记忆部署

## 1. 环境要求

- Node.js 20+（当前 LangChain 1.x 的最低要求）
- PostgreSQL 15/16，并安装 `pgvector`、`pgcrypto`、`pg_trgm` 扩展
- DashScope API Key（问答与 `text-embedding-v3` 向量）
- 可选：Poppler (`pdftoppm`) 与 Tesseract OCR（仅扫描页需要）

## 2. 最快启动

在项目根目录执行：

```powershell
docker compose up -d postgres
Copy-Item .\06_配置与说明\.env.example .\06_配置与说明\.env
# 编辑 .env，填写 DASHSCOPE_API_KEY
npm.cmd --prefix .\04_后端服务 install
npm.cmd --prefix .\06_配置与说明 install
npm.cmd --prefix .\04_后端服务 run db:init
npm.cmd --prefix .\04_后端服务 run knowledge:import
npm.cmd --prefix .\06_配置与说明 run dev
```

访问 `http://127.0.0.1:3001/index.html`（后端默认 `3010` 端口）。右上角可注册/登录，个人中心可查看学习进度，并修改、删除或关闭长期记忆。

## 手机号注册与找回密码

登录页为 `http://127.0.0.1:3001/auth.html`。新账号通过中国大陆手机号、短信验证码和密码注册；注册手机号可通过验证码重置密码。已有邮箱账号保留原登录方式，但没有绑定手机号的旧账号无法使用手机验证码重置密码。

在 `.env` 中设置 `SMS_CODE_SECRET`（至少 24 位随机字符）、`ALIBABA_CLOUD_ACCESS_KEY_ID`、`ALIBABA_CLOUD_ACCESS_KEY_SECRET`、`ALIYUN_SMS_SIGN_NAME`、`ALIYUN_SMS_TEMPLATE_CODE`。阿里云短信签名和模板须先审核通过，模板参数应包含 `${code}` 对应的 `code` 字段。短信调用使用阿里云官方 Node.js SDK；验证码 5 分钟有效、60 秒发送间隔、最多验证 5 次，并按手机号和 IP 限流。正式短信发送还需要 PostgreSQL 已配置并初始化。

仅在本地调试时可设置 `SMS_DEV_MODE=true`，接口会在响应中返回验证码；`NODE_ENV=production` 时该模式无效。上线时应保持 `SMS_DEV_MODE=false`，并将短信凭证和密钥放在服务端环境变量中。密码重置成功会使该账号原有登录令牌失效。

如果在 Windows 的 Ubuntu WSL 中安装了 PostgreSQL 16 和 pgvector，可从项目根目录运行 `powershell -ExecutionPolicy Bypass -File .\06_配置与说明\start-local-wsl.ps1`。该脚本保持 WSL 实例运行、启动本地数据库，再运行项目；重启电脑后也可用同一命令恢复开发环境。

## 3. 知识库导入

默认导入根目录 `knowledge` 下所有 PDF：

```powershell
npm.cmd --prefix .\04_后端服务 run knowledge:inspect
npm.cmd --prefix .\04_后端服务 run knowledge:import
```

`knowledge:inspect` 不连接数据库、不调用 Embedding，用于先查看每份资料的实际标题、正文分类、页数、OCR 页数和切片数。正式导入按绝对路径和 SHA-256 检测变化：未变化跳过，文件更新后删除旧片段并重新索引，同内容异名文件只登记重复来源而不重复向量化。

新增 PDF 后再次执行导入命令即可，不需要修改问答代码。

## 4. 检索与记忆行为

- 混合检索先按当前实验过滤，融合 pgvector 余弦相似度、`pg_trgm` 关键词相似度和词项命中率，召回 8 条并重排取 4 条。
- 回答提示中同时包含知识片段、当前实验状态、最近 8 轮、历史摘要和当前问题相关的长期记忆。
- 真实硬件文档和课程实验资料通过正文分类；网页实验状态被明确标注为简化仿真规则。
- 未登录保持旧版匿名内存会话；登录后对话、摘要、进度与长期记忆持久化并按 `student_id` 隔离。

## 5. 验证

```powershell
npm.cmd --prefix .\04_后端服务 test
```

测试覆盖章节切片、真值表不拆断、正文分类、重复 PDF 识别，以及来源文件/页码/章节的输出契约。部署后可用 `GET /api/health` 查看数据库与 RAG 就绪状态。

生产环境请更换数据库密码、启用 TLS/反向代理，并限制数据库网络访问。登录令牌只保存 SHA-256 哈希，学生密码使用 bcrypt cost 12 哈希。
