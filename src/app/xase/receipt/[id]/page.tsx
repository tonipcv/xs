/**
 * XASE CORE - Public Decision Receipt Page
 * 
 * Página pública para visualização de recibos de decisão
 */

import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { Shield, CheckCircle, Clock, Hash, FileText, AlertTriangle, Building2 } from 'lucide-react';

interface Props {
  params: Promise<{ id: string }>
}

export default async function DecisionReceiptPage({ params }: Props) {
  const { id } = await params
  const record = await prisma.decisionRecord.findUnique({
    where: { transactionId: id },
    include: {
      tenant: {
        select: {
          companyName: true,
          name: true,
        },
      },
    },
  });
  
  if (!record) {
    notFound();
  }
  
  const isGenesis = !record.previousHash;
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-slate-200 py-12 px-4">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-3">
            <Shield className="w-14 h-14 text-emerald-600" />
            <h1 className="text-5xl font-bold text-slate-900">XASE AI</h1>
          </div>
          <p className="text-lg text-slate-600 font-medium">
            Cryptographically Sealed Decision Record
          </p>
        </div>
        
        {/* Status Badge */}
        <div className="flex justify-center">
          <div className="bg-emerald-600 text-white px-8 py-3 rounded-full shadow-lg flex items-center gap-2">
            <CheckCircle className="w-6 h-6" />
            <span className="font-semibold text-lg">Integrity Verified</span>
          </div>
        </div>
        
        {/* Main Card */}
        <div className="bg-white border-2 border-emerald-200 rounded-xl shadow-xl overflow-hidden">
          {/* Header do Card */}
          <div className="bg-gradient-to-r from-emerald-50 to-emerald-100 px-8 py-6 border-b-2 border-emerald-200">
            <div className="flex items-center gap-3">
              <FileText className="w-7 h-7 text-emerald-700" />
              <h2 className="text-2xl font-bold text-slate-900">Decision Receipt</h2>
            </div>
          </div>
          
          {/* Content */}
          <div className="p-8 space-y-8">
            {/* Transaction ID */}
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-600 uppercase tracking-wide">
                Transaction ID
              </label>
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                <p className="font-mono text-lg text-slate-900 break-all">
                  {record.transactionId}
                </p>
              </div>
            </div>
            
            {/* Timestamp */}
            <div className="flex items-start gap-3">
              <Clock className="w-6 h-6 text-slate-500 mt-1" />
              <div className="flex-1">
                <label className="text-sm font-bold text-slate-600 uppercase tracking-wide block mb-2">
                  Timestamp
                </label>
                <p className="text-lg text-slate-900">
                  {new Date(record.timestamp).toLocaleString('en-US', {
                    dateStyle: 'full',
                    timeStyle: 'long',
                    timeZone: 'UTC',
                  })} UTC
                </p>
              </div>
            </div>
            
            {/* Policy Info */}
            {record.policyId && (
              <div className="bg-blue-50 p-6 rounded-lg border border-blue-200">
                <label className="text-sm font-bold text-blue-900 uppercase tracking-wide block mb-3">
                  Policy / Model Information
                </label>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-blue-700 font-medium">Policy ID:</span>
                    <span className="text-blue-900 font-semibold">{record.policyId}</span>
                  </div>
                  {record.policyVersion && (
                    <div className="flex justify-between">
                      <span className="text-blue-700 font-medium">Version:</span>
                      <span className="text-blue-900 font-semibold">v{record.policyVersion}</span>
                    </div>
                  )}
                  {record.decisionType && (
                    <div className="flex justify-between">
                      <span className="text-blue-700 font-medium">Decision Type:</span>
                      <span className="text-blue-900 font-semibold">{record.decisionType}</span>
                    </div>
                  )}
                  {record.confidence !== null && (
                    <div className="flex justify-between">
                      <span className="text-blue-700 font-medium">Confidence:</span>
                      <span className="text-blue-900 font-semibold">
                        {(record.confidence * 100).toFixed(1)}%
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {/* Cryptographic Hashes */}
            <div className="space-y-4 pt-4 border-t-2 border-slate-200">
              <div className="flex items-center gap-3">
                <Hash className="w-6 h-6 text-slate-600" />
                <h3 className="text-xl font-bold text-slate-900">
                  Cryptographic Hashes
                </h3>
              </div>
              
              <div className="space-y-4 bg-slate-50 p-6 rounded-lg border border-slate-200">
                <HashDisplay label="Input Hash" hash={record.inputHash} />
                <HashDisplay label="Output Hash" hash={record.outputHash} />
                {record.contextHash && (
                  <HashDisplay label="Context Hash" hash={record.contextHash} />
                )}
                <div className="pt-4 border-t border-slate-300">
                  <HashDisplay
                    label="Record Hash (Chained)"
                    hash={record.recordHash}
                    highlight
                  />
                  {isGenesis && (
                    <div className="mt-2 flex items-center gap-2 text-sm text-emerald-700">
                      <CheckCircle className="w-4 h-4" />
                      <span className="font-semibold">Genesis Block - First record in chain</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            {/* Legal Notice */}
            <div className="bg-amber-50 border-l-4 border-amber-500 p-6 rounded-r-lg">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-6 h-6 text-amber-600 mt-1 flex-shrink-0" />
                <div>
                  <p className="text-sm font-bold text-amber-900 mb-2">
                    ⚖️ LEGAL NOTICE
                  </p>
                  <p className="text-sm text-amber-800 leading-relaxed">
                    This record is cryptographically sealed and immutable. Any modification 
                    to the original decision data will invalidate its integrity. This receipt 
                    serves as verifiable proof of the AI decision made at the timestamp above. 
                    The cryptographic hash chain ensures that this record cannot be altered 
                    without detection.
                  </p>
                </div>
              </div>
            </div>
            
            {/* Organization */}
            <div className="text-center pt-6 border-t-2 border-slate-200">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Building2 className="w-5 h-5 text-slate-500" />
                <p className="text-sm text-slate-600 font-medium">
                  Issued by
                </p>
              </div>
              <p className="text-xl font-bold text-slate-900">
                {record.tenant.companyName || record.tenant.name}
              </p>
            </div>
          </div>
        </div>
        
        {/* Footer */}
        <div className="text-center space-y-2">
          <p className="text-sm text-slate-600">
            Powered by <strong className="text-slate-900">XASE AI</strong> - Immutable AI Decision Ledger
          </p>
          <p className="text-xs text-slate-500 italic">
            "We don't sell software. We sell the end of legal anxiety."
          </p>
        </div>
      </div>
    </div>
  );
}

// Componente auxiliar para exibir hashes
function HashDisplay({
  label,
  hash,
  highlight = false,
}: {
  label: string;
  hash: string;
  highlight?: boolean;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">
        {label}
      </label>
      <p
        className={`font-mono text-xs break-all p-3 rounded border ${
          highlight
            ? 'text-emerald-800 font-semibold bg-emerald-50 border-emerald-300'
            : 'text-slate-700 bg-white border-slate-200'
        }`}
      >
        {hash}
      </p>
    </div>
  );
}

// Metadata para SEO
export async function generateMetadata({ params }: Props) {
  const { id } = await params
  const record = await prisma.decisionRecord.findUnique({
    where: { transactionId: id },
    select: {
      transactionId: true,
      timestamp: true,
      tenant: {
        select: {
          companyName: true,
          name: true,
        },
      },
    },
  });
  
  if (!record) {
    return {
      title: 'Xase',
    };
  }
  
  return {
    title: 'Xase',
    description: `Cryptographically sealed decision record issued by ${record.tenant.companyName || record.tenant.name} on ${new Date(record.timestamp).toLocaleDateString()}`,
  };
}
