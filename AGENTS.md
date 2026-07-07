# Codex 项目开发规范

这份规范是 Codex 在本仓库写代码、改代码和整理文档时的默认入口。除非用户明确要求不同做法，先遵守这里，再看更具体的子目录 `AGENTS.md`。

## 开始前

- 先读相关 README、`docs/` 下的架构/API/前端文档和当前代码结构，再动手。
- 优先复用已有 service、repository、helper、types、hooks、components、utils 和测试工具。
- 改动范围保持小，只处理本次需求直接相关的文件。
- 不新增无关依赖，不做无关重构，不顺手格式化大批无关文件。
- 不回滚用户已有改动；遇到无关脏文件时忽略。

## 文档位置

- 正式文档统一放在根目录 `docs/`。
- `docs/api/`：后端接口文档。
- `docs/frontend/`：前端页面、组件、样式规范。
- `docs/architecture/`：架构、流程、模块设计。
- `docs/operations/`：脚本、运维、迁移、排查记录。
- `docs/archive/`：过期但暂时需要保留的历史文档。
- 不要在 `src/`、`apps/web/src/`、`tmp/` 新增正式文档；代码旁边只允许保留必要 README 或旧路径跳转。
- 后端新增或修改 API 时，同步更新 `docs/api/*.md`。
- 前端新增页面、交互或样式约定时，同步更新 `docs/frontend/*.md`。
- 较大实现完成后，在 `docs/operations/codex-implementation-log.md` 的“实现记录”顶部追加简短记录：改了什么、为什么、怎么验证。

## 文件大小和拆分

- 单个业务文件建议控制在 300 行以内。
- 超过 300 行时，优先按职责拆分组件、hook、service、repository、mapper、validator、types、constants、utils、prompt 或 workflow。
- 超过 500 行通常必须拆分；如果暂时不拆，需要在实现记录或最终说明中写明原因。
- 触达已有 500+ 行文件时，只拆本次改动相关部分，避免为了“整理”制造大范围风险。

## 后端

- 路由只做鉴权、参数读取和 handler 绑定。
- 业务流程放 service/use-case；数据库访问放 repository 或现有数据访问层。
- 参数校验、响应映射、分页、排序、错误处理优先复用现有实现。
- 新增脚本只做编排；可复用逻辑沉淀到 `src/` 下的领域模块。
- 涉及数据库、接口、脚本、后台任务或兼容路径时，在文档和实现记录里写清影响范围。

## 前端

- 先看 `apps/web/AGENTS.md` 和同页面现有目录风格。
- 页面入口保持轻量，复杂状态和业务流程放 `hooks/`。
- 请求放 `services/`，类型放 `types.ts`，常量放 `constants.ts`，纯函数放 `utils.ts`。
- UI 按功能拆到 `components/`，不要把页面、弹窗、请求、数据转换和样式堆在一个文件。
- 样式优先使用同模块 `.less` / `.module.less` / 现有 CSS；全局样式只放基础和通用规则。

## 验证

- 文档改动通常不需要完整构建，检查链接和路径即可。
- 代码改动按影响范围运行现有命令，例如 `npm run build:server`、`npm run build:web`、`npm test` 或模块测试。
- 如果校验失败，说明是本次改动、环境问题还是既有问题。
