# ReadGraph — Kobo 讀書筆記與費曼內化系統

以 Obsidian 為核心的個人知識管理 Vault：Kobo 劃線（蒐集）→ 費曼內化（轉譯）→ 雙向連結（連結）→ 主題輸出（創造）。

## 0. 開啟 Vault（在安裝外掛之前）

1. 在 Obsidian 啟動畫面選擇「Open folder as vault」，選取 `ReadGraph/` 這個資料夾
2. 進入「設定 → Community plugins」，如果看到「Restricted Mode」（安全模式）是開啟的，先關閉它——安全模式關閉前無法瀏覽或安裝任何外掛
3. 安裝完下面三個外掛後，記得個別把它們切換成「已啟用」（Obsidian 安裝外掛後預設不會自動啟用）

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
- 在「Hotkeys」設定裡，把「Templater: Create new note from template」綁一組快捷鍵（建議 `Ctrl+Alt+F`），選擇範本時指向 `Feynman_Zettel_Template.md`；範本本身會自動把新筆記移動到 `01_Cards`，不需要另外設定輸出資料夾
- 再綁第二組快捷鍵（建議 `Ctrl+Alt+B`），選擇範本時指向 `_批次產生骨架.md`——這是「批次產生骨架」的觸發鍵
- 「Script files folder location」設定為 `90_Templates/scripts`（啟用 Grok 自動分類功能才需要，見 2.4 節；沒設定這項，批次產生骨架的快捷鍵會找不到對應的程式邏輯而無法執行）

### 2.3 Dataview

- 在 Dataview 設定裡開啟「Enable JavaScript Queries」（DataviewJS），`99_Dashboard.md` 的待內化清單需要這個功能才能運作

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

## 3. 首次使用：安全測試 SOP（務必先做）

因為 Kobo Highlights Importer 官方文件沒有明確保證「重複匯入時是否會覆蓋既有筆記／`kobo-id` 是否維持穩定」，正式依賴這套系統前，先做一次測試：

1. 把 Kobo 用 USB 接上電腦，在 Obsidian 執行一次 Kobo Highlights Importer 同步。
2. 打開 `00_Inbox` 裡任一本書的筆記，確認每條劃線後方都出現一行 `%%kobo-id:編號%%`（在編輯模式看得到，閱讀模式會隱藏，這是正常的）。
3. 不要改動任何 `00_Inbox` 裡的檔案，直接再執行一次同步。
4. 再次打開同一本書的筆記，確認：
   - 同一條劃線的 `kobo-id` 編號**跟第一次完全相同**
   - 沒有同一條劃線被重複貼兩次

**結果 A（通過）**：不用做任何事，`99_Dashboard.md` 裡的「方案 A」查詢直接可用。

**結果 B（未通過）**：打開 `99_Dashboard.md`，把「方案 A」那個 ` ```dataviewjs ` 程式碼區塊整段刪除，然後把「方案 B」外面包住的 `<!-- -->` HTML 註解拿掉（讓那段 dataviewjs 變成真正生效的程式碼區塊）。之後費曼卡片的 `source_id` 欄位可以留空不填，只填 `source_quote`（劃線原文前 60 字）即可。

## 4. 日常操作流程

| 階段 | 頻率 | 操作 |
|---|---|---|
| 🐜 蒐集 | 想同步時隨時 | Kobo 接 USB → Obsidian 執行 Kobo Highlights Importer → `00_Inbox` 自動更新 |
| 🤖 自動骨架化 | 蒐集完隨手做 | 按下「批次產生骨架」快捷鍵（`Ctrl+Alt+B`）→ 系統自動為每條新劃線建立卡片（`01_Cards`，`status: stub`），並依是否設定 Grok API 自動或不自動填標籤 → 跳出「成功 N／未分類 M」通知 |
| 🐛 內化 | 建議每週固定時段 | 打開 `99_Dashboard.md`「已建骨架、尚未費曼轉譯」清單 → 選一張卡片打開 → 手動撰寫費曼轉譯與個人經驗錨點 → 完成後把 `status` 改成 `done` |
| 🕸️ 連結 | 建卡當下順手做 | 在卡片內文用 `[[概念]]` 連結相關／對立概念；未建立的 MOC 連結會顯示紅字，之後統一處理 |
| 🐝 創造 | 卡片累積到一定量後 | 打開對應 `02_MOC/xxx MOC.md`，用 Dataview 表格檢視該主題所有卡片 → 到 `03_Output` 新建文章筆記整理成大綱 |

原本手動一次填完整張卡的 `Feynman_Zettel_Template.md` 流程仍然保留（快捷鍵 `Ctrl+Alt+F`），適合沒有對應 Kobo 劃線、想直接記錄一個獨立想法的情境；用這個流程新建立的卡片一樣預設 `status: stub`。

## 5. 資料夾說明

- `00_Inbox/`：Kobo 原始劃線，**唯讀**，外掛每次同步都可能整份重寫，不要在這裡手動編輯任何內容
- `01_Cards/`：費曼內化後的原子卡片，檔名＝中文概念名稱
- `02_MOC/`：主題地圖，複製 `投資心態 MOC.md` 當範本建立新主題；**MOC 檔名必須完全等於「標籤名稱 + 空格 + MOC.md」**（例如標籤 `投資心態` 對應 `投資心態 MOC.md`），否則費曼卡片自動產生的 `[[<標籤> MOC]]` 反向連結會連不上
- `03_Output/`：文章大綱／專案整理成果
- `90_Templates/`：Templater 與 Kobo 匯入的範本檔案；`90_Templates/scripts/` 放批次產生骨架與 Grok 分類的程式邏輯（`generate_stubs.js`、`lib/stub_logic.js`、`tag_vocabulary.json`）
- `99_Dashboard.md`：首頁儀表板，待內化清單

## 6. 已知範圍外事項

- 自訂 Python 同步腳本（`KoboReader.sqlite` 直接讀取）：僅在安全測試失敗且方案 B 也不夠用時才需要，屆時另外規劃
- `03_Output` 匯出到部落格／社群媒體等外部平台的格式轉換
- 自動偵測 USB 插入並觸發同步
