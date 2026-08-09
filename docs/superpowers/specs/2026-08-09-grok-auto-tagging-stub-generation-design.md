# 批次骨架卡片產生 + Grok AI 自動標籤分類 — 設計文件

- 日期：2026-08-09
- 狀態：待使用者審閱
- 前置依賴：[2026-08-09-kobo-obsidian-feynman-system-design.md](2026-08-09-kobo-obsidian-feynman-system-design.md)（已實作並上線）

## 1. 背景與目標

原始 Vault 骨架上線後，實際使用發現手動流程摩擦太大：每條劃線都要按快捷鍵、在跳出的提示框裡逐一貼上 kobo-id、劃線原文、書名、標籤，才能建立一張費曼卡片。使用者希望「匯入後可以自動整理」。

釐清後確認自動化範圍**明確排除**費曼轉譯本身——白話重述與個人經驗錨點是這套系統的核心學習機制，必須由使用者親自完成，AI 代勞就失去內化效果。自動化只涵蓋兩件事：

1. **卡片骨架的機械欄位**：來源書名、kobo-id、劃線原文、建立日期——這些原本就是複製貼上的操作，沒有思考成分，適合自動化。
2. **主題標籤分類**：判斷「這條劃線該歸到哪個主題」原本也需要人腦判斷，但屬於分類性質的判斷（不是內化學習），適合交給 Grok（xAI）AI 做初步分類，使用者仍可事後手動調整。

## 2. 已知限制與風險（設計前提）

1. **這不會取代費曼轉譯**：自動產生的卡片一律標記 `status: stub`，內文的「費曼轉譯」「個人經驗錨點」區塊維持空白，使用者必須手動填寫並將 `status` 改為 `done`，Dashboard 會分別列出兩種狀態的卡片。
2. **標籤詞庫從零開始**：目前 Vault 沒有任何使用者建立的真實標籤，因此 Grok 一開始必須自由發明標籤名稱。設計上讓 Grok 每次分類優先重用既有標籤詞庫，只有真的沒有貼切選項時才創新標籤，讓詞庫隨使用自然收斂，不需要使用者預先設計分類系統。
3. **隱私與資料外流**：批次執行時，劃線原文與書名會被傳送到 xAI 的伺服器做分類。這是使用第三方 AI 服務無法避免的資料外流，必須在 README 明確揭露，讓使用者知情。
4. **網路依賴與失敗處理**：AI 分類呼叫可能因網路、金鑰失效、額度用盡等原因失敗。設計上採「每條劃線獨立包一層錯誤處理」——單條分類失敗不影響整批次，該條卡片改貼 `未分類` 標籤照常建立，批次結束後跳出「成功 N／未分類 M」的統計通知。
5. **金鑰安全（本次設計過程中已修正的既有風險）**：本 repo 為公開 GitHub repo（`chadcoco1444/ReadGraph`）。API 金鑰一律存放於 vault 根目錄的 `.env` 檔案（`GROK_API_KEY=...`），已加入 `.gitignore`，絕不進版本控制。過程中意外發生過一次金鑰貼入對話視窗而外洩的事件，已請使用者到 xAI 後台重新產生金鑰；同時也把先前遺漏的 `.env` 與 `00_Inbox/`（含真實個人劃線內容）一併補上 gitignore 保護，兩者都已推送到遠端修復。

## 3. Obsidian 沒有跨外掛事件鏈機制

Obsidian 不存在「外掛 A 完成後自動觸發外掛 B」的原生機制，除非開發完整的自訂 TypeScript 外掛（開發與長期維護成本遠高於本次需求）。因此本設計採用 Templater 既有能力做到的最佳近似：**使用者在 Kobo 同步完成後，手動按下一個獨立的批次快捷鍵**，而非真正零點擊的全自動。

