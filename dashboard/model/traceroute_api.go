package model

// TracerouteTaskForm 创建/更新任务的请求体
type TracerouteTaskForm struct {
	Name           string `json:"name" binding:"required"`
	SourceServerID uint64 `json:"source_server_id" binding:"required"`
	TargetServerID uint64 `json:"target_server_id"`
	TargetAddr     string `json:"target_addr"`
	Protocol       string `json:"protocol"`
	MaxHops        uint8  `json:"max_hops"`
	Scheduler      string `json:"scheduler"`
	Enabled        bool   `json:"enabled"`
}

// TracerouteTaskData Dashboard 下发给 Agent 的任务载荷
type TracerouteTaskData struct {
	Target   string `json:"target"`
	Protocol string `json:"protocol"`
	MaxHops  uint8  `json:"max_hops"`
}

// TracerouteResultData Agent 回传的结果载荷
type TracerouteResultData struct {
	Hops       []TracerouteHopData `json:"hops"`
	TotalDelay float64             `json:"total_delay"`
}

// TracerouteHopData Agent 回传的单跳数据
type TracerouteHopData struct {
	Index    uint8     `json:"index"`
	IP       string    `json:"ip"`
	Hostname string    `json:"hostname"`
	RTT      []float64 `json:"rtt"`
	Loss     float32   `json:"loss"`
}
