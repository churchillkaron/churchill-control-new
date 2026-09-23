import Link from "next/link";

import PublicSiteHeader from "@/components/public/PublicSiteHeader";
import StaffPortalHeroArt from "@/components/public/StaffPortalHeroArt";

export const metadata = {
  title: "Staff Portal & HR | Avantiqo",
  description:
    "Give employees one secure portal for work, shifts, requests, payroll and verified identity while Owner and HR manage private documents, legal-employer context and expiry visibility from the same staff record.",
};

const staffExperience = [
  ["Today","See today’s shift, assignments, requests, checklist context and what needs attention."],
  ["Clock & attendance","Clock in/out against the same governed staff identity and workforce record."],
  ["Requests","Leave, availability and shift requests stay connected to schedule and approval context."],
  ["Pay & payslips","Compensation and payroll information remain attached to the same employee record."],
  ["Documents","Upload or replace identity evidence securely without creating loose files outside HR control."],
  ["Messages & service context","Role-aware work context stays with the employee instead of being scattered across apps."],
];

const hrExperience = [
  ["Employee master","See identity, employment, organization membership and access context together."],
  ["Identity review","Open passport, national ID and work-permit evidence visually through controlled private review."],
  ["Expiry visibility","See validity approaching expiry or expired directly on the employee record."],
  ["Legal employer","Keep work-permit and employment context tied to the correct legal entity."],
  ["Workforce control","Schedule, attendance, requests and qualifications stay connected to the same person."],
  ["Payroll context","Compensation, payroll readiness and payslips remain part of the same governed workforce context."],
];

