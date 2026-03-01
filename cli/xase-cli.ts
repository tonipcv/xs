#!/usr/bin/env node
/**
 * XASE CLI - Command Line Interface
 * Complete CLI with governance and marketplace commands
 * F3-013: CLI com Comandos de Governança e Marketplace
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import Table from 'cli-table3';
import fs from 'fs';
import path from 'path';

const program = new Command();

// Configuration
const CONFIG_PATH = path.join(process.env.HOME || '', '.xase', 'config.json');

interface Config {
  apiUrl: string;
  apiKey?: string;
  tenantId?: string;
}

/**
 * Load configuration
 */
function loadConfig(): Config {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    }
  } catch (error) {
    // Ignore
  }

  return {
    apiUrl: process.env.XASE_API_URL || 'https://api.xase.ai',
  };
}

/**
 * Save configuration
 */
function saveConfig(config: Config): void {
  const dir = path.dirname(CONFIG_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

/**
 * Make API request
 */
async function apiRequest(
  endpoint: string,
  options: RequestInit = {}
): Promise<any> {
  const config = loadConfig();

  if (!config.apiKey) {
    console.error(chalk.red('Error: API key not configured. Run: xase config set-key'));
    process.exit(1);
  }

  const url = `${config.apiUrl}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API Error (${response.status}): ${error}`);
  }

  return response.json();
}

// ============================================================================
// CONFIGURATION COMMANDS
// ============================================================================

program
  .command('config')
  .description('Manage CLI configuration')
  .action(() => {
    const config = loadConfig();
    console.log(chalk.cyan('Current Configuration:'));
    console.log(JSON.stringify(config, null, 2));
  });

program
  .command('config:set-key')
  .description('Set API key')
  .action(async () => {
    const { apiKey } = await inquirer.prompt([
      {
        type: 'password',
        name: 'apiKey',
        message: 'Enter your XASE API key:',
        mask: '*',
      },
    ]);

    const config = loadConfig();
    config.apiKey = apiKey;
    saveConfig(config);

    console.log(chalk.green('✓ API key saved'));
  });

program
  .command('config:set-tenant')
  .description('Set default tenant ID')
  .argument('<tenantId>', 'Tenant ID')
  .action((tenantId: string) => {
    const config = loadConfig();
    config.tenantId = tenantId;
    saveConfig(config);

    console.log(chalk.green(`✓ Default tenant set to: ${tenantId}`));
  });

// ============================================================================
// DATASET COMMANDS
// ============================================================================

program
  .command('datasets:list')
  .description('List all datasets')
  .option('-t, --tenant <tenantId>', 'Tenant ID')
  .action(async (options) => {
    const spinner = ora('Fetching datasets...').start();

    try {
      const tenantId = options.tenant || loadConfig().tenantId;
      const datasets = await apiRequest(`/api/datasets?tenantId=${tenantId}`);

      spinner.stop();

      const table = new Table({
        head: ['ID', 'Name', 'Type', 'Status', 'Created'],
        colWidths: [30, 30, 15, 15, 25],
      });

      datasets.forEach((ds: any) => {
        table.push([
          ds.datasetId,
          ds.name,
          ds.dataType,
          ds.status,
          new Date(ds.createdAt).toLocaleDateString(),
        ]);
      });

      console.log(table.toString());
      console.log(chalk.gray(`\nTotal: ${datasets.length} datasets`));
    } catch (error: any) {
      spinner.fail('Failed to fetch datasets');
      console.error(chalk.red(error.message));
    }
  });

program
  .command('datasets:create')
  .description('Create a new dataset')
  .option('-n, --name <name>', 'Dataset name')
  .option('-t, --type <type>', 'Data type (AUDIO, DICOM, TEXT)')
  .option('-d, --description <description>', 'Description')
  .action(async (options) => {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: 'Dataset name:',
        when: !options.name,
      },
      {
        type: 'list',
        name: 'type',
        message: 'Data type:',
        choices: ['AUDIO', 'DICOM', 'TEXT'],
        when: !options.type,
      },
      {
        type: 'input',
        name: 'description',
        message: 'Description:',
        when: !options.description,
      },
    ]);

    const spinner = ora('Creating dataset...').start();

    try {
      const dataset = await apiRequest('/api/datasets', {
        method: 'POST',
        body: JSON.stringify({
          name: options.name || answers.name,
          dataType: options.type || answers.type,
          description: options.description || answers.description,
        }),
      });

      spinner.succeed('Dataset created');
      console.log(chalk.green(`\nDataset ID: ${dataset.datasetId}`));
    } catch (error: any) {
      spinner.fail('Failed to create dataset');
      console.error(chalk.red(error.message));
    }
  });

