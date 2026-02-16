"""Interactive onboarding experience for Xase CLI"""
from pathlib import Path
from typing import Optional
from InquirerPy import inquirer
from InquirerPy.base.control import Choice
from InquirerPy.utils import InquirerPyStyle
from rich.panel import Panel
from rich.text import Text

from .formatters.ui import console, print_success, print_info, print_error, XASE_ORANGE
from .config.settings import settings

# InquirerPy style with orange theme
XASE_INQUIRER_STYLE = InquirerPyStyle({
    "questionmark": "#E07B53 bold",
    "question": "bold",
    "pointer": "#E07B53 bold",
    "highlighted": "#E07B53",
    "answer": "#E07B53 bold",
    "input": "#E07B53",
})


def check_first_run() -> bool:
    """Check if this is the first time running the CLI"""
    config_dir = Path.home() / ".xase"
    config_file = config_dir / "config.json"
    return not config_file.exists()


def run_onboarding():
    """Run interactive onboarding flow"""
    console.print()
    console.print(
        Panel(
            f"[bold white]Welcome to Xase AI Lab Setup[/bold white]\n\n"
            f"[dim]Let's get you started with enterprise AI training.[/dim]",
            border_style=XASE_ORANGE,
            padding=(1, 2)
        )
    )
    console.print()
    
    # Step 1: Explain what Xase is
    console.print(f"[{XASE_ORANGE}]What is Xase AI Lab?[/{XASE_ORANGE}]")
    console.print()
    console.print("[dim]Xase is an enterprise platform for:[/dim]")
    console.print(f"  [{XASE_ORANGE}]•[/{XASE_ORANGE}] [white]Discovering governed AI training datasets[/white]")
    console.print(f"  [{XASE_ORANGE}]•[/{XASE_ORANGE}] [white]Managing secure data access leases[/white]")
    console.print(f"  [{XASE_ORANGE}]•[/{XASE_ORANGE}] [white]Streaming privacy-compliant training data[/white]")
    console.print(f"  [{XASE_ORANGE}]•[/{XASE_ORANGE}] [white]Ensuring AI Act & GDPR compliance[/white]")
    console.print()
    
    # Step 2: Ask if they want to configure now
    should_setup = inquirer.select(
        message="Would you like to configure Xase CLI now?",
        choices=[
            Choice(value=True, name="✓ Yes, let's set it up"),
            Choice(value=False, name="✗ No, I'll do it later with 'xase-cli setup'"),
        ],
        default=True,
        style=XASE_INQUIRER_STYLE
    ).execute()
    
    if not should_setup:
        console.print()
        print_info("You can run setup anytime with: [bold]xase-cli setup[/bold]")
        console.print()
        return
    
    # Step 3: Configure API URL
    console.print()
    console.print(f"[{XASE_ORANGE}]API Configuration[/{XASE_ORANGE}]")
    console.print()
    
    api_url = inquirer.text(
        message="Enter your Xase API URL:",
        default=settings.api_url,
        validate=lambda x: len(x) > 0,
        style=XASE_INQUIRER_STYLE
    ).execute()
    
    # Step 4: Save configuration
    config_dir = Path.home() / ".xase"
    config_dir.mkdir(parents=True, exist_ok=True)
    
    config_file = config_dir / "settings.env"
    with open(config_file, "w") as f:
        f.write(f"XASE_API_URL={api_url}\n")
    
    console.print()
    print_success(f"Configuration saved to {config_file}")
    
    # Step 5: Suggest next steps
    console.print()
    console.print(
        Panel(
            f"[bold white]Next Steps[/bold white]\n\n"
            f"[dim]1.[/dim] Authenticate:     [{XASE_ORANGE}]xase-cli login[/{XASE_ORANGE}]\n"
            f"[dim]2.[/dim] Browse datasets:  [{XASE_ORANGE}]xase-cli list-offers[/{XASE_ORANGE}]\n"
            f"[dim]3.[/dim] View your leases: [{XASE_ORANGE}]xase-cli list-leases[/{XASE_ORANGE}]\n"
            f"[dim]4.[/dim] Get help:         [{XASE_ORANGE}]xase-cli --help[/{XASE_ORANGE}]",
            border_style=XASE_ORANGE,
            padding=(1, 2)
        )
    )
    console.print()


