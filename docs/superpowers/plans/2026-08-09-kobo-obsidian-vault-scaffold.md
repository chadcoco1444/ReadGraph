# Kobo × Obsidian 費曼內化知識系統 — Vault 骨架 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `ReadGraph/`（已是 git 倉庫）建立完整可用的 Obsidian Vault 骨架：資料夾結構、Kobo 匯入客製化範本、費曼卡片 Templater 範本、Dataview 儀表板（含方案 A/B 雙軌待內化查詢）、範例 MOC、README 操作手冊。

**Architecture:** 這是一個內容／設定檔專案，沒有應用程式邏輯，因此不使用 pytest/jest 等單元測試框架。每個任務的「測試」改為：(a) 檔案／資料夾存在性與內容比對（`test -f`、`grep`），(b) 對 DataviewJS 程式碼區塊執行 `node --check` 做語法驗證（只驗證語法正確，不驗證 Dataview API 執行結果——實際渲染行為需要使用者在 Obsidian 內手動確認，計畫中會明確標註這個界線）。

**Tech Stack:** Obsidian（Kobo Highlights Importer、Templater、Dataview 三個 community plugin）、Markdown、Eta.js（Kobo 範本）、Templater JS、DataviewJS。Node.js 僅用於本機語法驗證，非 Vault 執行環境的一部分。

## Global Constraints

- Vault 根目錄固定為 `c:/Users/88698/Desktop/Workspace/ReadGraph`（已 `git init`，已有 1 個 commit：設計文件）。
- `00_Inbox/` 一律視為 Kobo 外掛產生的唯讀衍生資料，本計畫**不會**寫入任何使用者思考內容到此資料夾，只放 `.gitkeep`。
- `01_Cards/` 檔名規則＝中文概念名稱直接當檔名，不加時間戳或 ID 前綴。
- 標籤（tags）為單層平面標籤，不使用階層式命名（如 `topic/xxx`）。
- 待內化清單查詢需同時具備「方案 A：`kobo-id` 精確比對」與「方案 B：前 60 字模糊比對」兩套邏輯，方案 A 預設啟用、方案 B 以 HTML 註解形式保留在同一檔案中，用戶只需刪除/還原註解即可切換，不必重寫程式碼。
- `03_Output/` 僅供 Vault 內部整理使用，不考慮匯出至外部平台的格式轉換（本計畫範圍排除）。
- 自訂 Python 同步腳本不在本計畫範圍內（設計文件第 8 節已記錄為未來備援方案）。
- 所有中文內容一律使用繁體中文。

---

## Task 1: 建立 Vault 資料夾骨架

**Files:**
- Create: `ReadGraph/00_Inbox/.gitkeep`
- Create: `ReadGraph/01_Cards/.gitkeep`
- Create: `ReadGraph/03_Output/.gitkeep`

**Interfaces:**
- Consumes: 無（起始任務）
- Produces: 四個資料夾實際存在於檔案系統中：`00_Inbox/`、`01_Cards/`、`02_MOC/`（將由 Task 5 建立範例檔案時一併產生，此任務不需為它建立 `.gitkeep`）、`03_Output/`。`90_Templates/` 由 Task 2 建立時一併產生。後續所有任務都假設這些路徑已存在。

- [ ] **Step 1: 驗證資料夾目前不存在（預期失敗）**

Run:
```bash
test -d "c:/Users/88698/Desktop/Workspace/ReadGraph/00_Inbox" && echo EXISTS || echo NOT_FOUND
```
Expected: `NOT_FOUND`

- [ ] **Step 2: 建立三個資料夾與 `.gitkeep` 佔位檔**

使用 Write 工具建立以下三個空檔案（Git 不追蹤空資料夾，需要 `.gitkeep` 讓資料夾隨 commit 一起建立）：

`c:\Users\88698\Desktop\Workspace\ReadGraph\00_Inbox\.gitkeep`
```
```
（空檔案即可）

`c:\Users\88698\Desktop\Workspace\ReadGraph\01_Cards\.gitkeep`
```
```

