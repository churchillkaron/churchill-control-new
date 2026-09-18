function GridLines({light=false}) {
  return <div className="absolute inset-0 opacity-[0.10]" style={{backgroundImage:`linear-gradient(${light?'rgba(91,65,38,.16)':'rgba(214,166,106,.15)'} 1px,transparent 1px),linear-gradient(90deg,${light?'rgba(91,65,38,.16)':'rgba(214,166,106,.15)'} 1px,transparent 1px)`,backgroundSize:"64px 64px"}} />;
}
function Photo({src,position="center",opacity=1,className=""}) { return <div className={`absolute inset-0 bg-cover ${className}`} style={{backgroundImage:`url(${src})`,backgroundPosition:position,opacity}}/>; }
function Label({children,dark=false}) { return <div className={`text-[7px] font-semibold uppercase tracking-[0.22em] ${dark?'text-[#9A744B]':'text-[#D6A66A]'}`}>{children}</div>; }
function GoldDot(){return <span className="h-1.5 w-1.5 rounded-full bg-[#D6A66A] shadow-[0_0_14px_rgba(214,166,106,.65)]"/>}
function Chip({children,dark=false}){return <span className={`rounded-full border px-2.5 py-1 text-[6px] font-semibold uppercase tracking-[.15em] ${dark?'border-black/[.08] bg-white/60 text-[#74685C]':'border-white/12 bg-white/[.035] text-white/54'}`}>{children}</span>}

function IntelligenceArt(){
  return <div className="absolute inset-0 overflow-hidden bg-[#0D0B09] text-white">
    <Photo src="/art/commercial-insights.jpg" position="center" opacity={.34}/><div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(10,8,6,.92),rgba(10,8,6,.35)_62%,rgba(10,8,6,.66))]"/><GridLines/>
    <div className="absolute left-[7%] top-[11%] max-w-[330px]"><Label>BUSINESS PARTNER</Label><div className="mt-4 text-[32px] font-medium leading-[1.03] tracking-[-.04em] text-white/92">Ask the business. See what needs attention.</div><div className="mt-5 text-[9px] leading-5 text-white/42">Evidence, context and controlled action in one operating picture.</div></div>
    <div className="absolute bottom-[9%] right-[6%] w-[52%] rounded-[26px] border border-[#D6A66A]/25 bg-[#18130E]/88 p-5 shadow-[0_30px_90px_rgba(0,0,0,.38)] backdrop-blur-xl"><div className="flex items-center justify-between"><Label>LIVE BUSINESS SIGNALS</Label><span className="text-[6px] tracking-[.16em] text-white/28">CONNECTED RECORDS</span></div><div className="mt-5 grid grid-cols-2 gap-2">{[["Cash","Healthy"],["Overdue invoices","12"],["Attendance","6 exceptions"],["Stock","2 risks"]].map(([a,b])=><div key={a} className="rounded-xl border border-white/[.07] bg-black/20 px-3 py-3"><div className="text-[7px] text-white/34">{a}</div><div className="mt-1 text-[11px] text-white/78">{b}</div></div>)}</div></div>
  </div>;
}

function DocumentsArt(){
  return <div className="absolute inset-0 overflow-hidden bg-[#EEE7DC] text-[#171614]"><Photo src="/art/commercial-integrations.jpg" opacity={.12}/><div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_15%,rgba(214,166,106,.24),transparent_32%),linear-gradient(135deg,rgba(247,242,234,.97),rgba(231,220,207,.94))]"/><GridLines light/>
    <div className="absolute left-[7%] top-[9%] bottom-[9%] w-[49%] rotate-[-1.4deg] rounded-[18px] border border-black/[.07] bg-[#FCFAF6] p-7 shadow-[0_35px_85px_rgba(50,36,20,.16)]"><div className="flex items-center justify-between"><Label dark>REAL BUSINESS PAPERWORK</Label><span className="text-[6px] uppercase tracking-[.16em] text-black/28">SOURCE DOCUMENT</span></div><div className="mt-8 h-px bg-black/[.08]"/><div className="mt-6 space-y-4">{[78,94,61,88,73].map((w,i)=><div key={i}><div className="h-[3px] rounded-full bg-black/[.08]" style={{width:`${w}%`}}/><div className="mt-2 h-[2px] rounded-full bg-[#D6A66A]/30" style={{width:`${Math.max(35,w-23)}%`}}/></div>)}</div><div className="absolute bottom-7 left-7 right-7 flex items-center justify-between border-t border-black/[.08] pt-4 text-[8px]"><span className="text-black/38">Invoice · receipt · contract · statement</span><span className="font-semibold text-[#8A633C]">CAPTURED</span></div></div>
    <div className="absolute right-[6%] top-[17%] w-[38%] rounded-[25px] border border-[#D6A66A]/28 bg-[#17130F] p-5 text-white shadow-[0_28px_85px_rgba(0,0,0,.26)]"><Label>DOCUMENT → WORK</Label><div className="mt-5 space-y-2">{[["READ","Extract the facts"],["VALIDATE","Check business context"],["ROUTE","Send to the right work"],["ACT","Approve · post · archive"]].map(([a,b],i)=><div key={a} className="grid grid-cols-[28px_1fr] items-center rounded-xl border border-white/[.07] bg-white/[.025] p-3"><span className="text-[7px] text-[#D6A66A]">0{i+1}</span><div><div className="text-[8px] font-semibold">{a}</div><div className="mt-1 text-[7px] text-white/35">{b}</div></div></div>)}</div></div>
  </div>;
}

