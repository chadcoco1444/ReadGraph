# 批次骨架卡片產生 + Grok AI 自動標籤分類 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在既有的 ReadGraph Obsidian Vault 上，新增「一鍵批次產生卡片骨架 + Grok AI 自動標籤分類」功能，讓使用者同步完 Kobo 劃線後，不用再逐條手動複製貼上就能建立卡片，同時保留費曼轉譯／個人經驗錨點必須手動撰寫的核心學習機制。

**Architecture:** 核心分類與比對邏輯抽成純函式模組（`stub_logic.js`，可用純 Node 執行單元測試），Obsidian 整合層（`generate_stubs.js`，Templater User Script）透過依賴注入（adapter/fetch/notify/now 皆可替換）呼叫這些純函式，讓整條批次流程也能在 Obsidian 外用模擬物件做真正的整合測試。使用者觸發面是一個「觸發用範本」（`_批次產生骨架.md`）綁定快捷鍵，執行完自我刪除，只留下產生出來的骨架卡片。

**Tech Stack:** Obsidian Templater User Scripts（Node.js/CommonJS 環境）、Node.js 內建 `assert` 模組做單元測試（不引入額外測試框架依賴）、xAI Grok Chat Completions API（`https://api.x.ai/v1/chat/completions`，OpenAI 相容格式）。

## Global Constraints

- Vault 根目錄固定為 `c:/Users/88698/Desktop/Workspace/ReadGraph`，目前在 `master` 分支，工作樹乾淨。
- `.env`（存放 `GROK_API_KEY`）與 `00_Inbox/*`（真實劃線內容）已經加入 `.gitignore` 並推送，本計畫的任何任務都不得移除這兩條規則或寫入這兩類檔案的真實內容到版本控制。
- 新建卡片一律包含 `status: stub` 欄位；使用者手動完成費曼轉譯後自行改成 `done`，本計畫不實作任何自動偵測「內容是否寫完」的邏輯。
- AI 只負責決定 `tags` 欄位（主題分類），絕不生成費曼轉譯或個人經驗錨點內容——這是專案的核心限制，任何任務都不能違反。
- Grok API 沒有設定（`.env` 不存在或缺少 `GROK_API_KEY`）時，批次產生骨架必須照常運作，只是全部卡片的標籤退回 `未分類`，不能因此整個功能失敗或報錯中斷。
- 每條劃線的 Grok 分類呼叫必須獨立包一層錯誤處理；單條失敗改標 `未分類`，絕不能讓整個批次因為一條失敗而中斷。
- kobo-id 劃線比對的正規表示式（`/^>[ \t]*(.+?)\r?\n>[ \t]*%%kobo-id:([^\s%]+)%%/gm`）在 `99_Dashboard.md` 的 DataviewJS 與本次新增的 `stub_logic.js` 裡各自維護一份——這是刻意接受的重複，因為 DataviewJS 沙盒環境無法 `require()` 本地 Node 模組，跟原始設計裡 Plan A／Plan B 的重複邏輯是同一種已接受的取捨。如果之後 Kobo 匯入範本的標記格式改變，兩處都要同步更新。
- 本專案沒有 `package.json`，測試一律用 Node 內建 `assert` 模組、以 `node <test檔案路徑>` 直接執行，不引入 Jest 或其他測試框架依賴。
- Grok API 的確切請求／回應格式、目前有效的模型名稱，本計畫採用 xAI 公開文件描述的 OpenAI 相容格式作為最佳合理假設，但**必須**在建置完成後由使用者用真實 `.env` 手動驗證一次（見 Task 7），不能只靠本計畫內建的模擬測試就假設一定正確。

---

## Task 1: 建立 stub_logic.js 純函式模組（TDD 單元測試）

**Files:**
- Create: `90_Templates/scripts/lib/stub_logic.js`
- Create: `90_Templates/scripts/lib/stub_logic.test.js`

**Interfaces:**
- Consumes: 無（起始任務，純函式無外部依賴）
- Produces：CommonJS module，`module.exports` 為一個物件，包含以下函式，供 Task 2 的 `generate_stubs.js` 用 `require("./lib/stub_logic.js")` 引入：
  - `parseInboxHighlights(fileContent: string): Array<{quote: string, koboId: string}>`
  - `findPendingHighlights(inboxFiles: Array<{basename: string, content: string}>, existingSourceIds: Set<string>): Array<{bookBasename: string, quote: string, koboId: string}>`
  - `sanitizeStubFilename(highlightText: string, existingFilenames: string[]): string`
  - `buildGrokRequestBody(highlightText: string, bookTitle: string, vocabulary: string[]): object`
  - `parseGrokTagFromResponse(responseJson: object): string`（無法解析時 `throw new Error(...)`）
  - `buildStubFrontmatter(params: {bookBasename: string, koboId: string, quote: string, tag: string, dateIso: string}): string`

- [ ] **Step 1: 寫失敗測試（parseInboxHighlights 基本情境 + 重複呼叫不遺漏比對，這是回歸測試——正規表示式帶 `g` flag 若在函式間共用同一個 RegExp 物件、不重置 `lastIndex`，第二次呼叫會漏抓後面的比對結果）**

