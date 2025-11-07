import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function TermsAndConditions() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen theme-bg p-6">
      <div className="max-w-4xl mx-auto">
        <button onClick={() => navigate(-1)} className="mb-6 flex items-center gap-2 theme-text hover:opacity-70">
          <ArrowLeft className="w-5 h-5" />
          Back
        </button>

        <Card className="theme-card">
          <CardContent className="p-8">
            <h1 className="text-3xl font-bold theme-text mb-2">Terms and Conditions</h1>
            <p className="theme-text-secondary mb-6">Last updated: {new Date().toLocaleDateString()}</p>

            <div className="space-y-6 theme-text">
              <section>
                <h2 className="text-xl font-semibold mb-3">1. Acceptance of Terms</h2>
                <p className="mb-3">
                  By accessing and using Happy Plants, you accept and agree to be bound by the terms and provision of this agreement. If you do not agree to these Terms and Conditions, please do not use our service.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold mb-3">2. Description of Service</h2>
                <p className="mb-3">
                  Happy Plants is a plant care management application that helps users track, care for, and share their plant collections. Our service includes:
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Plant identification and care tracking</li>
                  <li>Watering schedules and reminders</li>
                  <li>AI-powered plant care advice</li>
                  <li>Social features for connecting with other plant enthusiasts</li>
                  <li>Community feed and messaging</li>
                </ul>
              </section>

              <section>
                <h2 className="text-xl font-semibold mb-3">3. User Accounts</h2>
                <p className="mb-3">
                  To use certain features of Happy Plants, you must create an account. You agree to:
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Provide accurate and complete information</li>
                  <li>Maintain the security of your account credentials</li>
                  <li>Notify us immediately of any unauthorized access</li>
                  <li>Be responsible for all activities under your account</li>
                </ul>
              </section>

              <section>
                <h2 className="text-xl font-semibold mb-3">4. User Content</h2>
                <p className="mb-3">
                  Users may post content including photos, comments, and plant information. By posting content, you grant Happy Plants a worldwide, non-exclusive, royalty-free license to use, display, and distribute your content within the service.
                </p>
                <p className="mb-3">You agree not to post content that:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Is illegal, harmful, or offensive</li>
                  <li>Violates intellectual property rights</li>
                  <li>Contains personal information of others without consent</li>
                  <li>Spreads misinformation about plant care that could harm plants or people</li>
                  <li>Is spam or unsolicited advertising</li>
                </ul>
              </section>

              <section>
                <h2 className="text-xl font-semibold mb-3">5. AI-Generated Content</h2>
                <p className="mb-3">
                  Happy Plants uses AI to provide plant care advice and information. While we strive for accuracy:
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>AI-generated advice is for informational purposes only</li>
                  <li>We do not guarantee the accuracy or completeness of AI recommendations</li>
                  <li>Users should verify critical information with professional sources</li>
                  <li>We are not liable for any harm resulting from following AI advice</li>
                </ul>
              </section>

              <section>
                <h2 className="text-xl font-semibold mb-3">6. Privacy and Data</h2>
                <p className="mb-3">
                  Your use of Happy Plants is also governed by our Privacy Policy. By using our service, you consent to our collection and use of personal data as outlined in the Privacy Policy.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold mb-3">7. Social Features</h2>
                <p className="mb-3">
                  Happy Plants includes social features such as following users, commenting, and direct messaging. You agree to:
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Respect other users and their privacy</li>
                  <li>Use these features in a friendly and constructive manner</li>
                  <li>Not harass, bully, or threaten other users</li>
                  <li>Report inappropriate behavior to us</li>
                </ul>
              </section>

              <section>
                <h2 className="text-xl font-semibold mb-3">8. Prohibited Activities</h2>
                <p className="mb-3">You may not:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Attempt to gain unauthorized access to our systems</li>
                  <li>Use automated systems (bots) without permission</li>
                  <li>Interfere with or disrupt the service</li>
                  <li>Reverse engineer or copy any part of the service</li>
                  <li>Use the service for any illegal purpose</li>
                  <li>Impersonate others or create fake accounts</li>
                </ul>
              </section>

              <section>
                <h2 className="text-xl font-semibold mb-3">9. Intellectual Property</h2>
                <p className="mb-3">
                  Happy Plants and its original content, features, and functionality are owned by Happy Plants and are protected by international copyright, trademark, and other intellectual property laws.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold mb-3">10. Gamification Features</h2>
                <p className="mb-3">
                  Happy Plants includes gamification elements such as tiers, achievements, and plant growth stages. These are for entertainment purposes only and hold no real-world value. We reserve the right to modify or remove these features at any time.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold mb-3">11. Disclaimer of Warranties</h2>
                <p className="mb-3">
                  Happy Plants is provided "as is" and "as available" without any warranties of any kind, either express or implied. We do not warrant that:
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>The service will be uninterrupted or error-free</li>
                  <li>The results obtained from using the service will be accurate or reliable</li>
                  <li>Plant care advice will guarantee plant health</li>
                </ul>
              </section>

              <section>
                <h2 className="text-xl font-semibold mb-3">12. Limitation of Liability</h2>
                <p className="mb-3">
                  To the maximum extent permitted by law, Happy Plants shall not be liable for any indirect, incidental, special, consequential, or punitive damages resulting from your use of or inability to use the service.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold mb-3">13. Content Moderation</h2>
                <p className="mb-3">
                  We reserve the right to review, moderate, or remove any user content that violates these terms or is otherwise objectionable. We may also suspend or terminate accounts that repeatedly violate our terms.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold mb-3">14. Third-Party Services</h2>
                <p className="mb-3">
                  Happy Plants may contain links to third-party websites or services. We are not responsible for the content, privacy policies, or practices of any third-party sites.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold mb-3">15. Changes to Terms</h2>
                <p className="mb-3">
                  We reserve the right to modify these terms at any time. We will notify users of any material changes by updating the "Last updated" date. Your continued use of the service after changes constitutes acceptance of the new terms.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold mb-3">16. Termination</h2>
                <p className="mb-3">
                  We may terminate or suspend your account and access to the service immediately, without prior notice, for any reason, including breach of these Terms. Upon termination, your right to use the service will cease immediately.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold mb-3">17. Governing Law</h2>
                <p className="mb-3">
                  These Terms shall be governed by and construed in accordance with applicable laws, without regard to conflict of law provisions.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold mb-3">18. Contact Us</h2>
                <p className="mb-3">
                  If you have any questions about these Terms and Conditions, please contact us through the app's support features.
                </p>
              </section>

              <div className="mt-8 pt-6 border-t theme-border">
                <p className="text-sm theme-text-secondary">
                  By using Happy Plants, you acknowledge that you have read, understood, and agree to be bound by these Terms and Conditions.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}