function DeveloperArt({api=false}){
  const families=api?["FINANCE","DOCUMENTS","INTELLIGENCE","CREATIVE","OPERATIONS","PEOPLE"]:["BUSINESS DATA","CAPABILITIES","WORKFLOWS","WEBHOOKS","SDKs","EMBEDDED"];
  return <div className="absolute inset-0 overflow-hidden bg-[#0A0A09] text-white"><Photo src="/art/developer-work.jpg" position="54% center" opacity={.36}/><div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(9,8,7,.85),rgba(9,8,7,.34)_50%,rgba(9,8,7,.78)),linear-gradient(180deg,rgba(0,0,0,.06),rgba(0,0,0,.76))]"/><GridLines/>
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1000 700" preserveAspectRatio="none" aria-hidden="true"><path d="M105 160 C275 160 280 350 490 350 S720 155 900 155 M105 350 C280 350 320 350 490 350 S720 350 900 350 M105 540 C275 540 290 350 490 350 S715 545 900 545" fill="none" stroke="rgba(214,166,106,.32)" strokeWidth="1.15"/><circle cx="490" cy="350" r="58" fill="rgba(16,13,10,.88)" stroke="rgba(214,166,106,.55)" strokeWidth="1.4"/></svg>
    <div className="absolute left-[7%] top-[9%]"><Label>{api?"AVANTIQO API":"BUILD FABRIC"}</Label><div className="mt-3 max-w-[320px] text-[26px] leading-[1.04] tracking-[-.035em] text-white/90">{api?"Business capability, exposed cleanly.":"Build on real business capability — not another isolated tool."}</div></div>
    <div className="absolute left-1/2 top-1/2 flex h-[98px] w-[98px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-[#D6A66A]/45 bg-[#15110D] shadow-[0_0_55px_rgba(214,166,106,.15)]"><div className="text-center"><div className="text-[8px] font-semibold text-[#E5BC84]">AVANTIQO</div><div className="mt-1 text-[6px] tracking-[.15em] text-white/28">CONTEXT</div></div></div>
    <div className="absolute bottom-[9%] left-[7%] right-[7%] grid grid-cols-3 gap-2 sm:grid-cols-6">{families.map((x,i)=><div key={x} className="rounded-[14px] border border-white/[.08] bg-black/45 px-3 py-3 backdrop-blur-sm"><div className="text-[6px] text-[#D6A66A]">0{i+1}</div><div className="mt-2 text-[7px] leading-3 text-white/58">{x}</div></div>)}</div>
  </div>;
}

function ComputeArt(){
  return <div className="absolute inset-0 overflow-hidden bg-[#090A0B] text-white"><Photo src="/art/commercial-compute.jpg" position="center" opacity={.94}/><div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(4,5,6,.40),rgba(4,5,6,.10)_50%,rgba(4,5,6,.55)),linear-gradient(180deg,rgba(4,5,6,.10),rgba(4,5,6,.72))]"/><GridLines/>
    <div className="absolute left-[7%] top-[10%] max-w-[360px]"><Label>AVANTIQO COMPUTE</Label><div className="mt-4 text-[30px] font-medium leading-[1.02] tracking-[-.04em] text-white/92">Capacity should disappear behind the workload.</div><div className="mt-4 max-w-[300px] text-[8px] leading-5 text-white/38">Owned hardware first. Specialist capacity only when the job actually needs it.</div></div>
    <div className="absolute bottom-[9%] left-[7%] right-[7%] grid grid-cols-4 gap-2">{[["01","OWNED","Local capacity"],["02","QUEUE","Priority work"],["03","ELASTIC","Specialist hardware"],["04","IDLE","Rent spare capacity"]].map(([n,a,b])=><div key={a} className="rounded-[18px] border border-white/[.10] bg-[#111315]/78 p-4 shadow-[0_18px_50px_rgba(0,0,0,.22)] backdrop-blur-lg"><div className="text-[6px] text-[#D6A66A]">{n}</div><div className="mt-5 text-[9px] font-semibold">{a}</div><div className="mt-1 text-[7px] text-white/32">{b}</div></div>)}</div>
  </div>;
}

