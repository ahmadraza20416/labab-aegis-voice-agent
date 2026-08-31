import json
import logging
from typing import List, Dict, Any, Tuple, Optional
from core.config import settings
from core.tools import EMERGENCY_TOOLS_SCHEMA, EmergencyToolExecutor
from core.models import EmergencyIncident

logger = logging.getLogger("AegisVoice.LLM")

SYSTEM_PROMPT = """You are "AegisVoice Pro", an elite, authoritative, calm, and protective 911 Emergency Dispatch AI.
Your mission is to rapidly triage emergencies, preserve human life, provide critical scene safety instructions, extract vital information (Exact Location, Consciousness, Airway/Breathing, Severe Hemorrhage), and trigger CAD tools in real time.

CORE DISPATCH DIRECTIVES:
1. ALWAYS prioritize obtaining EXACT LOCATION first if not yet known.
2. IMMEDIATELY call `dispatch_emergency_units` as soon as you know the general location and type of emergency.
3. PROACTIVELY DIRECT CALLER SAFETY:
   - If there is active danger, violence, or an intruder: Instruct caller to move to a safe, locked room away from windows or evacuate immediately to a nearby public safe haven. Call `issue_caller_safety_directive`.
   - If there is fire, smoke, or a gas leak: Instruct caller to evacuate the structure immediately, avoid elevators, and move upwind 150+ meters.
   - If on a highway or traffic collision: Instruct caller to move behind the road guardrail away from moving traffic if safely able.
   - If medical/cardiac: Instruct caller to unlock the front door so paramedics can enter instantly, and stay right by the patient's side.
4. PROACTIVELY LOCATE NEARBY PUBLIC SAFE HAVENS & AEDs:
   - Call `locate_nearby_safe_havens` to find nearby 24/7 pharmacies with public AEDs, fire stations, urgent care clinics, or well-lit municipal buildings.
   - Explicitly inform the caller about nearby landmarks (e.g., "If you can safely move, Walgreens on Market St is 120m away and has a public AED / shelter").
5. Call `record_patient_vitals` whenever consciousness, breathing, or injury state is mentioned.
6. For CPR, severe bleeding, or choking, call `send_first_aid_sms` to push step-by-step guidance to their phone.
7. Keep spoken responses CONCISE (1 to 2 sentences max), clear, calm, and authoritative. Acknowledge that units are rolling with lights and sirens.
"""

