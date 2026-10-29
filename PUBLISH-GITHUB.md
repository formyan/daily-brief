# 发布到 GitHub

项目位置：`G:\deepseekwork\daily-brief`

## 1. 先确认没有上传密钥

项目根目录的 `.env` 保存了 DeepSeek API Key，已被 `.gitignore` 排除。**不要**把它提交到 GitHub，也不要把 key 写进 README、脚本或截图。

在 PowerShell 里执行：

```powershell
cd G:\deepseekwork\daily-brief

# 初始化后确认 .env 被忽略
git init
git check-ignore -v .env
```

如果第二条命令没有输出，说明 `.env` 没有被忽略，先检查 `.gitignore` 是否包含 `.env`。

再看一眼准备提交的文件：

```powershell
git add .
git status --short
```

确认列表里**没有** `.env`、`data/cache/`、`data/logs/` 后再继续。

## 2. 在 GitHub 创建空仓库

1. 打开 <https://github.com/new>
2. Repository name 填 `daily-brief`
3. 选择 Public 或 Private
4. **不要**勾选 “Add a README file”“Add .gitignore”“Choose a license”
5. 点击 **Create repository**
6. 复制仓库地址，例如：

```text
https://github.com/<你的用户名>/daily-brief.git
```

## 3. 配置 Git 身份（只需一次）

```powershell
git config --global user.name "你的名字"
git config --global user.email "你的GitHub邮箱"
```

如果不想公开真实邮箱，可以使用 GitHub 提供的 noreply 邮箱：
`<id>+<username>@users.noreply.github.com`。

## 4. 提交并推送

```powershell
cd G:\deepseekwork\daily-brief

git init
git add .
git commit -m "Initial commit: Daily Brief"
git branch -M main
git remote add origin https://github.com/<你的用户名>/daily-brief.git
git push -u origin main
```

第一次推送时，Git Credential Manager 通常会弹出浏览器登录 GitHub。登录即可；不要把密码或 token 直接写进仓库地址。

如果提示 `remote origin already exists`：

```powershell
git remote set-url origin https://github.com/<你的用户名>/daily-brief.git
git push -u origin main
```

## 5. 推送后检查

在 GitHub 仓库首页确认：

- 能看到 `README.md`、`server.mjs`、`public/`、`src/`
- **看不到** `.env`
- 看不到 `data/cache/`、`data/logs/`

本地再检查一次：

```powershell
git ls-files | Select-String '^\.env$'
```

这条命令应该没有输出。

## 6. 以后更新代码

```powershell
cd G:\deepseekwork\daily-brief
git add .
git commit -m "Update daily brief"
git push
```

如果当天生成了新一期，`data/editions/` 和 `data/media/covers/` 会一起更新。

## 7. 重要：GitHub 仓库不等于网站上线

这个项目需要 Node.js 进程、定时器和 `/api/*` 接口，**不能直接用 GitHub Pages 托管**。GitHub Pages 只能放静态文件。

要得到公网可访问的网站，可选：

### Render / Railway / Fly.io / VPS

以 Render 为例：

- 新建 **Web Service**，连接这个 GitHub 仓库；
- Build Command：`npm install`（项目没有依赖，执行也无妨）
- Start Command：`node server.mjs`
- 环境变量至少设置：

```text
HOST=0.0.0.0
LLM_PROVIDER=openai
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_MODEL=deepseek-chat
LLM_API_KEY=你的key
```

- 平台会自动提供 `PORT`，程序会读取它；
- 需要持久化 `data/`，否则重新部署后往期和收藏数据会丢；在平台挂载 Persistent Disk 到项目的 `data` 目录。

注意：免费实例通常会休眠，**18:30 的内部定时器不会在休眠时运行**。需要常驻实例，或用外部定时任务触发 `/api/refresh`。

### 只备份代码

如果只需要把源码放到 GitHub，不需要公网访问，做到第 5 步即可。

## 8. 如果密钥误提交了

即使之后删掉文件，Git 历史里仍然有 key。立即：

1. 到 DeepSeek 控制台撤销/轮换 key；
2. 在 GitHub 仓库设置中确认 key 不再有效；
3. 必要时用 `git filter-repo` 清理历史。

不要只执行 `git rm .env` 就认为安全。

## 9. 建议的仓库设置

- About 描述：`每天 18:30 更新的多信源交叉核验国际简报`
- Topics：`news`、`rss`、`nodejs`、`pwa`、`deepseek`、`llm`
- 如果仓库公开，建议加一个 `LICENSE`（MIT 或私有版权声明）
- 新闻摘要和图片来自第三方，公开部署时请保留来源链接并遵守各信源条款
