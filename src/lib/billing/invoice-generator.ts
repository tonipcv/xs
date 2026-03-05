/**
 * Automatic Invoice Generation
 * Generates monthly invoices for suppliers based on usage
 */

import { PrismaClient } from '@prisma/client';
import Stripe from 'stripe';
import { sendEmail } from '@/lib/email';

const prisma = new PrismaClient();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-03-31.basil',
});

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  metadata?: Record<string, any>;
}

export interface Invoice {
  invoiceId: string;
  tenantId: string;
  period: string;
  periodStart: Date;
  periodEnd: Date;
  lineItems: InvoiceLineItem[];
  subtotal: number;
  tax: number;
  total: number;
  currency: string;
  status: 'draft' | 'pending' | 'paid' | 'failed';
  dueDate: Date;
  createdAt: Date;
}

/**
 * Generate monthly invoice for a tenant
 */
export async function generateMonthlyInvoice(
  tenantId: string,
  year: number,
  month: number
): Promise<Invoice> {
  try {
    console.log(`Generating invoice for tenant ${tenantId}, period ${year}-${month}`);

    // Calculate period dates
    const periodStart = new Date(year, month - 1, 1);
    const periodEnd = new Date(year, month, 0, 23, 59, 59);
    const period = `${year}-${String(month).padStart(2, '0')}`;

    // Get tenant info
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        users: {
          where: {
            xaseRole: {
              in: ['OWNER', 'ADMIN'],
            },
          },
          take: 1,
        },
      },
    });

    if (!tenant) {
      throw new Error(`Tenant not found: ${tenantId}`);
    }

    // Get billing snapshot for the period
    const billingSnapshot = await prisma.billingSnapshot.findFirst({
      where: {
        tenantId,
        period,
      },
    });

    if (!billingSnapshot) {
      throw new Error(`No billing data found for period ${period}`);
    }

    // Calculate line items based on usage
    const lineItems: InvoiceLineItem[] = [];

    // Audio minutes
    if (billingSnapshot.audioMinutes > 0) {
      const audioRate = 0.05; // $0.05 per minute
      lineItems.push({
        description: 'Audio Processing Minutes',
        quantity: billingSnapshot.audioMinutes,
        unitPrice: audioRate,
        amount: billingSnapshot.audioMinutes * audioRate,
        metadata: {
          type: 'audio',
          minutes: billingSnapshot.audioMinutes,
        },
      });
    }

    // Storage (bytes to GB)
    if (billingSnapshot.bytesTotal > 0) {
      const storageGB = billingSnapshot.bytesTotal / (1024 * 1024 * 1024);
      const storageRate = 0.10; // $0.10 per GB
      lineItems.push({
        description: 'Data Storage (GB)',
        quantity: Math.ceil(storageGB),
        unitPrice: storageRate,
        amount: Math.ceil(storageGB) * storageRate,
        metadata: {
          type: 'storage',
          bytes: billingSnapshot.bytesTotal,
          gb: storageGB,
        },
      });
    }

    // Redactions
    if (billingSnapshot.redactionsTotal > 0) {
      const redactionRate = 0.01; // $0.01 per redaction
      lineItems.push({
        description: 'Data Redactions',
        quantity: billingSnapshot.redactionsTotal,
        unitPrice: redactionRate,
        amount: billingSnapshot.redactionsTotal * redactionRate,
        metadata: {
          type: 'redactions',
          count: billingSnapshot.redactionsTotal,
        },
      });
    }

    // Calculate totals
    const subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0);
    const taxRate = 0.0; // No tax for now, can be configured per region
    const tax = subtotal * taxRate;
    const total = subtotal + tax;

    // Generate invoice ID
    const invoiceId = `inv_${Date.now()}_${tenantId.substring(0, 8)}`;

    // Due date: 30 days from period end
    const dueDate = new Date(periodEnd);
    dueDate.setDate(dueDate.getDate() + 30);

    const invoice: Invoice = {
      invoiceId,
      tenantId,
      period,
      periodStart,
      periodEnd,
      lineItems,
      subtotal,
      tax,
      total,
      currency: 'USD',
      status: 'draft',
      dueDate,
      createdAt: new Date(),
    };

    // Save invoice to audit log
    await prisma.auditLog.create({
      data: {
        tenantId,
        action: 'INVOICE_GENERATED',
        resourceType: 'invoice',
        resourceId: invoiceId,
        metadata: JSON.stringify(invoice),
        status: 'SUCCESS',
        timestamp: new Date(),
      },
    });

    console.log(`Invoice generated: ${invoiceId}, total: $${total.toFixed(2)}`);

    return invoice;
  } catch (error) {
    console.error('Error generating invoice:', error);
    throw error;
  }
}

