function finite(value,fallback=0){const n=Number(value);return Number.isFinite(n)?n:fallback;}
function clamp(value,min,max,fallback=0){return Math.max(min,Math.min(max,finite(value,fallback)));}
function dbToGain(db){return 10**(finite(db,0)/20);}

function biquadCoefficients(type,sampleRate,frequency,q=0.707,gainDb=0){
  const f=Math.max(5,Math.min(sampleRate*.49,finite(frequency,1000))),omega=2*Math.PI*f/sampleRate,cos=Math.cos(omega),sin=Math.sin(omega),Q=Math.max(.05,finite(q,.707)),A=10**(finite(gainDb,0)/40),alpha=sin/(2*Q);let b0,b1,b2,a0,a1,a2;
  if(type==='highpass'){b0=(1+cos)/2;b1=-(1+cos);b2=(1+cos)/2;a0=1+alpha;a1=-2*cos;a2=1-alpha;}
  else if(type==='lowshelf'){const beta=2*Math.sqrt(A)*alpha;b0=A*((A+1)-(A-1)*cos+beta);b1=2*A*((A-1)-(A+1)*cos);b2=A*((A+1)-(A-1)*cos-beta);a0=(A+1)+(A-1)*cos+beta;a1=-2*((A-1)+(A+1)*cos);a2=(A+1)+(A-1)*cos-beta;}
  else if(type==='highshelf'){const beta=2*Math.sqrt(A)*alpha;b0=A*((A+1)+(A-1)*cos+beta);b1=-2*A*((A-1)+(A+1)*cos);b2=A*((A+1)+(A-1)*cos-beta);a0=(A+1)-(A-1)*cos+beta;a1=2*((A-1)-(A+1)*cos);a2=(A+1)-(A-1)*cos-beta;}
  else {b0=1+alpha*A;b1=-2*cos;b2=1-alpha*A;a0=1+alpha/A;a1=-2*cos;a2=1-alpha/A;}
  return {b0:b0/a0,b1:b1/a0,b2:b2/a0,a1:a1/a0,a2:a2/a0};
}

function applyBiquad(input,coeff){const out=new Float32Array(input.length);let x1=0,x2=0,y1=0,y2=0;for(let i=0;i<input.length;i++){const x=finite(input[i],0);const y=coeff.b0*x+coeff.b1*x1+coeff.b2*x2-coeff.a1*y1-coeff.a2*y2;out[i]=y;x2=x1;x1=x;y2=y1;y1=y;}return out;}
function mapChannels(channels,fn){return channels.map((channel,index)=>fn(channel,index));}

export function applyMusicMultichannelEq(channels=[],sampleRate=48000,eq={}){
  let out=channels.map(channel=>new Float32Array(channel));
  const hp=finite(eq.high_pass_hz,20);if(hp>20.01)out=mapChannels(out,ch=>applyBiquad(ch,biquadCoefficients('highpass',sampleRate,hp,.707,0)));
  const low=finite(eq.low_shelf_db,0);if(Math.abs(low)>.0001)out=mapChannels(out,ch=>applyBiquad(ch,biquadCoefficients('lowshelf',sampleRate,finite(eq.low_shelf_hz,120),.707,low)));
  const presence=finite(eq.presence_db,0);if(Math.abs(presence)>.0001)out=mapChannels(out,ch=>applyBiquad(ch,biquadCoefficients('peaking',sampleRate,finite(eq.presence_hz,3000),finite(eq.presence_q,.8),presence)));
  const high=finite(eq.high_shelf_db,0);if(Math.abs(high)>.0001)out=mapChannels(out,ch=>applyBiquad(ch,biquadCoefficients('highshelf',sampleRate,finite(eq.high_shelf_hz,8000),.707,high)));
  return out;
}

function compressionGainDb(levelDb,threshold,ratio,knee){if(!Number.isFinite(levelDb))return 0;const over=levelDb-threshold;if(knee<=0)return over>0?-(over-over/ratio):0;const half=knee/2;if(over<=-half)return 0;if(over>=half)return -(over-over/ratio);const x=over+half;return -(1-1/ratio)*x*x/(2*knee);}

export function applyMusicLinkedMultichannelCompression(channels=[],sampleRate=48000,settings={}){
  if(settings?.enabled!==true)return {channels:channels.map(ch=>new Float32Array(ch)),gain_reduction_db_min:0,linked_detector:true};
  const frames=Math.max(0,...channels.map(ch=>ch.length)),out=channels.map(ch=>new Float32Array(frames));
  const threshold=clamp(settings.threshold_db,-60,0,-18),ratio=clamp(settings.ratio,1,20,2.5),knee=clamp(settings.knee_db,0,40,6),attack=Math.max(.0001,finite(settings.attack_ms,20)/1000),release=Math.max(.001,finite(settings.release_ms,180)/1000),attackCoeff=Math.exp(-1/(attack*sampleRate)),releaseCoeff=Math.exp(-1/(release*sampleRate)),makeup=dbToGain(settings.makeup_db);let env=0,minGr=0;
  for(let i=0;i<frames;i++){
    let detector=0;for(const ch of channels){const v=Math.abs(finite(ch[i],0));detector=Math.max(detector,v);}
    env=detector>env?attackCoeff*env+(1-attackCoeff)*detector:releaseCoeff*env+(1-releaseCoeff)*detector;
    const level=env>1e-12?20*Math.log10(env):-Infinity,gr=compressionGainDb(level,threshold,ratio,knee),gain=dbToGain(gr)*makeup;minGr=Math.min(minGr,gr);
    for(let c=0;c<out.length;c++)out[c][i]=finite(channels[c]?.[i],0)*gain;
  }
  return {channels:out,gain_reduction_db_min:Number(minGr.toFixed(3)),linked_detector:true};
}

export function applyMusicMultichannelBusProcessing(channels=[],sampleRate=48000,{processing={},gain_db=0,mute=false}={}){
  if(mute===true)return {channels:channels.map(ch=>new Float32Array(ch.length)),gain_reduction_db_min:0,linked_compression:true};
  let out=applyMusicMultichannelEq(channels,sampleRate,processing.eq||{});
  const compressed=applyMusicLinkedMultichannelCompression(out,sampleRate,processing.compressor||{});out=compressed.channels;
  const gain=dbToGain(gain_db);if(Math.abs(gain-1)>.000001)for(const ch of out)for(let i=0;i<ch.length;i++)ch[i]*=gain;
  return {channels:out,gain_reduction_db_min:compressed.gain_reduction_db_min,linked_compression:true};
}

export function sumMusicMultichannelBuffers(target=[],source=[]){const count=Math.max(target.length,source.length),frames=Math.max(0,...target.map(x=>x.length),...source.map(x=>x.length));const out=Array.from({length:count},(_,c)=>{const ch=new Float32Array(frames);if(target[c])ch.set(target[c].subarray(0,frames));if(source[c])for(let i=0;i<source[c].length;i++)ch[i]+=source[c][i];return ch;});return out;}

export const CreativeMusicMultichannelDspRuntime=Object.freeze({applyEq:applyMusicMultichannelEq,applyLinkedCompression:applyMusicLinkedMultichannelCompression,applyBusProcessing:applyMusicMultichannelBusProcessing,sum:sumMusicMultichannelBuffers});
