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
