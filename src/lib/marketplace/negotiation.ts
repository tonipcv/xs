/**
 * Marketplace Negotiation Engine
 * Handles offer negotiations between buyers and sellers
 */

import { prisma } from '@/lib/prisma';

export enum NegotiationStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  COUNTER_OFFERED = 'COUNTER_OFFERED',
  EXPIRED = 'EXPIRED',
}

export interface NegotiationProposal {
  offerId: string;
  proposerId: string;
  proposedPrice: number;
  proposedTerms?: Record<string, any>;
  message?: string;
}

export interface NegotiationResponse {
  negotiationId: string;
  status: NegotiationStatus;
  currentPrice: number;
  counterOffer?: {
    price: number;
    terms?: Record<string, any>;
    message?: string;
  };
}

/**
 * Initiate negotiation on an offer
 */
export async function initiateNegotiation(
  proposal: NegotiationProposal
): Promise<NegotiationResponse> {
  // Get the offer
  const offer = await prisma.offer.findUnique({
    where: { id: proposal.offerId },
    include: { dataset: true },
  });

  if (!offer) {
    throw new Error('Offer not found');
  }

  if (offer.status !== 'ACTIVE') {
    throw new Error('Offer is not active');
  }

  // Check if proposer is not the seller
  if (offer.sellerId === proposal.proposerId) {
    throw new Error('Seller cannot negotiate their own offer');
  }

  // Calculate price difference percentage (coerce to numbers and avoid division by zero)
  const offerPrice = Number((offer as any).price ?? 0)
  const proposedPrice = Number(proposal.proposedPrice ?? 0)
  const denom = offerPrice === 0 ? 1 : offerPrice
  const priceDifference = ((offerPrice - proposedPrice) / denom) * 100

  // Auto-accept if within 5% of asking price
  if (Math.abs(priceDifference) <= 5) {
    const negotiation = await prisma.negotiation.create({
      data: {
        offerId: proposal.offerId,
        buyerId: proposal.proposerId,
        sellerId: offer.sellerId,
        initialPrice: offerPrice,
        proposedPrice: proposedPrice,
        finalPrice: proposedPrice,
        status: NegotiationStatus.ACCEPTED,
        proposedTerms: proposal.proposedTerms || {},
        message: proposal.message,
        acceptedAt: new Date(),
      } as any,
    });

    // Create lease automatically
    await createLeaseFromNegotiation(negotiation.id);

    return {
      negotiationId: negotiation.id,
      status: NegotiationStatus.ACCEPTED,
      currentPrice: proposal.proposedPrice,
    };
  }

  // Create negotiation record
  const negotiation = await prisma.negotiation.create({
    data: {
      offerId: proposal.offerId,
      buyerId: proposal.proposerId,
      sellerId: offer.sellerId,
      initialPrice: offerPrice,
      proposedPrice: proposedPrice,
      status: NegotiationStatus.PENDING,
      proposedTerms: proposal.proposedTerms || {},
      message: proposal.message,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    } as any,
  });

  // Notify seller
  await notifySeller(negotiation.id);

  // Auto-counter if price is too low (>30% difference)
  if (priceDifference > 30) {
    const counterPrice = offerPrice * 0.85; // Counter with 15% discount

    await prisma.negotiation.update({
      where: { id: negotiation.id },
      data: {
        status: NegotiationStatus.COUNTER_OFFERED,
        counterPrice,
        counterMessage: 'Your offer is too low. Here is our counter-offer.',
      },
    });

    return {
      negotiationId: negotiation.id,
      status: NegotiationStatus.COUNTER_OFFERED,
      currentPrice: offerPrice,
      counterOffer: {
        price: counterPrice,
        message: 'Your offer is too low. Here is our counter-offer.',
      },
    };
  }

  return {
    negotiationId: negotiation.id,
    status: NegotiationStatus.PENDING,
    currentPrice: offerPrice,
  };
}

/**
 * Accept a negotiation
 */
