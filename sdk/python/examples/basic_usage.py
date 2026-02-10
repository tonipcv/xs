"""
Basic usage examples for Xase Python SDK
"""

from xase import (
    XaseClient,
    LeaseAuthenticator,
    StreamingClient,
    DPClient,
    RewriteRulesHelper,
    KAnonymityValidator,
)


def example_1_streaming_with_lease():
    """Example: Stream dataset with lease authentication"""
    print("=== Example 1: Streaming with Lease ===\n")
    
    # Initialize authenticator with lease ID
    auth = LeaseAuthenticator(
        base_url="http://localhost:3000",
        lease_id="your-lease-id-here",
    )
    
    # Create streaming client
    client = StreamingClient(
        base_url="http://localhost:3000",
        authenticator=auth,
    )
    
    # Stream dataset with epsilon tracking
    def on_epsilon_consumed(epsilon):
        print(f"Epsilon consumed: {epsilon:.4f}")
    
    try:
        for record in client.stream_with_epsilon_tracking(
            dataset_id="dataset-123",
            lease_id="your-lease-id-here",
            on_epsilon_consumed=on_epsilon_consumed,
        ):
            print(f"Record: {record}")
    except Exception as e:
        print(f"Error: {e}")


def example_2_differential_privacy():
    """Example: Use differential privacy for queries"""
    print("\n=== Example 2: Differential Privacy ===\n")
    
    # Sample data
    data = [
        {"age": 25, "salary": 50000},
        {"age": 30, "salary": 60000},
        {"age": 35, "salary": 70000},
        {"age": 40, "salary": 80000},
        {"age": 45, "salary": 90000},
    ]
    
    # Initialize DP client with epsilon budget
    dp_client = DPClient(epsilon=1.0)
    
    # Execute differentially private count
    noisy_count = dp_client.count_query(data)
    print(f"Noisy count: {noisy_count:.2f} (true: {len(data)})")
    
    # Execute differentially private mean
    noisy_mean = dp_client.mean_query(data, column="salary", max_value=100000)
    print(f"Noisy mean salary: ${noisy_mean:.2f}")
    
    # Check remaining budget
    print(f"Remaining epsilon: {dp_client.get_remaining_budget():.4f}")


def example_3_rewrite_rules():
    """Example: Apply rewrite rules to data"""
    print("\n=== Example 3: Rewrite Rules ===\n")
    
    # Sample data
    record = {
        "name": "John Doe",
        "email": "john@example.com",
        "age": 30,
        "salary": 75000,
        "ssn": "123-45-6789",
    }
    
    # Initialize rewrite rules helper
    helper = RewriteRulesHelper(
        allowed_columns=["age", "salary"],  # Only allow these columns
        denied_columns=["ssn"],  # Explicitly deny SSN
        masking_rules={
            "email": "partial",  # Partially mask email
        },
    )
    
    # Process record
    processed = helper.process_row(record)
    print(f"Original: {record}")
    print(f"Processed: {processed}")


def example_4_k_anonymity():
    """Example: Validate k-anonymity"""
    print("\n=== Example 4: K-Anonymity Validation ===\n")
    
    # Sample data with quasi-identifiers
    data = [
        {"zip": "12345", "age": 25, "gender": "M"},
        {"zip": "12345", "age": 25, "gender": "M"},
        {"zip": "12345", "age": 30, "gender": "F"},
        {"zip": "67890", "age": 35, "gender": "M"},  # Unique combination
    ]
    
    # Initialize k-anonymity validator
    validator = KAnonymityValidator(k_min=2)
    
    # Check k-anonymity
    result = validator.check_k_anonymity(
        data,
        quasi_identifiers=["zip", "age", "gender"],
    )
    
    print(f"Valid: {result['valid']}")
    print(f"K-value: {result['k_value']}")
    print(f"Violations: {result['violation_count']}")
    
    if result['violations']:
        print("\nViolations:")
        for v in result['violations']:
            print(f"  - {v['quasi_identifiers']}: count={v['count']}, required={v['required']}")
    
    # Suggest records to suppress
    to_suppress = validator.suggest_suppression(data, ["zip", "age", "gender"])
    print(f"\nRecords to suppress: {to_suppress}")


def example_5_circuit_breaker():
    """Example: Use circuit breaker for resilience"""
    print("\n=== Example 5: Circuit Breaker ===\n")
    
    from xase.streaming import CircuitBreaker
    
    # Initialize circuit breaker
    breaker = CircuitBreaker(
        failure_threshold=3,
        recovery_timeout=10,
    )
    
    # Simulate API calls
    def unreliable_api_call():
        import random
        if random.random() < 0.5:
            raise Exception("API failed")
        return "Success"
    
    # Make calls with circuit breaker protection
    for i in range(10):
        try:
            result = breaker.call(unreliable_api_call)
            print(f"Call {i+1}: {result} (state: {breaker.state.value})")
        except Exception as e:
            print(f"Call {i+1}: Failed - {e} (state: {breaker.state.value})")


def example_6_complete_workflow():
    """Example: Complete AI Lab workflow"""
    print("\n=== Example 6: Complete Workflow ===\n")
    
    # Step 1: Authenticate with lease
    auth = LeaseAuthenticator(
        base_url="http://localhost:3000",
        lease_id="your-lease-id-here",
    )
    
    # Step 2: Initialize streaming client
    streaming = StreamingClient(
        base_url="http://localhost:3000",
        authenticator=auth,
    )
    
    # Step 3: Initialize DP client for privacy
    dp = DPClient(epsilon=1.0)
    
    # Step 4: Initialize rewrite rules
    rewriter = RewriteRulesHelper(
        allowed_columns=["age", "income", "education"],
        denied_columns=["ssn", "name"],
    )
    
    # Step 5: Stream and process data
    print("Streaming data with privacy enforcement...")
    
    processed_records = []
    try:
        for record in streaming.stream_dataset(
            dataset_id="dataset-123",
            lease_id="your-lease-id-here",
        ):
            # Apply rewrite rules
            processed = rewriter.process_row(record)
            if processed:
                processed_records.append(processed)
            
            # Stop if we have enough records
            if len(processed_records) >= 10:
                break
    except Exception as e:
        print(f"Streaming error: {e}")
    
    # Step 6: Compute differentially private statistics
    if processed_records:
        noisy_count = dp.count_query(processed_records)
        print(f"\nNoisy count: {noisy_count:.2f}")
        print(f"Epsilon consumed: {dp.consumed_epsilon:.4f}")
        print(f"Remaining budget: {dp.get_remaining_budget():.4f}")


if __name__ == "__main__":
    # Run examples
    # example_1_streaming_with_lease()
    example_2_differential_privacy()
    example_3_rewrite_rules()
    example_4_k_anonymity()
    example_5_circuit_breaker()
    # example_6_complete_workflow()
    
    print("\n=== All examples completed ===")
