from typing import Dict, Any, List
import logging
from core.triage import ClinicalTriageEngine
from core.models import EmergencyIncident, TriageLevel
from core.tools import EmergencyToolExecutor

logger = logging.getLogger("AegisVoice.MultiAgent")

class MultiAgentSwarm:
    """
    Orchestrates specialized sub-agents for comprehensive 911 dispatch intelligence:
    - IntakeAgent (Conversational Caller Rapport)
    - TriageSpecialistAgent (Clinical MPDS & Vitals Assessment)
    - LogisticsDispatchAgent (CAD Fleet Resource Allocation)
    - ClinicalSupervisorAgent (Safety Guardrails & Medical Countermeasures)
    """

    @classmethod
    async def process_turn(
        cls,
        caller_utterance: str,
        conversation_history: List[Dict[str, str]],
        incident: EmergencyIncident
    ) -> Dict[str, Any]:
        
        # 1. TriageSpecialistAgent: Analyze symptoms & MPDS classification
        triage_assessment = ClinicalTriageEngine.evaluate(caller_utterance, incident.vitals.model_dump())
        incident.triage_level = triage_assessment["triage_level"]
        
        # 2. LogisticsDispatchAgent: Auto-trigger CAD tool if units not yet dispatched or priority escalated
        tools_executed = []
        if triage_assessment["triage_level"] in [TriageLevel.CRITICAL, TriageLevel.URGENT]:
            if not incident.dispatched_units or (incident.triage_level == TriageLevel.CRITICAL and len(incident.dispatched_units) < 2):
                dispatch_args = {
                    "incident_type": triage_assessment["mpds_title"],
                    "units": triage_assessment["recommended_units"],
                    "priority": triage_assessment["triage_level"].value,
                    "location": incident.location if incident.location != "Detecting..." else "Caller Vicinity",
                    "eta_minutes": triage_assessment["target_eta_minutes"],
                    "dispatch_notes": f"MPDS [{triage_assessment['mpds_code']}] {triage_assessment['determinant_level']} - AVPU: {triage_assessment['avpu_status']}, GCS: {triage_assessment['estimated_gcs']}"
                }
                d_res = EmergencyToolExecutor.execute("dispatch_emergency_units", dispatch_args, incident)
                tools_executed.append({
                    "name": "dispatch_emergency_units",
                    "args": dispatch_args,
                    "result": d_res
                })

        # 4. Geospatial & Safe Haven Specialist: Locate nearest public shelters & AEDs
        if not incident.safe_havens or incident.triage_level == TriageLevel.CRITICAL:
            haven_args = {
                "location": incident.location if incident.location != "Detecting..." else "Current Sector",
                "emergency_nature": triage_assessment["mpds_title"]
            }
            haven_res = EmergencyToolExecutor.execute("locate_nearby_safe_havens", haven_args, incident)
            tools_executed.append({
                "name": "locate_nearby_safe_havens",
                "args": haven_args,
                "result": haven_res
            })

        return {
            "triage": triage_assessment,
            "tools_executed": tools_executed
        }
