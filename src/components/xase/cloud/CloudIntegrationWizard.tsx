'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, AlertCircle, Loader2, Download, ExternalLink } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

type CloudProvider = 'aws' | 'gcp' | 'azure'
type ConnectionStatus = 'idle' | 'testing' | 'success' | 'error'

interface CloudIntegrationWizardProps {
  tenantId: string
  onComplete?: (provider: CloudProvider, config: any) => void
}

export function CloudIntegrationWizard({ tenantId, onComplete }: CloudIntegrationWizardProps) {
  const [selectedProvider, setSelectedProvider] = useState<CloudProvider>('aws')
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle')
  const [errorMessage, setErrorMessage] = useState<string>('')
  
  // AWS State
  const [awsRoleArn, setAwsRoleArn] = useState('')
  const [awsExternalId, setAwsExternalId] = useState('')
  const [awsBucket, setAwsBucket] = useState('')
  
  // GCP State
  const [gcpProjectId, setGcpProjectId] = useState('')
  const [gcpServiceAccount, setGcpServiceAccount] = useState('')
  
  // Azure State
  const [azureConnectionString, setAzureConnectionString] = useState('')
  const [azureContainer, setAzureContainer] = useState('')

  const testConnection = async () => {
    setConnectionStatus('testing')
    setErrorMessage('')

    try {
      const config = selectedProvider === 'aws' 
        ? { roleArn: awsRoleArn, externalId: awsExternalId, bucket: awsBucket }
        : selectedProvider === 'gcp'
        ? { projectId: gcpProjectId, serviceAccount: gcpServiceAccount }
        : { connectionString: azureConnectionString, container: azureContainer }

      const response = await fetch('/api/v1/cloud/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: selectedProvider,
          config
        })
      })

      if (response.ok) {
        setConnectionStatus('success')
        setTimeout(() => {
          onComplete?.(selectedProvider, config)
        }, 1500)
      } else {
        const error = await response.json()
        setConnectionStatus('error')
        setErrorMessage(error.message || 'Connection test failed')
      }
    } catch (error) {
      setConnectionStatus('error')
      setErrorMessage('Network error. Please try again.')
    }
  }

  const downloadCloudFormation = () => {
    const template = {
      AWSTemplateFormatVersion: '2010-09-09',
      Description: 'XASE IAM Role for secure data access',
      Parameters: {
        ExternalId: {
          Type: 'String',
          Default: awsExternalId || 'xase-' + tenantId,
          Description: 'External ID for role assumption'
        }
      },
      Resources: {
        XaseAccessRole: {
          Type: 'AWS::IAM::Role',
          Properties: {
            RoleName: 'XaseDataAccessRole',
            AssumeRolePolicyDocument: {
              Version: '2012-10-17',
              Statement: [{
                Effect: 'Allow',
                Principal: { AWS: 'arn:aws:iam::XASE_ACCOUNT_ID:root' },
                Action: 'sts:AssumeRole',
                Condition: {
                  StringEquals: { 'sts:ExternalId': { Ref: 'ExternalId' } }
                }
              }]
            },
            Policies: [{
              PolicyName: 'XaseS3Access',
              PolicyDocument: {
                Version: '2012-10-17',
                Statement: [{
                  Effect: 'Allow',
                  Action: ['s3:GetObject', 's3:ListBucket'],
                  Resource: [
                    `arn:aws:s3:::${awsBucket || 'YOUR_BUCKET'}`,
                    `arn:aws:s3:::${awsBucket || 'YOUR_BUCKET'}/*`
                  ]
                }]
              }
            }]
          }
        }
      },
      Outputs: {
        RoleArn: {
          Description: 'ARN of the IAM Role',
          Value: { 'Fn::GetAtt': ['XaseAccessRole', 'Arn'] }
        }
      }
    }

    const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'xase-iam-role.json'
    a.click()
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold">Connect Cloud Storage</h2>
        <p className="text-muted-foreground">
          Link your cloud storage for instant dataset access
        </p>
      </div>

      <Tabs value={selectedProvider} onValueChange={(v) => setSelectedProvider(v as CloudProvider)}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="aws" className="flex items-center gap-2">
            <img src="/logos-integrations/aws.png" alt="AWS" className="h-5 w-5" />
            AWS S3
          </TabsTrigger>
          <TabsTrigger value="gcp" className="flex items-center gap-2">
            <img src="/logos-integrations/gcp.png" alt="GCP" className="h-5 w-5" />
            Google Cloud
          </TabsTrigger>
          <TabsTrigger value="azure" className="flex items-center gap-2">
            <img src="/logos-integrations/azure.png" alt="Azure" className="h-5 w-5" />
            Azure
          </TabsTrigger>
        </TabsList>

        {/* AWS Configuration */}
        <TabsContent value="aws" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>AWS S3 Configuration</CardTitle>
              <CardDescription>
                Use IAM Role for secure, credential-free access (recommended)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <Download className="h-4 w-4" />
                <AlertDescription>
                  <div className="flex items-center justify-between">
                    <span>Download CloudFormation template to create IAM Role</span>
                    <Button variant="outline" size="sm" onClick={downloadCloudFormation}>
                      <Download className="h-4 w-4 mr-2" />
                      Download Template
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                <Label htmlFor="roleArn">IAM Role ARN *</Label>
                <Input
                  id="roleArn"
                  placeholder="arn:aws:iam::123456789012:role/XaseDataAccessRole"
                  value={awsRoleArn}
                  onChange={(e) => setAwsRoleArn(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Copy from CloudFormation stack outputs
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="externalId">External ID</Label>
                <Input
                  id="externalId"
                  placeholder="xase-tenant-123"
                  value={awsExternalId}
                  onChange={(e) => setAwsExternalId(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Use the same External ID from CloudFormation
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="bucket">S3 Bucket Name *</Label>
                <Input
                  id="bucket"
                  placeholder="my-audio-datasets"
                  value={awsBucket}
                  onChange={(e) => setAwsBucket(e.target.value)}
                />
              </div>

              <Alert className="bg-blue-50 border-blue-200">
                <AlertDescription className="text-blue-900">
                  <strong>Estimated Cost:</strong> S3 API calls: ~$0.0004 per 1000 requests
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>

        {/* GCP Configuration */}
        <TabsContent value="gcp" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Google Cloud Storage Configuration</CardTitle>
              <CardDescription>
                OAuth 2.0 authentication with automatic project detection
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button variant="outline" className="w-full">
                <ExternalLink className="h-4 w-4 mr-2" />
                Sign in with Google
              </Button>

              <div className="space-y-2">
                <Label htmlFor="gcpProject">Project ID</Label>
                <Input
                  id="gcpProject"
                  placeholder="Auto-detected after OAuth"
                  value={gcpProjectId}
                  onChange={(e) => setGcpProjectId(e.target.value)}
                  disabled
                />
                <p className="text-xs text-muted-foreground">
                  Will be automatically detected after signing in
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="gcpServiceAccount">Service Account (Optional)</Label>
                <Input
                  id="gcpServiceAccount"
                  placeholder="xase@project.iam.gserviceaccount.com"
                  value={gcpServiceAccount}
                  onChange={(e) => setGcpServiceAccount(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Azure Configuration */}
        <TabsContent value="azure" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Azure Blob Storage Configuration</CardTitle>
              <CardDescription>
                Connect using connection string or managed identity
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="azureConn">Connection String *</Label>
                <Input
                  id="azureConn"
                  type="password"
                  placeholder="DefaultEndpointsProtocol=https;AccountName=..."
                  value={azureConnectionString}
                  onChange={(e) => setAzureConnectionString(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="azureContainer">Container Name *</Label>
                <Input
                  id="azureContainer"
                  placeholder="audio-datasets"
                  value={azureContainer}
                  onChange={(e) => setAzureContainer(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Test Connection */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            <Button
              onClick={testConnection}
              disabled={connectionStatus === 'testing'}
              className="w-full"
              size="lg"
            >
              {connectionStatus === 'testing' && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {connectionStatus === 'testing' ? 'Testing Connection...' : 'Test Connection'}
            </Button>

            {connectionStatus === 'success' && (
              <Alert className="bg-green-50 border-green-200">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-900">
                  <strong>Connection successful!</strong> Your cloud storage is now connected.
                </AlertDescription>
              </Alert>
            )}

            {connectionStatus === 'error' && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <strong>Connection failed:</strong> {errorMessage}
                </AlertDescription>
              </Alert>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
