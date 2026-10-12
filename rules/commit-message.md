# Commit Message 規範

## 一、格式

```
[TICKET-000] <type>(<scope>): <摘要描述>

- <變更項目 1>
- <變更項目 2>
```

- 第一行：`[TICKET-000]` 前綴 + Conventional Commits 格式；`TICKET-000` 為草稿佔位，開發者自行替換為當前分支對應的單號（無單號慣例的專案則省略前綴，走純 Conventional Commits）
- 摘要語言依專案慣例（本人預設繁體中文）
- 空一行後條列具體變更，每項一個 bullet
- type：`feat` / `fix` / `refactor` / `chore` / `docs` / `style` / `test`

## 二、內容風格

- **精簡扼要**：bullet 只講「功能層級的變化」，不是逐行 changelog
- **不列** API path、欄位清單、型別名稱等實作細節
- **不過度解釋**：不寫「為了…所以…」的長篇因果，原因放 PR 描述
- bullet 至少 1 則、最多 4 則，數量依變更內容決定
- **不相關的主題拆成多則 commit**，不要塞在同一則

## 三、硬性禁止

- **不加 `Co-Authored-By` 之類的 AI 簽名行**
- 不使用 `--no-verify`、`--no-gpg-sign` 繞過 hooks
- **只在使用者明確要求時才 commit**；不主動 commit
- 偏好建立新 commit，不 amend 既有 commit

## 四、範例

```
[TICKET-123] fix(order): 修正詳情抽屜誤觸發重新掛載

- 抽屜關閉時保留快取，避免重複打 API
- 修正切換分頁後資料未同步的問題
```

```
[TICKET-000] feat(auth): 新增兩階段驗證登入流程

- 登入後要求輸入 Google 驗證碼
```
（單一功能也寫 1 則 bullet）
