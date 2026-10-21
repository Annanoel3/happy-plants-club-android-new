import React from "react";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";

// Rewritten Oct 20, 2026 to match what the app really does (the old one said "we never share
// your data with third parties", which wasn't true: photos go to OpenAI and Pl@ntNet, ads come
// from Google AdMob, and so on). If a new outside service is added, add it to "Who else sees it".
const EMAIL = "mediocreatbestdev@outlook.com";

function H({ children }) {
  return <h3 className="text-lg font-semibold theme-text mt-6 mb-2">{children}</h3>;
}
function L({ items }) {
  return (
    <ul className="list-disc ml-6 mb-4 theme-text space-y-1">
      {items.map((t, i) => <li key={i}>{t}</li>)}
    </ul>
  );
}

export default function PrivacyPolicy() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen theme-bg p-6 pb-24">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-full hover:bg-gray-100 transition-colors"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5 theme-text" />
          </button>
          <h1 className="text-3xl font-bold theme-text">Privacy Policy</h1>
        </div>

        <Card className="theme-card rounded-3xl shadow-xl">
          <CardContent className="p-8 theme-text-secondary prose prose-sm max-w-none">
            <h2 className="text-xl font-bold theme-text mb-1">Happy Plants Privacy Policy</h2>
            <p className="text-sm theme-text-secondary mb-4">Last updated October 20, 2026</p>
            <p className="mb-4 theme-text">
              Happy Plants Club is made by Mediocre at Best Dev. This page explains what the app collects, why, and who else
              sees it. We don't sell your information.
            </p>

            <H>What we collect</H>
            <L items={[
              "Your account: your name and email address, from however you sign in (email and password, Google or Facebook).",
              "Your profile, if you fill it in: a username, a profile photo, a short bio and your city.",
              "Your plants: their names, photos, notes, watering and care history, health checks, growth photos and reminders.",
              "Your city or area, if you add it, so we can show local weather and adjust watering. We turn it into rough map coordinates; we don't use your phone's GPS.",
              "Voice recordings, when you use a voice button. They are sent to be turned into text, and we don't keep the recording. The exception is a very long recording, which is saved to our storage so it can be turned into text.",
              "Community activity: posts, photos, comments, likes, follows, direct messages, and any reports or blocks you make.",
              "Plus subscriptions: whether you have Plus and when it renews or ends. Google Play handles the payment; we never see your card.",
              "Phone details for notifications and ads: a notification ID so we can send reminders, and, if you use the free version, the advertising ID and the other details Google's ad service collects (see below).",
              "How much of each feature you've used today, so daily limits work (for example, how many photo IDs).",
            ]} />

            <H>How we use it</H>
            <L items={[
              "To run the app: your garden, reminders, care info, weather-based watering, the games and the community.",
              "To identify plants and check their health from your photos.",
              "To send the notifications you've turned on.",
              "To show ads in the free version and to handle Plus.",
              "To keep the community safe: posts, comments and messages are checked automatically for things that break the rules, and reports are reviewed.",
              "To fix problems and keep the app working.",
            ]} />

            <H>Who else sees it</H>
            <p className="mb-2 theme-text">We use these services to make the app work. Each one only gets what it needs for its job:</p>
            <L items={[
              "Base44: hosts the app, its database and your photos, and handles signing in.",
              "OpenAI: receives plant photos and text to identify plants, write care info, answer plant questions, check plant health, turn voice into text and check community posts for harmful content.",
              "Pl@ntNet: receives plant photos to help identify them.",
              "Google AdMob (free version only): shows ads. Google's ad service collects your phone's advertising ID, IP address, which ads you see and tap, and app performance details. Plus members don't see ads.",
              "Google Play and RevenueCat: handle Plus purchases, renewals and cancellations.",
              "OneSignal: sends notifications. Your notifications are linked to your email address.",
              "MET Norway (weather) and OpenStreetMap (place names): receive the rough location of the city you entered, never your name or email.",
              "Google or Facebook: only if you choose to sign in with them.",
            ]} />
            <p className="mb-4 theme-text">
              Other people in the app can see what you share in the Community (posts, comments, your profile, the plants you
              attach). If you make your profile private, only people you approve can follow you. If you share a garden link,
              anyone with that link can see that garden.
            </p>

            <H>Your choices</H>
            <L items={[
              "Turn notifications on or off in Settings or in your phone's settings.",
              "You can limit ad tracking in your phone's settings (on Android, Settings > Privacy > Ads). Plus removes ads completely.",
              "You can delete posts and comments you made, and block or report anyone.",
              "You can delete your account any time: Settings > Delete Account. This permanently deletes your account and the information tied to it, such as your plants, logs, posts, comments and messages.",
              `If you can't get into the app, email ${EMAIL} and we'll delete your account for you.`,
            ]} />

            <H>Keeping it safe</H>
            <p className="mb-4 theme-text">
              Everything travels over encrypted connections, and your account is protected by your sign-in. No system is
              perfectly secure, but we only keep what the app needs.
            </p>

            <H>Children</H>
            <p className="mb-4 theme-text">
              Happy Plants isn't meant for children under 13, and we don't knowingly collect information from them. If you
              think a child has signed up, email us and we'll delete the account.
            </p>

            <H>Changes</H>
            <p className="mb-4 theme-text">
              If this policy changes, we'll update the date at the top of this page.
            </p>

            <hr className="my-8 border-gray-300" />

            <h3 className="text-lg font-semibold theme-text mb-4">Questions?</h3>
            <p className="mb-6 theme-text">
              Email{' '}
              <a href={`mailto:${EMAIL}`} className="underline hover:opacity-80">{EMAIL}</a>
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
              <a href={`mailto:${EMAIL}`} className="underline hover:opacity-80">{EMAIL}</a>
              .
            </p>

            <hr className="my-8 border-gray-300" />

            <div className="text-center">
              <p className="theme-text-secondary text-sm mb-3">Also see our</p>
              <button
                onClick={() => navigate('/TermsAndConditions')}
                className="text-green-600 underline font-medium hover:opacity-80"
              >
                Terms & Conditions →
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
