<%*
const concept = await tp.system.prompt("概念名稱（將作為檔名）");
await tp.file.move("01_Cards/" + concept);
const bookNote = await tp.system.suggester(
  (f) => f.basename,
  app.vault.getMarkdownFiles().filter(f => f.path.startsWith("00_Inbox/"))
);
const koboId = await tp.system.prompt("貼上該劃線的 kobo-id 編號");
const quote = await tp.system.prompt("貼上劃線原文");
const excerpt = quote.slice(0, 60).replace(/"/g, "'").replace(/\r?\n/g, " ");
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
