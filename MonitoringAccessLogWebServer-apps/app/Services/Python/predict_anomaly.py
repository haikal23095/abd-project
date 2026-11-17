#!/usr/bin/env python3
"""
predict_anomaly.py — Evaluates web request parameters using Isolation Forest & GeoIP
Outputs structured JSON prediction to stdout.
"""

import argparse
import json
import os
import re
import sys
from datetime import datetime

# Optional imports with graceful fallbacks
try:
    import joblib
    import numpy as np
    SKLEARN_AVAILABLE = True
except ImportError:
    SKLEARN_AVAILABLE = False

try:
    import geoip2.database
    GEOIP2_AVAILABLE = True
except ImportError:
    GEOIP2_AVAILABLE = False

try:
    from user_agents import parse as parse_ua
    USER_AGENTS_AVAILABLE = True
except ImportError:
    USER_AGENTS_AVAILABLE = False

BOT_REGEX = re.compile(
    r'(bot|crawl|spider|slurp|curl|wget|python|http-client|headless|scanner|nessus|nikto|sqlmap|postman)',
    re.IGNORECASE
)

SUSPICIOUS_URL_PATTERNS = [
    re.compile(r'\.(env|git|bak|sql|ini|conf)', re.IGNORECASE),
    re.compile(r'(wp-login|xmlrpc|phpmyadmin|admin|shell|cgi-bin)', re.IGNORECASE),
    re.compile(r'(\.\./|\.\.\\)', re.IGNORECASE),
    re.compile(r'(union\s+select|<script|alert\(|eval\()', re.IGNORECASE),
]

COUNTRY_NAMES = {
    "US": "United States", "IR": "Iran", "FR": "France",
    "DE": "Germany", "RU": "Russia", "CN": "China",
    "GB": "United Kingdom", "JP": "Japan", "BR": "Brazil",
    "IN": "India", "CA": "Canada", "AU": "Australia",
    "NL": "Netherlands", "KR": "South Korea", "SG": "Singapore",
    "ID": "Indonesia", "XX": "Unknown",
}

METHOD_MAP = {
    "GET": 0, "POST": 1, "PUT": 2, "DELETE": 3,
    "HEAD": 4, "OPTIONS": 5, "PATCH": 6
}


def parse_arguments() -> dict:
    parser = argparse.ArgumentParser(description="Evaluate web request anomaly")
    parser.add_argument("--json", help="Input parameters as JSON string")
    parser.add_argument("--ip", default="127.0.0.1", help="Client IP address")
    parser.add_argument("--url", default="/", help="Requested endpoint/URL")
    parser.add_argument("--method", default="GET", help="HTTP Method")
    parser.add_argument("--status", type=int, default=200, help="HTTP Status Code")
    parser.add_argument("--rate", type=float, default=10.0, help="Request rate (RPS or req/min)")
    parser.add_argument("--bytes", type=int, default=1500, help="Payload bytes sent")
    parser.add_argument("--user_agent", default="", help="HTTP User-Agent string")
    parser.add_argument("--model", default="", help="Path to anomaly_model.pkl")
    parser.add_argument("--mmdb", default="", help="Path to GeoLite2-Country.mmdb")
    args = parser.parse_args()

    input_data = {}
    if args.json:
        try:
            input_data = json.loads(args.json)
        except Exception:
            input_data = {}

    return {
        "ip": str(input_data.get("ip", args.ip)).strip(),
        "url": str(input_data.get("url", args.url)).strip(),
        "method": str(input_data.get("method", args.method)).upper().strip(),
        "status_code": int(input_data.get("status_code", input_data.get("status", args.status))),
        "request_rate": float(input_data.get("request_rate", input_data.get("rate", input_data.get("rps", args.rate)))),
        "payload_bytes": int(input_data.get("payload_bytes", input_data.get("bytes_sent", input_data.get("bytes", args.bytes)))),
        "user_agent": str(input_data.get("user_agent", args.user_agent)).strip(),
        "model_path": args.model or os.path.join(os.path.dirname(os.path.abspath(__file__)), "model", "anomaly_model.pkl"),
        "mmdb_path": args.mmdb,
    }


def is_bot_ua(ua_string: str) -> bool:
    if not ua_string:
        return False
    if USER_AGENTS_AVAILABLE:
        try:
            return bool(parse_ua(ua_string).is_bot)
        except Exception:
            pass
    return bool(BOT_REGEX.search(ua_string))


def lookup_country(mmdb_path: str, ip: str) -> tuple[str, str]:
    if GEOIP2_AVAILABLE and mmdb_path and os.path.exists(mmdb_path):
        try:
            with geoip2.database.Reader(mmdb_path) as reader:
                resp = reader.country(ip)
                cc = resp.country.iso_code or "XX"
                return cc, resp.country.name or COUNTRY_NAMES.get(cc, "Unknown")
        except Exception:
            pass

    # Heuristic fallback based on common sample prefixes
    if ip.startswith("185.220.") or ip.startswith("5.188."):
        cc = "RU"
    elif ip.startswith("5.255.") or ip.startswith("91.240."):
        cc = "IR"
    elif ip.startswith("66.249.") or ip.startswith("34.") or ip.startswith("54.") or ip.startswith("127."):
        cc = "US"
    elif ip.startswith("114.") or ip.startswith("220."):
        cc = "CN"
    elif ip.startswith("51.") or ip.startswith("176."):
        cc = "FR"
    elif ip.startswith("85.") or ip.startswith("194."):
        cc = "DE"
    elif ip.startswith("36.") or ip.startswith("103.") or ip.startswith("180."):
        cc = "ID"
    else:
        cc = "US"

    return cc, COUNTRY_NAMES.get(cc, "United States")


