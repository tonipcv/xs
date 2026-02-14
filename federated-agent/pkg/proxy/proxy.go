package proxy

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	_ "github.com/lib/pq"
	"go.uber.org/zap"

	"github.com/xaseai/federated-agent/pkg/auth"
	"github.com/xaseai/federated-agent/pkg/config"
	"github.com/xaseai/federated-agent/pkg/connectors"
	"github.com/xaseai/federated-agent/pkg/exfiltration"
	"github.com/xaseai/federated-agent/pkg/rewriter"
	"github.com/xaseai/federated-agent/pkg/telemetry"
)

type Service struct {
	cfg       *config.Config
	auth      *auth.Service
	telemetry *telemetry.Service
	logger    *zap.Logger
	rewriter  *rewriter.QueryRewriter
	limiter   *exfiltration.ExfiltrationLimiter
	pgConnector *connectors.PostgresConnector
}

// loadPolicyFromAPI fetches VoiceAccessPolicy from Next.js API and maps to rewriter.PolicyRule
func (s *Service) loadPolicyFromAPI(ctx context.Context, metadata map[string]interface{}) (*rewriter.PolicyRule, error) {
    if metadata == nil {
        return nil, fmt.Errorf("no metadata provided")
    }
    base := strings.TrimRight(s.cfg.NextJSURL, "/")
    if base == "" {
        return nil, fmt.Errorf("NEXTJS_URL is not configured")
    }

    var policyURL string
    if v, ok := metadata["policyId"].(string); ok && v != "" {
        policyURL = fmt.Sprintf("%s/api/v1/policies/%s", base, v)
    } else {
        tenantId, _ := metadata["tenantId"].(string)
        datasetId, _ := metadata["datasetId"].(string)
        if tenantId == "" || datasetId == "" {
            return nil, fmt.Errorf("insufficient metadata for policy lookup")
        }
        q := url.Values{}
        q.Set("tenantId", tenantId)
        q.Set("datasetId", datasetId)
        policyURL = fmt.Sprintf("%s/api/v1/policies?%s", base, q.Encode())
    }

    req, err := http.NewRequestWithContext(ctx, http.MethodGet, policyURL, nil)
    if err != nil {
        return nil, err
    }
    resp, err := http.DefaultClient.Do(req)
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()
    if resp.StatusCode != http.StatusOK {
        return nil, fmt.Errorf("policy api returned %d", resp.StatusCode)
    }

    var body interface{}
    if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
        return nil, err
    }

    var obj map[string]interface{}
    switch v := body.(type) {
    case map[string]interface{}:
        obj = v
    case []interface{}:
        if len(v) > 0 {
            if m, ok := v[0].(map[string]interface{}); ok {
                obj = m
            }
        }
    }
    if obj == nil {
        return nil, fmt.Errorf("invalid policy response")
    }

    rule := &rewriter.PolicyRule{}
    if ac, ok := obj["allowedColumns"].([]interface{}); ok {
        for _, e := range ac {
            if s, ok := e.(string); ok {
                rule.AllowedColumns = append(rule.AllowedColumns, s)
            }
        }
    }
    if dc, ok := obj["deniedColumns"].([]interface{}); ok {
        for _, e := range dc {
            if s, ok := e.(string); ok {
                rule.DeniedColumns = append(rule.DeniedColumns, s)
            }
        }
    }
    if rf, ok := obj["rowFilters"].(map[string]interface{}); ok {
        for k, v := range rf {
            rule.RowFilters = append(rule.RowFilters, rewriter.RowFilter{ Column: k, Operator: "equals", Value: v })
        }
    }
    if mr, ok := obj["maskingRules"].(map[string]interface{}); ok {
        for k, mv := range mr {
            if method, ok := mv.(string); ok {
                rule.Masks = append(rule.Masks, rewriter.ColumnMask{ Column: k, Method: method })
            }
        }
    }
    return rule, nil
}

type QueryRequest struct {
	DataSourceURL string                 `json:"dataSourceUrl"`
	Query         string                 `json:"query"`
	Parameters    []interface{}          `json:"parameters,omitempty"`
	Metadata      map[string]interface{} `json:"metadata,omitempty"`
}

type QueryResponse struct {
	Columns []string                 `json:"columns"`
	Rows    [][]interface{}          `json:"rows"`
	RowCount int                     `json:"rowCount"`
	Metadata map[string]interface{}  `json:"metadata,omitempty"`
}

func NewService(cfg *config.Config, auth *auth.Service, telemetry *telemetry.Service, logger *zap.Logger) *Service {
	return &Service{
		cfg:       cfg,
		auth:      auth,
		telemetry: telemetry,
		logger:    logger,
	}
}

