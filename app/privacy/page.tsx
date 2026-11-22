// Draft generated from the codebase; have a qualified lawyer review before launch.
import type { Metadata } from "next";
import { ExternalLink, InternalLink, LegalPage, List, Section } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "What personal data Verbatim collects, why, who receives it, and how to exercise your rights.",
  alternates: { canonical: "/privacy" },
  openGraph: { type: "website", siteName: "Verbatim", locale: "en_IN", url: "/privacy", images: ["/opengraph-image"] },
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      intro={
        <>
          <p>
            This policy explains what personal data Verbatim collects when you use it, why we collect it, who we share
            it with, how long we keep it, and how you can access, correct or delete it.
          </p>
          <p>
            Verbatim is run by [LEGAL ENTITY NAME], [REGISTERED ADDRESS] (&quot;we&quot;, &quot;us&quot;). For the
            purposes of India&apos;s Digital Personal Data Protection Act, 2023 (the &quot;DPDP Act&quot;), we are the
            Data Fiduciary for the personal data described here. You can contact us at [CONTACT EMAIL].
          </p>
        </>
      }
    >
      <Section id="summary" title="The short version">
        <List>
          <li>We collect what we need to run your account and analyse the videos and transcripts you give us.</li>
          <li>Your profile, the quote cards you publish, your comments, your likes and who you follow are public.</li>
          <li>Your library, transcripts, analyses, bookmarks and collections are private to you.</li>
          <li>We do not use analytics, advertising or tracking cookies, and we do not sell your data.</li>
          <li>You can delete your account at any time from Settings, and that removes your data.</li>
          <li>Verbatim is for people aged 18 or older.</li>
        </List>
      </Section>

      <Section id="what-we-collect" title="What we collect and why">
        <p>This is the full list of personal data Verbatim handles, what it is used for, and where it is stored.</p>
        <List>
          <li>
            <strong>Account details.</strong> Your email address and a password (stored only as a secure hash by our
            authentication provider). Used to create your account, sign you in and keep it secure.
          </li>
          <li>
            <strong>Name.</strong> The name you enter when you sign up. It is shown on your public profile and next to
            anything you publish or comment on. We also use it to suggest your starting username.
          </li>
          <li>
            <strong>Google sign-in details.</strong> If you sign in with Google, Google shares your name, email address
            and profile picture link with us. We use the name and picture on your public profile.
          </li>
          <li>
            <strong>Profile details.</strong> Your username and an optional bio. These are public.
          </li>
          <li>
            <strong>Guest sessions.</strong> If you continue as a guest, we create an anonymous account with a random
            identifier and a guest username. Guests can browse but cannot analyse, publish or comment.
          </li>
          <li>
            <strong>Videos you submit.</strong> The YouTube links you paste, the video details we look up (title,
            channel name, length and category) and the video&apos;s public transcript when YouTube has one. Used to
            pick the best quotes, make your quote images and check each quote against the transcript. Transcripts
            contain the names and words of the people speaking in the video.
          </li>
          <li>
            <strong>Analysis results.</strong> The summary, insights, quotes, speaker names, timestamps and
            verification labels produced for each source. Private to you unless you publish a card made from them.
          </li>
          <li>
            <strong>Quote cards and posts.</strong> The card designs you make, the images you publish and their
            captions. Published cards are public.
          </li>
          <li>
            <strong>Social activity.</strong> Your comments, likes and follows (public) and your bookmarks and
            collections (private).
          </li>
          <li>
            <strong>Technical data.</strong> Our authentication and hosting providers record limited technical
            information such as IP address, browser type and sign-in times when you use the service. We use it to keep
            the service secure and to investigate abuse.
          </li>
        </List>
        <p>
          We do not ask for your phone number, date of birth, location, payment details or any government
          identifier.
        </p>
      </Section>

      <Section id="legal-basis" title="Our legal basis">
        <p>
          We process your personal data on the basis of your consent, which you give when you create an account or
          continue as a guest, and for the specific purpose of providing the features you choose to use. Where the
          DPDP Act allows processing without separate consent (a &quot;legitimate use&quot; under section 7), for
          example to comply with a legal obligation or a court order, we rely on that instead.
        </p>
        <p>
          You can withdraw your consent at any time by deleting your account in Settings. That is as easy as signing
          up. Withdrawing consent does not affect processing that happened before you withdrew it.
        </p>
      </Section>

      <Section id="public" title="What is public">
        <p>Anyone using Verbatim can see:</p>
        <List>
          <li>your name, username, bio and profile picture;</li>
          <li>quote images and insights you post to Commonplace, and their captions;</li>
          <li>your comments on public posts;</li>
          <li>which public posts you have liked, and who you follow.</li>
        </List>
        <p>
          Published card images are stored at public web addresses. If someone saves or shares one before you delete
          it, we cannot recall that copy.
        </p>
      </Section>

      <Section id="processors" title="Who we share data with">
        <p>
          We do not sell your personal data or share it for advertising. We use the following service providers
          (Data Processors) to run Verbatim. Each only receives what it needs.
        </p>
        <List>
          <li>
            <strong>Supabase</strong> hosts our database, file storage and sign-in system. It stores all of the data
            listed above. <ExternalLink href="https://supabase.com/privacy">Supabase privacy policy</ExternalLink>.
          </li>
          <li>
            <strong>Google Gemini API</strong> analyses the content. We send it the YouTube link you submitted or the
            text of the transcript you uploaded. We do not send your name, email address or account details. If we use
            Google&apos;s unpaid Gemini tier, Google may use the content we send to improve its products and human
            reviewers may read it; on the paid tier Google keeps it for a limited period to detect abuse.{" "}
            <ExternalLink href="https://ai.google.dev/gemini-api/terms">Gemini API terms</ExternalLink>.
          </li>
          <li>
            <strong>Supadata</strong> fetches the transcript of a YouTube video. We send it the video link only.{" "}
            <ExternalLink href="https://supadata.ai/privacy">Supadata privacy policy</ExternalLink>.
          </li>
          <li>
            <strong>YouTube Data API</strong> tells us a video&apos;s title, channel, length and availability. We send
            it the video ID only.
          </li>
          <li>
            <strong>Google sign-in</strong>, if you choose it, confirms your identity and shares your name, email and
            profile picture link with us. You can remove Verbatim&apos;s access at any time from your{" "}
            <ExternalLink href="https://myaccount.google.com/permissions">Google account permissions page</ExternalLink>.
          </li>
          <li>
            <strong>[HOSTING PROVIDER]</strong> runs the website and may record standard server logs.
          </li>
        </List>
        <p>
          We may also disclose personal data where the law requires it, for example in response to a lawful request
          from a court or government authority in India.
        </p>
      </Section>

      <Section id="youtube" title="YouTube API Services">
        <p>
          Verbatim uses YouTube API Services to look up information about the videos you submit. By using Verbatim to
          analyse YouTube videos, you also agree to be bound by the{" "}
          <ExternalLink href="https://www.youtube.com/t/terms">YouTube Terms of Service</ExternalLink>. Google&apos;s
          handling of data is described in the{" "}
          <ExternalLink href="https://policies.google.com/privacy">Google Privacy Policy</ExternalLink>.
        </p>
        <p>
          Verbatim does not download, store or re-host YouTube videos. It stores the video link, the video details
          listed above and the transcript text used to check quotes.
        </p>
      </Section>

      <Section id="transfers" title="Where your data is processed">
        <p>
          Our service providers may store and process your data on servers outside India, including in the United
          States and other countries where Supabase, Google and Supadata operate. The DPDP Act permits this unless the
          Government of India restricts transfers to a particular country. We will stop or change any transfer that
          the law restricts.
        </p>
      </Section>

      <Section id="retention" title="How long we keep your data">
        <List>
          <li>We keep your account data, library and published content for as long as your account exists.</li>
          <li>
            When you delete a published post, we delete its post record and remove the card image from storage.
          </li>
          <li>
            When you delete your account, we delete your account, profile, sources, transcripts, analyses, quotes,
            insights, designs, posts, comments, likes, bookmarks, follows, collections and your published card images.
            This happens straight away. Copies may remain in our providers&apos; encrypted backups until those backups
            are overwritten on their normal schedule.
          </li>
          <li>
            We may keep limited records for longer where the law requires it, for example security logs, or
            information we must keep under the Information Technology Act, 2000 and the rules made under it after
            content or an account is removed. We keep these only for the period the law requires.
          </li>
        </List>
      </Section>

      <Section id="rights" title="Your rights">
        <p>Under the DPDP Act you have the right to:</p>
        <List>
          <li>get a summary of the personal data we hold about you and the processing we carry out;</li>
          <li>know who we have shared it with;</li>
          <li>correct, complete or update it;</li>
          <li>have it erased;</li>
          <li>withdraw your consent;</li>
          <li>have your grievances addressed;</li>
          <li>nominate another person to exercise your rights if you die or become unable to do so.</li>
        </List>
        <p>
          You can edit your name, username and bio on your profile page, and delete your whole account in{" "}
          <strong>Settings &gt; Delete account</strong>. For anything else, email [CONTACT EMAIL] from the address
          linked to your account and tell us your username. We may ask you to confirm your identity before acting.
        </p>
        <p>
          If you live outside India, the law where you live may give you additional rights. Contact us and we will
          help.
        </p>
      </Section>

      <Section id="grievance" title="Grievance officer">
        <p>
          If you have a complaint about how we handle your personal data or about content on Verbatim, contact our
          Grievance Officer:
        </p>
        <List>
          <li>Name: [GRIEVANCE OFFICER NAME]</li>
          <li>Email: [GRIEVANCE OFFICER EMAIL]</li>
          <li>Address: [REGISTERED ADDRESS]</li>
        </List>
        <p>
          We will acknowledge your complaint within 24 hours and aim to resolve it within 15 days. If you are not
          satisfied with our response, you can complain to the Data Protection Board of India.
        </p>
      </Section>

      <Section id="children" title="Children">
        <p>
          Verbatim is only for people aged 18 or older. We do not knowingly collect personal data from anyone under
          18. If you believe a child has created an account, contact [CONTACT EMAIL] and we will delete it.
        </p>
      </Section>

      <Section id="security" title="Security">
        <p>
          We use reasonable security safeguards to protect your data. These include encrypted connections (HTTPS),
          access controls in our database so that each person can only read and change their own private data,
          password hashing by our authentication provider, and keeping secret keys on our servers only. No system is
          perfectly secure, so please use a strong password that you do not use elsewhere.
        </p>
      </Section>

      <Section id="breach" title="If there is a data breach">
        <p>
          If a personal data breach affects you, we will tell you without delay through your account or by email. We
          will explain what happened, the likely impact on you, what we are doing about it and what you can do to
          protect yourself. We will also report the breach to the Data Protection Board of India as the law requires.
        </p>
      </Section>

      <Section id="cookies" title="Cookies">
        <p>
          We only use cookies and browser storage that are needed to sign you in and make the site work. See our{" "}
          <InternalLink href="/cookies">cookie policy</InternalLink> for the full list.
        </p>
      </Section>

      <Section id="changes" title="Changes to this policy">
        <p>
          If we make a significant change to this policy, we will tell you on the site or by email before it takes
          effect. The date at the top shows when it was last updated.
        </p>
      </Section>

      <Section id="contact" title="Contact">
        <p>
          [LEGAL ENTITY NAME], [REGISTERED ADDRESS]. Email: [CONTACT EMAIL]. See also our{" "}
          <InternalLink href="/terms">terms of service</InternalLink>.
        </p>
      </Section>
    </LegalPage>
  );
}
