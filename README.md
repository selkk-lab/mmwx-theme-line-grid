# line-grid

妙妙屋X 探针的线描主题：夜间炭灰底、日间暖纸色、交互地球、紧凑机器清单，以及网络和资源工作台。

当前版本默认「详细」视图，中英文采用 Noto Sans SC / Space Grotesk，数据读数采用 JetBrains Mono。字体随主题自托管，支持桌面和手机。

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

1. 把 `index.html` 及完整的 `css/`、`js/`、`img/`、`fonts/` 目录放到站点的 `/line-grid/` 目录，保持现有结构（不要只复制旧版的几份文件）：
   ```text
   /line-grid/index.html
   /line-grid/css/       # 全部样式，含 fonts.css
   /line-grid/js/        # 全部脚本
   /line-grid/img/       # 图标与纹理
   /line-grid/fonts/     # 字体分包与许可证
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

浏览器打开提示的地址，并加上 `?demo=1` 查看演示数据。未加演示参数时会连接同源探针接口，失败后显示重试入口，不会回退为假节点。

想在本地直接看自己的真实节点（Node.js 18+，无需安装依赖）：

```bash
node scripts/dev-server.mjs --upstream https://你的探针站
```

打开 `http://127.0.0.1:8780/`。页面和改动来自本目录，`/api/*`（含 WebSocket 实时推送）转发到已部署的探针站，不需要主控地址或密钥。`?demo=1` 仍是演示数据。

### 3. 页面上的开关

- 右上角太阳 / 月亮：日间、夜间，选择保存在当前浏览器，不会上传
- 机器清单旁的图标：卡片 / 详细 / 列表，以及地球开/关
- 地球可按住拖转；点节点打开详情窗口
- 地区读数联动筛选与地球定位；地球右下角提供缩放和复位
- Ctrl / Cmd K 快捷搜索节点；详情支持前后切换和最多三台节点对比
- 每页标题下一句话说明现状；首页「需要留意」汇总离线、超额、临近续费等，点击直达节点
- 主控开启对应开关时，网络状况显示转发链路，资源概况显示流量热点

### 4. 本地设计预览与验证

```powershell
python -m http.server 8765 --bind 127.0.0.1
```

打开 `http://127.0.0.1:8765/?demo=1`。只在本机提供服务；演示模式不请求探针 API。设计说明见 [DESIGN.md](DESIGN.md)。

- 搜索支持名称和地区，按 `/` 聚焦；全部、在线、离线、需关注可组合搜索。
- 所有视图支持排序，清除筛选会同时重置搜索与状态。
- 桌面与手机均默认详细视图，手机首次访问收起地球；升级时旧版视图记录迁移一次，之后继续记住用户选择的视图、地球与主题。
- 详情支持 Escape 关闭、Tab 焦点约束，刷新保留阅读位置。
- 最后更新显示最近一次成功接收数据的时间；超过 45 秒显示待更新。无新数据时每 30 秒尝试 HTTP 补充刷新。
- 本机右下角“效果试验 · 临时”可展开或收起面板；使用 `?demo=1&fx=1` 可直接展开。共 16 项开关，提供推荐、全开、全关，选择保存在当前浏览器。正式站点不显示试验面板，默认关闭细线网格和经线扫描，其余 14 项开启。原版日间底色为 `#d4c096`。
- 卡片右上角直接加入对比；详情提供总览、网络、流量、系统四个分区。
- 网络页矩阵联动节点与目标，曲线支持放大波动和键盘取样；资源页支持立体容量剖面、指标切换和占用排序。

已安装 Python Playwright 和 Microsoft Edge 时，在上述服务运行期间执行：

```powershell
python scripts/test-local-ux.py
python scripts/test-observatory.py
python scripts/test-console.py
python scripts/test-typography.py
python scripts/test-live-stream.py
python scripts/test-desk.py
```

测试只使用本地演示与拦截的接口样本；结果与截图保存在 `artifacts/`，不提交到仓库。本版本 91 项本地检查通过，涵盖交互、响应式布局、字体实际渲染、默认视图、接口异常、实时推送与断线重连，以及需要留意、转发链路、流量热点、额度估算和节点系统曲线。

`python scripts/bench-live.py` 用 19 台合成节点和每 5 秒一次的模拟推送测量浏览器主线程开销，`--fx pulse=0` 等参数可单独关闭某项效果做对照。

## Komari 专版

Komari 用户请看独立教程：[KOMARI.md](./KOMARI.md)

简要：用 `scripts/pack-komari.ps1` 打出 zip → 后台「主题管理」上传 → 启用 **linegrid**。  
不要用资源管理器直接压缩。详细步骤、接口说明和排错都在那份教程里。

## 更新

主题改动会单独提交到本仓库。若你是从本仓库拷进自己的探针站，更新时用新版本覆盖 `/line-grid/` 下同名文件即可，不要改主题名称。

## 许可

主题代码使用 MIT；随包字体遵循 SIL Open Font License，详见 `fonts/*-OFL.txt`，上游来源记录在 `fonts/manifest.json`。
