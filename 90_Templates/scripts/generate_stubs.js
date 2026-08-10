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
