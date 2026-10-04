"""DSP: discrete-time signal x[n], FFT, Butterworth IIR low-pass, noise metrics."""
import numpy as np
from scipy import signal


def spectrum(x, fs):
    """Single-sided magnitude spectrum via FFT (DC removed so it does not hide other bins)."""
    x = np.asarray(x, float) - np.mean(x)
    N = len(x)
    X = np.fft.rfft(x * np.hanning(N))          # Hann window reduces spectral leakage
    f = np.fft.rfftfreq(N, d=1.0 / fs)
    return f, (2.0 / N) * np.abs(X)


def butter_lowpass(x, fs, cutoff, order):
    """Butterworth IIR low-pass. sosfiltfilt = forward+backward => zero phase (doubles effective order)."""
    nyq = fs / 2.0
    if not 0 < cutoff < nyq:
        raise ValueError(f"Cutoff must be between 0 and Nyquist ({nyq:g}).")
    sos = signal.butter(order, cutoff / nyq, btype="low", output="sos")
    y = signal.sosfiltfilt(sos, x)
    # frequency response of the filter itself (single pass) for plotting
    w, h = signal.sosfreqz(sos, worN=256, fs=fs)
    return y, sos, w, 20 * np.log10(np.maximum(np.abs(h), 1e-6))


def noise_metrics(raw, filt, f_raw, mag_raw, f_f, mag_f, cutoff):
    """Noise = high-frequency content above the cutoff. Compare raw vs filtered."""
    hf = lambda f, m: float(np.sum(m[f > cutoff] ** 2)) + 1e-12
    hf_raw, hf_filt = hf(f_raw, mag_raw), hf(f_f, mag_f)
    d_raw, d_f = np.diff(raw), np.diff(filt)    # first difference ~ sample-to-sample jitter
    return {
        "noise_std_raw": round(float(np.std(raw - filt)), 4),
        "hf_energy_reduction_db": round(10 * np.log10(hf_raw / hf_filt), 2),
        "jitter_reduction_pct": round(100 * (1 - np.std(d_f) / (np.std(d_raw) + 1e-12)), 1),
        "variance_raw": round(float(np.var(raw)), 4),
        "variance_filtered": round(float(np.var(filt)), 4),
    }


def run_dsp(x, fs, cutoff, order):
    x = np.asarray(x, float)
    if len(x) < 16:
        raise ValueError("Need at least 16 samples for DSP analysis.")
    y, sos, w, h_db = butter_lowpass(x, fs, cutoff, order)
    f1, m1 = spectrum(x, fs)
    f2, m2 = spectrum(y, fs)
    r = lambda a: np.round(a, 4).tolist()
    return {
        "n": list(range(len(x))), "raw": r(x), "filtered": r(y),
        "freq": r(f1), "mag_raw": r(m1), "mag_filtered": r(m2),
        "filter_response": {"freq": r(w), "gain_db": r(h_db)},
        "params": {"fs": fs, "cutoff": cutoff, "order": order, "nyquist": fs / 2, "N": len(x),
                   "freq_resolution": round(fs / len(x), 5), "filter_type": "Butterworth IIR low-pass (zero-phase, sosfiltfilt)"},
        "metrics": noise_metrics(x, y, f1, m1, f2, m2, cutoff),
    }
