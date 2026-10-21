import { useEffect, useRef, useState } from "react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine, AreaChart, Area } from "recharts";
import { api } from "./api.js";

const COLS = { temperature: ["Temperature", "°C"], humidity: ["Humidity", "%"], ph: ["pH", ""] };
const tick = { fontSize: 11, fontFamily: "IBM Plex Mono, monospace" };

const LEAF_MEASURES = {
  High: {
    label: "Good (Healthy)",
    badgeClass: "lvl-High",
    suggestions: [
      "Maintain current irrigation schedule and balanced nutrient supply to sustain optimal vegetative growth.",
      "Continue regular crop scouting and preventative pest/fungal monitoring to preserve high foliage vigor.",
      "Ensure proper air circulation and sunlight exposure around the canopy to avoid microclimate stress."
    ]
  },
  Moderate: {
    label: "Medium (Moderate Stress)",
    badgeClass: "lvl-Moderate",
    suggestions: [
      "Inspect soil moisture depth and calibrate watering volume to prevent mild dehydration or over-saturation.",
      "Perform a soil/tissue nutrient check; apply balanced foliar spray (micro-nutrients / nitrogen) if pale spots emerge.",
      "Monitor canopy temperature and humidity closely to avoid progression toward severe chlorophyll loss."
    ]
  },
  Low: {
    label: "Stressed (Chlorotic / Unhealthy)",
    badgeClass: "lvl-Low",
    suggestions: [
      "Check root zone immediately for moisture stress (severe drought or waterlogging causing root suffocation).",
      "Screen for fungal, bacterial blight or pest infestation; isolate affected foliage and apply targeted treatment.",
      "Correct soil pH and apply fast-acting nitrogen/iron supplementation to restore chlorophyll synthesis."
    ]
  }
};

function Chart({ title, sub, caption, children }) {
  return (<div className="card"><h2>{title}<span>{sub}</span></h2><div style={{ height: 260 }}><ResponsiveContainer>{children}</ResponsiveContainer></div>{caption && <p className="cap">{caption}</p>}</div>);
}

