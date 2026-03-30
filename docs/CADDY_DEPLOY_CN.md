# 使用 Caddy 部署前端 UI

本文档适用于将本仓库作为独立前端站点部署，不再使用 `npm run dev` 对外提供访问。

## 适用场景

- 你希望把前端 UI 单独部署到服务器。
- 你希望通过 Caddy 提供静态文件服务。
- 你的 CLI Proxy API 后端继续运行在自己的地址和端口，例如 `http://127.0.0.1:8317` 或 `https://api.example.com`。

## 产物说明

当前构建会输出单文件页面：

- 构建命令：`npm run build`
- 产物路径：`dist/index.html`

这个产物可以直接由 Caddy 提供访问。

## 服务器目录建议

```text
/opt/cli-proxy-webui/           仓库目录
/opt/cli-proxy-webui/dist/      前端构建产物
/etc/caddy/Caddyfile            Caddy 配置
```

## 最短上线步骤

### 1. 安装 Node.js 与 Caddy

确保服务器上已经安装：

- Node.js 20+
- Caddy 2

### 2. 拉取代码并构建

```bash
cd /opt
git clone <your-frontend-repo-url> cli-proxy-webui
cd /opt/cli-proxy-webui
npm ci
npm run build
```

### 3. 写入 Caddy 配置

把仓库里的模板复制到系统配置：

```bash
cp /opt/cli-proxy-webui/deploy/Caddyfile.example /etc/caddy/Caddyfile
```

然后修改：

- `root * /var/www/cliproxy-ui/dist`

改成你的实际构建目录，例如：

```caddy
:80 {
    root * /opt/cli-proxy-webui/dist
    encode gzip zstd
    file_server

    @index path / /index.html
    header @index Cache-Control "no-store"

    @html path *.html
    header @html Cache-Control "public, max-age=300"
}
```

如果你有正式域名，推荐直接改成：

```caddy
ui.example.com {
    root * /opt/cli-proxy-webui/dist
    encode gzip zstd
    file_server

    @index path / /index.html
    header @index Cache-Control "no-store"

    @html path *.html
    header @html Cache-Control "public, max-age=300"
}
```

Caddy 会自动申请和续期 HTTPS 证书。

### 4. 检查并重载 Caddy

```bash
caddy fmt --overwrite /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile
systemctl restart caddy
systemctl status caddy --no-pager
```

### 5. 浏览器访问

访问你的地址：

- `http://<server-ip>`
- 或 `https://ui.example.com`

登录页里填写的 Management API 地址应指向你的 CLI Proxy API 后端地址，而不是当前 UI 地址。

例如：

- `http://127.0.0.1:8317`
- `https://api.example.com`

## 更新发布流程

当前端代码更新后，重复下面几步即可：

```bash
cd /opt/cli-proxy-webui
git pull
npm ci
npm run build
systemctl reload caddy
```

如果只是静态文件变更，通常 `reload` 就够了；`restart` 也可以。

## systemd 管理 Caddy

多数 Linux 发行版安装 Caddy 后会自动提供 `systemd` 服务。

常用命令：

```bash
systemctl enable caddy
systemctl restart caddy
systemctl reload caddy
systemctl status caddy --no-pager
journalctl -u caddy -n 200 --no-pager
```

## 常见问题

### 1. 页面打开了，但连接后端失败

通常不是 Caddy 的问题，优先检查：

- CLI Proxy API 后端是否真的在目标地址监听
- 后端是否允许远程管理
- 管理密钥是否正确
- 浏览器里填写的 API Base 是否填成了 UI 地址

### 2. 更新后页面看起来还是旧版本

先强刷浏览器缓存，再确认：

```bash
ls -lh /opt/cli-proxy-webui/dist/index.html
```

另外当前首页返回了较短缓存，`/` 与 `/index.html` 默认不会长期缓存。

### 3. 为什么不推荐 `npm run dev`

因为它是 Vite 开发服务器，适合开发调试，不适合生产：

- 资源占用更高
- 稳定性和安全性都不如静态文件服务
- 生产访问延迟通常更差

## 建议

- 生产环境使用 `npm run build + Caddy`
- 不要使用 `npm run dev` 对外提供访问
- UI 与 CLI Proxy API 后端可以分开部署，但要保证浏览器可访问后端 Management API