function PricingArt(){
  return <div className="absolute inset-0 overflow-hidden bg-[#0E0C0A] text-white"><div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_18%,rgba(214,166,106,.16),transparent_30%),linear-gradient(135deg,#15110D,#090807)]"/><GridLines/>
    <div className="absolute left-[7%] top-[9%]"><Label>ONE ACCOUNT · CLEAR ECONOMICS</Label><div className="mt-3 max-w-[440px] text-[29px] font-medium leading-[1.02] tracking-[-.04em] text-white/90">Four ways to buy value. No infrastructure complexity for normal business software.</div></div>
    <div className="absolute inset-x-[7%] bottom-[11%] grid grid-cols-2 gap-2">{[["01","BUSINESS PRODUCTS","Recurring","Run the business"],["02","CREATIVE","Project","Produce finished work"],["03","PLATFORM","Usage","APIs · compute · capability"],["04","ENTERPRISE","Custom","Rollout · migration · service"]].map(([n,a,b,c])=><div key={a} className="rounded-[22px] border border-[#D6A66A]/22 bg-[#17130F]/88 p-5 shadow-[0_20px_60px_rgba(0,0,0,.20)]"><div className="flex items-center justify-between"><span className="text-[7px] text-[#D6A66A]">{n}</span><span className="text-[6px] uppercase tracking-[.15em] text-white/24">{b}</span></div><div className="mt-5 text-[14px] text-white/84">{a}</div><div className="mt-2 text-[7px] text-white/35">{c}</div><div className="mt-5 h-px bg-white/[.07]"><div className="h-px w-[64%] bg-[#D6A66A]/70"/></div></div>)}</div>
  </div>;
}

function SolutionsArt(){
  const tiles=[["RESTAURANT","/churchill/3.jpg","center"],["HOTEL","/art/commercial-enterprise.jpg","center"],["RETAIL","/art/commercial-commerce.jpg","center"],["SERVICES","/art/commercial-services.jpg","center"]];
  return <div className="absolute inset-0 overflow-hidden bg-[#110E0B] text-white"><div className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-px bg-[#D6A66A]/18">{tiles.map(([label,img,pos],i)=><div key={label} className="relative overflow-hidden"><Photo src={img} position={pos}/><div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,6,5,.05),rgba(8,6,5,.54))]"/><div className="absolute bottom-4 left-4 flex items-center gap-2"><GoldDot/><span className="text-[7px] font-semibold tracking-[.18em] text-[#F0C98F]">0{i+1} · {label}</span></div></div>)}</div>
    <div className="absolute left-1/2 top-1/2 w-[52%] -translate-x-1/2 -translate-y-1/2 rounded-[28px] border border-[#D6A66A]/34 bg-[#15110D]/92 p-6 text-center shadow-[0_36px_100px_rgba(0,0,0,.44)] backdrop-blur-xl"><Label>ONE BUSINESS CONTEXT</Label><div className="mt-4 text-[23px] leading-7 text-white/90">Different industries. The same connected company truth.</div><div className="mt-5 flex flex-wrap justify-center gap-2">{["PEOPLE","MONEY","CUSTOMERS","STOCK","WORK","INTELLIGENCE"].map(x=><Chip key={x}>{x}</Chip>)}</div></div>
  </div>;
}

function CreativeArt(){
  return <div className="absolute inset-0 overflow-hidden bg-[#0E0C0A] text-white">
    <div className="absolute inset-0 grid grid-cols-[1.25fr_.75fr] gap-px bg-[#D6A66A]/25">
      <div className="relative overflow-hidden"><Photo src="/art/creative-video.jpg" position="center"/><div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,6,5,.04),rgba(8,6,5,.72))]"/><div className="absolute left-5 top-5"><Label>VIDEO · STORY · MOTION</Label></div><div className="absolute bottom-5 left-5 right-5 text-[17px] leading-5 text-white/88">Professional production from direction to finished master.</div></div>
      <div className="grid grid-rows-2 gap-px bg-[#D6A66A]/25"><div className="relative overflow-hidden"><Photo src="/art/creative-image.jpg"/><div className="absolute inset-0 bg-black/28"/><div className="absolute bottom-4 left-4"><Label>IMAGE STUDIO</Label></div></div><div className="relative overflow-hidden"><Photo src="/art/creative-music.jpg"/><div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,.04),rgba(0,0,0,.58))]"/><div className="absolute bottom-4 left-4"><Label>MUSIC STUDIO</Label></div></div></div>
    </div>
    <div className="absolute bottom-[7%] left-[8%] right-[8%] rounded-[20px] border border-white/[.13] bg-[#15120F]/78 px-5 py-4 shadow-[0_26px_70px_rgba(0,0,0,.28)] backdrop-blur-xl"><div className="flex items-center justify-between gap-6"><div><Label>CREATIVE INTELLIGENCE</Label><div className="mt-2 text-[10px] text-white/62">Research → direction → production → critique → repair → delivery.</div></div><div className="hidden gap-2 sm:flex">{["IMAGE","VIDEO","MUSIC"].map(x=><Chip key={x}>{x}</Chip>)}</div></div></div>
  </div>;
}


