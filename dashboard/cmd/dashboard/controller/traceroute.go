package controller

import (
	"strconv"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"github.com/nezhahq/nezha/model"
	"github.com/nezhahq/nezha/service/singleton"
)

// RegisterTracerouteRoutes 注册 traceroute 相关路由
func RegisterTracerouteRoutes(r *gin.RouterGroup, db *gorm.DB, ts *singleton.TracerouteSentinel) {
	tr := r.Group("/traceroute")
	{
		tr.GET("/task", listTracerouteTasks(db))
		tr.POST("/task", createTracerouteTask(db, ts))
		tr.PATCH("/task/:id", updateTracerouteTask(db, ts))
		tr.POST("/batch-delete/task", batchDeleteTracerouteTask(db, ts))
		tr.POST("/task/:id/run", manualRunTracerouteTask(ts))
		tr.GET("/result", listTracerouteResults(db))
		tr.GET("/result/:id", getTracerouteResult(db))
		tr.GET("/geo-location", listGeoLocations(db))
		tr.PATCH("/geo-location/:id", updateGeoLocation(db))
	}
}

func listTracerouteTasks(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var tasks []model.TracerouteTask
		if err := db.Find(&tasks).Error; err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		c.JSON(200, gin.H{"data": tasks})
	}
}

func createTracerouteTask(db *gorm.DB, ts *singleton.TracerouteSentinel) gin.HandlerFunc {
	return func(c *gin.Context) {
		var form model.TracerouteTaskForm
		if err := c.ShouldBindJSON(&form); err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}
		task := model.TracerouteTask{
			Name:           form.Name,
			SourceServerID: form.SourceServerID,
			TargetServerID: form.TargetServerID,
			TargetAddr:     form.TargetAddr,
			Protocol:       form.Protocol,
			MaxHops:        form.MaxHops,
			Scheduler:      form.Scheduler,
			Enabled:        form.Enabled,
		}
		if task.Protocol == "" {
			task.Protocol = "icmp"
		}
		if task.MaxHops == 0 {
			task.MaxHops = 30
		}
		if err := db.Create(&task).Error; err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		ts.Update(&task)
		c.JSON(200, gin.H{"data": task.ID})
	}
}

func updateTracerouteTask(db *gorm.DB, ts *singleton.TracerouteSentinel) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, err := strconv.ParseUint(c.Param("id"), 10, 64)
		if err != nil {
			c.JSON(400, gin.H{"error": "invalid id"})
			return
		}
		var task model.TracerouteTask
		if err := db.First(&task, id).Error; err != nil {
			c.JSON(404, gin.H{"error": "task not found"})
			return
		}
		var form model.TracerouteTaskForm
		if err := c.ShouldBindJSON(&form); err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}
		task.Name = form.Name
		task.SourceServerID = form.SourceServerID
		task.TargetServerID = form.TargetServerID
		task.TargetAddr = form.TargetAddr
		task.Protocol = form.Protocol
		task.MaxHops = form.MaxHops
		task.Scheduler = form.Scheduler
		task.Enabled = form.Enabled
		if err := db.Save(&task).Error; err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		ts.Update(&task)
		c.JSON(200, gin.H{"data": nil})
	}
}

func batchDeleteTracerouteTask(db *gorm.DB, ts *singleton.TracerouteSentinel) gin.HandlerFunc {
	return func(c *gin.Context) {
		var ids []uint64
		if err := c.ShouldBindJSON(&ids); err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}
		if err := db.Delete(&model.TracerouteTask{}, "id IN ?", ids).Error; err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		ts.Delete(ids)
		c.JSON(200, gin.H{"data": nil})
	}
}

func manualRunTracerouteTask(ts *singleton.TracerouteSentinel) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, err := strconv.ParseUint(c.Param("id"), 10, 64)
		if err != nil {
			c.JSON(400, gin.H{"error": "invalid id"})
			return
		}
		ts.ManualRun(id)
		c.JSON(200, gin.H{"data": nil})
	}
}

func listTracerouteResults(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		taskIDStr := c.Query("task_id")
		limit := 20

		var results []model.TracerouteResult
		q := db.Order("created_at DESC").Limit(limit)
		if taskIDStr != "" {
			if taskID, err := strconv.ParseUint(taskIDStr, 10, 64); err == nil {
				q = q.Where("task_id = ?", taskID)
			}
		}
		if err := q.Find(&results).Error; err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		c.JSON(200, gin.H{"data": results})
	}
}

func getTracerouteResult(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, err := strconv.ParseUint(c.Param("id"), 10, 64)
		if err != nil {
			c.JSON(400, gin.H{"error": "invalid id"})
			return
		}
		var result model.TracerouteResult
		if err := db.First(&result, id).Error; err != nil {
			c.JSON(404, gin.H{"error": "result not found"})
			return
		}
		var hops []model.TracerouteHop
		db.Where("result_id = ?", id).Order("hop_index").Find(&hops)
		c.JSON(200, gin.H{"data": gin.H{"result": result, "hops": hops}})
	}
}

