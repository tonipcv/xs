package rewriter

import (
	"fmt"
	"strings"

	"github.com/xwb1989/sqlparser"
)

// PolicyRule represents a policy-based query rewrite rule
type PolicyRule struct {
	AllowedColumns []string
	DeniedColumns  []string
	RowFilters     []RowFilter
	Masks          []ColumnMask
}

// RowFilter represents a row-level filter
type RowFilter struct {
	Column   string
	Operator string // equals, not_equals, greater_than, less_than, in, not_in, contains
	Value    interface{}
}

// ColumnMask represents column masking configuration
type ColumnMask struct {
	Column      string
	Method      string // redact, hash, null, regex
	Pattern     string
	Replacement string
}

// QueryRewriter rewrites SQL queries based on policy rules
type QueryRewriter struct {
	policy PolicyRule
}

// NewQueryRewriter creates a new query rewriter with policy rules
func NewQueryRewriter(policy PolicyRule) *QueryRewriter {
	return &QueryRewriter{
		policy: policy,
	}
}

// RewriteQuery rewrites a SQL query according to policy rules
func (r *QueryRewriter) RewriteQuery(query string) (string, error) {
	// Parse SQL query
	stmt, err := sqlparser.Parse(query)
	if err != nil {
		return "", fmt.Errorf("failed to parse query: %w", err)
	}

	// Only support SELECT queries
	selectStmt, ok := stmt.(*sqlparser.Select)
	if !ok {
		return "", fmt.Errorf("only SELECT queries are supported")
	}

	// Apply column filtering
	if err := r.applyColumnFiltering(selectStmt); err != nil {
		return "", err
	}

	// Apply row filtering
	if err := r.applyRowFiltering(selectStmt); err != nil {
		return "", err
	}

	// Apply column masking
	if err := r.applyColumnMasking(selectStmt); err != nil {
		return "", err
	}

	// Convert back to SQL
	rewritten := sqlparser.String(selectStmt)
	return rewritten, nil
}

// applyColumnFiltering filters columns based on allow/deny lists
func (r *QueryRewriter) applyColumnFiltering(stmt *sqlparser.Select) error {
	if len(r.policy.AllowedColumns) == 0 && len(r.policy.DeniedColumns) == 0 {
		return nil // No column filtering
	}

	// Check if SELECT *
	if len(stmt.SelectExprs) == 1 {
		if _, ok := stmt.SelectExprs[0].(*sqlparser.StarExpr); ok {
			// Replace * with allowed columns
			if len(r.policy.AllowedColumns) > 0 {
				stmt.SelectExprs = make(sqlparser.SelectExprs, 0, len(r.policy.AllowedColumns))
				for _, col := range r.policy.AllowedColumns {
					stmt.SelectExprs = append(stmt.SelectExprs, &sqlparser.AliasedExpr{
						Expr: &sqlparser.ColName{Name: sqlparser.NewColIdent(col)},
					})
				}
			}
			return nil
		}
	}

	// Filter explicit columns
	filtered := make(sqlparser.SelectExprs, 0, len(stmt.SelectExprs))
	for _, expr := range stmt.SelectExprs {
		aliasedExpr, ok := expr.(*sqlparser.AliasedExpr)
		if !ok {
			filtered = append(filtered, expr)
			continue
		}

		colName, ok := aliasedExpr.Expr.(*sqlparser.ColName)
		if !ok {
			filtered = append(filtered, expr)
			continue
		}

		columnName := colName.Name.String()

		// Check deny list
		if r.isColumnDenied(columnName) {
			continue // Skip denied column
		}

		// Check allow list
		if len(r.policy.AllowedColumns) > 0 && !r.isColumnAllowed(columnName) {
			continue // Skip non-allowed column
		}

		filtered = append(filtered, expr)
	}

	stmt.SelectExprs = filtered
	return nil
}

// applyRowFiltering adds WHERE clauses for row-level filtering
func (r *QueryRewriter) applyRowFiltering(stmt *sqlparser.Select) error {
	if len(r.policy.RowFilters) == 0 {
		return nil
	}

	for _, filter := range r.policy.RowFilters {
		condition, err := r.buildCondition(filter)
		if err != nil {
			return err
		}

		// Add to WHERE clause
		if stmt.Where == nil {
			stmt.Where = &sqlparser.Where{
				Type: sqlparser.WhereStr,
				Expr: condition,
			}
		} else {
			// AND with existing WHERE
			stmt.Where.Expr = &sqlparser.AndExpr{
				Left:  stmt.Where.Expr,
				Right: condition,
			}
		}
	}

	return nil
}

// applyColumnMasking applies masking to selected columns
func (r *QueryRewriter) applyColumnMasking(stmt *sqlparser.Select) error {
	if len(r.policy.Masks) == 0 {
		return nil
	}

	for i, expr := range stmt.SelectExprs {
		aliasedExpr, ok := expr.(*sqlparser.AliasedExpr)
		if !ok {
			continue
		}

		colName, ok := aliasedExpr.Expr.(*sqlparser.ColName)
		if !ok {
			continue
		}

		columnName := colName.Name.String()

		// Find mask for this column
		for _, mask := range r.policy.Masks {
			if mask.Column == columnName {
				maskedExpr, err := r.buildMaskExpression(colName, mask)
				if err != nil {
					return err
				}
				aliasedExpr.Expr = maskedExpr
				stmt.SelectExprs[i] = aliasedExpr
				break
			}
		}
	}

	return nil
}

