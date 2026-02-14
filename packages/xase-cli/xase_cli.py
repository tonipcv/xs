#!/usr/bin/env python3
"""
Xase CLI - Command-line interface for AI Lab data access
Usage: python xase_cli.py <command> [options]
"""
import os
import sys
import json
import time
import argparse
from typing import Optional, Dict, Any
from datetime import datetime

try:
    import requests
except ImportError:
    print("Error: requests library not found. Install with: pip install requests")
    sys.exit(1)

# Configuration
BASE_URL = os.getenv("XASE_BASE_URL", "http://localhost:3000")
API_KEY = os.getenv("XASE_API_KEY")
CONFIG_DIR = os.path.join(os.path.expanduser("~"), ".xase")
CONFIG_FILE = os.path.join(CONFIG_DIR, "config.json")

def _load_tokens():
    try:
        with open(CONFIG_FILE, "r") as f:
            return json.load(f)
    except Exception:
        return {}

def _save_tokens(data: dict):
    os.makedirs(CONFIG_DIR, exist_ok=True)
    with open(CONFIG_FILE, "w") as f:
        json.dump(data, f)
    try:
        os.chmod(CONFIG_FILE, 0o600)
    except Exception:
        pass

def _auth_headers():
    tokens = _load_tokens()
    hdrs = {"Content-Type": "application/json"}
    if tokens.get("access_token"):
        hdrs["Authorization"] = f"Bearer {tokens['access_token']}"
        return hdrs
    if API_KEY:
        hdrs["X-API-Key"] = API_KEY
    return hdrs

class XaseError(Exception):
    """Custom exception for Xase CLI errors"""
    def __init__(self, message: str, status_code: Optional[int] = None):
        self.message = message
        self.status_code = status_code
        super().__init__(self.message)

def check_api_key():
    """Verify API key is set"""
    if not API_KEY:
        print("Error: XASE_API_KEY environment variable not set")
        print("Export your API key: export XASE_API_KEY=xase_pk_...")
        sys.exit(2)

def make_request(method: str, endpoint: str, **kwargs) -> Dict[Any, Any]:
    """Make HTTP request with error handling"""
    url = f"{BASE_URL}{endpoint}"
    try:
        response = requests.request(method, url, headers=_auth_headers(), **kwargs)
        
        if response.status_code >= 400:
            try:
                error_data = response.json()
                error_msg = error_data.get("error", response.text)
            except:
                error_msg = response.text
            
            raise XaseError(
                f"HTTP {response.status_code}: {error_msg}",
                status_code=response.status_code
            )
        
        return response.json() if response.content else {}
    except requests.exceptions.RequestException as e:
        raise XaseError(f"Request failed: {str(e)}")

def format_json(data: Any) -> str:
    """Format JSON output"""
    return json.dumps(data, indent=2, default=str)

def print_success(message: str):
    """Print success message"""
    print(f"✓ {message}")

def print_error(message: str):
    """Print error message"""
    print(f"✗ {message}", file=sys.stderr)

# Commands

def cmd_list_offers(args):
    """List available access offers"""
    if not _load_tokens().get("access_token"):
        check_api_key()
    
    params = {}
    if args.risk:
        params["riskClass"] = args.risk
    if args.language:
        params["language"] = args.language
    if args.max_price:
        params["maxPrice"] = str(args.max_price)
    if args.limit:
        params["limit"] = str(args.limit)
    
    print(f"Fetching offers from {BASE_URL}...")
    data = make_request("GET", "/api/v1/access-offers", params=params, timeout=30)
    
    offers = data.get("offers", [])
    print(f"\nFound {len(offers)} offer(s):\n")
    
    for offer in offers:
        print(f"ID: {offer['offerId']}")
        print(f"  Title: {offer['title']}")
        print(f"  Language: {offer['language']}")
        print(f"  Risk: {offer['riskClass']}")
        print(f"  Price: ${offer['pricePerHour']}/hour")
        print(f"  Scope: {offer['scopeHours']}h")
        print(f"  Status: {offer['status']}")
        print()

