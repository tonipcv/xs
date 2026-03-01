/**
 * Multi-Region Deployment Configuration
 * F3-008: Multi-Region Deployment
 * Regions: us-east-1 (primary), eu-west-1, sa-east-1
 */

# Primary Region: us-east-1
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}

# Secondary Region: eu-west-1
provider "aws" {
  alias  = "eu_west_1"
  region = "eu-west-1"
}

# Tertiary Region: sa-east-1
provider "aws" {
  alias  = "sa_east_1"
  region = "sa-east-1"
}

# Route53 Hosted Zone for DNS
resource "aws_route53_zone" "main" {
  name = var.domain_name
}

# Route53 Health Checks
resource "aws_route53_health_check" "us_east_1" {
  fqdn              = "us-east-1.${var.domain_name}"
  port              = 443
  type              = "HTTPS"
  resource_path     = "/api/health"
  failure_threshold = 3
  request_interval  = 30

  tags = {
    Name = "xase-health-check-us-east-1"
  }
}

resource "aws_route53_health_check" "eu_west_1" {
  fqdn              = "eu-west-1.${var.domain_name}"
  port              = 443
  type              = "HTTPS"
  resource_path     = "/api/health"
  failure_threshold = 3
  request_interval  = 30

  tags = {
    Name = "xase-health-check-eu-west-1"
  }
}

resource "aws_route53_health_check" "sa_east_1" {
  fqdn              = "sa-east-1.${var.domain_name}"
  port              = 443
  type              = "HTTPS"
  resource_path     = "/api/health"
  failure_threshold = 3
  request_interval  = 30

  tags = {
    Name = "xase-health-check-sa-east-1"
  }
}

# Route53 Latency-Based Routing
resource "aws_route53_record" "us_east_1" {
  zone_id = aws_route53_zone.main.zone_id
  name    = var.domain_name
  type    = "A"

  set_identifier = "us-east-1"
  latency_routing_policy {
    region = "us-east-1"
  }

  alias {
    name                   = aws_lb.us_east_1.dns_name
    zone_id                = aws_lb.us_east_1.zone_id
    evaluate_target_health = true
  }

  health_check_id = aws_route53_health_check.us_east_1.id
}

resource "aws_route53_record" "eu_west_1" {
  zone_id = aws_route53_zone.main.zone_id
  name    = var.domain_name
  type    = "A"

  set_identifier = "eu-west-1"
  latency_routing_policy {
    region = "eu-west-1"
  }

  alias {
    name                   = aws_lb.eu_west_1.dns_name
    zone_id                = aws_lb.eu_west_1.zone_id
    evaluate_target_health = true
  }

  health_check_id = aws_route53_health_check.eu_west_1.id
}

resource "aws_route53_record" "sa_east_1" {
  zone_id = aws_route53_zone.main.zone_id
  name    = var.domain_name
  type    = "A"

  set_identifier = "sa-east-1"
  latency_routing_policy {
    region = "sa-east-1"
  }

  alias {
    name                   = aws_lb.sa_east_1.dns_name
    zone_id                = aws_lb.sa_east_1.zone_id
    evaluate_target_health = true
  }

  health_check_id = aws_route53_health_check.sa_east_1.id
}

# RDS Primary Instance (us-east-1)
resource "aws_db_instance" "primary" {
  provider = aws.us_east_1

  identifier     = "xase-db-primary"
  engine         = "postgres"
  engine_version = "15.4"
  instance_class = "db.r6g.xlarge"

  allocated_storage     = 100
  max_allocated_storage = 1000
  storage_encrypted     = true
  kms_key_id            = aws_kms_key.us_east_1.arn

  db_name  = "xase"
  username = var.db_username
  password = var.db_password

  backup_retention_period = 30
  backup_window           = "03:00-04:00"
  maintenance_window      = "mon:04:00-mon:05:00"

  multi_az               = true
  publicly_accessible    = false
  vpc_security_group_ids = [aws_security_group.rds_us_east_1.id]
  db_subnet_group_name   = aws_db_subnet_group.us_east_1.name

  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]

  tags = {
    Name        = "xase-db-primary"
    Environment = "production"
    Region      = "us-east-1"
  }
}

# RDS Read Replica (eu-west-1)
resource "aws_db_instance" "replica_eu" {
  provider = aws.eu_west_1

  identifier     = "xase-db-replica-eu"
  replicate_source_db = aws_db_instance.primary.arn

  instance_class = "db.r6g.xlarge"
  
  storage_encrypted = true
  kms_key_id        = aws_kms_key.eu_west_1.arn

  backup_retention_period = 7
  
  multi_az               = true
  publicly_accessible    = false
  vpc_security_group_ids = [aws_security_group.rds_eu_west_1.id]

  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]

  tags = {
    Name        = "xase-db-replica-eu"
    Environment = "production"
    Region      = "eu-west-1"
  }
}

# RDS Read Replica (sa-east-1)
resource "aws_db_instance" "replica_sa" {
  provider = aws.sa_east_1

  identifier     = "xase-db-replica-sa"
  replicate_source_db = aws_db_instance.primary.arn

  instance_class = "db.r6g.xlarge"
  
  storage_encrypted = true
  kms_key_id        = aws_kms_key.sa_east_1.arn

  backup_retention_period = 7
  
  multi_az               = true
  publicly_accessible    = false
  vpc_security_group_ids = [aws_security_group.rds_sa_east_1.id]

  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]

  tags = {
    Name        = "xase-db-replica-sa"
    Environment = "production"
    Region      = "sa-east-1"
  }
}