function FinanceArt(){
  return <div className="absolute inset-0 overflow-hidden bg-[#0D0C0A] text-white">
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_16%,rgba(214,166,106,.18),transparent_30%),linear-gradient(135deg,#15120F,#0A0908)]"/><GridLines/>
    <div className="absolute left-[7%] top-[9%] max-w-[360px]"><Label>FINANCE CONTROL</Label><div className="mt-4 text-[30px] font-medium leading-[1.02] tracking-[-.04em] text-white/92">From source document to cash, ledger and close.</div></div>
    <div className="absolute left-[7%] right-[7%] top-[38%] grid grid-cols-4 gap-2">
      {[["RECEIVABLES","THB 428K","18 open"],["PAYABLES","THB 191K","7 due"],["BANK","MATCHED","96%"],["CLOSE","READY","4 checks"]].map(([a,b,c],i)=><div key={a} className="rounded-[18px] border border-white/[.08] bg-white/[.025] p-4"><div className="text-[6px] text-[#D6A66A]">0{i+1}</div><div className="mt-4 text-[7px] tracking-[.13em] text-white/42">{a}</div><div className="mt-2 text-[13px] text-white/84">{b}</div><div className="mt-1 text-[7px] text-white/28">{c}</div></div>)}
    </div>
    <div className="absolute bottom-[9%] left-[7%] right-[7%] rounded-[20px] border border-[#D6A66A]/22 bg-[#17130F]/88 p-4 backdrop-blur-xl"><div className="flex items-center gap-3">{["CAPTURE","APPROVE","SETTLE","POST","REPORT"].map((x,i)=><div key={x} className="flex flex-1 items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-[#D6A66A]"/><span className="text-[6px] tracking-[.13em] text-white/48">{x}</span>{i<4?<span className="ml-auto text-[#D6A66A]/45">→</span>:null}</div>)}</div></div>
  </div>;
}

function WorkforceArt(){
  return <div className="absolute inset-0 overflow-hidden bg-[#11100E] text-white">
    <Photo src="/art/avantiqo-luxury/people.webp" position="center" opacity={.82}/>
    <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(9,8,7,.78),rgba(9,8,7,.18)_52%,rgba(9,8,7,.50)),linear-gradient(180deg,rgba(0,0,0,.02),rgba(0,0,0,.70))]"/>
    <div className="absolute left-[7%] top-[9%] max-w-[350px]"><Label>PEOPLE & WORK</Label><div className="mt-4 text-[29px] font-medium leading-[1.02] tracking-[-.04em] text-white/94">Schedule the team. Capture the work. Pay correctly.</div></div>
    <div className="absolute bottom-[9%] left-[7%] right-[7%] grid grid-cols-4 gap-2">{[["PLAN","Roster"],["ARRIVE","Clock in"],["REVIEW","Exceptions"],["PAY","Payroll"]].map(([a,b],i)=><div key={a} className="rounded-[16px] border border-white/[.10] bg-black/48 p-4 backdrop-blur-md"><div className="text-[6px] text-[#D6A66A]">0{i+1}</div><div className="mt-4 text-[9px]">{a}</div><div className="mt-1 text-[7px] text-white/34">{b}</div></div>)}</div>
  </div>;
}

function InventoryArt(){
  const items=[["OLIVE OIL","12.4 L","68%"],["BEEF","18.2 KG","41%"],["WINE","36 BT","77%"],["HERBS","4.8 KG","54%"],["SEAFOOD","8.1 KG","31%"],["DRY GOODS","24 UN","83%"]];
  return <div className="absolute inset-0 overflow-hidden bg-[#120F0B] text-white">
    <Photo src="/churchill/bar.JPG" position="center" opacity={.30}/><div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(11,8,6,.93),rgba(11,8,6,.55)_58%,rgba(11,8,6,.86))]"/><GridLines/>
    <div className="absolute left-[7%] top-[9%] max-w-[350px]"><Label>STOCK & FOOD COST</Label><div className="mt-4 text-[29px] font-medium leading-[1.02] tracking-[-.04em] text-white/92">Know what you have. Know what every dish costs.</div></div>
    <div className="absolute inset-x-[7%] bottom-[9%] grid grid-cols-3 gap-2">{items.map(([a,b,w],i)=><div key={a} className="rounded-[15px] border border-white/[.08] bg-black/42 p-3 backdrop-blur-md"><div className="flex items-center justify-between"><span className="text-[6px] tracking-[.12em] text-white/36">{a}</span><span className="text-[6px] text-[#D6A66A]">0{i+1}</span></div><div className="mt-2 text-[10px] text-white/78">{b}</div><div className="mt-3 h-[2px] bg-white/[.07]"><div className="h-full bg-[#D6A66A]/70" style={{width:w}}/></div></div>)}</div>
  </div>;
}

function RestaurantArt(){
  return <div className="absolute inset-0 overflow-hidden bg-[#0F0C09] text-white">
    <Photo src="/art/avantiqo-luxury/hospitality.webp" position="center" opacity={.92}/><div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(8,6,4,.62),rgba(8,6,4,.10)_55%,rgba(8,6,4,.52)),linear-gradient(180deg,rgba(0,0,0,.01),rgba(0,0,0,.68))]"/>
    <div className="absolute left-[7%] top-[9%] max-w-[360px]"><Label>RESTAURANT OPERATING SYSTEM</Label><div className="mt-4 text-[30px] font-medium leading-[1.02] tracking-[-.04em] text-white/94">Service, kitchen, stock, people and finance — one operating picture.</div></div>
    <div className="absolute bottom-[9%] left-[7%] right-[7%] grid grid-cols-5 gap-2">{["SERVICE","POS","KITCHEN","STOCK","FINANCE"].map((x,i)=><div key={x} className="rounded-[15px] border border-white/[.10] bg-black/48 px-3 py-4 backdrop-blur-md"><div className="text-[6px] text-[#D6A66A]">0{i+1}</div><div className="mt-3 text-[7px] tracking-[.11em] text-white/64">{x}</div></div>)}</div>
  </div>;
}

