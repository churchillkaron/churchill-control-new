const CONTRACT="AVANTIQO_MUSIC_PICTURE_LOCK_V1";
function text(v){return String(v??"").trim();}
function finite(v,f=null){const n=Number(v);return Number.isFinite(n)?n:f;}
function canonical(value){if(Array.isArray(value))return value.map(canonical);if(!value||typeof value!=="object")return value;return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));}
function sha256Hex(input){
  const bytes=new TextEncoder().encode(String(input??""));
  const bitLength=bytes.length*8;
  const paddedLength=Math.ceil((bytes.length+9)/64)*64;
  const data=new Uint8Array(paddedLength);
  data.set(bytes);
  data[bytes.length]=0x80;
  const view=new DataView(data.buffer);
  const high=Math.floor(bitLength/0x100000000);
  const low=bitLength>>>0;
  view.setUint32(paddedLength-8,high,false);
  view.setUint32(paddedLength-4,low,false);
  const K=[
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
  ];
  const H=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  const rotr=(x,n)=>(x>>>n)|(x<<(32-n));
  const w=new Uint32Array(64);
  for(let offset=0;offset<data.length;offset+=64){
    for(let i=0;i<16;i++) w[i]=view.getUint32(offset+i*4,false);
    for(let i=16;i<64;i++){
      const s0=(rotr(w[i-15],7)^rotr(w[i-15],18)^(w[i-15]>>>3))>>>0;
      const s1=(rotr(w[i-2],17)^rotr(w[i-2],19)^(w[i-2]>>>10))>>>0;
      w[i]=(w[i-16]+s0+w[i-7]+s1)>>>0;
    }
    let [a,b,c,d,e,f,g,h]=H;
    for(let i=0;i<64;i++){
      const S1=(rotr(e,6)^rotr(e,11)^rotr(e,25))>>>0;
      const ch=((e&f)^((~e)&g))>>>0;
      const temp1=(h+S1+ch+K[i]+w[i])>>>0;
      const S0=(rotr(a,2)^rotr(a,13)^rotr(a,22))>>>0;
      const maj=((a&b)^(a&c)^(b&c))>>>0;
      const temp2=(S0+maj)>>>0;
      h=g;g=f;f=e;e=(d+temp1)>>>0;d=c;c=b;b=a;a=(temp1+temp2)>>>0;
    }
    H[0]=(H[0]+a)>>>0;H[1]=(H[1]+b)>>>0;H[2]=(H[2]+c)>>>0;H[3]=(H[3]+d)>>>0;
    H[4]=(H[4]+e)>>>0;H[5]=(H[5]+f)>>>0;H[6]=(H[6]+g)>>>0;H[7]=(H[7]+h)>>>0;
  }
  return H.map(v=>v.toString(16).padStart(8,"0")).join("");
}
function hash(value){return sha256Hex(JSON.stringify(canonical(value)));}

export function normalizeMusicFrameRate(value=24){const fps=finite(value,24);const supported=[23.976,24,25,29.97,30,48,50,59.94,60];const exact=supported.find(v=>Math.abs(v-fps)<.001);if(!exact)throw new Error(`CREATIVE_MUSIC_PICTURE_FRAME_RATE_UNSUPPORTED:${fps}`);return exact;}
export function musicSecondsToFrames(seconds,frameRate=24){return Math.max(0,Math.round(finite(seconds,0)*normalizeMusicFrameRate(frameRate)));}
export function musicFramesToSeconds(frames,frameRate=24){return Math.max(0,Math.round(finite(frames,0)))/normalizeMusicFrameRate(frameRate);}
export function musicFramesToSmpte(frames,frameRate=24){const fps=normalizeMusicFrameRate(frameRate),nominal=Math.round(fps),total=Math.max(0,Math.round(finite(frames,0)));const ff=total%nominal,totalSeconds=Math.floor(total/nominal),ss=totalSeconds%60,totalMinutes=Math.floor(totalSeconds/60),mm=totalMinutes%60,hh=Math.floor(totalMinutes/60);return `${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}:${String(ss).padStart(2,"0")}:${String(ff).padStart(2,"0")}`;}
export function musicSecondsToSmpte(seconds,frameRate=24){return musicFramesToSmpte(musicSecondsToFrames(seconds,frameRate),frameRate);}

