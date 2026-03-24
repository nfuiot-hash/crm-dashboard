# CRM Dashboard

展示用 CRM 儀表板，資料來源為 Google Sheets 虛擬資料。

## 本機啟動

```bash
npm install
node server.js
```

開啟 `http://localhost:3000`

## 憑證設定

可使用以下兩種方式其一：

1. 本機放置 `credentials.json`
2. 設定環境變數 `GOOGLE_SERVICE_ACCOUNT_JSON`

若要變更試算表，可另外設定：

```bash
SPREADSHEET_ID=your_spreadsheet_id
PORT=3000
```

## Git 注意事項

- `credentials.json` 已排除，不會提交到 GitHub
- 展示資料為虛擬資料

## 部署重點

- 平台需提供 `PORT`
- 平台需提供 `GOOGLE_SERVICE_ACCOUNT_JSON`
- 啟動指令為 `node server.js`