def cmd_execute(args):
    """Execute an access offer to create policy and lease"""
    if not _load_tokens().get("access_token"):
        check_api_key()
    
    payload = {
        "usagePurpose": args.purpose or "AI model training",
        "environment": args.environment or "production",
    }
    
    if args.hours:
        payload["requestedHours"] = float(args.hours)
    
    print(f"Executing offer {args.offer_id}...")
    data = make_request(
        "POST",
        f"/api/v1/access-offers/{args.offer_id}/execute",
        json=payload,
        timeout=60
    )
    
    print_success("Execution created successfully!\n")
    print(format_json(data))

def cmd_logout(args):
    """Logout by deleting saved tokens"""
    try:
        if os.path.exists(CONFIG_FILE):
            os.remove(CONFIG_FILE)
            print_success("You are now logged out")
            print("• Removed token file: ~/.xase/config.json")
            print("• Auth headers will fall back to XASE_API_KEY if set")
            print("Tip: run 'xase-cli login --email you@example.com' to sign in again")
        else:
            print_success("Already logged out")
            print("• No token file found at ~/.xase/config.json")
            print("Tip: run 'xase-cli login --email you@example.com' to sign in")
    except Exception as e:
        print_error(f"Failed to logout: {str(e)}")
        sys.exit(1)

def cmd_validate(args):
    """Validate policy access before consuming"""
    if not _load_tokens().get("access_token"):
        check_api_key()
    
    params = {"requestedHours": str(args.requested_hours or 0.5)}
    
    print(f"Validating policy {args.policy_id}...")
    data = make_request(
        "GET",
        f"/api/v1/policies/{args.policy_id}/validate",
        params=params,
        timeout=30
    )
    
    allowed = data.get("allowed", False)
    reason = data.get("reason", "Unknown")
    
    if allowed:
        print_success(f"Access allowed: {reason}")
        
        if "usage" in data:
            usage = data["usage"]
            print(f"\n📊 Usage:")
            if usage.get("hoursRemaining") is not None:
                print(f"  Hours remaining: {usage['hoursRemaining']}")
            if usage.get("downloadsRemaining") is not None:
                print(f"  Downloads remaining: {usage['downloadsRemaining']}")
            if usage.get("utilizationPercent") is not None:
                print(f"  Utilization: {usage['utilizationPercent']:.1f}%")
    else:
        print_error(f"Access denied: {reason}")
        sys.exit(1)

def cmd_stream(args):
    """Stream dataset data"""
    if not _load_tokens().get("access_token"):
        check_api_key()
    
    output_file = args.output or f"batch_{int(time.time())}.json"
    
    print(f"Streaming dataset {args.dataset_id}...")
    
    # Note: Adjust endpoint based on actual streaming API
    headers = _auth_headers()
    params = {}
    if args.lease_id:
        params["leaseId"] = args.lease_id
    if args.env:
        params["env"] = args.env
    if args.estimated_hours is not None:
        params["estimatedHours"] = str(args.estimated_hours)

    response = requests.get(
        f"{BASE_URL}/api/v1/datasets/{args.dataset_id}/stream",
        headers=headers,
        params=params,
        timeout=120,
    )
    
    if response.status_code >= 400:
        print_error(f"Stream failed: HTTP {response.status_code}")
        sys.exit(1)
    
    with open(output_file, "wb") as f:
        f.write(response.content)
    
    print_success(f"Data saved to {output_file}")
    print(f"Size: {len(response.content)} bytes")

def cmd_mint_lease(args):
    """Mint (create) a new lease for a dataset"""
    if not _load_tokens().get("access_token"):
        check_api_key()
    payload = {
        "datasetId": args.dataset_id,
        "ttlSeconds": int(args.ttl_seconds or 1800),
    }
    print(f"Minting lease for dataset {args.dataset_id} (ttl={payload['ttlSeconds']}s)...")
    data = make_request("POST", "/api/v1/leases", json=payload, timeout=30)
    lease = data if isinstance(data, dict) else {}
    if lease.get("leaseId"):
        print_success("Lease minted")
        print(f"Lease ID: {lease['leaseId']}")
        if lease.get("expiresAt"):
            print(f"Expires: {lease['expiresAt']}")
    else:
        print(format_json(data))