Templater 的「Template hotkeys」機制只能把快捷鍵綁定在「用範本建立一則新筆記」這個動作上，無法直接把快捷鍵綁定到一段獨立執行的程式碼。因此技術上採用「觸發用範本」模式：建立一個內容只有一段程式碼的範本檔案，綁定快捷鍵後，一按下去就會建立一則新筆記、執行程式碼（呼叫 User Script 做完整批次處理）、跳出結果通知，然後這則觸發用筆記在腳本執行完畢後自我刪除，使用者只會看到最終產生的骨架卡片，不會留下多餘的中介筆記。

## 4. 整體流程

```
[ Kobo 讀書劃線 ]
       │ (Kobo Highlights Importer)
       ▼
[ 00_Inbox / 原始書籍劃線 ]（唯讀，不變）
       │ (按下「批次產生骨架」快捷鍵)
       │   1. 掃描 00_Inbox，比對 01_Cards 已有的 source_id，找出所有待處理劃線
       │   2. 逐條呼叫 Grok API，決定主題標籤（優先重用標籤詞庫，必要時創新標籤；失敗則標「未分類」）
       │   3. 在 01_Cards 建立骨架卡片：source / source_id / source_quote / date / tags 自動填好，status: stub
       ▼
[ 01_Cards / 骨架卡片（status: stub）]
       │ (使用者打開卡片，手動撰寫費曼轉譯＋個人經驗錨點)
       │ (完成後手動將 status 改為 done)
       ▼
[ 01_Cards / 完成卡片（status: done）]
       │ (Dataview & Local Graph 連結，流程不變)
       ▼
[ 02_MOC / 主題地圖 ] ➔ [ 03_Output / 專案與文章 ]
```

## 5. 新增／修改元件

| 檔案 | 動作 | 說明 |
|---|---|---|
| `.env` | 新增（已 gitignore） | 內容為一行 `GROK_API_KEY=<金鑰>` |
| `90_Templates/scripts/tag_vocabulary.json` | 新增（**進版本控制**） | 累積 Grok 用過的標籤詞庫（純字串陣列），非機密資料，版控可保留知識分類演變歷史 |
| `90_Templates/scripts/generate_stubs.js` | 新增（Templater User Script） | 核心邏輯：掃描待處理劃線 → 逐條呼叫 Grok 分類 → 更新標籤詞庫 → 建立骨架卡片 → 回傳統計結果 |
| `90_Templates/_批次產生骨架.md` | 新增（觸發用範本，綁定新快捷鍵） | 呼叫上述腳本、用 `Notice` 跳出「成功 N／未分類 M」通知、執行完畢刪除自己（`tp.file.delete()` 或等效 API） |
| `90_Templates/Feynman_Zettel_Template.md` | 修改 | frontmatter 新增 `status: stub` 欄位，與批次產生的卡片保持一致的欄位結構 |
| `99_Dashboard.md` | 修改 | 新增「已建骨架、尚未費曼轉譯」查詢區塊（純 Dataview 語法，見第 7 節） |
| `.gitignore` | 修改（已完成） | 新增 `.env`、`00_Inbox/*`（保留 `.gitkeep`） |
| `README.md` | 修改 | 新增「設定 Grok API」章節（申請金鑰、建立 `.env`、隱私揭露）；日常操作流程表更新（見第 8 節） |

## 6. Grok API 分類邏輯

**呼叫方式**：Templater User Script 執行環境具備 Node/Electron 能力，直接用 `fetch()` 呼叫 xAI Chat Completions API（`https://api.x.ai/v1/chat/completions`），不需額外安裝 HTTP 相關套件或外掛。金鑰從 `.env` 的 `GROK_API_KEY` 讀取。

**每條劃線的分類流程：**
1. 讀取 `tag_vocabulary.json`（檔案不存在時視為空陣列，這是第一次執行的正常狀態）
2. 組成分類提示，內容包含：劃線原文、所屬書名、目前標籤詞庫清單；指示「優先從清單中選一個語意最貼切的既有標籤；只有清單中真的沒有合適選項時，才創造一個新的簡短標籤（單一詞彙、不含 `#`、不分層）」
3. 解析 Grok 回傳的標籤文字；若為詞庫中沒有的新標籤，追加寫回 `tag_vocabulary.json`
4. 將標籤填入新卡片的 `tags` 欄位

