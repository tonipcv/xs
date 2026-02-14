package config

import (
	"fmt"
	"os"
)

type Config struct {
	Port          string
	OutboundOnly  bool
	Redis         RedisConfig
	ClickHouse    ClickHouseConfig
	AllowedHosts  []string
	MaxQueryTime  int // seconds
	MaxResultSize int // MB
    NextJSURL     string // Base URL for Next.js API (policy source)
}

type RedisConfig struct {
	URL      string
	Password string
}

type ClickHouseConfig struct {
	URL      string
	User     string
	Password string
	Database string
}

func Load() (*Config, error) {
	cfg := &Config{
		Port:          getEnv("PORT", "8080"),
		OutboundOnly:  getEnv("OUTBOUND_ONLY", "true") == "true",
		MaxQueryTime:  30,
		MaxResultSize: 100, // 100MB max
        NextJSURL:     getEnv("NEXTJS_URL", "http://localhost:3000"),
		Redis: RedisConfig{
			URL:      getEnv("REDIS_URL", "redis://localhost:6379"),
			Password: getEnv("REDIS_PASSWORD", ""),
		},
		ClickHouse: ClickHouseConfig{
			URL:      getEnv("CLICKHOUSE_URL", "http://localhost:8123"),
			User:     getEnv("CLICKHOUSE_USER", "xase"),
			Password: getEnv("CLICKHOUSE_PASSWORD", "xase_dev_password"),
			Database: getEnv("CLICKHOUSE_DATABASE", "xase_audit"),
		},
		AllowedHosts: []string{
			"postgres.xase.internal",
			"clickhouse.xase.internal",
			"redshift.xase.internal",
		},
	}

	// Validate required fields
	if cfg.Redis.URL == "" {
		return nil, fmt.Errorf("REDIS_URL is required")
	}

	return cfg, nil
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