`c:\Users\88698\Desktop\Workspace\ReadGraph\03_Output\.gitkeep`
```
```

- [ ] **Step 3: 驗證三個資料夾都已存在**

Run:
```bash
for d in "00_Inbox" "01_Cards" "03_Output"; do
  test -f "c:/Users/88698/Desktop/Workspace/ReadGraph/$d/.gitkeep" && echo "OK: $d" || echo "FAIL: $d"
done
```
Expected: 三行都印出 `OK: <資料夾名>`

- [ ] **Step 4: Commit**

```bash
cd "c:/Users/88698/Desktop/Workspace/ReadGraph"
git add 00_Inbox/.gitkeep 01_Cards/.gitkeep 03_Output/.gitkeep
git commit -m "Scaffold vault inbox/cards/output folders"
```

---

## Task 2: 建立 Kobo 匯入客製化範本

**Files:**
- Create: `ReadGraph/90_Templates/Kobo_Inbox_Template.eta`

**Interfaces:**
- Consumes: 無
- Produces: `.eta` 範本檔案，內容供使用者複製貼上到 Kobo Highlights Importer 外掛設定的範本欄位（或若外掛支援指定範本檔案路徑，直接指向此檔案）。此範本會在每條劃線後方輸出 `%%kobo-id:<數字>%%` 標記——這是 Task 4 方案 A 查詢比對的資料來源，也是 Task 6 README 安全測試 SOP 要驗證的目標欄位。

- [ ] **Step 1: 驗證檔案目前不存在**

Run:
```bash
test -f "c:/Users/88698/Desktop/Workspace/ReadGraph/90_Templates/Kobo_Inbox_Template.eta" && echo EXISTS || echo NOT_FOUND
```
Expected: `NOT_FOUND`

- [ ] **Step 2: 建立範本檔案**

`c:\Users\88698\Desktop\Workspace\ReadGraph\90_Templates\Kobo_Inbox_Template.eta`
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

- [ ] **Step 3: 驗證檔案存在且包含關鍵標記**

Run:
```bash
grep -c "kobo-id" "c:/Users/88698/Desktop/Workspace/ReadGraph/90_Templates/Kobo_Inbox_Template.eta"
grep -c "bookmarkId" "c:/Users/88698/Desktop/Workspace/ReadGraph/90_Templates/Kobo_Inbox_Template.eta"
```
Expected: 兩個指令都輸出 `1`（各出現一次）

- [ ] **Step 4: Commit**

```bash
cd "c:/Users/88698/Desktop/Workspace/ReadGraph"
git add 90_Templates/Kobo_Inbox_Template.eta
git commit -m "Add Kobo import template with bookmarkId marker"
```

---

## Task 3: 建立費曼卡片 Templater 範本

**Files:**
- Create: `ReadGraph/90_Templates/Feynman_Zettel_Template.md`

**Interfaces:**
- Consumes: 無（使用者手動觸發 Templater 快捷鍵時，從 `00_Inbox` 對應書籍筆記複製劃線原文與 `kobo-id`，貼到本範本的互動式輸入框）
- Produces: 每次使用會在 `01_Cards/` 產生一個新檔案，frontmatter 固定包含 `source`（連結回 `00_Inbox` 書籍筆記）、`source_id`（Kobo bookmarkId，供 Task 4 方案 A 查詢比對）、`source_quote`（劃線原文前 60 字，供 Task 4 方案 B 查詢比對）、`tags`（單層標籤，供 Task 5 MOC 查詢篩選）。這四個欄位名稱是後續 Task 4／Task 5 查詢腳本的硬性依賴，不可更名。

- [ ] **Step 1: 驗證檔案目前不存在**

Run:
```bash
test -f "c:/Users/88698/Desktop/Workspace/ReadGraph/90_Templates/Feynman_Zettel_Template.md" && echo EXISTS || echo NOT_FOUND
```
Expected: `NOT_FOUND`

- [ ] **Step 2: 建立範本檔案**

`c:\Users\88698\Desktop\Workspace\ReadGraph\90_Templates\Feynman_Zettel_Template.md`
````markdown
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
````

