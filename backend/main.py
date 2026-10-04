"""FastAPI app: REST APIs for dataset, DSP, leaf analysis and plant health."""
import cv2
import numpy as np
import pandas as pd
from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional
from treatment import get_suggestions

import config
from dsp import run_dsp
from health import assess
from image_analysis import analyze_leaf

app = FastAPI(title="Plant Health & Chlorophyll Monitoring using DSP")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


def load_df():
    if not config.CSV_PATH.exists():
        raise HTTPException(404, f"Dataset not found at {config.CSV_PATH}")
    df = pd.read_csv(config.CSV_PATH)
    return df[[c for c in config.SENSOR_COLUMNS if c in df.columns]]


def list_images():
    if not config.IMAGE_DIR.exists():
        return []
    return sorted(p.name for p in config.IMAGE_DIR.iterdir() if p.suffix.lower() in (".jpg", ".jpeg", ".png"))


def decode(data: bytes):
    img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(400, "File is not a valid image.")
    return img


def safe_leaf(img):
    try:
        return analyze_leaf(img)
    except ValueError as e:
        raise HTTPException(422, str(e))

def get_leaf_signal(img):
    """
    Extract green-channel intensity from leaf pixels.
    Each leaf pixel becomes one discrete-time sample x[n].
    """
    img = cv2.resize(img, (256, 256)) if max(img.shape[:2]) > 512 else img

    mask = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    sat = mask[:, :, 1]

    _, leaf_mask = cv2.threshold(
        sat, 0, 255,
        cv2.THRESH_BINARY + cv2.THRESH_OTSU
    )

    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    leaf_mask = cv2.morphologyEx(
        leaf_mask, cv2.MORPH_CLOSE, k, iterations=2
    )
    leaf_mask = cv2.morphologyEx(
        leaf_mask, cv2.MORPH_OPEN, k
    )

    n, lab, stats, _ = cv2.connectedComponentsWithStats(leaf_mask)

    if n > 1:
        big = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
        leaf_mask = np.where(lab == big, 255, 0).astype(np.uint8)

    # Convert BGR → RGB
    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

    # Green values from leaf pixels only
    green = rgb[:, :, 1][leaf_mask > 0].astype(float)

    if len(green) < 16:
        raise HTTPException(
            422,
            "Not enough leaf pixels for DSP analysis."
        )

    return green



@app.get("/api/status")
def status():
    return {"ok": True, "csv_found": config.CSV_PATH.exists(), "images": len(list_images())}


@app.get("/api/dataset/info")
def dataset_info():
    df = load_df()
    return {
        "rows": len(df), "columns": list(df.columns), "units": config.UNITS,
        "stats": df.describe().round(3).to_dict(),
        "missing_values": int(df.isna().sum().sum()),
        "not_in_dataset": ["soil moisture", "light intensity"],
        "defaults": config.DSP_DEFAULTS,
    }


@app.get("/api/images")
def images(offset: int = 0, limit: int = 24):
    names = list_images()
    return {"total": len(names), "items": names[offset:offset + limit]}


@app.get("/api/images/{name}")
def get_image(name: str):
    p = (config.IMAGE_DIR / name).resolve()
    if config.IMAGE_DIR.resolve() not in p.parents or not p.exists():
        raise HTTPException(404, "Image not found")
    return FileResponse(p)


@app.post("/api/analyze/upload")
async def analyze_upload(file: UploadFile = File(...)):
    return safe_leaf(decode(await file.read()))


@app.get("/api/analyze/sample")
def analyze_sample(name: str):
    p = (config.IMAGE_DIR / name).resolve()
    if config.IMAGE_DIR.resolve() not in p.parents or not p.exists():
        raise HTTPException(404, "Sample image not found")
    return safe_leaf(decode(p.read_bytes()))


# @app.get("/api/dsp")
# def dsp(column: str = "temperature", start: int = 0, n: int = 256,
#         fs: float = config.DSP_DEFAULTS["fs"], cutoff: float = config.DSP_DEFAULTS["cutoff"],
#         order: int = Query(config.DSP_DEFAULTS["order"], ge=1, le=10)):
#     df = load_df()
#     if column not in df.columns:
#         raise HTTPException(400, f"Column '{column}' not in dataset. Available: {list(df.columns)}")
#     if start < 0 or start >= len(df) - 16:
#         raise HTTPException(400, f"start must be between 0 and {len(df) - 17}")
#     seg = df.iloc[start:start + n]
#     try:
#         out = run_dsp(seg[column].to_numpy(), fs, cutoff, order)
#     except ValueError as e:
#         raise HTTPException(422, str(e))
#     # "current readings" = last sample of the filtered window for each real column
#     readings = {}
#     for c in df.columns:
#         try:
#             readings[c] = round(float(run_dsp(seg[c].to_numpy(), fs, cutoff, order)["filtered"][-1]), 2)
#         except ValueError:
#             readings[c] = None
#     out.update(column=column, unit=config.UNITS.get(column, ""), start=start, readings=readings,
#                time_axis_note="No timestamps in CSV: row index = n; assumed 1 reading/hour.")
#     return out

@app.get("/api/dsp")
def dsp(
    leaf: str,
    fs: float = config.DSP_DEFAULTS["fs"],
    cutoff: float = config.DSP_DEFAULTS["cutoff"],
    order: int = Query(config.DSP_DEFAULTS["order"], ge=1, le=10)
):
    """
    DSP analysis of the selected leaf.

    Signal:
        x[n] = green-channel intensity of leaf pixels

    Processing:
        x[n] → Butterworth IIR low-pass → y[n]
             → FFT
    """

    p = (config.IMAGE_DIR / leaf).resolve()

    if config.IMAGE_DIR.resolve() not in p.parents or not p.exists():
        raise HTTPException(404, "Leaf image not found")

    try:
        img = decode(p.read_bytes())

        # Extract green intensity signal
        x = get_leaf_signal(img)

        # Limit signal to a reasonable number of samples
        max_samples = 512

        if len(x) > max_samples:
            indices = np.linspace(
                0,
                len(x) - 1,
                max_samples
            ).astype(int)

            x = x[indices]

        out = run_dsp(
            x,
            fs,
            cutoff,
            order
        )

    except ValueError as e:
        raise HTTPException(422, str(e))

    out.update(
        leaf=leaf,
        column="leaf_green_intensity",
        unit="pixel intensity",
        time_axis_note=(
            "x[n] = green-channel intensity sampled from "
            "leaf pixels. Pixel order is used as the discrete-time index."
        )
    )

    return out




class HealthIn(BaseModel):
    greenness_level: str
    readings: dict


@app.post("/api/health")
def health(body: HealthIn):
    if body.greenness_level not in ("Low", "Moderate", "High"):
        raise HTTPException(400, "greenness_level must be Low, Moderate or High")
    return assess(body.greenness_level, body.readings)

@app.post("/api/treatment")
def treatment(body: HealthIn):
    if body.greenness_level not in ("Low", "Moderate", "High"):
        raise HTTPException(400, "greenness_level must be Low, Moderate or High")
    return get_suggestions(body.greenness_level, body.readings)

@app.get("/api/config")
def get_config():
    return {"greenness": config.GREENNESS, "env_rules": config.ENV_RULES,
            "green_points": config.GREEN_POINTS, "health_levels": config.HEALTH_LEVELS}