/**
 * Create Stripe invoice for payment
 */
export async function createStripeInvoice(invoice: Invoice): Promise<string> {
  try {
    // Get tenant's Stripe customer ID
    const user = await prisma.user.findFirst({
      where: {
        tenantId: invoice.tenantId,
        stripeCustomerId: {
          not: null,
        },
      },
      select: {
        stripeCustomerId: true,
      },
    });

    if (!user?.stripeCustomerId) {
      throw new Error('No Stripe customer ID found for tenant');
    }

    // Create invoice items
    for (const item of invoice.lineItems) {
      await stripe.invoiceItems.create({
        customer: user.stripeCustomerId,
        amount: Math.round(item.amount * 100), // Convert to cents
        currency: invoice.currency.toLowerCase(),
        description: item.description,
        metadata: {
          invoiceId: invoice.invoiceId,
          tenantId: invoice.tenantId,
          period: invoice.period,
          ...item.metadata,
        },
      });
    }

    // Create invoice
    const stripeInvoice = await stripe.invoices.create({
      customer: user.stripeCustomerId,
      auto_advance: true,
      collection_method: 'charge_automatically',
      due_date: Math.floor(invoice.dueDate.getTime() / 1000),
      metadata: {
        invoiceId: invoice.invoiceId,
        tenantId: invoice.tenantId,
        period: invoice.period,
      },
    });

    // Finalize invoice
    await stripe.invoices.finalizeInvoice((stripeInvoice as any).id as string);

    console.log(`Stripe invoice created: ${(stripeInvoice as any).id}`);

    return ((stripeInvoice as any).id as string);
  } catch (error) {
    console.error('Error creating Stripe invoice:', error);
    throw error;
  }
}

/**
 * Send invoice email to tenant
 */
