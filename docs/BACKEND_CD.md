# Backend continuous deployment

## 发布流程

`.github/workflows/backend.yml` 在 PR 上执行检查，在 `main` 的 push 或手动
`workflow_dispatch` 上先完成相同检查，再通过 GitHub OIDC 和 SSM 发布后端。
PR 和其他分支不会执行部署。该工作流不使用 GitHub Environment，因为 IAM 信任规则
目前绑定的是 `main` 分支的 OIDC subject。

GitHub 仓库 Variables：

| Name | Value |
| --- | --- |
| `AWS_REGION` | `ap-southeast-2` |
| `AWS_ROLE_ARN` | `arn:aws:iam::549499517933:role/job-tracker-github-deploy` |
| `EC2_INSTANCE_ID` | `i-0a1af0e82b8c41d0a` |

GitHub 角色允许对上述实例使用 `AWS-RunShellScript`，以及查询命令结果。
这是该实例的远程 Shell 权限；应保护 `main` 和工作流文件。EC2 使用独立角色
`job-tracker-ec2-ssm`，附加 `AmazonSSMManagedInstanceCore`。不需要长期 AWS
Access Key、SSH 私钥或新的入站端口。IAM 配置由控制台管理，本仓库不会自动修改它。

## 服务器前提

- 初次部署已按照 [部署指南](DEPLOYMENT.md) 完成，`job-tracker` 服务健康。
- Ubuntu 24.04，系统 Node.js 24，用户 `ubuntu` 和 `jobtracker` 已存在。
- SSM Agent Online；实例能通过 HTTPS 访问 GitHub、npm 和 SSM。
- `/opt/job-tracker/current` 指向已有 release，数据库已存在于
  `/var/lib/job-tracker/job-tracker.db`。
- `/etc/job-tracker/backend.env`、Nginx 登录配置、证书和 systemd unit 留在服务器上。

## 发布行为

1. CI 运行类型检查、API 测试（包含构建）和部署脚本测试。
2. 部署 job 获取短期 AWS 权限，把同一提交的脚本通过 SSM 发送到 EC2。
3. 服务器加文件锁，确认目标 SHA 仍是远程 `main` 最新提交；过期提交跳过。
   查询 GitHub 失败会导致部署失败，而不是当成成功跳过。
4. 以 `ubuntu` 用户下载该完整 SHA，安装依赖、构建并移除开发依赖。
   构建期间旧服务仍在运行；构建过程不读取生产环境文件。
5. 再检查 `main`，随后停止服务、备份 SQLite 并检查备份完整性。
6. 原子切换 `current` 符号链接，启动服务，并检查 `/health`。
7. 切换阶段失败会尝试恢复上一版代码和服务；备份、旧版本均保留。

CI 和 EC2 都从锁文件安装依赖，EC2 上重新构建以匹配本机原生 SQLite 模块。
这个流程并非零停机：备份与服务启动期间会短暂不可用。
目前每次 `main` 更新都会运行后端发布，包括仅修改前端的提交。
Vercel 发布独立运行，因此跨前后端变更应保持接口向后兼容。

## 失败、取消与回退

- Actions 和 SSM 都必须成功才算部署成功。SSM command ID 会写入 Actions 日志。
- 构建失败时当前服务不停止；备份失败时恢复原服务。
- 新版本启动或健康检查失败时尝试回退代码，但工作流仍标记失败。
- **不自动恢复数据库**，以免覆盖新写入的数据。涉及不兼容 schema 变更时，旧代码
  也可能无法运行，必须人工评估备份和恢复步骤，不能把代码回退当成数据库回退。
- 自动备份仅在同一台 EC2 上，不能替代离机备份。
- 手动取消 Actions 不保证取消已发送的 SSM 命令。远端有超时限制和部署锁；先在
  SSM Run Command 查看该 command ID 的状态，再决定是否重新运行。
- 不自动修改系统 Node、systemd unit、Nginx、证书或密钥。修改这些配置时单独维护服务器。
- 发布目录和备份不自动清理。定期检查磁盘空间，确认当前/上一版及备份后再清理旧文件。

## 首次启用及验证

先在 `backend-cd` PR 中查看 Backend checks，通过后合并到 `main`。
第一次合并会触发真实发布，无需手动安装新的部署脚本。

Actions 中应依次看到 Backend checks 和 Deploy backend to EC2 成功。
随后在 EC2 检查（不输出环境文件或服务日志）：

```bash
readlink -f /opt/job-tracker/current
systemctl is-active job-tracker
curl --fail --show-error http://localhost:3000/health
sudo ls -lh /var/backups/job-tracker
```

发布目录的 SHA 前缀应与 Actions 中的提交一致。重新打开网页、登录，确认已有岗位仍在。
以后可在 GitHub Actions → Backend CI/CD → Run workflow 中选择 `main` 手动重跑。

建议配置 main 分支保护，要求 PR 的 Backend checks 和 Frontend checks 通过。
这些规则不会由本补丁自动启用。

## 本地测试

```bash
bash -n deploy/deploy-backend.sh
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s deploy/tests -v
```

测试使用临时目录和模拟的服务/AWS 调用，覆盖构建失败、备份失败、启动/健康检查失败、
回退时保留数据、过期提交、SSM 最终一致性、超时及错误状态。真实 IAM/SSM/systemd
行为以首次线上发布结果为准。
