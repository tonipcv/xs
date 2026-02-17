'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';

function CLIVerifyContent() {
  const searchParams = useSearchParams();
  const deviceCode = searchParams.get('device');
  const [status, setStatus] = useState<'pending' | 'approved' | 'denied' | 'error'>('pending');
  const [loading, setLoading] = useState(false);

  const handleApprove = async () => {
    if (!deviceCode) return;
    setLoading(true);
    try {
      const res = await fetch('/api/v1/cli/auth/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_code: deviceCode }),
      });
      if (res.ok) {
        setStatus('approved');
      } else {
        setStatus('error');
      }
    } catch (error) {
      console.error('Approval error:', error);
      setStatus('error');
    } finally {
      setLoading(false);
    }
  };

  const handleDeny = async () => {
    if (!deviceCode) return;
    setLoading(true);
    try {
      const res = await fetch('/api/v1/cli/auth/deny', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_code: deviceCode }),
      });
      if (res.ok) {
        setStatus('denied');
      } else {
        setStatus('error');
      }
    } catch (error) {
      console.error('Denial error:', error);
      setStatus('error');
    } finally {
      setLoading(false);
    }
  };

  if (!deviceCode) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Invalid Request</CardTitle>
            <CardDescription>No device code provided</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>CLI Authentication</CardTitle>
          <CardDescription>
            {status === 'pending' && 'Authorize XASE CLI to access your account'}
            {status === 'approved' && 'Access Granted'}
            {status === 'denied' && 'Access Denied'}
            {status === 'error' && 'An error occurred'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {status === 'pending' && (
            <>
              <div className="bg-gray-100 rounded-lg p-4 space-y-2">
                <p className="text-sm text-gray-600">Device Code:</p>
                <p className="font-mono text-sm font-semibold text-gray-900 break-all">{deviceCode}</p>
              </div>
              <p className="text-sm text-gray-600">
                The XASE CLI is requesting access to your account. This will allow the CLI to manage datasets, policies, and other resources on your behalf.
              </p>
              <div className="flex gap-3">
                <Button
                  onClick={handleApprove}
                  disabled={loading}
                  className="flex-1"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Approve'}
                </Button>
                <Button
                  onClick={handleDeny}
                  disabled={loading}
                  variant="outline"
                  className="flex-1"
                >
                  Deny
                </Button>
              </div>
            </>
          )}

          {status === 'approved' && (
            <div className="text-center space-y-4">
              <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
              <p className="text-sm text-gray-600">
                CLI access has been granted. You can now return to your terminal.
              </p>
            </div>
          )}

          {status === 'denied' && (
            <div className="text-center space-y-4">
              <XCircle className="h-12 w-12 text-red-500 mx-auto" />
              <p className="text-sm text-gray-600">
                CLI access has been denied. The authentication request has been cancelled.
              </p>
            </div>
          )}

          {status === 'error' && (
            <div className="text-center space-y-4">
              <XCircle className="h-12 w-12 text-red-500 mx-auto" />
              <p className="text-sm text-gray-600">
                An error occurred while processing your request. Please try again.
              </p>
              <Button onClick={() => setStatus('pending')} variant="outline">
                Try Again
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function CLIVerifyPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-gray-400" />
          </CardContent>
        </Card>
      </div>
    }>
      <CLIVerifyContent />
    </Suspense>
  );
}
