// Draft generated from the codebase; have a qualified lawyer review before launch.
import type { Metadata } from "next";
import { ExternalLink, InternalLink, LegalPage, List, Section } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Terms of service",
  description: "The rules for using Verbatim, publishing quote cards and commenting.",
  alternates: { canonical: "/terms" },
  openGraph: { type: "website", siteName: "Verbatim", locale: "en_IN", url: "/terms", images: ["/opengraph-image"] },
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of service"
      intro={
        <>
          <p>
            These terms are an agreement between you and [LEGAL ENTITY NAME], [REGISTERED ADDRESS] (&quot;we&quot;,
            &quot;us&quot;), the operator of Verbatim. By creating an account, continuing as a guest or otherwise using
            Verbatim, you agree to these terms and to our{" "}
            <InternalLink href="/privacy">privacy policy</InternalLink>. If you do not agree, please do not use
            Verbatim.
          </p>
        </>
      }
    >
      <Section id="service" title="What Verbatim does">
        <p>
          Verbatim lets you submit a YouTube link, uses automated tools (including artificial intelligence) to pick
          the best quotes, checks them against the transcript, and lays them out as quote images you can download,
          send to others, or post to Commonplace, the shared space where others can like, bookmark and comment.
        </p>
      </Section>

      <Section id="eligibility" title="Who can use Verbatim">
        <List>
          <li>You must be 18 or older.</li>
          <li>You must be able to enter into a binding contract under the law that applies to you.</li>
          <li>You must give accurate information when you sign up and keep your password secret.</li>
          <li>You are responsible for everything that happens under your account.</li>
        </List>
      </Section>

      <Section id="youtube" title="YouTube content">
        <p>
          Verbatim uses YouTube API Services. By using Verbatim with YouTube videos, you agree to be bound by the{" "}
          <ExternalLink href="https://www.youtube.com/t/terms">YouTube Terms of Service</ExternalLink>. Google&apos;s
          privacy practices are described in the{" "}
          <ExternalLink href="https://policies.google.com/privacy">Google Privacy Policy</ExternalLink>.
        </p>
        <p>
          Videos, transcripts and the words spoken in them belong to their creators and speakers, not to you or to us.
          Verbatim does not download or re-host videos.
        </p>
      </Section>

      <Section id="your-content" title="Your content">
        <p>
          &quot;Your content&quot; means the links, transcripts, profile details, quote cards, captions and comments
          you add to Verbatim.
        </p>
        <List>
          <li>You keep any rights you have in your content.</li>
          <li>
            You give us a non-exclusive, worldwide, royalty-free licence to store, copy, process, display and
            distribute your content only so far as we need to run, secure and improve Verbatim. This includes sending
            it to our service providers as described in the privacy policy, and showing published content to other
            users. The licence ends when you delete the content or your account, except for copies we must keep by
            law.
          </li>
          <li>
            You are responsible for your content. You confirm that you have the right to upload and share it, and that
            it does not break these terms or the law.
          </li>
        </List>
      </Section>

      <Section id="copyright" title="Quotes from other people">
        <p>
          The quotes Verbatim extracts come from other people&apos;s videos and conversations. The original creators
          and speakers own them. When you publish a quote card:
        </p>
        <List>
          <li>keep the quote short and credit the speaker and source;</li>
          <li>
            only use it for purposes the law allows, such as commentary, criticism, review or reporting (for example,
            fair dealing under section 52 of the Indian Copyright Act, 1957);
          </li>
          <li>do not suggest the speaker endorses you or your views;</li>
          <li>respect the YouTube Terms of Service and any rights of the creator.</li>
        </List>
        <p>
          We may remove a quote card if the rights holder or speaker asks us to and we believe the request is valid.
        </p>
      </Section>

      <Section id="ai" title="AI output and verification labels">
        <p>
          Summaries, insights, quotes, speaker names and timestamps are produced automatically and may be wrong,
          incomplete or out of context. Verification labels are also automated: a &quot;verified&quot; label means
          the text matched the transcript we had, not that the transcript is accurate, that the speaker meant it a
          certain way, or that the statement is true. Check important quotes against the original source before you
          rely on or publish them.
        </p>
      </Section>

      <Section id="acceptable-use" title="What you must not do">
        <p>You must not upload, publish, share or comment anything that:</p>
        <List>
          <li>belongs to someone else and you have no right to use;</li>
          <li>
            is obscene, pornographic, paedophilic, or invades another person&apos;s privacy, including bodily privacy;
          </li>
          <li>insults or harasses anyone on the basis of gender;</li>
          <li>is racially or ethnically objectionable;</li>
          <li>relates to or encourages money laundering or gambling;</li>
          <li>is harmful to children;</li>
          <li>infringes any patent, trademark, copyright or other proprietary right;</li>
          <li>
            misleads people about where a message came from, or knowingly and intentionally spreads misinformation or
            information that is clearly false or misleading;
          </li>
          <li>impersonates another person;</li>
          <li>
            threatens the unity, integrity, defence, security or sovereignty of India, friendly relations with other
            countries or public order, incites any offence, prevents the investigation of any offence, or insults any
            other nation;
          </li>
          <li>contains viruses or any code designed to interrupt, damage or limit any computer system;</li>
          <li>breaks any law in force.</li>
        </List>
        <p>You must also not:</p>
        <List>
          <li>try to get around usage limits, for example by creating multiple accounts;</li>
          <li>access other people&apos;s private data or probe, scan or attack the service;</li>
          <li>scrape, copy or resell the service or its content in bulk;</li>
          <li>use Verbatim to harass, threaten or spam anyone.</li>
        </List>
      </Section>

      <Section id="takedown" title="Reporting content and complaints">
        <p>
          To report content that breaks these terms or the law, or to make any other complaint, contact our Grievance
          Officer, [GRIEVANCE OFFICER NAME], at [GRIEVANCE OFFICER EMAIL]. Include a link to the content and explain
          the problem.
        </p>
        <List>
          <li>We will acknowledge your complaint within 24 hours.</li>
          <li>We will resolve it within 15 days of receiving it.</li>
          <li>
            Where a complaint asks us to remove content in the prohibited categories above, we will act on it within
            72 hours.
          </li>
          <li>
            Where content appears to show a person in a sexual act or conduct, exposes their private areas, shows them
            fully or partially nude, or is an impersonation such as a morphed image, we will remove or disable access
            to it within 24 hours of receiving a complaint from that person or someone acting for them.
          </li>
        </List>
        <p>
          If you are not satisfied with the Grievance Officer&apos;s decision, you may appeal to the Grievance
          Appellate Committee set up by the Government of India within 30 days of receiving the decision.
        </p>
        <p>We will also act on orders from courts and government authorities as the law requires.</p>
      </Section>

      <Section id="termination" title="Suspension and termination">
        <p>
          You can stop using Verbatim and delete your account at any time in Settings. We may remove content, limit
          features, or suspend or close your account if you break these terms or the law, or if we need to protect
          other users or the service. Where it is reasonable to do so, we will tell you why.
        </p>
      </Section>

      <Section id="changes-service" title="Changes to Verbatim">
        <p>
          Verbatim is under active development. We may change, add or remove features, change usage limits, or stop
          the service. If we stop the service, we will try to give you reasonable notice.
        </p>
      </Section>

      <Section id="disclaimers" title="Disclaimers">
        <p>
          Verbatim is provided &quot;as is&quot; and &quot;as available&quot;. To the extent the law allows, we do not
          promise that it will be uninterrupted, error free or that its output will be accurate, and we disclaim all
          implied warranties. Content posted by other users is their responsibility, not ours.
        </p>
      </Section>

      <Section id="liability" title="Limitation of liability">
        <p>
          To the extent the law allows, we are not liable for indirect, incidental, special or consequential losses,
          or for loss of data, profits or reputation, arising from your use of Verbatim. Our total liability to you
          for any claim relating to Verbatim is limited to the amount you paid us in the 12 months before the claim,
          or INR 1,000 if you paid nothing. Nothing in these terms limits liability that cannot be limited by law.
        </p>
      </Section>

      <Section id="indemnity" title="Your responsibility to us">
        <p>
          If someone brings a claim against us because of your content or your breach of these terms, you agree to
          cover our reasonable losses and costs arising from that claim, to the extent the law allows.
        </p>
      </Section>

      <Section id="law" title="Governing law">
        <p>
          These terms are governed by the laws of India. The courts at [CITY] have exclusive jurisdiction over any
          dispute arising from them, subject to any rights you have under consumer protection law.
        </p>
      </Section>

      <Section id="changes" title="Changes to these terms">
        <p>
          If we make a significant change to these terms, we will tell you on the site or by email before it takes
          effect. If you keep using Verbatim after that, you accept the new terms.
        </p>
      </Section>

      <Section id="contact" title="Contact">
        <p>
          [LEGAL ENTITY NAME], [REGISTERED ADDRESS]. Email: [CONTACT EMAIL].
        </p>
      </Section>
    </LegalPage>
  );
}
