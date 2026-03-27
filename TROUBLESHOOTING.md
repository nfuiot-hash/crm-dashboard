# 系統問題排查 SOP

本文件整理目前 `CRM / 庫存 / 報價` 三模組在本機、內網、外網部署時常見的問題與檢查方式。

## 1. 先判斷是哪一層有問題

### A. 頁面完全打不開
常見現象：
- `ERR_CONNECTION_REFUSED`
- `ERR_CONNECTION_TIMED_OUT`
- 白畫面 / 404

優先檢查：
1. `PM2` 是否有啟動 Node
2. `Nginx` 是否有啟動
3. `Cloudflare Tunnel / 外網入口` 是否正常
4. 瀏覽器是否只是舊分頁快取

### B. 首頁可開，但某模組不能進
常見現象：
- `CRM`、`庫存` 正常，`報價` 不能進
- 入口按鈕點擊沒反應

優先檢查：
1. 首頁 `home.html` 是否是最新版本
2. 按鈕是否為正確連結
3. `server.js` 是否有對應模組路由
4. 瀏覽器是否仍停留在舊快取頁面

### C. 頁面可開，但資料沒更新
常見現象：
- 新增 Google Sheets 資料後畫面沒變
- KPI 數值不是最新

優先檢查：
1. 是否已重新同步
2. Google Sheets 是否成功共享給 service account
3. 試算表格式是否為原生 Google Sheets

## 2. 快速檢查順序

### 第一步：先排除瀏覽器快取
遇到模組頁面異常時，先做：
1. 新開一個分頁再測一次
2. 或按 `Ctrl + F5`
3. 或用無痕視窗測試

這次報價入口問題，最後確認主要原因之一就是：
- 舊分頁保留了舊版快取
- 新開分頁後就恢復正常

## 3. 本機層檢查

### Node / Express 是否正常
測試：

```text
http://127.0.0.1:3000/
http://127.0.0.1:3000/crm.html
http://127.0.0.1:3000/inventory.html
http://127.0.0.1:3000/quotation.html
```

如果 `127.0.0.1:3000` 正常，代表：
- Node 程式正常
- 對應頁面路由正常

### PM2 是否正常

```powershell
pm2.cmd list
```

應確認：
- `crm-dashboard`
- `status = online`

如果不是 `online`，先重啟：

```powershell
pm2.cmd restart crm-dashboard
```

## 4. Nginx 層檢查

### 透過 80 port 測試
測試：

```text
http://127.0.0.1/
http://127.0.0.1/crm.html
http://127.0.0.1/inventory.html
http://127.0.0.1/quotation.html
```

判斷方式：
- `127.0.0.1:3000` 可開、`127.0.0.1` 不可開
- 代表 Node 正常，但 Nginx 沒接上

### Nginx 是否啟動
啟動：

```powershell
cd C:\nginx
.\nginx.exe
```

重新載入：

```powershell
cd C:\nginx
.\nginx.exe -s reload
```

注意：
- 如果出現 `OpenEvent(...ngx_reload...) failed`
- 通常代表 `Nginx` 根本還沒啟動
- 這時要用 `.\nginx.exe`，不是 `reload`

## 5. 路由層檢查

### 模組頁面無法進入時，確認 `server.js`
要確認是否有對應頁面路由，例如：

```js
app.get('/crm.html', ...)
app.get('/inventory.html', ...)
app.get('/quotation.html', ...)
```

以及 API 路由：

```js
app.use('/api/inventory', require('./inventoryRoutes'));
app.use('/api/quotation', require('./quotationRoutes'));
```

如果頁面檔存在，但 `server.js` 沒掛路由，入口還是會失敗。

## 6. 首頁入口檢查

### `home.html` 檢查重點
確認：
1. 檔案沒有亂碼
2. 沒有壞掉的 HTML 標記
3. 模組入口為正式連結

建議使用：

```html
<a class="link-btn primary" href="/crm.html">進入 CRM</a>
<a class="link-btn primary" href="/inventory.html">進入庫存功能</a>
<a class="link-btn primary" href="/quotation.html">進入報價功能</a>
```

不要依賴已損壞頁面裡不穩定的 `onclick` 行為。

## 7. Google Sheets 層檢查

### 權限問題
所有試算表都要共享給：

```text
id-390@marine-actor-491206-s4.iam.gserviceaccount.com
```

如果沒共享，常見錯誤是：
- `403 PERMISSION_DENIED`

### 文件格式問題
如果試算表不是原生 Google Sheets，可能會出現：
- `This operation is not supported for this document`

這時要先：
1. 開啟該檔案
2. `檔案 -> 另存為 Google 試算表`
3. 用新網址做串接

## 8. 外部入口層檢查

### Cloudflare Tunnel / 外網網址
如果本機可開，外部不可開：

1. 先確認：
   - `http://127.0.0.1/quotation.html`
   - `http://127.0.0.1/inventory.html`
   - `http://127.0.0.1/crm.html`

2. 若本機正常，外部異常
   - 再檢查 `cloudflared` 或外部入口是否仍指向舊狀態

### 常見判斷方式
- `127.0.0.1:3000` 可開：Node 正常
- `127.0.0.1` 可開：Nginx 正常
- 外部網址不可開：外部 tunnel / 入口問題

## 9. 這次實際遇到的問題總結

### 問題 1：首頁殘留亂碼與壞掉 HTML
影響：
- 畫面可顯示
- 但按鈕行為可能異常

### 問題 2：Nginx 沒有啟動
影響：
- `http://127.0.0.1:3000/quotation.html` 正常
- `http://127.0.0.1/quotation.html` 失敗

### 問題 3：瀏覽器舊分頁快取
影響：
- 明明服務端已更新
- 舊分頁還保留舊版入口狀態

解法：
- 新開分頁
- `Ctrl + F5`
- 無痕模式測試

## 10. 建議固定檢查清單

每次模組新增或修改後，依序做：
1. 測 `http://127.0.0.1:3000/模組頁`
2. 測 `http://127.0.0.1/模組頁`
3. 重啟 `PM2`
4. 確認 `Nginx` 已啟動
5. 新開瀏覽器分頁測試
6. 最後才測外部入口

## 11. 常用指令

### PM2

```powershell
pm2.cmd list
pm2.cmd restart crm-dashboard
pm2.cmd save
```

### Nginx

```powershell
cd C:\nginx
.\nginx.exe
.\nginx.exe -s reload
```

### 本機測試

```text
http://127.0.0.1:3000/
http://127.0.0.1/
```