`90_Templates/scripts/lib/stub_logic.test.js`
```javascript
const assert = require("assert");
const {
  parseInboxHighlights,
  findPendingHighlights,
  sanitizeStubFilename,
  buildGrokRequestBody,
  parseGrokTagFromResponse,
  buildStubFrontmatter,
} = require("./stub_logic.js");

function test(name, fn) {
  fn();
  console.log(`${name}: PASS`);
}

test("parseInboxHighlights: 基本情境抓出兩條劃線", () => {
  const content = `# Book\n\n> 第一條劃線\n> %%kobo-id:abc-123%%\n\n> 第二條劃線\n> %%kobo-id:def-456%%\n`;
  const result = parseInboxHighlights(content);
  assert.strictEqual(result.length, 2);
  assert.strictEqual(result[0].quote, "第一條劃線");
  assert.strictEqual(result[0].koboId, "abc-123");
  assert.strictEqual(result[1].quote, "第二條劃線");
  assert.strictEqual(result[1].koboId, "def-456");
});

test("parseInboxHighlights: 重複呼叫同一段內容，兩次都要抓到全部比對（regex lastIndex 回歸測試）", () => {
  const content = `> A\n> %%kobo-id:1%%\n\n> B\n> %%kobo-id:2%%\n`;
  const first = parseInboxHighlights(content);
  const second = parseInboxHighlights(content);
  assert.strictEqual(first.length, 2);
  assert.strictEqual(second.length, 2);
});

test("findPendingHighlights: 已有卡片的 kobo-id 被排除，只留下待處理的", () => {
  const inboxFiles = [
    { basename: "書A", content: `> A\n> %%kobo-id:1%%\n\n> B\n> %%kobo-id:2%%\n` },
  ];
  const existing = new Set(["1"]);
  const pending = findPendingHighlights(inboxFiles, existing);
  assert.strictEqual(pending.length, 1);
  assert.strictEqual(pending[0].koboId, "2");
  assert.strictEqual(pending[0].quote, "B");
  assert.strictEqual(pending[0].bookBasename, "書A");
});

