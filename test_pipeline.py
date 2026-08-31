import asyncio
import os
from core.models import EmergencyIncident, TriageLevel
from core.tools import EmergencyToolExecutor
from core.llm import LLMReasoningEngine
from core.tts import StreamingTTS
from core.triage import ClinicalTriageEngine
from core.agents import MultiAgentSwarm
from core.fhir import FHIRBundleExporter

async def test_full_pipeline():
    print("\n--- 1. Testing Incident & Emergency Tool Execution ---")
    incident = EmergencyIncident(incident_id="TEST-INC-PRO")
    
    # Test tool: dispatch_emergency_units
    d_res = EmergencyToolExecutor.execute(
        "dispatch_emergency_units",
        {
            "incident_type": "Severe Vehicle Collision",
            "units": ["AMBULANCE", "FIRE_ENGINE"],
            "priority": "RED",
            "location": "5th and Market St",
            "eta_minutes": 3,
            "dispatch_notes": "One trapped victim."
        },
        incident
    )
    print("Dispatch Result:", d_res["status"], f"({len(incident.dispatched_units)} units dispatched)")
    assert len(incident.dispatched_units) == 2
    assert incident.triage_level == TriageLevel.CRITICAL

    print("\n--- 2. Testing Clinical MPDS Triage Engine & AVPU Scoring ---")
    triage_eval = ClinicalTriageEngine.evaluate("Caller reports victim is unconscious and not breathing", {})
    print(f"MPDS Code: {triage_eval['mpds_code']} | Title: {triage_eval['mpds_title']}")
    print(f"AVPU: {triage_eval['avpu_status']} | GCS: {triage_eval['estimated_gcs']}")
    assert triage_eval["mpds_code"] == "09-E-01"
    assert triage_eval["avpu_status"] == "UNRESPONSIVE"

    print("\n--- 3. Testing MultiAgent Swarm Turn Coordination ---")
    history = [{"role": "assistant", "content": "911 Dispatch. What is your emergency?"}]
    swarm_turn = await MultiAgentSwarm.process_turn(
        "Severe 2-car crash on Broadway, one person trapped and bleeding heavily",
        history,
        incident
    )
    print("Swarm Triage Code:", swarm_turn["triage"]["mpds_code"])
    print(f"Swarm Auto-Triggered Tools: {len(swarm_turn['tools_executed'])}")
    assert len(swarm_turn["tools_executed"]) >= 1

    print("\n--- 4. Testing HL7 FHIR (R4) Bundle Generation ---")
    fhir_bundle = FHIRBundleExporter.generate_bundle(incident)
    print("FHIR ResourceType:", fhir_bundle["resourceType"])
    print("FHIR Entries Count:", len(fhir_bundle["entry"]))
    assert fhir_bundle["resourceType"] == "Bundle"
    assert len(fhir_bundle["entry"]) >= 2

    print("\n--- 5. Testing Landmark & Public Safe Haven Geolocation ---")
    from core.landmarks import LandmarkSafeHavenEngine
    havens = LandmarkSafeHavenEngine.find_nearest_safe_havens("420 Market Street", "Cardiac Arrest / Need AED")
    print(f"Safe Havens Identified: {len(havens)}")
    print(f"Top Match: {havens[0]['name']} ({havens[0]['distance_meters']}m away)")
    assert len(havens) >= 1
    assert "Walgreens" in havens[0]["name"] or "Safe Haven" in havens[0]["name"] or "Hospital" in havens[0]["name"]

    print("\n--- 6. Testing Streaming TTS Synthesis ---")
    tts = StreamingTTS()
    audio_bytes = await tts.synthesize("Emergency units are rolling to your location. Stay on the line.")
    print(f"Synthesized MP3 audio bytes: {len(audio_bytes)} bytes")
    assert len(audio_bytes) > 1000

    print("\n[SUCCESS] ALL PRO ADVANCED PIPELINE TESTS PASSED!")

if __name__ == "__main__":
    asyncio.run(test_full_pipeline())
