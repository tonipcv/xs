package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gorilla/mux"
	"go.uber.org/zap"

	"github.com/xaseai/federated-agent/pkg/auth"
	"github.com/xaseai/federated-agent/pkg/config"
	"github.com/xaseai/federated-agent/pkg/proxy"
	"github.com/xaseai/federated-agent/pkg/telemetry"
)

func main() {
	// Initialize logger
	logger, err := zap.NewProduction()
	if err != nil {
		log.Fatalf("Failed to initialize logger: %v", err)
	}
	defer logger.Sync()

	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		logger.Fatal("Failed to load configuration", zap.Error(err))
	}

	logger.Info("Starting Xase Federated Query Agent",
		zap.String("version", "1.0.0"),
		zap.String("port", cfg.Port),
		zap.Bool("outbound_only", cfg.OutboundOnly),
	)

	// Initialize components
	authService := auth.NewService(cfg.Redis, logger)
	telemetryService := telemetry.NewService(cfg.ClickHouse, logger)
	proxyService := proxy.NewService(cfg, authService, telemetryService, logger)

	// Setup HTTP router
	router := mux.NewRouter()

	// Health check
	router.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"healthy"}`))
	}).Methods("GET")

	// Federated query endpoint
	router.HandleFunc("/query", authService.Middleware(proxyService.HandleQuery)).Methods("POST")

	// Metrics endpoint
	router.HandleFunc("/metrics", telemetryService.HandleMetrics).Methods("GET")

	// HTTP server
	srv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      router,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Start server in goroutine
	go func() {
		logger.Info("Server listening", zap.String("addr", srv.Addr))
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Fatal("Server failed", zap.Error(err))
		}
	}()

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logger.Info("Shutting down server...")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		logger.Fatal("Server forced to shutdown", zap.Error(err))
	}

	logger.Info("Server exited")
}
