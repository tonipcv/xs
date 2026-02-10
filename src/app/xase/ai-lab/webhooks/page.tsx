'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Webhook, CheckCircle, XCircle, Clock, RotateCw, Zap } from 'lucide-react'
// Using native checkbox to avoid dependency on missing UI component

export default function WebhooksPage() {
  const [webhooks, setWebhooks] = useState<any[]>([])
  const [deliveries, setDeliveries] = useState<any[]>([])
  const [selectedWebhook, setSelectedWebhook] = useState<string>('')
  
  const [newWebhook, setNewWebhook] = useState({
    url: '',
    events: [] as string[],
  })

  const availableEvents = [
    { value: 'lease_issued', label: 'Lease Issued' },
    { value: 'lease_revoked', label: 'Lease Revoked' },
    { value: 'consent_changed', label: 'Consent Changed' },
    { value: 'budget_exhausted', label: 'Budget Exhausted' },
    { value: 'policy_created', label: 'Policy Created' },
    { value: 'policy_updated', label: 'Policy Updated' },
    { value: 'quota_exceeded', label: 'Quota Exceeded' },
  ]

  const registerWebhook = async () => {
    try {
      await fetch('/api/v1/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'register',
          tenantId: 'current',
          ...newWebhook,
        }),
      })
      setNewWebhook({ url: '', events: [] })
      alert('Webhook registered successfully')
    } catch (error) {
      console.error('Failed to register webhook:', error)
    }
  }

  const testWebhook = async (webhookId: string) => {
    try {
      const response = await fetch(`/api/v1/webhooks?action=test&webhookId=${webhookId}`)
      const data = await response.json()
      alert(data.success ? `Test successful! Latency: ${data.latency}ms` : `Test failed: ${data.error}`)
    } catch (error) {
      console.error('Failed to test webhook:', error)
    }
  }

  const loadDeliveries = async (webhookId: string) => {
    try {
      const response = await fetch(`/api/v1/webhooks?action=deliveries&webhookId=${webhookId}`)
      const data = await response.json()
      setDeliveries(data.deliveries || [])
      setSelectedWebhook(webhookId)
    } catch (error) {
      console.error('Failed to load deliveries:', error)
    }
  }

  const retryDelivery = async (deliveryId: string) => {
    try {
      await fetch('/api/v1/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'retry',
          deliveryId,
        }),
      })
      if (selectedWebhook) {
        loadDeliveries(selectedWebhook)
      }
    } catch (error) {
      console.error('Failed to retry delivery:', error)
    }
  }

  const toggleEvent = (event: string) => {
    setNewWebhook(prev => ({
      ...prev,
      events: prev.events.includes(event)
        ? prev.events.filter(e => e !== event)
        : [...prev.events, event]
    }))
  }

  return (
    <div className="container mx-auto py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Webhooks</h1>
        <p className="text-muted-foreground mt-2">
          Receive real-time notifications for events
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Register Webhook</CardTitle>
            <CardDescription>
              Subscribe to events and receive notifications
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Webhook URL</Label>
              <Input
                type="url"
                placeholder="https://api.example.com/webhooks"
                value={newWebhook.url}
                onChange={(e) => setNewWebhook({ ...newWebhook, url: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label>Events to Subscribe</Label>
              <div className="space-y-2">
                {availableEvents.map((event) => (
                  <div key={event.value} className="flex items-center space-x-2">
                    <input
                      id={event.value}
                      type="checkbox"
                      className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500"
                      checked={newWebhook.events.includes(event.value)}
                      onChange={() => toggleEvent(event.value)}
                    />
                    <label
                      htmlFor={event.value}
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      {event.label}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            <Button
              onClick={registerWebhook}
              disabled={!newWebhook.url || newWebhook.events.length === 0}
              className="w-full"
            >
              <Webhook className="mr-2 h-4 w-4" />
              Register Webhook
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Registered Webhooks</CardTitle>
            <CardDescription>
              Your active webhook endpoints
            </CardDescription>
          </CardHeader>
          <CardContent>
            {webhooks.length > 0 ? (
              <div className="space-y-3">
                {webhooks.map((webhook) => (
                  <div
                    key={webhook.id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div className="flex-1">
                      <p className="font-medium text-sm">{webhook.url}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline">{webhook.events.length} events</Badge>
                        {webhook.enabled ? (
                          <Badge variant="default">Active</Badge>
                        ) : (
                          <Badge variant="secondary">Disabled</Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => testWebhook(webhook.id)}
                      >
                        <Zap className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => loadDeliveries(webhook.id)}
                      >
                        View
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Webhook className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No webhooks registered yet</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {selectedWebhook && (
        <Card>
          <CardHeader>
            <CardTitle>Delivery History</CardTitle>
            <CardDescription>
              Recent webhook deliveries for {selectedWebhook}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {deliveries.length > 0 ? (
              <div className="space-y-2">
                {deliveries.map((delivery) => (
                  <div
                    key={delivery.id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        {delivery.status === 'success' && (
                          <CheckCircle className="h-4 w-4 text-green-600" />
                        )}
                        {delivery.status === 'failed' && (
                          <XCircle className="h-4 w-4 text-red-600" />
                        )}
                        {delivery.status === 'retrying' && (
                          <Clock className="h-4 w-4 text-orange-600" />
                        )}
                        <span className="text-sm font-medium">{delivery.eventId}</span>
                        <Badge variant={
                          delivery.status === 'success' ? 'default' :
                          delivery.status === 'failed' ? 'destructive' :
                          'secondary'
                        }>
                          {delivery.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                        <span>Attempts: {delivery.attempts}</span>
                        {delivery.lastAttempt && (
                          <span>{new Date(delivery.lastAttempt).toLocaleString()}</span>
                        )}
                        {delivery.response && (
                          <span>Status: {delivery.response.status}</span>
                        )}
                      </div>
                    </div>
                    {delivery.status === 'failed' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => retryDelivery(delivery.id)}
                      >
                        <RotateCw className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Clock className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No deliveries yet</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Webhook Security</CardTitle>
          <CardDescription>
            How to verify webhook signatures
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-muted rounded-lg">
            <p className="text-sm font-medium mb-2">Signature Verification</p>
            <p className="text-sm text-muted-foreground mb-3">
              All webhooks are signed with HMAC SHA-256. Verify the signature using the X-Webhook-Signature header.
            </p>
            <pre className="text-xs bg-background p-3 rounded border overflow-auto">
{`const crypto = require('crypto');

function verifySignature(payload, signature, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  const expectedSignature = hmac.update(payload).digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}`}
            </pre>
          </div>

          <div className="p-4 bg-muted rounded-lg">
            <p className="text-sm font-medium mb-2">Headers</p>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li><code className="bg-background px-1 rounded">X-Webhook-Signature</code> - HMAC SHA-256 signature</li>
              <li><code className="bg-background px-1 rounded">X-Webhook-Event</code> - Event type</li>
              <li><code className="bg-background px-1 rounded">X-Webhook-Id</code> - Event ID</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
