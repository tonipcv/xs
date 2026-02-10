package tests

import (
	"testing"

	"federated-agent/pkg/exfiltration"
	"federated-agent/pkg/rewriter"
)

// TestSQLInjectionPrevention tests that SQL injection attempts are blocked
func TestSQLInjectionPrevention(t *testing.T) {
	tests := []struct {
		name        string
		query       string
		shouldFail  bool
		description string
	}{
		{
			name:        "Basic SQL Injection",
			query:       "SELECT * FROM users WHERE id = 1 OR 1=1",
			shouldFail:  false, // This is valid SQL, policy should handle it
			description: "Basic OR 1=1 injection attempt",
		},
		{
			name:        "DROP TABLE Attempt",
			query:       "SELECT * FROM users; DROP TABLE users;",
			shouldFail:  true,
			description: "Attempt to drop table",
		},
		{
			name:        "UNION Injection",
			query:       "SELECT * FROM users UNION SELECT * FROM passwords",
			shouldFail:  false, // Valid SQL, but policy should restrict columns
			description: "UNION-based injection",
		},
		{
			name:        "Comment Injection",
			query:       "SELECT * FROM users WHERE id = 1 -- AND role = 'admin'",
			shouldFail:  false, // Valid SQL with comment
			description: "Comment-based injection",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := rewriter.ValidateQuery(tt.query)
			
			if tt.shouldFail && err == nil {
				t.Errorf("Expected query to fail validation: %s", tt.description)
			}
			
			if !tt.shouldFail && err != nil {
				t.Errorf("Query should not fail validation: %s, error: %v", tt.description, err)
			}
		})
	}
}

// TestPolicyBypass tests attempts to bypass policy enforcement
func TestPolicyBypass(t *testing.T) {
	policy := rewriter.PolicyRule{
		AllowedColumns: []string{"id", "name"},
		DeniedColumns:  []string{"ssn", "password"},
		RowFilters: []rewriter.RowFilter{
			{
				Column:   "age",
				Operator: "greater_than",
				Value:    18,
			},
		},
		Masks: []rewriter.ColumnMask{
			{
				Column: "email",
				Method: "hash",
			},
		},
	}

	rewriterInstance := rewriter.NewQueryRewriter(policy)

	tests := []struct {
		name           string
		query          string
		shouldContain  []string
		shouldNotContain []string
		description    string
	}{
		{
			name:  "Attempt to SELECT denied column",
			query: "SELECT id, name, ssn FROM users",
			shouldNotContain: []string{"ssn"},
			description: "Should filter out SSN column",
		},
		{
			name:  "Attempt to bypass row filter",
			query: "SELECT id, name FROM users WHERE age < 18",
			shouldContain: []string{"age > 18"},
			description: "Should inject age filter",
		},
		{
			name:  "Attempt to get unmasked email",
			query: "SELECT id, name, email FROM users",
			shouldContain: []string{"MD5(email)"},
			description: "Should mask email column",
		},
		{
			name:  "SELECT * expansion",
			query: "SELECT * FROM users",
			shouldContain: []string{"id", "name"},
			shouldNotContain: []string{"*"},
			description: "Should expand * to allowed columns only",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rewritten, err := rewriterInstance.RewriteQuery(tt.query)
			if err != nil {
				t.Fatalf("Query rewrite failed: %v", err)
			}

			for _, expected := range tt.shouldContain {
				if !contains(rewritten, expected) {
					t.Errorf("Rewritten query should contain '%s': %s\nGot: %s", expected, tt.description, rewritten)
				}
			}

			for _, notExpected := range tt.shouldNotContain {
				if contains(rewritten, notExpected) {
					t.Errorf("Rewritten query should NOT contain '%s': %s\nGot: %s", notExpected, tt.description, rewritten)
				}
			}
		})
	}
}

// TestExfiltrationLimits tests exfiltration prevention
func TestExfiltrationLimits(t *testing.T) {
	config := exfiltration.LimiterConfig{
		KMin:              5,
		AllowOnlyAggregates: true,
		MaxRowsPerQuery:   1000,
	}

	limiter := exfiltration.NewExfiltrationLimiter(config)

	tests := []struct {
		name        string
		query       string
		shouldFail  bool
		description string
	}{
		{
			name:        "Raw data exfiltration attempt",
			query:       "SELECT * FROM users",
			shouldFail:  true,
			description: "Should block non-aggregate query when aggregates-only is enabled",
		},
		{
			name:        "Valid aggregate query",
			query:       "SELECT COUNT(*), AVG(age) FROM users",
			shouldFail:  false,
			description: "Should allow aggregate query",
		},
		{
			name:        "GROUP BY without HAVING",
			query:       "SELECT city, COUNT(*) FROM users GROUP BY city",
			shouldFail:  true,
			description: "Should require HAVING COUNT(*) >= k for k-anonymity",
		},
		{
			name:        "GROUP BY with k-anonymity",
			query:       "SELECT city, COUNT(*) FROM users GROUP BY city HAVING COUNT(*) >= 5",
			shouldFail:  false,
			description: "Should allow GROUP BY with k-anonymity HAVING clause",
		},
		{
			name:        "Attempt to bypass with subquery",
			query:       "SELECT * FROM (SELECT id, name FROM users) AS t",
			shouldFail:  true,
			description: "Should block subquery that returns raw data",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := limiter.ValidateQuery(tt.query)
			
			if tt.shouldFail && err == nil {
				t.Errorf("Expected query to fail validation: %s", tt.description)
			}
			
			if !tt.shouldFail && err != nil {
				t.Errorf("Query should not fail validation: %s, error: %v", tt.description, err)
			}
		})
	}
}

// TestRowLimitEnforcement tests that row limits are enforced
func TestRowLimitEnforcement(t *testing.T) {
	config := exfiltration.LimiterConfig{
		KMin:              5,
		AllowOnlyAggregates: false,
		MaxRowsPerQuery:   100,
	}

	limiter := exfiltration.NewExfiltrationLimiter(config)

	tests := []struct {
		name          string
		query         string
		expectedLimit string
		description   string
	}{
		{
			name:          "Query without LIMIT",
			query:         "SELECT id, name FROM users",
			expectedLimit: "LIMIT 100",
			description:   "Should add LIMIT clause",
		},
		{
			name:          "Query with higher LIMIT",
			query:         "SELECT id, name FROM users LIMIT 1000",
			expectedLimit: "LIMIT 100",
			description:   "Should replace with lower LIMIT",
		},
		{
			name:          "Query with lower LIMIT",
			query:         "SELECT id, name FROM users LIMIT 10",
			expectedLimit: "LIMIT 10",
			description:   "Should keep lower LIMIT",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			limited, err := limiter.EnforceRowLimit(tt.query)
			if err != nil {
				t.Fatalf("Failed to enforce row limit: %v", err)
			}

			if !contains(limited, tt.expectedLimit) {
				t.Errorf("Expected query to contain '%s': %s\nGot: %s", tt.expectedLimit, tt.description, limited)
			}
		})
	}
}

// Helper function
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
