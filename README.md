# claude-agent

Claude Code 規則包

## 內容

| 檔案 | 內容 | 對應位置 |
| --- | --- | --- |
| `rules/CLAUDE.md` | 全域行為原則 | `~/.claude/CLAUDE.md` |
| `rules/comment-jsdoc.md` | 註解／JSDoc 撰寫規範 | `~/.claude/rules/` |
| `rules/commit-message.md` | Commit message 規範 | `~/.claude/rules/` |
| `rules/coding-conventions.md` | 通用程式碼慣例（magic number、enum 紀律、命名、非同步狀態回饋） | `~/.claude/rules/` |
| `commands/sync-swagger.md` | 更新 Swagger 本地快取的 slash 指令（已去專案化） | `~/.claude/commands/` |
| `scripts/swagger-sync.mjs` | `sync-swagger` 依賴的下載／拆分腳本 | 目標專案的 `scripts/` |