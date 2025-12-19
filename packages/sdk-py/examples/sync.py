"""
XASE SDK - Synchronous Example

Demonstrates synchronous mode with immediate response.
"""

import os
import sys

# Add parent directory to path for local development
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from xase import XaseClient

# Initialize client in sync mode
xase = XaseClient({
    "api_key": os.getenv("XASE_API_KEY", "xase_pk_demo"),
    "base_url": "http://localhost:3000/api/xase/v1",
    "fire_and_forget": False,  # Synchronous mode
})


def process_fraud_detection(transaction):
    """Simulate fraud detection."""
    print("\n🔍 Analyzing transaction for fraud...")
    
    # Your fraud detection logic
    is_fraud = transaction["amount"] > 10000 and transaction["location"] != "US"
    confidence = 0.87 if is_fraud else 0.12
    
    # Record evidence synchronously (waits for response)
    result = xase.record({
        "policy": "fraud_detection_v2",
        "input": transaction,
        "output": {"is_fraud": is_fraud},
        "confidence": confidence,
        "transaction_id": transaction["id"],
        "decision_type": "FRAUD_DETECTION",
        "store_payload": True,  # Store full payload for audit
    })
    
    print("✅ Evidence recorded:")
    print(f"   Transaction ID: {result['transaction_id']}")
    print(f"   Record Hash: {result['record_hash']}")
    print(f"   Chain Position: {result['chain_position']}")
    print(f"   Receipt URL: {result['receipt_url']}")
    
    return {"is_fraud": is_fraud, "confidence": confidence, "evidence": result}


def main():
    """Run example."""
    print("🚀 XASE SDK - Synchronous Example (Python)\n")
    
    try:
        process_fraud_detection({
            "id": "txn_12345",
            "amount": 15000,
            "location": "RU",
            "merchant": "Unknown Store",
        })
        
        process_fraud_detection({
            "id": "txn_12346",
            "amount": 50,
            "location": "US",
            "merchant": "Amazon",
        })
        
        print("\n✅ All transactions processed!\n")
    
    except Exception as error:
        print(f"❌ Error: {error}")


if __name__ == "__main__":
    main()
