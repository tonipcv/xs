'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle2, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Playfair_Display } from 'next/font/google';

const heading = Playfair_Display({ subsets: ['latin'], weight: ['600', '700'] });

export default function RequestAccessPage() {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    company: '',
    role: '',
    phone: '',
    estimatedVolume: '',
    dataType: '',
    useCase: '',
    message: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch('/api/leads/request-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        setSubmitted(true);
      } else {
        alert('Failed to submit request. Please try again.');
      }
    } catch (error) {
      console.error('Error submitting form:', error);
      alert('Failed to submit request. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-2xl w-full border border-gray-200 shadow-sm">
          <CardHeader className="text-center pb-8">
            <div className="flex justify-center mb-4">
              <CheckCircle2 className="h-16 w-16 text-green-600" />
            </div>
            <CardTitle className={`${heading.className} text-3xl font-semibold text-gray-900`}>
              Request Submitted Successfully
            </CardTitle>
            <CardDescription className="text-base mt-2">
              Thank you for your interest in Xase. Our team will review your request and contact you within 24-48 hours.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="font-semibold text-sm text-blue-900 mb-2">What happens next?</h3>
              <ul className="space-y-2 text-sm text-blue-800">
                <li className="flex items-start gap-2">
                  <span className="font-semibold">1.</span>
                  <span>Our sales team will review your requirements</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-semibold">2.</span>
                  <span>We'll schedule a demo tailored to your use case</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-semibold">3.</span>
                  <span>Receive a custom pricing proposal based on your volume</span>
                </li>
              </ul>
            </div>

            <div className="flex gap-3 pt-4">
              <Link href="/pricing" className="flex-1">
                <Button variant="outline" className="w-full border border-gray-300 text-gray-900 hover:bg-gray-50">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Pricing
                </Button>
              </Link>
              <Link href="/app/marketplace" className="flex-1">
                <Button className="w-full bg-black text-white hover:bg-neutral-800">
                  Browse Marketplace
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <Link href="/pricing" className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Pricing
          </Link>
          <h1 className={`${heading.className} text-4xl font-semibold text-gray-900 mb-2`}>
            Request Access
          </h1>
          <p className="text-gray-900">
            Fill out the form below and our team will contact you to discuss your requirements and provide a custom proposal.
          </p>
        </div>

        <Card className="border border-gray-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-gray-900">Contact Information</CardTitle>
            <CardDescription className="text-gray-900">Tell us about yourself and your organization</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Personal Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name *</Label>
                  <Input
                    id="name"
                    required
                    value={formData.name}
                    onChange={(e) => handleChange('name', e.target.value)}
                    placeholder="Dr. João Silva"
                    className="bg-white border-gray-300"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => handleChange('email', e.target.value)}
                    placeholder="joao.silva@hospital.com"
                    className="bg-white border-gray-300"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="company">Hospital/Organization *</Label>
                  <Input
                    id="company"
                    required
                    value={formData.company}
                    onChange={(e) => handleChange('company', e.target.value)}
                    placeholder="Hospital São Lucas"
                    className="bg-white border-gray-300"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="role">Role *</Label>
                  <Select value={formData.role} onValueChange={(value) => handleChange('role', value)}>
                    <SelectTrigger className="bg-white border-gray-300">
                      <SelectValue placeholder="Select your role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cio">CIO / IT Director</SelectItem>
                      <SelectItem value="cto">CTO / Technology Lead</SelectItem>
                      <SelectItem value="data_officer">Chief Data Officer</SelectItem>
                      <SelectItem value="compliance">Compliance Officer</SelectItem>
                      <SelectItem value="researcher">Researcher / Data Scientist</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Phone (optional)</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => handleChange('phone', e.target.value)}
                  placeholder="+55 11 98765-4321"
                  className="bg-white border-gray-300"
                />
              </div>

              {/* Requirements */}
              <div className="border-t border-gray-200 pt-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Your Requirements</h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div className="space-y-2">
                    <Label htmlFor="dataType">Primary Data Type *</Label>
                    <Select value={formData.dataType} onValueChange={(value) => handleChange('dataType', value)}>
                      <SelectTrigger className="bg-white border-gray-300">
                        <SelectValue placeholder="Select data type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="dicom">DICOM (Medical Imaging)</SelectItem>
                        <SelectItem value="fhir">FHIR (Electronic Health Records)</SelectItem>
                        <SelectItem value="audio">Audio (Voice/Consultations)</SelectItem>
                        <SelectItem value="text">Text (Clinical Notes)</SelectItem>
                        <SelectItem value="mixed">Mixed / Multiple Types</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="estimatedVolume">Estimated Monthly Volume *</Label>
                    <Select value={formData.estimatedVolume} onValueChange={(value) => handleChange('estimatedVolume', value)}>
                      <SelectTrigger className="bg-white border-gray-300">
                        <SelectValue placeholder="Select volume" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="small">&lt;100k records/month</SelectItem>
                        <SelectItem value="medium">100k - 1M records/month</SelectItem>
                        <SelectItem value="large">1M - 10M records/month</SelectItem>
                        <SelectItem value="enterprise">&gt;10M records/month</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2 mb-4">
                  <Label htmlFor="useCase">Primary Use Case *</Label>
                  <Select value={formData.useCase} onValueChange={(value) => handleChange('useCase', value)}>
                    <SelectTrigger className="bg-white border-gray-300">
                      <SelectValue placeholder="Select use case" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ai_training">AI Model Training</SelectItem>
                      <SelectItem value="research">Clinical Research</SelectItem>
                      <SelectItem value="compliance">Compliance & Governance</SelectItem>
                      <SelectItem value="data_sharing">Secure Data Sharing</SelectItem>
                      <SelectItem value="analytics">Data Analytics</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="message">Additional Information (optional)</Label>
                  <Textarea
                    id="message"
                    value={formData.message}
                    onChange={(e) => handleChange('message', e.target.value)}
                    placeholder="Tell us more about your requirements, timeline, or any specific questions..."
                    rows={4}
                    className="bg-white border-gray-300"
                  />
                </div>
              </div>

              {/* Submit */}
              <div className="flex gap-3 pt-4">
                <Link href="/pricing" className="flex-1">
                  <Button type="button" variant="outline" className="w-full border border-gray-300 text-gray-900 hover:bg-gray-50">
                    Cancel
                  </Button>
                </Link>
                <Button
                  type="submit"
                  disabled={loading || !formData.name || !formData.email || !formData.company || !formData.dataType || !formData.estimatedVolume || !formData.useCase}
                  className="flex-1 bg-black text-white hover:bg-neutral-800 disabled:opacity-50"
                >
                  {loading ? 'Submitting...' : 'Submit Request'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Trust Indicators */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-gray-900 mb-1">24-48h</div>
            <div className="text-sm text-gray-900">Response Time</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-gray-900 mb-1">99.7%</div>
            <div className="text-sm text-gray-900">Audit Pass Rate</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-gray-900 mb-1">SOC 2</div>
            <div className="text-sm text-gray-900">Type II Certified</div>
          </div>
        </div>
      </div>
    </div>
  );
}
