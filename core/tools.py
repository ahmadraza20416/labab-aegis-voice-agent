import random
import uuid
import time
from typing import Dict, Any, List
from core.models import EmergencyIncident, DispatchedUnit, UnitType, TriageLevel

# Standard Emergency Tools JSON Schema definitions for LLM function calling
EMERGENCY_TOOLS_SCHEMA = [
    {
        "type": "function",
        "function": {
            "name": "dispatch_emergency_units",
            "description": "Dispatches emergency responder units (Ambulance, ALS Paramedics, Fire Engine, Police, HAZMAT) to a specified location with assigned urgency and estimated arrival times.",
            "parameters": {
                "type": "object",
                "properties": {
                    "incident_type": {
                        "type": "string",
                        "description": "Specific nature of emergency (e.g., 'Cardiac Arrest', 'Severe Traffic Collision', 'Structure Fire', 'Armed Robbery', 'Anaphylactic Shock')"
                    },
                    "units": {
                        "type": "array",
                        "items": {
                            "type": "string",
                            "enum": ["AMBULANCE", "ALS_PARAMEDIC", "FIRE_ENGINE", "POLICE_PATROL", "HAZMAT_SQUAD", "AIR_AMBULANCE"]
                        },
                        "description": "List of emergency units to dispatch"
                    },
                    "priority": {
                        "type": "string",
                        "enum": ["RED", "AMBER", "GREEN"],
                        "description": "Triage severity: RED (P1-Critical Life Threat), AMBER (P2-Urgent Serious), GREEN (P3-Standard)"
                    },
                    "location": {
                        "type": "string",
                        "description": "Location, address, street intersection or landmark given by the caller"
                    },
                    "eta_minutes": {
                        "type": "integer",
                        "description": "Estimated response arrival time in minutes (typically 2-8 min for RED, 5-15 for AMBER)"
                    },
                    "dispatch_notes": {
                        "type": "string",
                        "description": "Important briefing notes for incoming responders"
                    }
                },
                "required": ["incident_type", "units", "priority", "location"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "lookup_trauma_centers",
            "description": "Queries the regional medical telemetry network for nearest trauma centers, burn units, cardiac care, or pediatric emergency departments with available bed capacity.",
            "parameters": {
                "type": "object",
                "properties": {
                    "location": {
                        "type": "string",
                        "description": "Current incident location"
                    },
                    "specialty_required": {
                        "type": "string",
                        "enum": ["Level 1 Trauma", "Cardiac Cath Lab", "Burn Center", "Pediatric ICU", "Stroke Center", "General Emergency"],
                        "description": "Required medical facility specialty"
                    }
                },
                "required": ["location", "specialty_required"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "record_patient_vitals",
            "description": "Records patient diagnostic state and vitals into the electronic triage record and updates dynamic severity scoring.",
            "parameters": {
                "type": "object",
                "properties": {
                    "age_group": {
                        "type": "string",
                        "description": "E.g. Infant, Child, Teen, Adult, Elderly"
                    },
                    "consciousness": {
                        "type": "string",
                        "enum": ["Alert / Fully Conscious", "Verbal / Disoriented", "Pain Response Only", "Unresponsive / Unconscious"],
                        "description": "Patient responsiveness level"
                    },
                    "breathing": {
                        "type": "string",
                        "enum": ["Normal", "Agonal / Gasping", "Rapid / Shallow", "Not Breathing / Arrest", "Choking / Obstructed"],
                        "description": "Respiratory status"
                    },
                    "bleeding": {
                        "type": "string",
                        "enum": ["None", "Minor", "Severe / Arterial Spurt", "Internal Suspected"],
                        "description": "Hemorrhage status"
                    },
                    "symptoms": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "List of observed symptoms (e.g. chest pain, numbness, burns, open fracture)"
                    },
                    "triage_level": {
                        "type": "string",
                        "enum": ["RED", "AMBER", "GREEN"],
                        "description": "Overall assessed triage priority"
                    }
                },
                "required": ["consciousness", "breathing", "triage_level"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "send_first_aid_sms",
            "description": "Transmits immediate visual and step-by-step first aid guidance via SMS/Push directly to the caller's mobile device while help is en route.",
            "parameters": {
                "type": "object",
                "properties": {
                    "instruction_type": {
                        "type": "string",
                        "enum": ["CPR Compression Protocol", "Tourniquet / Bleeding Control", "Choking / Heimlich Maneuver", "Recovery Position", "Burn Cooling Protocol", "Seizure Safety"],
                        "description": "Standard medical protocol required"
                    },
                    "summary_message": {
                        "type": "string",
                        "description": "Short, clear instructions sent to caller phone"
                    }
                },
                "required": ["instruction_type", "summary_message"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "trigger_hazard_containment",
            "description": "Triggers hazardous materials containment, air quality warnings, or tactical perimeter evacuations for gas leaks, chemical spills, or structure collapses.",
            "parameters": {
                "type": "object",
                "properties": {
                    "hazard_type": {
                        "type": "string",
                        "description": "E.g., Natural Gas Leak, Chemical Spill, High Voltage Line Down, Structural Collapse"
                    },
                    "evacuation_radius_meters": {
                        "type": "integer",
                        "description": "Safety exclusion radius in meters"
                    },
                    "containment_instructions": {
                        "type": "string",
                        "description": "Special safety instructions for public and responders"
                    }
                },
                "required": ["hazard_type", "evacuation_radius_meters"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "locate_nearby_safe_havens",
            "description": "Identifies verified nearby public safe havens, 24/7 staffed buildings, public Automated External Defibrillator (AED) stations, fire stations, and evacuation assembly points to guide the caller to immediate safety.",
            "parameters": {
                "type": "object",
                "properties": {
                    "location": {
                        "type": "string",
                        "description": "Current caller location or street address"
                    },
                    "emergency_nature": {
                        "type": "string",
                        "description": "Nature of emergency (e.g. 'threat / violent danger', 'cardiac arrest / need AED', 'fire / hazmat evacuation', 'medical shelter')"
                    }
                },
                "required": ["location"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "issue_caller_safety_directive",
            "description": "Issues dynamic, tactical safety directives to the caller (e.g. 'Evacuate to Safe Haven', 'Lock doors and stay out of sight', 'Stay with patient and unlock door for medics', 'Move behind highway barrier').",
            "parameters": {
                "type": "object",
                "properties": {
                    "safety_action": {
                        "type": "string",
                        "enum": ["EVACUATE_TO_SAFE_HAVEN", "SHELTER_IN_PLACE_LOCKED", "SCENE_SAFE_STAY_WITH_PATIENT", "HIGHWAY_HAZARD_MOVE_TO_BARRIER", "FIRE_GAS_MOVE_UPWIND"],
                        "description": "Primary safety posture recommended"
                    },
                    "recommended_landmark": {
                        "type": "string",
                        "description": "Specific nearby public building or safe shelter name"
                    },
                    "instructions_spoken": {
                        "type": "string",
                        "description": "Short, clear directive spoken to protect caller"
                    }
                },
                "required": ["safety_action", "instructions_spoken"]
            }
        }
    }
]

class EmergencyToolExecutor:
    """Executes emergency actions and mutates incident state."""

    @staticmethod
    def execute(tool_name: str, arguments: Dict[str, Any], incident: EmergencyIncident) -> Dict[str, Any]:
        timestamp = time.strftime("%H:%M:%S")
        log_entry = {
            "timestamp": timestamp,
            "tool": tool_name,
            "args": arguments,
            "status": "SUCCESS"
        }

        try:
            if tool_name == "dispatch_emergency_units":
                from core.landmarks import LandmarkSafeHavenEngine
                incident.incident_type = arguments.get("incident_type", incident.incident_type)
                raw_loc = arguments.get("location", incident.location)
                incident.location = raw_loc

                # Real OpenStreetMap GPS Geocoding
                lat, lon, full_name = LandmarkSafeHavenEngine.geocode_address(raw_loc)
                incident.latitude = lat
                incident.longitude = lon

                prio_str = arguments.get("priority", "AMBER").upper()
                incident.triage_level = TriageLevel(prio_str) if prio_str in ["RED", "AMBER", "GREEN"] else TriageLevel.AMBER

                units_requested = arguments.get("units", ["AMBULANCE"])
                eta_base = arguments.get("eta_minutes", 4 if prio_str == "RED" else 8)

                dispatched_list = []
                for u in units_requested:
                    unit_code = u.upper()
                    try:
                        u_type = UnitType(unit_code)
                    except ValueError:
                        u_type = UnitType.AMBULANCE

                    station_num = random.randint(1, 14)
                    unit_id = f"{unit_code[:3]}-{station_num:02d}"
                    unit_obj = DispatchedUnit(
                        unit_id=unit_id,
                        unit_type=u_type,
                        station=f"Station #{station_num} Metro Central",
                        eta_minutes=max(1, eta_base + random.randint(-1, 2)),
                        status="EN_ROUTE"
                    )
                    incident.dispatched_units.append(unit_obj)
                    dispatched_list.append(unit_obj.model_dump())

                notes = arguments.get("dispatch_notes", "")
                if notes:
                    incident.notes.append(f"[{timestamp}] Dispatch Note: {notes}")

                result = {
                    "status": "UNITS_DISPATCHED",
                    "priority": incident.triage_level.value,
                    "location": incident.location,
                    "units": dispatched_list,
                    "message": f"Successfully dispatched {len(dispatched_list)} emergency units to {incident.location} with priority {incident.triage_level.value}."
                }

            elif tool_name == "record_patient_vitals":
                vitals = incident.vitals
                vitals.consciousness = arguments.get("consciousness", vitals.consciousness)
                vitals.breathing = arguments.get("breathing", vitals.breathing)
                vitals.bleeding = arguments.get("bleeding", vitals.bleeding)
                vitals.age_group = arguments.get("age_group", vitals.age_group)
                vitals.symptoms = arguments.get("symptoms", vitals.symptoms)

                prio_str = arguments.get("triage_level", "AMBER").upper()
                if prio_str in ["RED", "AMBER", "GREEN"]:
                    vitals.triage_level = TriageLevel(prio_str)
                    incident.triage_level = vitals.triage_level

                result = {
                    "status": "VITALS_RECORDED",
                    "triage_score": incident.triage_level.value,
                    "consciousness": vitals.consciousness,
                    "breathing": vitals.breathing,
                    "bleeding": vitals.bleeding,
                    "message": f"Patient vitals recorded. Assessed Triage Severity: {incident.triage_level.value}."
                }

            elif tool_name == "lookup_trauma_centers":
                specialty = arguments.get("specialty_required", "Level 1 Trauma")
                loc = arguments.get("location", incident.location)
                
                facilities = [
                    {"name": "Metro General Trauma & Acute Care", "distance_miles": 2.4, "specialty": specialty, "icu_beds": 6, "trauma_surgeons_on_duty": 4, "status": "READY"},
                    {"name": "St. Jude Regional Medical Center", "distance_miles": 4.1, "specialty": specialty, "icu_beds": 2, "trauma_surgeons_on_duty": 2, "status": "DIVERT_WARNING"},
                    {"name": "University Presbyterian Health Center", "distance_miles": 5.8, "specialty": specialty, "icu_beds": 9, "trauma_surgeons_on_duty": 5, "status": "READY"}
                ]
                result = {
                    "status": "FACILITIES_FOUND",
                    "location_searched": loc,
                    "primary_recommended": facilities[0]["name"],
                    "eta_transit_min": 5,
                    "facilities": facilities
                }

            elif tool_name == "send_first_aid_sms":
                inst_type = arguments.get("instruction_type", "First Aid Guidance")
                msg = arguments.get("summary_message", "Guidance dispatched.")
                incident.notes.append(f"[{timestamp}] SMS Sent to Caller: [{inst_type}] {msg}")
                result = {
                    "status": "SMS_DISPATCHED",
                    "instruction_type": inst_type,
                    "preview": msg,
                    "carrier_delivery_status": "DELIVERED_TO_DEVICE"
                }

            elif tool_name == "locate_nearby_safe_havens":
                from core.landmarks import LandmarkSafeHavenEngine
                loc = arguments.get("location", incident.location or "Current Area")
                nature = arguments.get("emergency_nature", incident.incident_type)
                havens = LandmarkSafeHavenEngine.find_nearest_safe_havens(loc, nature, lat=incident.latitude, lon=incident.longitude)
                incident.safe_havens = havens
                
                names = [h["name"] for h in havens]
                incident.notes.append(f"[{timestamp}] Identified {len(havens)} nearby public safe havens: {', '.join(names)}")
                result = {
                    "status": "SAFE_HAVENS_IDENTIFIED",
                    "location": loc,
                    "safe_havens_found": len(havens),
                    "primary_recommended": havens[0]["name"] if havens else "Seek nearest well-lit public area",
                    "details": havens
                }

            elif tool_name == "issue_caller_safety_directive":
                action = arguments.get("safety_action", "SHELTER_IN_PLACE_LOCKED")
                landmark = arguments.get("recommended_landmark", "")
                instructions = arguments.get("instructions_spoken", "Move to a safe place.")
                
                incident.caller_safety_status = action.replace("_", " ").title()
                incident.notes.append(f"[{timestamp}] SAFETY DIRECTIVE: {incident.caller_safety_status} | Landmark: {landmark} | {instructions}")
                result = {
                    "status": "SAFETY_DIRECTIVE_ISSUED",
                    "action_code": action,
                    "recommended_landmark": landmark,
                    "instructions": instructions
                }

            else:
                result = {"status": "UNKNOWN_TOOL", "error": f"Tool '{tool_name}' not implemented"}

            log_entry["result"] = result
            incident.tool_logs.append(log_entry)
            return result

        except Exception as e:
            err_result = {"status": "ERROR", "message": str(e)}
            log_entry["status"] = "ERROR"
            log_entry["result"] = err_result
            incident.tool_logs.append(log_entry)
            return err_result
