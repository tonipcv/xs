/**
 * GraphQL API Endpoint
 * Apollo Server integration with Next.js
 */

import { NextRequest } from 'next/server';
import { ApolloServer } from '@apollo/server';
import { startServerAndCreateNextHandler } from '@as-integrations/next';
import { typeDefs } from '@/lib/graphql/schema';
import { resolvers } from '@/lib/graphql/resolvers';
import { getServerSession } from 'next-auth';

const server = new ApolloServer({
  typeDefs,
  resolvers,
  introspection: process.env.NODE_ENV !== 'production',
});

const handler = startServerAndCreateNextHandler(server, {
  context: async (req: NextRequest) => {
    const session = await getServerSession();
    
    return {
      userId: session?.user?.email || null,
      tenantId: 'tenant_default',
      tier: 'free',
      ip: req.headers.get('x-forwarded-for') || 'unknown',
      pubsub: null, // Add PubSub for subscriptions
    };
  },
});

export async function GET(request: NextRequest) {
  return handler(request);
}

export async function POST(request: NextRequest) {
  return handler(request);
}
