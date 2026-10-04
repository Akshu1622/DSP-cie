def get_suggestions(greenness_level, readings):
    suggestions = []

    if greenness_level == "Low":
        suggestions.append({
            "issue": "Low leaf greenness",
            "suggestion": "Inspect the leaf for nutrient deficiency or stress and check soil condition."
        })
    elif greenness_level == "Moderate":
        suggestions.append({
            "issue": "Moderate leaf greenness",
            "suggestion": "Monitor the plant closely and maintain suitable light, water and nutrient conditions."
        })
    else:
        suggestions.append({
            "issue": "Good leaf greenness",
            "suggestion": "Maintain the current growing conditions."
        })

    temp = readings.get("temperature")
    humidity = readings.get("humidity")
    ph = readings.get("ph")
    rainfall = readings.get("rainfall")

    if temp is not None:
        if temp > 35:
            suggestions.append({
                "issue": "High temperature",
                "suggestion": "Provide shade, improve ventilation and ensure adequate water availability."
            })
        elif temp < 10:
            suggestions.append({
                "issue": "Low temperature",
                "suggestion": "Protect the plant from cold conditions and avoid exposing it to cold drafts."
            })

    if humidity is not None:
        if humidity > 80:
            suggestions.append({
                "issue": "High humidity",
                "suggestion": "Improve air circulation and avoid unnecessary watering."
            })
        elif humidity < 40:
            suggestions.append({
                "issue": "Low humidity",
                "suggestion": "Increase humidity around the plant and monitor water requirements."
            })

    if ph is not None:
        if ph < 5.5:
            suggestions.append({
                "issue": "Low soil pH",
                "suggestion": "Check soil acidity and consider a suitable soil amendment after confirming the soil condition."
            })
        elif ph > 7.5:
            suggestions.append({
                "issue": "High soil pH",
                "suggestion": "Check soil alkalinity and consider an appropriate soil amendment."
            })

    if rainfall is not None:
        if rainfall > 80:
            suggestions.append({
                "issue": "High wetness/rainfall",
                "suggestion": "Avoid additional watering and ensure proper drainage."
            })
        elif rainfall < 20:
            suggestions.append({
                "issue": "Low wetness/rainfall",
                "suggestion": "Check soil moisture and provide irrigation if the soil is dry."
            })

    return {"suggestions": suggestions}