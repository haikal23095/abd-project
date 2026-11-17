#!/usr/bin/env python3
"""
generate_sample_log.py — Generates realistic sample Nginx access.log for testing
"""

import os
import random
from datetime import datetime, timedelta

ips = {
    'US': ['66.249.66.1', '34.120.45.67', '54.210.88.90', '199.16.156.12'],
    'IR': ['5.255.231.10', '91.240.118.45', '185.143.232.11', '5.200.12.33'],
    'RU': ['185.220.101.34', '5.188.62.77', '95.173.136.24', '194.26.29.112'],
    'FR': ['51.15.89.201', '176.31.22.84', '212.129.5.18', '51.38.120.44'],
    'DE': ['85.214.132.80', '194.95.24.12', '144.76.88.19', '88.198.50.22'],
    'CN': ['114.119.160.22', '220.181.108.77', '123.125.71.56', '180.149.130.16'],
}

urls = [
    ('/api/v1/auth/session', 'POST', 200, 1540),
    ('/assets/bundle.min.js', 'GET', 200, 142090),
    ('/api/v2/catalog/items', 'GET', 200, 8420),
    ('/robots.txt', 'GET', 200, 420),
    ('/wp-login.php', 'POST', 403, 1120),
    ('/.env', 'GET', 403, 512),
    ('/xmlrpc.php', 'POST', 403, 890),
    ('/checkout/summary', 'GET', 200, 4320),
    ('/healthz', 'GET', 200, 120),
    ('/sitemap.xml', 'GET', 200, 2400),
]

uas = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
    'Googlebot/2.1 (+http://www.google.com/bot.html)',
    'python-requests/2.31.0',
    'sqlmap/1.7.2#stable (https://sqlmap.org)',
    'Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)',
    'curl/7.88.1',
]

def generate(output_path: str, count: int = 3500):
    base_time = datetime(2026, 11, 1, 0, 0, 0)
    lines = []

    for _ in range(count):
        country = random.choices(['US', 'IR', 'RU', 'CN', 'DE', 'FR'], weights=[0.28, 0.24, 0.18, 0.14, 0.09, 0.07])[0]
        ip = random.choice(ips[country])
        url_info = random.choice(urls)
        ua = random.choices(uas, weights=[0.50, 0.20, 0.12, 0.08, 0.03, 0.04, 0.03])[0]
        
        status = url_info[2]
        if 'sqlmap' in ua or 'curl' in ua or url_info[0] in ['/.env', '/wp-login.php', '/xmlrpc.php']:
            status = random.choice([401, 403, 429, 404])

        day_offset = random.randint(0, 9)
        second_offset = random.randint(0, 86399)
        cur_time = base_time + timedelta(days=day_offset, seconds=second_offset)
        time_str = cur_time.strftime('%d/%b/%Y:%H:%M:%S +0000')
        
        line = f'{ip} - - [{time_str}] "{url_info[1]} {url_info[0]} HTTP/1.1" {status} {url_info[3]} "-" "{ua}"'
        lines.append((cur_time, line))

    lines.sort(key=lambda x: x[0])

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, 'w', encoding='utf-8') as f:
        for _, l in lines:
            f.write(l + '\n')

    print(f"Generated {len(lines)} log lines into {output_path}")

if __name__ == "__main__":
    target = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "storage", "logs", "access.log")
    generate(target)
