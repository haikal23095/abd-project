#!/usr/bin/env python3
"""
train_anomaly_model.py — Train Isolation Forest Model for Web Request Anomaly Detection
Saves trained model to app/Services/Python/model/anomaly_model.pkl
"""

import os
import sys
import json
import random

try:
    import numpy as np
    from sklearn.ensemble import IsolationForest
    import joblib
    SKLEARN_AVAILABLE = True
except ImportError:
    SKLEARN_AVAILABLE = False


MODEL_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "model")
MODEL_PATH = os.path.join(MODEL_DIR, "anomaly_model.pkl")
META_PATH = os.path.join(MODEL_DIR, "model_meta.json")

METHOD_MAP = {
    "GET": 0,
    "POST": 1,
    "PUT": 2,
    "DELETE": 3,
    "HEAD": 4,
    "OPTIONS": 5,
}

def get_method_code(method: str) -> int:
    return METHOD_MAP.get(str(method).upper(), 6)


def generate_synthetic_training_data(n_samples: int = 2000):
    """
    Generates realistic web traffic feature vectors for Isolation Forest training:
    Features: [status_code, request_rate, bytes_sent, is_bot, method_code]
    """
    features = []
    
    # 85% normal traffic
    n_normal = int(n_samples * 0.85)
    for _ in range(n_normal):
        status = random.choices([200, 301, 304, 404], weights=[0.85, 0.05, 0.05, 0.05])[0]
        rate = max(1.0, random.gauss(15.0, 8.0))       # ~5-30 req/min
        bytes_sent = max(100, int(random.gauss(4500, 2500)))
        bot = 1 if random.random() < 0.20 else 0
        method = random.choices([0, 1, 4], weights=[0.80, 0.18, 0.02])[0]
        features.append([status, rate, bytes_sent, bot, method])

    # 15% anomalies: scrapers, brute force, credential stuffing, scanning, DoS
    n_anomaly = n_samples - n_normal
    for _ in range(n_anomaly):
        scenario = random.choice(["scraper", "brute_force", "probe", "payload_bomb"])
        if scenario == "scraper":
            status = random.choice([429, 200, 403])
            rate = random.uniform(250.0, 700.0)         # high rate
            bytes_sent = random.randint(500, 2000)
            bot = 1
            method = 0
        elif scenario == "brute_force":
            status = random.choice([401, 403, 429])
            rate = random.uniform(150.0, 500.0)
            bytes_sent = random.randint(400, 1200)
            bot = random.choice([0, 1])
            method = 1
        elif scenario == "probe":
            status = random.choice([404, 403, 500])
            rate = random.uniform(60.0, 200.0)
            bytes_sent = random.randint(200, 800)
            bot = 1
            method = random.choice([0, 1, 2, 3])
        else: # payload bomb
            status = random.choice([413, 500, 200])
            rate = random.uniform(10.0, 50.0)
            bytes_sent = random.randint(50000, 2000000) # very large payload
            bot = 0
            method = 1

        features.append([status, rate, bytes_sent, bot, method])

    return features


def train_model():
    os.makedirs(MODEL_DIR, exist_ok=True)
    features = generate_synthetic_training_data(3000)

    if SKLEARN_AVAILABLE:
        X = np.array(features)
        model = IsolationForest(
            n_estimators=100,
            contamination=0.15,
            random_state=42,
            n_jobs=-1
        )
        model.fit(X)

        joblib.dump(model, MODEL_PATH)
        print(f"Scikit-learn Isolation Forest model successfully saved to: {MODEL_PATH}")
    else:
        # Create a lightweight fallback marker / heuristics parameters
        fallback_data = {
            "type": "heuristic_fallback",
            "weights": {
                "high_rate_threshold": 120.0,
                "critical_rate_threshold": 300.0,
                "suspicious_status_codes": [401, 403, 429, 500],
                "payload_threshold": 500000,
            }
        }
        with open(MODEL_PATH, "wb") as f:
            f.write(json.dumps(fallback_data).encode("utf-8"))
        print(f"Fallback model parameters saved to: {MODEL_PATH} (scikit-learn not installed)")

    # Save metadata
    meta = {
        "features": ["status_code", "request_rate", "bytes_sent", "is_bot", "method_code"],
        "contamination": 0.15,
        "n_samples": len(features),
        "sklearn_used": SKLEARN_AVAILABLE,
        "clusters": {
            "-1": [
                "Cluster -1 · Aggressive Scraper Bot",
                "Cluster -1 · Credential Stuffing Attack",
                "Cluster -1 · Vulnerability Probe / Scanner",
                "Cluster -1 · Rate Limit Exceeded (HTTP 429)",
            ],
            "0": "Cluster 0 · Normal Web Traffic",
            "1": "Cluster 1 · High-Volume API Polling (Authorized)"
        }
    }
    with open(META_PATH, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)

    print("Training finished successfully.")


if __name__ == "__main__":
    train_model()