- [ ] **Step 3: 驗證檔案存在且四個關鍵 frontmatter 欄位都在**

Run:
```bash
for field in "source:" "source_id:" "source_quote:" "tags:"; do
  grep -c -- "$field" "c:/Users/88698/Desktop/Workspace/ReadGraph/90_Templates/Feynman_Zettel_Template.md" > /dev/null && echo "OK: $field" || echo "FAIL: $field"
done
```
Expected: 四行都印出 `OK: <欄位>`

- [ ] **Step 4: Commit**

```bash
cd "c:/Users/88698/Desktop/Workspace/ReadGraph"
git add 90_Templates/Feynman_Zettel_Template.md
git commit -m "Add Feynman card Templater template"
```

---

## Task 4: 建立首頁儀表板（待內化清單，方案 A/B）

**Files:**
- Create: `ReadGraph/99_Dashboard.md`

**Interfaces:**
- Consumes：Task 3 定義的 `01_Cards` frontmatter 欄位 `source_id`、`source_quote`；Task 2 定義的 `00_Inbox` 內文標記 `%%kobo-id:數字%%` 與劃線的 `> ` 引用格式。
- Produces：`99_Dashboard.md`，內含兩個 `dataviewjs` 程式碼區塊——方案 A（作用中）與方案 B（包在 HTML 註解內，預設不執行）。使用者依 README 的安全測試結果決定要不要切換。

- [ ] **Step 1: 驗證檔案目前不存在**

Run:
```bash
test -f "c:/Users/88698/Desktop/Workspace/ReadGraph/99_Dashboard.md" && echo EXISTS || echo NOT_FOUND
```
Expected: `NOT_FOUND`

- [ ] **Step 2: 建立儀表板檔案**

`c:\Users\88698\Desktop\Workspace\ReadGraph\99_Dashboard.md`
````markdown
# 📊 Dashboard

## 待內化清單（方案 A：kobo-id 精確比對，預設啟用）

> 若安裝時的安全測試（見 README 第 4 節）失敗，請刪除下方這個程式碼區塊，並把「方案 B」的 HTML 註解拿掉來啟用它。

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

## 待內化清單（方案 B：前 60 字模糊比對，備援，目前停用）

<!--
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
-->
````

- [ ] **Step 3: 驗證兩個 dataviewjs 區塊的 JavaScript 語法正確**

先各自抽取成暫存檔案，再用 `node --check` 做純語法驗證（不執行，因為 `dv` 是 Obsidian 執行期才存在的全域物件；`node --check` 只解析語法樹，能抓出括號不對稱、關鍵字打錯等問題）。

**注意副檔名要用 `.mjs`，不能用 `.js`**：兩段程式碼內都有寫在最上層（非 async function 包裹）的 `await dv.io.load(...)`，這是合法的 DataviewJS 寫法（外掛本身會把整段程式包進 async 函式再執行），但如果存成 `.js` 讓 Node 用 CommonJS 解析，頂層 `await` 會被視為語法錯誤而誤判失敗；存成 `.mjs`（ES Module）就能正確解析 top-level await。

```bash
cd "c:/Users/88698/Desktop/Workspace/ReadGraph"

# 方案 A：抽取第一個 dataviewjs 區塊
awk '/^```dataviewjs$/{f=1;next} /^```$/{if(f){f=0;exit}} f' 99_Dashboard.md > /tmp/plan_a.mjs
node --check /tmp/plan_a.mjs && echo "PLAN_A_SYNTAX_OK"

# 方案 B：抽取 HTML 註解內的 dataviewjs 區塊
awk '/^```dataviewjs$/{c++; if(c==2){f=1;next}} /^```$/{if(f){f=0;exit}} f' 99_Dashboard.md > /tmp/plan_b.mjs
node --check /tmp/plan_b.mjs && echo "PLAN_B_SYNTAX_OK"
```
Expected: 印出 `PLAN_A_SYNTAX_OK` 與 `PLAN_B_SYNTAX_OK`，且兩個 `node --check` 都不報錯。

