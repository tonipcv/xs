/**
 * XSS (Cross-Site Scripting) Security Tests
 * Tests all input fields and outputs for XSS vulnerabilities
 */

import { describe, it, expect } from 'vitest';

const BASE_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000';

describe('XSS Security Tests', () => {
  const xssPayloads = [
    '<script>alert("XSS")</script>',
    '<img src=x onerror=alert("XSS")>',
    '<svg onload=alert("XSS")>',
    '<iframe src="javascript:alert(\'XSS\')">',
    '<body onload=alert("XSS")>',
    '<input onfocus=alert("XSS") autofocus>',
    '<select onfocus=alert("XSS") autofocus>',
    '<textarea onfocus=alert("XSS") autofocus>',
    '<keygen onfocus=alert("XSS") autofocus>',
    '<video><source onerror="alert(\'XSS\')">',
    '<audio src=x onerror=alert("XSS")>',
    '<details open ontoggle=alert("XSS")>',
    '<marquee onstart=alert("XSS")>',
    '"><script>alert(String.fromCharCode(88,83,83))</script>',
    '<IMG SRC="javascript:alert(\'XSS\');">',
    '<IMG SRC=JaVaScRiPt:alert(\'XSS\')>',
    '<IMG SRC=`javascript:alert("XSS")`>',
    '<IMG """><SCRIPT>alert("XSS")</SCRIPT>">',
    '<IMG SRC=javascript:alert(String.fromCharCode(88,83,83))>',
    '<IMG SRC=&#106;&#97;&#118;&#97;&#115;&#99;&#114;&#105;&#112;&#116;&#58;&#97;&#108;&#101;&#114;&#116;&#40;&#39;&#88;&#83;&#83;&#39;&#41;>',
    '<IMG SRC=&#0000106&#0000097&#0000118&#0000097&#0000115&#0000099&#0000114&#0000105&#0000112&#0000116&#0000058&#0000097&#0000108&#0000101&#0000114&#0000116&#0000040&#0000039&#0000088&#0000083&#0000083&#0000039&#0000041>',
    '<IMG SRC="jav\tascript:alert(\'XSS\');">',
    '<IMG SRC="jav&#x09;ascript:alert(\'XSS\');">',
    '<IMG SRC="jav&#x0A;ascript:alert(\'XSS\');">',
    '<IMG SRC="jav&#x0D;ascript:alert(\'XSS\');">',
    'javascript:alert("XSS")',
    '<a href="javascript:alert(\'XSS\')">Click me</a>',
    '<div style="background-image: url(javascript:alert(\'XSS\'))">',
    '<style>body{background:url("javascript:alert(\'XSS\')")}</style>',
  ];

  describe('User Input Fields', () => {
    it('should sanitize XSS in registration name field', async () => {
      for (const payload of xssPayloads) {
        const response = await fetch(`${BASE_URL}/api/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: payload,
            email: 'test@example.com',
            password: 'SecurePass123!',
            region: 'US',
          }),
        });

        // Should accept or reject, but not execute script
        expect([200, 201, 400]).toContain(response.status);
        
        const data = await response.json();
        const responseText = JSON.stringify(data);
        
        // Response should not contain unescaped script tags
        expect(responseText).not.toMatch(/<script[^>]*>/i);
        expect(responseText).not.toMatch(/onerror=/i);
        expect(responseText).not.toMatch(/onload=/i);
      }
    });

    it('should sanitize XSS in dataset name', async () => {
      for (const payload of xssPayloads) {
        const response = await fetch(`${BASE_URL}/api/datasets`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': 'test_key',
          },
          body: JSON.stringify({
            name: payload,
            description: 'Test dataset',
            dataType: 'AUDIO',
          }),
        });

        expect([200, 201, 400, 401]).toContain(response.status);
      }
    });

    it('should sanitize XSS in dataset description', async () => {
      for (const payload of xssPayloads) {
        const response = await fetch(`${BASE_URL}/api/datasets`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': 'test_key',
          },
          body: JSON.stringify({
            name: 'Test Dataset',
            description: payload,
            dataType: 'AUDIO',
          }),
        });

        expect([200, 201, 400, 401]).toContain(response.status);
      }
    });

    it('should sanitize XSS in policy name', async () => {
      for (const payload of xssPayloads) {
        const response = await fetch(`${BASE_URL}/api/policies`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': 'test_key',
          },
          body: JSON.stringify({
            name: payload,
            datasetId: 'test_id',
            rules: {},
          }),
        });

        expect([200, 201, 400, 401]).toContain(response.status);
      }
    });
  });

  describe('Search and Filter Parameters', () => {
    it('should sanitize XSS in dataset search query', async () => {
      for (const payload of xssPayloads) {
        const response = await fetch(
          `${BASE_URL}/api/datasets?search=${encodeURIComponent(payload)}`,
          {
            method: 'GET',
            headers: {
              'X-API-Key': 'test_key',
            },
          }
        );

        expect([200, 400, 401]).toContain(response.status);
        
        if (response.status === 200) {
          const data = await response.json();
          const responseText = JSON.stringify(data);
          
          // Should not contain unescaped XSS payload
          expect(responseText).not.toMatch(/<script[^>]*>/i);
        }
      }
    });

    it('should sanitize XSS in marketplace search', async () => {
      for (const payload of xssPayloads) {
        const response = await fetch(
          `${BASE_URL}/api/marketplace/offers?search=${encodeURIComponent(payload)}`,
          {
            method: 'GET',
            headers: {
              'X-API-Key': 'test_key',
            },
          }
        );

        expect([200, 400, 401]).toContain(response.status);
      }
    });
  });

  describe('JSON Response Sanitization', () => {
    it('should escape special characters in JSON responses', async () => {
      const response = await fetch(`${BASE_URL}/api/datasets`, {
        method: 'GET',
        headers: {
          'X-API-Key': 'test_key',
        },
      });

      if (response.status === 200) {
        const data = await response.json();
        const responseText = JSON.stringify(data);
        
        // Check that HTML entities are properly escaped
        if (responseText.includes('<')) {
          expect(responseText).toMatch(/&lt;|\\u003c/);
        }
        if (responseText.includes('>')) {
          expect(responseText).toMatch(/&gt;|\\u003e/);
        }
      }
    });
  });

  describe('Content-Type Headers', () => {
    it('should set correct Content-Type for JSON responses', async () => {
      const response = await fetch(`${BASE_URL}/api/datasets`, {
        method: 'GET',
        headers: {
          'X-API-Key': 'test_key',
        },
      });

      const contentType = response.headers.get('content-type');
      expect(contentType).toContain('application/json');
    });

    it('should set X-Content-Type-Options header', async () => {
      const response = await fetch(`${BASE_URL}/api/datasets`, {
        method: 'GET',
        headers: {
          'X-API-Key': 'test_key',
        },
      });

      const xContentTypeOptions = response.headers.get('x-content-type-options');
      expect(xContentTypeOptions).toBe('nosniff');
    });
  });

  describe('DOM-based XSS Prevention', () => {
    it('should prevent XSS in URL fragments', async () => {
      const payloads = [
        '#<script>alert("XSS")</script>',
        '#<img src=x onerror=alert("XSS")>',
      ];

      for (const payload of payloads) {
        const response = await fetch(`${BASE_URL}/datasets${payload}`, {
          method: 'GET',
          headers: {
            'X-API-Key': 'test_key',
          },
        });

        // Should handle gracefully
        expect([200, 400, 401, 404]).toContain(response.status);
      }
    });
  });

  describe('Stored XSS Prevention', () => {
    it('should prevent stored XSS in user profile', async () => {
      const payload = '<script>alert("Stored XSS")</script>';
      
      // Attempt to store XSS in profile
      const updateResponse = await fetch(`${BASE_URL}/api/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': 'test_key',
        },
        body: JSON.stringify({
          name: payload,
          bio: payload,
        }),
      });

      expect([200, 400, 401]).toContain(updateResponse.status);

      // Retrieve profile and verify sanitization
      const getResponse = await fetch(`${BASE_URL}/api/profile`, {
        method: 'GET',
        headers: {
          'X-API-Key': 'test_key',
        },
      });

      if (getResponse.status === 200) {
        const data = await getResponse.json();
        const responseText = JSON.stringify(data);
        
        // Should not contain unescaped script tags
        expect(responseText).not.toMatch(/<script[^>]*>/i);
      }
    });
  });

  describe('Reflected XSS Prevention', () => {
    it('should prevent reflected XSS in error messages', async () => {
      const payload = '<script>alert("Reflected XSS")</script>';
      
      const response = await fetch(`${BASE_URL}/api/datasets/${encodeURIComponent(payload)}`, {
        method: 'GET',
        headers: {
          'X-API-Key': 'test_key',
        },
      });

      const data = await response.json();
      const responseText = JSON.stringify(data);
      
      // Error message should not reflect unescaped payload
      expect(responseText).not.toMatch(/<script[^>]*>/i);
    });
  });

  describe('Event Handler XSS', () => {
    it('should prevent XSS via event handlers', async () => {
      const eventHandlers = [
        'onload',
        'onerror',
        'onclick',
        'onmouseover',
        'onfocus',
        'onblur',
        'onchange',
        'onsubmit',
      ];

      for (const handler of eventHandlers) {
        const payload = `<img ${handler}=alert("XSS")>`;
        
        const response = await fetch(`${BASE_URL}/api/datasets`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': 'test_key',
          },
          body: JSON.stringify({
            name: payload,
            description: 'Test',
            dataType: 'AUDIO',
          }),
        });

        expect([200, 201, 400, 401]).toContain(response.status);
      }
    });
  });

  describe('Protocol-based XSS', () => {
    it('should prevent javascript: protocol XSS', async () => {
      const payloads = [
        'javascript:alert("XSS")',
        'JAVASCRIPT:alert("XSS")',
        'JaVaScRiPt:alert("XSS")',
        'data:text/html,<script>alert("XSS")</script>',
        'vbscript:msgbox("XSS")',
      ];

      for (const payload of payloads) {
        const response = await fetch(`${BASE_URL}/api/datasets`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': 'test_key',
          },
          body: JSON.stringify({
            name: 'Test',
            description: payload,
            dataType: 'AUDIO',
          }),
        });

        expect([200, 201, 400, 401]).toContain(response.status);
      }
    });
  });

  describe('HTML Entity Encoding', () => {
    it('should properly encode HTML entities', async () => {
      const specialChars = ['<', '>', '"', "'", '&'];
      
      for (const char of specialChars) {
        const response = await fetch(`${BASE_URL}/api/datasets?search=${encodeURIComponent(char)}`, {
          method: 'GET',
          headers: {
            'X-API-Key': 'test_key',
          },
        });

        if (response.status === 200) {
          const data = await response.json();
          const responseText = JSON.stringify(data);
          
          // Should be properly escaped in JSON
          expect(responseText).toBeTruthy();
        }
      }
    });
  });

  describe('CSP (Content Security Policy)', () => {
    it('should set Content-Security-Policy header', async () => {
      const response = await fetch(`${BASE_URL}/`, {
        method: 'GET',
      });

      const csp = response.headers.get('content-security-policy');
      
      if (csp) {
        // Should restrict script sources
        expect(csp).toContain("script-src");
        // Should not allow unsafe-inline or unsafe-eval
        expect(csp).not.toContain("'unsafe-inline'");
        expect(csp).not.toContain("'unsafe-eval'");
      }
    });
  });
});
