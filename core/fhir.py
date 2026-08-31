import uuid
import time
from typing import Dict, Any
from core.models import EmergencyIncident

class FHIRBundleExporter:
    """
    Exports active CAD incidents into standard HL7 FHIR (Release 4) Emergency Encounter Bundles.
    Enables seamless interoperability with hospital electronic health record (EHR) systems (Epic, Cerner).
    """

    @classmethod
    def generate_bundle(cls, incident: EmergencyIncident) -> Dict[str, Any]:
        bundle_id = f"urn:uuid:{uuid.uuid4()}"
        patient_id = f"patient-{incident.incident_id.lower()}"
        encounter_id = f"encounter-{incident.incident_id.lower()}"

        entries = [
            # 1. Patient Resource
            {
                "fullUrl": f"urn:uuid:{patient_id}",
                "resource": {
                    "resourceType": "Patient",
                    "id": patient_id,
                    "active": True,
                    "name": [{"use": "usual", "text": "Emergency Caller Patient"}],
                    "telecom": [{"system": "phone", "value": incident.caller_phone, "use": "mobile"}]
                }
            },
            # 2. Emergency Encounter Resource
            {
                "fullUrl": f"urn:uuid:{encounter_id}",
                "resource": {
                    "resourceType": "Encounter",
                    "id": encounter_id,
                    "status": "in-progress",
                    "class": {
                        "system": "http://terminology.hl7.org/CodeSystem/v3-ActCode",
                        "code": "EMER",
                        "display": "emergency"
                    },
                    "priority": {
                        "coding": [{
                            "system": "http://terminology.hl7.org/CodeSystem/v3-ActPriority",
                            "code": "CR" if incident.triage_level == "RED" else "UR",
                            "display": f"Triage Priority {incident.triage_level.value}"
                        }]
                    },
                    "subject": {"reference": f"urn:uuid:{patient_id}"},
                    "period": {"start": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(incident.created_at))}
                }
            },
            # 3. Clinical Observation (Consciousness / AVPU)
            {
                "fullUrl": f"urn:uuid:obs-vitals-{incident.incident_id.lower()}",
                "resource": {
                    "resourceType": "Observation",
                    "status": "preliminary",
                    "category": [{
                        "coding": [{
                            "system": "http://terminology.hl7.org/CodeSystem/observation-category",
                            "code": "vital-signs",
                            "display": "Vital Signs"
                        }]
                    }],
                    "code": {
                        "coding": [{"system": "http://loinc.org", "code": "80288-4", "display": "Triage Assessment"}]
                    },
                    "subject": {"reference": f"urn:uuid:{patient_id}"},
                    "valueString": f"Consciousness: {incident.vitals.consciousness}, Breathing: {incident.vitals.breathing}, Bleeding: {incident.vitals.bleeding}"
                }
            }
        ]

        return {
            "resourceType": "Bundle",
            "id": bundle_id,
            "type": "transaction",
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "entry": entries
        }