**注意（誠實揭露測試邊界）**：這一步只驗證 JavaScript 語法正確，**不驗證 Dataview API（`dv.pages`、`dv.io.load`、`dv.table` 等）的實際執行結果**。真正的行為驗證（查詢邏輯是否正確抓到待內化清單）需要使用者在 Obsidian 內安裝好三個外掛、實際同步過 Kobo 資料後手動確認，這件事寫在 README 的安全測試 SOP 裡，本計畫的自動化驗證做不到。

- [ ] **Step 4: Commit**

```bash
cd "c:/Users/88698/Desktop/Workspace/ReadGraph"
git add 99_Dashboard.md
git commit -m "Add dashboard with plan-A/plan-B pending-internalization queries"
```

---

## Task 5: 建立範例 MOC

**Files:**
- Create: `ReadGraph/02_MOC/投資心態地圖 MOC.md`

**Interfaces:**
- Consumes：Task 3 定義的 `01_Cards` frontmatter `tags`、`date`、`source` 欄位。
- Produces：一個可直接使用的 MOC 範例，示範單層標籤的 Dataview 索引語法；使用者複製此檔案、改標籤與檔名即可套用到新主題。

- [ ] **Step 1: 驗證資料夾與檔案目前不存在**

Run:
```bash
test -d "c:/Users/88698/Desktop/Workspace/ReadGraph/02_MOC" && echo DIR_EXISTS || echo DIR_NOT_FOUND
test -f "c:/Users/88698/Desktop/Workspace/ReadGraph/02_MOC/投資心態地圖 MOC.md" && echo FILE_EXISTS || echo FILE_NOT_FOUND
```
Expected: `DIR_NOT_FOUND`、`FILE_NOT_FOUND`

- [ ] **Step 2: 建立範例 MOC 檔案**

`c:\Users\88698\Desktop\Workspace\ReadGraph\02_MOC\投資心態地圖 MOC.md`
````markdown
# 投資心態地圖 MOC

> 這是範例主題地圖，示範如何用單層標籤自動索引卡片。複製本檔案、把 `#投資心態` 換成你自己的主題標籤、檔名也改掉，就能套用到新主題。

## 相關卡片

```dataview
TABLE date AS "建立日期", source AS "來源書籍"
FROM #投資心態
SORT date DESC
```
````

- [ ] **Step 3: 驗證檔案存在且查詢語法正確**

Run:
```bash
test -f "c:/Users/88698/Desktop/Workspace/ReadGraph/02_MOC/投資心態地圖 MOC.md" && echo OK || echo FAIL
grep -c "FROM #投資心態" "c:/Users/88698/Desktop/Workspace/ReadGraph/02_MOC/投資心態地圖 MOC.md"
```
Expected: `OK`，接著輸出 `1`

- [ ] **Step 4: Commit**

```bash
cd "c:/Users/88698/Desktop/Workspace/ReadGraph"
git add "02_MOC/投資心態地圖 MOC.md"
git commit -m "Add example MOC demonstrating tag-based Dataview index"
```

---

## Task 6: 建立 README 操作手冊

**Files:**
- Create: `ReadGraph/README.md`

**Interfaces:**
- Consumes：整合 Task 1-5 所有產出的路徑與檔名，作為文件中的具體引用對象。
- Produces：`README.md`，涵蓋外掛安裝清單、外掛設定值、安全測試 SOP、方案 A/B 切換步驟——這是唯一需要「人腦讀懂並照著操作」的產出物，後續任務（Task 7）只驗證它引用的檔案路徑真實存在，不驗證文字內容本身。

- [ ] **Step 1: 驗證檔案目前不存在**

Run:
```bash
test -f "c:/Users/88698/Desktop/Workspace/ReadGraph/README.md" && echo EXISTS || echo NOT_FOUND
```
Expected: `NOT_FOUND`

- [ ] **Step 2: 建立 README**

`c:\Users\88698\Desktop\Workspace\ReadGraph\README.md`
````markdown
# ReadGraph — Kobo 讀書筆記與費曼內化系統

