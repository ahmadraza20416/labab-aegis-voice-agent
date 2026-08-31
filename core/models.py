from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from enum import Enum
import time

class TriageLevel(str, Enum):
    CRITICAL = "RED"       # P1: Immediate life threat (cardiac arrest, unconscious, severe bleed)
    URGENT = "AMBER"       # P2: Serious but not immediately fatal (fractures, moderate trauma)
    STANDARD = "GREEN"     # P3: Non-life threatening / minor injury / general inquiry

class UnitType(str, Enum):
    AMBULANCE = "AMBULANCE"
    ADVANCED_LIFE_SUPPORT = "ALS_PARAMEDIC"
    FIRE_ENGINE = "FIRE_ENGINE"
    POLICE_PATROL = "POLICE_PATROL"
    HAZMAT_SQUAD = "HAZMAT_SQUAD"
    RESCUE_HELICOPTER = "AIR_AMBULANCE"

class DispatchedUnit(BaseModel):
    unit_id: str
    unit_type: UnitType
    station: str
    status: str = "EN_ROUTE"
    eta_minutes: int
    assigned_at: float = Field(default_factory=time.time)

class PatientVitals(BaseModel):
    age_group: Optional[str] = "Unknown"
    consciousness: Optional[str] = "Unknown"
    breathing: Optional[str] = "Unknown"
    bleeding: Optional[str] = "None"
    symptoms: List[str] = Field(default_factory=list)
    triage_level: TriageLevel = TriageLevel.STANDARD

class EmergencyIncident(BaseModel):
    incident_id: str
    created_at: float = Field(default_factory=time.time)
    caller_phone: str = "Live Voice Stream"
    location: Optional[str] = "Detecting..."
    latitude: Optional[float] = 37.7749
    longitude: Optional[float] = -122.4194
    incident_type: str = "Pending Triage"
    triage_level: TriageLevel = TriageLevel.STANDARD
    vitals: PatientVitals = Field(default_factory=PatientVitals)
    dispatched_units: List[DispatchedUnit] = Field(default_factory=list)
    safe_havens: List[Dict[str, Any]] = Field(default_factory=list)
    caller_safety_status: str = "Assessing Safety"
    tool_logs: List[Dict[str, Any]] = Field(default_factory=list)
    call_transcript: List[Dict[str, str]] = Field(default_factory=list)
    notes: List[str] = Field(default_factory=list)
    resolved: bool = False

class TelemetryMessage(BaseModel):
    type: str  # "transcript", "triage_update", "unit_dispatched", "tool_executed", "incident_summary", "audio_state"
    payload: Dict[str, Any]
    timestamp: float = Field(default_factory=time.time)