program
  .command('datasets:publish')
  .description('Publish dataset to marketplace')
  .argument('<datasetId>', 'Dataset ID')
  .action(async (datasetId: string) => {
    const spinner = ora('Publishing dataset...').start();

    try {
      await apiRequest(`/api/datasets/${datasetId}/publish`, {
        method: 'POST',
      });

      spinner.succeed('Dataset published to marketplace');
    } catch (error: any) {
      spinner.fail('Failed to publish dataset');
      console.error(chalk.red(error.message));
    }
  });

// ============================================================================
// POLICY COMMANDS
// ============================================================================

program
  .command('policies:create')
  .description('Create access policy')
  .argument('<datasetId>', 'Dataset ID')
  .option('-n, --name <name>', 'Policy name')
  .option('-p, --price <price>', 'Base price')
  .action(async (datasetId: string, options) => {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: 'Policy name:',
        when: !options.name,
      },
      {
        type: 'number',
        name: 'price',
        message: 'Base price (USD):',
        when: !options.price,
      },
    ]);

    const spinner = ora('Creating policy...').start();

    try {
      const policy = await apiRequest('/api/policies', {
        method: 'POST',
        body: JSON.stringify({
          datasetId,
          name: options.name || answers.name,
          type: 'LEASE',
          pricing: {
            model: 'USAGE_BASED',
            basePrice: parseFloat(options.price || answers.price),
            currency: 'USD',
          },
        }),
      });

      spinner.succeed('Policy created');
      console.log(chalk.green(`\nPolicy ID: ${policy.policyId}`));
    } catch (error: any) {
      spinner.fail('Failed to create policy');
      console.error(chalk.red(error.message));
    }
  });

program
  .command('policies:revoke')
  .description('Revoke access policy')
  .argument('<policyId>', 'Policy ID')
  .action(async (policyId: string) => {
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Are you sure you want to revoke this policy?',
        default: false,
      },
    ]);

    if (!confirm) {
      console.log(chalk.yellow('Cancelled'));
      return;
    }

    const spinner = ora('Revoking policy...').start();

    try {
      await apiRequest(`/api/policies/${policyId}/revoke`, {
        method: 'POST',
      });

      spinner.succeed('Policy revoked');
    } catch (error: any) {
      spinner.fail('Failed to revoke policy');
      console.error(chalk.red(error.message));
    }
  });

// ============================================================================
// LEASE COMMANDS
// ============================================================================

program
  .command('leases:create')
  .description('Create data lease')
  .argument('<datasetId>', 'Dataset ID')
  .option('-d, --duration <hours>', 'Lease duration in hours')
  .action(async (datasetId: string, options) => {
    const answers = await inquirer.prompt([
      {
        type: 'number',
        name: 'duration',
        message: 'Lease duration (hours):',
        default: 24,
        when: !options.duration,
      },
    ]);

    const spinner = ora('Creating lease...').start();

    try {
      const lease = await apiRequest('/api/leases', {
        method: 'POST',
        body: JSON.stringify({
          datasetId,
          durationHours: parseInt(options.duration || answers.duration),
        }),
      });

      spinner.succeed('Lease created');
      console.log(chalk.green(`\nLease ID: ${lease.leaseId}`));
      console.log(chalk.gray(`Expires: ${new Date(lease.expiresAt).toLocaleString()}`));
    } catch (error: any) {
      spinner.fail('Failed to create lease');
      console.error(chalk.red(error.message));
    }
  });

program
  .command('leases:list')
  .description('List all leases')
  .option('-a, --active', 'Show only active leases')
  .action(async (options) => {
    const spinner = ora('Fetching leases...').start();

    try {
      const leases = await apiRequest('/api/leases');

      spinner.stop();

      const filtered = options.active
        ? leases.filter((l: any) => new Date(l.expiresAt) > new Date())
        : leases;

      const table = new Table({
        head: ['ID', 'Dataset', 'Status', 'Expires', 'Created'],
        colWidths: [30, 30, 15, 25, 25],
      });

      filtered.forEach((lease: any) => {
        const isActive = new Date(lease.expiresAt) > new Date();
        table.push([
          lease.leaseId,
          lease.datasetId,
          isActive ? chalk.green('Active') : chalk.red('Expired'),
          new Date(lease.expiresAt).toLocaleString(),
          new Date(lease.createdAt).toLocaleDateString(),
        ]);
      });

      console.log(table.toString());
      console.log(chalk.gray(`\nTotal: ${filtered.length} leases`));
    } catch (error: any) {
      spinner.fail('Failed to fetch leases');
      console.error(chalk.red(error.message));
    }
  });