以 Obsidian 為核心的個人知識管理 Vault：Kobo 劃線（蒐集）→ 費曼內化（轉譯）→ 雙向連結（連結）→ 主題輸出（創造）。

## 1. 需要安裝的 Community Plugins

在 Obsidian「設定 → Community plugins」搜尋並安裝以下三個外掛：

1. **Kobo Highlights Importer**（作者 OGKevin）
2. **Templater**
3. **Dataview**

## 2. 外掛設定

### 2.1 Kobo Highlights Importer

| 設定項 | 值 |
|---|---|
| 輸出資料夾 | `00_Inbox` |
| 範本 | 把 `90_Templates/Kobo_Inbox_Template.eta` 的內容複製貼到外掛設定的範本欄位（若外掛版本支援直接指定範本檔案路徑，改成指向這個檔案） |
| 一本書一檔案 | 開啟 |
| Callout 樣式 | 關閉，改用純 `>` 引用 |

### 2.2 Templater

- 範本資料夾設定為 `90_Templates`
- 在「Hotkeys」設定裡，把「Templater: Create new note from template」綁一組快捷鍵（建議 `Ctrl+Alt+F`），選擇範本時指向 `Feynman_Zettel_Template.md`，輸出資料夾為 `01_Cards`

### 2.3 Dataview

- 在 Dataview 設定裡開啟「Enable JavaScript Queries」（DataviewJS），`99_Dashboard.md` 的待內化清單需要這個功能才能運作

## 3. 首次使用：安全測試 SOP（務必先做）

因為 Kobo Highlights Importer 官方文件沒有明確保證「重複匯入時是否會覆蓋既有筆記／`kobo-id` 是否維持穩定」，正式依賴這套系統前，先做一次測試：

1. 把 Kobo 用 USB 接上電腦，在 Obsidian 執行一次 Kobo Highlights Importer 同步。
2. 打開 `00_Inbox` 裡任一本書的筆記，確認每條劃線後方都出現一行 `%%kobo-id:數字%%`（在編輯模式看得到，閱讀模式會隱藏，這是正常的）。
3. 不要改動任何 `00_Inbox` 裡的檔案，直接再執行一次同步。
4. 再次打開同一本書的筆記，確認：
   - 同一條劃線的 `kobo-id` 數字**跟第一次完全相同**
   - 沒有同一條劃線被重複貼兩次

**結果 A（通過）**：不用做任何事，`99_Dashboard.md` 裡的「方案 A」查詢直接可用。

**結果 B（未通過）**：打開 `99_Dashboard.md`，把「方案 A」那個 ` ```dataviewjs ` 程式碼區塊整段刪除，然後把「方案 B」外面包住的 `<!-- -->` HTML 註解拿掉（讓那段 dataviewjs 變成真正生效的程式碼區塊）。之後費曼卡片的 `source_id` 欄位可以留空不填，只填 `source_quote`（劃線原文前 60 字）即可。

## 4. 日常操作流程

| 階段 | 頻率 | 操作 |
|---|---|---|
| 🐜 蒐集 | 想同步時隨時 | Kobo 接 USB → Obsidian 執行 Kobo Highlights Importer → `00_Inbox` 自動更新 |
| 🐛 內化 | 建議每週固定時段 | 打開 `99_Dashboard.md` 看待內化清單 → 到對應 `00_Inbox` 書籍筆記複製劃線原文與 kobo-id → 觸發 Templater 快捷鍵建卡（輸出到 `01_Cards`） |
| 🕸️ 連結 | 建卡當下順手做 | 在卡片內文用 `[[概念]]` 連結相關／對立概念；未建立的 MOC 連結會顯示紅字，之後統一處理 |
| 🐝 創造 | 卡片累積到一定量後 | 打開對應 `02_MOC/xxx MOC.md`，用 Dataview 表格檢視該主題所有卡片 → 到 `03_Output` 新建文章筆記整理成大綱 |

## 5. 資料夾說明

- `00_Inbox/`：Kobo 原始劃線，**唯讀**，外掛每次同步都可能整份重寫，不要在這裡手動編輯任何內容
- `01_Cards/`：費曼內化後的原子卡片，檔名＝中文概念名稱
- `02_MOC/`：主題地圖，複製 `投資心態地圖 MOC.md` 當範本建立新主題
- `03_Output/`：文章大綱／專案整理成果
- `90_Templates/`：Templater 與 Kobo 匯入的範本檔案
- `99_Dashboard.md`：首頁儀表板，待內化清單

## 6. 已知範圍外事項

- 自訂 Python 同步腳本（`KoboReader.sqlite` 直接讀取）：僅在安全測試失敗且方案 B 也不夠用時才需要，屆時另外規劃
- `03_Output` 匯出到部落格／社群媒體等外部平台的格式轉換
- 自動偵測 USB 插入並觸發同步
````

- [ ] **Step 3: 驗證 README 存在且引用到的檔案路徑都真的存在**

Run:
```bash
cd "c:/Users/88698/Desktop/Workspace/ReadGraph"
test -f README.md && echo README_OK || echo README_MISSING

