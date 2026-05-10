package singleton

import (
	"log"
	"sync"

	"github.com/goccy/go-json"
	"github.com/robfig/cron/v3"
	"gorm.io/gorm"

	"github.com/nezhahq/nezha/model"
	geoipx "github.com/nezhahq/nezha/pkg/geoip"
	pb "github.com/nezhahq/nezha/proto"
)

// TracerouteSentinel traceroute 任务调度与结果处理核心
type TracerouteSentinel struct {
	db          *gorm.DB
	cron        *cron.Cron
	tasks       map[uint64]*model.TracerouteTask
	mu          sync.RWMutex
	dispatchBus chan *model.TracerouteTask
	getServer   func(uint64) (TaskStreamSender, bool)
}

// TaskStreamSender 抽象 server.TaskStream.Send 能力
type TaskStreamSender interface {
	Send(*pb.Task) error
}

// NewTracerouteSentinel 创建并启动调度器
func NewTracerouteSentinel(db *gorm.DB, cronInstance *cron.Cron, getServer func(uint64) (TaskStreamSender, bool)) *TracerouteSentinel {
	ts := &TracerouteSentinel{
		db:          db,
		cron:        cronInstance,
		tasks:       make(map[uint64]*model.TracerouteTask),
		dispatchBus: make(chan *model.TracerouteTask, 50),
		getServer:   getServer,
	}

	ts.loadTasks()
	go ts.dispatchWorker()
	return ts
}

func (ts *TracerouteSentinel) loadTasks() {
	var tasks []model.TracerouteTask
	ts.db.Where("enabled = ?", true).Find(&tasks)

	for i := range tasks {
		task := &tasks[i]
		ts.registerCron(task)
		ts.mu.Lock()
		ts.tasks[task.ID] = task
		ts.mu.Unlock()
	}
}

func (ts *TracerouteSentinel) registerCron(task *model.TracerouteTask) {
	if task.Scheduler == "" {
		return
	}
	var err error
	t := task
	task.CronJobID, err = ts.cron.AddFunc(task.Scheduler, func() {
		ts.dispatchBus <- t
	})
	if err != nil {
		log.Printf("NEZHA>> TracerouteSentinel: failed to register cron for task %d: %v", task.ID, err)
	}
}

func (ts *TracerouteSentinel) dispatchWorker() {
	for task := range ts.dispatchBus {
		ts.dispatch(task)
	}
}

func (ts *TracerouteSentinel) dispatch(task *model.TracerouteTask) {
	// 解析目标地址
	target := task.TargetAddr
	if target == "" && task.TargetServerID > 0 {
		// 从目标服务器获取 IP（集成时从 ServerShared 取）
		// 此处留接口，实际集成时补充
		return
	}
	if target == "" {
		return
	}

	data, _ := json.Marshal(model.TracerouteTaskData{
		Target:   target,
		Protocol: task.Protocol,
		MaxHops:  task.MaxHops,
	})

	sender, ok := ts.getServer(task.SourceServerID)
	if !ok || sender == nil {
		log.Printf("NEZHA>> TracerouteSentinel: source server %d offline, skip task %d", task.SourceServerID, task.ID)
		return
	}

	sender.Send(&pb.Task{
		Id:   task.ID,
		Type: model.TaskTypeTraceroute,
		Data: string(data),
	})
}

// ManualRun 手动触发一次探测
func (ts *TracerouteSentinel) ManualRun(taskID uint64) {
	ts.mu.RLock()
	task, ok := ts.tasks[taskID]
	ts.mu.RUnlock()
	if ok {
		ts.dispatchBus <- task
	}
}

// HandleResult 处理 Agent 回传的 traceroute 结果
func (ts *TracerouteSentinel) HandleResult(result *pb.TaskResult, reporterID uint64) {
	taskID := result.GetId()

	ts.mu.RLock()
	task, ok := ts.tasks[taskID]
	ts.mu.RUnlock()
	if !ok {
		log.Printf("NEZHA>> TracerouteSentinel: unknown task %d from server %d", taskID, reporterID)
		return
	}

	tr := model.TracerouteResult{
		TaskID:         taskID,
		SourceServerID: task.SourceServerID,
		TargetAddr:     task.TargetAddr,
		Successful:     result.GetSuccessful(),
	}

	if !result.GetSuccessful() {
		tr.ErrorMsg = result.GetData()
		ts.db.Create(&tr)
		return
	}

	// 解析 JSON
	var data model.TracerouteResultData
	if err := json.Unmarshal([]byte(result.GetData()), &data); err != nil {
		tr.Successful = false
		tr.ErrorMsg = "parse error: " + err.Error()
		ts.db.Create(&tr)
		return
	}

	tr.TotalDelay = data.TotalDelay
	tr.HopCount = uint8(len(data.Hops))
	ts.db.Create(&tr)

	// 写入每一跳
	for _, h := range data.Hops {
		hop := model.TracerouteHop{
			ResultID: tr.ID,
			HopIndex: h.Index,
			IP:       h.IP,
			Hostname: h.Hostname,
			Loss:     h.Loss,
		}
		if len(h.RTT) > 0 {
			hop.RTT1 = h.RTT[0]
		}
		if len(h.RTT) > 1 {
			hop.RTT2 = h.RTT[1]
		}
		if len(h.RTT) > 2 {
			hop.RTT3 = h.RTT[2]
		}

		// GeoIP 查询
		if loc, _ := geoipx.LookupGeo(ts.db, h.IP); loc != nil {
			hop.GeoLocID = loc.ID
		}

		ts.db.Create(&hop)
	}
}

// Update 更新或新增任务
func (ts *TracerouteSentinel) Update(task *model.TracerouteTask) {
	ts.mu.Lock()
	old := ts.tasks[task.ID]
	if old != nil && old.CronJobID != 0 {
		ts.cron.Remove(old.CronJobID)
	}
	ts.tasks[task.ID] = task
	ts.mu.Unlock()

	if task.Enabled {
		ts.registerCron(task)
	}
}

// Delete 删除任务
func (ts *TracerouteSentinel) Delete(ids []uint64) {
	ts.mu.Lock()
	defer ts.mu.Unlock()
	for _, id := range ids {
		if t, ok := ts.tasks[id]; ok && t.CronJobID != 0 {
			ts.cron.Remove(t.CronJobID)
		}
		delete(ts.tasks, id)
	}
}