export default function StaffPortalPublicPage() {
  return (
    <main className="min-h-screen bg-[#F4F0E8] text-[#1D1A17]">
      <PublicSiteHeader
        context="STAFF PORTAL"
        audience="business"
        tone="light"
        links={[
          { label: "Staff experience", href: "#staff" },
          { label: "Owner / HR", href: "#hr" },
          { label: "Security", href: "#security" },
          { label: "Workforce", href: "/products/workforce" },
        ]}
        action={{ label: "Staff Login", href: "/login?portal=staff" }}
      />

      <section className="border-b border-black/[.07] bg-[linear-gradient(180deg,#F7F3EC,#F0E9DF)]">
        <div className="mx-auto grid max-w-[1540px] gap-10 px-5 py-14 sm:px-7 lg:grid-cols-[.78fr_1.22fr] lg:items-center lg:px-10 lg:py-20 xl:px-14">
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-[.21em] text-[#9A744B]">STAFF · HR · OWNER</div>
            <h1 className="mt-5 max-w-[600px] text-[54px] font-medium leading-[.92] tracking-[-.06em] sm:text-[70px]">One staff portal. One employee record.</h1>
            <p className="mt-6 max-w-[610px] text-[15px] leading-8 text-[#625D55]">Employees get one secure place for work, shifts, requests, clocking, pay and identity. Owner and HR keep private evidence, legal-employer context, expiry visibility and workforce control attached to the same person.</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/login?portal=staff" className="inline-flex h-12 items-center rounded-full bg-[#171614] px-5 text-[11px] font-semibold text-white">Staff Login</Link>
              <a href="#staff" className="inline-flex h-12 items-center rounded-full border border-black/[.1] bg-white/60 px-5 text-[11px] font-semibold text-[#655B52]">See the staff experience</a>
              <a href="#hr" className="inline-flex h-12 items-center rounded-full border border-black/[.1] bg-white/60 px-5 text-[11px] font-semibold text-[#655B52]">See Owner / HR control</a>
              <Link href="/products/workforce" className="inline-flex h-12 items-center rounded-full border border-[#B7793B]/25 bg-[#F3E3CE] px-5 text-[11px] font-semibold text-[#76502E]">Explore Workforce</Link>
            </div>
            <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
              {[
                ["Verified","Email + phone"],
                ["Private","Identity documents"],
                ["Connected","Work + pay context"],
                ["Visible","Expiry + review state"],
              ].map(([a,b])=><div key={a} className="border-t border-black/[.08] pt-3"><div className="text-[15px] font-medium text-[#9A6531]">{a}</div><div className="mt-1 text-[7px] uppercase tracking-[.1em] text-[#8C837B]">{b}</div></div>)}
            </div>
          </div>
          <StaffPortalHeroArt />
        </div>
      </section>

      <section id="staff" className="border-b border-black/[.07] bg-[#F8F5EF]">
        <div className="mx-auto max-w-[1320px] px-5 py-16 sm:px-7 lg:px-10 lg:py-20">
          <div className="grid gap-7 lg:grid-cols-[.82fr_1.18fr] lg:items-end">
            <div>
              <div className="text-[9px] font-semibold uppercase tracking-[.2em] text-[#9A744B]">THE STAFF EXPERIENCE</div>
              <h2 className="mt-3 text-[40px] font-medium leading-[.98] tracking-[-.05em] sm:text-[54px]">The employee should not need six apps to understand their work.</h2>
            </div>
            <p className="max-w-2xl text-[13px] leading-7 text-[#6C6963] lg:justify-self-end">The portal follows the employee record: who the person is, where they work, what they are scheduled to do, what they have requested, what evidence is required and what information they are allowed to see.</p>
          </div>
          <div className="mt-10 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {staffExperience.map(([title,copy],i)=><article key={title} className="rounded-[22px] border border-black/[.07] bg-white p-5 shadow-[0_12px_30px_rgba(55,39,22,.03)]">
              <div className="text-[8px] font-semibold text-[#B7793B]">0{i+1}</div>
              <h3 className="mt-5 text-[17px] font-semibold tracking-[-.02em] text-[#302B26]">{title}</h3>
              <p className="mt-2 text-[10px] leading-5 text-[#736D65]">{copy}</p>
            </article>)}
          </div>
        </div>
      </section>

      <section id="hr" className="border-b border-black/[.07] bg-[#ECE4D9]">
        <div className="mx-auto max-w-[1320px] px-5 py-16 sm:px-7 lg:px-10 lg:py-20">
          <div className="grid gap-8 lg:grid-cols-[.9fr_1.1fr]">
            <div>
              <div className="text-[9px] font-semibold uppercase tracking-[.2em] text-[#9A744B]">OWNER / HR CONTROL</div>
              <h2 className="mt-3 text-[40px] font-medium leading-[.98] tracking-[-.05em] sm:text-[54px]">See the person, the evidence and the business context together.</h2>
              <p className="mt-5 max-w-xl text-[13px] leading-7 text-[#6A635B]">Owner and HR should not review a passport in one system, employment in another and payroll in a third. Avantiqo keeps the review attached to the employee master and legal organization context.</p>
              <div className="mt-6 rounded-[22px] border border-[#B7793B]/20 bg-[#F6E9D7] p-5">
                <div className="text-[8px] font-semibold uppercase tracking-[.14em] text-[#95632E]">VISUAL REVIEW</div>
                <div className="mt-2 text-[12px] leading-6 text-[#635950]">Authorized Owner/HR users can visually review private passport, national-ID or work-permit evidence from the employee record instead of relying on filenames or detached uploads.</div>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {hrExperience.map(([title,copy])=><article key={title} className="rounded-[20px] border border-black/[.07] bg-[#F8F5EF] p-5">
                <h3 className="text-[15px] font-semibold text-[#302B26]">{title}</h3>
                <p className="mt-2 text-[9px] leading-5 text-[#736D65]">{copy}</p>
              </article>)}
            </div>
          </div>
        </div>
      </section>

      <section id="security" className="border-b border-black/[.07] bg-[#1D1A17] text-white">
        <div className="mx-auto max-w-[1320px] px-5 py-16 sm:px-7 lg:px-10 lg:py-20">
          <div className="grid gap-8 lg:grid-cols-[.8fr_1.2fr] lg:items-start">
            <div>
              <div className="text-[9px] font-semibold uppercase tracking-[.2em] text-[#D6A66A]">IDENTITY & SECURITY</div>
              <h2 className="mt-3 text-[40px] font-medium leading-[.98] tracking-[-.05em] sm:text-[54px]">A staff portal should know who the person is — not just their username.</h2>
              <p className="mt-5 max-w-xl text-[12px] leading-6 text-white/50">Identity, verified contact methods, private documents, legal-employer context and operational authority remain connected to the same governed staff record.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ["Verified contact","Email and phone verification remain tied to the authenticated staff identity."],
                ["Passport or National ID","Core identity evidence stays private, versioned and reviewable by authorized Owner/HR roles."],
                ["Optional work permit","When present, work-permit evidence remains connected to the correct legal employer."],
                ["Expiry visibility","Stored validity dates remain visible as valid, approaching expiry or expired."],
                ["Restricted storage","Identity evidence is treated as private business data, not public media."],
                ["Role-aware access","Staff, managers, HR and owners see the information and actions appropriate to their authority."],
              ].map(([title,copy])=><div key={title} className="rounded-[18px] border border-white/[.08] bg-white/[.035] p-4">
                <div className="text-[9px] font-semibold text-[#E6C18F]">{title}</div>
                <div className="mt-2 text-[8px] leading-4 text-white/42">{copy}</div>
              </div>)}
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-black/[.07] bg-[#F5EFE7]">
        <div className="mx-auto max-w-[1320px] px-5 py-16 sm:px-7 lg:px-10 lg:py-20">
          <div className="text-[9px] font-semibold uppercase tracking-[.2em] text-[#9A744B]">ONE RECORD · MANY WORKFLOWS</div>
          <h2 className="mt-3 max-w-4xl text-[40px] font-medium leading-[.98] tracking-[-.05em] sm:text-[54px]">The portal is useful because the rest of the business already knows the same person.</h2>
          <div className="mt-9 grid gap-2 md:grid-cols-5">
            {[
              ["Identity","Who this person is"],
              ["Employment","Where and for whom they work"],
              ["Workforce","Schedule, attendance, requests"],
              ["Eligibility","Documents + qualifications"],
              ["Pay","Compensation + payroll context"],
            ].map(([title,copy],i)=><div key={title} className="relative rounded-[18px] border border-black/[.07] bg-white p-4">
              <div className="text-[8px] font-semibold text-[#B7793B]">0{i+1}</div>
              <div className="mt-4 text-[12px] font-semibold text-[#3E3832]">{title}</div>
              <div className="mt-1 text-[8px] leading-4 text-[#7A7168]">{copy}</div>
              {i<4?<span className="absolute -right-2 top-1/2 hidden -translate-y-1/2 text-[#B7793B]/45 md:block">→</span>:null}
            </div>)}
          </div>
        </div>
      </section>

      <section className="bg-[#EAE1D5]">
        <div className="mx-auto grid max-w-[1320px] gap-8 px-5 py-18 sm:px-7 lg:grid-cols-[1fr_auto] lg:items-center lg:px-10 lg:py-24">
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-[.2em] text-[#9A744B]">STAFF PORTAL + WORKFORCE</div>
            <h2 className="mt-3 max-w-4xl text-[42px] font-medium leading-[.98] tracking-[-.05em] sm:text-[58px]">Give employees one place to work. Give HR one place to trust.</h2>
            <p className="mt-5 max-w-3xl text-[13px] leading-7 text-[#6A635B]">Staff Portal is the employee-facing surface of Avantiqo Workforce and People context. Employees join through their employer&apos;s governed staff access; they do not create the employer organization. Once authenticated, scheduling, attendance, requests, qualifications, payroll and operational work stay connected to the same staff identity.</p>
          </div>
          <div className="flex flex-col gap-2">
            <Link href="/products/workforce" className="inline-flex h-11 items-center justify-center rounded-full bg-[#171614] px-5 text-[10px] font-semibold text-white">Explore Workforce</Link>
            <Link href="/login?portal=staff" className="inline-flex h-11 items-center justify-center rounded-full border border-[#B7793B]/35 px-5 text-[10px] font-semibold text-[#76502E]">Staff Login</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
