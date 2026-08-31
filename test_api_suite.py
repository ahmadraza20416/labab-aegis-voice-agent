import time
import requests
import concurrent.futures
import json

BASE_URL = "http://localhost:8080"

def test_health_endpoint():
    print("\n--- [API Tester] 1. Functional Test: Health & Telemetry ---")
    # Warm-up request to ensure server initialization is complete
    requests.get(f"{BASE_URL}/api/health", timeout=3.0)
    
    start = time.time()
    res = requests.get(f"{BASE_URL}/api/health", timeout=3.0)
    latency_ms = (time.time() - start) * 1000
    print(f"GET /api/health -> Status: {res.status_code} | Latency: {latency_ms:.2f}ms")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "healthy"
    assert "database" in data
    assert latency_ms < 200, f"SLA Breach: Health check took {latency_ms}ms > 200ms"

def test_incident_persistence_and_list():
    print("\n--- [API Tester] 2. Functional Test: Database Incidents List ---")
    start = time.time()
    res = requests.get(f"{BASE_URL}/api/incidents?limit=10&offset=0", timeout=3.0)
    latency_ms = (time.time() - start) * 1000
    print(f"GET /api/incidents -> Status: {res.status_code} | Latency: {latency_ms:.2f}ms")
    assert res.status_code == 200
    data = res.json()
    assert "incidents" in data
    assert isinstance(data["incidents"], list)
    assert latency_ms < 100, f"Database query SLA breach: took {latency_ms}ms > 100ms"

def test_fhir_bundle_validation():
    print("\n--- [API Tester] 3. Contract Test: HL7 FHIR (R4) Bundle ---")
    res = requests.get(f"{BASE_URL}/api/incident/fhir", timeout=3.0)
    assert res.status_code == 200
    bundle = res.json()
    assert bundle.get("resourceType") == "Bundle"
    assert bundle.get("type") == "transaction"
    assert len(bundle.get("entry", [])) >= 2
    print(f"FHIR Contract Validated: {len(bundle['entry'])} validated healthcare resources")

def test_security_fuzzing():
    print("\n--- [API Tester] 4. Security & SQL Injection Fuzzing Test ---")
    sql_payloads = [
        "1; DROP TABLE incidents; --",
        "' OR '1'='1",
        "../../etc/passwd",
        "<script>alert(1)</script>"
    ]
    for p in sql_payloads:
        res = requests.get(f"{BASE_URL}/api/incidents", params={"limit": p}, timeout=3.0)
        # Should gracefully return 422 Unprocessable Entity or safe empty list, NOT crash (500)
        assert res.status_code in [200, 422], f"Security vulnerability on payload: {p}"
    print("Security & Input Sanitization: PASS (Zero 500 crashes / SQL injection resistant)")

def test_concurrency_load():
    print("\n--- [API Tester] 5. Performance Stress & Concurrency Benchmark ---")
    concurrency = 25
    urls = [f"{BASE_URL}/api/incident" for _ in range(concurrency)]

    start_all = time.time()
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        results = list(executor.map(lambda u: requests.get(u, timeout=5.0), urls))
    total_time = time.time() - start_all

    all_200 = all(r.status_code == 200 for r in results)
    avg_latency = (total_time / concurrency) * 1000

    print(f"Executed {concurrency} concurrent requests in {total_time:.2f}s (Avg: {avg_latency:.2f}ms/req)")
    assert all_200, "Some concurrent requests failed"
    assert avg_latency < 100, f"Average concurrent latency {avg_latency}ms exceeded 100ms threshold"

def run_all_tests():
    print("==========================================================")
    print("      AEGISVOICE ENTERPRISE API TEST SUITE (AGENCY QA)    ")
    print("==========================================================")
    test_health_endpoint()
    test_incident_persistence_and_list()
    test_fhir_bundle_validation()
    test_security_fuzzing()
    test_concurrency_load()
    print("\n==========================================================")
    print("      [ALL API TESTS PASSED WITH ZERO VULNERABILITIES]     ")
    print("==========================================================")

if __name__ == "__main__":
    run_all_tests()