export function createMusicPictureLock(input={}){
 const frameRate=normalizeMusicFrameRate(input.frame_rate||input.fps||24),duration=finite(input.duration_seconds,null),assetId=text(input.picture_asset_id||input.video_asset_id),cutId=text(input.cut_id||input.timeline_id),sourceDigest=text(input.picture_digest||input.cut_digest||input.checksum);
 if(!assetId)throw new Error("CREATIVE_MUSIC_PICTURE_ASSET_REQUIRED");if(!cutId)throw new Error("CREATIVE_MUSIC_PICTURE_CUT_ID_REQUIRED");if(!sourceDigest)throw new Error("CREATIVE_MUSIC_PICTURE_DIGEST_REQUIRED");if(!Number.isFinite(duration)||duration<=0)throw new Error("CREATIVE_MUSIC_PICTURE_DURATION_REQUIRED");
 const basis={picture_asset_id:assetId,cut_id:cutId,picture_digest:sourceDigest,duration_seconds:Number(duration.toFixed(6)),frame_rate:frameRate,start_timecode:text(input.start_timecode)||"00:00:00:00"};
 return {contract:CONTRACT,...basis,frame_count:musicSecondsToFrames(duration,frameRate),picture_lock_digest:hash(basis),locked_at:text(input.locked_at)||new Date().toISOString(),audio_conform_required_on_picture_change:true,sync_tolerance_frames:1,exact_frame_clock:true,publication_requires_current_picture_lock:true};
}

export function bindMusicSessionToPicture(sessionInput={},pictureInput={}){const session=structuredClone(sessionInput),picture=createMusicPictureLock(pictureInput);session.picture_lock=picture;session.timeline={...(session.timeline||{}),timebase:"PICTURE_FRAMES",frame_rate:picture.frame_rate,picture_duration_seconds:picture.duration_seconds,picture_lock_digest:picture.picture_lock_digest,start_timecode:picture.start_timecode};return session;}
export function evaluateMusicPictureLock(session={},currentPicture={}){const stored=session.picture_lock;if(!stored)return{contract:"AVANTIQO_MUSIC_PICTURE_LOCK_STATUS_V1",status:"UNBOUND",current:false,reasons:["PICTURE_LOCK_MISSING"]};let current;try{current=createMusicPictureLock(currentPicture);}catch(error){return{contract:"AVANTIQO_MUSIC_PICTURE_LOCK_STATUS_V1",status:"UNVERIFIED",current:false,reasons:[error.message]};}const reasons=[];if(stored.picture_asset_id!==current.picture_asset_id)reasons.push("PICTURE_ASSET_CHANGED");if(stored.cut_id!==current.cut_id)reasons.push("PICTURE_CUT_CHANGED");if(stored.picture_digest!==current.picture_digest)reasons.push("PICTURE_DIGEST_CHANGED");if(Math.abs(finite(stored.duration_seconds)-current.duration_seconds)>.0005)reasons.push("PICTURE_DURATION_CHANGED");if(Math.abs(finite(stored.frame_rate)-current.frame_rate)>.0001)reasons.push("PICTURE_FRAME_RATE_CHANGED");return{contract:"AVANTIQO_MUSIC_PICTURE_LOCK_STATUS_V1",status:reasons.length?"STALE":"CURRENT",current:reasons.length===0,reasons,stored_picture_lock_digest:stored.picture_lock_digest,current_picture_lock_digest:current.picture_lock_digest,reconform_required:reasons.length>0};}

export const CreativeMusicPictureLockRuntime=Object.freeze({contract:CONTRACT,create:createMusicPictureLock,bind:bindMusicSessionToPicture,evaluate:evaluateMusicPictureLock,secondsToFrames:musicSecondsToFrames,framesToSeconds:musicFramesToSeconds,secondsToSmpte:musicSecondsToSmpte,framesToSmpte:musicFramesToSmpte});