test("sanitizeStubFilename: 截斷長度並清掉不合法字元", () => {
  const name = sanitizeStubFilename('這是一段包含"引號"與/斜線與\\反斜線的很長很長的劃線內容標題文字', []);
  assert.ok(name.length <= 20);
  assert.ok(!/[\\/:*?"<>|]/.test(name));
});

test("sanitizeStubFilename: 檔名衝突時自動加序號", () => {
  const name1 = sanitizeStubFilename("重複的劃線內容", []);
  const name2 = sanitizeStubFilename("重複的劃線內容", [name1]);
  assert.notStrictEqual(name1, name2);
  assert.ok(name2.includes(name1));
});

test("buildGrokRequestBody: 包含劃線內容與既有標籤詞庫", () => {
  const body = buildGrokRequestBody("測試劃線", "測試書名", ["投資心態"]);
  assert.strictEqual(body.model, "grok-4");
  assert.ok(Array.isArray(body.messages));
  assert.ok(body.messages.some((m) => m.content.includes("測試劃線")));
  assert.ok(body.messages.some((m) => m.content.includes("投資心態")));
});

test("buildGrokRequestBody: 空標籤詞庫時提示是第一次分類", () => {
  const body = buildGrokRequestBody("測試劃線", "測試書名", []);
  assert.ok(body.messages.some((m) => m.content.includes("沒有任何標籤")));
});

test("parseGrokTagFromResponse: 解析出乾淨的標籤文字", () => {
  const response = { choices: [{ message: { content: "投資心態" } }] };
  assert.strictEqual(parseGrokTagFromResponse(response), "投資心態");
});

test("parseGrokTagFromResponse: 自動去除多餘的井字號與標點", () => {
  const response = { choices: [{ message: { content: "#投資心態。" } }] };
  assert.strictEqual(parseGrokTagFromResponse(response), "投資心態");
});

test("parseGrokTagFromResponse: 回應格式不對時丟出錯誤", () => {
  assert.throws(() => parseGrokTagFromResponse({}));
  assert.throws(() => parseGrokTagFromResponse({ choices: [] }));
});

test("buildStubFrontmatter: 產生的內容包含所有必要欄位", () => {
  const md = buildStubFrontmatter({
    bookBasename: "致富心態",
    koboId: "abc-123",
    quote: "測試劃線內容",
    tag: "投資心態",
    dateIso: "2026-08-10 00:00",
  });
  assert.ok(md.includes("status: stub"));
  assert.ok(md.includes('source: "[[致富心態]]"'));
  assert.ok(md.includes("source_id: abc-123"));
  assert.ok(md.includes('source_quote: "測試劃線內容"'));
  assert.ok(md.includes("  - 投資心態"));
  assert.ok(md.includes("[[投資心態 MOC]]"));
  assert.ok(md.includes("> 測試劃線內容"));
});

console.log("\n全部 stub_logic.js 測試通過。");
```

- [ ] **Step 2: 執行測試，確認因為 `stub_logic.js` 還不存在而失敗**

Run: `node "90_Templates/scripts/lib/stub_logic.test.js"`
Expected: `Error: Cannot find module './stub_logic.js'`

- [ ] **Step 3: 實作 stub_logic.js**

`90_Templates/scripts/lib/stub_logic.js`
```javascript
"use strict";

const HIGHLIGHT_REGEX_SOURCE = "^>[ \\t]*(.+?)\\r?\\n>[ \\t]*%%kobo-id:([^\\s%]+)%%";
const GROK_MODEL = "grok-4";

function parseInboxHighlights(fileContent) {
  const regex = new RegExp(HIGHLIGHT_REGEX_SOURCE, "gm");
  const results = [];
  let m;
  while ((m = regex.exec(fileContent)) !== null) {
    results.push({ quote: m[1], koboId: m[2] });
  }
  return results;
}

function findPendingHighlights(inboxFiles, existingSourceIds) {
  const pending = [];
  for (const file of inboxFiles) {
    const highlights = parseInboxHighlights(file.content);
    for (const h of highlights) {
      if (!existingSourceIds.has(h.koboId)) {
        pending.push({ bookBasename: file.basename, quote: h.quote, koboId: h.koboId });
      }
    }
  }
  return pending;
}

function sanitizeStubFilename(highlightText, existingFilenames) {
  const illegal = /[\\/:*?"<>|]/g;
  let base = highlightText.slice(0, 20).replace(illegal, "").trim();
  if (!base) base = "劃線";
  const existing = new Set(existingFilenames);
  let candidate = base;
  let suffix = 2;
  while (existing.has(candidate)) {
    candidate = `${base} (${suffix})`;
    suffix++;
  }
  return candidate;
}

function buildGrokRequestBody(highlightText, bookTitle, vocabulary) {
  const vocabList = vocabulary.length > 0 ? vocabulary.join("、") : "（目前沒有任何標籤，這是第一次分類）";
  return {
    model: GROK_MODEL,
    messages: [
      {
        role: "system",
        content: "你是一個讀書筆記主題分類助手。只回傳一個簡短的中文主題標籤文字，不要加任何說明、標點、引號或 # 符號。",
      },
      {
        role: "user",
        content: `書名：${bookTitle}\n劃線內容：${highlightText}\n\n現有標籤詞庫：${vocabList}\n\n請優先從現有標籤詞庫中選一個語意最貼切的標籤；如果詞庫中真的沒有合適的，才創造一個新的簡短標籤。只回傳標籤文字本身。`,
      },
    ],
    temperature: 0.2,
  };
}

function parseGrokTagFromResponse(responseJson) {
  const content =
    responseJson &&
    responseJson.choices &&
    responseJson.choices[0] &&
    responseJson.choices[0].message &&
    responseJson.choices[0].message.content;
  if (typeof content !== "string" || content.trim() === "") {
    throw new Error("Grok 回應內容無法解析出標籤文字");
  }
  return content
    .trim()
    .replace(/^#/, "")
    .replace(/["'。.\n]/g, "")
    .trim();
}

function buildStubFrontmatter({ bookBasename, koboId, quote, tag, dateIso }) {
  const excerpt = quote.slice(0, 60).replace(/"/g, "'").replace(/\r?\n/g, " ");
  return `---
type: feynman-card
status: stub
source: "[[${bookBasename}]]"
source_id: ${koboId}
source_quote: "${excerpt}"
date: ${dateIso}
tags:
  - ${tag}
---

# 📌 概念名稱：（尚未命名，內化時請把這個標題與檔名一起改成你想到的概念名稱）

### 1. 📖 Kobo 原始劃線 (Source)
> ${quote}

---

### 2. 👶 費曼轉譯（說給5歲小孩聽）


---

### 3. ⚓ 個人經驗與應用錨點


---

### 🔗 知識網絡連結
- **相關概念**：[[ ]]
- **相反/對立觀點**：[[ ]]
- **所屬主題 MOC**：[[${tag} MOC]]
`;
}

module.exports = {
  HIGHLIGHT_REGEX_SOURCE,
  GROK_MODEL,
  parseInboxHighlights,
  findPendingHighlights,
  sanitizeStubFilename,
  buildGrokRequestBody,
  parseGrokTagFromResponse,
  buildStubFrontmatter,
};
```

- [ ] **Step 4: 執行測試，確認全部通過**

Run: `node "90_Templates/scripts/lib/stub_logic.test.js"`
Expected: 12 行 `PASS`，最後印出 `全部 stub_logic.js 測試通過。`，exit code 0

- [ ] **Step 5: Commit**

```bash
cd "c:/Users/88698/Desktop/Workspace/ReadGraph"
git add 90_Templates/scripts/lib/stub_logic.js 90_Templates/scripts/lib/stub_logic.test.js
git commit -m "Add stub_logic.js pure-function module with unit tests"
```

---

## Task 2: 建立 generate_stubs.js（Templater User Script，整合 Obsidian API 與 Grok）

**Files:**
- Create: `90_Templates/scripts/generate_stubs.js`
- Create: `90_Templates/scripts/generate_stubs.test.js`
- Create: `90_Templates/scripts/tag_vocabulary.json`

**Interfaces:**
- Consumes：Task 1 的 `90_Templates/scripts/lib/stub_logic.js` 全部匯出函式
- Produces：`module.exports` 為 `async function generateStubs(tp, deps = {})`，供 Task 3 的觸發範本以 `tp.user.generate_stubs(tp)` 呼叫（Templater 依檔名自動註冊，不需額外設定）。`deps` 支援 `{adapter, fetch, notify, now}` 四個可覆寫的依賴，供測試注入模擬物件；正式環境呼叫時省略 `deps`，會自動使用 `tp.app.vault.adapter`、全域 `fetch`、`obsidian` 套件的 `Notice`、`tp.date.now(...)`。回傳值為 `{created: number, classified: number, fallback: number}`。

- [ ] **Step 1: 建立標籤詞庫種子檔案**

`90_Templates/scripts/tag_vocabulary.json`
```json
[]
```

- [ ] **Step 2: 寫失敗測試（模擬 Obsidian app/tp，涵蓋：無待處理劃線、Grok 成功分類、Grok 呼叫失敗退回未分類、完全沒設定 .env 時優雅降級四種情境）**

`90_Templates/scripts/generate_stubs.test.js`
```javascript
const assert = require("assert");
const generateStubs = require("./generate_stubs.js");

function makeFakeFile(path) {
  const basename = path.split("/").pop().replace(/\.md$/, "");
  return { path, basename };
}

async function test(name, fn) {
  await fn();
  console.log(`${name}: PASS`);
}

(async () => {
  await test("沒有待處理劃線：不建立任何卡片，只通知一次", async () => {
    const inboxFile = makeFakeFile("00_Inbox/書A.md");
    const cardFile = makeFakeFile("01_Cards/舊卡.md");
    const fakeApp = {
      vault: {
        getMarkdownFiles: () => [inboxFile, cardFile],
        read: async (f) =>
          f === inboxFile ? "> 已建卡的劃線\n> %%kobo-id:existing-1%%\n" : "",
        create: async () => {
          throw new Error("不應該建立任何卡片");
        },
      },
      metadataCache: {
        getFileCache: (f) =>
          f === cardFile ? { frontmatter: { source_id: "existing-1" } } : { frontmatter: {} },
      },
    };
    const tp = { app: fakeApp, date: { now: () => "2026-08-10 00:00" } };
    const notices = [];
    const result = await generateStubs(tp, { notify: (m) => notices.push(m) });
    assert.strictEqual(result.created, 0);
    assert.strictEqual(notices.length, 1);
    assert.ok(notices[0].includes("沒有新的待處理劃線"));
  });

  await test("有待處理劃線，Grok 分類成功：建卡並寫回標籤詞庫", async () => {
    const inboxFile = makeFakeFile("00_Inbox/書A.md");
    const created = [];
    const writtenVocab = [];
    const fakeAdapter = {
      read: async (path) => {
        if (path === ".env") return "GROK_API_KEY=fake-key\n";
        if (path === "90_Templates/scripts/tag_vocabulary.json") return "[]";
        throw new Error("unexpected read: " + path);
      },
      exists: async (path) => path === "90_Templates/scripts/tag_vocabulary.json",
      write: async (path, content) => writtenVocab.push({ path, content }),
    };
    const fakeApp = {
      vault: {
        getMarkdownFiles: () => [inboxFile],
        read: async () => "> 新劃線內容\n> %%kobo-id:new-1%%\n",
        create: async (path, content) => created.push({ path, content }),
      },
      metadataCache: { getFileCache: () => ({ frontmatter: {} }) },
    };
    const tp = { app: fakeApp, date: { now: () => "2026-08-10 00:00" } };
    const fakeFetch = async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "投資心態" } }] }),
    });
    const notices = [];
    const result = await generateStubs(tp, {
      adapter: fakeAdapter,
      fetch: fakeFetch,
      notify: (m) => notices.push(m),
    });
    assert.strictEqual(result.created, 1);
    assert.strictEqual(result.classified, 1);
    assert.strictEqual(result.fallback, 0);
    assert.strictEqual(created.length, 1);
    assert.ok(created[0].path.startsWith("01_Cards/"));
    assert.ok(created[0].content.includes("status: stub"));
    assert.ok(created[0].content.includes("- 投資心態"));
    assert.strictEqual(writtenVocab.length, 1);
    assert.ok(JSON.parse(writtenVocab[0].content).includes("投資心態"));
    assert.ok(notices[0].includes("成功分類 1 條"));
  });

  await test("有待處理劃線，Grok 呼叫失敗：退回未分類，仍照常建卡，不中斷", async () => {
    const inboxFile = makeFakeFile("00_Inbox/書A.md");
    const created = [];
    const fakeAdapter = {
      read: async (path) => {
        if (path === ".env") return "GROK_API_KEY=fake-key\n";
        if (path === "90_Templates/scripts/tag_vocabulary.json") return "[]";
        throw new Error("unexpected read: " + path);
      },
      exists: async (path) => path === "90_Templates/scripts/tag_vocabulary.json",
      write: async () => {},
    };
    const fakeApp = {
      vault: {
        getMarkdownFiles: () => [inboxFile],
        read: async () => "> 新劃線內容\n> %%kobo-id:new-1%%\n",
        create: async (path, content) => created.push({ path, content }),
      },
      metadataCache: { getFileCache: () => ({ frontmatter: {} }) },
    };
    const tp = { app: fakeApp, date: { now: () => "2026-08-10 00:00" } };
    const fakeFetch = async () => {
      throw new Error("network down");
    };
    const result = await generateStubs(tp, {
      adapter: fakeAdapter,
      fetch: fakeFetch,
      notify: () => {},
    });
    assert.strictEqual(result.classified, 0);
    assert.strictEqual(result.fallback, 1);
    assert.strictEqual(created.length, 1);
    assert.ok(created[0].content.includes("- 未分類"));
  });

  await test("完全沒設定 .env：優雅降級，全部標未分類，不呼叫 Grok、不報錯", async () => {
    const inboxFile = makeFakeFile("00_Inbox/書A.md");
    const created = [];
    const fakeAdapter = {
      read: async (path) => {
        if (path === ".env") throw new Error("ENOENT");
        if (path === "90_Templates/scripts/tag_vocabulary.json") return "[]";
        throw new Error("unexpected read: " + path);
      },
      exists: async (path) => path === "90_Templates/scripts/tag_vocabulary.json",
      write: async () => {},
    };
    const fakeApp = {
      vault: {
        getMarkdownFiles: () => [inboxFile],
        read: async () => "> 新劃線內容\n> %%kobo-id:new-1%%\n",
        create: async (path, content) => created.push({ path, content }),
      },
      metadataCache: { getFileCache: () => ({ frontmatter: {} }) },
    };
    const tp = { app: fakeApp, date: { now: () => "2026-08-10 00:00" } };
    const fakeFetch = async () => {
      throw new Error("不應該呼叫 fetch");
    };
    const result = await generateStubs(tp, {
      adapter: fakeAdapter,
      fetch: fakeFetch,
      notify: () => {},
    });
    assert.strictEqual(result.fallback, 1);
    assert.strictEqual(created.length, 1);
    assert.ok(created[0].content.includes("- 未分類"));
  });

  console.log("\n全部 generate_stubs.js 測試通過。");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 3: 執行測試，確認因為 `generate_stubs.js` 還不存在而失敗**

Run: `node "90_Templates/scripts/generate_stubs.test.js"`
Expected: `Error: Cannot find module './generate_stubs.js'`

- [ ] **Step 4: 實作 generate_stubs.js**

`90_Templates/scripts/generate_stubs.js`
```javascript
"use strict";

const {
  findPendingHighlights,
  sanitizeStubFilename,
  buildGrokRequestBody,
  parseGrokTagFromResponse,
  buildStubFrontmatter,
} = require("./lib/stub_logic.js");

const VOCAB_PATH = "90_Templates/scripts/tag_vocabulary.json";
const INBOX_FOLDER = "00_Inbox";
const CARDS_FOLDER = "01_Cards";
const GROK_ENDPOINT = "https://api.x.ai/v1/chat/completions";

async function readEnvApiKey(adapter) {
  const raw = await adapter.read(".env");
  const line = raw.split(/\r?\n/).find((l) => l.startsWith("GROK_API_KEY="));
  if (!line) throw new Error(".env 檔案裡找不到 GROK_API_KEY");
  return line.slice("GROK_API_KEY=".length).trim();
}

async function readVocabulary(adapter, path) {
  const exists = await adapter.exists(path);
  if (!exists) return [];
  const raw = await adapter.read(path);
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

async function classifyTag(fetchFn, apiKey, highlightText, bookTitle, vocabulary) {
  const body = buildGrokRequestBody(highlightText, bookTitle, vocabulary);
  const response = await fetchFn(GROK_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Grok API 回傳錯誤狀態碼 ${response.status}`);
  }
  const json = await response.json();
  return parseGrokTagFromResponse(json);
}

