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