func (s *Service) HandleQuery(w http.ResponseWriter, r *http.Request) {
	startTime := time.Now()

	// Get authenticated context
	ctx := r.Context()
	authCtx := auth.GetContext(ctx)
	if authCtx == nil {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Parse request body
	var req QueryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Validate data source (outbound-only)
	if err := s.validateDataSource(req.DataSourceURL); err != nil {
		s.logger.Warn("Invalid data source",
			zap.String("url", req.DataSourceURL),
			zap.Error(err),
		)
		http.Error(w, fmt.Sprintf("Invalid data source: %v", err), http.StatusForbidden)
		return
	}

	// Validate query (SELECT only, no DDL/DML)
	if err := rewriter.ValidateQuery(req.Query); err != nil {
		s.logger.Warn("Invalid query",
			zap.String("query", req.Query),
			zap.Error(err),
		)
		http.Error(w, fmt.Sprintf("Invalid query: %v", err), http.StatusBadRequest)
		return
	}

	// Apply policy if provided
	rewrittenQuery := req.Query
	if pol, err := s.loadPolicyFromAPI(r.Context(), req.Metadata); err == nil && pol != nil {
		qr := rewriter.NewQueryRewriter(*pol)
		if rq, err := qr.RewriteQuery(req.Query); err == nil {
			rewrittenQuery = rq
		} else {
			s.logger.Warn("Policy rewrite failed", zap.Error(err))
		}
	} else if err != nil {
		s.logger.Warn("Policy load failed", zap.Error(err))
	}

	// Validate exfiltration limits
	if err := s.limiter.ValidateQuery(rewrittenQuery); err != nil {
		http.Error(w, fmt.Sprintf("Exfiltration policy violation: %v", err), http.StatusForbidden)
		return
	}

	// Enforce row limit
	limitedQuery, err := s.limiter.EnforceRowLimit(rewrittenQuery)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to enforce row limit: %v", err), http.StatusInternalServerError)
		return
	}

	// Execute query using the rewritten + limited SQL
	req.Query = limitedQuery
	result, err := s.executeQuery(ctx, req)
	if err != nil {
		s.logger.Error("Query execution failed",
			zap.String("tenant", authCtx.TenantID),
			zap.Error(err),
		)
		http.Error(w, fmt.Sprintf("Query failed: %v", err), http.StatusInternalServerError)
		return
	}

	// Validate k-anonymity on results
	if err := s.limiter.ValidateKAnonymityResults(result.RowCount); err != nil {
		s.logger.Warn("K-anonymity violation",
			zap.String("tenant", authCtx.TenantID),
			zap.Int("rowCount", result.RowCount),
			zap.Error(err),
		)
		http.Error(w, fmt.Sprintf("K-anonymity violation: %v", err), http.StatusForbidden)
		return
	}

	// Log telemetry
	duration := time.Since(startTime)
	s.telemetry.LogQuery(ctx, telemetry.QueryLog{
		TenantID:      authCtx.TenantID,
		UserID:        authCtx.UserID,
		DataSourceURL: req.DataSourceURL,
		Query:         req.Query,
		RowCount:      result.RowCount,
		Duration:      duration,
		Success:       true,
	})

	// Return result
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

func (s *Service) validateDataSource(dataSourceURL string) error {
	if s.cfg.OutboundOnly {
		// Parse URL
		u, err := url.Parse(dataSourceURL)
		if err != nil {
			return fmt.Errorf("invalid URL: %w", err)
		}

		// Check if host is in allowed list
		allowed := false
		for _, host := range s.cfg.AllowedHosts {
			if u.Host == host || strings.HasSuffix(u.Host, "."+host) {
				allowed = true
				break
			}
		}

		if !allowed {
			return fmt.Errorf("host not in allowlist: %s", u.Host)
		}

		// Ensure outbound only (no localhost, private IPs)
		if strings.Contains(u.Host, "localhost") ||
			strings.HasPrefix(u.Host, "127.") ||
			strings.HasPrefix(u.Host, "10.") ||
			strings.HasPrefix(u.Host, "172.16.") ||
			strings.HasPrefix(u.Host, "192.168.") {
			return fmt.Errorf("private/local addresses not allowed")
		}
	}

	return nil
}

func (s *Service) validateQuery(query string) error {
	// Convert to lowercase for checking
	lowerQuery := strings.ToLower(strings.TrimSpace(query))

	// Only allow SELECT queries
	if !strings.HasPrefix(lowerQuery, "select") {
		return fmt.Errorf("only SELECT queries allowed")
	}

	// Deny dangerous keywords
	dangerousKeywords := []string{
		"drop", "delete", "insert", "update", "alter", "create",
		"truncate", "grant", "revoke", "exec", "execute",
	}

	for _, keyword := range dangerousKeywords {
		if strings.Contains(lowerQuery, keyword) {
			return fmt.Errorf("query contains forbidden keyword: %s", keyword)
		}
	}

	return nil
}

func (s *Service) executeQuery(ctx context.Context, req QueryRequest) (*QueryResponse, error) {
	// Connect to database
	db, err := sql.Open("postgres", req.DataSourceURL)
	if err != nil {
		return nil, fmt.Errorf("failed to connect: %w", err)
	}
	defer db.Close()

	// Set connection limits
	db.SetMaxOpenConns(5)
	db.SetMaxIdleConns(2)
	db.SetConnMaxLifetime(5 * time.Minute)

	// Execute query
	rows, err := db.QueryContext(ctx, req.Query, req.Parameters...)
	if err != nil {
		return nil, fmt.Errorf("query failed: %w", err)
	}
	defer rows.Close()

	// Get column names
	columns, err := rows.Columns()
	if err != nil {
		return nil, fmt.Errorf("failed to get columns: %w", err)
	}

	// Fetch rows
	var result [][]interface{}
	maxRows := 10000 // Limit to 10K rows

	for rows.Next() && len(result) < maxRows {
		// Create slice for row values
		values := make([]interface{}, len(columns))
		valuePtrs := make([]interface{}, len(columns))
		for i := range values {
			valuePtrs[i] = &values[i]
		}

		// Scan row
		if err := rows.Scan(valuePtrs...); err != nil {
			return nil, fmt.Errorf("failed to scan row: %w", err)
		}

		// Convert byte arrays to strings
		for i, v := range values {
			if b, ok := v.([]byte); ok {
				values[i] = string(b)
			}
		}

		result = append(result, values)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("row iteration error: %w", err)
	}

	return &QueryResponse{
		Columns:  columns,
		Rows:     result,
		RowCount: len(result),
		Metadata: map[string]interface{}{
			"truncated": len(result) >= maxRows,
		},
	}, nil
}
