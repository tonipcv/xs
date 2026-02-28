'use client';

/**
 * API Documentation Page
 * Interactive Swagger UI for XASE API
 */

export default function ApiDocsPage() {

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto py-8 px-4">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">XASE API Documentation</h1>
          <p className="text-lg text-gray-600">
            Complete API reference for XASE platform
          </p>
        </div>
        
        <div className="bg-white rounded-lg shadow-lg p-6">
          <div id="swagger-ui">
            <iframe
              src="https://petstore.swagger.io/?url=/api/docs"
              style={{ width: '100%', height: '800px', border: 'none' }}
              title="API Documentation"
            />
          </div>
        </div>
        
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h2 className="text-xl font-semibold text-blue-900 mb-4">Quick Start</h2>
          <div className="space-y-4 text-sm text-blue-800">
            <div>
              <h3 className="font-semibold mb-2">1. Get your API Key</h3>
              <p>Navigate to Settings → API Keys and generate a new key</p>
            </div>
            <div>
              <h3 className="font-semibold mb-2">2. Make your first request</h3>
              <pre className="bg-blue-100 p-3 rounded mt-2 overflow-x-auto">
{`curl -X GET https://xase.ai/api/v1/datasets \\
  -H "X-API-Key: your_api_key_here"`}
              </pre>
            </div>
            <div>
              <h3 className="font-semibold mb-2">3. Explore the SDKs</h3>
              <p>
                Install our official SDKs:
                <br />
                <code className="bg-blue-100 px-2 py-1 rounded">npm install @xase/sdk</code>
                <br />
                <code className="bg-blue-100 px-2 py-1 rounded">pip install xase-sdk</code>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
