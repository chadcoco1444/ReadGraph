# 全面改用 Karpathy LLM Wiki 外掛 — 架構重新設計

- 日期：2026-08-10
- 狀態：待使用者審閱
- **本文件取代**：[2026-08-09-kobo-obsidian-feynman-system-design.md](2026-08-09-kobo-obsidian-feynman-system-design.md)、[2026-08-09-grok-auto-tagging-stub-generation-design.md](2026-08-09-grok-auto-tagging-stub-generation-design.md) 兩份先前設計文件裡「費曼卡片手動內化」與「批次骨架＋Grok 自動分類」的部分。兩份舊文件保留作為歷史紀錄，不回頭修改。

## 1. 背景與這次的核心決定

原始系統的核心精神是「AI 只做分類、費曼轉譯與個人經驗連結必須由使用者親自撰寫」——這個決定在先前兩輪設計裡都明確確認過。

這次使用者提出全新方向：改用真實存在的第三方 Obsidian 外掛 **Karpathy LLM Wiki**（`green-dalii/obsidian-llm-wiki`，2026 年發布），讓 AI 直接讀取 Kobo 劃線、自動編譯成結構化的知識頁面（實體、概念），不再要求使用者手動撰寫費曼轉譯。

**這是一次明確的、經過確認的推翻**：使用者在得知這跟先前的決定直接衝突後，仍選擇「完全推翻，改用 AI 自動編纂」。本文件記錄這次決定與新架構，不對這個選擇本身做評價。

### 1.1 已查證的事實（避免重蹈先前踩過的雷）

- **外掛真實存在**：`green-dalii/obsidian-llm-wiki`，Obsidian Community Plugins 市集與 GitHub 上都查得到，有繁體中文說明文件。
- **外掛不會修改原始筆記**：Ingest 時唯讀處理來源檔案，只在 `wiki/` 底下新建頁面。
- **外掛預設資料夾慣例**：`wiki/sources/`（來源索引）、`wiki/entities/`（實體頁）、`wiki/concepts/`（概念頁）、`wiki/index.md`（主索引）。
- **支援的 LLM 供應商**（官方列表）：Anthropic、OpenAI、Google Gemini、DeepSeek、Alibaba Qwen、**xAI Grok**、Moonshot Kimi、Zhipu GLM、MiniMax、Step、Tencent Hunyuan、Xiaomi MiMo、AWS Bedrock、ChatGPT Plan (Codex OAuth)，另有 Ollama／LM Studio／OpenRouter／Anthropic-Compatible 等本地或相容選項。
- **官方列表沒有明確列出 Groq（groq.com）**——這點無法單靠查文件確認，必須實際安裝後測試（見第 4 節）。
- **使用者現有 `.env` 裡的金鑰**：變數名稱實際上是 `GROQ_API_KEY`（不是先前系統誤植的 `GROK_API_KEY`），使用者已確認這是真實的 Groq（groq.com）平台金鑰，不是 xAI 的 Grok。這個對不上的變數名稱，很可能是舊系統的 Grok 分類功能從未真正成功呼叫過 API 的原因（悄悄降級成「未分類」）——但這現在是歷史問題了，舊系統即將整個刪除。

### 1.2 已發現的既有狀態（設計前必須納入考量）

使用者在等待這次設計討論期間，已經**自行用另一個 AI 工具／對話窗口**處理過 `00_Inbox` 裡三本書的劃線，產生了：
- `01_Cards/` 底下 41 張帶有完整 AI 撰寫費曼解釋的卡片
- `02_MOC/` 底下 3 個依書籍分組的內容地圖

這批內容的格式跟 Karpathy LLM Wiki 外掛的真實輸出**不一致**（標籤用階層式寫法、MOC 依書而非依主題分組、frontmatter 欄位不同），因此不是外掛產生的，也不相容於外掛的 Dataview 整合慣例。使用者確認：這批內容先搬移存檔，正式裝好外掛後，對同三本書重新執行一次真實的 Ingest。

