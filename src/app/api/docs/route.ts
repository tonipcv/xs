/**
 * API Documentation Endpoint
 * Serves OpenAPI/Swagger documentation
 */

import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

export async function GET() {
  try {
    const openApiPath = path.join(process.cwd(), 'openapi-spec.yaml');
    const fileContents = fs.readFileSync(openApiPath, 'utf8');
    const openApiSpec = yaml.load(fileContents);

    return NextResponse.json(openApiSpec, {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    console.error('Error loading OpenAPI spec:', error);
    return NextResponse.json(
      { error: 'Failed to load API documentation' },
      { status: 500 }
    );
  }
}
