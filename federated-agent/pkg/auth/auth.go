package auth

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	"github.com/go-redis/redis/v8"
	"github.com/golang-jwt/jwt/v5"
	"go.uber.org/zap"

	"github.com/xaseai/federated-agent/pkg/config"
)

type Service struct {
	redis  *redis.Client
	logger *zap.Logger
}

type AuthContext struct {
	TenantID string
	UserID   string
	LeaseID  string
}

type contextKey string

const authContextKey contextKey = "auth"

func NewService(cfg config.RedisConfig, logger *zap.Logger) *Service {
	rdb := redis.NewClient(&redis.Options{
		Addr:     strings.TrimPrefix(cfg.URL, "redis://"),
		Password: cfg.Password,
		DB:       0,
	})

	return &Service{
		redis:  rdb,
		logger: logger,
	}
}

func (s *Service) Middleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Extract token from Authorization header
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			http.Error(w, "Missing Authorization header", http.StatusUnauthorized)
			return
		}

		tokenString := strings.TrimPrefix(authHeader, "Bearer ")
		if tokenString == authHeader {
			http.Error(w, "Invalid Authorization header format", http.StatusUnauthorized)
			return
		}

		// Validate token
		authCtx, err := s.validateToken(r.Context(), tokenString)
		if err != nil {
			s.logger.Warn("Token validation failed", zap.Error(err))
			http.Error(w, "Invalid token", http.StatusUnauthorized)
			return
		}

		// Add auth context to request
		ctx := context.WithValue(r.Context(), authContextKey, authCtx)
		next.ServeHTTP(w, r.WithContext(ctx))
	}
}

func (s *Service) validateToken(ctx context.Context, tokenString string) (*AuthContext, error) {
	// Parse JWT token
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		// Validate signing method
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		// Return secret key (should be from env)
		return []byte("your-secret-key"), nil
	})

	if err != nil {
		return nil, fmt.Errorf("failed to parse token: %w", err)
	}

	if !token.Valid {
		return nil, fmt.Errorf("invalid token")
	}

	// Extract claims
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return nil, fmt.Errorf("invalid claims")
	}

	tenantID, _ := claims["tenant_id"].(string)
	userID, _ := claims["user_id"].(string)
	leaseID, _ := claims["lease_id"].(string)

	if tenantID == "" || userID == "" {
		return nil, fmt.Errorf("missing required claims")
	}

	// Check if lease is active in Redis
	if leaseID != "" {
		active, err := s.redis.Get(ctx, fmt.Sprintf("lease:%s", leaseID)).Result()
		if err != nil || active != "active" {
			return nil, fmt.Errorf("lease not active")
		}
	}

	return &AuthContext{
		TenantID: tenantID,
		UserID:   userID,
		LeaseID:  leaseID,
	}, nil
}

func GetContext(ctx context.Context) *AuthContext {
	authCtx, ok := ctx.Value(authContextKey).(*AuthContext)
	if !ok {
		return nil
	}
	return authCtx
}