def cmd_list_leases(args):
    """List active leases"""
    if not _load_tokens().get("access_token"):
        check_api_key()
    
    params = {"status": "ACTIVE", "limit": str(args.limit or 10)}
    
    print("Fetching active leases...")
    data = make_request("GET", "/api/v1/leases", params=params, timeout=30)
    
    leases = data.get("leases", [])
    print(f"\nFound {len(leases)} active lease(s):\n")
    
    for lease in leases:
        dataset_id = None
        try:
            dataset_id = lease.get('policy', {}).get('dataset', {}).get('datasetId')
        except Exception:
            dataset_id = None
        print(f"Lease ID: {lease['leaseId']}")
        print(f"  Dataset: {dataset_id or 'N/A'}")
        print(f"  Status: {lease['status']}")
        print(f"  Issued: {lease['issuedAt']}")
        print(f"  Expires: {lease['expiresAt']}")
        print()

def cmd_lease_details(args):
    """Get lease details"""
    if not _load_tokens().get("access_token"):
        check_api_key()
    
    print(f"Fetching lease {args.lease_id}...")
    data = make_request("GET", f"/api/v1/leases/{args.lease_id}", timeout=30)
    
    print(format_json(data))

def cmd_usage(args):
    """Show usage statistics"""
    if not _load_tokens().get("access_token"):
        check_api_key()

def cmd_login(args):
    """Login via email OTP (no API key required)"""
    email = args.email
    scopes = args.scopes or ["read:offers", "execute:offer", "stream:dataset"]
    print(f"Requesting login code for {email}...")
    r1 = requests.post(
        f"{BASE_URL}/api/v1/cli/auth/request-otp",
        headers={"Content-Type": "application/json"},
        data=json.dumps({"email": email, "scopes": scopes}),
        timeout=30,
    )
    if r1.status_code >= 400:
        try:
            err = r1.json().get("error")
        except Exception:
            err = r1.text
        print_error(f"Failed to request OTP: {err}")
        sys.exit(1)
    print("A login code was sent to your email. It expires in 10 minutes.")
    code = args.code or input("Enter the code: ").strip()
    r2 = requests.post(
        f"{BASE_URL}/api/v1/cli/auth/verify-otp",
        headers={"Content-Type": "application/json"},
        data=json.dumps({"email": email, "code": code, "scopes": scopes}),
        timeout=30,
    )
    if r2.status_code >= 400:
        try:
            err = r2.json().get("error")
        except Exception:
            err = r2.text
        print_error(f"Failed to verify OTP: {err}")
        sys.exit(1)
    tok = r2.json()
    _save_tokens(tok)
    print_success("Logged in. Tokens saved to ~/.xase/config.json")
    
    print("Fetching usage statistics...")
    # Note: Adjust endpoint based on actual API
    data = make_request("GET", "/api/v1/usage", timeout=30)
    
    print(format_json(data))

