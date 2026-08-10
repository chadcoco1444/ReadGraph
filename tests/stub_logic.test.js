const assert = require("assert");
const {
  parseInboxHighlights,
  findPendingHighlights,
  sanitizeStubFilename,
  buildGrokRequestBody,
  parseGrokTagFromResponse,
  buildStubFrontmatter,
} = require("../90_Templates/scripts/stub_logic.js");

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

test("findPendingHighlights: 同一批次內重複出現的 kobo-id 只保留第一次", () => {
  const inboxFiles = [
    { basename: "書A", content: `> 重複劃線\n> %%kobo-id:dup-1%%\n` },
    { basename: "書B", content: `> 重複劃線\n> %%kobo-id:dup-1%%\n` },
  ];
  const pending = findPendingHighlights(inboxFiles, new Set());
  assert.strictEqual(pending.length, 1);
  assert.strictEqual(pending[0].bookBasename, "書A");
});

test("sanitizeStubFilename: 截斷長度並清掉不合法字元", () => {
  const name = sanitizeStubFilename('這是一段包含"引號"與/斜線與\\反斜線的很長很長的劃線內容標題文字', []);
  assert.ok(name.length <= 20);
  assert.ok(!/[\\/:*?"<>|#^\[\]]/.test(name));
});

test("sanitizeStubFilename: 檔名衝突時自動加序號", () => {
  const name1 = sanitizeStubFilename("重複的劃線內容", []);
  const name2 = sanitizeStubFilename("重複的劃線內容", [name1]);
  assert.notStrictEqual(name1, name2);
  assert.ok(name2.includes(name1));
});

test("sanitizeStubFilename: 排除會破壞 wikilink 的字元", () => {
  const name = sanitizeStubFilename("包含#井字號與^插入符號與[中括號]的內容", []);
  assert.ok(!/[#^\[\]]/.test(name));
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

test("parseGrokTagFromResponse: 標籤過長時丟出錯誤", () => {
  const response = { choices: [{ message: { content: "這是一個非常非常非常長的標籤文字超過限制" } }] };
  assert.throws(() => parseGrokTagFromResponse(response));
});

test("parseGrokTagFromResponse: 標籤包含危險字元時丟出錯誤", () => {
  assert.throws(() => parseGrokTagFromResponse({ choices: [{ message: { content: "投資:心態" } }] }));
  assert.throws(() => parseGrokTagFromResponse({ choices: [{ message: { content: "[[投資心態]]" } }] }));
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

test("buildStubFrontmatter: 劃線原文含反斜線時不會破壞 YAML", () => {
  const md = buildStubFrontmatter({
    bookBasename: "書",
    koboId: "1",
    quote: '含反斜線\\與引號"的內容',
    tag: "測試",
    dateIso: "2026-08-10 00:00",
  });
  assert.ok(!md.includes('source_quote: "含反斜線\\'));
});

console.log("\n全部 stub_logic.js 測試通過。");
