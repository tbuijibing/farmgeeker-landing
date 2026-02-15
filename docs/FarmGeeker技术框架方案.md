# FarmGeeker AI智能助手 - 通用技术框架方案

## 一、技术栈选型

### 后端：Node.js + TypeScript + Fastify + tRPC
- 与 OpenClaw 生态无缝集成（同为 Node.js）
- 单一语言栈，AI agent 可直接读写代码
- Fastify 性能优于 Express，tRPC 前后端类型共享

### 前端：Next.js 14+ (App Router) + Tailwind + shadcn/ui
- SSR + SEO 友好，一套代码支持 Web 管理后台和 PWA
- Vercel 零配置部署，国内可用阿里云 Serverless

### 数据库：PostgreSQL（云端）+ SQLite（本地）+ Prisma ORM
- PostgreSQL：多租户云端，JSON/全文搜索
- SQLite：客户手机/电脑本地部署，零配置
- Prisma：同时支持两种数据库，自动生成类型

### 消息队列：BullMQ (Redis)
- 轻量级，支持延迟任务、重试、优先级
- 极简场景可用 pg-boss 替代

### 容器化：Docker + Docker Compose
### CI/CD：GitHub Actions

---

## 二、项目结构（Monorepo）

```
farmgeeker/
├── packages/
│   ├── core/           # 核心引擎（AI对话、记忆、任务调度、多租户）
│   ├── connectors/     # IM连接器（微信、WhatsApp、Telegram等）
│   ├── integrations/   # 第三方集成（CRM、电商、ERP）
│   ├── api/            # API服务（Fastify + tRPC）
│   ├── web/            # 管理后台（Next.js）
│   ├── mobile/         # 移动端（可选）
│   └── shared/         # 共享类型和工具
├── apps/
│   ├── server/         # 主服务入口
│   └── cli/            # 命令行工具
├── deploy/
│   ├── docker/         # Docker配置
│   ├── scripts/        # 部署脚本
│   └── configs/        # 环境配置模板
├── tests/
│   ├── e2e/            # 端到端测试
│   └── fixtures/       # 测试数据
├── pnpm-workspace.yaml
└── turbo.json          # Turborepo配置
```

---

## 三、插件化架构

### 连接器接口（Connector Interface）

```typescript
interface Connector {
  id: string              // 'wechat', 'telegram', etc.
  name: string
  init(config: ConnectorConfig): Promise<void>
  start(): Promise<void>
  stop(): Promise<void>
  onMessage(handler: MessageHandler): void
  sendMessage(target: string, message: Message): Promise<void>
  supports(feature: Feature): boolean
}
```

### 集成接口（Integration Interface）

```typescript
interface Integration {
  id: string              // 'taobao', 'shopify', etc.
  name: string
  category: 'ecommerce' | 'crm' | 'erp' | 'payment'
  authenticate(credentials: Credentials): Promise<void>
  sync(entity: string, options?: SyncOptions): Promise<SyncResult>
  execute(action: string, params: any): Promise<any>
  handleWebhook(payload: any): Promise<void>
}
```

### 配置驱动（YAML）

```yaml
connectors:
  wechat:
    enabled: true
    config:
      appId: "wx1234567890"
  telegram:
    enabled: true
    config:
      botToken: "${TELEGRAM_BOT_TOKEN}"

integrations:
  taobao:
    enabled: true
    config:
      appKey: "${TAOBAO_APP_KEY}"
  shopify:
    enabled: false
```

新增一个 IM 或电商平台 = 写一个插件包 + 配置文件启用，不改核心代码。

---

## 四、开发工作流

### 一条命令搭建环境
```bash
pnpm run setup
# 自动：安装依赖 → 启动 PostgreSQL+Redis → 数据库迁移 → 生成测试数据
```

### 开发命令
```bash
pnpm dev              # 全部服务热重载
pnpm test             # Vitest 单元+集成测试
pnpm test:e2e         # 端到端测试
pnpm lint             # ESLint + Prettier
```

### API 文档
- tRPC + OpenAPI 自动生成
- Swagger UI: `http://localhost:3000/api-docs`

### 代码规范
- ESLint + Prettier + Husky + lint-staged
- 提交前自动格式化和检查

---

## 五、部署方案

### 客户手机（Android Termux）
```bash
curl -L https://farmgeeker.com/install-android.sh | bash
# 自动安装 Node.js + SQLite，启动服务
```

### 客户电脑（Docker 一键）
```bash
docker-compose up -d
# PostgreSQL + Redis + FarmGeeker 全部启动
```

### 云端部署
- 单机：Docker Compose（2核4G，¥200-500/月）
- 规模化：Kubernetes + Helm Chart（自动扩缩容）

### 自动更新
- Docker：Watchtower 自动拉取新镜像
- 内置更新检查 + 通知用户

### 上架方案
- 企业微信应用市场（需服务商资质）
- 微信小程序（Taro 跨端框架）
- PWA（无需上架，直接访问）
- App Store / Google Play（React Native 打包）

---

## 六、MVP 优先级（2周）

### 第一周：核心骨架
1. AI 对话引擎（集成 OpenClaw + 记忆系统）— 3天
2. Telegram 连接器（最简单，无需认证）— 2天
3. 基础 API 服务（tRPC + JWT + SQLite）— 2天

### 第二周：部署和测试
4. 简单管理后台（Next.js，客户/对话/配置）— 3天
5. Docker 部署方案 — 1天
6. 端到端测试 — 1天
7. 文档 — 1天

### 后续迭代
- 第3周：企业微信连接器
- 第4周：淘宝/拼多多集成
- 第5周：多租户 + 计费系统
- 第6周：手机部署方案
