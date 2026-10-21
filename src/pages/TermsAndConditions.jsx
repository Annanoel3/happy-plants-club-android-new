import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

// A fixed date: change it whenever these terms change (it used to show today's date).
const LAST_UPDATED = "October 20, 2026";
const EMAIL = "mediocreatbestdev@outlook.com";

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
            <p className="theme-text-secondary mb-6">Last updated: {LAST_UPDATED}</p>

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
                  <li>Sharing your garden with a link</li>
                  <li>A Community feed for plant lovers, if available</li>
                  <li>Happy Plants Plus, an optional paid subscription (see section 3)</li>
                </ul>
              </section>

              <section>
                <h2 className="text-xl font-semibold mb-3">3. Happy Plants Plus</h2>
                <p className="mb-3">
                  Happy Plants Plus is an optional subscription. It removes ads and adds extra features and higher daily limits. The Plus page in the app shows what's included. Everything else in Happy Plants stays free.
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Prices are shown in the app before you buy.</li>
                  <li>You pay through Google Play, and Google Play handles the billing.</li>
                  <li>Your subscription renews automatically each month or year until you cancel.</li>
                  <li>You can cancel any time in Google Play (Payments &amp; subscriptions → Subscriptions). Cancelling stops future renewals. You keep Plus until the end of the period you've already paid for.</li>
                  <li>Refunds are handled by Google Play under its refund policy.</li>
                  <li>We may change the price. If we do, you'll be told ahead of time, as Google Play requires, and you can cancel before the new price starts.</li>
                </ul>
              </section>

              <section>
                <h2 className="text-xl font-semibold mb-3">4. User Accounts</h2>
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
                <h2 className="text-xl font-semibold mb-3">5. User Content</h2>
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
                <h2 className="text-xl font-semibold mb-3">6. AI-Generated Content</h2>
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
                <h2 className="text-xl font-semibold mb-3">7. Privacy and Data</h2>
                <p className="mb-3">
                  Your use of Happy Plants is also governed by our Privacy Policy. By using our service, you consent to our collection and use of personal data as outlined in the Privacy Policy.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold mb-3">8. Community</h2>
                <p className="mb-3">
                  When the Community is available, you can post, comment on posts, and follow other users. When you use it, you agree to:
                </p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Respect other users and their privacy</li>
                  <li>Use these features in a friendly and constructive manner</li>
                  <li>Not harass, bully, or threaten other users</li>
                  <li>Report inappropriate behavior to us</li>
                </ul>
              </section>

              <section>
                <h2 className="text-xl font-semibold mb-3">9. Prohibited Activities</h2>
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
                <h2 className="text-xl font-semibold mb-3">10. Intellectual Property</h2>
                <p className="mb-3">
                  Happy Plants and its original content, features, and functionality are owned by Mediocre at Best Dev, the maker of Happy Plants, and are protected by international copyright, trademark, and other intellectual property laws.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold mb-3">11. Gamification Features</h2>
                <p className="mb-3">
                  Happy Plants includes gamification elements such as tiers, achievements, and plant growth stages. These are for entertainment purposes only and hold no real-world value. We reserve the right to modify or remove these features at any time.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold mb-3">12. Disclaimer of Warranties</h2>
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
                <h2 className="text-xl font-semibold mb-3">13. Limitation of Liability</h2>
                <p className="mb-3">
                  To the maximum extent permitted by law, Happy Plants shall not be liable for any indirect, incidental, special, consequential, or punitive damages resulting from your use of or inability to use the service.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold mb-3">14. Content Moderation</h2>
                <p className="mb-3">
                  We reserve the right to review, moderate, or remove any user content that violates these terms or is otherwise objectionable. We may also suspend or terminate accounts that repeatedly violate our terms.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold mb-3">15. Third-Party Services</h2>
                <p className="mb-3">
                  Happy Plants may contain links to third-party websites or services. We are not responsible for the content, privacy policies, or practices of any third-party sites.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold mb-3">16. Changes to Terms</h2>
                <p className="mb-3">
                  We reserve the right to modify these terms at any time. We will notify users of any material changes by updating the "Last updated" date. Your continued use of the service after changes constitutes acceptance of the new terms.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold mb-3">17. Termination</h2>
                <p className="mb-3">
                  We may suspend or close your account if you break these Terms (for example, by abusing other people in the Community or misusing the service). Where we reasonably can, we'll tell you why. If your account is closed, your right to use the service ends. A Plus subscription is billed by Google Play, so cancel it there; refunds follow Google Play's refund policy.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold mb-3">18. Governing Law</h2>
                <p className="mb-3">
                  These Terms are governed by the laws of the State of Texas, USA, without regard to conflict of law rules, except where the law where you live gives you rights that can't be waived.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold mb-3">19. Contact Us</h2>
                <p className="mb-3">
                  If you have any questions about these Terms and Conditions, use Send Feedback in Settings or email{" "}
                  <a href={`mailto:${EMAIL}`} className="underline hover:opacity-80">{EMAIL}</a>.
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