# Komari 专版安装教程

这份是给 **Komari Monitor** 用户的。  
不是抄 Komari 默认皮肤，装上后仍是 line-grid 的线描界面，只是数据走 Komari 自己的接口。

主题在 Komari 里的标识是 **`linegrid`**（只能字母数字，不能写成 `line-grid`）。

## 你需要什么

- 已经能打开的 Komari 面板（能进后台）
- 管理员账号
- 一个主题 zip：`line-grid-komari.zip`

仓库里**没有**主控地址、密钥或真实机器数据。

## 一、打出 zip

在仓库根目录执行：

```powershell
pwsh -File scripts/pack-komari.ps1
```

会在仓库根目录生成 `line-grid-komari.zip`。

不要用资源管理器「发送到压缩文件夹」。Windows 打出来的路径可能是反斜杠，Linux 上的 Komari 会找不到 `dist/index.html`，然后退回默认主题。

zip 里必须是：

```text
komari-theme.json
preview.svg
dist/index.html
dist/css/app.css
dist/js/api.js
dist/js/app.js
dist/js/charts.js
dist/js/config.js
dist/js/data.js
dist/js/komari.js
```

## 二、在 Komari 后台安装

1. 登录 Komari 管理后台  
2. 打开 **设置 → 主题管理**  
3. 点 **上传主题**，选刚才的 `line-grid-komari.zip`  
4. 上传成功后，把当前主题切到 **line-grid**（short 名是 `linegrid`）  
5. 打开前台首页看是否变成线描界面

`/admin` 和 `/terminal` 仍是 Komari 自带页面，主题不会改这两处。

## 三、装好后应该看到什么

| 能显示 | 说明 |
| --- | --- |
| 节点名、地区、在线/离线 | 来自 `GET /api/nodes`，地区常是国旗，会转成国家码画地球 |
| CPU / 内存 / 硬盘 / 实时网速 | 来自 WebSocket `/api/clients`，连上后发送 `get` |
| 流量柱 | 用 `network.totalDown`、`network.totalUp`，限额用节点上的 `traffic_limit` |
| 延迟曲线 | 来自 `GET /api/records/ping?uuid=&hours=1` |
| 站点标题 | 后台站点名会替换页面标题 |

若 Komari 里没配 Ping 任务，延迟曲线会空，其它项仍在。

地址后加 `?src=komari` 可强制走 Komari 接口，一般不用加。

## 四、对不上时怎么查

1. 浏览器打开 `/api/nodes`，应能看到带 `uuid` 的 JSON  
2. 打开开发者工具 → 网络，看是否有 `/api/clients` 的 WebSocket，并且浏览器有发出 `get`  
3. CPU 有、网速全是 0：把 `/api/clients` 回包里一台机器的字段名打码发维护者（不要带 IP、域名、密钥）  
4. 上传后还是默认主题：多半是 zip 路径不对，用仓库脚本重打  

私有站点需要登录才能看数据，未登录时列表可能是空的，这是 Komari 权限，不是主题坏了。

## 五、和妙妙屋版的区别

| | 妙妙屋X | Komari |
| --- | --- | --- |
| 怎么启用 | 后台自定义主题名填 `line-grid` | 后台上传 zip，标识 `linegrid` |
| 实时数据 | `/api/stream` | `/api/clients` 发 `get` |
| 延迟 | 探针探测目标 | Komari 的 Ping 任务 |
| 外观 | 同一套 line-grid | 同一套 line-grid |

更新主题：重新打包、再上传一次覆盖即可。