// ============================================================================
// MARKETPLACE COMMANDS
// ============================================================================

program
  .command('marketplace:browse')
  .description('Browse marketplace offers')
  .option('-t, --type <type>', 'Filter by data type')
  .action(async (options) => {
    const spinner = ora('Fetching marketplace offers...').start();

    try {
      let endpoint = '/api/marketplace/offers';
      if (options.type) {
        endpoint += `?dataType=${options.type}`;
      }

      const offers = await apiRequest(endpoint);

      spinner.stop();

      const table = new Table({
        head: ['Dataset', 'Type', 'Price', 'Supplier', 'Rating'],
        colWidths: [30, 15, 15, 25, 10],
      });

      offers.forEach((offer: any) => {
        table.push([
          offer.datasetName,
          offer.dataType,
          `$${offer.basePrice}`,
          offer.supplierName,
          offer.rating ? `⭐ ${offer.rating}` : 'N/A',
        ]);
      });

      console.log(table.toString());
      console.log(chalk.gray(`\nTotal: ${offers.length} offers`));
    } catch (error: any) {
      spinner.fail('Failed to fetch offers');
      console.error(chalk.red(error.message));
    }
  });

// ============================================================================
// AUDIT COMMANDS
// ============================================================================

program
  .command('audit:export')
  .description('Export audit trail')
  .option('-f, --format <format>', 'Export format (pdf, csv, json)', 'json')
  .option('-s, --start <date>', 'Start date (YYYY-MM-DD)')
  .option('-e, --end <date>', 'End date (YYYY-MM-DD)')
  .option('-o, --output <path>', 'Output file path')
  .action(async (options) => {
    const spinner = ora('Generating audit export...').start();

    try {
      const result = await apiRequest('/api/audit/export', {
        method: 'POST',
        body: JSON.stringify({
          format: options.format,
          startDate: options.start,
          endDate: options.end,
        }),
      });

      spinner.succeed('Audit export generated');
      
      console.log(chalk.green(`\nExport ID: ${result.exportId}`));
      console.log(chalk.gray(`Records: ${result.recordCount}`));
      console.log(chalk.gray(`Format: ${result.format}`));
      
      if (options.output) {
        console.log(chalk.gray(`Saved to: ${options.output}`));
      }
    } catch (error: any) {
      spinner.fail('Failed to export audit trail');
      console.error(chalk.red(error.message));
    }
  });

// ============================================================================
// COMPLIANCE COMMANDS
// ============================================================================

program
  .command('compliance:check')
  .description('Run compliance check')
  .option('-f, --framework <framework>', 'Framework (GDPR, HIPAA, FCA, BaFin)')
  .action(async (options) => {
    const answers = await inquirer.prompt([
      {
        type: 'list',
        name: 'framework',
        message: 'Select compliance framework:',
        choices: ['GDPR', 'HIPAA', 'FCA', 'BaFin'],
        when: !options.framework,
      },
    ]);

    const framework = options.framework || answers.framework;
    const spinner = ora(`Running ${framework} compliance check...`).start();

    try {
      const result = await apiRequest('/api/compliance/check', {
        method: 'POST',
        body: JSON.stringify({ framework }),
      });

      spinner.succeed('Compliance check completed');
      
      console.log(chalk.cyan(`\n${framework} Compliance Report:`));
      console.log(chalk.green(`Score: ${result.score}%`));
      console.log(chalk.gray(`Status: ${result.compliant ? '✓ Compliant' : '✗ Non-compliant'}`));
      
      if (result.issues && result.issues.length > 0) {
        console.log(chalk.yellow(`\nIssues found: ${result.issues.length}`));
        result.issues.forEach((issue: string, i: number) => {
          console.log(chalk.yellow(`  ${i + 1}. ${issue}`));
        });
      }
    } catch (error: any) {
      spinner.fail('Compliance check failed');
      console.error(chalk.red(error.message));
    }
  });

// ============================================================================
// MAIN
// ============================================================================

program
  .name('xase')
  .description('XASE Sheets CLI - Secure Data Marketplace')
  .version('2.0.0');

program.parse();
