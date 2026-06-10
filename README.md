# Funds

一个本地运行的基金持仓控制台，支持桌面 Web 版和 Android App。

- Frontend: React, TypeScript, Tailwind CSS, Recharts, Vite
- Backend: Python, FastAPI, httpx（桌面 Web 可选）
- Mobile: Capacitor Android，本地 TypeScript 服务层，无需云端服务
- Data: 东方财富基金/行情接口，可选 Finnhub 补充美股基础财务指标

## 功能

- 添加基金持仓，查看组合市值、今日收益、持有收益
- 查看基金详情、历史收益曲线、重仓股票
- 重仓股票展示 PE、PB、PS、PEG、ROE、市值、行业等指标
- 基于交易流水和历史净值回算组合收益
- 支持可选 Finnhub API key 补充美股 PS/PEG 等数据
- Android App 可不依赖云端服务，直接在本机调用外部数据接口

## 桌面 Web 运行

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

## Android App

移动端使用 Capacitor，把 React 应用打包成 Android 项目。移动模式会走 `frontend/src/services/` 里的本地 TypeScript 服务层，不需要启动 FastAPI。

本机 Android 构建环境约定：

```text
JDK 21:      ~/.local/share/funds-tools/jdk-21
Gradle:      ~/.local/share/funds-tools/gradle-8.14.3
Android SDK: ~/Android/Sdk
```

需要在 shell 中有：

```bash
export JAVA_HOME="$HOME/.local/share/funds-tools/jdk-21"
export ANDROID_HOME="$HOME/Android/Sdk"
export GRADLE_HOME="$HOME/.local/share/funds-tools/gradle-8.14.3"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$GRADLE_HOME/bin:$PATH"
```

首次打开 Android 工程：

```bash
cd frontend
npm install
npm run cap:sync
npm run cap:open
```

然后在 Android Studio 里构建或运行到手机。

### 打包 APK

方式一：Android Studio

1. 打开 `frontend/android`
2. 连接手机并开启 USB 调试
3. 点击 Run 可以直接安装到手机
4. 需要 APK 文件时，选择 `Build > Build Bundle(s) / APK(s) > Build APK(s)`

方式二：命令行 debug APK

```bash
cd frontend
npm run apk:debug
```

生成文件位置：

```text
frontend/android/app/build/outputs/apk/debug/app-debug.apk
```

把这个 APK 传到手机后允许“安装未知来源应用”即可安装。debug APK 适合自用测试；正式发布需要生成 release APK/AAB 并配置签名。

命令行直接安装到已连接手机：

```bash
cd frontend
npm run cap:sync
cd android
gradle installDebug
```

更详细的 Web App 转 Android App 方案笔记在本地文档 `ANDROID_APP_CONVERSION.md`，该文件默认不提交到 Git。

移动端数据保存在手机本机 WebView 存储中：

- 交易流水：`localStorage`
- Finnhub API Key：设置页填写并保存在本机

## Finnhub

桌面 Web 版如需补充美股 PS、PEG、利润率等指标：

```bash
cp backend/.env.example backend/.env
```

然后编辑 `backend/.env`：

```bash
FINNHUB_API_KEY=your_key_here
```

`.env` 不应提交到 Git。

Android App 版在页面右上角进入“设置”，填写 Finnhub API Key。

## 数据

桌面 Web 版本地数据保存在 `backend/data/`：

- `portfolio.json`: 旧持仓格式，会自动迁移
- `transactions.json`: 交易流水

这些文件包含个人持仓信息，默认不会提交。

移动 App 版第一阶段使用本机 `localStorage` 保存交易流水和设置。它适合个人使用；如果后续要更稳，可以迁移到 Capacitor SQLite。
