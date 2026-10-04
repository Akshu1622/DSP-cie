"""Configurable thresholds and DSP defaults. Edit here - no other code changes needed."""
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
CSV_PATH = DATA_DIR / "cpdata.csv"
IMAGE_DIR = DATA_DIR / "leaf_images"

# Real columns present in cpdata.csv (soil moisture / light are NOT in the dataset)
SENSOR_COLUMNS = ["temperature", "humidity", "ph", "rainfall"]
UNITS = {"temperature": "°C", "humidity": "%", "ph": "", "rainfall": "mm"}

# ---- DSP defaults ----
# The CSV has no timestamps, so ROW INDEX is treated as the sample index n.
# ASSUMPTION: one reading per hour -> fs = 1 sample/hour (cycles/hour axis).
DSP_DEFAULTS = {"fs": 1.0, "cutoff": 0.1, "order": 4, "n_samples": 256, "start": 0}

# ---- Greenness thresholds ----
# Class is decided on mean NGRDI = (G-R)/(G+R) over leaf pixels. NGRDI falls as leaves yellow,
# whereas chromatic ExG can rise for yellow-green leaves. ExG and G/(R+G+B) are still reported.
# Calibrated = 33rd / 67th percentile of NGRDI over all 1702 uploaded leaf images.
GREENNESS = {"index": "ngrdi", "low_below": 0.137, "high_above": 0.181}

# ---- Environment thresholds -> stress points ----
# (value, points) pairs are checked from most severe to least severe.
ENV_RULES = {
    "temperature": {"high_severe": 35, "high_mild": 30, "low_severe": 12, "low_mild": 18},
    "humidity":    {"high_severe": 95, "high_mild": 90, "low_severe": 30, "low_mild": 40},
    "ph":          {"high_severe": 8.0, "high_mild": 7.5, "low_severe": 5.0, "low_mild": 5.5},
    # rainfall is only a wetness PROXY, not soil moisture
    "rainfall":    {"high_severe": 300, "high_mild": 250, "low_severe": 30, "low_mild": 60},
}
GREEN_POINTS = {"Low": 2, "Moderate": 1, "High": 0}
# total stress points -> status
HEALTH_LEVELS = {"healthy_max": 1, "moderate_max": 3}  # >3 => STRESSED