async function generateStubs(tp, deps = {}) {
  const app = tp.app;
  const adapter = deps.adapter || app.vault.adapter;
  const fetchFn = deps.fetch || fetch;
  const notify = deps.notify || ((msg) => new (require("obsidian").Notice)(msg));
  const nowFn = deps.now || (() => tp.date.now("YYYY-MM-DD HH:mm"));

  const inboxFiles = app.vault.getMarkdownFiles().filter((f) => f.path.startsWith(INBOX_FOLDER + "/"));
  const cardFiles = app.vault.getMarkdownFiles().filter((f) => f.path.startsWith(CARDS_FOLDER + "/"));

  const inboxData = [];
  for (const file of inboxFiles) {
    inboxData.push({ basename: file.basename, content: await app.vault.read(file) });
  }

  const existingSourceIds = new Set();
  const existingCardFilenames = [];
  for (const file of cardFiles) {
    existingCardFilenames.push(file.basename);
    const cache = app.metadataCache.getFileCache(file);
    const sourceId = cache && cache.frontmatter ? cache.frontmatter.source_id : undefined;
    if (sourceId !== undefined && sourceId !== null) {
      existingSourceIds.add(String(sourceId));
    }
  }

  const pending = findPendingHighlights(inboxData, existingSourceIds);

  if (pending.length === 0) {
    notify("沒有新的待處理劃線，全部都已建卡。");
    return { created: 0, classified: 0, fallback: 0 };
  }

  let apiKey = null;
  try {
    apiKey = await readEnvApiKey(adapter);
  } catch (e) {
    apiKey = null;
  }

  let vocabulary = await readVocabulary(adapter, VOCAB_PATH);
  let successCount = 0;
  let fallbackCount = 0;
  const usedFilenames = existingCardFilenames.slice();

  for (const item of pending) {
    let tag = "未分類";
    if (apiKey) {
      try {
        tag = await classifyTag(fetchFn, apiKey, item.quote, item.bookBasename, vocabulary);
        if (!vocabulary.includes(tag)) vocabulary.push(tag);
        successCount++;
      } catch (e) {
        tag = "未分類";
        fallbackCount++;
      }
    } else {
      fallbackCount++;
    }

    const filename = sanitizeStubFilename(item.quote, usedFilenames);
    usedFilenames.push(filename);

    const content = buildStubFrontmatter({
      bookBasename: item.bookBasename,
      koboId: item.koboId,
      quote: item.quote,
      tag,
      dateIso: nowFn(),
    });

    await app.vault.create(`${CARDS_FOLDER}/${filename}.md`, content);
  }

  await adapter.write(VOCAB_PATH, JSON.stringify(vocabulary, null, 2));

  notify(`本次共處理 ${pending.length} 條劃線，成功分類 ${successCount} 條，${fallbackCount} 條標記為未分類。`);
  return { created: pending.length, classified: successCount, fallback: fallbackCount };
}

