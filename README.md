# line-grid

妙妙屋X 探针的线描主题：夜间炭灰底、日间暖纸色、可拖转地球、流量已用/剩余柱。

**主题名称必须填 `line-grid`。** 多一个字、大小写不对都不会生效。

## 这个仓库有什么

只有主题前端（HTML / CSS / JS）。

这里**没有**：

- 主控地址
- 探针密钥
- Worker 部署配置
- 真实节点数据（演示数据都是虚构代号）

## 使用方式

### 1. 配合独立探针前端（推荐）

适用于把探针站架在 Cloudflare Worker、并且已经能按主题名切换 `/` 与 `/line-grid/` 的部署。

1. 把本仓库全部文件放到站点的 `/line-grid/` 目录，保持现有结构：
   ```text
   /line-grid/index.html
   /line-grid/css/app.css
   /line-grid/js/app.js
   /line-grid/js/api.js
   /line-grid/js/charts.js
   /line-grid/js/config.js
   /line-grid/js/data.js
   ```
2. 登录妙妙屋X 主控，打开外观 / 主题相关设置。
3. 自定义主题名称填写 `line-grid`，保存。
4. 打开探针站首页。若主题名是 `line-grid`，会进入本主题；改回 `premium`、`pixel`、`flat`、`anime` 或 `follow`，会回到内置主题。

接口走当前站点同源的 `/api/probe`、`/api/stream`、`/api/series`，不必在主题里填写任何地址或密钥。

### 2. 只想先看效果

在本目录启动任意静态服务：

```bash
npx --yes serve .
```

浏览器打开提示的地址。没有探针接口时会显示演示数据，方便看版式，不是真实机器。

也可在地址后加 `?demo=1` 强制演示数据。

### 3. 页面上的开关

- 右上角太阳 / 月亮：日间、夜间，选择保存在当前浏览器，不会上传
- 机器清单旁的图标：网格 / 列 / 横向，以及地球开/关
- 地球可按住拖转；点节点打开详情窗口

## Komari 专版

Komari 用户请看独立教程：[KOMARI.md](./KOMARI.md)

简要：用 `scripts/pack-komari.ps1` 打出 zip → 后台「主题管理」上传 → 启用 **linegrid**。  
不要用资源管理器直接压缩。详细步骤、接口说明和排错都在那份教程里。

## 更新

主题改动会单独提交到本仓库。若你是从本仓库拷进自己的探针站，更新时用新版本覆盖 `/line-grid/` 下同名文件即可，不要改主题名称。

## 许可

MIT
