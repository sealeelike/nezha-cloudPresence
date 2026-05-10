# Nezha Cloud Presence

基于 [Nezha Monitoring](https://github.com/nezhahq/nezha) 的 Traceroute Cloud Map 扩展。

在 Nezha 服务监控体系中新增 **Traceroute** 类型（type=14），支持定时/手动执行路由追踪，GeoIP 解析，2D/3D 地图可视化。

## 项目结构

```
├── dashboard/          # Nezha Dashboard 后端（Go），基于 nezhahq/nezha fork
├── frontend/
│   ├── admin/          # Admin 前端改动（基于 nezhahq/admin-frontend）
│   └── user/           # User 前端改动（基于 nezha-dash-v2）
├── agent/              # Agent 补丁（应用到 nezhahq/agent）
└── README.md
```

## 功能

### Dashboard 后端
- Service type=14 (Traceroute) 融入现有 Service 调度体系
- `cron_rule` 字段：支持 cron 表达式定时（如 `0 0 3 * * *` 每天凌晨3点）
- TracerouteSentinel：结果存储、GeoIP 解析、hop 记录
- `/api/v1/traceroute/map`：地图数据聚合 API（optionalAuth）
- 删除 Service 时级联清理 traceroute 数据

### Agent 补丁
- 新增 `TaskTypeTraceroute = 14`
- 执行 mtr / traceroute / tracert，解析输出为 JSON
- 支持 Linux（mtr 优先）、macOS、Windows

### Admin 前端
- Service 类型下拉新增 "Traceroute"
- Cron Rule 输入框（覆盖 Interval）
- Target placeholder 提示

### User 前端（地图）
- 2D 模式：Leaflet 暗色底图，大圆弧路径，跨太平洋正确走向
- 3D 模式：react-globe.gl，动画弧线
- Hop 节点插值（RTT 比例定位无 GeoIP 的跳）
- 路径方向箭头（最长 segment 中点）
- Hover 临时高亮 / 点击多选锁定
- 锁定时显示各节点累计 RTT

## 部署

### Dashboard
```bash
cd dashboard
# 下载 GeoIP 数据库（需要 ipinfo token）
wget -qO pkg/geoip/geoip.db "https://ipinfo.io/data/free/country.mmdb?token=YOUR_TOKEN"
CGO_ENABLED=1 go build -o nezha-dashboard ./cmd/dashboard
```

### Agent
将 `agent/traceroute.patch` 应用到官方 [nezhahq/agent](https://github.com/nezhahq/agent) 源码：
```bash
git clone https://github.com/nezhahq/agent.git
cd agent
git apply /path/to/agent/traceroute.patch
go build -o nezha-agent ./cmd/agent
```

### 前端
Admin 前端改动在 `frontend/admin/`，替换官方 admin-frontend 对应文件后 build。

User 前端 `GlobalMap.tsx` 替换 nezha-dash-v2 的 `src/components/GlobalMap.tsx`，需安装：
```bash
npm install leaflet react-leaflet react-globe.gl @types/leaflet
```

## 兼容性

- 向下兼容：老数据库自动 migrate 新表，原有 Service (type 1/2/3) 不受影响
- Agent：未打补丁的 agent 收到 type=14 会忽略（不影响其他功能）