# S3 Bucket with Cross-Region Replication (us-east-1)
resource "aws_s3_bucket" "primary" {
  provider = aws.us_east_1
  bucket   = "xase-data-us-east-1"

  tags = {
    Name        = "xase-data-us-east-1"
    Environment = "production"
    Region      = "us-east-1"
  }
}

resource "aws_s3_bucket_versioning" "primary" {
  provider = aws.us_east_1
  bucket   = aws_s3_bucket.primary.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_replication_configuration" "primary" {
  provider = aws.us_east_1
  bucket   = aws_s3_bucket.primary.id
  role     = aws_iam_role.replication.arn

  rule {
    id     = "replicate-to-eu"
    status = "Enabled"

    destination {
      bucket        = aws_s3_bucket.eu_west_1.arn
      storage_class = "STANDARD_IA"
    }
  }

  rule {
    id     = "replicate-to-sa"
    status = "Enabled"

    destination {
      bucket        = aws_s3_bucket.sa_east_1.arn
      storage_class = "STANDARD_IA"
    }
  }
}

# S3 Bucket (eu-west-1)
resource "aws_s3_bucket" "eu_west_1" {
  provider = aws.eu_west_1
  bucket   = "xase-data-eu-west-1"

  tags = {
    Name        = "xase-data-eu-west-1"
    Environment = "production"
    Region      = "eu-west-1"
  }
}

resource "aws_s3_bucket_versioning" "eu_west_1" {
  provider = aws.eu_west_1
  bucket   = aws_s3_bucket.eu_west_1.id

  versioning_configuration {
    status = "Enabled"
  }
}

# S3 Bucket (sa-east-1)
resource "aws_s3_bucket" "sa_east_1" {
  provider = aws.sa_east_1
  bucket   = "xase-data-sa-east-1"

  tags = {
    Name        = "xase-data-sa-east-1"
    Environment = "production"
    Region      = "sa-east-1"
  }
}

resource "aws_s3_bucket_versioning" "sa_east_1" {
  provider = aws.sa_east_1
  bucket   = aws_s3_bucket.sa_east_1.id

  versioning_configuration {
    status = "Enabled"
  }
}

# ElastiCache Redis (us-east-1)
resource "aws_elasticache_replication_group" "us_east_1" {
  provider = aws.us_east_1

  replication_group_id       = "xase-redis-us-east-1"
  replication_group_description = "XASE Redis cluster us-east-1"

  engine               = "redis"
  engine_version       = "7.0"
  node_type            = "cache.r6g.xlarge"
  num_cache_clusters   = 3
  parameter_group_name = "default.redis7"
  port                 = 6379

  subnet_group_name  = aws_elasticache_subnet_group.us_east_1.name
  security_group_ids = [aws_security_group.redis_us_east_1.id]

  automatic_failover_enabled = true
  multi_az_enabled           = true

  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token_enabled         = true

  snapshot_retention_limit = 7
  snapshot_window          = "03:00-05:00"

  tags = {
    Name        = "xase-redis-us-east-1"
    Environment = "production"
    Region      = "us-east-1"
  }
}

# ElastiCache Redis (eu-west-1)
resource "aws_elasticache_replication_group" "eu_west_1" {
  provider = aws.eu_west_1

  replication_group_id       = "xase-redis-eu-west-1"
  replication_group_description = "XASE Redis cluster eu-west-1"

  engine               = "redis"
  engine_version       = "7.0"
  node_type            = "cache.r6g.xlarge"
  num_cache_clusters   = 3
  parameter_group_name = "default.redis7"
  port                 = 6379

  subnet_group_name  = aws_elasticache_subnet_group.eu_west_1.name
  security_group_ids = [aws_security_group.redis_eu_west_1.id]

  automatic_failover_enabled = true
  multi_az_enabled           = true

  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token_enabled         = true

  snapshot_retention_limit = 7
  snapshot_window          = "03:00-05:00"

  tags = {
    Name        = "xase-redis-eu-west-1"
    Environment = "production"
    Region      = "eu-west-1"
  }
}

# ElastiCache Redis (sa-east-1)
resource "aws_elasticache_replication_group" "sa_east_1" {
  provider = aws.sa_east_1

  replication_group_id       = "xase-redis-sa-east-1"
  replication_group_description = "XASE Redis cluster sa-east-1"

  engine               = "redis"
  engine_version       = "7.0"
  node_type            = "cache.r6g.xlarge"
  num_cache_clusters   = 3
  parameter_group_name = "default.redis7"
  port                 = 6379

  subnet_group_name  = aws_elasticache_subnet_group.sa_east_1.name
  security_group_ids = [aws_security_group.redis_sa_east_1.id]

  automatic_failover_enabled = true
  multi_az_enabled           = true

  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token_enabled         = true

  snapshot_retention_limit = 7
  snapshot_window          = "03:00-05:00"

  tags = {
    Name        = "xase-redis-sa-east-1"
    Environment = "production"
    Region      = "sa-east-1"
  }
}

# Variables
variable "domain_name" {
  description = "Domain name for the application"
  type        = string
  default     = "xase.ai"
}

variable "db_username" {
  description = "Database master username"
  type        = string
  sensitive   = true
}

variable "db_password" {
  description = "Database master password"
  type        = string
  sensitive   = true
}

# Outputs
output "primary_db_endpoint" {
  value = aws_db_instance.primary.endpoint
}

output "eu_replica_endpoint" {
  value = aws_db_instance.replica_eu.endpoint
}

output "sa_replica_endpoint" {
  value = aws_db_instance.replica_sa.endpoint
}

output "route53_zone_id" {
  value = aws_route53_zone.main.zone_id
}

output "route53_nameservers" {
  value = aws_route53_zone.main.name_servers
}