module.exports = generateStubs;
```

- [ ] **Step 5: 執行測試，確認全部通過**

Run: `node "90_Templates/scripts/generate_stubs.test.js"`
Expected: 4 行 `PASS`，最後印出 `全部 generate_stubs.js 測試通過。`，exit code 0

- [ ] **Step 6: 語法驗證（`node --check` 確認語法正確；`require("obsidian")` 這類外部套件在正式環境才會解析，`--check` 只做語法解析不會因此出錯）**

Run: `node --check "90_Templates/scripts/generate_stubs.js"`
Expected: 沒有輸出，exit code 0

- [ ] **Step 7: Commit**

```bash
cd "c:/Users/88698/Desktop/Workspace/ReadGraph"
git add 90_Templates/scripts/generate_stubs.js 90_Templates/scripts/generate_stubs.test.js 90_Templates/scripts/tag_vocabulary.json
git commit -m "Add generate_stubs.js Templater orchestrator with mocked integration tests"
```

**注意（誠實揭露測試邊界）**：以上測試全部使用模擬的 `fetch`／`adapter`，驗證的是「程式邏輯在各種情境下的行為正確」，不驗證 xAI Grok API 的真實請求／回應格式是否真的長這樣。這件事必須在 Task 7 用真實 `.env` 手動驗證一次。

---

## Task 3: 建立批次觸發用範本

**Files:**
- Create: `90_Templates/_批次產生骨架.md`

**Interfaces:**
- Consumes：Task 2 的 `generate_stubs`，透過 Templater 自動註冊的 `tp.user.generate_stubs(tp)` 呼叫（檔名 `generate_stubs.js` 去掉副檔名即為註冊名稱，這是 Templater 的既有慣例，不需要額外程式碼註冊）
- Produces：一個綁定快捷鍵即可觸發批次流程的範本檔案，執行完會自我刪除，不留下中介筆記

- [ ] **Step 1: 驗證檔案目前不存在**

Run: `test -f "90_Templates/_批次產生骨架.md" && echo EXISTS || echo NOT_FOUND`
Expected: `NOT_FOUND`

- [ ] **Step 2: 建立觸發用範本**

`90_Templates/_批次產生骨架.md`
```markdown
<%*
await tp.user.generate_stubs(tp);
await tp.file.delete();
-%>
```

- [ ] **Step 3: 驗證檔案存在且內容正確**

Run:
```bash
test -f "90_Templates/_批次產生骨架.md" && echo OK || echo FAIL
grep -c "tp.user.generate_stubs" "90_Templates/_批次產生骨架.md"
grep -c "tp.file.delete" "90_Templates/_批次產生骨架.md"
```
Expected: `OK`，接著兩個 `1`

**注意（誠實揭露測試邊界）**：這個檔案的實際行為（按快捷鍵是否真的觸發批次、自我刪除是否正常運作）只能在 Obsidian 裡實測，本步驟只驗證檔案內容存在且語法正確，見 Task 7 的人工驗證清單。

- [ ] **Step 4: Commit**

```bash
cd "c:/Users/88698/Desktop/Workspace/ReadGraph"
git add "90_Templates/_批次產生骨架.md"
git commit -m "Add self-deleting trigger template for batch stub generation"
```

---

## Task 4: Feynman_Zettel_Template.md 加入 status: stub 欄位

**Files:**
- Modify: `90_Templates/Feynman_Zettel_Template.md`

**Interfaces:**
- Consumes：無
- Produces：手動建卡流程產生的卡片也統一帶有 `status: stub` 欄位，與批次產生的卡片欄位結構一致，供 Task 5 的 Dashboard 查詢統一辨識

- [ ] **Step 1: 驗證目前檔案沒有 status 欄位**

Run: `grep -c "^status:" "90_Templates/Feynman_Zettel_Template.md" || echo 0`
Expected: `0`

- [ ] **Step 2: 加入 status: stub 欄位**

在 `90_Templates/Feynman_Zettel_Template.md` 第 13-14 行之間插入一行，把：
```
---
type: feynman-card
source: "[[<%* tR += bookNote.basename %>]]"
```
改成：
```
---
type: feynman-card
status: stub
source: "[[<%* tR += bookNote.basename %>]]"
```

- [ ] **Step 3: 驗證欄位已加入，且其他內容沒被誤動**

Run:
```bash
grep -c "^status: stub$" "90_Templates/Feynman_Zettel_Template.md"
grep -c "tp.file.move" "90_Templates/Feynman_Zettel_Template.md"
grep -c "所屬主題 MOC" "90_Templates/Feynman_Zettel_Template.md"
```
Expected: 三個都輸出 `1`

- [ ] **Step 4: Commit**

```bash
cd "c:/Users/88698/Desktop/Workspace/ReadGraph"
git add 90_Templates/Feynman_Zettel_Template.md
git commit -m "Add status: stub field to manual Feynman card template"
```

---

## Task 5: 99_Dashboard.md 新增「已建骨架、尚未費曼轉譯」查詢

**Files:**
- Modify: `99_Dashboard.md`

**Interfaces:**
- Consumes：Task 4（與 Task 2 的 `buildStubFrontmatter`）產生的卡片 frontmatter `status` 欄位
- Produces：新的儀表板區塊，純 Dataview 語法（不需要 DataviewJS，因為只讀 frontmatter）

- [ ] **Step 1: 驗證目前檔案沒有這個區塊**

Run: `grep -c "已建骨架" "99_Dashboard.md" || echo 0`
Expected: `0`

- [ ] **Step 2: 在檔案結尾新增查詢區塊**

在 `99_Dashboard.md` 現有內容（結尾是第 46 行 `-->`）之後，新增：
```markdown

