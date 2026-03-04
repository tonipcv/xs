/**
 * Advanced Multi-Region Features
 * - CloudFront CDN with multi-region origins
 * - AWS Global Accelerator
 * - WAF with geo-blocking
 * - DynamoDB Global Tables
 * - Cross-region VPC peering
 */

# CloudFront Distribution for Global CDN
resource "aws_cloudfront_distribution" "global" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "XASE Global CDN"
  default_root_object = "index.html"
  price_class         = "PriceClass_All"

  # Origin Group with failover
  origin_group {
    origin_id = "primary-group"

    failover_criteria {
      status_codes = [403, 404, 500, 502, 503, 504]
    }

    member {
      origin_id = "us-east-1"
    }

    member {
      origin_id = "eu-west-1"
    }
  }

  # US East Origin
  origin {
    domain_name = aws_lb.us_east_1.dns_name
    origin_id   = "us-east-1"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }

    custom_header {
      name  = "X-Origin-Region"
      value = "us-east-1"
    }
  }

  # EU West Origin
  origin {
    domain_name = aws_lb.eu_west_1.dns_name
    origin_id   = "eu-west-1"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }

    custom_header {
      name  = "X-Origin-Region"
      value = "eu-west-1"
    }
  }

  # SA East Origin
  origin {
    domain_name = aws_lb.sa_east_1.dns_name
    origin_id   = "sa-east-1"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }

    custom_header {
      name  = "X-Origin-Region"
      value = "sa-east-1"
    }
  }

  # Default cache behavior
  default_cache_behavior {
    allowed_methods  = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods   = ["GET", "HEAD", "OPTIONS"]
    target_origin_id = "primary-group"

    forwarded_values {
      query_string = true
      headers      = ["Host", "Authorization", "CloudFront-Viewer-Country"]

      cookies {
        forward = "all"
      }
    }

    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    default_ttl            = 3600
    max_ttl                = 86400
    compress               = true
  }

  # API cache behavior
  ordered_cache_behavior {
    path_pattern     = "/api/*"
    allowed_methods  = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods   = ["GET", "HEAD", "OPTIONS"]
    target_origin_id = "primary-group"

    forwarded_values {
      query_string = true
      headers      = ["*"]

      cookies {
        forward = "all"
      }
    }

    viewer_protocol_policy = "https-only"
    min_ttl                = 0
    default_ttl            = 0
    max_ttl                = 0
  }

  # Static assets cache behavior
  ordered_cache_behavior {
    path_pattern     = "/static/*"
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD", "OPTIONS"]
    target_origin_id = "primary-group"

    forwarded_values {
      query_string = false

      cookies {
        forward = "none"
      }
    }

    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 86400
    default_ttl            = 604800
    max_ttl                = 31536000
    compress               = true
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate.global.arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  web_acl_id = aws_wafv2_web_acl.global.arn

  tags = {
    Name        = "xase-global-cdn"
    Environment = "production"
  }
}

# AWS Global Accelerator
resource "aws_globalaccelerator_accelerator" "main" {
  name            = "xase-global-accelerator"
  ip_address_type = "IPV4"
  enabled         = true

  attributes {
    flow_logs_enabled   = true
    flow_logs_s3_bucket = aws_s3_bucket.flow_logs.id
    flow_logs_s3_prefix = "global-accelerator/"
  }

  tags = {
    Name        = "xase-global-accelerator"
    Environment = "production"
  }
}

resource "aws_globalaccelerator_listener" "main" {
  accelerator_arn = aws_globalaccelerator_accelerator.main.id
  protocol        = "TCP"

  port_range {
    from_port = 443
    to_port   = 443
  }
}

# Endpoint groups for each region
resource "aws_globalaccelerator_endpoint_group" "us_east_1" {
  listener_arn = aws_globalaccelerator_listener.main.id

  endpoint_group_region = "us-east-1"
  traffic_dial_percentage = 100

  health_check_interval_seconds = 30
  health_check_path             = "/api/health"
  health_check_protocol         = "HTTPS"
  threshold_count               = 3

  endpoint_configuration {
    endpoint_id = aws_lb.us_east_1.arn
    weight      = 100
  }
}

resource "aws_globalaccelerator_endpoint_group" "eu_west_1" {
  listener_arn = aws_globalaccelerator_listener.main.id

  endpoint_group_region = "eu-west-1"
  traffic_dial_percentage = 100

  health_check_interval_seconds = 30
  health_check_path             = "/api/health"
  health_check_protocol         = "HTTPS"
  threshold_count               = 3

  endpoint_configuration {
    endpoint_id = aws_lb.eu_west_1.arn
    weight      = 100
  }
}

resource "aws_globalaccelerator_endpoint_group" "sa_east_1" {
  listener_arn = aws_globalaccelerator_listener.main.id

  endpoint_group_region = "sa-east-1"
  traffic_dial_percentage = 100

  health_check_interval_seconds = 30
  health_check_path             = "/api/health"
  health_check_protocol         = "HTTPS"
  threshold_count               = 3

  endpoint_configuration {
    endpoint_id = aws_lb.sa_east_1.arn
    weight      = 100
  }
}