def main():
    parser = argparse.ArgumentParser(
        prog="xase-cli",
        description="Xase CLI - AI Lab data access tool",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # List available offers
  xase-cli list-offers --risk MEDIUM --language en-US
  
  # Execute an offer to get policy and lease
  xase-cli execute off_abc123 --hours 1.0 --purpose "Training"
  
  # Validate policy before consuming
  xase-cli validate pol_xyz789 --requested-hours 0.5
  
  # Stream dataset
  xase-cli stream ds_def456 --output data.json
  
  # List active leases
  xase-cli list-leases
  
Environment variables:
  XASE_BASE_URL    API base URL (default: http://localhost:3000)
  XASE_API_KEY     Your API key (required)
        """
    )
    
    subparsers = parser.add_subparsers(dest="command", required=True)
    
    # list-offers
    p_list = subparsers.add_parser("list-offers", help="List available access offers")
    p_list.add_argument("--risk", choices=["LOW", "MEDIUM", "HIGH", "CRITICAL"], help="Filter by risk class")
    p_list.add_argument("--language", help="Filter by language (e.g., en-US)")
    p_list.add_argument("--max-price", type=float, help="Maximum price per hour")
    p_list.add_argument("--limit", type=int, default=20, help="Max results (default: 20)")
    p_list.set_defaults(func=cmd_list_offers)
    
    # execute
    p_exec = subparsers.add_parser("execute", help="Execute offer to create policy and lease")
    p_exec.add_argument("offer_id", help="Offer ID (e.g., off_abc123)")
    p_exec.add_argument("--hours", type=float, help="Requested hours")
    p_exec.add_argument("--purpose", help="Usage purpose")
    p_exec.add_argument("--environment", choices=["development", "staging", "production"], help="Environment")
    p_exec.set_defaults(func=cmd_execute)
    
    # validate
    p_val = subparsers.add_parser("validate", help="Validate policy access")
    p_val.add_argument("policy_id", help="Policy ID (e.g., pol_xyz789)")
    p_val.add_argument("--requested-hours", type=float, default=0.5, help="Hours to validate (default: 0.5)")
    p_val.set_defaults(func=cmd_validate)
    
    # stream
    p_stream = subparsers.add_parser("stream", help="Stream dataset data")
    p_stream.add_argument("dataset_id", help="Dataset ID (e.g., ds_def456)")
    p_stream.add_argument("--lease-id", required=True, help="Active lease ID authorizing the stream")
    p_stream.add_argument("--env", help="Environment label if policy enforces it (e.g., production)")
    p_stream.add_argument("--estimated-hours", type=float, help="Estimated hours to meter for this batch (optional)")
    p_stream.add_argument("--output", help="Output file (default: batch_<timestamp>.json)")
    p_stream.set_defaults(func=cmd_stream)
    
    # mint-lease
    p_mint = subparsers.add_parser("mint-lease", help="Create a new lease for a dataset")
    p_mint.add_argument("dataset_id", help="Dataset ID (e.g., ds_def456)")
    p_mint.add_argument("--ttl-seconds", type=int, default=1800, help="Lease TTL in seconds (default: 1800)")
    p_mint.set_defaults(func=cmd_mint_lease)
    
    # list-leases
    p_leases = subparsers.add_parser("list-leases", help="List active leases")
    p_leases.add_argument("--limit", type=int, default=10, help="Max results (default: 10)")
    p_leases.set_defaults(func=cmd_list_leases)
    
    # lease-details
    p_lease = subparsers.add_parser("lease-details", help="Get lease details")
    p_lease.add_argument("lease_id", help="Lease ID")
    p_lease.set_defaults(func=cmd_lease_details)
    
    # usage
    p_usage = subparsers.add_parser("usage", help="Show usage statistics")
    p_usage.set_defaults(func=cmd_usage)

    # login (email OTP)
    p_login = subparsers.add_parser("login", help="Login via email OTP (no API key required)")
    p_login.add_argument("--email", required=True, help="Your account email")
    p_login.add_argument("--code", help="OTP code (if already received)")
    p_login.add_argument("--scopes", nargs="*", help="Requested scopes (default: read:offers execute:offer stream:dataset)")
    p_login.set_defaults(func=cmd_login)
    
    # logout
    p_logout = subparsers.add_parser("logout", help="Logout and remove saved tokens")
    p_logout.set_defaults(func=cmd_logout)
    
    args = parser.parse_args()
    
    try:
        args.func(args)
    except XaseError as e:
        print_error(e.message)
        sys.exit(1)
    except KeyboardInterrupt:
        print("\n\nInterrupted by user")
        sys.exit(130)
    except Exception as e:
        print_error(f"Unexpected error: {str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    main()