export async function acceptNegotiation(
  negotiationId: string,
  acceptorId: string
): Promise<void> {
  const negotiation = await prisma.negotiation.findUnique({
    where: { id: negotiationId },
  });

  if (!negotiation) {
    throw new Error('Negotiation not found');
  }

  if (negotiation.status !== NegotiationStatus.PENDING && 
      negotiation.status !== NegotiationStatus.COUNTER_OFFERED) {
    throw new Error('Negotiation is not in a state that can be accepted');
  }

  // Verify acceptor is the seller
  if (negotiation.sellerId !== acceptorId) {
    throw new Error('Only the seller can accept this negotiation');
  }

  // Check if expired
  if (negotiation.expiresAt && negotiation.expiresAt < new Date()) {
    await prisma.negotiation.update({
      where: { id: negotiationId },
      data: { status: NegotiationStatus.EXPIRED },
    });
    throw new Error('Negotiation has expired');
  }

  // Accept negotiation
  const finalPrice = negotiation.counterPrice || negotiation.proposedPrice;

  await prisma.negotiation.update({
    where: { id: negotiationId },
    data: {
      status: NegotiationStatus.ACCEPTED,
      finalPrice,
      acceptedAt: new Date(),
    },
  });

  // Create lease
  await createLeaseFromNegotiation(negotiationId);

  // Notify buyer
  await notifyBuyer(negotiationId);

  // Log audit
  await prisma.auditLog.create({
    data: {
      action: 'NEGOTIATION_ACCEPTED',
      resourceType: 'negotiation',
      resourceId: negotiationId,
      userId: acceptorId,
      tenantId: negotiation.sellerId,
      status: 'SUCCESS',
      metadata: JSON.stringify({
        finalPrice,
        initialPrice: negotiation.initialPrice,
        proposedPrice: negotiation.proposedPrice,
      }),
    },
  });
}

/**
 * Reject a negotiation
 */
export async function rejectNegotiation(
  negotiationId: string,
  rejectorId: string,
  reason?: string
): Promise<void> {
  const negotiation = await prisma.negotiation.findUnique({
    where: { id: negotiationId },
  });

  if (!negotiation) {
    throw new Error('Negotiation not found');
  }

  if (negotiation.status !== NegotiationStatus.PENDING &&
      negotiation.status !== NegotiationStatus.COUNTER_OFFERED) {
    throw new Error('Negotiation is not in a state that can be rejected');
  }

  // Verify rejector is the seller
  if (negotiation.sellerId !== rejectorId) {
    throw new Error('Only the seller can reject this negotiation');
  }

  await prisma.negotiation.update({
    where: { id: negotiationId },
    data: {
      status: NegotiationStatus.REJECTED,
      rejectionReason: reason,
      rejectedAt: new Date(),
    },
  });

  // Notify buyer
  await notifyBuyer(negotiationId);

  // Log audit
  await prisma.auditLog.create({
    data: {
      action: 'NEGOTIATION_REJECTED',
      resourceType: 'negotiation',
      resourceId: negotiationId,
      userId: rejectorId,
      tenantId: negotiation.sellerId,
      status: 'SUCCESS',
      metadata: JSON.stringify({
        reason,
        proposedPrice: negotiation.proposedPrice,
      }),
    },
  });
}

/**
 * Counter-offer in negotiation
 */
