# 全面改用 Karpathy LLM Wiki 外掛 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Vault 從「手動費曼卡片 + Grok 自動分類」的舊架構，過渡到「Karpathy LLM Wiki 外掛全自動編譯」的新架構：存檔既有的臨時處理內容、刪除舊系統程式碼與範本、改寫 README 反映新流程。

**Architecture:** 這是一次清理與文件重寫任務，不涉及新程式邏輯——沒有程式碼需要 TDD。每個任務的「測試」是檔案系統狀態的存在性/數量驗證（`find`、`git status`），跟這個專案先前的內容型任務（vault 骨架建置）用同一套驗證方式，而不是像 Grok 整合那樣需要單元測試。

**Tech Stack:** 純檔案系統操作（`git mv`、`git rm`）與 Markdown 文件撰寫，不涉及任何程式語言執行環境。

## Global Constraints

- Vault 根目錄固定為 `c:/Users/88698/Desktop/Workspace/ReadGraph`，目前在 `master` 分支，工作樹乾淨。
- `01_Cards/`、`02_MOC/` 現有的 41 張卡片與 3 個地圖，**必須用 `git mv` 搬移存檔，不得用 `rm` 直接刪除**——這批內容是使用者特意保留的成果。
- `01_Cards/.gitkeep`、`02_MOC/.gitkeep` 在本計畫範圍內**不刪除**：兩個資料夾依 spec 第 3 節的順序依賴，要等外掛裝好、驗證通過、重新 Ingest 過三本書、使用者人工比對品質可接受之後，才能真正移除資料夾本身——那個步驟需要 Obsidian GUI 操作，本計畫做不到，留在 Task 4 的人工檢查清單裡。
- `.env`、`00_Inbox/*`（含真實個人劃線內容）的 `.gitignore` 排除規則維持不動，本計畫任何任務都不得移除或繞過。
- `90_Templates/Kobo_Inbox_Template.eta` 與 `00_Inbox/` 資料夾本身**不受影響**——Kobo 匯入流程完全不變。
- `03_Output/` 資料夾**不受影響**。

---

## Task 1: 存檔既有的臨時處理內容

**Files:**
- Move (via `git mv`): `01_Cards/*.md`（41 個檔案）→ `_archive/2026-08-10-manual-batch/01_Cards/`
- Move (via `git mv`): `02_MOC/*.md`（3 個檔案）→ `_archive/2026-08-10-manual-batch/02_MOC/`

**Interfaces:**
- Consumes：無
- Produces：`_archive/2026-08-10-manual-batch/01_Cards/`（41 個檔案）與 `_archive/2026-08-10-manual-batch/02_MOC/`（3 個檔案），供 Task 4 最終驗證比對數量；`01_Cards/`、`02_MOC/` 兩個資料夾只留下各自的 `.gitkeep`

- [ ] **Step 1: 驗證搬移前的檔案數量**

Run:
```bash
cd "c:/Users/88698/Desktop/Workspace/ReadGraph"
find 01_Cards -name "*.md" | wc -l
find 02_MOC -name "*.md" | wc -l
```
Expected: `41`，接著 `3`

- [ ] **Step 2: 建立存檔目錄結構**

Run:
```bash
cd "c:/Users/88698/Desktop/Workspace/ReadGraph"
mkdir -p "_archive/2026-08-10-manual-batch/01_Cards"
mkdir -p "_archive/2026-08-10-manual-batch/02_MOC"
```

- [ ] **Step 3: 用 git mv 搬移全部 .md 檔案（保留 .gitkeep 在原地）**

Run:
```bash
cd "c:/Users/88698/Desktop/Workspace/ReadGraph"
git mv 01_Cards/*.md "_archive/2026-08-10-manual-batch/01_Cards/"
git mv 02_MOC/*.md "_archive/2026-08-10-manual-batch/02_MOC/"
```

- [ ] **Step 4: 驗證搬移結果**

Run:
```bash
cd "c:/Users/88698/Desktop/Workspace/ReadGraph"
find "_archive/2026-08-10-manual-batch/01_Cards" -name "*.md" | wc -l
find "_archive/2026-08-10-manual-batch/02_MOC" -name "*.md" | wc -l
find 01_Cards -name "*.md" | wc -l
find 02_MOC -name "*.md" | wc -l
test -f "01_Cards/.gitkeep" && echo "GITKEEP_01_OK" || echo "GITKEEP_01_MISSING"
test -f "02_MOC/.gitkeep" && echo "GITKEEP_02_OK" || echo "GITKEEP_02_MISSING"
```
Expected：`41`、`3`、`0`、`0`、`GITKEEP_01_OK`、`GITKEEP_02_OK`