def show_setup_wizard():
    """Show interactive setup wizard"""
    console.print()
    console.print(
        Panel(
            f"[bold white]Xase CLI Setup Wizard[/bold white]\n\n"
            f"[dim]Configure your Xase AI Lab environment[/dim]",
            border_style=XASE_ORANGE,
            padding=(1, 2)
        )
    )
    console.print()
    
    # Configuration options
    setup_choice = inquirer.select(
        message="What would you like to configure?",
        choices=[
            Choice(value="api", name="🌐 API Connection Settings"),
            Choice(value="auth", name="🔐 Authentication & Login"),
            Choice(value="advanced", name="⚙️  Advanced Settings"),
            Choice(value="view", name="👁️  View Current Configuration"),
            Choice(value="exit", name="✗ Exit Setup"),
        ],
        style=XASE_INQUIRER_STYLE
    ).execute()
    
    if setup_choice == "api":
        _configure_api()
    elif setup_choice == "auth":
        _configure_auth()
    elif setup_choice == "advanced":
        _configure_advanced()
    elif setup_choice == "view":
        _view_configuration()
    
    console.print()


def _configure_api():
    """Configure API settings"""
    console.print()
    console.print(f"[{XASE_ORANGE}]API Configuration[/{XASE_ORANGE}]")
    console.print()
    
    api_url = inquirer.text(
        message="Xase API URL:",
        default=settings.api_url,
        validate=lambda x: len(x) > 0,
        style=XASE_INQUIRER_STYLE
    ).execute()
    
    timeout = inquirer.number(
        message="API timeout (seconds):",
        default=settings.api_timeout,
        min_allowed=5,
        max_allowed=300,
        style=XASE_INQUIRER_STYLE
    ).execute()
    
    # Save settings
    config_dir = Path.home() / ".xase"
    config_dir.mkdir(parents=True, exist_ok=True)
    config_file = config_dir / "settings.env"
    
    with open(config_file, "w") as f:
        f.write(f"XASE_API_URL={api_url}\n")
        f.write(f"XASE_TIMEOUT={timeout}\n")
    
    console.print()
    print_success("API configuration saved")


def _configure_auth():
    """Configure authentication"""
    console.print()
    print_info("To authenticate, run: [bold]xase-cli login[/bold]")
    console.print()


def _configure_advanced():
    """Configure advanced settings"""
    console.print()
    console.print(f"[{XASE_ORANGE}]Advanced Settings[/{XASE_ORANGE}]")
    console.print()
    
    max_concurrent = inquirer.number(
        message="Max concurrent downloads:",
        default=settings.max_concurrent_downloads,
        min_allowed=1,
        max_allowed=20,
        style=XASE_INQUIRER_STYLE
    ).execute()
    
    log_level = inquirer.select(
        message="Log level:",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        default=settings.log_level,
        style=XASE_INQUIRER_STYLE
    ).execute()
    
    # Save settings
    config_dir = Path.home() / ".xase"
    config_dir.mkdir(parents=True, exist_ok=True)
    config_file = config_dir / "settings.env"
    
    # Read existing settings
    existing = {}
    if config_file.exists():
        with open(config_file, "r") as f:
            for line in f:
                if "=" in line:
                    key, value = line.strip().split("=", 1)
                    existing[key] = value
    
    # Update with new values
    existing["XASE_MAX_CONCURRENT"] = str(max_concurrent)
    existing["XASE_LOG_LEVEL"] = log_level
    
    # Write back
    with open(config_file, "w") as f:
        for key, value in existing.items():
            f.write(f"{key}={value}\n")
    
    console.print()
    print_success("Advanced settings saved")


def _view_configuration():
    """View current configuration"""
    console.print()
    console.print(
        Panel(
            f"[bold white]Current Configuration[/bold white]\n\n"
            f"[{XASE_ORANGE}]API URL:[/{XASE_ORANGE}]          {settings.api_url}\n"
            f"[{XASE_ORANGE}]Timeout:[/{XASE_ORANGE}]          {settings.api_timeout}s\n"
            f"[{XASE_ORANGE}]Max Downloads:[/{XASE_ORANGE}]    {settings.max_concurrent_downloads}\n"
            f"[{XASE_ORANGE}]Log Level:[/{XASE_ORANGE}]        {settings.log_level}\n"
            f"[{XASE_ORANGE}]Config Dir:[/{XASE_ORANGE}]       ~/.xase/",
            border_style=XASE_ORANGE,
            padding=(1, 2)
        )
    )