## 2. 整體架構

```
[ Kobo 讀書劃線 ]
       │ (Kobo Highlights Importer，維持不變)
       ▼
[ 00_Inbox / 原始書籍劃線 ]（唯讀，維持不變，同時是外掛的 Ingest 來源）
       │ (Karpathy LLM Wiki 外掛：Ingest single source / Ingest from Folder)
       ▼
[ wiki/sources ] + [ wiki/entities ] + [ wiki/concepts ]
       │ (外掛自動產生雙向連結；Smart Batch Skip 自動略過已處理內容)
       ▼
[ wiki/index.md ] ←→ Query 對話查詢
       │
       ▼
[ 03_Output / 文章與專案整理 ]（維持不變）
```

**與原系統的關鍵差異：**
- `01_Cards/`、`02_MOC/` 整個廢除，改用外掛原生的 `wiki/` 結構
- 費曼轉譯不再是必要步驟，AI 直接讀劃線並產出完整的概念/實體頁面
- `99_Dashboard.md` 的「待內化清單」追蹤機制不再需要——外掛自帶 Smart Batch Skip，定期對 `00_Inbox` 執行「Ingest from Folder」即可，不需要自訂 Dataview 查詢比對進度
- `03_Output/` 性質不變，仍是使用者手動整理成文章的產出區

## 3. 元件異動清單

| 項目 | 動作 | 說明 |
|---|---|---|
| Karpathy LLM Wiki 外掛 | 新安裝 | Community Plugins 搜尋安裝、啟用 |
| LLM 供應商設定 | 新設定 | 優先嘗試 Groq（沿用現有 `.env` 的 `GROQ_API_KEY`）；第 4 節驗證步驟決定是否需要改用其他供應商 |
| `wiki/` 資料夾 | 外掛自動產生 | 採用外掛預設慣例，不強行改名對齊舊結構 |
| `00_Inbox/` | 維持不變 | 繼續當 Kobo 劃線落地處與外掛 Ingest 來源 |
| `01_Cards/`、`02_MOC/` 現有內容（41 卡片＋3 地圖） | 搬移存檔 | 移到 `_archive/2026-08-10-manual-batch/`，不刪除；外掛裝好後對同三本書重新 Ingest |
| `01_Cards/`、`02_MOC/` 資料夾本身 | 廢除 | **順序依賴第 4.4 節**：先存檔搬移現有內容，外掛裝好並通過第 4 節驗證、對三本書重新 Ingest 過、人工確認新 `wiki/` 內容品質可接受之後，資料夾與其中的 `.gitkeep` 才移除；驗證不通過前這兩個資料夾维持存在（可以是空的，內容已搬到 `_archive/`） |
| `90_Templates/Feynman_Zettel_Template.md` | 刪除 | 舊系統手動建卡範本 |
| `90_Templates/scripts/generate_stubs.js`、`stub_logic.js`、`tag_vocabulary.json` | 刪除 | 舊系統批次骨架＋Grok 分類邏輯，含測試檔案（`tests/generate_stubs.test.js`、`tests/stub_logic.test.js`） |
| `90_Templates/_批次產生骨架.md` | 刪除 | 舊系統觸發用範本 |
| `99_Dashboard.md` | 刪除 | 待內化清單追蹤機制不再需要 |
| `03_Output/` | 維持不變 | 性質不變 |
| `README.md` | 全面改寫 | 反映外掛安裝、設定、驗證步驟、日常操作流程 |
| `.gitignore` | 檢查沿用 | 確認 `.env` 排除規則仍在，外掛金鑰一樣不能進公開 repo |

**明確不做**：不嘗試把外掛輸出路徑改名去對齊舊的 `01_Cards`／`02_MOC`（避免跟外掛內部假設衝突）；不保留 90_Templates 底下的舊 Feynman 相關檔案作為「備用選項」——使用者已明確選擇全部刪除，git 歷史查得到。

## 4. 外掛設定與驗證步驟

### 4.1 安裝與設定

