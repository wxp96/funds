# Funds Web

一个本地运行的基金持仓 Web 控制台。

- Frontend: React, TypeScript, Tailwind CSS, Recharts, Vite
- Backend: Python, FastAPI, httpx
- Data: 东方财富基金/行情接口，可选 Finnhub 补充美股基础财务指标

## 功能

- 添加基金持仓，查看组合市值、今日收益、持有收益
- 查看基金详情、历史收益曲线、重仓股票
- 重仓股票展示 PE、PB、PS、PEG、ROE、市值、行业等指标
- 基于交易流水和历史净值回算组合收益
- 支持可选 Finnhub API key 补充美股 PS/PEG 等数据

## 运行

Backend:

```bash
cd backend
python3 -m pip install -r requirements.txt
python3 -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Frontend:

```bash
cd frontend
npm install
npm run dev -- --host 0.0.0.0
```

Open:

```text
http://localhost:5173/
```

## Finnhub

如需补充美股 PS、PEG、利润率等指标：

```bash
cp backend/.env.example backend/.env
```

然后编辑 `backend/.env`：

```bash
FINNHUB_API_KEY=your_key_here
```

`.env` 不应提交到 Git。

## 数据

本地数据保存在 `backend/data/`：

- `portfolio.json`: 旧持仓格式，会自动迁移
- `transactions.json`: 交易流水

这些文件包含个人持仓信息，默认不会提交。