export default function App() {
  const [online, setOnline] = useState(false);
  const [info, setInfo] = useState(null);
  const [leaf, setLeaf] = useState(null);
  const [view, setView] = useState("original");
  const [dsp, setDsp] = useState(null);
  const [health, setHealth] = useState(null);
  const [p, setP] = useState({ column: "temperature", start: 0, n: 256, fs: 1, cutoff: 0.1, order: 4 });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [pair, setPair] = useState(true); // demo: tie the sensor window to the uploaded leaf
  const fileRef = useRef();

  // initial load: backend status and dataset info
  useEffect(() => {
    (async () => {
      try {
        await api.status(); setOnline(true);
        const i = await api.info();
        setInfo(i);
      } catch (e) { setErr(e.message); }
    })();
  }, []);

  async function onUpload(e) {
    const f = e.target.files[0]; if (!f) return;
    setBusy(true); setErr("");
    try { setLeaf(await api.upload(f)); setView("original"); } catch (e) { setErr(e.message); }
    setBusy(false); e.target.value = "";
  }

  // DSP request (debounced so sliders feel smooth)
  useEffect(() => {
    if (!online) return;
    const t = setTimeout(async () => {
      try { setDsp(await api.dsp(p)); setErr(""); } catch (e) { setErr(e.message); }
    }, 250);
    return () => clearTimeout(t);
  }, [p, online]);

  // when a new leaf is analysed, move the sensor window to that leaf's paired start row
  useEffect(() => {
    if (pair && leaf && leaf.sensor_window_start != null) setP(o => ({ ...o, start: leaf.sensor_window_start }));
  }, [leaf, pair]);

  // overall health whenever greenness or filtered readings change
  useEffect(() => {
    if (leaf && dsp) api.health(leaf.greenness_level, dsp.readings).then(setHealth).catch(e => setErr(e.message));
  }, [leaf, dsp]);

  const set = (k, v) => setP(o => ({ ...o, [k]: v }));
  const nyq = p.fs / 2;
  const rd = dsp?.readings || {};
  const sig = dsp ? dsp.n.map((n, i) => ({ n, raw: dsp.raw[i], filtered: dsp.filtered[i] })) : [];
  const fft = dsp ? dsp.freq.map((f, i) => ({ f, raw: dsp.mag_raw[i], filtered: dsp.mag_filtered[i] })) : [];
  const fr = dsp?.filter_response;
  const resp = fr ? fr.freq.map((f, i) => ({ f, h1: fr.gain_db[i], h2: fr.gain_db_effective[i], raw: fr.raw_spectrum_db[i], filt: fr.filtered_spectrum_db[i] })) : [];
  const rgbBars = leaf ? ["R", "G", "B"].map(c => ({ c, v: leaf.rgb_mean[c] })) : [];
  const hist = leaf ? leaf.histogram.bins.map((b, i) => ({ b, R: leaf.histogram.R[i], G: leaf.histogram.G[i], B: leaf.histogram.B[i] })) : [];
  const cls = health ? (health.status === "HEALTHY" ? "HEALTHY" : health.status === "STRESSED" ? "STRESSED" : "MODERATE") : "";
  const imgSrc = leaf ? { original: leaf.images.original, segmented: leaf.images.segmented, exg: leaf.images.exg_map }[view] : null;

  return (
    <div className="wrap">
      <header>
        <h1><small>Digital Signal Processing Project</small>Plant Health Monitor</h1>
        <span className={"pill " + (online ? "on" : "")}><i />{online ? "backend connected" : "backend offline"}</span>
      </header>
      {err && <div className="err">⚠ {err}</div>}

      <div className={"banner " + cls}>
        <div><small>OVERALL PLANT HEALTH</small><br /><b>{health ? health.status : "—"}</b><p>{health ? health.message : "Upload a leaf image to begin."}</p></div>
        {health && <small>stress points: {health.stress_points} (thresholds in backend/config.py)</small>}
      </div>

      <div className="cards">
        <div className="pc"><label>Chlorophyll / Greenness</label><div className={leaf ? "lvl-" + leaf.greenness_level : ""}>{leaf ? (leaf.greenness_level === "High" ? "GOOD" : leaf.greenness_level === "Moderate" ? "MEDIUM" : "STRESSED") : "—"}</div><em>{leaf ? `score ${leaf.greenness_score}/100 (${leaf.greenness_level})` : ""}</em></div>
        {Object.keys(COLS).map(k => (
          <div className="pc" key={k}><label>{COLS[k][0]}</label>
            <div>{rd[k] ?? "—"}<small> {COLS[k][1]}</small></div><em>filtered, last sample</em></div>))}
      </div>

      <div className="grid g2">
        <div className={"card " + (busy ? "load" : "")}>
          <h2>Leaf image<span>{leaf ? `${leaf.leaf_coverage_pct}% leaf pixels` : ""}</span></h2>
          <div className="imgbox">{imgSrc ? <img src={imgSrc} alt={view} /> : <div style={{ textAlign: "center", color: "var(--mute)", padding: 20 }}><span>🌿</span><p style={{ margin: "6px 0 0", font: "12px var(--mono)" }}>No leaf uploaded yet.<br />Upload a leaf image to start analysis.</p></div>}</div>
          <div className="tabs">{[["original", "Original"], ["segmented", "Segmented"], ["exg", "ExG map"]].map(([k, l]) => <button key={k} className={view === k ? "act" : ""} onClick={() => setView(k)}>{l}</button>)}</div>
          <div className="row">
            <button className="btn primary" style={{ width: "100%", padding: "10px", fontSize: "13px" }} onClick={() => fileRef.current.click()}>⬆ Upload leaf</button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={onUpload} />
          </div>
          {info && <p className="cap">{info.rows} sensor rows · columns: {info.columns.join(", ")}</p>}
        </div>

        <div className="grid">
          <div className="card">
            <h2>RGB &amp; greenness analysis<span>over leaf pixels only</span></h2>
            {leaf ? <>
              <div className="metrics">
                <div className="m"><span>ExG = 2G−R−B</span><b>{leaf.exg_raw_mean}</b></div>
                <div className="m"><span>ExG (normalised)</span><b>{leaf.exg_norm_mean}</b></div>
                <div className="m"><span>NGRDI (G−R)/(G+R)</span><b>{leaf.ngrdi_mean}</b></div>
                <div className="m"><span>G/(R+G+B)</span><b>{leaf.green_norm_mean}</b></div>
                <div className="m"><span>Mean R,G,B</span><b>{leaf.rgb_mean.R},{leaf.rgb_mean.G},{leaf.rgb_mean.B}</b></div>
              </div>
              <div className="charts">
                <div style={{ height: 200 }}><ResponsiveContainer><BarChart data={rgbBars}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="c" tick={tick} /><YAxis tick={tick} domain={[0, 255]} /><Tooltip /><Bar dataKey="v" name="mean value" isAnimationActive={false} fill="#2f6b3f" /></BarChart></ResponsiveContainer></div>
                <div style={{ height: 200 }}><ResponsiveContainer><AreaChart data={hist}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="b" tick={tick} /><YAxis tick={tick} /><Tooltip /><Area dataKey="R" stroke="#c0392b" fill="#c0392b" fillOpacity={.25} isAnimationActive={false} /><Area dataKey="G" stroke="#2f8f4e" fill="#2f8f4e" fillOpacity={.25} isAnimationActive={false} /><Area dataKey="B" stroke="#2c6fbb" fill="#2c6fbb" fillOpacity={.25} isAnimationActive={false} /></AreaChart></ResponsiveContainer></div>
              </div>
              <p className="note">{leaf.note}</p></> : (
              <p className="measures-empty" style={{ margin: "20px 0" }}>Upload a leaf image to view RGB distribution and chromatic greenness analysis.</p>
            )}
          </div>

          {/* Measures to be taken section filling the gap below RGB analysis */}
          <div className="card">
            <div className="measures-title">
              <h2>Measures to be Taken<span>Tailored agronomic actions</span></h2>
              {leaf && <span className={"badge " + (LEAF_MEASURES[leaf.greenness_level]?.badgeClass || "")}>Condition: {leaf.greenness_level === "High" ? "Good" : leaf.greenness_level === "Moderate" ? "Medium" : "Stressed"}</span>}
            </div>
            {leaf ? (
              <ul className="measures-list">
                {(LEAF_MEASURES[leaf.greenness_level]?.suggestions || []).map((s, idx) => (
                  <li key={idx} className="measure-item">
                    <span className="measure-num">{idx + 1}</span>
                    <span className="measure-text">{s}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="measures-empty">Upload a leaf image to see corrective measures.</p>
            )}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2>DSP sensor-signal lab<span>x[n] → FFT → Butterworth low-pass → y[n]</span></h2>
        <div className="ctrl">
          <div><label>Signal x[n]</label><select value={p.column} onChange={e => set("column", e.target.value)}>{Object.keys(COLS).map(k => <option key={k} value={k}>{COLS[k][0]}</option>)}</select></div>
          <div><label>Start row n₀: <b>{p.start}</b></label><input type="range" min="0" max="2588" step="1" value={p.start} onChange={e => { setPair(false); set("start", +e.target.value); }} /></div>
          <div><label>Samples N: <b>{p.n}</b></label><input type="range" min="64" max="512" step="64" value={p.n} onChange={e => set("n", +e.target.value)} /></div>
          <div><label>Sampling fs: <b>{p.fs}</b> samples/hr</label><input type="range" min="0.5" max="4" step="0.5" value={p.fs} onChange={e => { const fs = +e.target.value; setP(o => ({ ...o, fs, cutoff: Math.min(o.cutoff, +(fs / 2 - 0.01).toFixed(2)) })); }} /></div>
          <div><label>Cutoff fc: <b>{p.cutoff}</b> cycles/hr</label><input type="range" min="0.01" max={+(nyq - 0.01).toFixed(2)} step="0.01" value={p.cutoff} onChange={e => set("cutoff", +e.target.value)} /></div>
          <div><label>Filter order: <b>{p.order}</b></label><input type="range" min="1" max="10" step="1" value={p.order} onChange={e => set("order", +e.target.value)} /></div>
          <div><label>Leaf ↔ sensor window</label><label style={{ color: "var(--ink)", cursor: "pointer" }}><input type="checkbox" checked={pair} onChange={e => setPair(e.target.checked)} /> pair with uploaded leaf</label></div>
        </div>
        {dsp && <div className="metrics">
          <div className="m"><span>Sampling freq fs</span><b>{dsp.params.fs} /hr</b></div>
          <div className="m"><span>Nyquist fs/2</span><b>{dsp.params.nyquist} /hr</b></div>
          <div className="m"><span>Cutoff fc</span><b>{dsp.params.cutoff} /hr</b></div>
          <div className="m"><span>Filter order</span><b>{dsp.params.order}</b></div>
          <div className="m"><span>Noise removed (HF energy)</span><b>{dsp.metrics.hf_energy_reduction_db} dB</b></div>
          <div className="m"><span>Jitter reduction</span><b>{dsp.metrics.jitter_reduction_pct}%</b></div>
          <div className="m"><span>Noise std (raw−filt)</span><b>{dsp.metrics.noise_std_raw} {dsp.unit}</b></div>
        </div>}
        <div className="charts">
          <Chart title="Raw vs filtered" sub={`x[n] and y[n], ${dsp?.column || ""}`} caption="Raw sensor samples (grey) and Butterworth-filtered output (green). The filter removes fast fluctuations and keeps the slow trend.">
            <LineChart data={sig}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="n" tick={tick} label={{ value: "n (sample index)", position: "insideBottom", offset: -2, fontSize: 11 }} /><YAxis tick={tick} domain={["auto", "auto"]} /><Tooltip /><Legend />
              <Line dataKey="raw" name="raw x[n]" stroke="#9a9a8c" dot={false} strokeWidth={1} isAnimationActive={false} />
              <Line dataKey="filtered" name="filtered y[n]" stroke="#2f6b3f" dot={false} strokeWidth={2.5} isAnimationActive={false} /></LineChart>
          </Chart>
          <Chart title="FFT frequency spectrum" sub="|X(f)|, DC removed, Hann window" caption="Dashed line = cutoff. Raw spectrum has energy at all frequencies; after filtering the energy above fc is strongly attenuated.">
            <LineChart data={fft}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="f" type="number" domain={[0, nyq]} tick={tick} tickFormatter={v => (+v).toFixed(2)} label={{ value: "frequency (cycles/hour)", position: "insideBottom", offset: -2, fontSize: 11 }} /><YAxis tick={tick} /><Tooltip formatter={v => (+v).toFixed(4)} labelFormatter={v => `f = ${(+v).toFixed(3)}`} /><Legend />
              <ReferenceLine x={p.cutoff} stroke="#bf3b2b" strokeDasharray="5 4" label={{ value: "fc", fill: "#bf3b2b", fontSize: 11 }} />
              <Line dataKey="raw" name="raw" stroke="#9a9a8c" dot={false} isAnimationActive={false} />
              <Line dataKey="filtered" name="filtered" stroke="#2f6b3f" dot={false} strokeWidth={2} isAnimationActive={false} /></LineChart>
          </Chart>
          <Chart title="Filter response vs signal spectrum" sub="dB (spectra relative to raw peak)" caption="Blue = Butterworth gain H(f): it depends only on fs, fc and order. Grey/green = this signal's spectrum before/after filtering: it changes with the leaf and signal. Zero-phase (forward+backward) filtering squares H(f), i.e. doubles the dB attenuation.">
            <LineChart data={resp}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="f" type="number" domain={[0, nyq]} tick={tick} tickFormatter={v => (+v).toFixed(2)} /><YAxis tick={tick} type="number" domain={[-100, 5]} allowDataOverflow ticks={[0, -20, -40, -60, -80, -100]} /><Tooltip formatter={v => (+v).toFixed(1) + " dB"} labelFormatter={v => `f = ${(+v).toFixed(3)}`} /><Legend />
              <ReferenceLine x={p.cutoff} stroke="#bf3b2b" strokeDasharray="5 4" /><ReferenceLine y={-3} stroke="#999" strokeDasharray="2 3" />
              <Line dataKey="raw" name="raw spectrum" stroke="#b5b5a6" dot={false} strokeWidth={1} isAnimationActive={false} />
              <Line dataKey="filt" name="filtered spectrum" stroke="#2f6b3f" dot={false} strokeWidth={1.6} isAnimationActive={false} />
              <Line dataKey="h1" name="H(f) one pass" stroke="#2c6fbb" dot={false} strokeWidth={2} isAnimationActive={false} />
              <Line dataKey="h2" name="H(f) zero-phase" stroke="#7a3fb0" dot={false} strokeWidth={1.6} strokeDasharray="5 3" isAnimationActive={false} /></LineChart>
          </Chart>
        </div>
        <p className="note">{dsp?.time_axis_note} {pair ? "Sensor window is paired with the uploaded leaf (a demo link: leaf images and sensor rows were not recorded together). " : ""}The sensor file has no timestamps, so fs is an assumed value you can change; spectrum and filter behave identically for any assumed fs (only the axis labels scale).</p>
      </div>
    </div>
  );
}