// buildCondition builds a WHERE condition from a row filter
func (r *QueryRewriter) buildCondition(filter RowFilter) (sqlparser.Expr, error) {
	col := &sqlparser.ColName{Name: sqlparser.NewColIdent(filter.Column)}

	switch filter.Operator {
	case "equals":
		return &sqlparser.ComparisonExpr{
			Operator: sqlparser.EqualStr,
			Left:     col,
			Right:    r.valueToExpr(filter.Value),
		}, nil

	case "not_equals":
		return &sqlparser.ComparisonExpr{
			Operator: sqlparser.NotEqualStr,
			Left:     col,
			Right:    r.valueToExpr(filter.Value),
		}, nil

	case "greater_than":
		return &sqlparser.ComparisonExpr{
			Operator: sqlparser.GreaterThanStr,
			Left:     col,
			Right:    r.valueToExpr(filter.Value),
		}, nil

	case "less_than":
		return &sqlparser.ComparisonExpr{
			Operator: sqlparser.LessThanStr,
			Left:     col,
			Right:    r.valueToExpr(filter.Value),
		}, nil

	case "in":
		values, ok := filter.Value.([]interface{})
		if !ok {
			return nil, fmt.Errorf("IN operator requires array value")
		}
		valTuple := make(sqlparser.ValTuple, len(values))
		for i, v := range values {
			valTuple[i] = r.valueToExpr(v)
		}
		return &sqlparser.ComparisonExpr{
			Operator: sqlparser.InStr,
			Left:     col,
			Right:    valTuple,
		}, nil

	case "not_in":
		values, ok := filter.Value.([]interface{})
		if !ok {
			return nil, fmt.Errorf("NOT IN operator requires array value")
		}
		valTuple := make(sqlparser.ValTuple, len(values))
		for i, v := range values {
			valTuple[i] = r.valueToExpr(v)
		}
		return &sqlparser.ComparisonExpr{
			Operator: sqlparser.NotInStr,
			Left:     col,
			Right:    valTuple,
		}, nil

	case "contains":
		return &sqlparser.ComparisonExpr{
			Operator: sqlparser.LikeStr,
			Left:     col,
			Right:    sqlparser.NewStrVal([]byte("%" + fmt.Sprint(filter.Value) + "%")),
		}, nil

	default:
		return nil, fmt.Errorf("unsupported operator: %s", filter.Operator)
	}
}

// buildMaskExpression builds a masking expression for a column
func (r *QueryRewriter) buildMaskExpression(col *sqlparser.ColName, mask ColumnMask) (sqlparser.Expr, error) {
	switch mask.Method {
	case "redact":
		// Replace with '***REDACTED***'
		return sqlparser.NewStrVal([]byte("***REDACTED***")), nil

	case "hash":
		// Use MD5 or SHA256 function
		return &sqlparser.FuncExpr{
			Name: sqlparser.NewColIdent("MD5"),
			Exprs: sqlparser.SelectExprs{
				&sqlparser.AliasedExpr{Expr: col},
			},
		}, nil

	case "null":
		// Replace with NULL
		return &sqlparser.NullVal{}, nil

	case "regex":
		// Use REGEXP_REPLACE if available
		if mask.Pattern == "" || mask.Replacement == "" {
			return nil, fmt.Errorf("regex mask requires pattern and replacement")
		}
		return &sqlparser.FuncExpr{
			Name: sqlparser.NewColIdent("REGEXP_REPLACE"),
			Exprs: sqlparser.SelectExprs{
				&sqlparser.AliasedExpr{Expr: col},
				&sqlparser.AliasedExpr{Expr: sqlparser.NewStrVal([]byte(mask.Pattern))},
				&sqlparser.AliasedExpr{Expr: sqlparser.NewStrVal([]byte(mask.Replacement))},
			},
		}, nil

	default:
		return nil, fmt.Errorf("unsupported mask method: %s", mask.Method)
	}
}

// valueToExpr converts a Go value to a SQL expression
func (r *QueryRewriter) valueToExpr(value interface{}) sqlparser.Expr {
	switch v := value.(type) {
	case string:
		return sqlparser.NewStrVal([]byte(v))
	case int, int64, int32:
		return sqlparser.NewIntVal([]byte(fmt.Sprint(v)))
	case float64, float32:
		return sqlparser.NewFloatVal([]byte(fmt.Sprint(v)))
	case bool:
		if v {
			return sqlparser.NewIntVal([]byte("1"))
		}
		return sqlparser.NewIntVal([]byte("0"))
	case nil:
		return &sqlparser.NullVal{}
	default:
		return sqlparser.NewStrVal([]byte(fmt.Sprint(v)))
	}
}

// isColumnAllowed checks if a column is in the allow list
func (r *QueryRewriter) isColumnAllowed(column string) bool {
	for _, allowed := range r.policy.AllowedColumns {
		if strings.EqualFold(allowed, column) {
			return true
		}
	}
	return false
}

// isColumnDenied checks if a column is in the deny list
func (r *QueryRewriter) isColumnDenied(column string) bool {
	for _, denied := range r.policy.DeniedColumns {
		if strings.EqualFold(denied, column) {
			return true
		}
	}
	return false
}

// ValidateQuery validates that a query is safe (SELECT only, no DDL/DML)
func ValidateQuery(query string) error {
	stmt, err := sqlparser.Parse(query)
	if err != nil {
		return fmt.Errorf("invalid SQL: %w", err)
	}

	// Only allow SELECT
	if _, ok := stmt.(*sqlparser.Select); !ok {
		return fmt.Errorf("only SELECT queries are allowed")
	}

	return nil
}
