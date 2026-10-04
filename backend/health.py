"""Rule-based plant health fusion: greenness + environment readings (thresholds in config.py)."""
from config import ENV_RULES, GREEN_POINTS, HEALTH_LEVELS, UNITS

LABEL = {"temperature": "temperature", "humidity": "humidity", "ph": "soil pH", "rainfall": "rainfall (wetness proxy)"}


def env_points(name, v):
    r = ENV_RULES[name]
    if v >= r["high_severe"]: return 2, f"very high {LABEL[name]}"
    if v >= r["high_mild"]:   return 1, f"high {LABEL[name]}"
    if v <= r["low_severe"]:  return 2, f"very low {LABEL[name]}"
    if v <= r["low_mild"]:    return 1, f"low {LABEL[name]}"
    return 0, None


def assess(greenness_level, readings):
    pts, reasons = GREEN_POINTS.get(greenness_level, 0), []
    if pts: reasons.append(f"{greenness_level.lower()} leaf greenness")
    for k, v in readings.items():
        if k in ENV_RULES and v is not None:
            p, why = env_points(k, v)
            pts += p
            if why: reasons.append(why)
    if pts <= HEALTH_LEVELS["healthy_max"]: status = "HEALTHY"
    elif pts <= HEALTH_LEVELS["moderate_max"]: status = "MODERATELY STRESSED"
    else: status = "STRESSED"
    text = f"{status.title()}: {', '.join(reasons).capitalize()}." if reasons else "Healthy: all parameters within normal range."
    if status == "HEALTHY" and reasons: text = f"Healthy: minor note - {', '.join(reasons)}."
    return {"status": status, "stress_points": pts, "reasons": reasons, "message": text}
