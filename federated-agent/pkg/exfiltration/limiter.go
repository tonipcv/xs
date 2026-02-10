package exfiltration

import (
	"fmt"
	"strings"

	"github.com/xwb1989/sqlparser"
)

// ExfiltrationLimiter enforces limits on data exfiltration
type ExfiltrationLimiter struct {
	kMin              int  // Minimum k-anonymity
	allowOnlyAggregates bool // Only allow aggregate queries
	maxRowsPerQuery   int  // Maximum rows per query
}

// LimiterConfig holds configuration for exfiltration limiter
type LimiterConfig struct {
	KMin              int
	AllowOnlyAggregates bool
	MaxRowsPerQuery   int
}

// NewExfiltrationLimiter creates a new exfiltration limiter
func NewExfiltrationLimiter(config LimiterConfig) *ExfiltrationLimiter {
	kMin := config.KMin
	if kMin == 0 {
		kMin = 5 // Default k-anonymity threshold
	}

	maxRows := config.MaxRowsPerQuery
	if maxRows == 0 {
		maxRows = 10000 // Default max rows
	}

	return &ExfiltrationLimiter{
		kMin:              kMin,
		allowOnlyAggregates: config.AllowOnlyAggregates,
		maxRowsPerQuery:   maxRows,
	}
}

// ValidateQuery validates a query against exfiltration policies
func (l *ExfiltrationLimiter) ValidateQuery(query string) error {
	// Parse SQL query
	stmt, err := sqlparser.Parse(query)
	if err != nil {
		return fmt.Errorf("failed to parse query: %w", err)
	}

	// Only support SELECT queries
	selectStmt, ok := stmt.(*sqlparser.Select)
	if !ok {
		return fmt.Errorf("only SELECT queries are allowed")
	}

	// Check if only aggregates are allowed
	if l.allowOnlyAggregates {
		if err := l.validateAggregatesOnly(selectStmt); err != nil {
			return err
		}
	}

	// Check for k-anonymity compliance
	if err := l.validateKAnonymity(selectStmt); err != nil {
		return err
	}

	return nil
}

// validateAggregatesOnly ensures query only returns aggregates
func (l *ExfiltrationLimiter) validateAggregatesOnly(stmt *sqlparser.Select) error {
	hasAggregates := false
	hasNonAggregates := false

	for _, expr := range stmt.SelectExprs {
		switch e := expr.(type) {
		case *sqlparser.AliasedExpr:
			if l.isAggregateFunction(e.Expr) {
				hasAggregates = true
			} else if !l.isGroupByColumn(e.Expr, stmt.GroupBy) {
				hasNonAggregates = true
			}
		case *sqlparser.StarExpr:
			// SELECT * is not allowed with aggregates-only policy
			return fmt.Errorf("SELECT * not allowed with aggregates-only policy")
		}
	}

	// If we have non-aggregates and no GROUP BY, it's a violation
	if hasNonAggregates && stmt.GroupBy == nil {
		return fmt.Errorf("only aggregate queries are allowed (use COUNT, SUM, AVG, etc.)")
	}

	// If we have aggregates, ensure proper GROUP BY
	if hasAggregates && hasNonAggregates && stmt.GroupBy == nil {
		return fmt.Errorf("non-aggregate columns must be in GROUP BY clause")
	}

	return nil
}

// validateKAnonymity checks if query respects k-anonymity threshold
func (l *ExfiltrationLimiter) validateKAnonymity(stmt *sqlparser.Select) error {
	// Check if query has GROUP BY
	if stmt.GroupBy == nil {
		// No GROUP BY means potentially returning individual rows
		// This is only allowed if we have aggregates that ensure k-anonymity
		hasCountAggregate := false
		for _, expr := range stmt.SelectExprs {
			if aliased, ok := expr.(*sqlparser.AliasedExpr); ok {
				if l.isCountFunction(aliased.Expr) {
					hasCountAggregate = true
					break
				}
			}
		}

		if !hasCountAggregate && l.allowOnlyAggregates {
			return fmt.Errorf("queries must include COUNT aggregate to ensure k-anonymity >= %d", l.kMin)
		}
	} else {
		// Has GROUP BY - need to ensure HAVING COUNT(*) >= k
		if !l.hasKAnonymityHaving(stmt) {
			return fmt.Errorf("GROUP BY queries must include HAVING COUNT(*) >= %d for k-anonymity", l.kMin)
		}
	}

	return nil
}

