# 项目说明

- 当前仓库是管理端前端：`/Users/taylor/code/tools/Cli-Proxy-API-Management-Center-ori`
- 配套后端仓库：`/Users/taylor/code/tools/CLIProxyAPI-ori`
- 当前技术栈：React 19、Vite、TypeScript、SCSS Modules、Zustand

# 工作方式

- 当前仓库里的 Claude 任务默认聚焦前端实现、交互细节、样式与页面结构，不主动扩散到后端协议与接口设计。
- 遇到后端接口 shape、鉴权语义、字段命名不确定时，优先在结论里标注风险或待 Codex 继续收口，不要自行发明新协议。
- 默认保持改动范围尽量小，优先局部页面、组件、样式文件，不做无关的全局重构。

# 代码入口

- 应用入口：`src/main.tsx`
- 主应用：`src/App.tsx`
- 路由：`src/router/MainRoutes.tsx`
- 页面：`src/pages/`
- 全局样式：`src/styles/`
- 状态管理：`src/stores/`

# 样式约束

- 优先复用 `src/styles/variables.scss`、`src/styles/layout.scss`、`src/styles/themes.scss`
- 保持“管理后台 / 运维控制台”气质，不要做成通用营销页
- 避免紫色倾向、过度装饰和泛化卡片堆叠
- 空态、加载态、错误态要有明确层级和语义

# 验证

- 默认优先运行：
  - `npm run type-check`
  - `npm run build`
- 若任务仅做局部样式微调而未运行完整验证，需要在最终说明里明确写出

# 本地 skill

- 仓库内 frontend specialist skill：
  - `.codex/skills/cli-proxy-management-frontend-specialist/SKILL.md`
- 若上层由 Codex 发起 Claude 委派，优先结合该 skill 与当前 `CLAUDE.md` 一起作为项目上下文