- [ ] **Step 5: Commit**

```bash
cd "c:/Users/88698/Desktop/Workspace/ReadGraph"
git add -A -- 01_Cards 02_MOC _archive
git commit -m "Archive ad-hoc manually-processed cards and MOCs before plugin migration"
```

---

## Task 2: 刪除舊系統基礎設施

**Files:**
- Delete (via `git rm`): `90_Templates/Feynman_Zettel_Template.md`
- Delete (via `git rm`): `90_Templates/scripts/generate_stubs.js`
- Delete (via `git rm`): `90_Templates/scripts/stub_logic.js`
- Delete (via `git rm`): `90_Templates/scripts/tag_vocabulary.json`
- Delete (via `git rm`): `90_Templates/_批次產生骨架.md`
- Delete (via `git rm`): `tests/generate_stubs.test.js`
- Delete (via `git rm`): `tests/stub_logic.test.js`
- Delete (via `git rm`): `99_Dashboard.md`

**Interfaces:**
- Consumes：無
- Produces：乾淨的 `90_Templates/`（只剩 `Kobo_Inbox_Template.eta`）、空的 `tests/` 與 `90_Templates/scripts/`（git 不追蹤空資料夾，會自動消失）、`99_Dashboard.md` 不存在，供 Task 4 驗證

- [ ] **Step 1: 驗證目前這些檔案都存在**

Run:
```bash
cd "c:/Users/88698/Desktop/Workspace/ReadGraph"
for f in \
  "90_Templates/Feynman_Zettel_Template.md" \
  "90_Templates/scripts/generate_stubs.js" \
  "90_Templates/scripts/stub_logic.js" \
  "90_Templates/scripts/tag_vocabulary.json" \
  "90_Templates/_批次產生骨架.md" \
  "tests/generate_stubs.test.js" \
  "tests/stub_logic.test.js" \
  "99_Dashboard.md"; do
  test -f "$f" && echo "OK: $f" || echo "MISSING: $f"
done
```
Expected：八行都印出 `OK: <路徑>`

- [ ] **Step 2: 刪除全部八個檔案**

Run:
```bash
cd "c:/Users/88698/Desktop/Workspace/ReadGraph"
git rm "90_Templates/Feynman_Zettel_Template.md"
git rm "90_Templates/scripts/generate_stubs.js"
git rm "90_Templates/scripts/stub_logic.js"
git rm "90_Templates/scripts/tag_vocabulary.json"
git rm "90_Templates/_批次產生骨架.md"
git rm "tests/generate_stubs.test.js"
git rm "tests/stub_logic.test.js"
git rm "99_Dashboard.md"
```

- [ ] **Step 3: 驗證刪除結果，且 Kobo 範本沒被誤刪**

Run:
```bash
cd "c:/Users/88698/Desktop/Workspace/ReadGraph"
for f in \
  "90_Templates/Feynman_Zettel_Template.md" \
  "90_Templates/scripts/generate_stubs.js" \
  "90_Templates/scripts/stub_logic.js" \
  "90_Templates/scripts/tag_vocabulary.json" \
  "90_Templates/_批次產生骨架.md" \
  "tests/generate_stubs.test.js" \
  "tests/stub_logic.test.js" \
  "99_Dashboard.md"; do
  test -f "$f" && echo "STILL_EXISTS_BAD: $f" || echo "GONE_OK: $f"
done
test -f "90_Templates/Kobo_Inbox_Template.eta" && echo "KOBO_TEMPLATE_INTACT" || echo "KOBO_TEMPLATE_MISSING_BAD"
```
Expected：八行都印出 `GONE_OK: <路徑>`，最後一行印出 `KOBO_TEMPLATE_INTACT`

- [ ] **Step 4: Commit**

```bash
cd "c:/Users/88698/Desktop/Workspace/ReadGraph"
git commit -m "Remove superseded manual-Feynman and Grok-auto-tagging infrastructure"
```

---

## Task 3: 改寫 README

**Files:**
- Modify: `README.md`（整份取代）

**Interfaces:**
- Consumes：Task 1、Task 2 的產出路徑（`_archive/2026-08-10-manual-batch/`、`90_Templates/Kobo_Inbox_Template.eta`）
- Produces：反映新流程的完整操作手冊

- [ ] **Step 1: 讀取目前的 README 內容**

Run: `cat README.md` 或用 Read 工具讀取，確認目前內容（會被整份取代）

