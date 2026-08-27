import type { Metadata } from "next";
import Link from "next/link";
import { GraduationCap } from "lucide-react";

export const metadata: Metadata = {
  title: "Privacy Policy — UniThread",
  description: "Privacy Policy for UniThread",
};

const EFFECTIVE_DATE = "August 10, 2026";
const CONTACT_EMAIL = "contact@unithread.app";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-muted/30">
      <div className="max-w-2xl mx-auto px-4 py-10 sm:py-14">
        <Link href="/" className="flex items-center gap-2.5 mb-8 w-fit">
          <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center">
            <GraduationCap className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="text-xl font-bold tracking-tight text-foreground">UniThread</span>
        </Link>

        <div className="bg-surface rounded-2xl shadow-sm px-6 py-8 sm:px-10 sm:py-10 space-y-8 text-sm leading-relaxed text-foreground">
          <div>
            <h1 className="text-2xl font-bold mb-1">Privacy Policy</h1>
            <p className="text-muted-foreground text-xs">Effective {EFFECTIVE_DATE}</p>
          </div>

          <p>
            This Privacy Policy explains what data UniThread ("we," "us") collects, why, and how
            it's protected. UniThread is an independent student project built for International
            University of Sarajevo (IUS) students and is not operated by the university. Bosnia
            and Herzegovina is not an EU member state, but we've aligned this policy with the EU
            General Data Protection Regulation (GDPR) as our baseline standard, regardless of
            where a user is located.
          </p>

          <Section title="1. Who is responsible for your data">
            <p>
              The data controller is Belmir Grahic, the individual operator of UniThread, reachable
              at <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary underline">{CONTACT_EMAIL}</a>.
              UniThread is not a large enough operation to be legally required to appoint a Data
              Protection Officer, but the contact above handles all privacy inquiries directly.
            </p>
          </Section>

          <Section title="2. What we collect">
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <strong>Account data:</strong> your university email address, username, display
                name, password (stored only as a salted bcrypt hash — we never store or can see
                your actual password), and optionally a bio, faculty, and program.
              </li>
              <li>
                <strong>Content you create:</strong> posts, replies, votes, poll answers, direct
                messages, club chat messages, uploaded photos, videos and files, and bookmarks.
              </li>
              <li>
                <strong>Anonymous board authorship:</strong> when you post anonymously, your identity
                is stored in a separate, access-restricted record — not in the post itself. See
                Section 5.
              </li>
              <li>
                <strong>Technical data:</strong> your IP address, used transiently to enforce rate
                limits (e.g. blocking repeated failed logins) and is not permanently linked to your
                profile or used for tracking/advertising.
              </li>
              <li>
                <strong>Push notification data:</strong> if you enable push notifications, we store
                the subscription endpoint your browser or device gives us, only for delivering
                notifications you'd otherwise see in-app.
              </li>
              <li>
                <strong>Cookies:</strong> a single essential session cookie (httpOnly, so
                JavaScript can never read it) that keeps you logged in. We do not use advertising
                or analytics-tracking cookies, and because this cookie is strictly necessary to
                operate the Service, no cookie-consent banner is required for it.
              </li>
            </ul>
          </Section>

          <Section title="3. Our legal basis for processing your data">
            <p>Under GDPR Article 6, we rely on the following legal bases, depending on the data:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li><strong>Performance of a contract</strong> — account data, content you create, and messages, because we can't provide the Service without them.</li>
              <li><strong>Legitimate interest</strong> — technical/IP data for rate limiting and abuse prevention, and moderation records, because keeping the Service safe and functioning benefits the community and is proportionate to the minimal data involved.</li>
              <li><strong>Consent</strong> — push notifications, which are strictly opt-in and can be withdrawn at any time by disabling them in your device or browser settings.</li>
              <li><strong>Legal obligation</strong> — limited disclosures described in Section 6, where required by law.</li>
            </ul>
          </Section>

          <Section title="4. How we use it">
            <ul className="list-disc pl-5 space-y-1">
              <li>To operate the Service: show your posts, deliver messages, run club chat, rank the feed.</li>
              <li>To verify you're an eligible student and to secure your account (email verification, password reset).</li>
              <li>To send you transactional email (verification, password reset) and, if you opt in, push notifications. We do not send marketing email.</li>
              <li>To enforce these policies: reviewing reports, moderating abusive content, applying rate limits.</li>
              <li>To keep the Service secure and investigate misuse.</li>
            </ul>
            <p className="mt-2">
              We do not use your data for automated decision-making or profiling that produces
              legal or similarly significant effects on you. Feed ranking (e.g. "hot" sorting) only
              orders content you can already see — it never restricts your access to anything or
              makes a decision about you as a person.
            </p>
          </Section>

          <Section title="5. The Anonymous board — the privacy design">
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

          <Section title="6. Who we share data with, and international transfers">
            <p>We don't sell your data, and we don't share it with advertisers. We use a small number of service providers who process data only on our behalf, to run the Service:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li><strong>Hosting provider</strong> (Railway) — runs the application, database, and stores uploaded files.</li>
              <li><strong>Email provider</strong> (Resend) — delivers verification and password-reset emails; sees the recipient address and email content, not your password.</li>
              <li><strong>Backup storage</strong> — automated nightly database backups are stored with a cloud object-storage provider, encrypted, for disaster recovery.</li>
            </ul>
            <p className="mt-2">
              These providers may process data outside Bosnia and Herzegovina, including in the
              European Union and/or United States. Where a provider processes data outside the
              EU/EEA, we rely on the provider's own compliance mechanisms (such as Standard
              Contractual Clauses or an equivalent adequacy framework) as a safeguard. We select
              providers that maintain reasonable security and data-protection standards, and each
              only processes data under our instructions, only to provide their service to us. We
              may also disclose data where required by law, legal process, or to protect someone's
              safety, as described in the Terms of Use.
            </p>
          </Section>

          <Section title="7. How we protect it">
            <ul className="list-disc pl-5 space-y-1">
              <li>Passwords are hashed with bcrypt; we never store plaintext passwords.</li>
              <li>Sessions use httpOnly, secure cookies — inaccessible to JavaScript, sent only over HTTPS in production.</li>
              <li>Uploaded files are validated (not just by file extension) before being stored, and served only to logged-in users.</li>
              <li>Access to moderation tools and the anonymous-authorship record requires a separate administrator credential.</li>
              <li>Rate limiting protects against brute-force login attempts and abuse.</li>
              <li>Database backups are taken nightly and stored encrypted, for recovery in case of data loss.</li>
            </ul>
          </Section>

          <Section title="8. Data retention">
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Account and content data:</strong> kept for as long as your account is active. You can delete individual posts/messages, or your entire account, at any time from your profile settings.</li>
              <li><strong>After account deletion:</strong> your login credentials and profile are removed immediately; some moderation records (e.g. that a since-deleted post was previously reported or removed for a Terms violation) are retained for a limited period afterward to maintain an audit trail and prevent abuse of deletion to escape accountability.</li>
              <li><strong>Backups:</strong> deleted data may persist briefly in encrypted backup snapshots taken before the deletion, until those backups are rotated out on their normal schedule.</li>
              <li>We don't keep personal data longer than necessary for the purpose it was collected for.</li>
            </ul>
          </Section>

          <Section title="9. Your rights under data protection law">
            <p>Whatever your location, we extend you the following rights over your personal data:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li><strong>Access</strong> — ask what personal data we hold about you.</li>
              <li><strong>Rectification</strong> — correct inaccurate data (most of this you can do yourself in the app).</li>
              <li><strong>Erasure</strong> — ask us to delete data we hold about you, including beyond what account deletion already removes ("right to be forgotten").</li>
              <li><strong>Restriction</strong> — ask us to limit how we use your data in specific circumstances.</li>
              <li><strong>Portability</strong> — request a copy of your data in a structured, machine-readable format.</li>
              <li><strong>Objection</strong> — object to processing based on our legitimate interest.</li>
              <li><strong>Withdraw consent</strong> — for anything based on consent (e.g. push notifications), at any time, without affecting the lawfulness of processing before the withdrawal.</li>
            </ul>
            <p className="mt-2">
              To exercise any of these, email{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary underline">{CONTACT_EMAIL}</a>.
              We'll respond within a reasonable time, generally within 30 days. If you believe your
              data has been mishandled, you may also lodge a complaint with Bosnia and
              Herzegovina's Personal Data Protection Agency (Agencija za zaštitu ličnih podataka u
              BiH), or, if applicable to you, your own country's data protection supervisory
              authority.
            </p>
          </Section>

          <Section title="10. Children's privacy">
            <p>
              The Service requires you to be at least 18 (see the Terms of Use) and is not directed
              at children. We don't knowingly collect data from anyone under 16, and would delete
              any such account and its data if discovered.
            </p>
          </Section>

          <Section title="11. Changes to this policy">
            <p>
              If we make a material change to how we handle your data, we'll make reasonable
              efforts to let active users know, such as an in-app notice, before the change takes
              effect.
            </p>
          </Section>

          <Section title="12. Contact">
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
