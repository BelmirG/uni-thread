import type { Metadata } from "next";
import Link from "next/link";
import { GraduationCap } from "lucide-react";

export const metadata: Metadata = {
  title: "Terms of Use — UniThread",
  description: "Terms of Use for UniThread",
};

const EFFECTIVE_DATE = "July 5, 2026";
const CONTACT_EMAIL = "grahicbelmir@gmail.com";

export default function TermsPage() {
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
            <h1 className="text-2xl font-bold mb-1">Terms of Use</h1>
            <p className="text-muted-foreground text-xs">Effective {EFFECTIVE_DATE}</p>
          </div>

          <p>
            These Terms of Use ("Terms") govern your access to and use of UniThread (the
            "Service"), operated by Belmir Grahic ("we," "us," "the operator"). By creating an
            account or otherwise using the Service, you agree to these Terms. If you do not
            agree, do not use the Service.
          </p>

          <Section title="1. Not an official IUS service">
            <p>
              UniThread is an independent student project. It is <strong>not owned, operated,
              endorsed, or officially affiliated with International University of Sarajevo
              (IUS)</strong>. We use an IUS student email address only as an eligibility check to
              keep the community campus-only. UniThread is not a channel for official university
              communications, grades, enrollment, or administrative matters, and the university is
              not responsible for the Service or its content.
            </p>
          </Section>

          <Section title="2. Eligibility">
            <ul className="list-disc pl-5 space-y-1">
              <li>
                You must register with a valid university email address ending in the domain(s)
                currently accepted by the Service (by default, <code>@student.ius.edu.ba</code>).
              </li>
              <li>You must be at least 18 years old, or the age of legal majority in your jurisdiction.</li>
              <li>You may maintain only one account and may not register on behalf of someone else.</li>
              <li>
                Account eligibility may occasionally be widened temporarily for beta testing with
                a limited set of testers; this does not change any other part of these Terms.
              </li>
            </ul>
          </Section>

          <Section title="3. Your account">
            <p>
              You're responsible for the accuracy of the information you provide, for keeping your
              password confidential, and for all activity under your account. Tell us promptly at{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary underline">{CONTACT_EMAIL}</a>{" "}
              if you suspect unauthorized access. You may delete your account at any time from your
              profile settings.
            </p>
          </Section>

          <Section title="4. Content you post">
            <p>
              You retain ownership of the posts, comments, messages, photos, and files you submit
              ("User Content"). By posting, you grant us a limited, non-exclusive license to
              store, display, and distribute that content within the Service, solely to operate
              the Service (for example, showing your post in the feed or a club chat). This
              license ends when you delete the content or your account, except for copies that may
              briefly remain in backups or that we're required to retain (see the Privacy Policy).
            </p>
            <p className="mt-2">
              You're solely responsible for your User Content and confirm you have the right to
              post it. Don't post anything that infringes someone else's copyright, trademark, or
              other rights.
            </p>
          </Section>

          <Section title="5. The anonymous Q&A board — how anonymity actually works">
            <p>
              The Q&A board lets you post questions and answers without your name or profile being
              shown to other users. This is a real technical design, not a cosmetic label: ordinary
              posts and API responses never contain the author's identity for anonymous content.
            </p>
            <p className="mt-2">
              However, anonymity is <strong>not absolute</strong>. To prevent abuse and to allow
              moderation, we keep a separate, restricted internal record linking each anonymous
              post to the account that created it. This record is not exposed to other users
              through normal use of the Service. We may access it, and may disclose the underlying
              identity:
            </p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>to investigate a violation of these Terms or a report of abuse, harassment, or threats;</li>
              <li>where required to comply with a valid legal process, court order, or applicable law;</li>
              <li>to protect the rights, safety, or property of any person, including preventing an imminent threat to someone's safety.</li>
            </ul>
            <p className="mt-2">
              Don't use anonymous posting to do something you wouldn't do under your own name and
              wouldn't be able to justify if asked — the anonymity protects ordinary students
              asking sensitive questions, not illegal or harmful conduct.
            </p>
          </Section>

          <Section title="6. Acceptable use">
            <p>You agree not to use the Service to:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>harass, threaten, bully, stalk, or intimidate another person;</li>
              <li>post hate speech, or content that discriminates against a protected group;</li>
              <li>reveal another person's private information without their consent (doxxing), including trying to unmask an anonymous poster;</li>
              <li>impersonate another person or misrepresent your affiliation with anyone;</li>
              <li>post illegal content, or content that facilitates academic dishonesty (e.g. exam answers obtained improperly);</li>
              <li>upload malware, or files disguised as another file type;</li>
              <li>spam, scrape, or use automated tools against the Service;</li>
              <li>attempt to bypass rate limits, authentication, or the email-domain restriction;</li>
              <li>interfere with or disrupt the Service's operation or other users' access to it.</li>
            </ul>
          </Section>

          <Section title="7. Moderation and enforcement">
            <p>
              We may review, remove, or restrict access to content that violates these Terms, and
              may suspend or terminate accounts that do — with or without prior notice, at our
              reasonable discretion. Reports submitted through the app are reviewed by an
              administrator. We may cooperate with law enforcement or the university's own
              disciplinary process where legally required or where we believe in good faith it's
              necessary to prevent harm.
            </p>
          </Section>

          <Section title="8. Copyright complaints">
            <p>
              If you believe content on the Service infringes your copyright, email{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary underline">{CONTACT_EMAIL}</a>{" "}
              with (a) a description of the work, (b) a link to the infringing content, (c) your
              contact information, and (d) a statement that you have a good-faith belief the use is
              unauthorized. We'll review and remove infringing content where appropriate.
            </p>
          </Section>

          <Section title="9. Third-party services">
            <p>
              We use third-party providers to run the Service — for example, a hosting provider to
              run the servers and database, and an email provider to deliver verification and
              password-reset emails. These providers process data only on our instructions to
              provide their service to us; see the Privacy Policy for details. We do not sell your
              data or run advertising on the Service.
            </p>
          </Section>

          <Section title="10. Disclaimers">
            <p>
              The Service is a student project provided on an "as is" and "as available" basis,
              without warranties of any kind, express or implied, including uninterrupted
              availability, fitness for a particular purpose, or that it will be error-free. We
              make reasonable efforts to keep it secure and available but cannot guarantee it.
            </p>
          </Section>

          <Section title="11. Limitation of liability">
            <p>
              To the maximum extent permitted by applicable law, the operator will not be liable
              for any indirect, incidental, or consequential damages arising from your use of the
              Service, or for content posted by other users. Our total liability for any claim
              arising from the Service is limited to the greater of the amount you paid us in the
              past 12 months (which, as this is a free service, is expected to be zero) or a
              nominal amount required by applicable law.
            </p>
          </Section>

          <Section title="12. Termination">
            <p>
              You may stop using the Service and delete your account at any time. We may suspend
              or terminate your access if you violate these Terms. Sections that by their nature
              should survive termination (content license limits, disclaimers, liability limits)
              continue to apply.
            </p>
          </Section>

          <Section title="13. Changes to these Terms">
            <p>
              We may update these Terms as the Service evolves. If we make a material change,
              we'll make reasonable efforts to let active users know (for example, an in-app
              notice). Continued use after a change takes effect means you accept the updated
              Terms.
            </p>
          </Section>

          <Section title="14. Governing law">
            <p>
              These Terms are governed by the laws of Bosnia and Herzegovina, without regard to
              conflict-of-law principles. Any dispute will first be attempted to be resolved
              informally by contacting us directly.
            </p>
          </Section>

          <Section title="15. Contact">
            <p>
              Questions about these Terms: <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary underline">{CONTACT_EMAIL}</a>.
            </p>
          </Section>

          <p className="text-xs text-muted-foreground pt-2 border-t">
            See also our <Link href="/privacy" className="text-primary underline">Privacy Policy</Link>.
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