// hasKAnonymityHaving checks if HAVING clause enforces k-anonymity
func (l *ExfiltrationLimiter) hasKAnonymityHaving(stmt *sqlparser.Select) bool {
	if stmt.Having == nil {
		return false
	}

	// Check if HAVING contains COUNT(*) >= k condition
	// This is a simplified check - in production, you'd want more sophisticated parsing
	havingStr := sqlparser.String(stmt.Having)
	return strings.Contains(havingStr, "count(*)") && 
	       (strings.Contains(havingStr, fmt.Sprintf(">= %d", l.kMin)) ||
	        strings.Contains(havingStr, fmt.Sprintf("> %d", l.kMin-1)))
}

// isAggregateFunction checks if an expression is an aggregate function
func (l *ExfiltrationLimiter) isAggregateFunction(expr sqlparser.Expr) bool {
	funcExpr, ok := expr.(*sqlparser.FuncExpr)
	if !ok {
		return false
	}

	funcName := strings.ToUpper(funcExpr.Name.String())
	aggregateFuncs := []string{"COUNT", "SUM", "AVG", "MIN", "MAX", "STDDEV", "VARIANCE"}

	for _, agg := range aggregateFuncs {
		if funcName == agg {
			return true
		}
	}

	return false
}

// isCountFunction checks if an expression is COUNT(*)
func (l *ExfiltrationLimiter) isCountFunction(expr sqlparser.Expr) bool {
	funcExpr, ok := expr.(*sqlparser.FuncExpr)
	if !ok {
		return false
	}

	return strings.ToUpper(funcExpr.Name.String()) == "COUNT"
}

// isGroupByColumn checks if an expression is in the GROUP BY clause
func (l *ExfiltrationLimiter) isGroupByColumn(expr sqlparser.Expr, groupBy sqlparser.GroupBy) bool {
	if groupBy == nil {
		return false
	}

	exprStr := sqlparser.String(expr)
	for _, groupExpr := range groupBy {
		if sqlparser.String(groupExpr) == exprStr {
			return true
		}
	}

	return false
}

// EnforceRowLimit adds or updates LIMIT clause to enforce max rows
func (l *ExfiltrationLimiter) EnforceRowLimit(query string) (string, error) {
	stmt, err := sqlparser.Parse(query)
	if err != nil {
		return "", fmt.Errorf("failed to parse query: %w", err)
	}

	selectStmt, ok := stmt.(*sqlparser.Select)
	if !ok {
		return "", fmt.Errorf("only SELECT queries are supported")
	}

	// Check if LIMIT already exists
	if selectStmt.Limit != nil {
		// If existing LIMIT is higher than max, replace it
		if limit, ok := selectStmt.Limit.Rowcount.(*sqlparser.SQLVal); ok {
			existingLimit := string(limit.Val)
			if len(existingLimit) > 0 {
				// Keep existing limit if it's lower than max
				return query, nil
			}
		}
	}

	// Add LIMIT clause
	selectStmt.Limit = &sqlparser.Limit{
		Rowcount: sqlparser.NewIntVal([]byte(fmt.Sprintf("%d", l.maxRowsPerQuery))),
	}

	return sqlparser.String(selectStmt), nil
}

// GetKMin returns the k-anonymity threshold
func (l *ExfiltrationLimiter) GetKMin() int {
	return l.kMin
}

// GetMaxRows returns the maximum rows per query
func (l *ExfiltrationLimiter) GetMaxRows() int {
	return l.maxRowsPerQuery
}

// IsAggregatesOnly returns whether only aggregates are allowed
func (l *ExfiltrationLimiter) IsAggregatesOnly() bool {
	return l.allowOnlyAggregates
}

// ValidateKAnonymityResults validates that query results meet k-anonymity threshold
func (l *ExfiltrationLimiter) ValidateKAnonymityResults(rowCount int) error {
	if rowCount > 0 && rowCount < l.kMin {
		return fmt.Errorf("query returns %d rows, minimum %d required for k-anonymity", rowCount, l.kMin)
	}
	return nil
}
