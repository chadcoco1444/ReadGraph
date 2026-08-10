"use strict";

const VOCAB_PATH = "90_Templates/scripts/tag_vocabulary.json";
const INBOX_FOLDER = "00_Inbox";
const CARDS_FOLDER = "01_Cards";
const GROK_ENDPOINT = "https://api.x.ai/v1/chat/completions";
const BATCH_CAP = 50;

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

function defaultFetchViaRequestUrl(requestUrlFn) {
  return async function (url, options) {
    const res = await requestUrlFn({
      url,
      method: options.method,
      headers: options.headers,
      body: options.body,
      throw: false,
    });
    return {
      ok: res.status >= 200 && res.status < 300,
      status: res.status,
      json: async () => res.json,
    };
  };
}

async function classifyTag(fetchFn, stubLogic, apiKey, highlightText, bookTitle, vocabulary) {
  const body = stubLogic.buildGrokRequestBody(highlightText, bookTitle, vocabulary);
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
  return stubLogic.parseGrokTagFromResponse(json);
}

async function generateStubs(tp, deps = {}) {
  const app = tp.app;
  const stubLogic = deps.stubLogic || tp.user.stub_logic;
  const adapter = deps.adapter || app.vault.adapter;
  const fetchFn =
    deps.fetch ||
    ((url, options) => defaultFetchViaRequestUrl(require("obsidian").requestUrl)(url, options));
  const notify = deps.notify || ((msg) => new (require("obsidian").Notice)(msg));
  const nowFn = deps.now || (() => tp.date.now("YYYY-MM-DD HH:mm"));

  const allFiles = app.vault.getMarkdownFiles();
  const inboxFiles = allFiles.filter((f) => f.path.startsWith(INBOX_FOLDER + "/"));
  const cardFiles = allFiles.filter((f) => f.path.startsWith(CARDS_FOLDER + "/"));

  const inboxData = [];
  for (const file of inboxFiles) {
    inboxData.push({ basename: file.basename, content: await app.vault.read(file) });
  }

  const existingSourceIds = new Set();
  const existingCardFilenames = [];
  for (const file of cardFiles) {
    existingCardFilenames.push(file.basename);
    let sourceId;
    const cache = app.metadataCache.getFileCache(file);
    if (cache && cache.frontmatter && cache.frontmatter.source_id !== undefined) {
      sourceId = cache.frontmatter.source_id;
    } else {
      const raw = await app.vault.cachedRead(file);
      const m = raw.match(/^source_id:\s*(.+)$/m);
      if (m) sourceId = m[1].trim();
    }
    if (sourceId !== undefined && sourceId !== null) {
      existingSourceIds.add(String(sourceId));
    }
  }

  const allPending = stubLogic.findPendingHighlights(inboxData, existingSourceIds);
  const pending = allPending.slice(0, BATCH_CAP);
  const remaining = allPending.length - pending.length;

  if (pending.length === 0) {
    notify("沒有新的待處理劃線，全部都已建卡。");
    return { created: 0, classified: 0, fallback: 0, failed: 0 };
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
  let failedCount = 0;
  const usedFilenames = existingCardFilenames.slice();

  for (const item of pending) {
    let tag = "未分類";
    if (apiKey) {
      try {
        tag = await classifyTag(fetchFn, stubLogic, apiKey, item.quote, item.bookBasename, vocabulary);
        if (!vocabulary.includes(tag)) vocabulary.push(tag);
        successCount++;
      } catch (e) {
        tag = "未分類";
        fallbackCount++;
        console.error("Grok 分類失敗：", e.message);
      }
    } else {
      fallbackCount++;
    }

    try {
      const filename = stubLogic.sanitizeStubFilename(item.quote, usedFilenames);
      usedFilenames.push(filename);

      const content = stubLogic.buildStubFrontmatter({
        bookBasename: item.bookBasename,
        koboId: item.koboId,
        quote: item.quote,
        tag,
        dateIso: nowFn(),
      });

      await app.vault.create(`${CARDS_FOLDER}/${filename}.md`, content);
    } catch (e) {
      failedCount++;
      console.error("建立卡片失敗：", e.message);
    }
  }

  try {
    await adapter.write(VOCAB_PATH, JSON.stringify(vocabulary, null, 2));
  } catch (e) {
    console.error("寫入標籤詞庫失敗：", e.message);
  }

  const remainingNote = remaining > 0 ? `（還有 ${remaining} 條待下次處理）` : "";
  notify(`本次共處理 ${pending.length} 條劃線，成功分類 ${successCount} 條，${fallbackCount} 條標記為未分類，${failedCount} 條建立失敗。${remainingNote}`);
  return { created: pending.length - failedCount, classified: successCount, fallback: fallbackCount, failed: failedCount };
}

module.exports = generateStubs;
