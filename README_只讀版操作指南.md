
# 黑底PWA｜只讀版（部署指南）

1) 把這個資料夾所有檔案上傳到 GitHub repo 根目錄（不是 zip）。
2) 進 Settings → Pages → Source: Deploy from a branch → Branch: main / (root) → Save。
3) 打開網址 `https://你的帳號.github.io/你的repo/?v=1` 驗收。

預設入口表：
https://docs.google.com/spreadsheets/d/e/2PACX-1vQYpmaztvrq3vdo8VeDhyP1yUYtEWjHeZyN9cN-0rg2PvqjdLfLnCQffKWUhja6aXo3OXcSmNoffPxR/pub?gid=0&single=true&output=csv

若要更換入口表，於瀏覽器 Console 執行：
localStorage.setItem('entry_csv_url', '你的入口.csv'); location.reload();