function HotelArt(){
  return <div className="absolute inset-0 overflow-hidden bg-[#11100E] text-white">
    <Photo src="/art/commercial-enterprise.jpg" position="center" opacity={.78}/><div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(9,8,7,.83),rgba(9,8,7,.24)_58%,rgba(9,8,7,.52)),linear-gradient(180deg,rgba(0,0,0,.02),rgba(0,0,0,.68))]"/>
    <div className="absolute left-[7%] top-[9%] max-w-[350px]"><Label>HOTEL OPERATIONS</Label><div className="mt-4 text-[29px] font-medium leading-[1.02] tracking-[-.04em] text-white/94">Guest, room and property operations in one connected flow.</div></div>
    <div className="absolute bottom-[9%] left-[7%] right-[7%] grid grid-cols-4 gap-2">{[["ARRIVALS","12 today"],["ROOMS","94% ready"],["HOUSEKEEPING","6 active"],["REVENUE","Live"]].map(([a,b],i)=><div key={a} className="rounded-[16px] border border-white/[.10] bg-black/42 p-4 backdrop-blur-md"><div className="text-[6px] text-[#D6A66A]">0{i+1}</div><div className="mt-4 text-[7px] text-white/40">{a}</div><div className="mt-1 text-[10px] text-white/78">{b}</div></div>)}</div>
  </div>;
}

function CommerceArt(){
  return <div className="absolute inset-0 overflow-hidden bg-[#140F0A] text-white"><Photo src="/churchill/bar.JPG" position="center" opacity={.88}/><div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(10,7,5,.50),rgba(10,7,5,.10)_54%,rgba(10,7,5,.58)),linear-gradient(180deg,rgba(0,0,0,.04),rgba(0,0,0,.70))]"/>
    <div className="absolute left-[7%] top-[10%] max-w-[330px]"><Label>REAL COMMERCE</Label><div className="mt-4 text-[29px] font-medium leading-[1.02] tracking-[-.04em]">The customer experience and the books should tell the same story.</div></div>
    <div className="absolute bottom-[9%] left-[7%] right-[7%] grid grid-cols-4 gap-2">{[["SELL","Order · booking"],["PAY","Cash · card · QR"],["SETTLE","Match transaction"],["POST","Finance updated"]].map(([a,b],i)=><div key={a} className="rounded-[16px] border border-white/[.10] bg-black/52 p-4 backdrop-blur-md"><div className="text-[6px] text-[#D6A66A]">0{i+1}</div><div className="mt-4 text-[9px]">{a}</div><div className="mt-1 text-[7px] text-white/34">{b}</div></div>)}</div>
  </div>;
}

function ChannelsArt(){
  return <div className="absolute inset-0 overflow-hidden bg-[#EFE7DC] text-[#171614]"><div className="absolute inset-0 grid grid-cols-[1.2fr_.8fr] gap-px bg-[#D6A66A]/20"><div className="relative"><Photo src="/churchill/1.jpg" position="center"/><div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,.02),rgba(0,0,0,.54))]"/><div className="absolute bottom-5 left-5"><Label>REAL BUSINESS SURFACE</Label><div className="mt-2 max-w-[330px] text-[20px] leading-6 text-white">Customer, staff and public experiences — one underlying business.</div></div></div><div className="grid grid-rows-3 gap-px bg-[#D6A66A]/20">{[["PUBLIC","Website · booking"],["STAFF","Mobile · kiosk · POS"],["EMBEDDED","Portal · widgets · partners"]].map(([a,b],i)=><div key={a} className="flex flex-col justify-between bg-[#F8F3EB] p-5"><span className="text-[7px] text-[#A37849]">0{i+1}</span><div><div className="text-[9px] font-semibold">{a}</div><div className="mt-2 text-[7px] text-black/38">{b}</div></div></div>)}</div></div></div>;
}


function AgentsArt(){
  return <div className="absolute inset-0 overflow-hidden bg-[#0D0B09] text-white"><GridLines/><div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(214,166,106,.16),transparent_34%)]"/>
    <div className="absolute left-[7%] top-[9%] max-w-[350px]"><Label>CONTROLLED AGENTS</Label><div className="mt-4 text-[29px] font-medium leading-[1.02] tracking-[-.04em] text-white/92">Automation should earn authority one exact action at a time.</div></div>
    <div className="absolute left-1/2 top-[53%] flex h-[88px] w-[88px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-[#D6A66A]/45 bg-[#17130F] shadow-[0_0_60px_rgba(214,166,106,.14)]"><div className="text-center"><div className="text-[8px] font-semibold text-[#E6BE87]">AGENT</div><div className="mt-1 text-[6px] tracking-[.14em] text-white/26">SCOPED</div></div></div>
    <div className="absolute inset-x-[7%] bottom-[9%] grid grid-cols-4 gap-2">{[["CONTEXT","Org · role · records"],["PREPARE","Research · plan"],["AUTHORIZE","Capability · approval"],["VERIFY","Result · proof"]].map(([a,b],i)=><div key={a} className="rounded-[16px] border border-white/[.08] bg-white/[.025] p-4"><div className="text-[6px] text-[#D6A66A]">0{i+1}</div><div className="mt-4 text-[8px] font-semibold tracking-[.11em]">{a}</div><div className="mt-2 text-[6px] text-white/30">{b}</div></div>)}</div>
  </div>;
}

