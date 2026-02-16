"""Beautiful terminal UI inspired by Claude Code"""
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
from rich.align import Align
from rich.box import ROUNDED, HEAVY

# Xase AI Lab color scheme - Orange inspired by Claude (#E07B53)
XASE_ORANGE = "#E07B53"
XASE_THEME = Theme({
    "info": XASE_ORANGE,
    "success": "#00D26A",
    "warning": "#FFB020",
    "error": "#FF4757",
    "highlight": XASE_ORANGE,
    "dim": "#6B7280",
    "primary": XASE_ORANGE,
    "secondary": "#9CA3AF",
})

console = Console(theme=XASE_THEME)


def print_banner():
    """Print Xase AI Lab banner with ASCII art"""
    # ASCII art banner with visual elements
    banner_art = f"""
[{XASE_ORANGE}]{'─' * 80}[/{XASE_ORANGE}]

            [bold {XASE_ORANGE}]╭─────────────────────────────────────────────────╮[/bold {XASE_ORANGE}]
            [bold {XASE_ORANGE}]│[/bold {XASE_ORANGE}]  [bold white]██╗  ██╗ █████╗ ███████╗███████╗[/bold white]  [bold {XASE_ORANGE}]│[/bold {XASE_ORANGE}]
            [bold {XASE_ORANGE}]│[/bold {XASE_ORANGE}]  [bold white]╚██╗██╔╝██╔══██╗██╔════╝██╔════╝[/bold white]  [bold {XASE_ORANGE}]│[/bold {XASE_ORANGE}]
            [bold {XASE_ORANGE}]│[/bold {XASE_ORANGE}]  [bold {XASE_ORANGE}] ╚███╔╝ ███████║███████╗█████╗  [/bold {XASE_ORANGE}]  [bold {XASE_ORANGE}]│[/bold {XASE_ORANGE}]
            [bold {XASE_ORANGE}]│[/bold {XASE_ORANGE}]  [bold {XASE_ORANGE}] ██╔██╗ ██╔══██║╚════██║██╔══╝  [/bold {XASE_ORANGE}]  [bold {XASE_ORANGE}]│[/bold {XASE_ORANGE}]
            [bold {XASE_ORANGE}]│[/bold {XASE_ORANGE}]  [bold {XASE_ORANGE}]██╔╝ ██╗██║  ██║███████║███████╗[/bold {XASE_ORANGE}]  [bold {XASE_ORANGE}]│[/bold {XASE_ORANGE}]
            [bold {XASE_ORANGE}]│[/bold {XASE_ORANGE}]  [bold {XASE_ORANGE}]╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚══════╝[/bold {XASE_ORANGE}]  [bold {XASE_ORANGE}]│[/bold {XASE_ORANGE}]
            [bold {XASE_ORANGE}]│[/bold {XASE_ORANGE}]                                                 [bold {XASE_ORANGE}]│[/bold {XASE_ORANGE}]
            [bold {XASE_ORANGE}]│[/bold {XASE_ORANGE}]         [bold white]A I   L A B   C L I[/bold white]                  [bold {XASE_ORANGE}]│[/bold {XASE_ORANGE}]
            [bold {XASE_ORANGE}]╰─────────────────────────────────────────────────╯[/bold {XASE_ORANGE}]

[{XASE_ORANGE}]{'─' * 80}[/{XASE_ORANGE}]
"""
    console.print(banner_art)
    console.print(
        Align.center(
            "[dim]Enterprise AI Lab · Governed Dataset Access · Privacy-First Training[/dim]"
        )
    )
    console.print()


def print_welcome(version: str = "2.0.0"):
    """Print welcome message"""
    welcome_text = f"""[bold white]Welcome to Xase AI Lab CLI[/bold white] [dim]v{version}[/dim]

[dim]Your enterprise-grade command-line interface for:[/dim]
  [primary]•[/primary] Discovering AI training datasets
  [primary]•[/primary] Managing secure data leases
  [primary]•[/primary] Streaming governed training data
  [primary]•[/primary] Compliance-first AI development

[dim]Get started with:[/dim] [primary bold]xase-cli setup[/primary bold]
"""
    console.print(
        Panel(
            welcome_text,
            border_style=XASE_ORANGE,
            box=ROUNDED,
            padding=(1, 2)
        )
    )


def print_success(message: str):
    """Print success message"""
    console.print(f"[success]✓[/success] {message}", style="bright_white")


def print_error(message: str):
    """Print error message"""
    console.print(f"[error]✗[/error] {message}", style="bright_white")


def print_warning(message: str):
    """Print warning message"""
    console.print(f"[warning]⚠[/warning]  {message}", style="bright_white")


def print_info(message: str):
    """Print info message"""
    console.print(f"[primary]ℹ[/primary] {message}", style="bright_white")


def create_leases_table(leases: list) -> Table:
    """Create formatted table for leases"""
    table = Table(
        title="Active Leases",
        title_style=f"bold {XASE_ORANGE}",
        border_style=XASE_ORANGE,
        show_header=True,
        header_style=f"bold {XASE_ORANGE}",
        box=ROUNDED
    )
    
    table.add_column("Lease ID", style=XASE_ORANGE, no_wrap=True)
    table.add_column("Dataset", style="bright_white")
    table.add_column("Status", justify="center")
    table.add_column("Expires At", style="#FFB020")
    
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
        title_style=f"bold {XASE_ORANGE}",
        border_style=XASE_ORANGE,
        show_header=True,
        header_style=f"bold {XASE_ORANGE}",
        box=ROUNDED
    )
    
    table.add_column("Offer ID", style=XASE_ORANGE, no_wrap=True)
    table.add_column("Dataset", style="bright_white")
    table.add_column("Risk Level", justify="center")
    table.add_column("Language", style="#FFB020")
    
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
        SpinnerColumn(style=XASE_ORANGE),
        TextColumn("[progress.description]{task.description}", style=XASE_ORANGE),
        BarColumn(complete_style=XASE_ORANGE, finished_style="#00D26A"),
        TextColumn("[progress.percentage]{task.percentage:>3.0f}%"),
        DownloadColumn(style=XASE_ORANGE),
        TransferSpeedColumn(style=XASE_ORANGE),
        TimeRemainingColumn(style="#FFB020"),
        console=console
    )


def print_usage_stats(stats: dict):
    """Print usage statistics"""
    table = Table(
        title="Usage Statistics",
        title_style=f"bold {XASE_ORANGE}",
        border_style=XASE_ORANGE,
        show_header=False,
        box=ROUNDED
    )
    
    table.add_column("Metric", style=XASE_ORANGE)
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
        title_style=f"bold {XASE_ORANGE}",
        border_style=XASE_ORANGE,
        show_header=False,
        box=ROUNDED
    )
    
    table.add_column("Field", style=XASE_ORANGE)
    table.add_column("Value", style="bright_white")
    
    table.add_row("Lease ID", lease.get('leaseId', 'N/A'))
    table.add_row("Status", lease.get('status', 'N/A'))
    table.add_row("Dataset ID", lease.get('dataset', {}).get('datasetId', 'N/A'))
    table.add_row("Dataset Name", lease.get('dataset', {}).get('name', 'N/A'))
    table.add_row("Policy ID", lease.get('policy', {}).get('policyId', 'N/A'))
    table.add_row("Issued At", lease.get('issuedAt', 'N/A'))
    table.add_row("Expires At", lease.get('expiresAt', 'N/A'))
    
    console.print(table)
