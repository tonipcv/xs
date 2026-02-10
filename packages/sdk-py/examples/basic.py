"""
XASE SDK - Basic Example

Demonstrates fire-and-forget mode for zero latency impact.
"""

import os
import sys

# Add parent directory to path for local development
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from xase import XaseClient

# Initialize client
xase = XaseClient({
    "api_key": os.getenv("XASE_API_KEY", "xase_pk_demo"),
    "base_url": "http://localhost:3000/api/xase/v1",
    "fire_and_forget": True,  # Zero latency impact
    "on_success": lambda result: print(f"✅ Evidence recorded: {result['transaction_id']}"),
    "on_error": lambda error: print(f"❌ Error: {error.code} - {error.message}"),
})


def approve_loan(user_data):
    """Simulate AI agent making a credit decision."""
    print("\n🤖 Processing loan application...")
    
    # Your AI decision logic here
    decision = "APPROVED" if user_data["credit_score"] >= 700 else "DENIED"
    confidence = user_data["credit_score"] / 850
    
    # Record evidence (fire-and-forget, returns immediately)
    xase.record({
        "policy": "credit_policy_v4",
        "input": user_data,
        "output": {"decision": decision},
        "confidence": confidence,
        "transaction_id": f"loan_{user_data['user_id']}_{int(__import__('time').time())}",
        "decision_type": "CREDIT_APPROVAL",
    })
    
    print(f"📝 Decision: {decision} (confidence: {confidence * 100:.1f}%)")
    print("⚡ Evidence queued for async recording (zero latency)")
    
    return decision


def main():
    """Run example."""
    print("🚀 XASE SDK - Basic Example (Python)\n")
    
    # Process multiple loans
    approve_loan({
        "user_id": "u_4829",
        "amount": 50000,
        "credit_score": 720,
    })
    
    approve_loan({
        "user_id": "u_4830",
        "amount": 25000,
        "credit_score": 650,
    })
    
    approve_loan({
        "user_id": "u_4831",
        "amount": 100000,
        "credit_score": 800,
    })
    
    print("\n⏳ Flushing queue before exit...")
    xase.flush(3.0)
    
    print("✅ All evidence recorded!\n")


if __name__ == "__main__":
    main()
