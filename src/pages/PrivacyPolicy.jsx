import React from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button"; // This import is no longer strictly needed for the back button, but might be used elsewhere, so I'll keep it for now as the prompt didn't say to remove it.
import { Card, CardContent } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";

export default function PrivacyPolicy() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen theme-bg p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <button 
            onClick={() => navigate('/Settings')}
            className="p-2 rounded-full hover:bg-gray-100 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 theme-text" />
          </button>
          <h1 className="text-3xl font-bold theme-text">Privacy Policy</h1>
        </div>

        <Card className="theme-card rounded-3xl shadow-xl">
          <CardContent className="p-8 theme-text-secondary prose prose-sm max-w-none">
            <h2 className="text-xl font-bold theme-text mb-4">Happy Plants Privacy Policy</h2>
            <p className="mb-4">
              Your privacy is important to us. This policy details how we collect, use, and protect your information.
            </p>

            <h3 className="text-lg font-semibold theme-text mb-3">Information We Collect</h3>
            <ul className="list-disc ml-6 mb-4 theme-text">
              <li>Authentication Data: Email and name for account management</li>
              <li>Location Data: City/region for climate-specific advice</li>
              <li>Plant Data: Information you add about your plants</li>
              <li>Voice Recordings: Processed and immediately deleted</li>
            </ul>

            <h3 className="text-lg font-semibold theme-text mb-3">How We Use Your Information</h3>
            <ul className="list-disc ml-6 mb-4 theme-text">
              <li>To provide personalized plant care advice</li>
              <li>To manage your account</li>
              <li>To improve our services</li>
            </ul>

            <h3 className="text-lg font-semibold theme-text mb-3">Data Sharing</h3>
            <p className="mb-4 theme-text">
              We never share your data with third parties.
            </p>

            <h3 className="text-lg font-semibold theme-text mb-3">Data Security</h3>
            <p className="mb-4 theme-text">
              All data is stored securely with encryption and access controls.
            </p>

            <hr className="my-8 border-gray-300" />

            <h3 className="text-lg font-semibold theme-text mb-4">Questions?</h3>
            <p className="mb-6 theme-text">
              If you have questions about this policy, contact us at{' '}
              <a href="mailto:mediocreatbestdev@outlook.com" className="underline hover:opacity-80">
                mediocreatbestdev@outlook.com
              </a>
            </p>

            <h2 className="text-xl font-bold theme-text mb-4">© Copyright & Intellectual Property</h2>
            <p className="font-semibold theme-text mb-4">© 2026 Happy Plants. All rights reserved.</p>
            
            <p className="mb-6 theme-text">
              The Happy Plants application, including its design, code, branding, and user interface, is the intellectual property of Happy Plants and is protected by applicable copyright, trademark, and intellectual property laws.
            </p>

            <h3 className="text-lg font-semibold theme-text mb-3">Your Content</h3>
            <p className="mb-6 theme-text">
              You retain full ownership of all content you upload to Happy Plants, including photos and plant information. By using the app, you grant Happy Plants a limited, non-exclusive license to store, display, and process your content solely for the purpose of providing the service to you.
            </p>

            <h3 className="text-lg font-semibold theme-text mb-3">Restrictions</h3>
            <p className="mb-6 theme-text">
              You may not copy, reproduce, distribute, modify, or create derivative works from any part of the Happy Plants application without prior written consent. Unauthorized use of Happy Plants' proprietary materials may violate copyright, trademark, and other applicable laws.
            </p>

            <p className="theme-text">
              For licensing inquiries, contact{' '}
              <a href="mailto:mediocreatbestdev@outlook.com" className="underline hover:opacity-80">
                mediocreatbestdev@outlook.com
              </a>
              .
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}