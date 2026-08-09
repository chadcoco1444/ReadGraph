# Kobo × Obsidian 費曼內化知識系統 — 設計文件

- 日期：2026-08-09
- 狀態：待使用者審閱

## 1. 背景與目標

使用者的閱讀器是 Kobo，希望建立一套完整的個人知識管理流程：

```
Kobo 劃線（蒐集）→ 費曼內化（轉譯）→ 雙向連結（蜘蛛）→ 主題輸出（創造）
```

以 Obsidian 為核心，因為它原生支援雙向連結與圖譜檢視，能自然呈現「點 → 線 → 面 → 體」的知識網狀化過程，且完全免費、資料自主掌控。

**本次交付範圍**：PRD 設計文件 + 可直接使用的 Vault 資料夾骨架、Templater 範本、Dataview 查詢腳本、README 操作手冊。不含自訂 Python 同步腳本的實作——該腳本僅作為「若外掛的重複匯入行為被實測證實不安全」時的備援方案，設計文件中會說明其角色與觸發時機，但不在本次一併建置。

## 2. 已知限制與風險（設計前提）

在動手前先釐清三個容易被誤判的技術細節，避免踩雷：

1. **Kobo Highlights Importer（OGKevin 版）用 Eta.js 語法，不是 Templater 語法**——兩者是分開的引擎，互不衝突。Kobo 外掛負責產生 `00_Inbox` 的書籍筆記，Templater 負責使用者手動觸發、產生 `01_Cards` 的費曼卡片。
2. **外掛「重複匯入時是否會覆蓋已有筆記」沒有官方文件明確保證**。因此設計上把 `00_Inbox` 定義為「唯讀衍生資料」——所有使用者的思考成果（費曼轉譯、經驗錨點、連結）一律只寫在 `01_Cards`，絕不寫回 `00_Inbox`。即使外掛每次重新匯入都整份覆寫 `00_Inbox`，也不會遺失任何使用者心血。
3. **每條劃線是否能取得穩定的 `bookmarkId`（Kobo 原生唯一識別碼）需要建置時實測驗證**（社群資料顯示範本理論上可存取此欄位，但截至查證時仍有相關 GitHub issue 待處理，非 100% 保證）。因此本設計採「方案 A 為主、方案 B 為備援」的雙軌策略，兩者的範本與查詢在文件中都會寫好，實測結果決定啟用哪一套，不會卡住後續使用。

## 3. Vault 資料夾架構

```
ReadGraph/                          ← Obsidian Vault 根目錄
├── 00_Inbox/                       ← Kobo 原始劃線（唯讀，外掛自動產生/覆寫，禁止手動編輯）
│   └── <書名>.md
├── 01_Cards/                       ← 費曼內化後的原子卡片
│   └── <中文概念名稱>.md           ← 例如「複利效應.md」
├── 02_MOC/                         ← 主題地圖（Map of Content）
│   └── <主題名稱> MOC.md           ← 例如「投資心態地圖 MOC.md」
├── 03_Output/                      ← 文章大綱／專案整理成果（純 Obsidian 內部用途，不考慮外部匯出格式）
│   └── <文章標題>.md
├── 90_Templates/                   ← Templater 範本存放處
│   └── Feynman_Zettel_Template.md
└── 99_Dashboard.md                 ← 首頁儀表板：待內化清單（Dataview 自動產出）
```

**命名規範：**
- 數字前綴（`00_`／`01_`…）只決定側邊欄排序，Obsidian 連結一律用檔名而非路徑，不受影響。
- `01_Cards` 檔名＝中文概念名稱本身。同名概念只能有一張卡片，強迫做「概念去重」，符合 Zettelkasten 精神；若同一詞彙在不同脈絡有不同意涵（如「複利效應」同時適用投資與人際關係），用「複利效應（投資）.md」手動消歧。
- `00_Inbox` 內容視為衍生資料，每次同步都可能整份重寫，不儲存任何手動編輯內容。

## 4. 核心外掛設定

### 4.1 Kobo Highlights Importer

| 設定項 | 值 |
|---|---|
| 輸出資料夾 | `00_Inbox` |
| 範本檔案 | 使用 4.1.1 客製化範本 |
| 一本書一檔案 | 開啟 |
| Callout 樣式 | 關閉，改用純 `>` 引用 |

#### 4.1.1 客製化匯入範本（嵌入 `bookmarkId` 供方案 A 使用）

