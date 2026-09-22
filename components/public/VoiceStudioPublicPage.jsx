import PublicSiteHeader from "@/components/public/PublicSiteHeader";

function Arrow({ className = "" }) {
  return <svg aria-hidden="true" viewBox="0 0 20 20" className={className} fill="none"><path d="M4 10h11M11 6l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

const flow = [
  ["01", "Listen", "Live speech, uploaded audio, meetings, calls and recorded voice input."],
  ["02", "Transcribe", "Speech becomes text with language detection and optional vocabulary context."],
  ["03", "Understand", "The transcript returns to Avantiqo intelligence and the active business context."],
  ["04", "Respond", "Create a same-language spoken response when that language is certified."],
  ["05", "Act", "Book, schedule, follow up, create work and continue the governed business workflow."],
  ["06", "Record proof", "Keep transcript, execution state and evidence attached to the exact interaction."],
];

const applications = [
  ["Live conversations", "Receive and handle live spoken conversations while keeping the interaction attached to the correct business context.", "/art/voice-studio/real/live-call-headset.jpg"],
  ["Meetings & transcription", "Capture meetings and operational speech, detect language and create transcripts that remain attached to the work.", "/art/voice-studio/real/transcription-meeting.jpg"],
  ["Conversation understanding", "Use the transcript together with the active business context so Avantiqo understands what the speaker means and what matters next.", "/art/voice-studio/real/customer-service.jpg"],
  ["Spoken response & narration", "Create governed spoken output for replies, narration, accessibility and production workflows with controlled voice selection.", "/art/voice-studio/real/narration-microphone.jpg"],
  ["Secretary actions & telephony", "Use managed phone lines for inbound and outbound conversations, then schedule, follow up or continue an approved workflow.", "/art/voice-studio/real/phone-conversation.jpg"],
  ["Voice review & proof", "Review voice output, transcript, language, approval state and source evidence attached to the exact interaction.", "/art/voice-studio/real/hero-voice-studio.jpg"],
];

const specs = [
  ["SPEECH TO TEXT", "File transcription · async jobs · live call audio · language detection · vocabulary context · transcript safety"],
  ["TEXT TO SPEECH", "WAV output · speech-rate control · language / locale selection · governed voice profile selection · async generation"],
  ["REALTIME VOICE", "Continuous spoken turns · same-language replies · live conversation context · call deadlines · safe settlement"],
  ["LANGUAGES", "23 certified speech languages · detected / requested / locale resolution · no low-quality fallback for uncertified output"],
  ["VOICE LIBRARY", "Recorded voice references · profile selection · preview · checksums · speech/singing scopes · explicit consent basis"],
  ["TELEPHONY", "Managed phone lines · inbound / outbound · PSTN connection state · scheduling · secretary call workflows"],
  ["EXECUTION", "Owned/local-first STT and TTS paths · asynchronous execution · resumable provider jobs · usage settlement"],
  ["GOVERNANCE", "Organization scope · source lineage · consent evidence · immutable reference audio · proof attached to execution"],
];

export default function VoiceStudioPublicPage() {
  return (
    <main className="min-h-screen bg-[#F7F4EE] text-[#191816]">
      <PublicSiteHeader context="Voice Studio" audience="creative" />

      <section className="border-b border-black/[0.06] bg-[#F7F4EE]">
        <div className="mx-auto grid max-w-[1540px] lg:min-h-[650px] lg:grid-cols-[43%_57%]">
          <div className="flex items-center px-5 py-14 sm:px-7 lg:px-10 lg:py-16 xl:px-14">
            <div className="max-w-[610px]">
              <p className="text-[9px] font-semibold uppercase tracking-[.22em] text-[#9A7045]">AVANTIQO VOICE STUDIO</p>
              <h1 className="mt-4 text-[52px] font-medium leading-[.94] tracking-[-.062em] sm:text-[64px] lg:text-[70px]">Voice that listens, speaks and works.</h1>
              <p className="mt-5 text-[14px] font-medium text-[#5D5851]">Conversation connected to the business behind it.</p>
              <p className="mt-5 max-w-[560px] text-[12px] leading-6 text-[#6F6961]">Voice Studio connects speech recognition, spoken responses, live conversations, telephony and voice production to Avantiqo intelligence and governed business workflows. A conversation can become understanding, action and durable proof without being re-entered by hand.</p>
              <div className="mt-7 flex flex-wrap gap-2.5"><a href="/login" className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#171614] px-5 text-[10px] font-semibold text-white">Start with voice <Arrow className="h-3.5 w-3.5" /></a><a href="#voice-flow" className="inline-flex h-11 items-center rounded-xl border border-black/[0.09] bg-white px-5 text-[10px] font-semibold text-[#56514A]">See voice flow</a></div>
              <div className="mt-9 grid grid-cols-3 border-t border-black/[0.08] pt-5">{[["STT + TTS","Owned voice stack"],["23","Certified languages"],["CALL → ACTION","Business workflow"]].map(([v,l],i)=><div key={l} className={`${i?"border-l border-black/[0.08] pl-5":""}`}><div className="text-[18px] font-medium tracking-[-.04em] text-[#B17A42]">{v}</div><div className="mt-1 max-w-[120px] text-[6px] font-semibold uppercase leading-3 tracking-[.14em] text-[#8F887E]">{l}</div></div>)}</div>
            </div>
          </div>
          <div className="flex items-center p-5 sm:p-7 lg:pl-0 lg:pr-8">
            <div className="relative min-h-[520px] w-full overflow-hidden rounded-[22px] border border-black/[0.08] bg-[#171614] shadow-[0_28px_70px_rgba(55,36,20,.12)] lg:min-h-[560px]">
              <div className="absolute inset-0 bg-cover bg-center" style={{backgroundImage:"url(/art/voice-studio/real/hero-voice-studio.jpg)",filter:"saturate(.84) contrast(1.04) brightness(.92)"}} />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,7,6,.01),rgba(8,7,6,.05)_48%,rgba(8,7,6,.60))]" />
              <div className="absolute bottom-5 left-5 right-5 rounded-[16px] border border-white/[0.14] bg-black/[0.50] p-4 text-white backdrop-blur-xl"><div className="text-[7px] font-semibold uppercase tracking-[.18em] text-[#D6A66A]">ONE CONVERSATION · ONE BUSINESS CONTEXT</div><div className="mt-2 text-[10px] text-white/[0.62]">listen → transcribe → understand → respond → act → record proof</div></div>
            </div>
          </div>
        </div>
      </section>

      <section id="voice-flow" className="border-b border-black/[0.06] bg-[#FAF8F4]">
        <div className="mx-auto max-w-[1450px] px-5 py-16 sm:px-7 lg:px-10 lg:py-20">
          <div className="grid gap-5 lg:grid-cols-[.9fr_1.1fr] lg:items-end"><div><p className="text-[8px] font-semibold uppercase tracking-[.20em] text-[#9A744B]">THE VOICE OPERATING FLOW</p><h2 className="mt-2 text-[34px] font-medium leading-[1.02] tracking-[-.048em] sm:text-[42px]">From speech to action.</h2></div><p className="max-w-xl text-[10px] leading-5 text-[#777169] lg:justify-self-end">Voice is not treated as a media file at the edge of the platform. The transcript and reply stay attached to the organization, conversation, authority and work that follow.</p></div>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {flow.map(([n,t,d],i)=>{
              const images=[
                "/art/voice-studio/real/live-call-headset.jpg",
                "/art/voice-studio/real/transcription-meeting.jpg",
                "/art/voice-studio/real/customer-service.jpg",
                "/art/voice-studio/real/narration-microphone.jpg",
                "/art/voice-studio/real/phone-conversation.jpg",
                "/art/voice-studio/real/hero-voice-studio.jpg",
              ];
              return <article key={t} className="overflow-hidden rounded-[20px] border border-black/[0.07] bg-white">
                <div className="relative aspect-[16/9] overflow-hidden bg-[#171614]">
                  <div className="absolute inset-0 bg-cover bg-center" style={{backgroundImage:`url(${images[i]})`,filter:"saturate(.82) contrast(1.03) brightness(.92)"}}/>
                  <div className="absolute inset-0 bg-[#5A3A22]/[0.05] mix-blend-multiply"/>
                  <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_48%,rgba(0,0,0,.38))]"/>
                  <span className="absolute left-3 top-3 rounded-full border border-white/[0.18] bg-black/[0.38] px-2 py-1 text-[7px] text-white/[0.82]">{n}</span>
                </div>
                <div className="p-4"><h3 className="text-[13px] font-semibold text-[#2C2925]">{t}</h3><p className="mt-2 text-[8px] leading-4 text-[#787169]">{d}</p></div>
              </article>;
            })}
          </div>
        </div>
      </section>

      <section className="border-b border-black/[0.06] bg-[#F7F4EE]">
        <div className="mx-auto max-w-[1450px] px-5 py-16 sm:px-7 lg:px-10 lg:py-20">
          <p className="text-[8px] font-semibold uppercase tracking-[.20em] text-[#9A744B]">WHAT VOICE STUDIO DOES</p><h2 className="mt-2 max-w-3xl text-[36px] font-medium leading-[1.02] tracking-[-.05em] sm:text-[44px]">Speech becomes part of the operating system.</h2>
          <div className="mt-8 grid gap-3 md:grid-cols-2 lg:grid-cols-3">{applications.map(([name,copy,img],i)=><article key={name} className="overflow-hidden rounded-[22px] border border-black/[0.07] bg-white"><div className="relative aspect-[16/9] overflow-hidden"><div className="absolute inset-0 bg-cover bg-center" style={{backgroundImage:`url(${img})`,filter:"saturate(.82) contrast(1.03) brightness(.92)"}}/><div className="absolute inset-0 bg-[#5A3A22]/[0.06] mix-blend-multiply"/><div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_48%,rgba(0,0,0,.42))]"/><span className="absolute left-3 top-3 rounded-full border border-white/[0.20] bg-black/[0.35] px-2 py-1 text-[7px] text-white/[0.78]">0{i+1}</span></div><div className="p-5"><h3 className="text-[15px] font-semibold text-[#2C2925]">{name}</h3><p className="mt-2 text-[9px] leading-5 text-[#746D65]">{copy}</p></div></article>)}</div>
        </div>
      </section>

      <section className="bg-[#141311] text-white">
        <div className="mx-auto grid max-w-[1450px] gap-10 px-5 py-16 sm:px-7 lg:grid-cols-[.76fr_1.24fr] lg:px-10 lg:py-20">
          <div className="max-w-[470px]"><p className="text-[8px] font-semibold uppercase tracking-[.20em] text-[#D6A66A]">VOICE IDENTITY & CONSENT</p><h2 className="mt-4 text-[43px] font-medium leading-[.96] tracking-[-.055em] text-[#F3E4CF]">A voice reference is evidence, not a free-for-all.</h2><p className="mt-5 text-[10px] leading-5 text-white/[0.50]">Organizations can maintain recorded voice references with profile identity, checksum, use scope and explicit consent basis. References may be SELF, AUTHORIZED or LICENSED and can be scoped for speech or singing.</p><div className="mt-6 rounded-[16px] border border-[#D6A66A]/20 bg-[#D6A66A]/[0.05] p-4 text-[9px] leading-5 text-[#E6CFAB]/72">Voice cloning/reference identity exists in the runtime but remains visibly certification-gated where engine quality has not completed certification. The public product should not present uncertified cloning as finished capability.</div></div>
          <div className="grid gap-px overflow-hidden rounded-[24px] border border-white/[0.10] bg-white/[0.08] sm:grid-cols-2">{[["CONSENT BASIS","Self · authorized · licensed"],["USE SCOPE","Speech · singing"],["REFERENCE PROOF","Checksum · source metadata · consent evidence"],["DELIVERY PROFILE","Secretary · executive · warm · neutral"],["QUALITY STATE","Certification status stays explicit"],["ORGANIZATION LIBRARY","Profiles remain attached to the correct organization"]].map(([a,b])=><div key={a} className="min-h-[130px] bg-[#171614] p-5"><div className="text-[8px] font-semibold tracking-[.16em] text-[#D6A66A]">{a}</div><div className="mt-4 text-[10px] leading-5 text-white/[0.46]">{b}</div></div>)}</div>
        </div>
      </section>

      <section className="border-b border-black/[0.06] bg-[#FBF8F2]">
        <div className="mx-auto max-w-[1450px] px-5 py-16 sm:px-7 lg:px-10 lg:py-20">
          <div className="grid gap-8 lg:grid-cols-[.72fr_1.28fr] lg:items-end"><div><p className="text-[8px] font-semibold uppercase tracking-[.20em] text-[#9A744B]">TECHNICAL SPECIFICATION</p><h2 className="mt-3 max-w-[560px] text-[40px] font-medium leading-[.98] tracking-[-.052em] sm:text-[50px]">The system behind the conversation.</h2></div><p className="max-w-2xl text-[11px] leading-6 text-[#6E675F] lg:justify-self-end">Voice execution is governed by organization context, language policy, usage settlement, source lineage and explicit authority instead of being an isolated microphone feature.</p></div>
          <div className="mt-9 grid gap-px overflow-hidden rounded-[24px] border border-black/[0.08] bg-black/[0.08] md:grid-cols-2">{specs.map(([name,detail])=><div key={name} className="bg-[#F6F1E9] p-5 sm:p-6"><div className="text-[8px] font-semibold tracking-[.16em] text-[#9A6531]">{name}</div><p className="mt-3 text-[10px] leading-5 text-[#6D665E]">{detail}</p></div>)}</div>
        </div>
      </section>

      <section className="bg-[#F7F4EE]">
        <div className="mx-auto max-w-[1450px] px-5 py-16 sm:px-7 lg:px-10 lg:py-20"><div className="relative overflow-hidden rounded-[28px] border border-black/[0.08] bg-[#171614] px-6 py-14 text-center text-white sm:px-10 lg:py-16"><div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(214,166,106,.18),transparent_38%)]"/><div className="relative"><p className="text-[8px] font-semibold uppercase tracking-[.20em] text-[#D6A66A]">AVANTIQO VOICE STUDIO</p><h2 className="mx-auto mt-4 max-w-4xl text-[38px] font-medium leading-[1.01] tracking-[-.05em] text-[#F3E4CF] sm:text-[50px]">Let the conversation continue into the work.</h2><p className="mx-auto mt-4 max-w-xl text-[10px] leading-5 text-white/[0.46]">From spoken input to transcript, intelligence, response, business action and durable evidence in one governed flow.</p><a href="/login" className="mt-7 inline-flex h-11 items-center gap-2 rounded-xl bg-[#E4B36F] px-5 text-[10px] font-semibold text-[#17130E]">Enter Voice Studio <Arrow className="h-3.5 w-3.5" /></a></div></div></div>
      </section>
    </main>
  );
}
