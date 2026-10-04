# Plant Health & Chlorophyll Monitoring System using DSP

React/Vite dashboard + FastAPI backend. Uses the **uploaded** data only (`data/cpdata.csv`, `data/leaf_images/`, unmodified).

## Run
```bash
# Terminal 1 - backend (Python 3.10+)
cd backend
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Terminal 2 - frontend (Node 18+)
cd frontend
npm install
npm run dev            # open http://localhost:5173
```
API docs: http://localhost:8000/docs. Vite proxies `/api` to port 8000 (CORS is also enabled on the backend).

## Structure
```
backend/  main.py (REST API)  dsp.py (FFT, Butterworth, noise metrics)  image_analysis.py (segmentation, RGB, ExG)
          health.py (rule-based fusion)  config.py (ALL thresholds + DSP defaults)  requirements.txt
frontend/ index.html  vite.config.js  package.json  src/{main.jsx, App.jsx, api.js, styles.css}
data/     cpdata.csv (3100 rows)   leaf_images/ (1702 JPGs, 256x256)
```

## What the data actually contains
* `cpdata.csv`: **temperature (°C), humidity (%), ph, rainfall (mm)** - 3100 rows, no missing values, **no timestamps**.
  There is **no soil moisture and no light intensity**; the dashboard shows "Not in dataset" rather than inventing them.
  Rainfall is shown as a *wetness proxy*, never as soil moisture.
* `leaf_images/`: 1702 leaves (bacterial-spot images: 1403 `GCREC_Bact.Sp`, 299 `UF.GRC_BS_Lab Leaf`) on a grey background. No chlorophyll (SPAD) labels exist, so greenness is a **proxy**, not a lab concentration.

## Dataset parameters used
temperature, humidity, ph, rainfall (all DSP-filtered) + RGB of every leaf pixel.

## Method
**Leaf**: HSV saturation + Otsu threshold -> morphology -> largest blob = leaf mask. Over leaf pixels: mean R,G,B; ExG = 2G-R-B; chromatic ExG = 2g-r-b; normalized green G/(R+G+B); NGRDI = (G-R)/(G+R).
Low/Moderate/High is decided on **NGRDI**, because chromatic ExG *rose* for yellowed leaves in this dataset (yellow-green has a high G share) while NGRDI falls. Thresholds = tertiles of the 1702 images (`config.py`).

**DSP**: x[n] = a window of N rows of one CSV column. The CSV has no timestamps, so **row index = n and fs = 1 sample/hour is an ASSUMPTION** (adjustable in the UI). Steps: Hann window -> FFT -> Butterworth IIR low-pass (SOS form, order 4 default, applied with `sosfiltfilt` = zero phase) -> FFT of y[n].
Noise metrics: energy above fc in dB (raw vs filtered), jitter (std of first difference) reduction %, std of (raw - filtered).

**Health**: stress points from greenness + each filtered reading (`config.py`): <=1 HEALTHY, 2-3 MODERATELY STRESSED, >=4 STRESSED, with reasons listed.

## Testing done
All 1702 images segment without failure. API tested: sample + upload analysis, invalid file (400), grey image without leaf (422), bad column (400), cutoff above Nyquist (422), path traversal (404), CORS header, Vite proxy, several random image x data-window combinations. `vite build` succeeds. The UI itself could not be opened in a real browser in my sandbox - please check it visually once.

## 2-minute viva script
"Sensor readings are sampled signals x[n] and contain noise. I take N real readings from the dataset, compute the FFT to see the frequency content, then apply a Butterworth low-pass IIR filter - maximally flat passband, order 4, cutoff below the noise band. I compare raw vs filtered in time and frequency and quantify the noise removed in dB. The same project analyses a leaf photo: segment the leaf, take mean R,G,B, compute ExG, normalized green and NGRDI as a chlorophyll *proxy*. A rule-based fusion of greenness and filtered temperature, humidity, pH and rainfall gives HEALTHY / MODERATELY STRESSED / STRESSED with reasons; thresholds sit in one config file."

## FFT and Butterworth in simple words
**FFT**: any signal is a sum of sine waves; the FFT shows how much of each frequency is present. Slow trends appear at low frequency, random jitter spreads over high frequencies.
**Butterworth low-pass**: passes frequencies below the cutoff almost unchanged (flat), is -3 dB at the cutoff, and attenuates above it; higher order = steeper roll-off. IIR = uses feedback (sharp with few coefficients). `sosfiltfilt` runs it forward and backward so there is no time delay.

## Limitations / future scope
* No timestamps: time axis and fs are assumed; this CSV looks grouped by crop, so a window is not a true time series. Real logged sensor data would fix this.
* No soil moisture / light / chlorophyll reference -> no calibration; greenness depends on camera and lighting, and lesions lower leaf-mean values.
* Health thresholds are generic engineering rules, not agronomically validated for a specific crop.
* Future: live sensor stream (ESP32/MQTT), SPAD calibration, other filters (Chebyshev, FIR, notch), lesion segmentation, per-crop thresholds.
