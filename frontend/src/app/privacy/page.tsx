import type { Metadata } from "next";
import Link from "next/link";
import { GraduationCap } from "lucide-react";

export const metadata: Metadata = {
  title: "Privacy Policy — UniConnect",
  description: "Privacy Policy for UniConnect",
};

const EFFECTIVE_DATE = "July 5, 2026";
const CONTACT_EMAIL = "grahicbelmir@gmail.com";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-muted/30">
      <div className="max-w-2xl mx-auto px-4 py-10 sm:py-14">
        <Link href="/" className="flex items-center gap-2.5 mb-8 w-fit">
          <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center">
            <GraduationCap className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="text-xl font-bold tracking-tight text-foreground">UniConnect</span>
        </Link>

        <div className="bg-surface rounded-2xl shadow-sm px-6 py-8 sm:px-10 sm:py-10 space-y-8 text-sm leading-relaxed text-foreground">
          <div>
            <h1 className="text-2xl font-bold mb-1">Privacy Policy</h1>
            <p className="text-muted-foreground text-xs">Effective {EFFECTIVE_DATE}</p>
          </div>

          <p>
            This Privacy Policy explains what data UniConnect ("we," "us") collects, why, and how
            it's protected. UniConnect is an independent student project built for International
            University of Sarajevo (IUS) students and is not operated by the university.
          </p>

          <Section title="1. What we collect">
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <strong>Account data:</strong> your university email address, username, display
                name, password (stored only as a salted bcrypt hash — we never store or can see
                your actual password), and optionally a bio, faculty, and program.
              </li>
              <li>
                <strong>Content you create:</strong> posts, replies, votes, poll answers, direct
                messages, club chat messages, uploaded photos and files, and bookmarks.
              </li>
              <li>
                <strong>Anonymous Q&A authorship:</strong> when you post anonymously, your identity
                is stored in a separate, access-restricted record — not in the post itself. See
                Section 3.
              </li>
              <li>
                <strong>Technical data:</strong> your IP address, used transiently to enforce rate
                limits (e.g. blocking repeated failed logins) and is not permanently linked to your
                profile or used for tracking/advertising.
              </li>
              <li>
                <strong>Push notification data:</strong> if you enable browser push notifications,
                we store the subscription endpoint your browser gives us, only for delivering
                notifications you'd otherwise see in-app.
              </li>
              <li>
                <strong>Cookies:</strong> a single essential session cookie (httpOnly, so
                JavaScript can never read it) that keeps you logged in. We do not use advertising
                or analytics-tracking cookies.
              </li>
            </ul>
          </Section>

          <Section title="2. How we use it">
            <ul className="list-disc pl-5 space-y-1">
              <li>To operate the Service: show your posts, deliver messages, run club chat, rank the feed.</li>
              <li>To verify you're an eligible student and to secure your account (email verification, password reset).</li>
              <li>To send you transactional email (verification, password reset) and, if you opt in, push notifications. We do not send marketing email.</li>
              <li>To enforce these policies: reviewing reports, moderating abusive content, applying rate limits.</li>
              <li>To keep the Service secure and investigate misuse.</li>
            </ul>
          </Section>

          <Section title="3. Anonymous Q&A — the privacy design">
            <p>
              When you post or answer anonymously, the post itself is stored with no author field
              at all — not hidden in the interface, but genuinely absent from the data returned to
              any user-facing part of the app. The only place your identity is recorded is a
              separate, restricted table that ordinary application code never reads from.
            </p>
            <p className="mt-2">
              That record exists so we can act on abuse reports, remove content you posted if you
              ask us to, and comply with legal obligations. It is not shown to other users under
              any normal use of the Service. It may be accessed by the operator, or disclosed,
              only in the circumstances described in Section 5 of the Terms of Use (legal process,
              safety, or investigating a Terms violation).
            </p>
          </Section>

          <Section title="4. Who we share data with">
            <p>We don't sell your data, and we don't share it with advertisers. We use a small number of service providers who process data only on our behalf, to run the Service:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li><strong>Hosting provider</strong> (Railway) — runs the application, database, and stores uploaded files.</li>
              <li><strong>Email provider</strong> (Resend) — delivers verification and password-reset emails; sees the recipient address and email content, not your password.</li>
            </ul>
            <p className="mt-2">
              These providers may operate servers outside Bosnia and Herzegovina, including in the
              European Union and/or United States. We choose providers that maintain reasonable
              security and data-protection standards. We may also disclose data where required by
              law, legal process, or to protect someone's safety, as described in the Terms of Use.
            </p>
          </Section>

          <Section title="5. How we protect it">
            <ul className="list-disc pl-5 space-y-1">
              <li>Passwords are hashed with bcrypt; we never store plaintext passwords.</li>
              <li>Sessions use httpOnly, secure cookies — inaccessible to JavaScript, sent only over HTTPS in production.</li>
              <li>Uploaded files are validated (not just by file extension) before being stored, and served only to logged-in users.</li>
              <li>Access to moderation tools and the anonymous-authorship record requires a separate administrator credential.</li>
              <li>Rate limiting protects against brute-force login attempts and abuse.</li>
            </ul>
          </Section>

          <Section title="6. Data retention & deletion">
            <p>
              You can delete your own posts and messages, and delete your entire account, at any
              time from your profile settings. Deleting your account removes your ability to log
              in and removes your profile from view; some content moderation records (e.g. that a
              since-deleted post was previously reported or removed for a Terms violation) may be
              retained for a limited period to maintain an audit trail and to prevent abuse of the
              deletion feature to escape accountability. We don't keep personal data longer than
              necessary for these purposes.
            </p>
          </Section>

          <Section title="7. Your rights">
            <p>
              You can access and correct most of your data directly in the app (profile, posts,
              messages). You can request a copy of your data, or ask us to delete data we hold
              about you beyond what account deletion already removes, by emailing{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary underline">{CONTACT_EMAIL}</a>.
              If you believe your data has been mishandled, you may also contact Bosnia and
              Herzegovina's Personal Data Protection Agency (Agencija za zaštitu ličnih podataka u
              BiH).
            </p>
          </Section>

          <Section title="8. Children's privacy">
            <p>
              The Service is intended for university students and is not directed at children. We
              don't knowingly collect data from anyone under 16.
            </p>
          </Section>

          <Section title="9. Changes to this policy">
            <p>
              If we make a material change to how we handle your data, we'll make reasonable
              efforts to let active users know, such as an in-app notice.
            </p>
          </Section>

          <Section title="10. Contact">
            <p>
              Questions about this Privacy Policy or your data: <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary underline">{CONTACT_EMAIL}</a>.
            </p>
          </Section>

          <p className="text-xs text-muted-foreground pt-2 border-t">
            See also our <Link href="/terms" className="text-primary underline">Terms of Use</Link>.
          </p>
        </div>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-base font-semibold mb-2">{title}</h2>
      {children}
    </section>
  );
}
