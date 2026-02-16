"""Main CLI entry point with Click"""
import sys
import json
from pathlib import Path
from typing import Optional

import click
from rich.console import Console

from .auth.token_manager import TokenManager
from .core.api_client import XaseAPIClient
from .config.settings import settings
from .errors.exceptions import XaseError, AuthenticationError, ValidationError
from .formatters.ui import (
    print_banner,
    print_welcome,
    print_success,
    print_error,
    print_warning,
    print_info,
    create_leases_table,
    create_offers_table,
    create_download_progress,
    print_usage_stats,
    print_lease_details,
    console
)
from .utils.logger import setup_logging, get_logger
from .utils.validators import StreamConfig, LeaseConfig, LoginConfig
from .onboarding import check_first_run, run_onboarding, show_setup_wizard

logger = get_logger(__name__)


@click.group()
@click.option('--verbose', '-v', is_flag=True, help='Enable verbose logging')
@click.option('--config', type=click.Path(), help='Config file path')
@click.pass_context
def cli(ctx, verbose, config):
    """Xase CLI - Enterprise AI Lab command-line interface"""
    ctx.ensure_object(dict)
    ctx.obj['verbose'] = verbose
    
    # Setup logging
    setup_logging(verbose=verbose)
    
    # Load custom config if provided
    if config:
        # TODO: Load custom settings from config file
        pass


@cli.command()
def setup():
    """Interactive setup wizard"""
    try:
        show_setup_wizard()
    except KeyboardInterrupt:
        print_warning("\nSetup cancelled")
        sys.exit(130)
    except Exception as e:
        print_error(f"Setup error: {e}")
        sys.exit(1)


@cli.command()
@click.option('--email', prompt=True, help='Your email address')
@click.pass_context
def login(ctx, email):
    """Authenticate via email OTP"""
    try:
        # Validate email
        config = LoginConfig(email=email)
        
        client = XaseAPIClient()
        
        # Request OTP
        console.print()
        print_info(f"Requesting login code for {config.email}...")
        client.login(config.email)
        print_success("A login code was sent to your email. It expires in 10 minutes.")
        console.print()
        
        # Prompt for code
        code = click.prompt('Enter the 6-digit code', type=str)
        
        # Verify OTP
        result = client.verify_otp(config.email, code)
        
        # Save tokens
        token_manager = TokenManager()
        token_manager.save_tokens(result)
        
        console.print()
        print_success("Logged in successfully!")
        print_info("Tokens saved to ~/.xase/config.json")
        
        # Fetch and display usage stats
        console.print()
        print_info("Fetching your usage statistics...")
        # Recreate client so it picks up freshly saved tokens
        client = XaseAPIClient()
        usage = client.get_usage()
        console.print()
        print_usage_stats(usage)
        console.print()
        
    except ValidationError as e:
        print_error(f"Invalid input: {e.message}")
        sys.exit(1)
    except AuthenticationError as e:
        print_error(f"Authentication failed: {e.message}")
        sys.exit(1)
    except XaseError as e:
        print_error(f"Error: {e.message}")
        sys.exit(1)


@cli.command()
def logout():
    """Remove saved tokens"""
    try:
        token_manager = TokenManager()
        token_manager.clear_tokens()
        
        console.print()
        print_success("Logged out successfully")
        print_info("Your tokens have been removed from ~/.xase/config.json")
        print_info("Run 'xase-cli login' to authenticate again")
        console.print()
        
    except Exception as e:
        print_error(f"Error during logout: {e}")
        sys.exit(1)


@cli.command()
def usage():
    """Show usage statistics"""
    try:
        client = XaseAPIClient()
        stats = client.get_usage()
        print_usage_stats(stats)
        
    except AuthenticationError:
        print_error("Not authenticated. Run 'xase-cli login' first")
        sys.exit(1)
    except XaseError as e:
        print_error(f"Error: {e.message}")
        sys.exit(1)


@cli.command('list-offers')
@click.option('--limit', default=20, help='Maximum number of offers to show')
@click.option('--risk', type=click.Choice(['LOW', 'MEDIUM', 'HIGH']), help='Filter by risk level')
@click.option('--language', help='Filter by language')
def list_offers(limit, risk, language):
    """List available access offers"""
    try:
        client = XaseAPIClient()
        
        filters = {}
        if risk:
            filters['riskLevel'] = risk
        if language:
            filters['language'] = language
        
        print_info(f"Fetching offers from {settings.api_url}...")
        result = client.list_offers(limit=limit, **filters)
        
        offers = result.get('offers', [])
        print_info(f"Found {len(offers)} offer(s)")
        
        if offers:
            table = create_offers_table(offers)
            console.print(table)
        
    except AuthenticationError:
        print_error("Not authenticated. Run 'xase-cli login' first")
        sys.exit(1)
    except XaseError as e:
        print_error(f"Error: {e.message}")
        sys.exit(1)


