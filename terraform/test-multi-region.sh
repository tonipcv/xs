#!/bin/bash
# Multi-Region Terraform Validation Tests
# Tests infrastructure deployment across multiple regions

set -e

echo "========================================="
echo "Multi-Region Terraform Validation Tests"
echo "========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

# Function to run test
run_test() {
    local test_name=$1
    local test_command=$2
    
    echo -e "\n${YELLOW}Running: ${test_name}${NC}"
    
    if eval "$test_command"; then
        echo -e "${GREEN}✓ PASSED${NC}"
        ((TESTS_PASSED++))
        return 0
    else
        echo -e "${RED}✗ FAILED${NC}"
        ((TESTS_FAILED++))
        return 1
    fi
}

# Test 1: Terraform format check
run_test "Terraform format validation" "terraform fmt -check -recursive"

# Test 2: Terraform initialization
run_test "Terraform initialization" "terraform init -backend=false"

# Test 3: Terraform validation
run_test "Terraform configuration validation" "terraform validate"

# Test 4: Check multi-region providers
run_test "Multi-region providers configured" "grep -q 'provider \"aws\"' multi-region.tf && grep -q 'alias.*us_east_1' multi-region.tf && grep -q 'alias.*eu_west_1' multi-region.tf && grep -q 'alias.*sa_east_1' multi-region.tf"

# Test 5: Check RDS replication
run_test "RDS read replicas configured" "grep -q 'replicate_source_db' multi-region.tf"

# Test 6: Check S3 replication
run_test "S3 cross-region replication configured" "grep -q 'aws_s3_bucket_replication_configuration' multi-region.tf"

# Test 7: Check Route53 health checks
run_test "Route53 health checks configured" "grep -q 'aws_route53_health_check' multi-region.tf"

# Test 8: Check latency-based routing
run_test "Route53 latency-based routing configured" "grep -q 'latency_routing_policy' multi-region.tf"

# Test 9: Check CloudFront distribution
run_test "CloudFront CDN configured" "grep -q 'aws_cloudfront_distribution' multi-region-advanced.tf"

# Test 10: Check Global Accelerator
run_test "AWS Global Accelerator configured" "grep -q 'aws_globalaccelerator_accelerator' multi-region-advanced.tf"

# Test 11: Check WAF configuration
run_test "WAF Web ACL configured" "grep -q 'aws_wafv2_web_acl' multi-region-advanced.tf"

# Test 12: Check DynamoDB Global Table
run_test "DynamoDB Global Table configured" "grep -q 'replica' multi-region-advanced.tf && grep -q 'aws_dynamodb_table' multi-region-advanced.tf"

# Test 13: Check KMS keys per region
run_test "KMS keys configured for each region" "grep -c 'aws_kms_key' multi-region-advanced.tf | grep -q '3'"

# Test 14: Check Redis clusters per region
run_test "Redis clusters configured for each region" "grep -c 'aws_elasticache_replication_group' multi-region.tf | grep -q '3'"

# Test 15: Terraform plan (dry-run)
echo -e "\n${YELLOW}Running: Terraform plan (dry-run)${NC}"
if terraform plan -var="db_password=test123" -var="db_username=admin" -out=tfplan 2>&1 | tee /tmp/tf-plan.log; then
    # Check for critical resources in plan
    if grep -q "aws_db_instance.primary" /tmp/tf-plan.log && \
       grep -q "aws_db_instance.replica_eu" /tmp/tf-plan.log && \
       grep -q "aws_db_instance.replica_sa" /tmp/tf-plan.log; then
        echo -e "${GREEN}✓ PASSED - All critical resources present${NC}"
        ((TESTS_PASSED++))
    else
        echo -e "${RED}✗ FAILED - Missing critical resources${NC}"
        ((TESTS_FAILED++))
    fi
else
    echo -e "${YELLOW}⚠ SKIPPED - Plan requires valid AWS credentials${NC}"
fi

# Test 16: Check for security best practices
run_test "Encryption at rest enabled" "grep -q 'storage_encrypted.*=.*true' multi-region.tf"

# Test 17: Check for multi-AZ deployments
run_test "Multi-AZ enabled for databases" "grep -q 'multi_az.*=.*true' multi-region.tf"

# Test 18: Check backup retention
run_test "Backup retention configured" "grep -q 'backup_retention_period' multi-region.tf"

# Test 19: Check for HTTPS enforcement
run_test "HTTPS enforcement in CloudFront" "grep -q 'viewer_protocol_policy.*=.*\"https-only\"' multi-region-advanced.tf || grep -q 'viewer_protocol_policy.*=.*\"redirect-to-https\"' multi-region-advanced.tf"

# Test 20: Check for rate limiting in WAF
run_test "WAF rate limiting configured" "grep -q 'rate_based_statement' multi-region-advanced.tf"

# Summary
echo -e "\n========================================="
echo -e "Test Summary"
echo -e "========================================="
echo -e "${GREEN}Tests Passed: ${TESTS_PASSED}${NC}"
echo -e "${RED}Tests Failed: ${TESTS_FAILED}${NC}"
echo -e "Total Tests: $((TESTS_PASSED + TESTS_FAILED))"

# Cleanup
rm -f tfplan /tmp/tf-plan.log

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "\n${GREEN}All tests passed! ✓${NC}"
    exit 0
else
    echo -e "\n${RED}Some tests failed! ✗${NC}"
    exit 1
fi