```eta
---
title: "<%= it.bookDetails.title %>"
author: <%= it.bookDetails.author %>
dateLastRead: <%= it.bookDetails.dateLastRead?.toISOString() ?? '' %>
tags:
  - kobo/inbox
---

# <%= it.bookDetails.title %>

<% it.chapters.forEach(function(chapter) { %>
## <%= chapter.title %>

<% chapter.highlights.forEach(function(highlight) { %>
> <%= highlight.text %>
> %%kobo-id:<%= highlight.bookmarkId %>%%
<% if (highlight.note) { %>
> 💭 <%= highlight.note %>
<% } %>

<% }) %>
<% }) %>
```

`%%...%%` 為 Obsidian 隱藏註解語法，閱讀模式不顯示，Dataview 仍可讀取原始文字，作為每條劃線的唯一識別碼。

#### 4.1.2 安全測試 SOP（建置後第一步必做）

1. 執行首次同步，確認 `00_Inbox` 產生書籍筆記，且每條劃線後方出現 `%%kobo-id:數字%%`。
2. 不改動任何 Inbox 檔案，直接重新執行一次同步。
3. 檢查同一條劃線的 `kobo-id` 是否維持不變，且沒有重複出現兩次。
4. **通過** → 採用 4.4 節的「方案 A」查詢。
   **未通過**（ID 消失、每次換號碼、或欄位無法輸出）→ 改用 4.4 節的「方案 B」查詢，範本第 1 行的 `%%kobo-id:...%%` 可留著不影響（多餘註解不會造成錯誤，之後想清理再移除即可）。

### 4.2 Templater

- 範本資料夾指向 `90_Templates`
- 綁定一組快捷鍵（如 `Ctrl+Alt+F`）→「依範本建立新筆記」→ `Feynman_Zettel_Template.md`，輸出到 `01_Cards`

### 4.3 Dataview

- 開啟 **JavaScript Query（DataviewJS）**支援。待內化清單需要掃描 `00_Inbox` 檔案內文才能抓出 `%%kobo-id%%` 或劃線原文，單靠核心 Dataview 查詢語法（只讀 frontmatter／inline field）無法達成。

### 4.4 待內化清單查詢（`99_Dashboard.md`）

**方案 A（`kobo-id` 精確比對，預設啟用）：**

```dataviewjs
const cardIds = new Set(
  dv.pages('"01_Cards"').where(p => p.source_id).map(p => String(p.source_id)).values
);

let pending = [];
for (let file of dv.pages('"00_Inbox"').file) {
  const content = await dv.io.load(file.path);
  const regex = /^>\s*(.+)\n>\s*%%kobo-id:(\d+)%%/gm;
  let m;
  while ((m = regex.exec(content)) !== null) {
    const [, text, id] = m;
    if (!cardIds.has(id)) pending.push([file.link, text.slice(0, 50) + "…", id]);
  }
}
dv.table(["書籍", "劃線內容", "kobo-id"], pending);
```

**方案 B（前 60 字模糊比對，備援，以註解形式一併寫入 `99_Dashboard.md`）：**

```dataviewjs
const excerpts = dv.pages('"01_Cards"').where(p => p.source_quote)
  .map(p => String(p.source_quote)).values;

let pending = [];
for (let file of dv.pages('"00_Inbox"').file) {
  const content = await dv.io.load(file.path);
  const regex = /^>\s*(.+)$/gm;
  let m;
  while ((m = regex.exec(content)) !== null) {
    const text = m[1];
    if (text.startsWith("%%kobo-id")) continue;
    const matched = excerpts.some(ex => text.includes(ex.slice(0, 30)));
    if (!matched) pending.push([file.link, text.slice(0, 50) + "…"]);
  }
}
dv.table(["書籍", "劃線內容"], pending);
```

切換方式：4.1.2 安全測試未通過時，把 `99_Dashboard.md` 裡方案 A 的程式碼區塊註解掉（或刪除），改用方案 B。

### 4.5 MOC 主題總覽查詢（`02_MOC/<主題> MOC.md`）

單層標籤直接篩選，不需要 DataviewJS：

```dataview
TABLE date AS "建立日期", source AS "來源書籍"
FROM #投資心態
SORT date DESC
```

每個 MOC 檔案把 `#投資心態` 換成對應主題標籤即可複用。

## 5. 費曼卡片範本（`90_Templates/Feynman_Zettel_Template.md`）

Frontmatter 同時記錄 `source_id`（方案 A）與 `source_quote`（方案 B），兩者一起寫入，不論最終啟用哪個方案都不用回頭補資料：