@cli.command('list-leases')
@click.option('--limit', default=20, help='Maximum number of leases to show')
def list_leases(limit):
    """List active leases"""
    try:
        client = XaseAPIClient()
        
        print_info("Fetching active leases...")
        result = client.list_leases(limit=limit)
        
        leases = result.get('leases', [])
        print_info(f"Found {len(leases)} active lease(s)")
        
        if leases:
            table = create_leases_table(leases)
            console.print(table)
        
    except AuthenticationError:
        print_error("Not authenticated. Run 'xase-cli login' first")
        sys.exit(1)
    except XaseError as e:
        print_error(f"Error: {e.message}")
        sys.exit(1)


@cli.command('mint-lease')
@click.argument('dataset_id')
@click.option('--ttl-seconds', default=1800, help='Lease time-to-live in seconds')
def mint_lease(dataset_id, ttl_seconds):
    """Create a new lease for a dataset"""
    try:
        # Validate input
        config = LeaseConfig(dataset_id=dataset_id, ttl_seconds=ttl_seconds)
        
        client = XaseAPIClient()
        
        print_info(f"Minting lease for dataset {config.dataset_id} (ttl={config.ttl_seconds}s)...")
        result = client.create_lease(config.dataset_id, config.ttl_seconds)
        
        print_success("Lease minted")
        print_info(f"Lease ID: {result.get('leaseId')}")
        print_info(f"Expires: {result.get('expiresAt')}")
        
    except ValidationError as e:
        print_error(f"Invalid input: {e.message}")
        sys.exit(1)
    except AuthenticationError:
        print_error("Not authenticated. Run 'xase-cli login' first")
        sys.exit(1)
    except XaseError as e:
        print_error(f"Error: {e.message}")
        sys.exit(1)


@cli.command('lease-details')
@click.argument('lease_id')
def lease_details(lease_id):
    """Show detailed information about a lease"""
    try:
        client = XaseAPIClient()
        
        print_info(f"Fetching lease {lease_id}...")
        lease = client.get_lease(lease_id)
        
        print_lease_details(lease)
        
    except AuthenticationError:
        print_error("Not authenticated. Run 'xase-cli login' first")
        sys.exit(1)
    except XaseError as e:
        print_error(f"Error: {e.message}")
        sys.exit(1)


@cli.command()
@click.argument('dataset_id')
@click.option('--lease-id', required=True, help='Lease ID to use')
@click.option('--env', default='production', type=click.Choice(['development', 'staging', 'production']))
@click.option('--estimated-hours', default=0.5, type=float, help='Estimated hours of usage')
@click.option('--output', type=click.Path(), help='Output file path')
def stream(dataset_id, lease_id, env, estimated_hours, output):
    """Stream dataset batch for training"""
    try:
        # Default output filename
        if not output:
            import time
            output = f"batch_{int(time.time())}.json"
        
        output_path = Path(output)
        
        # Validate input
        config = StreamConfig(
            dataset_id=dataset_id,
            lease_id=lease_id,
            env=env,
            estimated_hours=estimated_hours,
            output=output_path
        )
        
        client = XaseAPIClient()
        
        print_info(f"Streaming dataset {config.dataset_id}...")
        
        result = client.stream_dataset(
            config.dataset_id,
            config.lease_id,
            config.env,
            config.estimated_hours
        )
        
        # Save to file
        with open(config.output, 'w') as f:
            json.dump(result, f, indent=2)
        
        file_size = config.output.stat().st_size
        print_success(f"Data saved to {config.output}")
        print_info(f"Size: {file_size} bytes")
        
    except ValidationError as e:
        print_error(f"Invalid input: {e.message}")
        sys.exit(1)
    except AuthenticationError:
        print_error("Not authenticated. Run 'xase-cli login' first")
        sys.exit(1)
    except XaseError as e:
        print_error(f"Error: {e.message}")
        sys.exit(1)


@cli.command()
def version():
    """Show CLI version"""
    from . import __version__
    print_info(f"Xase CLI version {__version__}")


def main():
    """Main entry point"""
    try:
        # Check if this is first run
        is_first_run = check_first_run()
        
        # Print banner on first run or when no command given
        if len(sys.argv) == 1:
            print_banner()
            if is_first_run:
                run_onboarding()
            else:
                print_welcome()
        
        cli(obj={})
    except KeyboardInterrupt:
        console.print()
        print_warning("Operation cancelled by user")
        sys.exit(130)
    except Exception as e:
        logger.exception("Unexpected error")
        console.print()
        print_error(f"Unexpected error: {e}")
        sys.exit(1)


if __name__ == '__main__':
    main()
