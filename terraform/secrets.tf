# AWS Secrets Manager for sensitive configuration

# Database credentials
resource "aws_secretsmanager_secret" "database_credentials" {
  name        = "${var.environment}-xase-database-credentials"
  description = "PostgreSQL database credentials for Xase"

  tags = {
    Environment = var.environment
    Project     = "xase"
    ManagedBy   = "terraform"
  }
}

resource "aws_secretsmanager_secret_version" "database_credentials" {
  secret_id = aws_secretsmanager_secret.database_credentials.id
  secret_string = jsonencode({
    username = var.db_username
    password = var.db_password
    host     = aws_db_instance.postgres.endpoint
    port     = aws_db_instance.postgres.port
    database = var.db_name
  })
}

# Redis credentials
resource "aws_secretsmanager_secret" "redis_credentials" {
  name        = "${var.environment}-xase-redis-credentials"
  description = "Redis credentials for Xase"

  tags = {
    Environment = var.environment
    Project     = "xase"
    ManagedBy   = "terraform"
  }
}

resource "aws_secretsmanager_secret_version" "redis_credentials" {
  secret_id = aws_secretsmanager_secret.redis_credentials.id
  secret_string = jsonencode({
    host     = aws_elasticache_cluster.redis.cache_nodes[0].address
    port     = aws_elasticache_cluster.redis.cache_nodes[0].port
    password = var.redis_password
  })
}

# ClickHouse credentials
resource "aws_secretsmanager_secret" "clickhouse_credentials" {
  name        = "${var.environment}-xase-clickhouse-credentials"
  description = "ClickHouse credentials for Xase"

  tags = {
    Environment = var.environment
    Project     = "xase"
    ManagedBy   = "terraform"
  }
}

resource "aws_secretsmanager_secret_version" "clickhouse_credentials" {
  secret_id = aws_secretsmanager_secret.clickhouse_credentials.id
  secret_string = jsonencode({
    host     = aws_instance.clickhouse.private_ip
    port     = 8123
    username = var.clickhouse_username
    password = var.clickhouse_password
    database = "xase"
  })
}

# NextAuth secret
resource "aws_secretsmanager_secret" "nextauth_secret" {
  name        = "${var.environment}-xase-nextauth-secret"
  description = "NextAuth secret for session encryption"

  tags = {
    Environment = var.environment
    Project     = "xase"
    ManagedBy   = "terraform"
  }
}

resource "aws_secretsmanager_secret_version" "nextauth_secret" {
  secret_id = aws_secretsmanager_secret.nextauth_secret.id
  secret_string = jsonencode({
    secret = random_password.nextauth_secret.result
  })
}

# OIDC provider credentials
resource "aws_secretsmanager_secret" "oidc_credentials" {
  name        = "${var.environment}-xase-oidc-credentials"
  description = "OIDC provider credentials (Auth0, Keycloak, etc.)"

  tags = {
    Environment = var.environment
    Project     = "xase"
    ManagedBy   = "terraform"
  }
}

resource "aws_secretsmanager_secret_version" "oidc_credentials" {
  secret_id = aws_secretsmanager_secret.oidc_credentials.id
  secret_string = jsonencode({
    auth0_domain        = var.auth0_domain
    auth0_client_id     = var.auth0_client_id
    auth0_client_secret = var.auth0_client_secret
    keycloak_url        = var.keycloak_url
    keycloak_realm      = var.keycloak_realm
    keycloak_client_id  = var.keycloak_client_id
    keycloak_client_secret = var.keycloak_client_secret
  })
}

# KMS key for encryption
resource "aws_secretsmanager_secret" "kms_key" {
  name        = "${var.environment}-xase-kms-key"
  description = "KMS key for audit log signing"

  tags = {
    Environment = var.environment
    Project     = "xase"
    ManagedBy   = "terraform"
  }
}

resource "aws_secretsmanager_secret_version" "kms_key" {
  secret_id = aws_secretsmanager_secret.kms_key.id
  secret_string = jsonencode({
    key_id  = aws_kms_key.xase.id
    key_arn = aws_kms_key.xase.arn
  })
}

# Federated agent JWT secret
resource "aws_secretsmanager_secret" "federated_jwt_secret" {
  name        = "${var.environment}-xase-federated-jwt-secret"
  description = "JWT secret for federated agent authentication"

  tags = {
    Environment = var.environment
    Project     = "xase"
    ManagedBy   = "terraform"
  }
}

resource "aws_secretsmanager_secret_version" "federated_jwt_secret" {
  secret_id = aws_secretsmanager_secret.federated_jwt_secret.id
  secret_string = jsonencode({
    secret = random_password.federated_jwt_secret.result
  })
}

# Random passwords
resource "random_password" "nextauth_secret" {
  length  = 32
  special = true
}

resource "random_password" "federated_jwt_secret" {
  length  = 32
  special = true
}

# IAM policy for EKS pods to access secrets
resource "aws_iam_policy" "secrets_access" {
  name        = "${var.environment}-xase-secrets-access"
  description = "Allow EKS pods to access Secrets Manager"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Resource = [
          aws_secretsmanager_secret.database_credentials.arn,
          aws_secretsmanager_secret.redis_credentials.arn,
          aws_secretsmanager_secret.clickhouse_credentials.arn,
          aws_secretsmanager_secret.nextauth_secret.arn,
          aws_secretsmanager_secret.oidc_credentials.arn,
          aws_secretsmanager_secret.kms_key.arn,
          aws_secretsmanager_secret.federated_jwt_secret.arn
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:DescribeKey"
        ]
        Resource = [
          aws_kms_key.secrets.arn
        ]
      }
    ]
  })
}

# KMS key for encrypting secrets
resource "aws_kms_key" "secrets" {
  description             = "KMS key for encrypting Secrets Manager secrets"
  deletion_window_in_days = 10
  enable_key_rotation     = true

  tags = {
    Environment = var.environment
    Project     = "xase"
    ManagedBy   = "terraform"
  }
}

resource "aws_kms_alias" "secrets" {
  name          = "alias/${var.environment}-xase-secrets"
  target_key_id = aws_kms_key.secrets.key_id
}

# Attach policy to EKS node role
resource "aws_iam_role_policy_attachment" "eks_secrets_access" {
  role       = aws_iam_role.eks_node_group.name
  policy_arn = aws_iam_policy.secrets_access.arn
}

# Outputs
output "database_credentials_secret_arn" {
  value       = aws_secretsmanager_secret.database_credentials.arn
  description = "ARN of database credentials secret"
}

output "redis_credentials_secret_arn" {
  value       = aws_secretsmanager_secret.redis_credentials.arn
  description = "ARN of Redis credentials secret"
}

output "clickhouse_credentials_secret_arn" {
  value       = aws_secretsmanager_secret.clickhouse_credentials.arn
  description = "ARN of ClickHouse credentials secret"
}

output "nextauth_secret_arn" {
  value       = aws_secretsmanager_secret.nextauth_secret.arn
  description = "ARN of NextAuth secret"
}

output "oidc_credentials_secret_arn" {
  value       = aws_secretsmanager_secret.oidc_credentials.arn
  description = "ARN of OIDC credentials secret"
}

output "kms_key_secret_arn" {
  value       = aws_secretsmanager_secret.kms_key.arn
  description = "ARN of KMS key secret"
}

output "federated_jwt_secret_arn" {
  value       = aws_secretsmanager_secret.federated_jwt_secret.arn
  description = "ARN of federated agent JWT secret"
}
