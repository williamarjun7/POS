# k6 Performance Tests

Load testing scripts for the POS system using [k6](https://k6.io/).

## Prerequisites

Install k6:

```bash
# Windows (Chocolatey)
choco install k6

# Windows (winget)
winget install k6

# macOS
brew install k6

# Linux (Debian/Ubuntu)
sudo apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6
```

## Quick Start

### 1. Set environment variables

```bash
export K6_BASE_URL=https://your-app.region.insforge.app
export K6_ANON_KEY=your-anon-key
export TEST_EMAIL=admin@pos.example.com
export TEST_PASSWORD=your-password
```

### 2. Run a smoke test (1 VU — verify scripts work)

```bash
k6 run tests/k6/login.js
```

### 3. Run a specific test with custom VUs

```bash
k6 run --vus 50 --duration 5m tests/k6/order-creation.js
```

## Available Tests

| Script | Description | Key Metrics |
|--------|-------------|-------------|
| `login.js` | Authentication flow | Login speed, token issuance |
| `menu-load.js` | Menu category + item loading | Browse speed, search latency |
| `order-creation.js` | Create batch + add items | Cart add < 50ms, batch < 200ms |
| `payment-processing.js` | Cash, QR, Credit, Split payments | Payment completion < 1s |
| `dashboard-load.js` | All dashboard API endpoints | Full dashboard < 1s |
| `rooms-booking.js` | Room browse + booking + check-in | Booking < 200ms |
| `mixed-workload.js` | Realistic POS usage mix | Recommended for benchmarking |

## Load Stages

Each script supports these stage presets (from `config.js`):

| Stage | VUs | Duration | Purpose |
|-------|-----|----------|---------|
| **smoke** | 1 | ~25s | Verify script works |
| **load** | 10→50 | ~3m | Normal production load |
| **stress** | 50→1000 | ~8m | Find breaking point |
| **endurance** | 20 | 8h+ | Memory leak detection |
| **spike** | 10→200 | ~5m | Sudden traffic surge |

Run with a specific stage preset:

```bash
# Smoke test
k6 run --stage 10s:1,10s:1,5s:0 tests/k6/login.js

# Stress test
k6 run --stage 1m:50,1m:100,1m:200,1m:300,1m:500,1m:1000,2m:1000,1m:0 tests/k6/mixed-workload.js
```

## Thresholds

Tests fail automatically if these targets aren't met:

| Metric | Target | Behavior |
|--------|--------|----------|
| Average | < 200ms | Warning |
| P95 | < 500ms | Warning |
| P99 | < 1s | Warning |
| Error rate | < 1% | **Aborts on fail** |

## Output Formats

```bash
# Text summary (default)
k6 run tests/k6/mixed-workload.js

# JSON output (for CI)
k6 run --out json=results.json tests/k6/mixed-workload.js

# CSV summary
k6 run --out csv=results.csv tests/k6/mixed-workload.js

# Grafana Cloud (for dashboards)
k6 run --out cloud tests/k6/mixed-workload.js
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `K6_BASE_URL` | Yes | `http://localhost:5173` | API base URL |
| `K6_ANON_KEY` | Yes | `''` | API anon key |
| `TEST_EMAIL` | Yes | `test@pos.example.com` | Login email |
| `TEST_PASSWORD` | Yes | `test-password-123` | Login password |
| `MENU_ITEM_IDS` | No | `''` | Comma-separated menu item UUIDs |
| `TABLE_IDS` | No | `''` | Comma-separated table UUIDs |
| `ROOM_ID` | No | `null` | Room UUID for booking tests |
| `CUSTOMER_ID` | No | `null` | Customer UUID for credit tests |
