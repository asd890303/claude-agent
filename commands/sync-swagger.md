---
description: 更新後端 Swagger 本地快取（docs/swagger/），並回報 endpoint 增減
---

# /sync-swagger — 更新 Swagger 本地快取

將後端 Swagger JSON 下載並拆分為省 token 的本地快取，供開發時查閱 API 規格，不需每次連內網或載入整份 JSON。

> 依賴 `scripts/swagger-sync.mjs`（隨此包附帶）。使用前把該 script 放到目標專案的 `scripts/` 下。

## 執行步驟

1. 從專案自身的設定（如專案 `CLAUDE.md` 的 Swagger 表、或 `.env`）取得各站 JSON 規格 URL；**內網位址不寫死在 script 或本檔**。
2. 對每個要更新的站台執行（使用者只指定單站時只跑該站）：

   ```bash
   node scripts/swagger-sync.mjs --site <站台代稱> --url <該站 JSON URL>
   ```

3. 將 script 輸出的 endpoint 新增／移除清單回報給使用者（`docs/swagger/` 通常已 gitignore，schema 層級變動不反映在 git diff；使用者關心特定 endpoint 欄位變化時，直接讀更新後的 `paths/{tag}.md` 比對）。
4. 下載 timeout 時提醒使用者確認 VPN／內網連線，不要重試多次。

## Token 成本

重複執行本 command 不會浪費 token：下載與拆分全在 node process 內完成，Swagger JSON（數百 KB）不進入對話 context，每次執行只消耗本說明文字與幾行 stdout（約數百 token）。token 消耗發生在後續「讀快取檔」，因此懷疑過時就放心重跑。

## 產出結構（每站）

```
docs/swagger/{站台代稱}/
├── openapi.json    # 原始規格（僅供 jq 備援，勿整份讀入）
├── INDEX.md        # endpoint 索引：METHOD path｜摘要｜對應 domain 檔
└── paths/{tag}.md  # 依 tag 分組的 Params / Request Body / Response schema
```

## 開發時查閱方式（agent 參考）

1. 先讀 `docs/swagger/{site}/INDEX.md` 找到 endpoint 與其 domain 檔。
2. 只讀對應的 `paths/{tag}.md` 取得欄位、enum、巢狀結構。
3. 本地快取查不到或懷疑過時時，先跑本 command 更新，而不是直接連 Swagger UI。