function InsightsArt(){
  const bars=[42,58,51,74,67,88,79,96];
  return <div className="absolute inset-0 overflow-hidden bg-[#0E0C0A] text-white"><div className="absolute inset-0 bg-[radial-gradient(circle_at_74%_14%,rgba(214,166,106,.16),transparent_32%)]"/><GridLines/>
    <div className="absolute left-[7%] top-[9%] max-w-[360px]"><Label>DECISION INTELLIGENCE</Label><div className="mt-4 text-[30px] font-medium leading-[1.02] tracking-[-.04em] text-white/92">See the change. Understand the cause. Decide what matters next.</div></div>
    <div className="absolute right-[7%] top-[18%] h-[38%] w-[44%] rounded-[22px] border border-white/[.08] bg-white/[.025] p-5"><div className="flex h-full items-end gap-2">{bars.map((h,i)=><div key={i} className="flex-1 rounded-t bg-[#D6A66A]/55" style={{height:`${h}%`}}/>)}</div></div>
    <div className="absolute inset-x-[7%] bottom-[9%] grid grid-cols-4 gap-2">{[["OBSERVE","Current truth"],["DETECT","Exception"],["INTERPRET","Cause · forecast"],["ACT","Priority next step"]].map(([a,b],i)=><div key={a} className="rounded-[16px] border border-white/[.08] bg-[#17130F]/82 p-4"><div className="text-[6px] text-[#D6A66A]">0{i+1}</div><div className="mt-4 text-[8px]">{a}</div><div className="mt-1 text-[6px] text-white/30">{b}</div></div>)}</div>
  </div>;
}

function IntegrationsArt(){
  const nodes=[["MESSAGE","WhatsApp · Email"],["PAYMENT","Card · QR · Bank"],["DOCUMENT","OCR · Files"],["MARKETING","Ads · Social"]];
  return <div className="absolute inset-0 overflow-hidden bg-[#0C0B09] text-white"><GridLines/><div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(214,166,106,.16),transparent_30%)]"/>
    <div className="absolute left-[7%] top-[9%] max-w-[360px]"><Label>CONNECTED SERVICES</Label><div className="mt-4 text-[29px] font-medium leading-[1.02] tracking-[-.04em] text-white/92">External services should return to the workflow they started from.</div></div>
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1000 700" preserveAspectRatio="none" aria-hidden="true"><path d="M140 440 C300 440 340 360 500 360 S710 440 860 440" fill="none" stroke="rgba(214,166,106,.35)" strokeWidth="1.2"/><path d="M500 245 V515" stroke="rgba(214,166,106,.24)" strokeWidth="1.1"/><circle cx="500" cy="360" r="52" fill="rgba(23,19,15,.92)" stroke="rgba(214,166,106,.50)" strokeWidth="1.3"/></svg>
    <div className="absolute left-1/2 top-[51%] -translate-x-1/2 -translate-y-1/2 text-center"><div className="text-[8px] font-semibold text-[#E5BC84]">AVANTIQO</div><div className="mt-1 text-[6px] tracking-[.14em] text-white/26">WORKFLOW</div></div>
    <div className="absolute inset-x-[7%] bottom-[8%] grid grid-cols-4 gap-2">{nodes.map(([a,b],i)=><div key={a} className="rounded-[16px] border border-white/[.08] bg-black/38 p-4"><div className="text-[6px] text-[#D6A66A]">0{i+1}</div><div className="mt-4 text-[8px]">{a}</div><div className="mt-1 text-[6px] text-white/30">{b}</div></div>)}</div>
  </div>;
}


function EnterpriseArt(){
  return <div className="absolute inset-0 overflow-hidden bg-[#0E0C0A] text-white"><GridLines/><div className="absolute inset-0 bg-[radial-gradient(circle_at_74%_18%,rgba(214,166,106,.16),transparent_32%)]"/>
    <div className="absolute left-[7%] top-[9%] max-w-[370px]"><Label>ENTERPRISE OPERATING LAYER</Label><div className="mt-4 text-[30px] font-medium leading-[1.02] tracking-[-.04em] text-white/92">One operating model across entities, locations and teams.</div></div>
    <div className="absolute left-[8%] right-[8%] top-[38%] grid grid-cols-4 gap-3">{[["GROUP","Portfolio"],["ENTITY","Legal scope"],["LOCATION","Operating scope"],["TEAM","Permissions"]].map(([a,b],i)=><div key={a} className="rounded-[20px] border border-white/[.08] bg-[#17130F]/82 p-5 shadow-[0_18px_50px_rgba(0,0,0,.16)]"><div className="text-[6px] text-[#D6A66A]">0{i+1}</div><div className="mt-5 text-[9px] font-semibold tracking-[.12em]">{a}</div><div className="mt-1 text-[7px] text-white/30">{b}</div></div>)}</div>
    <div className="absolute bottom-[9%] left-[8%] right-[8%] flex items-center gap-3 rounded-[18px] border border-[#D6A66A]/22 bg-white/[.025] px-4 py-3"><GoldDot/><span className="text-[7px] tracking-[.14em] text-white/44">SHARED GOVERNANCE · PORTFOLIO VISIBILITY · CONTROLLED AUTOMATION</span></div>
  </div>;
}

