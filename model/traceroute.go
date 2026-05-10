package model

import (
	"time"

	"github.com/robfig/cron/v3"
)

// TracerouteTask 探测任务定义
type TracerouteTask struct {
	Common
	Name           string       `json:"name"`
	SourceServerID uint64       `json:"source_server_id" gorm:"index"`
	TargetServerID uint64       `json:"target_server_id"`
	TargetAddr     string       `json:"target_addr"`
	Protocol       string       `json:"protocol" gorm:"default:'icmp'"`
	MaxHops        uint8        `json:"max_hops" gorm:"default:30"`
	Scheduler      string       `json:"scheduler"`
	Enabled        bool         `json:"enabled" gorm:"default:true"`
	CronJobID      cron.EntryID `json:"-" gorm:"-"`
}

// TracerouteResult 单次探测结果
type TracerouteResult struct {
	ID             uint64    `json:"id" gorm:"primaryKey"`
	CreatedAt      time.Time `json:"created_at" gorm:"index"`
	TaskID         uint64    `json:"task_id" gorm:"index"`
	SourceServerID uint64    `json:"source_server_id"`
	TargetAddr     string    `json:"target_addr"`
	TotalDelay     float64   `json:"total_delay"`
	HopCount       uint8     `json:"hop_count"`
	Successful     bool      `json:"successful"`
	ErrorMsg       string    `json:"error_msg,omitempty"`
}

// TracerouteHop 每一跳详情
type TracerouteHop struct {
	ID       uint64  `json:"id" gorm:"primaryKey"`
	ResultID uint64  `json:"result_id" gorm:"index"`
	HopIndex uint8   `json:"hop_index"`
	IP       string  `json:"ip"`
	Hostname string  `json:"hostname,omitempty"`
	RTT1     float64 `json:"rtt1"`
	RTT2     float64 `json:"rtt2"`
	RTT3     float64 `json:"rtt3"`
	Loss     float32 `json:"loss"`
	GeoLocID uint64  `json:"geo_loc_id"`
}

// GeoLocation IP 地理位置缓存
type GeoLocation struct {
	ID          uint64    `json:"id" gorm:"primaryKey"`
	IP          string    `json:"ip" gorm:"uniqueIndex"`
	CountryCode string    `json:"country_code"`
	City        string    `json:"city"`
	Latitude    float64   `json:"latitude"`
	Longitude   float64   `json:"longitude"`
	Source      string    `json:"source" gorm:"default:'api'"`
	UpdatedAt   time.Time `json:"updated_at" gorm:"autoUpdateTime"`
}