export async function counterOffer(
  negotiationId: string,
  countererId: string,
  counterPrice: number,
  counterTerms?: Record<string, any>,
  message?: string
): Promise<NegotiationResponse> {
  const negotiation = await prisma.negotiation.findUnique({
    where: { id: negotiationId },
  });

  if (!negotiation) {
    throw new Error('Negotiation not found');
  }

  if (negotiation.status !== NegotiationStatus.PENDING) {
    throw new Error('Negotiation is not in a state that can be countered');
  }

  // Verify counterer is the seller
  if (negotiation.sellerId !== countererId) {
    throw new Error('Only the seller can counter-offer');
  }

  await prisma.negotiation.update({
    where: { id: negotiationId },
    data: {
      status: NegotiationStatus.COUNTER_OFFERED,
      counterPrice,
      counterTerms: counterTerms || {},
      counterMessage: message,
    },
  });

  // Notify buyer
  await notifyBuyer(negotiationId);

  return {
    negotiationId,
    status: NegotiationStatus.COUNTER_OFFERED,
    currentPrice: Number((negotiation as any).initialPrice ?? 0),
    counterOffer: {
      price: counterPrice,
      terms: counterTerms,
      message,
    },
  };
}

/**
 * Create lease from accepted negotiation
 */
async function createLeaseFromNegotiation(negotiationId: string): Promise<void> {
  const negotiation = await prisma.negotiation.findUnique({
    where: { id: negotiationId },
    include: { offer: { include: { dataset: true } } },
  });

  if (!negotiation || !negotiation.finalPrice) {
    throw new Error('Invalid negotiation for lease creation');
  }

  await prisma.auditLog.create({
    data: {
      action: 'NEGOTIATION_LEASE_REQUESTED',
      resourceType: 'negotiation',
      resourceId: negotiationId,
      tenantId: negotiation.buyerId,
      userId: negotiation.sellerId,
      status: 'SUCCESS',
      metadata: JSON.stringify({
        datasetId: negotiation.offer.datasetId,
        finalPrice: Number((negotiation as any).finalPrice ?? 0),
      }),
      timestamp: new Date(),
    },
  });
}

/**
 * Notify seller of new negotiation
 */
async function notifySeller(negotiationId: string): Promise<void> {
  const negotiation = await prisma.negotiation.findUnique({
    where: { id: negotiationId },
  });

  if (!negotiation) return;

  await prisma.notification.create({
    data: {
      userId: negotiation.sellerId,
      type: 'INFO',
      title: 'New Negotiation Request',
      message: `You have received a new negotiation request for $${Number((negotiation as any).proposedPrice ?? 0)}`,
      metadata: JSON.stringify({ negotiationId }),
    } as any,
  });
}

/**
 * Notify buyer of negotiation update
 */
async function notifyBuyer(negotiationId: string): Promise<void> {
  const negotiation = await prisma.negotiation.findUnique({
    where: { id: negotiationId },
  });

  if (!negotiation) return;

  let message = '';
  if (negotiation.status === NegotiationStatus.ACCEPTED) {
    message = 'Your negotiation has been accepted!';
  } else if (negotiation.status === NegotiationStatus.REJECTED) {
    message = 'Your negotiation has been rejected.';
  } else if (negotiation.status === NegotiationStatus.COUNTER_OFFERED) {
    message = `Seller has counter-offered at $${negotiation.counterPrice}`;
  }

  await prisma.notification.create({
    data: {
      userId: negotiation.buyerId,
      type: negotiation.status === NegotiationStatus.ACCEPTED ? 'SUCCESS' : 'INFO',
      title: 'Negotiation Update',
      message,
      metadata: JSON.stringify({ negotiationId }),
    } as any,
  });
}

/**
 * Get negotiation history for an offer
 */
export async function getNegotiationHistory(offerId: string): Promise<any[]> {
  return await prisma.negotiation.findMany({
    where: { offerId },
    include: {
      buyer: { select: { id: true, name: true, email: true } },
      seller: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Get active negotiations for a user
 */
export async function getUserNegotiations(
  userId: string,
  role: 'buyer' | 'seller'
): Promise<any[]> {
  const where = role === 'buyer' 
    ? { buyerId: userId }
    : { sellerId: userId };

  return await prisma.negotiation.findMany({
    where: {
      ...where,
      status: {
        in: [NegotiationStatus.PENDING, NegotiationStatus.COUNTER_OFFERED],
      },
    },
    include: {
      offer: {
        include: {
          dataset: { select: { id: true, name: true, dataType: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
}
