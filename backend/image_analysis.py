"""Leaf image processing: segmentation, RGB stats, ExG, normalized green."""
import base64
import cv2
import numpy as np
from config import GREENNESS


def _b64(img_bgr):
    ok, buf = cv2.imencode(".png", img_bgr)
    return "data:image/png;base64," + base64.b64encode(buf).decode()


def segment_leaf(bgr):
    """Separate leaf from background using HSV saturation + Otsu threshold."""
    hsv = cv2.cvtColor(cv2.GaussianBlur(bgr, (5, 5), 0), cv2.COLOR_BGR2HSV)
    sat = hsv[:, :, 1]
    _, mask = cv2.threshold(sat, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, k, iterations=2)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, k)
    # keep only the largest connected blob (the leaf) and fill holes
    n, lab, stats, _ = cv2.connectedComponentsWithStats(mask)
    if n > 1:
        big = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
        mask = np.where(lab == big, 255, 0).astype(np.uint8)
    cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    filled = np.zeros_like(mask)
    cv2.drawContours(filled, cnts, -1, 255, cv2.FILLED)
    return filled


def classify_greenness(index_value):
    if index_value < GREENNESS["low_below"]:
        return "Low"
    if index_value > GREENNESS["high_above"]:
        return "High"
    return "Moderate"


def analyze_leaf(bgr):
    """Return RGB stats, ExG, normalized green, greenness class and processed images."""
    bgr = cv2.resize(bgr, (256, 256)) if max(bgr.shape[:2]) > 512 else bgr
    mask = segment_leaf(bgr)
    cov = float((mask > 0).mean())
    if cov < 0.03:
        raise ValueError("Leaf could not be segmented (too few leaf pixels found).")

    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB).astype(np.float64)
    px = rgb[mask > 0]                      # N x 3 leaf pixels
    R, G, B = px[:, 0], px[:, 1], px[:, 2]
    total = R + G + B + 1e-9
    exg_raw = 2 * G - R - B                 # ExG on 0-255 scale
    g_norm = G / total                      # normalized green g = G/(R+G+B)
    exg_norm = 2 * g_norm - R / total - B / total  # chromatic ExG, brightness independent
    exg_mean = float(exg_norm.mean())
    ngrdi = float(((G - R) / (G + R + 1e-9)).mean())  # normalized green-red difference
    level = classify_greenness(ngrdi)

    # processed visuals
    leaf_only = bgr.copy(); leaf_only[mask == 0] = (235, 240, 235)
    full_exg = np.zeros(mask.shape); r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    full_exg = (2 * g - r - b) / (r + g + b + 1e-9)
    heat = np.clip((full_exg + 0.1) / 0.6, 0, 1)
    heat = cv2.applyColorMap((heat * 255).astype(np.uint8), cv2.COLORMAP_VIRIDIS)
    heat[mask == 0] = (235, 240, 235)
    hist = {c: np.histogram(px[:, i], bins=32, range=(0, 256))[0].tolist() for i, c in enumerate("RGB")}

    return {
        "rgb_mean": {"R": round(float(R.mean()), 1), "G": round(float(G.mean()), 1), "B": round(float(B.mean()), 1)},
        "exg_raw_mean": round(float(exg_raw.mean()), 2),
        "exg_norm_mean": round(exg_mean, 4),
        "green_norm_mean": round(float(g_norm.mean()), 4),
        "leaf_coverage_pct": round(cov * 100, 1),
        "greenness_level": level,
        "ngrdi_mean": round(ngrdi, 4),
        "greenness_score": round(float(np.clip((ngrdi - 0.0) / 0.3, 0, 1) * 100), 1),
        "histogram": {"bins": list(range(4, 256, 8)), **hist},
        "images": {"original": _b64(bgr), "segmented": _b64(leaf_only), "exg_map": _b64(heat), "mask": _b64(mask)},
        "note": "Greenness is an RGB-based proxy for chlorophyll; it is not a laboratory chlorophyll concentration.",
    }
