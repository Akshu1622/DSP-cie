import { useEffect, useRef, useState } from "react";
import { LineChart,Line,BarChart,Bar,XAxis,YAxis,CartesianGrid,Tooltip,Legend,ResponsiveContainer,ReferenceLine,AreaChart,Area } from "recharts";
import { api } from "./api.js";

const tick={fontSize:11,fontFamily:"IBM Plex Mono, monospace"};

function Chart({title,sub,caption,children}){
return <div className="card"> <h2>{title}<span>{sub}</span></h2> <div style={{height:260}}><ResponsiveContainer>{children}</ResponsiveContainer></div>
{caption&&<p className="cap">{caption}</p>}

  </div>;
}

export default function App(){
const [online,setOnline]=useState(false);
const [info,setInfo]=useState(null);
const [names,setNames]=useState([]);
const [sel,setSel]=useState("");
const [leaf,setLeaf]=useState(null);
const [view,setView]=useState("original");
const [treatment,setTreatment]=useState(null);
const [dsp,setDsp]=useState(null);
const [health,setHealth]=useState(null);
const [p,setP]=useState({fs:1,cutoff:0.1,order:4});
const [err,setErr]=useState("");
const [busy,setBusy]=useState(false);
const fileRef=useRef();

useEffect(()=>{
(async()=>{
try{
await api.status();
setOnline(true);
const [i,im]=await Promise.all([api.info(),api.images(0,60)]);
setInfo(i);
setNames(im.items);
if(im.items[0])pick(im.items[0]);
}catch(e){setErr(e.message);}
})();
},[]);

async function pick(name){
setSel(name);
setBusy(true);
setErr("");
setDsp(null);
setHealth(null);
setTreatment(null);
try{
const result=await api.sample(name);
setLeaf(result);
setView("original");
}catch(e){setErr(e.message);}
setBusy(false);
}

async function onUpload(e){
const f=e.target.files[0];
if(!f)return;
setBusy(true);
setErr("");
setSel("");
setDsp(null);
setHealth(null);
setTreatment(null);
try{
const result=await api.upload(f);
setLeaf(result);
setView("original");
}catch(e){setErr(e.message);}
setBusy(false);
e.target.value="";
}

function random(){
fetch("/api/images?offset=0&limit=1")
.then(r=>r.json())
.then(async d=>{
if(!d.total)return;
const off=Math.floor(Math.random()*d.total);
const r=await api.images(off,1);
if(r.items[0]){
setNames(n=>n.includes(r.items[0])?n:[r.items[0],...n]);
pick(r.items[0]);
}
})
.catch(e=>setErr(e.message));
}

useEffect(()=>{
if(!online||!sel)return;
const t=setTimeout(async()=>{
try{
const result=await api.dsp(sel,p);
setDsp(result);
setErr("");
}catch(e){setErr(e.message);}
},250);
return()=>clearTimeout(t);
},[sel,p,online]);

useEffect(()=>{
if(!leaf||!dsp)return;
const readings=dsp.readings||{};
Promise.all([
api.health(leaf.greenness_level,readings),
api.treatment(leaf.greenness_level,readings)
])
.then(([h,t])=>{
setHealth(h);
setTreatment(t);
})
.catch(e=>setErr(e.message));
},[leaf,dsp]);

const set=(k,v)=>setP(o=>({...o,[k]:v}));
const nyq=p.fs/2;

const sig=dsp?dsp.n.map((n,i)=>({n,raw:dsp.raw[i],filtered:dsp.filtered[i]})):[];
const fft=dsp?dsp.freq.map((f,i)=>({f,raw:dsp.mag_raw[i],filtered:dsp.mag_filtered[i]})):[];
const resp=dsp?dsp.filter_response.freq.map((f,i)=>({f,db:dsp.filter_response.gain_db[i]})):[];
const rgbBars=leaf?["R","G","B"].map(c=>({c,v:leaf.rgb_mean[c]})):[];
const hist=leaf?leaf.histogram.bins.map((b,i)=>({b,R:leaf.histogram.R[i],G:leaf.histogram.G[i],B:leaf.histogram.B[i]})):[];
const cls=health?.status==="HEALTHY"?"HEALTHY":health?.status==="STRESSED"?"STRESSED":"MODERATE";
const imgSrc=leaf?{original:leaf.images.original,segmented:leaf.images.segmented,exg:leaf.images.exg_map}[view]:null;

return <div className="wrap">

```
<header>
  <h1><small>Digital Signal Processing Project</small>Plant Health Monitor</h1>
  <span className={`pill ${online?"on":""}`}><i/>{online?"backend connected":"backend offline"}</span>
</header>

{err&&<div className="err">⚠ {err}</div>}

<div className={`banner ${health?cls:""}`}>
  <div>
    <small>OVERALL PLANT HEALTH</small><br/>
    <b>{health?health.status:"—"}</b>
    <p>{health?health.message:"Select a leaf image to begin."}</p>
  </div>
  {health&&<small>stress points: {health.stress_points}</small>}
</div>

<div className="cards">
  <div className="pc">
    <label>Chlorophyll / Greenness</label>
    <div className={leaf?`lvl-${leaf.greenness_level}`:""}>{leaf?leaf.greenness_level.toUpperCase():"—"}</div>
    <em>{leaf?`score ${leaf.greenness_score}/100`:""}</em>
  </div>
  <div className="pc">
    <label>DSP Signal</label><div>Leaf Green Intensity</div><em>selected leaf pixels</em>
  </div>
  <div className="pc">
    <label>Sampling Frequency</label><div>{p.fs}<small> samples</small></div><em>assumed sampling rate</em>
  </div>
  <div className="pc">
    <label>Cutoff Frequency</label><div>{p.cutoff}<small> cycles/sample</small></div><em>Butterworth low-pass</em>
  </div>
  <div className="pc">
    <label>Filter Order</label><div>{p.order}</div><em>Butterworth IIR</em>
  </div>
  <div className="pc na">
    <label>Selected Leaf</label><div>{sel?"Selected":"Upload / select leaf"}</div>
    <em>{sel?"DSP active":"DSP unavailable for upload"}</em>
  </div>
</div>

<div className="grid g2">
  <div className={`card ${busy?"load":""}`}>
    <h2>Leaf image<span>{leaf?`${leaf.leaf_coverage_pct}% leaf pixels`:""}</span></h2>
    <div className="imgbox">{imgSrc?<img src={imgSrc} alt={view}/>:"no image"}</div>
    <div className="tabs">
      {[["original","Original"],["segmented","Segmented"],["exg","ExG map"]].map(([k,l])=>
        <button key={k} className={view===k?"act":""} onClick={()=>setView(k)}>{l}</button>
      )}
    </div>
    <select value={sel} onChange={e=>pick(e.target.value)} style={{width:"100%"}}>
      <option value="" disabled>Select dataset leaf…</option>
      {names.map((n,i)=><option key={n} value={n}>{i+1}. {n.split("___")[1]||n}</option>)}
    </select>
    <div className="row">
      <button className="btn" onClick={random}>🎲 Random from dataset</button>
      <button className="btn primary" onClick={()=>fileRef.current.click()}>⬆ Upload leaf</button>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={onUpload}/>
    </div>
    {info&&<p className="cap">{info.rows} sensor rows · columns: {info.columns.join(", ")}</p>}
  </div>

  <div className="grid">
    <div className="card">
      <h2>RGB &amp; greenness analysis<span>over leaf pixels only</span></h2>
      {leaf&&<>
        <div className="metrics">
          {[
            ["ExG = 2G−R−B",leaf.exg_raw_mean],
            ["ExG (normalised)",leaf.exg_norm_mean],
            ["NGRDI (G−R)/(G+R)",leaf.ngrdi_mean],
            ["G/(R+G+B)",leaf.green_norm_mean],
            ["Mean R,G,B",`${leaf.rgb_mean.R}, ${leaf.rgb_mean.G}, ${leaf.rgb_mean.B}`]
          ].map(([label,val])=><div className="m" key={label}><span>{label}</span><b>{val}</b></div>)}
        </div>
        <div className="charts">
          <div style={{height:200}}>
            <ResponsiveContainer>
              <BarChart data={rgbBars}>
                <CartesianGrid strokeDasharray="3 3"/>
                <XAxis dataKey="c" tick={tick}/>
                <YAxis tick={tick} domain={[0,255]}/>
                <Tooltip/>
                <Bar dataKey="v" name="mean value" isAnimationActive={false} fill="#2f6b3f"/>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={{height:200}}>
            <ResponsiveContainer>
              <AreaChart data={hist}>
                <CartesianGrid strokeDasharray="3 3"/>
                <XAxis dataKey="b" tick={tick}/>
                <YAxis tick={tick}/>
                <Tooltip/>
                <Area dataKey="R" stroke="#c0392b" fill="#c0392b" fillOpacity={0.25} isAnimationActive={false}/>
                <Area dataKey="G" stroke="#2f8f4e" fill="#2f8f4e" fillOpacity={0.25} isAnimationActive={false}/>
                <Area dataKey="B" stroke="#2c6fbb" fill="#2c6fbb" fillOpacity={0.25} isAnimationActive={false}/>
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <p className="note">{leaf.note}</p>
      </>}
    </div>
  </div>
</div>

<div className="card" style={{marginTop:16}}>
  <h2>Leaf Signal DSP Analysis<span>x[n] → FFT → Butterworth IIR → y[n]</span></h2>

  <div className="ctrl">
    <div><label>Signal x[n]</label><div><b>Leaf Green Intensity</b></div></div>
    <div>
      <label>Sampling fs: <b>{p.fs}</b> samples</label>
      <input type="range" min="0.5" max="4" step="0.5" value={p.fs} onChange={e=>{
        const fs=+e.target.value;
        setP(o=>({...o,fs,cutoff:Math.min(o.cutoff,+(fs/2-0.01).toFixed(2))}));
      }}/>
    </div>
    <div>
      <label>Cutoff fc: <b>{p.cutoff}</b> cycles/sample</label>
      <input type="range" min="0.01" max={+(nyq-0.01).toFixed(2)} step="0.01" value={p.cutoff} onChange={e=>set("cutoff",+e.target.value)}/>
    </div>
    <div>
      <label>Filter order: <b>{p.order}</b></label>
      <input type="range" min="1" max="10" step="1" value={p.order} onChange={e=>set("order",+e.target.value)}/>
    </div>
  </div>

  {dsp&&<div className="metrics">
    {[
      ["Sampling freq fs",dsp.params.fs],
      ["Nyquist fs/2",dsp.params.nyquist],
      ["Cutoff fc",dsp.params.cutoff],
      ["Filter order",dsp.params.order],
      ["Noise removed",`${dsp.metrics.hf_energy_reduction_db} dB`],
      ["Jitter reduction",`${dsp.metrics.jitter_reduction_pct}%`],
      ["Noise std (raw−filt)",dsp.metrics.noise_std_raw]
    ].map(([label,val])=><div className="m" key={label}><span>{label}</span><b>{val}</b></div>)}
  </div>}

  <div className="charts">
    <Chart title="Raw vs filtered" sub="Leaf green intensity" caption="x[n] is the green-channel intensity of leaf pixels. y[n] is the Butterworth IIR low-pass filtered signal.">
      <LineChart data={sig}>
        <CartesianGrid strokeDasharray="3 3"/>
        <XAxis dataKey="n" tick={tick} label={{value:"n (pixel sample index)",position:"insideBottom",offset:-2,fontSize:11}}/>
        <YAxis tick={tick} domain={["auto","auto"]}/>
        <Tooltip/><Legend/>
        <Line dataKey="raw" name="raw x[n]" stroke="#9a9a8c" dot={false} strokeWidth={1} isAnimationActive={false}/>
        <Line dataKey="filtered" name="filtered y[n]" stroke="#2f6b3f" dot={false} strokeWidth={2.5} isAnimationActive={false}/>
      </LineChart>
    </Chart>

    <Chart title="FFT frequency spectrum" sub="|X(f)|, DC removed, Hann window" caption="The FFT shows the frequency components of the leaf green-intensity signal. The cutoff frequency is shown by the dashed line.">
      <LineChart data={fft}>
        <CartesianGrid strokeDasharray="3 3"/>
        <XAxis dataKey="f" type="number" domain={[0,nyq]} tick={tick} tickFormatter={v=>(+v).toFixed(2)} label={{value:"frequency",position:"insideBottom",offset:-2,fontSize:11}}/>
        <YAxis tick={tick}/>
        <Tooltip formatter={v=>(+v).toFixed(4)} labelFormatter={v=>`f = ${(+v).toFixed(3)}`}/>
        <Legend/>
        <ReferenceLine x={p.cutoff} stroke="#bf3b2b" strokeDasharray="5 4" label={{value:"fc",fill:"#bf3b2b",fontSize:11}}/>
        <Line dataKey="raw" name="raw" stroke="#9a9a8c" dot={false} isAnimationActive={false}/>
        <Line dataKey="filtered" name="filtered" stroke="#2f6b3f" dot={false} strokeWidth={2} isAnimationActive={false}/>
      </LineChart>
    </Chart>

    <Chart title="Filter frequency response" sub="|H(f)| in dB" caption="Butterworth low-pass frequency response. Increasing the filter order produces a steeper roll-off.">
      <LineChart data={resp}>
        <CartesianGrid strokeDasharray="3 3"/>
        <XAxis dataKey="f" type="number" domain={[0,nyq]} tick={tick} tickFormatter={v=>(+v).toFixed(2)}/>
        <YAxis tick={tick} domain={[-80,5]}/>
        <Tooltip formatter={v=>`${(+v).toFixed(1)} dB`}/>
        <ReferenceLine x={p.cutoff} stroke="#bf3b2b" strokeDasharray="5 4"/>
        <Line dataKey="db" name="gain (dB)" stroke="#2c6fbb" dot={false} strokeWidth={2} isAnimationActive={false}/>
      </LineChart>
    </Chart>
  </div>

  {dsp&&<p className="note">{dsp.time_axis_note}</p>}
</div>

{treatment&&<div className="card" style={{marginTop:16}}>
  <h2>Plant Treatment Suggestions<span>based on detected conditions</span></h2>
  <div className="metrics">
    {treatment.suggestions.map((s,i)=>
      <div className="m" key={i} style={{display:"block"}}>
        <span>{s.issue}</span>
        <p style={{marginTop:8}}>{s.suggestion}</p>
      </div>
    )}
  </div>
  <p className="note">These are rule-based plant-care suggestions based on the detected leaf greenness and filtered environmental readings, not a laboratory disease diagnosis.</p>
</div>}
```

  </div>;
}