## 已建骨架、尚未費曼轉譯

```dataview
TABLE source AS "來源書籍", tags AS "標籤"
FROM "01_Cards"
WHERE status = "stub"
SORT date DESC
```
```

- [ ] **Step 3: 驗證新區塊存在，且原本方案 A/B 查詢沒被誤動**

Run:
```bash
grep -c "已建骨架、尚未費曼轉譯" "99_Dashboard.md"
grep -c 'WHERE status = "stub"' "99_Dashboard.md"
grep -c "kobo-id 精確比對" "99_Dashboard.md"
grep -c "前 60 字模糊比對" "99_Dashboard.md"
```
Expected: 四個都輸出 `1`

- [ ] **Step 4: Commit**

```bash
cd "c:/Users/88698/Desktop/Workspace/ReadGraph"
git add 99_Dashboard.md
git commit -m "Add stub-status query section to dashboard"
```

---

## Task 6: README.md 新增 Grok API 設定章節與操作流程更新

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes：無
- Produces：完整的人類可讀操作手冊，涵蓋 Grok API 設定、Templater 新增設定項、更新後的日常操作流程

- [ ] **Step 1: 驗證目前檔案沒有 Grok 相關內容**

Run: `grep -c "Grok" "README.md" || echo 0`
Expected: `0`

- [ ] **Step 2: 修改 2.2 Templater 章節，加入第二組快捷鍵與 Script folder 設定**

把：
```
### 2.2 Templater

