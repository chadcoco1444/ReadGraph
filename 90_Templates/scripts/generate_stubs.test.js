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