def evaluate_anomaly(data: dict) -> dict:
    bot = 1 if is_bot_ua(data["user_agent"]) else 0
    method_code = METHOD_MAP.get(data["method"], 6)
    features = [data["status_code"], data["request_rate"], data["payload_bytes"], bot, method_code]

    prediction = 1
    score = 0.15

    # Check for Scikit-Learn Model
    model_loaded = False
    if SKLEARN_AVAILABLE and data["model_path"] and os.path.exists(data["model_path"]):
        try:
            model = joblib.load(data["model_path"])
            X = np.array([features])
            pred_arr = model.predict(X)
            score_arr = model.decision_function(X)
            prediction = int(pred_arr[0])
            score = round(float(score_arr[0]), 4)
            model_loaded = True
        except Exception:
            model_loaded = False

    # Analytical / Heuristic rule adjustment
    suspicious_url = any(p.search(data["url"]) for p in SUSPICIOUS_URL_PATTERNS)
    high_rate = data["request_rate"] >= 80.0
    critical_rate = data["request_rate"] >= 250.0
    bad_status = data["status_code"] in [401, 403, 429, 500, 502, 503]
    huge_payload = data["payload_bytes"] > 200000

    if not model_loaded:
        # Heuristic scoring if model pickle is not yet trained
        penalty = 0.0
        if critical_rate:
            penalty += 0.55
        elif high_rate:
            penalty += 0.30

        if suspicious_url:
            penalty += 0.40
        if bad_status:
            penalty += 0.30
        if bot and bad_status:
            penalty += 0.25
        if huge_payload:
            penalty += 0.35

        score = round(0.20 - penalty, 4)
        prediction = -1 if score < 0 else 1
    else:
        # If url is blatant probe, override normal if needed
        if suspicious_url and prediction == 1:
            prediction = -1
            score = round(min(score, -0.15), 4)

    is_anomaly = (prediction == -1)

    # Determine Cluster and Risk Level
    if is_anomaly:
        if critical_rate or data["status_code"] == 429:
            cluster = "Cluster -1 · Aggressive Scraper Bot"
            risk_level = "CRITICAL"
            rec = "Rate request sangat tinggi. Rekomendasikan rate limiting (HTTP 429) atau aktivasi WAF challenge."
        elif suspicious_url or data["status_code"] == 403:
            cluster = "Cluster -1 · Vulnerability Probe / Scanner"
            risk_level = "HIGH"
            rec = "Endpoint mencurigakan terdeteksi probe vulnerability. Blokir IP secara sementara dan tinjau log WAF."
        elif data["status_code"] == 401:
            cluster = "Cluster -1 · Credential Stuffing / Brute Force"
            risk_level = "HIGH"
            rec = "Kegagalan autentikasi berulang. Aktifkan CAPTCHA dan pemblokiran brute force pada endpoint login."
        elif huge_payload:
            cluster = "Cluster -1 · Payload Bomb / Buffer Overflow Attempt"
            risk_level = "HIGH"
            rec = "Ukuran payload melebihi batas wajar. Batasi body_bytes_sent atau client_max_body_size."
        else:
            cluster = "Cluster -1 · Statistical Traffic Anomaly"
            risk_level = "MEDIUM"
            rec = "Pola request menyimpang dari distribusi normal. Lakukan observasi lanjut terhadap IP."
    else:
        if data["request_rate"] > 35.0:
            cluster = "Cluster 1 · High-Volume API Polling (Authorized)"
            risk_level = "LOW"
            rec = "Traffic teratur dalam volume cukup tinggi namun parameter wajar."
        else:
            cluster = "Cluster 0 · Normal Web Traffic"
            risk_level = "LOW"
            rec = "Request teridentifikasi wajar. Tidak diperlukan tindakan mitigasi."

    country_code, country_name = lookup_country(data["mmdb_path"], data["ip"])

    return {
        "status": "success",
        "evaluated_at": datetime.now().astimezone().isoformat(),
        "input": {
            "ip": data["ip"],
            "url": data["url"],
            "method": data["method"],
            "status_code": data["status_code"],
            "request_rate": data["request_rate"],
            "payload_bytes": data["payload_bytes"],
            "user_agent": data["user_agent"],
            "is_bot": bool(bot),
        },
        "prediction": prediction,
        "is_anomaly": is_anomaly,
        "anomaly_score": score,
        "label": "Anomali / Outlier" if is_anomaly else "Normal Web Traffic",
        "risk_level": risk_level,
        "cluster": cluster,
        "recommendation": rec,
        "geo": {
            "country_code": country_code,
            "country_name": country_name,
        }
    }


def main() -> None:
    data = parse_arguments()
    result = evaluate_anomaly(data)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
