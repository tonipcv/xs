/**
 * GraphQL Schema Definition
 * Complete GraphQL API as alternative to REST
 */

export const typeDefs = `#graphql
  scalar DateTime
  scalar JSON

  type Query {
    # Datasets
    datasets(
      limit: Int = 10
      offset: Int = 0
      dataType: String
      region: String
      status: String
    ): DatasetConnection!
    dataset(id: ID!): Dataset
    
    # Leases
    leases(
      limit: Int = 10
      offset: Int = 0
      status: String
    ): LeaseConnection!
    lease(id: ID!): Lease
    
    # Policies
    policies(
      limit: Int = 10
      offset: Int = 0
    ): PolicyConnection!
    policy(id: ID!): Policy
    
    # Members
    members(
      tenantId: ID!
      limit: Int = 10
      offset: Int = 0
    ): MemberConnection!
    member(id: ID!): Member
    
    # Analytics
    analytics(
      startDate: DateTime!
      endDate: DateTime!
      metrics: [String!]!
    ): Analytics!
    
    # Billing
    billingUsage(
      startDate: DateTime!
      endDate: DateTime!
    ): BillingUsage!
    
    # Compliance
    complianceScore(framework: String!): ComplianceScore!
    
    # Feature Flags
    featureFlags: [FeatureFlag!]!
    featureFlag(name: String!): FeatureFlag
    
    # Rate Limits
    rateLimitStatus: RateLimitStatus!
  }

  type Mutation {
    # Datasets
    createDataset(input: CreateDatasetInput!): Dataset!
    updateDataset(id: ID!, input: UpdateDatasetInput!): Dataset!
    deleteDataset(id: ID!): Boolean!
    publishDataset(id: ID!): Dataset!
    
    # Leases
    createLease(input: CreateLeaseInput!): Lease!
    renewLease(id: ID!): Lease!
    revokeLease(id: ID!): Boolean!
    updateAutoRenew(id: ID!, config: AutoRenewConfigInput!): Lease!
    
    # Policies
    createPolicy(input: CreatePolicyInput!): Policy!
    updatePolicy(id: ID!, input: UpdatePolicyInput!): Policy!
    deletePolicy(id: ID!): Boolean!
    
    # Members
    inviteMember(input: InviteMemberInput!): Member!
    updateMemberRole(id: ID!, role: String!, permissions: [String!]): Member!
    removeMember(id: ID!): Boolean!
    
    # Feature Flags
    updateFeatureFlag(input: UpdateFeatureFlagInput!): FeatureFlag!
    
    # Webhooks
    createWebhook(input: CreateWebhookInput!): Webhook!
    updateWebhook(id: ID!, input: UpdateWebhookInput!): Webhook!
    deleteWebhook(id: ID!): Boolean!
  }

  type Subscription {
    # Real-time notifications
    notifications: Notification!
    
    # Lease updates
    leaseUpdated(leaseId: ID!): Lease!
    
    # Dataset updates
    datasetUpdated(datasetId: ID!): Dataset!
    
    # Anomaly alerts
    anomalyDetected: AnomalyAlert!
  }

  # Types
  type Dataset {
    id: ID!
    name: String!
    description: String
    dataType: String!
    region: String!
    status: String!
    size: Int!
    recordCount: Int
    createdAt: DateTime!
    updatedAt: DateTime!
    publishedAt: DateTime
    tenant: Tenant!
    leases: [Lease!]!
    policies: [Policy!]!
  }

  type DatasetConnection {
    edges: [DatasetEdge!]!
    pageInfo: PageInfo!
    totalCount: Int!
  }

  type DatasetEdge {
    node: Dataset!
    cursor: String!
  }

  type Lease {
    id: ID!
    datasetId: ID!
    dataset: Dataset!
    policyId: ID!
    policy: Policy!
    status: String!
    createdAt: DateTime!
    expiresAt: DateTime!
    autoRenew: Boolean!
    autoRenewConfig: AutoRenewConfig
    usage: LeaseUsage!
  }

  type LeaseConnection {
    edges: [LeaseEdge!]!
    pageInfo: PageInfo!
    totalCount: Int!
  }

  type LeaseEdge {
    node: Lease!
    cursor: String!
  }

  type LeaseUsage {
    bytesProcessed: Int!
    requestCount: Int!
    cost: Float!
  }

  type AutoRenewConfig {
    enabled: Boolean!
    maxRenewals: Int!
    budgetLimit: Float!
    currentRenewals: Int!
  }

  type Policy {
    id: ID!
    name: String!
    description: String
    rules: JSON!
    createdAt: DateTime!
    updatedAt: DateTime!
    tenant: Tenant!
  }

  type PolicyConnection {
    edges: [PolicyEdge!]!
    pageInfo: PageInfo!
    totalCount: Int!
  }

  type PolicyEdge {
    node: Policy!
    cursor: String!
  }

  type Member {
    id: ID!
    userId: ID!
    tenantId: ID!
    role: String!
    permissions: [String!]!
    user: User!
    tenant: Tenant!
    joinedAt: DateTime!
  }

  type MemberConnection {
    edges: [MemberEdge!]!
    pageInfo: PageInfo!
    totalCount: Int!
  }

  type MemberEdge {
    node: Member!
    cursor: String!
  }

  type User {
    id: ID!
    name: String!
    email: String!
    createdAt: DateTime!
  }

  type Tenant {
    id: ID!
    name: String!
    tier: String!
    createdAt: DateTime!
  }

  type Analytics {
    datasets: DatasetAnalytics!
    leases: LeaseAnalytics!
    revenue: RevenueAnalytics!
    performance: PerformanceAnalytics!
  }

  type DatasetAnalytics {
    total: Int!
    published: Int!
    active: Int!
    byDataType: [DataTypeCount!]!
  }

  type DataTypeCount {
    dataType: String!
    count: Int!
  }

  type LeaseAnalytics {
    total: Int!
    active: Int!
    expiring: Int!
    expired: Int!
  }

  type RevenueAnalytics {
    today: Float!
    thisMonth: Float!
    thisYear: Float!
  }

  type PerformanceAnalytics {
    uptime: Float!
    errorRate: Float!
    cacheHitRate: Float!
    avgResponseTime: Float!
  }

  type BillingUsage {
    bytesProcessed: Int!
    requestCount: Int!
    totalCost: Float!
    breakdown: [UsageBreakdown!]!
  }

  type UsageBreakdown {
    date: DateTime!
    bytes: Int!
    requests: Int!
    cost: Float!
  }

  type ComplianceScore {
    framework: String!
    score: Float!
    controls: [ComplianceControl!]!
    lastAssessed: DateTime!
  }

  type ComplianceControl {
    id: String!
    name: String!
    status: String!
    evidence: [String!]!
  }

  type FeatureFlag {
    id: ID!
    name: String!
    description: String!
    enabled: Boolean!
    rolloutPercentage: Int!
    targetUsers: [String!]
    targetTenants: [String!]
  }

  type RateLimitStatus {
    tier: String!
    limits: RateLimits!
    current: CurrentUsage!
    remaining: RemainingLimits!
  }

  type RateLimits {
    requestsPerMinute: Int!
    requestsPerHour: Int!
    requestsPerDay: Int!
    concurrentRequests: Int!
  }

  type CurrentUsage {
    requestsThisMinute: Int!
    requestsThisHour: Int!
    requestsThisDay: Int!
    concurrentRequests: Int!
  }

  type RemainingLimits {
    minute: Int!
    hour: Int!
    day: Int!
  }

  type Notification {
    id: ID!
    type: String!
    title: String!
    message: String!
    data: JSON
    read: Boolean!
    createdAt: DateTime!
  }

  type AnomalyAlert {
    id: ID!
    type: String!
    severity: String!
    description: String!
    detectedAt: DateTime!
    data: JSON
  }

  type Webhook {
    id: ID!
    url: String!
    events: [String!]!
    active: Boolean!
    secret: String!
    createdAt: DateTime!
  }

  type PageInfo {
    hasNextPage: Boolean!
    hasPreviousPage: Boolean!
    startCursor: String
    endCursor: String
  }

  # Inputs
  input CreateDatasetInput {
    name: String!
    description: String
    dataType: String!
    region: String!
  }

  input UpdateDatasetInput {
    name: String
    description: String
    status: String
  }

  input CreateLeaseInput {
    datasetId: ID!
    policyId: ID!
    duration: Int!
  }

  input AutoRenewConfigInput {
    enabled: Boolean!
    maxRenewals: Int!
    budgetLimit: Float!
  }

  input CreatePolicyInput {
    name: String!
    description: String
    rules: JSON!
  }

  input UpdatePolicyInput {
    name: String
    description: String
    rules: JSON
  }

  input InviteMemberInput {
    email: String!
    role: String!
    permissions: [String!]
  }

  input UpdateFeatureFlagInput {
    name: String!
    enabled: Boolean!
    rolloutPercentage: Int
    targetUsers: [String!]
    targetTenants: [String!]
  }

  input CreateWebhookInput {
    url: String!
    events: [String!]!
    secret: String
  }

  input UpdateWebhookInput {
    url: String
    events: [String!]
    active: Boolean
  }
`;