function PartnersArt(){
  return <div className="absolute inset-0 overflow-hidden bg-[#100D0A] text-white"><div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(214,166,106,.15),transparent_36%)]"/><GridLines/>
    <div className="absolute left-[7%] top-[9%] max-w-[370px]"><Label>PARTNER NETWORK</Label><div className="mt-4 text-[29px] font-medium leading-[1.02] tracking-[-.04em] text-white/92">One trusted relationship. Many separately controlled client organizations.</div></div>
    <div className="absolute left-[8%] right-[8%] top-[41%] grid grid-cols-[.85fr_1.3fr_.85fr] gap-3">
      <div className="rounded-[18px] border border-white/[.08] bg-white/[.025] p-5"><div className="text-[7px] text-[#D6A66A]">PARTNER</div><div className="mt-5 text-[9px] text-white/72">Accounting · Agency · Consultant</div></div>
      <div className="rounded-[22px] border border-[#D6A66A]/32 bg-[#18130E] p-5 text-center shadow-[0_0_55px_rgba(214,166,106,.11)]"><div className="text-[8px] font-semibold text-[#E4BB83]">AVANTIQO PORTFOLIO</div><div className="mt-2 text-[7px] text-white/32">Shared delivery · separate data</div></div>
      <div className="rounded-[18px] border border-white/[.08] bg-white/[.025] p-5"><div className="text-[7px] text-[#D6A66A]">CLIENTS</div><div className="mt-5 text-[9px] text-white/72">Org A · Org B · Org C</div></div>
    </div>
    <div className="absolute bottom-[9%] left-[8%] right-[8%] grid grid-cols-4 gap-2">{["ADVISE","IMPLEMENT","OPERATE","IMPROVE"].map((x,i)=><div key={x} className="border-t border-white/[.10] pt-3 text-[7px] tracking-[.12em] text-white/42"><span className="mr-2 text-[#D6A66A]">0{i+1}</span>{x}</div>)}</div>
  </div>;
}

function ServicesArt(){
  return <div className="absolute inset-0 overflow-hidden bg-[#F1EADF] text-[#171614]"><div className="absolute inset-0 bg-[radial-gradient(circle_at_76%_16%,rgba(214,166,106,.24),transparent_32%)]"/><GridLines light/>
    <div className="absolute left-[7%] top-[9%] max-w-[380px]"><Label dark>IMPLEMENTATION</Label><div className="mt-4 text-[29px] font-medium leading-[1.02] tracking-[-.04em]">From operating reality to verified go-live.</div></div>
    <div className="absolute inset-x-[7%] bottom-[12%] grid grid-cols-4 gap-3">{[["DISCOVER","Entities · processes"],["MIGRATE","Data · opening truth"],["CONFIGURE","Roles · approvals"],["LAUNCH","Train · verify"]].map(([a,b],i)=><div key={a} className="rounded-[20px] border border-black/[.08] bg-white/72 p-5 shadow-[0_18px_45px_rgba(60,42,24,.08)]"><div className="text-[7px] font-semibold text-[#9A744B]">0{i+1}</div><div className="mt-6 text-[9px] font-semibold tracking-[.11em]">{a}</div><div className="mt-2 text-[7px] text-black/36">{b}</div><div className="mt-5 h-px bg-black/[.07]"><div className="h-px bg-[#D6A66A]" style={{width:`${35+i*18}%`}}/></div></div>)}</div>
  </div>;
}

function MarketplaceArt(){
  return <div className="absolute inset-0 overflow-hidden bg-[#0E0C0A] text-white"><GridLines/><div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_18%,rgba(214,166,106,.14),transparent_30%)]"/>
    <div className="absolute left-[7%] top-[9%] max-w-[370px]"><Label>AVANTIQO MARKETPLACE</Label><div className="mt-4 text-[30px] font-medium leading-[1.02] tracking-[-.04em] text-white/92">Specialist capability, available exactly where the business needs it.</div></div>
    <div className="absolute inset-x-[7%] bottom-[10%] grid grid-cols-2 gap-2">{[["CAPABILITY","Focused business action"],["AGENT","Repeatable intelligent work"],["SOLUTION","Industry operating pack"],["COMPUTE","Specialist capacity"]].map(([a,b],i)=><div key={a} className="rounded-[20px] border border-white/[.08] bg-[#17130F]/82 p-5"><div className="flex items-center justify-between"><span className="text-[7px] text-[#D6A66A]">0{i+1}</span><span className="text-[6px] tracking-[.13em] text-white/22">AVAILABLE</span></div><div className="mt-5 text-[11px] text-white/80">{a}</div><div className="mt-2 text-[7px] text-white/30">{b}</div></div>)}</div>
  </div>;
}