func listGeoLocations(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var locs []model.GeoLocation
		if err := db.Find(&locs).Error; err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		c.JSON(200, gin.H{"data": locs})
	}
}

func updateGeoLocation(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, err := strconv.ParseUint(c.Param("id"), 10, 64)
		if err != nil {
			c.JSON(400, gin.H{"error": "invalid id"})
			return
		}
		var loc model.GeoLocation
		if err := db.First(&loc, id).Error; err != nil {
			c.JSON(404, gin.H{"error": "geo location not found"})
			return
		}
		var body struct {
			Latitude  *float64 `json:"latitude"`
			Longitude *float64 `json:"longitude"`
		}
		if err := c.ShouldBindJSON(&body); err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}
		if body.Latitude != nil {
			loc.Latitude = *body.Latitude
		}
		if body.Longitude != nil {
			loc.Longitude = *body.Longitude
		}
		loc.Source = "manual"
		if err := db.Save(&loc).Error; err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		c.JSON(200, gin.H{"data": nil})
	}
}

// --- Map API for frontend ---

type hopWithGeo struct {
	HopIndex    uint8   `json:"hop_index"`
	IP          string  `json:"ip"`
	RTT1        float64 `json:"rtt1"`
	RTT2        float64 `json:"rtt2"`
	RTT3        float64 `json:"rtt3"`
	Loss        float32 `json:"loss"`
	Geo         *geoObj `json:"geo"`
}

type geoObj struct {
	Latitude    float64 `json:"latitude"`
	Longitude   float64 `json:"longitude"`
	CountryCode string  `json:"country_code"`
	City        string  `json:"city"`
}

type mapResult struct {
	ID         uint64       `json:"id"`
	TaskID     uint64       `json:"task_id"`
	TargetAddr string       `json:"target_addr"`
	TotalDelay float64      `json:"total_delay"`
	HopCount   uint8        `json:"hop_count"`
	Successful bool         `json:"successful"`
	CreatedAt  string       `json:"created_at"`
	Hops       []hopWithGeo `json:"hops"`
}

func getTracerouteMap(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		// 每个 task 取最新一条成功结果
		var results []model.TracerouteResult
		db.Raw(`SELECT tr.* FROM traceroute_results tr
			INNER JOIN (
				SELECT task_id, MAX(id) as max_id FROM traceroute_results
				WHERE successful = 1 GROUP BY task_id
			) latest ON tr.id = latest.max_id`).Scan(&results)

		// 预加载所有相关 hops
		var resultIDs []uint64
		for _, r := range results {
			resultIDs = append(resultIDs, r.ID)
		}

		var hops []model.TracerouteHop
		if len(resultIDs) > 0 {
			db.Where("result_id IN ?", resultIDs).Order("result_id, hop_index").Find(&hops)
		}

		// 收集 geo_loc_id
		var geoIDs []uint64
		for _, h := range hops {
			if h.GeoLocID > 0 {
				geoIDs = append(geoIDs, h.GeoLocID)
			}
		}

		geoMap := make(map[uint64]*model.GeoLocation)
		if len(geoIDs) > 0 {
			var geos []model.GeoLocation
			db.Where("id IN ?", geoIDs).Find(&geos)
			for i := range geos {
				geoMap[geos[i].ID] = &geos[i]
			}
		}

		// 组装响应
		hopsByResult := make(map[uint64][]hopWithGeo)
		for _, h := range hops {
			hw := hopWithGeo{
				HopIndex: h.HopIndex,
				IP:       h.IP,
				RTT1:     h.RTT1,
				RTT2:     h.RTT2,
				RTT3:     h.RTT3,
				Loss:     h.Loss,
			}
			if geo, ok := geoMap[h.GeoLocID]; ok && geo.Latitude != 0 {
				hw.Geo = &geoObj{
					Latitude:    geo.Latitude,
					Longitude:   geo.Longitude,
					CountryCode: geo.CountryCode,
					City:        geo.City,
				}
			}
			hopsByResult[h.ResultID] = append(hopsByResult[h.ResultID], hw)
		}

		var out []mapResult
		for _, r := range results {
			out = append(out, mapResult{
				ID:         r.ID,
				TaskID:     r.TaskID,
				TargetAddr: r.TargetAddr,
				TotalDelay: r.TotalDelay,
				HopCount:   r.HopCount,
				Successful: r.Successful,
				CreatedAt:  r.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
				Hops:       hopsByResult[r.ID],
			})
		}

		c.JSON(200, gin.H{"data": gin.H{"results": out}})
	}
}