- 範本資料夾設定為 `90_Templates`
- 在「Hotkeys」設定裡，把「Templater: Create new note from template」綁一組快捷鍵（建議 `Ctrl+Alt+F`），選擇範本時指向 `Feynman_Zettel_Template.md`；範本本身會自動把新筆記移動到 `01_Cards`，不需要另外設定輸出資料夾
```
改成：
```
### 2.2 Templater

- 範本資料夾設定為 `90_Templates`
- 在「Hotkeys」設定裡，把「Templater: Create new note from template」綁一組快捷鍵（建議 `Ctrl+Alt+F`），選擇範本時指向 `Feynman_Zettel_Template.md`；範本本身會自動把新筆記移動到 `01_Cards`，不需要另外設定輸出資料夾
- 再綁第二組快捷鍵（建議 `Ctrl+Alt+B`），選擇範本時指向 `_批次產生骨架.md`——這是「批次產生骨架」的觸發鍵
- 「Script files folder location」設定為 `90_Templates/scripts`（啟用 Grok 自動分類功能才需要，見 2.4 節；沒設定這項，批次產生骨架的快捷鍵會找不到對應的程式邏輯而無法執行）
```

- [ ] **Step 3: 在 2.3 Dataview 章節之後、3. 首次使用之前，新增 2.4 章節**

在：
```
### 2.3 Dataview

- 在 Dataview 設定裡開啟「Enable JavaScript Queries」（DataviewJS），`99_Dashboard.md` 的待內化清單需要這個功能才能運作

## 3. 首次使用：安全測試 SOP（務必先做）
```
中間插入：
```
### 2.4 設定 Grok API 自動分類（選用）

這個功能可以讓「批次產生骨架」在建立卡片時，自動呼叫 Grok（xAI）AI 幫每條劃線判斷主題標籤。**不設定也完全不影響其他功能**，只是卡片的 `tags` 欄位會留空（標記為「未分類」），需要自己手動填。