for path in \
  "90_Templates/Kobo_Inbox_Template.eta" \
  "90_Templates/Feynman_Zettel_Template.md" \
  "99_Dashboard.md" \
  "02_MOC/投資心態地圖 MOC.md" \
  "00_Inbox" \
  "01_Cards" \
  "03_Output"; do
  test -e "$path" && echo "OK: $path" || echo "MISSING: $path"
done
```
Expected: 全部印出 `OK` / `README_OK`，沒有任何 `MISSING`

- [ ] **Step 4: Commit**

```bash
cd "c:/Users/88698/Desktop/Workspace/ReadGraph"
git add README.md
git commit -m "Add README with plugin setup, safety-test SOP, and daily workflow"
```

---

## Task 7: 最終資料夾樹驗證

**Files:**
- 無新檔案（純驗證任務）

**Interfaces:**
- Consumes：Task 1-6 的全部產出
- Produces：一份確認訊息，證明 Vault 骨架與設計文件第 9 節「最終交付物清單」逐項相符

- [ ] **Step 1: 產生實際資料夾樹並與交付物清單逐項比對**

Run:
```bash
cd "c:/Users/88698/Desktop/Workspace/ReadGraph"
find . -not -path "./.git*" -not -path "./docs/*" | sort
```

Expected 輸出應包含（順序不拘）：
```
.
./00_Inbox
./00_Inbox/.gitkeep
./01_Cards
./01_Cards/.gitkeep
./02_MOC
./02_MOC/投資心態地圖 MOC.md
./03_Output
./03_Output/.gitkeep
./90_Templates
./90_Templates/Feynman_Zettel_Template.md
./90_Templates/Kobo_Inbox_Template.eta
./99_Dashboard.md
./README.md
```

- [ ] **Step 2: 確認 git log 顯示每個任務都有獨立 commit**

Run:
```bash
cd "c:/Users/88698/Desktop/Workspace/ReadGraph"
git log --oneline
```
Expected: 至少 7 筆 commit（設計文件 1 筆 + Task 1-6 各 1 筆），由舊到新依序對應：設計文件 → 資料夾骨架 → Kobo 範本 → Feynman 範本 → 儀表板 → 範例 MOC → README

- [ ] **Step 3: 確認 git working tree 乾淨（沒有漏 commit 的檔案）**

Run:
```bash
cd "c:/Users/88698/Desktop/Workspace/ReadGraph"
git status --porcelain
```
Expected: 沒有任何輸出（空字串＝working tree 乾淨）

**完成後仍需使用者手動做的事（本計畫做不到，需明確告知使用者）：**
1. 在 Obsidian 開啟 `ReadGraph/` 作為 Vault
2. 依 README 第 1-2 節安裝並設定三個 community plugin
3. 依 README 第 3 節跑一次安全測試，確認方案 A 是否可用
4. 若第一次使用，直接執行 Kobo 同步即完成歷史劃線的一次性回填（外掛預設就是全量匯入，不需要額外步驟）
