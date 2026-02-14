"""Beautiful terminal UI inspired by Dexter"""
from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.text import Text
from rich.progress import (
    Progress,
    SpinnerColumn,
    BarColumn,
    DownloadColumn,
    TransferSpeedColumn,
    TimeRemainingColumn,
    TextColumn
)
from rich.theme import Theme

# Dexter-inspired color scheme
XASE_THEME = Theme({
    "info": "cyan",
    "success": "green",
    "warning": "yellow",
    "error": "red",
    "highlight": "bright_cyan",
    "dim": "dim white",
})

console = Console(theme=XASE_THEME)


def print_banner():
    """Print Xase CLI banner"""
    banner = """
██╗  ██╗ █████╗ ███████╗███████╗
╚██╗██╔╝██╔══██╗██╔════╝██╔════╝
 ╚███╔╝ ███████║███████╗█████╗  
 ██╔██╗ ██╔══██║╚════██║██╔══╝  
██╔╝ ██╗██║  ██║███████║███████╗
╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚══════╝
"""
    console.print(banner, style="bright_cyan bold")
    console.print("Your AI Lab assistant for governed dataset access.\n", style="dim")


def print_welcome(version: str = "2.0.0"):
    """Print welcome message"""
    console.print(
        Panel(
            f"[bright_cyan]Welcome to Xase CLI v{version}[/bright_cyan]",
            border_style="cyan"
        )
    )


def print_success(message: str):
    """Print success message"""
    console.print(f"✓ {message}", style="success")


def print_error(message: str):
    """Print error message"""
    console.print(f"✗ {message}", style="error")


def print_warning(message: str):
    """Print warning message"""
    console.print(f"⚠️  {message}", style="warning")


def print_info(message: str):
    """Print info message"""
    console.print(f"ℹ {message}", style="info")


def create_leases_table(leases: list) -> Table:
    """Create formatted table for leases"""
    table = Table(
        title="Active Leases",
        title_style="bright_cyan bold",
        border_style="cyan",
        show_header=True,
        header_style="bold cyan"
    )
    
    table.add_column("Lease ID", style="cyan", no_wrap=True)
    table.add_column("Dataset", style="magenta")
    table.add_column("Status", justify="center")
    table.add_column("Expires At", style="yellow")
    
    for lease in leases:
        status_style = "green" if lease.get('status') == 'ACTIVE' else "red"
        table.add_row(
            lease.get('leaseId', 'N/A'),
            lease.get('datasetId', 'N/A'),
            f"[{status_style}]{lease.get('status', 'UNKNOWN')}[/{status_style}]",
            lease.get('expiresAt', 'N/A')
        )
    
    return table


def create_offers_table(offers: list) -> Table:
    """Create formatted table for offers"""
    table = Table(
        title="Available Offers",
        title_style="bright_cyan bold",
        border_style="cyan",
        show_header=True,
        header_style="bold cyan"
    )
    
    table.add_column("Offer ID", style="cyan", no_wrap=True)
    table.add_column("Dataset", style="magenta")
    table.add_column("Risk Level", justify="center")
    table.add_column("Language", style="yellow")
    
    for offer in offers:
        risk = offer.get('riskLevel', 'UNKNOWN')
        risk_style = {
            'LOW': 'green',
            'MEDIUM': 'yellow',
            'HIGH': 'red'
        }.get(risk, 'white')
        
        table.add_row(
            offer.get('offerId', 'N/A'),
            offer.get('datasetName', 'N/A'),
            f"[{risk_style}]{risk}[/{risk_style}]",
            offer.get('language', 'N/A')
        )
    
    return table


def create_download_progress(total_batches: int) -> Progress:
    """Create progress bar for downloads"""
    return Progress(
        SpinnerColumn(style="cyan"),
        TextColumn("[progress.description]{task.description}", style="cyan"),
        BarColumn(complete_style="cyan", finished_style="green"),
        TextColumn("[progress.percentage]{task.percentage:>3.0f}%"),
        DownloadColumn(style="cyan"),
        TransferSpeedColumn(style="cyan"),
        TimeRemainingColumn(style="yellow"),
        console=console
    )


def print_usage_stats(stats: dict):
    """Print usage statistics"""
    table = Table(
        title="Usage Statistics",
        title_style="bright_cyan bold",
        border_style="cyan",
        show_header=False
    )
    
    table.add_column("Metric", style="cyan")
    table.add_column("Value", style="bright_white", justify="right")
    
    table.add_row("Tenant ID", stats.get('tenantId', 'N/A'))
    table.add_row("Active Offers", str(stats.get('summary', {}).get('offers', 0)))
    table.add_row("Active Leases", str(stats.get('summary', {}).get('activeLeases', 0)))
    table.add_row("Auth Mode", stats.get('debug', {}).get('authMode', 'unknown'))
    
    console.print(table)


def print_lease_details(lease: dict):
    """Print detailed lease information"""
    table = Table(
        title=f"Lease Details: {lease.get('leaseId', 'N/A')}",
        title_style="bright_cyan bold",
        border_style="cyan",
        show_header=False
    )
    
    table.add_column("Field", style="cyan")
    table.add_column("Value", style="bright_white")
    
    table.add_row("Lease ID", lease.get('leaseId', 'N/A'))
    table.add_row("Status", lease.get('status', 'N/A'))
    table.add_row("Dataset ID", lease.get('dataset', {}).get('datasetId', 'N/A'))
    table.add_row("Dataset Name", lease.get('dataset', {}).get('name', 'N/A'))
    table.add_row("Policy ID", lease.get('policy', {}).get('policyId', 'N/A'))
    table.add_row("Issued At", lease.get('issuedAt', 'N/A'))
    table.add_row("Expires At", lease.get('expiresAt', 'N/A'))
    
    console.print(table)