- [ ] **Step 2: 用以下內容整份取代 README.md**

`README.md`
````markdown
# ReadGraph — Kobo 讀書筆記與 AI 知識編譯系統

以 Obsidian 為核心的個人知識管理 Vault：Kobo 劃線（蒐集）→ Karpathy LLM Wiki 外掛自動編譯成結構化知識頁面 → 查詢與輸出。

## 0. 開啟 Vault（在安裝外掛之前）

1. 在 Obsidian 啟動畫面選擇「Open folder as vault」，選取 `ReadGraph/` 這個資料夾
2. 進入「設定 → Community plugins」，如果看到「Restricted Mode」（安全模式）是開啟的，先關閉它——安全模式關閉前無法瀏覽或安裝任何外掛
3. 安裝完下面的外掛後，記得個別把它們切換成「已啟用」（Obsidian 安裝外掛後預設不會自動啟用）

## 1. 需要安裝的 Community Plugins

在 Obsidian「設定 → Community plugins」搜尋並安裝：

1. **Kobo Highlights Importer**（作者 OGKevin）——必要，負責把 Kobo 劃線匯入 `00_Inbox`
2. **Karpathy LLM Wiki**（作者 green-dalii）——必要，負責把 `00_Inbox` 的劃線自動編譯成 `wiki/` 底下的知識頁面

`Templater`、`Dataview` 這兩個外掛可能還留在你的 vault 裡（舊系統用過），但這次的工作流不再需要它們——留著不管完全不影響運作，要停用也可以，兩者皆可。

## 2. 外掛設定

### 2.1 Kobo Highlights Importer

| 設定項 | 值 |
|---|---|
| 輸出資料夾 | `00_Inbox` |
| 範本 | 把 `90_Templates/Kobo_Inbox_Template.eta` 的內容複製貼到外掛設定的範本欄位（若外掛版本支援直接指定範本檔案路徑，改成指向這個檔案） |
| 一本書一檔案 | 開啟 |
| Callout 樣式 | 關閉，改用純 `>` 引用 |

### 2.2 Karpathy LLM Wiki

1. 選擇 LLM 供應商：**優先試 Groq**，填入 `.env` 裡現有的 `GROQ_API_KEY`，執行外掛內建的連接測試
2. **若連接測試失敗**（Groq 不在外掛官方支援清單內，需要實測才知道）：
   - 改用 Ollama（本地模型，免費、不需金鑰），或
   - 申請一組外掛原生支援的供應商金鑰（Anthropic／OpenAI／xAI Grok 皆可，外掛官方清單明確支援這些）
3. 「提取粒度」建議先選 Coarse，控制 API 成本，之後不夠用再調高

## 3. 首次使用：功能驗證（務必先做）

外掛是否真的支援 Groq、是否真的不修改原始筆記、Smart Batch Skip 是否真的有效，都需要實際測過一次才能確定：

1. 對 `00_Inbox` 裡任一本書執行「Ingest single source」
2. 確認 `wiki/entities`、`wiki/concepts` 底下正確產生頁面，且 `00_Inbox` 原始檔案完全沒被修改
3. 確認產生頁面的 frontmatter 含 `tags`／`type`／`aliases`
4. 對同一本書重複執行一次 Ingest，確認不會產生重複頁面（Smart Batch Skip 正常運作）

**通過驗證後，才進行下面「既有內容遷移」章節。**

## 4. 既有內容遷移（一次性）

`01_Cards/`、`02_MOC/` 目前是空的——原本裡面的 41 張卡片與 3 個地圖已經搬到 `_archive/2026-08-10-manual-batch/` 存檔（那批內容是先前用別的 AI 工具臨時處理的，格式跟這個外掛的正式輸出不一致）。

「首次使用：功能驗證」章節通過後：

1. 對 `00_Inbox` 執行「Ingest from Folder」，處理裡面全部三本書
2. 人工比對新產生的 `wiki/` 內容跟 `_archive/2026-08-10-manual-batch/` 存檔版本，確認品質可以接受
3. 確認沒問題後，`01_Cards/`、`02_MOC/` 這兩個資料夾（含 `.gitkeep`）可以直接刪除——之後都不會再用到

## 5. 日常操作流程

| 階段 | 操作 |
|---|---|
| 🐜 蒐集 | Kobo 接 USB → Obsidian 執行 Kobo Highlights Importer → `00_Inbox` 自動更新 |
| 🧠 編譯 | 對 `00_Inbox` 執行「Ingest from Folder」（或針對單一新書用 single source）→ 外掛自動產生/更新 `wiki/` 底下的實體與概念頁面，已處理過的內容會自動跳過 |
| 🔍 應用 | 需要靈感或寫作時，用外掛的 Query 對話功能直接詢問知識庫，或打開 `wiki/index.md` 瀏覽 → 到 `03_Output` 新建文章筆記整理成大綱 |