class LLMReasoningEngine:
    """
    Manages LLM conversational loop, tool invocation, and emergency triage reasoning.
    Supports Groq, OpenAI, or smart local fallback.
    """

    def __init__(self):
        self.groq_client = None
        self.openai_client = None
        self._init_clients()

    def _init_clients(self):
        if settings.GROQ_API_KEY and not settings.GROQ_API_KEY.startswith("your_"):
            try:
                from groq import Groq
                self.groq_client = Groq(api_key=settings.GROQ_API_KEY)
                logger.info("[LLM Engine] Groq client initialized successfully.")
            except Exception as e:
                logger.warning(f"[LLM Engine] Groq initialization failed: {e}")

        if settings.OPENAI_API_KEY and not settings.OPENAI_API_KEY.startswith("your_"):
            try:
                from openai import OpenAI
                self.openai_client = OpenAI(api_key=settings.OPENAI_API_KEY)
                logger.info("[LLM Engine] OpenAI client initialized successfully.")
            except Exception as e:
                logger.warning(f"[LLM Engine] OpenAI initialization failed: {e}")

    async def generate_response(
        self,
        conversation_history: List[Dict[str, str]],
        incident: EmergencyIncident
    ) -> Tuple[str, List[Dict[str, Any]]]:
        """
        Executes a turn of reasoning with tool calling.
        Returns (spoken_response_text, list_of_executed_tools).
        """
        messages = [{"role": "system", "content": SYSTEM_PROMPT}] + conversation_history
        executed_tools = []

        # 1. Try Groq (Ultra-fast TTFT)
        if self.groq_client and settings.LLM_PROVIDER == "groq":
            try:
                return await self._call_groq(messages, incident)
            except Exception as e:
                logger.error(f"[LLM Groq Error] {e}. Falling back to OpenAI or Smart Rule Engine.")

        # 2. Try OpenAI
        if self.openai_client:
            try:
                return await self._call_openai(messages, incident)
            except Exception as e:
                logger.error(f"[LLM OpenAI Error] {e}. Falling back to Smart Rule Engine.")

        # 3. Fallback Smart Rule Engine (Runs offline / for demos when API keys aren't set)
        return self._smart_rule_fallback(conversation_history, incident)

    async def _call_groq(
        self,
        messages: List[Dict[str, Any]],
        incident: EmergencyIncident
    ) -> Tuple[str, List[Dict[str, Any]]]:
        executed_tools = []
        model = settings.LLM_MODEL or "llama-3.3-70b-versatile"

        response = self.groq_client.chat.completions.create(
            model=model,
            messages=messages,
            tools=EMERGENCY_TOOLS_SCHEMA,
            tool_choice="auto",
            temperature=0.2,
            max_tokens=250
        )

        response_message = response.choices[0].message

        # Handle tool calls
        if response_message.tool_calls:
            for tool_call in response_message.tool_calls:
                fn_name = tool_call.function.name
                fn_args = json.loads(tool_call.function.arguments)
                tool_result = EmergencyToolExecutor.execute(fn_name, fn_args, incident)
                executed_tools.append({
                    "name": fn_name,
                    "args": fn_args,
                    "result": tool_result
                })

            # Follow-up turn with tool result to generate spoken text
            messages.append(response_message)
            for tool_call in response_message.tool_calls:
                fn_name = tool_call.function.name
                # Find matching executed result
                t_res = next((t["result"] for t in executed_tools if t["name"] == fn_name), {})
                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "name": fn_name,
                    "content": json.dumps(t_res)
                })

            followup = self.groq_client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=0.2,
                max_tokens=200
            )
            reply = followup.choices[0].message.content or "Help is on the way. Please remain on the line."
            return reply, executed_tools

        reply = response_message.content or "I am listening. Please tell me your location and what is happening."
        return reply, executed_tools

    async def _call_openai(
        self,
        messages: List[Dict[str, Any]],
        incident: EmergencyIncident
    ) -> Tuple[str, List[Dict[str, Any]]]:
        executed_tools = []
        model = settings.LLM_MODEL or "gpt-4o-mini"

        response = self.openai_client.chat.completions.create(
            model=model,
            messages=messages,
            tools=EMERGENCY_TOOLS_SCHEMA,
            tool_choice="auto",
            temperature=0.2,
            max_tokens=250
        )

        response_message = response.choices[0].message

        if response_message.tool_calls:
            for tool_call in response_message.tool_calls:
                fn_name = tool_call.function.name
                fn_args = json.loads(tool_call.function.arguments)
                tool_result = EmergencyToolExecutor.execute(fn_name, fn_args, incident)
                executed_tools.append({
                    "name": fn_name,
                    "args": fn_args,
                    "result": tool_result
                })

            messages.append(response_message)
            for tool_call in response_message.tool_calls:
                fn_name = tool_call.function.name
                t_res = next((t["result"] for t in executed_tools if t["name"] == fn_name), {})
                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "name": fn_name,
                    "content": json.dumps(t_res)
                })

            followup = self.openai_client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=0.2,
                max_tokens=200
            )
            reply = followup.choices[0].message.content or "Help has been dispatched. Please remain on the line."
            return reply, executed_tools

        reply = response_message.content or "This is 911 dispatch. What is your exact emergency?"
        return reply, executed_tools

    def _smart_rule_fallback(
        self,
        conversation_history: List[Dict[str, str]],
        incident: EmergencyIncident
    ) -> Tuple[str, List[Dict[str, Any]]]:
        """
        Deterministic, intelligent rule-based triage copilot for local offline testing.
        """
        last_user_msg = ""
        for m in reversed(conversation_history):
            if m.get("role") == "user":
                last_user_msg = m.get("content", "").lower()
                break

        executed = []

        # Location heuristic
        if "street" in last_user_msg or "avenue" in last_user_msg or "at " in last_user_msg or "road" in last_user_msg or "near" in last_user_msg or "5th" in last_user_msg:
            # Extract simple address
            loc_candidate = last_user_msg.replace("i am at", "").replace("we are at", "").strip()
            incident.location = loc_candidate[:40].title() if loc_candidate else "5th & Market St"

        # Severity & Symptoms detection
        if any(w in last_user_msg for w in ["unconscious", "not breathing", "heart attack", "cardiac", "stroke", "bleeding heavily", "fire", "crash", "collision"]):
            vitals_args = {
                "consciousness": "Unresponsive / Unconscious" if "unconscious" in last_user_msg else "Alert / Fully Conscious",
                "breathing": "Not Breathing / Arrest" if "not breathing" in last_user_msg else "Normal",
                "bleeding": "Severe / Arterial Spurt" if "bleeding" in last_user_msg else "None",
                "symptoms": ["Trauma", "Suspected Arrest"],
                "triage_level": "RED"
            }
            v_res = EmergencyToolExecutor.execute("record_patient_vitals", vitals_args, incident)
            executed.append({"name": "record_patient_vitals", "args": vitals_args, "result": v_res})

            dispatch_args = {
                "incident_type": "Critical Trauma / Cardiac Emergency" if "heart" in last_user_msg or "unconscious" in last_user_msg else "Severe Motor Vehicle Collision",
                "units": ["AMBULANCE", "ALS_PARAMEDIC", "FIRE_ENGINE"],
                "priority": "RED",
                "location": incident.location or "Metro Center",
                "eta_minutes": 3,
                "dispatch_notes": "Caller reports unconscious/severe condition. High priority code 3."
            }
            d_res = EmergencyToolExecutor.execute("dispatch_emergency_units", dispatch_args, incident)
            executed.append({"name": "dispatch_emergency_units", "args": dispatch_args, "result": d_res})

            # Send SMS guide
            sms_args = {
                "instruction_type": "CPR Compression Protocol" if "not breathing" in last_user_msg else "Tourniquet / Bleeding Control",
                "summary_message": "Place hands in center of chest. Push hard and fast at 100-120 BPM until paramedics arrive."
            }
            # Locate nearby safe havens and AEDs
            haven_args = {"location": incident.location, "emergency_nature": "Cardiac / Trauma Emergency"}
            h_res = EmergencyToolExecutor.execute("locate_nearby_safe_havens", haven_args, incident)
            executed.append({"name": "locate_nearby_safe_havens", "args": haven_args, "result": h_res})

            # Issue safety directive
            safe_args = {
                "safety_action": "SCENE_SAFE_STAY_WITH_PATIENT",
                "recommended_landmark": "Walgreens 24/7 (120m away - Public AED)",
                "instructions_spoken": "Stay with patient and unlock front door for incoming paramedics."
            }
            safe_res = EmergencyToolExecutor.execute("issue_caller_safety_directive", safe_args, incident)
            executed.append({"name": "issue_caller_safety_directive", "args": safe_args, "result": safe_res})

            reply = f"Emergency units are rolling to {incident.location} with lights and sirens, ETA 3 minutes. Unlock the front door so paramedics can enter. There is also a public AED at Walgreens 120 meters away on Market St. Are they breathing right now?"
            return reply, executed

        elif any(w in last_user_msg for w in ["threat", "danger", "shooter", "assault", "robbery", "stalker", "someone outside", "break in"]):
            safe_args = {
                "safety_action": "SHELTER_IN_PLACE_LOCKED",
                "recommended_landmark": "Central Municipal Police Substation (400m away)",
                "instructions_spoken": "Move to an interior locked room away from windows and stay down."
            }
            safe_res = EmergencyToolExecutor.execute("issue_caller_safety_directive", safe_args, incident)
            executed.append({"name": "issue_caller_safety_directive", "args": safe_args, "result": safe_res})

            dispatch_args = {
                "incident_type": "Active Threat / Police Priority",
                "units": ["POLICE_PATROL"],
                "priority": "RED",
                "location": incident.location or "Metro Center",
                "eta_minutes": 2,
                "dispatch_notes": "Caller reports active danger/threat. Officers responding code 3."
            }
            d_res = EmergencyToolExecutor.execute("dispatch_emergency_units", dispatch_args, incident)
            executed.append({"name": "dispatch_emergency_units", "args": dispatch_args, "result": d_res})

            reply = "Police units are rolling to your location right now. Move to a safe, locked room away from all windows, keep the lights off, and stay on the line with me."
            return reply, executed

        elif incident.location == "Detecting...":
            reply = "911 Dispatch. What is the exact address or location of your emergency?"
            return reply, executed

        else:
            # Default dispatch
            dispatch_args = {
                "incident_type": "Medical Assistance Request",
                "units": ["AMBULANCE"],
                "priority": "AMBER",
                "location": incident.location,
                "eta_minutes": 6,
                "dispatch_notes": "Unit dispatched for evaluation."
            }
            d_res = EmergencyToolExecutor.execute("dispatch_emergency_units", dispatch_args, incident)
            executed.append({"name": "dispatch_emergency_units", "args": dispatch_args, "result": d_res})
            reply = f"I have dispatched an ambulance to {incident.location}. If you are in any danger, there is a safe shelter nearby. Is anyone in immediate harm?"
            return reply, executed
