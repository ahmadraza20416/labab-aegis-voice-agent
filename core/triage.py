from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field
import time
from core.models import TriageLevel

class MPDSProtocol(BaseModel):
    code: str
    determinant_level: str  # ECHO (Max priority), DELTA (Life threat), CHARLIE (Urgent), BRAVO (Moderate), ALPHA (Low)
    title: str
    recommended_units: List[str]
    pre_arrival_instructions: str
    target_response_time_minutes: int

MPDS_CATALOG: Dict[str, MPDSProtocol] = {
    "09-E-01": MPDSProtocol(
        code="09-E-01",
        determinant_level="ECHO",
        title="Cardiac or Respiratory Arrest - Ineffective Breathing",
        recommended_units=["AMBULANCE", "ALS_PARAMEDIC", "FIRE_ENGINE", "RESCUE_HELICOPTER"],
        pre_arrival_instructions="Begin continuous chest compressions at 100-120 BPM immediately. Do not stop. Deploy AED if available.",
        target_response_time_minutes=4
    ),
    "10-D-01": MPDSProtocol(
        code="10-D-01",
        determinant_level="DELTA",
        title="Chest Pain / Suspected Acute Coronary Syndrome",
        recommended_units=["AMBULANCE", "ALS_PARAMEDIC"],
        pre_arrival_instructions="Keep patient in comfortable resting position. Loosen tight clothing. Check for aspirin eligibility if no active bleed.",
        target_response_time_minutes=6
    ),
    "29-D-01": MPDSProtocol(
        code="29-D-01",
        determinant_level="DELTA",
        title="Major Motor Vehicle Collision with Entrapment / Multi-Trauma",
        recommended_units=["AMBULANCE", "ALS_PARAMEDIC", "FIRE_ENGINE", "POLICE_PATROL"],
        pre_arrival_instructions="Do not move patient unless immediate vehicle fire hazard. Maintain cervical spine stability.",
        target_response_time_minutes=5
    ),
    "08-D-01": MPDSProtocol(
        code="08-D-01",
        determinant_level="DELTA",
        title="Hazardous Materials Exposure / Gas Inhalation",
        recommended_units=["FIRE_ENGINE", "HAZMAT_SQUAD", "AMBULANCE", "POLICE_PATROL"],
        pre_arrival_instructions="Evacuate upwind and uphill minimum 150 meters. Avoid electrical switches or ignition sources.",
        target_response_time_minutes=5
    ),
    "06-D-01": MPDSProtocol(
        code="06-D-01",
        determinant_level="DELTA",
        title="Severe Respiratory Distress / Anaphylaxis / Airway Compromise",
        recommended_units=["AMBULANCE", "ALS_PARAMEDIC"],
        pre_arrival_instructions="Assist with prescribed epinephrine auto-injector if available. Keep patient upright in tripod position.",
        target_response_time_minutes=6
    ),
    "04-D-01": MPDSProtocol(
        code="04-D-01",
        determinant_level="DELTA",
        title="Major Hemorrhage / Penetrating Trauma",
        recommended_units=["AMBULANCE", "ALS_PARAMEDIC", "POLICE_PATROL"],
        pre_arrival_instructions="Apply direct, continuous firm pressure with clean cloth. Apply tourniquet high and tight if extremity arterial bleed.",
        target_response_time_minutes=5
    ),
    "26-A-01": MPDSProtocol(
        code="26-A-01",
        determinant_level="ALPHA",
        title="Minor Non-Traumatic Medical / Routine Inquiry",
        recommended_units=["AMBULANCE"],
        pre_arrival_instructions="Keep patient warm and calm. Monitor for any worsening symptoms.",
        target_response_time_minutes=12
    )
}

class ClinicalTriageEngine:
    """
    Computes rigorous emergency triage levels using MPDS determinants,
    Glasgow Coma Scale (GCS), and AVPU classifications.
    """

    @classmethod
    def evaluate(cls, user_text: str, current_vitals: Dict[str, Any]) -> Dict[str, Any]:
        text = user_text.lower()
        
        # 1. Evaluate AVPU & GCS
        avpu = "ALERT"
        gcs_score = 15
        if "unconscious" in text or "unresponsive" in text or "passed out" in text or "coma" in text:
            avpu = "UNRESPONSIVE"
            gcs_score = 3
        elif "pain" in text and ("only" in text or "responds to" in text):
            avpu = "PAIN"
            gcs_score = 7
        elif "confused" in text or "disoriented" in text or "dazed" in text or "slurred" in text:
            avpu = "VERBAL"
            gcs_score = 11

        # 2. Match MPDS Protocol
        if any(w in text for w in ["not breathing", "cardiac arrest", "no pulse", "heart stopped", "collapsed", "died", "cpr"]):
            protocol = MPDS_CATALOG["09-E-01"]
            triage_level = TriageLevel.CRITICAL
        elif any(w in text for w in ["chest pain", "heart attack", "crushing chest", "left arm pain", "angina"]):
            protocol = MPDS_CATALOG["10-D-01"]
            triage_level = TriageLevel.CRITICAL
        elif any(w in text for w in ["crash", "collision", "accident", "trapped", "flipped", "pedestrian struck"]):
            protocol = MPDS_CATALOG["29-D-01"]
            triage_level = TriageLevel.CRITICAL
        elif any(w in text for w in ["gas leak", "chemical", "toxic", "fumes", "hissing", "methane", "hazmat"]):
            protocol = MPDS_CATALOG["08-D-01"]
            triage_level = TriageLevel.CRITICAL if "unconscious" in text else TriageLevel.URGENT
        elif any(w in text for w in ["choking", "can't breathe", "suffocating", "asthma attack", "allergic", "anaphylaxis"]):
            protocol = MPDS_CATALOG["06-D-01"]
            triage_level = TriageLevel.CRITICAL
        elif any(w in text for w in ["bleeding heavily", "blood everywhere", "arterial", "stabbed", "shot", "bullet"]):
            protocol = MPDS_CATALOG["04-D-01"]
            triage_level = TriageLevel.CRITICAL
        else:
            protocol = MPDS_CATALOG["26-A-01"]
            triage_level = TriageLevel.STANDARD

        return {
            "mpds_code": protocol.code,
            "mpds_title": protocol.title,
            "determinant_level": protocol.determinant_level,
            "triage_level": triage_level,
            "avpu_status": avpu,
            "estimated_gcs": gcs_score,
            "recommended_units": protocol.recommended_units,
            "first_aid_instruction": protocol.pre_arrival_instructions,
            "target_eta_minutes": protocol.target_response_time_minutes
        }