```markdown
<%*
const concept = await tp.system.prompt("概念名稱（將作為檔名）");
await tp.file.rename(concept);
const bookNote = await tp.system.suggester(
  (f) => f.basename,
  app.vault.getMarkdownFiles().filter(f => f.path.startsWith("00_Inbox/"))
);
const koboId = await tp.system.prompt("貼上該劃線的 kobo-id 數字");
const quote = await tp.system.prompt("貼上劃線原文");
const excerpt = quote.slice(0, 60);
const tag = await tp.system.prompt("主題標籤（不含 #）");
-%>
---
type: feynman-card
source: "[[<%* tR += bookNote.basename %>]]"
source_id: <%* tR += koboId %>
source_quote: "<%* tR += excerpt %>"
date: <% tp.date.now("YYYY-MM-DD HH:mm") %>
tags:
  - <%* tR += tag %>
---

# 📌 概念名稱：<%* tR += concept %>

### 1. 📖 Kobo 原始劃線 (Source)
> <%* tR += quote %>

---

### 2. 👶 費曼轉譯（說給5歲小孩聽）


---

### 3. ⚓ 個人經驗與應用錨點


---

### 🔗 知識網絡連結
- **相關概念**：[[ ]]
- **相反/對立觀點**：[[ ]]
- **所屬主題 MOC**：[[<%* tR += tag %> MOC]]
```

## 6. 端對端 SOP 工作流

| 階段 | 頻率 | 操作 |
|---|---|---|
| 🐜 螞蟻（蒐集） | 想同步時隨時 | Kobo 接 USB → Obsidian 執行 Kobo Highlights Importer → `00_Inbox` 自動更新 |
| 🐛 內化（費曼） | 建議每週固定時段 | 打開 `99_Dashboard.md` 查看待內化清單 → 到對應 `00_Inbox` 書籍筆記複製劃線原文與 kobo-id → 觸發 Templater 快捷鍵建卡 |
| 🕸️ 蜘蛛（連結） | 建卡當下順手做 | 在卡片內文用 `[[概念]]` 連結相關／對立概念；未建立的 MOC 會顯示紅字連結，之後統一處理 |
| 🐝 蜜蜂（創造） | 卡片累積到一定量後 | 打開對應 `02_MOC/xxx MOC.md`，用 Dataview 表格檢視主題下所有卡片 → 到 `03_Output` 新建文章筆記，整理有共鳴的重點成大綱 |

## 7. 一次性歷史劃線回填

使用者的 Kobo 已累積一段時間的劃線，非從零開始。Kobo Highlights Importer 讀取的是完整 `KoboReader.sqlite`，首次執行同步時即為全量匯入，無需額外的回填步驟；4.1.2 的安全測試建議直接用這批既有歷史劃線做驗證。

## 8. 備援方案：自訂 Python 同步腳本（不在本次建置範圍）

若 4.1.2 安全測試顯示外掛的匯入或覆寫行為造成資料風險（例如 `bookmarkId` 不穩定，且問題無法透過方案 B 緩解），備援方案為：撰寫 Python 腳本直接讀取 `KoboReader.sqlite`（`sqlite3` 標準庫），自行控制增量同步與去重邏輯，手動於終端機執行觸發（`python sync_kobo.py`）。此腳本待需要時另立設計文件與實作計畫，本次僅記錄觸發條件與角色定位。

## 9. 最終交付物清單

1. `ReadGraph/` 完整資料夾骨架（`00_Inbox`／`01_Cards`／`02_MOC`／`03_Output`／`90_Templates`）
2. `90_Templates/Feynman_Zettel_Template.md`（第 5 節範本）
3. `99_Dashboard.md`（方案 A 查詢啟用，方案 B 以註解保留）
4. 範例 MOC：`02_MOC/範例主題 MOC.md`，示範 Dataview 索引語法
5. `README.md`：外掛安裝清單、設定步驟、Kobo 匯入範本客製化說明、安全測試 SOP、方案 A/B 切換方式
6. 本設計文件（`docs/superpowers/specs/2026-08-09-kobo-obsidian-feynman-system-design.md`）

## 10. 明確排除範圍（Out of Scope）

- 自訂 Python 同步腳本的實際程式碼（僅記錄角色定位，見第 8 節）
- `03_Output` 匯出至外部平台（部落格、社群媒體等）的格式轉換
- 自動偵測 USB 插入並觸發同步（背景常駐程式／排程任務）
- 多裝置（非 Kobo 電子書閱讀器）的匯入支援
