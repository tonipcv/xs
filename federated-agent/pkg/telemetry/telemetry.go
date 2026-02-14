package telemetry

import (
	"context"
	"encoding/json"
	"net/http"
	"sync"
	"time"

	"go.uber.org/zap"

	"github.com/xaseai/federated-agent/pkg/config"
)

type Service struct {
	cfg     config.ClickHouseConfig
	logger  *zap.Logger
	metrics *Metrics
}

type Metrics struct {
	mu            sync.RWMutex
	TotalQueries  int64
	FailedQueries int64
	TotalRows     int64
	AvgDuration   time.Duration
}

type QueryLog struct {
	TenantID      string
	UserID        string
	DataSourceURL string
	Query         string
	RowCount      int
	Duration      time.Duration
	Success       bool
}

func NewService(cfg config.ClickHouseConfig, logger *zap.Logger) *Service {
	return &Service{
		cfg:     cfg,
		logger:  logger,
		metrics: &Metrics{},
	}
}

func (s *Service) LogQuery(ctx context.Context, log QueryLog) {
	// Update metrics
	s.metrics.mu.Lock()
	s.metrics.TotalQueries++
	if !log.Success {
		s.metrics.FailedQueries++
	}
	s.metrics.TotalRows += int64(log.RowCount)
	s.metrics.AvgDuration = (s.metrics.AvgDuration + log.Duration) / 2
	s.metrics.mu.Unlock()

	// Log to ClickHouse (async)
	go func() {
		// TODO: Implement ClickHouse insertion
		s.logger.Info("Query logged",
			zap.String("tenant", log.TenantID),
			zap.String("user", log.UserID),
			zap.Int("rows", log.RowCount),
			zap.Duration("duration", log.Duration),
			zap.Bool("success", log.Success),
		)
	}()
}

func (s *Service) HandleMetrics(w http.ResponseWriter, r *http.Request) {
	s.metrics.mu.RLock()
	defer s.metrics.mu.RUnlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"total_queries":  s.metrics.TotalQueries,
		"failed_queries": s.metrics.FailedQueries,
		"total_rows":     s.metrics.TotalRows,
		"avg_duration_ms": s.metrics.AvgDuration.Milliseconds(),
	})
}