1. 到 [xAI 後台](https://x.ai) 申請一組 API 金鑰
2. 在 vault 根目錄（`ReadGraph/`）手動建立一個叫 `.env` 的檔案，內容只放一行：
   ```
   GROK_API_KEY=你的金鑰
   ```
3. **這個檔案已經被 `.gitignore` 排除，絕對不要用 `git add -f` 強制加入版本控制**

**隱私提醒**：啟用這個功能後，你的劃線原文與書名會被傳送到 xAI 的伺服器做分類判斷，這是使用任何第三方 AI 服務都無法避免的資料外流。如果不能接受，就不要建立 `.env` 檔案，批次產生骨架依然可以正常運作，只是不會自動分類。

**費用提醒**：Grok API 依 token 用量計費，個人使用量級通常是很小的費用，但建議留意 xAI 後台的用量紀錄。
```

- [ ] **Step 4: 更新 4. 日常操作流程表，加入自動骨架化階段**

把：
```
## 4. 日常操作流程

| 階段 | 頻率 | 操作 |
|---|---|---|
| 🐜 蒐集 | 想同步時隨時 | Kobo 接 USB → Obsidian 執行 Kobo Highlights Importer → `00_Inbox` 自動更新 |
| 🐛 內化 | 建議每週固定時段 | 打開 `99_Dashboard.md` 看待內化清單 → 到對應 `00_Inbox` 書籍筆記複製劃線原文與 kobo-id → 觸發 Templater 快捷鍵建卡（輸出到 `01_Cards`） |
| 🕸️ 連結 | 建卡當下順手做 | 在卡片內文用 `[[概念]]` 連結相關／對立概念；未建立的 MOC 連結會顯示紅字，之後統一處理 |
| 🐝 創造 | 卡片累積到一定量後 | 打開對應 `02_MOC/xxx MOC.md`，用 Dataview 表格檢視該主題所有卡片 → 到 `03_Output` 新建文章筆記整理成大綱 |
```
改成：
```
## 4. 日常操作流程

| 階段 | 頻率 | 操作 |
|---|---|---|
| 🐜 蒐集 | 想同步時隨時 | Kobo 接 USB → Obsidian 執行 Kobo Highlights Importer → `00_Inbox` 自動更新 |
| 🤖 自動骨架化 | 蒐集完隨手做 | 按下「批次產生骨架」快捷鍵（`Ctrl+Alt+B`）→ 系統自動為每條新劃線建立卡片（`01_Cards`，`status: stub`），並依是否設定 Grok API 自動或不自動填標籤 → 跳出「成功 N／未分類 M」通知 |
| 🐛 內化 | 建議每週固定時段 | 打開 `99_Dashboard.md`「已建骨架、尚未費曼轉譯」清單 → 選一張卡片打開 → 手動撰寫費曼轉譯與個人經驗錨點 → 完成後把 `status` 改成 `done` |
| 🕸️ 連結 | 建卡當下順手做 | 在卡片內文用 `[[概念]]` 連結相關／對立概念；未建立的 MOC 連結會顯示紅字，之後統一處理 |
| 🐝 創造 | 卡片累積到一定量後 | 打開對應 `02_MOC/xxx MOC.md`，用 Dataview 表格檢視該主題所有卡片 → 到 `03_Output` 新建文章筆記整理成大綱 |

原本手動一次填完整張卡的 `Feynman_Zettel_Template.md` 流程仍然保留（快捷鍵 `Ctrl+Alt+F`），適合沒有對應 Kobo 劃線、想直接記錄一個獨立想法的情境；用這個流程新建立的卡片一樣預設 `status: stub`。
```

- [ ] **Step 5: 更新 5. 資料夾說明，補充 scripts 子資料夾**

把：
```
- `90_Templates/`：Templater 與 Kobo 匯入的範本檔案
```
改成：
```
- `90_Templates/`：Templater 與 Kobo 匯入的範本檔案；`90_Templates/scripts/` 放批次產生骨架與 Grok 分類的程式邏輯（`generate_stubs.js`、`lib/stub_logic.js`、`tag_vocabulary.json`）
```

- [ ] **Step 6: 驗證所有修改都正確套用**

Run:
```bash
grep -c "Script files folder location" "README.md"
grep -c "設定 Grok API 自動分類" "README.md"
grep -c "GROK_API_KEY=你的金鑰" "README.md"
grep -c "自動骨架化" "README.md"
grep -c "已建骨架、尚未費曼轉譯" "README.md"
grep -c "放批次產生骨架與 Grok 分類的程式邏輯" "README.md"
```
Expected: 六個都輸出 `1`

- [ ] **Step 7: Commit**

```bash
cd "c:/Users/88698/Desktop/Workspace/ReadGraph"
git add README.md
git commit -m "Document Grok API setup and update daily workflow for batch stub generation"
```

---

## Task 7: 最終驗證 + 人工端對端測試檢查清單

**Files:**
- 無新檔案（純驗證任務）

**Interfaces:**
- Consumes：Task 1-6 全部產出
- Produces：確認自動化部分正確、並列出使用者必須手動在 Obsidian 裡完成的驗證步驟

- [ ] **Step 1: 重新執行全部單元測試，確認沒有互相破壞**

Run:
```bash
cd "c:/Users/88698/Desktop/Workspace/ReadGraph"
node "90_Templates/scripts/lib/stub_logic.test.js"
node "90_Templates/scripts/generate_stubs.test.js"
```
Expected: 兩個指令都印出全部 `PASS` 與通過訊息，exit code 都是 0

- [ ] **Step 2: 檔案樹與 git 狀態驗證**

Run:
```bash
cd "c:/Users/88698/Desktop/Workspace/ReadGraph"
find 90_Templates -type f | sort
git status --porcelain
```
Expected 檔案清單應包含：
```
90_Templates/Feynman_Zettel_Template.md
90_Templates/Kobo_Inbox_Template.eta
90_Templates/_批次產生骨架.md
90_Templates/scripts/generate_stubs.js
90_Templates/scripts/generate_stubs.test.js
90_Templates/scripts/lib/stub_logic.js
90_Templates/scripts/lib/stub_logic.test.js
90_Templates/scripts/tag_vocabulary.json
```
`git status --porcelain` 應無任何輸出（working tree 乾淨）

- [ ] **Step 3: 確認 git log 顯示每個任務都有獨立 commit**

Run: `git log --oneline -7`
Expected: 由新到舊依序對應 Task 6 → Task 5 → Task 4 → Task 3 → Task 2 → Task 1 的 commit（訊息內容比對即可，不要求 exact SHA）

**完成後仍需使用者手動做的事（本計畫做不到，需明確告知使用者）：**

1. 在 Obsidian 的 Templater 設定裡，把「Script files folder location」設為 `90_Templates/scripts`，並確認 Templater 沒有跳出任何載入腳本失敗的錯誤（開發者工具 Console 檢查）
2. 綁定第二組快捷鍵（建議 `Ctrl+Alt+B`）到 `_批次產生骨架.md`
3. **API 串接驗證**（比照原始設計的安全測試精神）：依 README 2.4 節設定好 `.env` 後，先手動用一條真實劃線跑一次批次產生骨架，打開 Obsidian 開發者工具 Console 確認沒有錯誤、產生的卡片 `tags` 欄位有正確填入 Grok 回傳的標籤文字。若 Grok API 的實際回應格式與本計畫假設的 OpenAI 相容格式不同，需要回頭調整 `stub_logic.js` 的 `parseGrokTagFromResponse`（並補上對應的單元測試案例，遵循本計畫 Task 1 的 TDD 模式）
4. 確認完全沒有 `.env`（或先暫時改名 `.env` 測試）時，批次產生骨架仍然正常運作、只是標籤都變成「未分類」，驗證優雅降級行為
5. 確認新產生的骨架卡片會出現在 `99_Dashboard.md`「已建骨架、尚未費曼轉譯」清單裡；手動把其中一張卡片的 `status` 改成 `done` 後，確認它從清單消失