export async function sendInvoiceEmail(invoice: Invoice): Promise<void> {
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: invoice.tenantId },
      include: {
        users: {
          where: {
            xaseRole: {
              in: ['OWNER', 'ADMIN'],
            },
          },
        },
      },
    });

    if (!tenant || tenant.users.length === 0) {
      throw new Error('No recipients found for invoice email');
    }

    // Generate line items HTML
    const lineItemsHtml = invoice.lineItems
      .map(
        item => `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #eee;">${item.description}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">${item.quantity}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">$${item.unitPrice.toFixed(2)}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">$${item.amount.toFixed(2)}</td>
        </tr>
      `
      )
      .join('');

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Invoice for ${invoice.period}</h2>
        
        <p>Dear ${tenant.name},</p>
        
        <p>Your invoice for the period ${invoice.periodStart.toLocaleDateString()} to ${invoice.periodEnd.toLocaleDateString()} is ready.</p>
        
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <thead>
            <tr style="background-color: #f5f5f5;">
              <th style="padding: 8px; text-align: left; border-bottom: 2px solid #ddd;">Description</th>
              <th style="padding: 8px; text-align: right; border-bottom: 2px solid #ddd;">Quantity</th>
              <th style="padding: 8px; text-align: right; border-bottom: 2px solid #ddd;">Unit Price</th>
              <th style="padding: 8px; text-align: right; border-bottom: 2px solid #ddd;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${lineItemsHtml}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="3" style="padding: 8px; text-align: right; font-weight: bold;">Subtotal:</td>
              <td style="padding: 8px; text-align: right; font-weight: bold;">$${invoice.subtotal.toFixed(2)}</td>
            </tr>
            ${
              invoice.tax > 0
                ? `
            <tr>
              <td colspan="3" style="padding: 8px; text-align: right;">Tax:</td>
              <td style="padding: 8px; text-align: right;">$${invoice.tax.toFixed(2)}</td>
            </tr>
            `
                : ''
            }
            <tr style="background-color: #f5f5f5;">
              <td colspan="3" style="padding: 8px; text-align: right; font-weight: bold; font-size: 1.2em;">Total:</td>
              <td style="padding: 8px; text-align: right; font-weight: bold; font-size: 1.2em;">$${invoice.total.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
        
        <p><strong>Invoice ID:</strong> ${invoice.invoiceId}</p>
        <p><strong>Due Date:</strong> ${invoice.dueDate.toLocaleDateString()}</p>
        
        <p>Payment will be automatically charged to your payment method on file.</p>
        
        <p>If you have any questions, please contact our support team.</p>
        
        <p>Thank you for using XASE Sheets!</p>
      </div>
    `;

    // Send to all admins
    for (const admin of tenant.users) {
      if (admin.email) {
        await sendEmail({
          to: admin.email,
          subject: `Invoice ${invoice.invoiceId} - ${invoice.period}`,
          html: emailHtml,
        });
      }
    }

    console.log(`Invoice email sent for ${invoice.invoiceId}`);
  } catch (error) {
    console.error('Error sending invoice email:', error);
    throw error;
  }
}

/**
 * Generate invoices for all tenants for a given month
 */
export async function generateAllMonthlyInvoices(
  year: number,
  month: number
): Promise<{ success: number; failed: number; invoices: Invoice[] }> {
  try {
    console.log(`Generating invoices for all tenants: ${year}-${month}`);

    const period = `${year}-${String(month).padStart(2, '0')}`;

    // Get all tenants with billing data for this period
    const billingSnapshots = await prisma.billingSnapshot.findMany({
      where: { period },
      select: { tenantId: true },
      distinct: ['tenantId'],
    });

    console.log(`Found ${billingSnapshots.length} tenants with billing data`);

    const results = {
      success: 0,
      failed: 0,
      invoices: [] as Invoice[],
    };

    for (const snapshot of billingSnapshots) {
      try {
        const invoice = await generateMonthlyInvoice(
          snapshot.tenantId,
          year,
          month
        );

        // Create Stripe invoice
        await createStripeInvoice(invoice);

        // Send email
        await sendInvoiceEmail(invoice);

        results.success++;
        results.invoices.push(invoice);

        console.log(`✓ Invoice generated for tenant ${snapshot.tenantId}`);
      } catch (error) {
        console.error(`✗ Failed to generate invoice for tenant ${snapshot.tenantId}:`, error);
        results.failed++;
      }
    }

    console.log(`Invoice generation complete: ${results.success} success, ${results.failed} failed`);

    return results;
  } catch (error) {
    console.error('Error generating all invoices:', error);
    throw error;
  }
}

/**
 * Get invoice by ID
 */
export async function getInvoice(invoiceId: string): Promise<Invoice | null> {
  try {
    const auditLog = await prisma.auditLog.findFirst({
      where: {
        action: 'INVOICE_GENERATED',
        resourceId: invoiceId,
      },
      select: {
        metadata: true,
      },
    });

    if (!auditLog?.metadata) {
      return null;
    }

    return JSON.parse(auditLog.metadata);
  } catch (error) {
    console.error('Error getting invoice:', error);
    return null;
  }
}

/**
 * Get all invoices for a tenant
 */
export async function getTenantInvoices(tenantId: string): Promise<Invoice[]> {
  try {
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        tenantId,
        action: 'INVOICE_GENERATED',
      },
      select: {
        metadata: true,
      },
      orderBy: {
        timestamp: 'desc',
      },
    });

    return auditLogs
      .map(log => {
        try {
          return JSON.parse(log.metadata || '{}');
        } catch {
          return null;
        }
      })
      .filter((invoice): invoice is Invoice => invoice !== null);
  } catch (error) {
    console.error('Error getting tenant invoices:', error);
    return [];
  }
}