# WAF Web ACL
resource "aws_wafv2_web_acl" "global" {
  provider = aws.us_east_1
  name     = "xase-global-waf"
  scope    = "CLOUDFRONT"

  default_action {
    allow {}
  }

  # Rate limiting rule
  rule {
    name     = "rate-limit"
    priority = 1

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit              = 2000
        aggregate_key_type = "IP"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "rate-limit"
      sampled_requests_enabled   = true
    }
  }

  # AWS managed rules - Core Rule Set
  rule {
    name     = "aws-managed-core-rules"
    priority = 2

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesCommonRuleSet"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "aws-managed-core-rules"
      sampled_requests_enabled   = true
    }
  }

  # AWS managed rules - Known Bad Inputs
  rule {
    name     = "aws-managed-known-bad-inputs"
    priority = 3

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "aws-managed-known-bad-inputs"
      sampled_requests_enabled   = true
    }
  }

  # SQL injection protection
  rule {
    name     = "sql-injection-protection"
    priority = 4

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesSQLiRuleSet"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "sql-injection-protection"
      sampled_requests_enabled   = true
    }
  }

  # Geo-blocking for high-risk countries
  rule {
    name     = "geo-blocking"
    priority = 5

    action {
      block {}
    }

    statement {
      geo_match_statement {
        country_codes = ["KP", "IR", "SY"] # North Korea, Iran, Syria
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "geo-blocking"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "xase-global-waf"
    sampled_requests_enabled   = true
  }

  tags = {
    Name        = "xase-global-waf"
    Environment = "production"
  }
}

# DynamoDB Global Table for session management
resource "aws_dynamodb_table" "sessions" {
  provider = aws.us_east_1

  name             = "xase-sessions"
  billing_mode     = "PAY_PER_REQUEST"
  hash_key         = "sessionId"
  stream_enabled   = true
  stream_view_type = "NEW_AND_OLD_IMAGES"

  attribute {
    name = "sessionId"
    type = "S"
  }

  attribute {
    name = "userId"
    type = "S"
  }

  global_secondary_index {
    name            = "userId-index"
    hash_key        = "userId"
    projection_type = "ALL"
  }

  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }

  replica {
    region_name = "eu-west-1"
  }

  replica {
    region_name = "sa-east-1"
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name        = "xase-sessions"
    Environment = "production"
  }
}

# KMS Keys for each region
resource "aws_kms_key" "us_east_1" {
  provider = aws.us_east_1

  description             = "XASE encryption key us-east-1"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  tags = {
    Name        = "xase-kms-us-east-1"
    Environment = "production"
    Region      = "us-east-1"
  }
}

resource "aws_kms_key" "eu_west_1" {
  provider = aws.eu_west_1

  description             = "XASE encryption key eu-west-1"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  tags = {
    Name        = "xase-kms-eu-west-1"
    Environment = "production"
    Region      = "eu-west-1"
  }
}

resource "aws_kms_key" "sa_east_1" {
  provider = aws.sa_east_1

  description             = "XASE encryption key sa-east-1"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  tags = {
    Name        = "xase-kms-sa-east-1"
    Environment = "production"
    Region      = "sa-east-1"
  }
}

# ACM Certificate for CloudFront (must be in us-east-1)
resource "aws_acm_certificate" "global" {
  provider = aws.us_east_1

  domain_name               = var.domain_name
  subject_alternative_names = ["*.${var.domain_name}"]
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name        = "xase-global-cert"
    Environment = "production"
  }
}

# S3 bucket for flow logs
resource "aws_s3_bucket" "flow_logs" {
  provider = aws.us_east_1
  bucket   = "xase-flow-logs"

  tags = {
    Name        = "xase-flow-logs"
    Environment = "production"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "flow_logs" {
  provider = aws.us_east_1
  bucket   = aws_s3_bucket.flow_logs.id

  rule {
    id     = "expire-old-logs"
    status = "Enabled"

    expiration {
      days = 90
    }

    transition {
      days          = 30
      storage_class = "GLACIER"
    }
  }
}

# IAM role for S3 replication
resource "aws_iam_role" "replication" {
  name = "xase-s3-replication-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "s3.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy" "replication" {
  role = aws_iam_role.replication.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = [
          "s3:GetReplicationConfiguration",
          "s3:ListBucket"
        ]
        Effect = "Allow"
        Resource = [
          aws_s3_bucket.primary.arn
        ]
      },
      {
        Action = [
          "s3:GetObjectVersionForReplication",
          "s3:GetObjectVersionAcl"
        ]
        Effect = "Allow"
        Resource = [
          "${aws_s3_bucket.primary.arn}/*"
        ]
      },
      {
        Action = [
          "s3:ReplicateObject",
          "s3:ReplicateDelete"
        ]
        Effect = "Allow"
        Resource = [
          "${aws_s3_bucket.eu_west_1.arn}/*",
          "${aws_s3_bucket.sa_east_1.arn}/*"
        ]
      }
    ]
  })
}

# Outputs
output "cloudfront_domain" {
  description = "CloudFront distribution domain"
  value       = aws_cloudfront_distribution.global.domain_name
}

output "global_accelerator_dns" {
  description = "Global Accelerator DNS name"
  value       = aws_globalaccelerator_accelerator.main.dns_name
}

output "global_accelerator_ips" {
  description = "Global Accelerator static IPs"
  value       = aws_globalaccelerator_accelerator.main.ip_sets[0].ip_addresses
}

output "waf_acl_arn" {
  description = "WAF Web ACL ARN"
  value       = aws_wafv2_web_acl.global.arn
}

output "dynamodb_global_table" {
  description = "DynamoDB Global Table name"
  value       = aws_dynamodb_table.sessions.name
}
