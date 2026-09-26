# Vercel + AWS EC2 + Nginx 部署指南

后续自动发布后端见 [Backend CD](BACKEND_CD.md)。本页用于初次部署和手动维护。

这些文件是部署准备，不代表服务器已建立或网站已上线。按顺序执行，每一步确认后再继续。
命令中的域名、Git commit 和服务器地址需要替换为你的真实值；不要把密码、API Key 或私钥发到聊天中。

## 1. 确认资源与版本

- 选择 AWS 区域、EC2 规格和磁盘前，先在自己的 AWS 账户核实费用、额度和试用条件。
- 本指南按一台新建 Ubuntu 24.04 LTS EC2 编写。不要直接覆盖已有服务器上的配置。
- 准备一个 API 子域名，例如 `api.your-domain.com`，DNS 指向 EC2 的稳定公网地址。
- 安全组：22 仅允许自己的 IP；80 和 443 用于 HTTP 验证与 HTTPS；**不开放 3000**。
- 审阅并测试本地代码后，由你决定本地 commit 和 push。下方服务器部署只使用你已确认的 commit。
- SQLite 位于 EBS 上。停止实例一般不会等于删除磁盘，但实例终止时卷可能随之删除；核对卷的删除设置，并保留离机备份。

安全组工作方式见 [AWS 文档](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-security-groups.html)。

## 2. 安装服务器基础工具与 Node

以下命令在 **EC2 的 SSH 终端**执行：

```bash
sudo apt-get update
sudo apt-get install -y nginx apache2-utils sqlite3 certbot git curl xz-utils build-essential python3
```

安装 Node 24 到系统可读路径，不能只放在个人的 `~/.nvm` 下，因为服务启用了 `ProtectHome`。
下面版本与本地验证版本一致；更新版本时应重新运行构建和测试。

```bash
mkdir -p ~/node-install
cd ~/node-install
node_release=v24.21.0
case "$(uname -m)" in
  x86_64) node_arch=x64 ;;
  aarch64) node_arch=arm64 ;;
  *) printf '%s\n' 'Unsupported architecture'; exit 1 ;;
esac
node_archive="node-${node_release}-linux-${node_arch}.tar.xz"
curl -fSLO "https://nodejs.org/dist/${node_release}/${node_archive}"
curl -fSLO "https://nodejs.org/dist/${node_release}/SHASUMS256.txt"
awk -v file="$node_archive" '$2 == file' SHASUMS256.txt | sha256sum --check -
```

只有校验显示 `OK` 时继续：

```bash
sudo install -d /opt/node-v24.21.0
sudo tar -xJf "$node_archive" -C /opt/node-v24.21.0 --strip-components=1
sudo ln -s /opt/node-v24.21.0/bin/node /usr/local/bin/node
sudo ln -s /opt/node-v24.21.0/bin/npm /usr/local/bin/npm
node --version
npm --version
```

