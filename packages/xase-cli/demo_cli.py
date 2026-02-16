#!/usr/bin/env python3
"""Demo script to showcase Xase CLI visual experience"""
import sys
import os

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

from xase_cli.formatters.ui import (
    print_banner,
    print_welcome,
    print_success,
    print_error,
    print_warning,
    print_info,
    create_leases_table,
    create_offers_table,
    print_usage_stats,
    console
)

def demo_visual_experience():
    """Demonstrate the visual experience of Xase CLI"""
    
    # 1. Show banner
    print_banner()
    print_welcome(version="2.0.0")
    
    console.print()
    console.print("[bold]Demo: Visual Elements[/bold]")
    console.print()
    
    # 2. Show different message types
    print_success("Successfully connected to Xase API")
    print_info("Fetching available datasets...")
    print_warning("Your lease expires in 5 minutes")
    print_error("Authentication failed - invalid token")
    
    console.print()
    
    # 3. Show sample offers table
    sample_offers = [
        {
            "offerId": "offer_abc123",
            "datasetName": "Medical Images Dataset",
            "riskLevel": "HIGH",
            "language": "en"
        },
        {
            "offerId": "offer_def456",
            "datasetName": "Financial Transactions",
            "riskLevel": "MEDIUM",
            "language": "pt"
        },
        {
            "offerId": "offer_ghi789",
            "datasetName": "Customer Reviews",
            "riskLevel": "LOW",
            "language": "en"
        }
    ]
    
    offers_table = create_offers_table(sample_offers)
    console.print(offers_table)
    console.print()
    
    # 4. Show sample leases table
    sample_leases = [
        {
            "leaseId": "lease_xyz123",
            "datasetId": "ds_medical_001",
            "status": "ACTIVE",
            "expiresAt": "2026-02-15T18:30:00Z"
        },
        {
            "leaseId": "lease_xyz456",
            "datasetId": "ds_finance_002",
            "status": "EXPIRED",
            "expiresAt": "2026-02-14T12:00:00Z"
        }
    ]
    
    leases_table = create_leases_table(sample_leases)
    console.print(leases_table)
    console.print()
    
    # 5. Show usage stats
    sample_stats = {
        "tenantId": "tenant_demo_001",
        "summary": {
            "offers": 15,
            "activeLeases": 3
        },
        "debug": {
            "authMode": "api_key"
        }
    }
    
    print_usage_stats(sample_stats)
    console.print()
    
    # 6. Final message
    console.print("[bold #E07B53]🎉 Xase CLI Visual Demo Complete![/bold #E07B53]")
    console.print()
    console.print("[dim]All visual elements are working with the orange theme (#E07B53)[/dim]")
    console.print()

if __name__ == "__main__":
    demo_visual_experience()