function PortfolioArt({kind}){
  const cfg={
    enterprise:["PORTFOLIO CONTROL","Scale without losing control.",["GROUP","ENTITIES","LOCATIONS","TEAMS"]],
    partners:["PARTNER NETWORK","One trusted relationship can serve many businesses.",["ADVISE","IMPLEMENT","OPERATE","IMPROVE"]],
    services:["IMPLEMENTATION","From operating reality to a verified go-live.",["DISCOVER","MIGRATE","CONFIGURE","LAUNCH"]],
    marketplace:["MARKETPLACE","Specialist capability, available when the business needs it.",["CAPABILITY","AGENT","SOLUTION","COMPUTE"]],
    agents:["CONTROLLED AGENTS","Useful automation with evidence and permission.",["CONTEXT","PREPARE","AUTHORIZE","VERIFY"]],
    insights:["DECISION INTELLIGENCE","Signals before dashboards.",["OBSERVE","DETECT","INTERPRET","ACT"]],
    integrations:["CONNECTED SERVICES","External services become part of the workflow.",["TRIGGER","CONTEXT","PROVIDER","RESULT"]],
  }[kind]||["AVANTIQO","Connected business capability.",["CONTEXT","WORK","ACTION","RESULT"]];
  const photo=kind==="enterprise"?"/art/commercial-enterprise.jpg":kind==="services"?"/art/commercial-start.jpg":kind==="partners"?"/art/commercial-services.jpg":kind==="marketplace"?"/art/commercial-marketplace.jpg":kind==="integrations"?"/art/commercial-integrations.jpg":"/art/commercial-insights.jpg";
  return <div className="absolute inset-0 overflow-hidden bg-[#100D0A] text-white"><Photo src={photo} position="center" opacity={.72}/><div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(9,7,5,.88),rgba(9,7,5,.25)_60%,rgba(9,7,5,.64)),linear-gradient(180deg,rgba(0,0,0,.02),rgba(0,0,0,.72))]"/><GridLines/>
    <div className="absolute left-[7%] top-[10%] max-w-[390px]"><Label>{cfg[0]}</Label><div className="mt-4 text-[30px] font-medium leading-[1.02] tracking-[-.04em] text-white/92">{cfg[1]}</div></div>
    <div className="absolute bottom-[9%] left-[7%] right-[7%] grid grid-cols-4 gap-2">{cfg[2].map((a,i)=><div key={a} className="rounded-[17px] border border-white/[.09] bg-[#15110D]/74 p-4 backdrop-blur-lg"><div className="text-[6px] text-[#D6A66A]">0{i+1}</div><div className="mt-5 text-[8px] font-semibold tracking-[.11em]">{a}</div></div>)}</div>
  </div>;
}

function VoiceArt(){return <div className="absolute inset-0 overflow-hidden bg-[#0D0B09] text-white"><GridLines/><div className="absolute left-[8%] top-[12%] right-[8%] rounded-[28px] border border-white/[.09] bg-white/[.025] p-6"><Label>VOICE → WORK</Label><div className="mt-8 flex h-24 items-center gap-1">{[24,48,76,39,88,55,31,68,42,81,51,29,64,37,73,45,86,58].map((h,i)=><span key={i} className="flex-1 rounded-full bg-[#D6A66A]/70" style={{height:h}}/>)}</div></div><div className="absolute bottom-[10%] left-[8%] right-[8%] flex gap-2">{["LISTEN","UNDERSTAND","AUTHORIZE","RESULT"].map((x,i)=><div key={x} className="flex-1 rounded-xl border border-white/[.08] p-4"><span className="text-[6px] text-[#D6A66A]">0{i+1}</span><div className="mt-2 text-[8px] text-white/55">{x}</div></div>)}</div></div>}

export default function PublicArtStage({kind="intelligence"}){
  if(kind==="documents") return <DocumentsArt/>;
  if(kind==="developer"||kind==="code") return <DeveloperArt/>;
  if(kind==="api") return <DeveloperArt api/>;
  if(kind==="compute") return <ComputeArt/>;
  if(kind==="pricing") return <PricingArt/>;
  if(kind==="solutions") return <SolutionsArt/>;
  if(kind==="finance") return <FinanceArt/>;
  if(kind==="workforce") return <WorkforceArt/>;
  if(kind==="inventory") return <InventoryArt/>;
  if(kind==="restaurant") return <RestaurantArt/>;
  if(kind==="hotel") return <HotelArt/>;
  if(kind==="commerce") return <CommerceArt/>;
  if(kind==="creative") return <CreativeArt/>;
  if(kind==="channels") return <ChannelsArt/>;
  if(kind==="voice") return <VoiceArt/>;
  if(kind==="agents") return <AgentsArt/>;
  if(kind==="insights") return <InsightsArt/>;
  if(kind==="integrations") return <IntegrationsArt/>;
  if(kind==="enterprise") return <EnterpriseArt/>;
  if(kind==="partners") return <PartnersArt/>;
  if(kind==="services") return <ServicesArt/>;
  if(kind==="marketplace") return <MarketplaceArt/>;
  return <IntelligenceArt/>;
}