## 6. 資料夾說明

- `00_Inbox/`：Kobo 原始劃線，**唯讀**，外掛每次同步都可能整份重寫，不要在這裡手動編輯任何內容；同時是 Karpathy LLM Wiki 的 Ingest 來源
- `wiki/`：Karpathy LLM Wiki 外掛自動產生的知識頁面（`sources/`、`entities/`、`concepts/`、`index.md`），不需要手動編輯，重新 Ingest 會自動更新
- `03_Output/`：文章大綱／專案整理成果，手動撰寫
- `90_Templates/Kobo_Inbox_Template.eta`：Kobo 匯入的客製化範本，維持使用中
- `_archive/`：舊系統存檔，保留供查閱，不再更新

## 7. 已知範圍外事項

- 外掛本身的實作／客製化（第三方外掛，不是這個 repo 的程式碼）
- `03_Output` 匯出到部落格／社群媒體等外部平台的格式轉換
- 自動偵測 USB 插入並觸發同步
- 既有存檔內容（`_archive/`）與新 Ingest 結果的自動化品質比對工具——人工比對即可
````

- [ ] **Step 3: 驗證新內容已套用，且沒有殘留舊系統的說明**

Run:
```bash
cd "c:/Users/88698/Desktop/Workspace/ReadGraph"
grep -c "Karpathy LLM Wiki" README.md
grep -c "既有內容遷移" README.md
grep -c "Feynman_Zettel_Template" README.md || echo 0
grep -c "批次產生骨架" README.md || echo 0
grep -c "status: stub" README.md || echo 0
```
Expected：`2` 以上、`1` 以上、後三個都輸出 `0`（確認舊系統的說明已經完全清乾淨，不是殘留半份文件）

- [ ] **Step 4: Commit**

```bash
cd "c:/Users/88698/Desktop/Workspace/ReadGraph"
git add README.md
git commit -m "Rewrite README for Karpathy LLM Wiki workflow"
```

---

## Task 4: 最終驗證 + 人工後續檢查清單

**Files:**
- 無新檔案（純驗證任務）

**Interfaces:**
- Consumes：Task 1-3 全部產出
- Produces：確認自動化部分正確、並列出使用者必須在 Obsidian 裡手動完成的步驟

- [ ] **Step 1: 整體檔案樹與 git 狀態驗證**

Run:
```bash
cd "c:/Users/88698/Desktop/Workspace/ReadGraph"
git status --porcelain
git log --oneline -3
find "_archive/2026-08-10-manual-batch" -name "*.md" | wc -l
find 01_Cards 02_MOC -type f
find 90_Templates -type f
find tests -type f 2>/dev/null || echo "tests 資料夾已不存在（正常，git 不追蹤空資料夾）"
test -f 99_Dashboard.md && echo "STILL_EXISTS_BAD" || echo "GONE_OK"
```
Expected：
- `git status --porcelain` 無輸出（working tree 乾淨）
- `git log --oneline -3` 由新到舊依序對應 Task 3 → Task 2 → Task 1 的 commit
- `_archive/2026-08-10-manual-batch` 底下 `.md` 檔案總數為 `44`（41+3）
- `01_Cards`、`02_MOC` 底下只剩各自的 `.gitkeep`
- `90_Templates` 底下只剩 `Kobo_Inbox_Template.eta`
- `tests` 資料夾已不存在
- `99_Dashboard.md` 印出 `GONE_OK`

**完成後仍需使用者手動做的事（本計畫做不到，需明確告知使用者）：**

1. 在 Obsidian 安裝並啟用「Karpathy LLM Wiki」外掛
2. 依 README 第 2.2 節設定 LLM 供應商（優先 Groq，失敗則退回 Ollama 或其他原生支援供應商）
3. 依 README 第 3 節跑一次功能驗證（單本書 Ingest、確認原始檔案未被修改、確認 frontmatter 正確、確認 Smart Batch Skip 有效）
4. 驗證通過後，依 README 第 4 節對 `00_Inbox` 執行「Ingest from Folder」，人工比對新產生的 `wiki/` 內容跟 `_archive/2026-08-10-manual-batch/` 存檔版本
5. 確認品質可接受後，手動刪除 `01_Cards/`、`02_MOC/` 這兩個資料夾