如果链接已经存在，先检查现有安装，不要盲目覆盖。版本与校验说明见 [Node 官方下载页](https://nodejs.org/en/download)。

## 3. 部署一个明确的代码版本

```bash
sudo useradd --system --home-dir /var/lib/job-tracker --shell /usr/sbin/nologin jobtracker
sudo install -d -o jobtracker -g jobtracker -m 0700 /var/lib/job-tracker
sudo install -d -m 0755 /opt/job-tracker/releases
cd ~
git clone https://github.com/yunjie-nene/ai-assisted-job-tracker.git job-tracker-source
cd ~/job-tracker-source
git checkout YOUR_REVIEWED_COMMIT_SHA
release_id=$(git rev-parse HEAD)
sudo install -d -o "$USER" -g "$USER" "/opt/job-tracker/releases/$release_id"
git archive HEAD | tar -x -C "/opt/job-tracker/releases/$release_id"
cd "/opt/job-tracker/releases/$release_id/backend"
npm ci
npm run typecheck
DOTENV_CONFIG_PATH=/dev/null npm test
npm run build
npm prune --omit=dev
```

这里只从 Git 导出已提交文件，不复制本地 `.env`、数据库或 macOS 的 `node_modules`。
仓库为私有时，用你自己的受控 GitHub 登录方式拉取，不要将 token 嵌在 clone URL 中。

## 4. 配置服务环境与启动

```bash
sudo install -d -m 0700 /etc/job-tracker
sudo install -m 0600 "/opt/job-tracker/releases/$release_id/deploy/backend.env.example" /etc/job-tracker/backend.env
sudo nano /etc/job-tracker/backend.env
```

在服务器编辑器中填写 `GEMINI_API_KEY`。保留 `PORT=3000` 和
`DATABASE_PATH=/var/lib/job-tracker/job-tracker.db`。不把该文件添加到 Git，也不通过聊天或日志打印它。
这一步初次部署执行一次；以后发布不要用模板覆盖真实环境文件。

```bash
sudo ln -s "/opt/job-tracker/releases/$release_id" /opt/job-tracker/current
sudo install -m 0644 /opt/job-tracker/current/deploy/job-tracker.service /etc/systemd/system/job-tracker.service
sudo systemctl daemon-reload
sudo systemctl enable --now job-tracker
sudo systemctl status job-tracker --no-pager
curl --fail http://localhost:3000/health
```

预期 health 返回 `{"status":"ok"}`。后端仍绑定 literal `localhost`。
systemd 使用 `/usr/local/bin/node`；若你的系统安装路径不同，先修改 unit 的 `ExecStart`。
故障时检查 `journalctl -u job-tracker --since '10 minutes ago'`，分享日志前遮去个人信息。

## 5. 先取得 TLS 证书，再开放 API

先编辑 HTTP 引导配置中的 `api.example.com` 为真实 API 域名：

```bash
sudo install -d -m 0755 /var/www/letsencrypt
sudo cp /opt/job-tracker/current/deploy/nginx-http.conf.example /etc/nginx/sites-available/job-tracker
sudo nano /etc/nginx/sites-available/job-tracker
sudo ln -s /etc/nginx/sites-available/job-tracker /etc/nginx/sites-enabled/job-tracker
sudo nginx -t
sudo systemctl reload nginx
sudo certbot certonly --webroot -w /var/www/letsencrypt -d api.your-domain.com
```

引导配置只允许 ACME 验证路径，其他路径均返回 404，不会临时暴露无保护 API。
DNS 必须已生效，80 端口必须可达。证书申请过程见 [Certbot webroot 文档](https://eff-certbot.readthedocs.io/en/stable/using.html#webroot)。

创建个人登录账号。`htpasswd` 会交互式询问密码，不要通过命令参数传密码：

```bash
sudo htpasswd -cB /etc/nginx/job-tracker.htpasswd owner
sudo chown root:www-data /etc/nginx/job-tracker.htpasswd
sudo chmod 0640 /etc/nginx/job-tracker.htpasswd
```

`-c` 仅用于首次创建；以后修改密码时去掉 `-c`。
使用独立、强密码；这里是网站登录密码，不是 Gemini API Key。

```bash
sudo cp /opt/job-tracker/current/deploy/nginx.conf.example /etc/nginx/sites-available/job-tracker
sudo nano /etc/nginx/sites-available/job-tracker
```

把文件中所有 `api.example.com`（包括证书路径）替换为实际域名，然后验证并生效：

```bash
sudo nginx -t
sudo systemctl reload nginx
curl -i https://api.your-domain.com/health
curl --fail --user owner https://api.your-domain.com/health
```

第一条 curl 应为 401，第二条会询问密码并应返回 health JSON。
不要使用 `curl -v` 带着真实登录凭据收集可分享的日志。
Nginx 在转发给 Express 前移除 Authorization，只在入口验证密码。
此设置针对个人单用户使用；全站请求限制为每分钟 120 个，AI 为每分钟 6 个，均带少量突发余量。
API 响应禁用浏览器及 CDN 缓存。[Nginx Basic Auth 文档](https://nginx.org/en/docs/http/ngx_http_auth_basic_module.html)。

确认自动续期，并配置续期后 reload：

```bash
sudo install -d /etc/letsencrypt/renewal-hooks/deploy
printf '%s\n' '#!/bin/sh' 'systemctl reload nginx' | sudo tee /etc/letsencrypt/renewal-hooks/deploy/reload-nginx >/dev/null
sudo chmod 0755 /etc/letsencrypt/renewal-hooks/deploy/reload-nginx
sudo systemctl enable --now certbot.timer
sudo certbot renew --dry-run
```

## 6. 配置并部署 Vercel 前端

在 **本机仓库** 执行：

```bash
cd /Users/xuss/Documents/CodingSpace/ai-assisted-job-tracker/frontend
nvm use
npm run configure:deploy -- https://api.your-domain.com
npm run test:config
npm run build
git diff -- vercel.json
```

检查 destination 只包含真实 HTTPS API 域名，不包含密码或 Key。默认 `.invalid` 地址会让 Vercel 构建失败，防止误发布未配置的前端。
确认后由你提交并 push；如果新文件尚未提交，使用编辑器检查 `vercel.json`，因为普通 `git diff` 不展示 untracked 文件。

在 Vercel 导入该 GitHub 仓库：

| 设置 | 值 |
| --- | --- |
| Framework preset | Vite |
| Root Directory | `frontend` |
| Node.js Version | 24.x |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Install Command | `npm ci` |

选择你已审核并 push 的分支；不要把尚未合并到 main 的代码误当作已发布版本。
前端不需要 Gemini Key、数据库路径或共享密码环境变量。浏览器只请求当前域名的 `/api`，由 Vercel
转发至 EC2 的 HTTPS 地址，因此不需要给后端开放宽泛 CORS。[Vercel rewrites 文档](https://vercel.com/docs/rewrites)。

## 7. 上线验收

1. 打开 Vercel URL，未登录时应显示登录页，而不是岗位数据。
2. 输入第 5 步的账号密码，创建一条测试岗位，刷新并重新登录，确认记录保留。
3. 编辑岗位、变更状态、添加和修改面试，检查时间与历史。
4. 手动执行一次 AI 解析，确认加载和审核过程；不要用自动化测试消耗真实 API 配额。
5. 删除测试记录，确认取消操作不删除、确认操作才删除。
6. 手机宽度打开页面，检查可读性和表单。
7. 退出登录，确认不能读取数据；直接访问 EC2 API 也应要求鉴权。
8. 验证 API 响应含 `Cache-Control: private, no-store`，Vercel 不缓存私有 JSON。
9. 验证服务器重启后服务自动恢复，记录仍在。

若 Vercel `/api/health` 返回 HTML，检查 rewrite 和项目 Root Directory；若为 502，检查 Nginx 上游与 systemd；
若为 401，检查登录；若为 429，等待限流窗口恢复。不要为排错临时取消鉴权或开放 3000。

## 8. 备份与恢复

```bash
sudo bash /opt/job-tracker/current/deploy/backup-database.sh
```

该脚本使用 SQLite 在线备份，并执行 integrity check，保存至 `/var/backups/job-tracker`。
不要直接复制运行中的 `.db` 而漏掉 WAL。将已验证备份通过受保护渠道定期复制到服务器之外；
同机备份无法防止整块 EBS 丢失。脚本不会自动删除旧备份，需要监控磁盘空间。
部署时再决定自动备份频率及离机存储位置，不假设它们已经配置。

恢复时先停止服务，把当前数据库及存在的 `-wal`、`-shm` 文件整体移到一个新的保留目录，
再将选定备份复制到 `/var/lib/job-tracker/job-tracker.db`，设置 owner 为 `jobtracker:jobtracker`、权限 0600，
执行 integrity check 后启动服务。不要直接覆盖运行中的数据库。

## 9. 后续更新与回滚

每次更新先备份数据库，再在新的 `/opt/job-tracker/releases/<commit>` 路径安装、测试和构建。
记录旧的 `readlink /opt/job-tracker/current`。准备就绪后切换 `current` 软链接并重启 systemd；
用本机 health 和外部登录检查新版本。失败时切回记录的旧路径并重启。
不要覆盖 `/etc/job-tracker/backend.env` 或 `/var/lib/job-tracker`。
本次没有数据库结构变更；将来涉及 migration 时，必须单独制定兼容与数据恢复方案。

## 当前边界

- Nginx、TLS、systemd 和 Vercel 必须在真实部署环境完成上述验收；本地前端测试不能替代这一步。
- 登录由 Nginx 提供，凭据只保留在当前标签页内存中。刷新后重新登录，没有注册或多用户隔离。
- 不提供公开可修改的演示账号。简历可链接仓库和已上线页面；展示数据请用不含个人信息的示例。