**失敗處理**：任何一條劃線的 API 呼叫逾時、回傳錯誤、或回應格式無法解析，該條標籤改為 `未分類`，卡片照常建立，不中斷整批次的其餘處理。

**批次完成通知**：以 Obsidian 原生 `Notice` API 顯示「本次共處理 N 條劃線，成功分類 X 條，M 條標記為未分類」。

**建置時第一步必做：API 串接驗證**（比照原始設計文件的安全測試 SOP 精神）：xAI Chat Completions API 的請求／回應格式雖採業界慣用的 OpenAI 相容格式，但實際欄位命名、回應是否穩定為單一標籤字串、是否需要額外的 `response_format` 設定才能拿到乾淨輸出，都需要建置時先用一條真實劃線資料手動測試一次 API 呼叫，確認能正確解析出標籤文字，再進入批次邏輯開發，避免重蹈先前 Kobo 範本資料結構誤判的覆轍。

## 7. Dashboard 新增查詢

在 `99_Dashboard.md` 新增一個區塊，純 Dataview 語法即可，不需要 DataviewJS（因為只依賴 frontmatter 欄位，不需掃描檔案內文）：

```dataview
TABLE source AS "來源書籍", tags AS "標籤"
FROM "01_Cards"
WHERE status = "stub"
SORT date DESC
```

原本判斷「完全還沒建卡」的方案 A／方案 B 查詢（依據 `00_Inbox` 劃線是否有任何卡片引用其 `kobo-id`）維持不變，因為那個邏輯只看「卡片是否存在」，不看 `status` 欄位，不受本次變更影響。

## 8. 日常操作流程更新

| 階段 | 操作 |
|---|---|
| 🐜 蒐集 | Kobo 接 USB → 執行 Kobo Highlights Importer → `00_Inbox` 更新（不變） |
| 🤖 自動骨架化（新） | 按下「批次產生骨架」快捷鍵 → 系統自動為每條新劃線建立卡片並呼叫 Grok 分類標籤 → 跳出處理結果通知 |
| 🐛 內化 | 打開 `99_Dashboard.md`「已建骨架、尚未費曼轉譯」清單 → 選一張卡片 → 手動撰寫費曼轉譯與個人經驗錨點 → 完成後將 `status` 改為 `done` |
| 🕸️ 連結 | 卡片內文用 `[[概念]]` 連結相關概念（不變） |
| 🐝 創造 | 打開 MOC、整理成文章（不變） |

`Feynman_Zettel_Template.md` 的既有手動流程（一次填完整張卡片）保留，供沒有對應 Kobo 劃線的獨立想法使用；新建立的卡片同樣預設 `status: stub`，維持欄位結構一致。

## 9. 最終交付物清單

1. `.env`（gitignore，本地建立，不隨程式碼交付，僅 README 說明建立步驟）
2. `90_Templates/scripts/tag_vocabulary.json`（初始為空陣列 `[]`）
3. `90_Templates/scripts/generate_stubs.js`
4. `90_Templates/_批次產生骨架.md`
5. `90_Templates/Feynman_Zettel_Template.md`（修改：新增 `status: stub`）
6. `99_Dashboard.md`（修改：新增「已建骨架、尚未費曼轉譯」查詢）
7. `README.md`（修改：新增 Grok API 設定章節、更新日常操作流程表）
8. 本設計文件

## 10. 明確排除範圍（Out of Scope）

- AI 自動生成費曼轉譯內容或個人經驗錨點（違背系統的學習方法核心，明確排除）
- AI 自動建立雙向連結（`[[相關概念]]`）或自動生成 MOC 結構
- 真正零點擊的全自動化（監聽 Kobo 外掛匯入事件並自動觸發）：需要自訂 Obsidian 外掛開發，超出本次範圍
- Grok API 之外的其他 AI 供應商整合
- 標籤詞庫的手動編輯介面（目前僅透過腳本自動讀寫 `tag_vocabulary.json`，使用者如需手動調整，直接編輯 JSON 檔案或修改卡片 frontmatter 即可，不提供額外介面）
