package connectors

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	_ "github.com/lib/pq"
)

// PostgresConnector handles PostgreSQL database connections and queries
type PostgresConnector struct {
	db             *sql.DB
	connectionStr  string
	maxConnections int
	timeout        time.Duration
}

// PostgresConfig holds configuration for Postgres connection
type PostgresConfig struct {
	Host           string
	Port           int
	Database       string
	User           string
	Password       string
	SSLMode        string
	MaxConnections int
	Timeout        time.Duration
}

// NewPostgresConnector creates a new Postgres connector
func NewPostgresConnector(config PostgresConfig) (*PostgresConnector, error) {
	// Build connection string
	connStr := fmt.Sprintf(
		"host=%s port=%d user=%s password=%s dbname=%s sslmode=%s",
		config.Host,
		config.Port,
		config.User,
		config.Password,
		config.Database,
		config.SSLMode,
	)

	// Open database connection
	db, err := sql.Open("postgres", connStr)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	// Set connection pool settings
	maxConns := config.MaxConnections
	if maxConns == 0 {
		maxConns = 10
	}
	db.SetMaxOpenConns(maxConns)
	db.SetMaxIdleConns(maxConns / 2)
	db.SetConnMaxLifetime(time.Hour)

	// Test connection
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := db.PingContext(ctx); err != nil {
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	timeout := config.Timeout
	if timeout == 0 {
		timeout = 30 * time.Second
	}

	return &PostgresConnector{
		db:             db,
		connectionStr:  connStr,
		maxConnections: maxConns,
		timeout:        timeout,
	}, nil
}

// ExecuteQuery executes a SELECT query and returns results
func (c *PostgresConnector) ExecuteQuery(ctx context.Context, query string, args ...interface{}) ([]map[string]interface{}, error) {
	// Apply timeout
	queryCtx, cancel := context.WithTimeout(ctx, c.timeout)
	defer cancel()

	// Execute query
	rows, err := c.db.QueryContext(queryCtx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("query execution failed: %w", err)
	}
	defer rows.Close()

	// Get column names
	columns, err := rows.Columns()
	if err != nil {
		return nil, fmt.Errorf("failed to get columns: %w", err)
	}

	// Prepare result slice
	results := make([]map[string]interface{}, 0)

	// Scan rows
	for rows.Next() {
		// Create slice for column values
		values := make([]interface{}, len(columns))
		valuePtrs := make([]interface{}, len(columns))
		for i := range values {
			valuePtrs[i] = &values[i]
		}

		// Scan row
		if err := rows.Scan(valuePtrs...); err != nil {
			return nil, fmt.Errorf("failed to scan row: %w", err)
		}

		// Build result map
		row := make(map[string]interface{})
		for i, col := range columns {
			val := values[i]

			// Convert []byte to string for text types
			if b, ok := val.([]byte); ok {
				row[col] = string(b)
			} else {
				row[col] = val
			}
		}

		results = append(results, row)
	}

	// Check for errors during iteration
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("row iteration error: %w", err)
	}

	return results, nil
}

// ExecuteQueryWithLimit executes a query with row limit enforcement
func (c *PostgresConnector) ExecuteQueryWithLimit(ctx context.Context, query string, maxRows int, args ...interface{}) ([]map[string]interface{}, error) {
	// Add LIMIT clause if not present
	limitedQuery := query
	if maxRows > 0 {
		limitedQuery = fmt.Sprintf("%s LIMIT %d", query, maxRows)
	}

	return c.ExecuteQuery(ctx, limitedQuery, args...)
}

// GetTableSchema returns schema information for a table
func (c *PostgresConnector) GetTableSchema(ctx context.Context, tableName string) ([]map[string]interface{}, error) {
	query := `
		SELECT 
			column_name,
			data_type,
			is_nullable,
			column_default
		FROM information_schema.columns
		WHERE table_name = $1
		ORDER BY ordinal_position
	`

	return c.ExecuteQuery(ctx, query, tableName)
}

// ValidateQuery performs basic validation on a query
func (c *PostgresConnector) ValidateQuery(query string) error {
	// Check for dangerous operations
	dangerousKeywords := []string{
		"DROP", "DELETE", "UPDATE", "INSERT", "ALTER",
		"CREATE", "TRUNCATE", "GRANT", "REVOKE",
	}

	queryUpper := query
	for _, keyword := range dangerousKeywords {
		if contains(queryUpper, keyword) {
			return fmt.Errorf("query contains forbidden keyword: %s", keyword)
		}
	}

	return nil
}

// GetRowCount returns the number of rows that would be returned by a query
func (c *PostgresConnector) GetRowCount(ctx context.Context, query string, args ...interface{}) (int, error) {
	// Wrap query in COUNT(*)
	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM (%s) AS subquery", query)

	queryCtx, cancel := context.WithTimeout(ctx, c.timeout)
	defer cancel()

	var count int
	err := c.db.QueryRowContext(queryCtx, countQuery, args...).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("failed to get row count: %w", err)
	}

	return count, nil
}

// Close closes the database connection
func (c *PostgresConnector) Close() error {
	if c.db != nil {
		return c.db.Close()
	}
	return nil
}

// HealthCheck checks if the database connection is healthy
func (c *PostgresConnector) HealthCheck(ctx context.Context) error {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	return c.db.PingContext(ctx)
}

// GetStats returns connection pool statistics
func (c *PostgresConnector) GetStats() sql.DBStats {
	return c.db.Stats()
}

// contains checks if a string contains a substring (case-insensitive)
func contains(s, substr string) bool {
	return len(s) >= len(substr) && 
		(s == substr || 
		 len(s) > len(substr) && 
		 (s[:len(substr)] == substr || 
		  s[len(s)-len(substr):] == substr ||
		  containsMiddle(s, substr)))
}

func containsMiddle(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