1. Community Plugins 搜尋「Karpathy LLM Wiki」，安裝並啟用
2. 選擇 LLM 供應商，優先嘗試 Groq；輸入 API 金鑰後執行外掛內建的連接測試
3. 設定「提取粒度」，建議先用 Coarse 控制成本

### 4.2 Groq 相容性驗證（第一步必做）

外掛官方供應商列表沒有明確列出 Groq。驗證流程：
1. 在外掛設定的供應商選項裡尋找 Groq，或尋找「自訂 OpenAI 相容端點」之類的通用選項
2. 若找到 Groq 或可用的自訂端點欄位，填入 Groq 的 API base URL（`https://api.groq.com/openai/v1`）與現有 `GROQ_API_KEY`，執行連接測試
3. **若測試失敗或設定介面根本沒有這個選項**：改用 Ollama（本地免費，不需金鑰）作為第一備援；如果仍希望用雲端供應商，改申請一組外掛原生支援的金鑰（Anthropic／OpenAI／xAI Grok 皆可）

### 4.3 功能驗證（比照本專案一貫做法，第三方外掛行為不可假設，必須實測）

1. 對 `00_Inbox` 裡任一本書執行「Ingest single source」
2. 確認 `wiki/entities`、`wiki/concepts` 底下正確產生頁面，且原始 `00_Inbox` 檔案內容完全沒被修改
3. 確認產生頁面的 frontmatter 含 `tags`／`type`／`aliases`，Dataview 查詢抓得到
4. 對同一本書重複執行一次 Ingest，確認 Smart Batch Skip 真的略過已處理內容、不會產生重複頁面

### 4.4 既有內容遷移

1. 通過 4.2、4.3 驗證後，把 `01_Cards/`、`02_MOC/` 現有的 41 張卡片與 3 個地圖整個搬到 `_archive/2026-08-10-manual-batch/`
2. 對 `00_Inbox` 裡的三本書執行「Ingest from Folder」
3. 人工比對新產生的 `wiki/` 內容跟存檔版本，確認品質可接受後，`01_Cards/`、`02_MOC/` 資料夾即可移除

## 5. 日常操作流程

| 階段 | 操作 |
|---|---|
| 🐜 蒐集 | Kobo 接 USB → 執行 Kobo Highlights Importer → `00_Inbox` 更新（不變） |
| 🧠 編譯 | 對 `00_Inbox` 執行「Ingest from Folder」（或針對單一新書用 single source）→ 外掛自動產生/更新 `wiki/` 底下的實體與概念頁面 |
| 🔍 應用 | 需要靈感或寫作時，用外掛的 Query 對話功能直接詢問知識庫，或打開 `wiki/index.md` 瀏覽 → 到 `03_Output` 整理成文章 |

## 6. 最終交付物清單

1. `_archive/2026-08-10-manual-batch/`（搬移存檔的 41 卡片＋3 地圖）
2. 刪除：`90_Templates/Feynman_Zettel_Template.md`、`90_Templates/scripts/`（含 `generate_stubs.js`、`stub_logic.js`、`tag_vocabulary.json`）、`90_Templates/_批次產生骨架.md`、`tests/`（含兩個測試檔）、`99_Dashboard.md`、`01_Cards/`、`02_MOC/`
3. `README.md`（全面改寫：外掛安裝、Groq 驗證步驟、功能驗證步驟、日常操作流程）
4. 本設計文件

## 7. 明確排除範圍（Out of Scope）

- 外掛本身的實作／維護（第三方外掛，不是本專案程式碼）
- 若 Groq 相容性驗證失敗且使用者不想申請新金鑰／裝 Ollama，本文件不規劃「繼續魔改舊 Grok pipeline」這條路——舊系統已明確決定刪除
- `wiki/` 內部細部客製化（例如調整外掛的實體/概念抽取規則），若外掛預設行為已符合需求則不額外開發
- 既有 41 張卡片與新 Ingest 結果的自動化品質比對工具——第 4.4 節的比對是人工進行
