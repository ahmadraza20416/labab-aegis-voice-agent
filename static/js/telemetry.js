/**
 * AegisVoice Pro - Advanced Telemetry, GIS Route Engine & Incident Management
 */

class TelemetryManager {
    constructor() {
        this.socket = null;
        this.incident = null;
        this.map = null;
        this.incidentMarker = null;
        this.hazardCircle = null;
        this.unitMarkers = {};
        this.safeHavenMarkers = [];
        this.routePolylines = {};
        this.radarEnabled = true;
        this.toolFilter = 'all';
        this.cachedTools = [];
        this.simSpeedMultiplier = 1.0;
        this.activeSimulations = {};
        this.simInterval = null;

        this.baseLayers = {};
        this.currentLayerKey = 'dark';

        this._initMap();
        this.connect();
        this._bindEvents();
        this._initFleetDrivingEngine();
    }

    _initMap() {
        const mapContainer = document.getElementById('tactical-map');
        if (!mapContainer || !window.L) return;

        this.map = L.map('tactical-map', {
            zoomControl: true,
            attributionControl: false
        }).setView([37.7749, -122.4194], 14);

        // 1. Dark Mode Tactical Layer
        this.baseLayers['dark'] = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            className: 'leaflet-tile-pane'
        });

        // 2. Satellite Imagery Layer (Esri World Imagery)
        this.baseLayers['sat'] = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 19
        });

        // 3. Street Vector Layer
        this.baseLayers['street'] = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19
        });

        // Add default dark layer
        this.baseLayers['dark'].addTo(this.map);

        // Ensure Leaflet tiles render completely after layout
        setTimeout(() => {
            if (this.map) this.map.invalidateSize();
        }, 200);

        window.addEventListener('resize', () => {
            if (this.map) this.map.invalidateSize();
        });

        // Hospital / Trauma Markers
        const traumaCenters = [
            { name: "SF General Level 1 Trauma", lat: 37.7558, lng: -122.4047, beds: "8 Trauma Bays Available", icon: "cross" },
            { name: "UCSF Cardiac Cath Center", lat: 37.7631, lng: -122.4580, beds: "Cath Lab Ready", icon: "activity" }
        ];

        traumaCenters.forEach(tc => {
            const hIcon = L.divIcon({
                className: 'custom-map-icon',
                html: `<div class="px-2 py-1 rounded bg-blue-900/90 border border-blue-400/80 text-cyan-200 font-mono text-[9px] shadow-lg flex items-center gap-1 backdrop-blur-sm"><i data-lucide="${tc.icon}" class="w-3 h-3 text-blue-400"></i> ${tc.name}</div>`,
                iconSize: [140, 24]
            });
            const m = L.marker([tc.lat, tc.lng], { icon: hIcon }).addTo(this.map);
            m.bindPopup(`<div class="font-sans text-xs p-1"><strong>${tc.name}</strong><br><span class="text-emerald-400 font-mono">${tc.beds}</span></div>`);
        });

        // Fire / Medic Stations
        const stations = [
            { name: "Station 04 (Mission)", lat: 37.7650, lng: -122.4300 },
            { name: "Station 01 (Downtown)", lat: 37.7890, lng: -122.4010 }
        ];

        stations.forEach(st => {
            const stIcon = L.divIcon({
                className: 'custom-map-icon',
                html: `<div class="px-2 py-0.5 rounded bg-emerald-950/90 border border-emerald-500/70 text-emerald-300 font-mono text-[9px] shadow-md">${st.name}</div>`,
                iconSize: [120, 22]
            });
            L.marker([st.lat, st.lng], { icon: stIcon }).addTo(this.map);
        });

        // Layer Switcher Buttons
        this._bindLayerButtons();

        // Sim Speed Buttons
        this._bindSimSpeedButtons();

        // Toggle Radar button
        const btnRadar = document.getElementById('btn-toggle-radar');
        if (btnRadar) {
            btnRadar.addEventListener('click', () => this.toggleRadar());
        }

        // Recenter Map button
        const btnRecenter = document.getElementById('btn-recenter-map');
        if (btnRecenter) {
            btnRecenter.addEventListener('click', () => {
                if (this.incidentMarker) {
                    this.map.panTo(this.incidentMarker.getLatLng());
                } else {
                    this.map.setView([37.7749, -122.4194], 14);
                }
            });
        }

        if (window.lucide) lucide.createIcons();
    }

    _bindLayerButtons() {
        const btnDark = document.getElementById('btn-layer-dark');
        const btnSat = document.getElementById('btn-layer-sat');
        const btnStreet = document.getElementById('btn-layer-street');

        const setLayer = (key, activeBtn) => {
            if (this.currentLayerKey === key) return;
            this.map.removeLayer(this.baseLayers[this.currentLayerKey]);
            this.baseLayers[key].addTo(this.map);
            this.currentLayerKey = key;

            // Update UI classes
            [btnDark, btnSat, btnStreet].forEach(b => {
                if (b) b.className = 'px-1.5 py-0.5 rounded text-slate-400 hover:text-slate-200';
            });
            if (activeBtn) {
                activeBtn.className = 'px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/30';
            }
        };

        if (btnDark) btnDark.addEventListener('click', () => setLayer('dark', btnDark));
        if (btnSat) btnSat.addEventListener('click', () => setLayer('sat', btnSat));
        if (btnStreet) btnStreet.addEventListener('click', () => setLayer('street', btnStreet));
    }

    _bindSimSpeedButtons() {
        const btn1x = document.getElementById('btn-sim-1x');
        const btn5x = document.getElementById('btn-sim-5x');
        const btn15x = document.getElementById('btn-sim-15x');

        const setSpeed = (mult, activeBtn) => {
            this.simSpeedMultiplier = mult;
            [btn1x, btn5x, btn15x].forEach(b => {
                if (b) b.className = 'px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 hover:text-white';
            });
            if (activeBtn) {
                activeBtn.className = 'px-1.5 py-0.5 rounded bg-cyan-500/30 text-cyan-300 font-bold border border-cyan-500/40';
            }
        };

        if (btn1x) btn1x.addEventListener('click', () => setSpeed(1.0, btn1x));
        if (btn5x) btn5x.addEventListener('click', () => setSpeed(5.0, btn5x));
        if (btn15x) btn15x.addEventListener('click', () => setSpeed(15.0, btn15x));
    }

    _initFleetDrivingEngine() {
        if (this.simInterval) clearInterval(this.simInterval);

        // 10 ticks per second (100ms interval) for buttery-smooth driving movement
        this.simInterval = setInterval(() => {
            if (!this.incident || !this.incident.dispatched_units) return;

            let updatedAny = false;
            this.incident.dispatched_units.forEach(u => {
                const sim = this.activeSimulations[u.unit_id];
                if (!sim || sim.arrived) return;

                // Advance progress
                const step = (0.1 / sim.totalDurationSec) * this.simSpeedMultiplier;
                sim.progress = Math.min(1.0, sim.progress + step);
                sim.remainingSec = Math.max(0, Math.round(sim.totalDurationSec * (1.0 - sim.progress)));

                // Calculate current interpolated position along waypoints
                const curPos = this._getWaypointPosition(sim.waypoints, sim.progress);
                sim.currentPos = curPos;

                // Update marker position & text
                const marker = this.unitMarkers[u.unit_id];
                if (marker) {
                    marker.setLatLng(curPos);
                    
                    const isMedic = u.unit_type.includes('AMBULANCE') || u.unit_type.includes('ALS');
                    const badgeColor = isMedic ? 'bg-red-950 border-red-400 text-red-300' : 'bg-amber-950 border-amber-400 text-amber-300';
                    const etaText = sim.progress >= 1.0 ? 'ARRIVED ON SCENE' : `${Math.floor(sim.remainingSec / 60)}m ${sim.remainingSec % 60}s`;
                    const iconClass = sim.progress >= 1.0 ? 'check-circle text-emerald-400' : 'navigation';

                    marker.setIcon(L.divIcon({
                        className: 'custom-map-icon',
                        html: `<div class="px-2 py-0.5 rounded ${badgeColor} border font-mono text-[8px] shadow-lg font-bold flex items-center gap-1"><i data-lucide="${iconClass}" class="w-2.5 h-2.5"></i> ${u.unit_id} (${etaText})</div>`,
                        iconSize: [120, 20]
                    }));
                }

                // Update Route Polyline (shrinking or active trailing vector)
                const route = this.routePolylines[u.unit_id];
                if (route && this.incident) {
                    const incCoords = [this.incident.latitude || 37.7749, this.incident.longitude || -122.4194];
                    route.setLatLngs([curPos, incCoords]);
                }

                // Check Arrival
                if (sim.progress >= 1.0 && !sim.arrived) {
                    sim.arrived = true;
                    u.status = 'ARRIVED ON SCENE';
                    u.eta_minutes = 0;
                    console.log(`[Fleet Dispatch] Unit ${u.unit_id} ARRIVED ON SCENE at incident!`);
                }
                updatedAny = true;
            });

            if (updatedAny) {
                this.renderDispatchedUnits(this.incident.dispatched_units);
                if (window.lucide) lucide.createIcons();
            }
        }, 100);
    }

    _getWaypointPosition(waypoints, progress) {
        if (!waypoints || waypoints.length === 0) return [37.7749, -122.4194];
        if (progress <= 0) return waypoints[0];
        if (progress >= 1) return waypoints[waypoints.length - 1];

        const totalSegments = waypoints.length - 1;
        const scaledProgress = progress * totalSegments;
        const segmentIndex = Math.min(totalSegments - 1, Math.floor(scaledProgress));
        const segmentFraction = scaledProgress - segmentIndex;

        const p1 = waypoints[segmentIndex];
        const p2 = waypoints[segmentIndex + 1];

        const lat = p1[0] + (p2[0] - p1[0]) * segmentFraction;
        const lng = p1[1] + (p2[1] - p1[1]) * segmentFraction;
        return [lat, lng];
    }

        if (window.lucide) lucide.createIcons();
    }

    toggleRadar() {
        this.radarEnabled = !this.radarEnabled;
        const sweepElem = document.querySelector('.radar-sweep');
        const btn = document.getElementById('btn-toggle-radar');
        if (sweepElem) {
            sweepElem.style.display = this.radarEnabled ? 'block' : 'none';
        }
        if (btn) {
            btn.className = `px-2 py-0.5 text-[10px] font-mono rounded border transition-all ${this.radarEnabled ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-slate-800 text-slate-400 border-slate-700'}`;
            btn.innerHTML = `<i data-lucide="radar" class="w-3 h-3 inline mr-1"></i> RADAR: ${this.radarEnabled ? 'ON' : 'OFF'}`;
            if (window.lucide) lucide.createIcons();
        }
    }

    connect() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/telemetry`;
        
        this.socket = new WebSocket(wsUrl);

        this.socket.onopen = () => {
            console.log('[Telemetry] Connected to Dispatch Command stream.');
            const connBadge = document.getElementById('hud-conn-status');
            if (connBadge) {
                connBadge.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> <span class="text-emerald-400 font-bold">ONLINE</span>';
            }
        };

        this.socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleMessage(data);
            } catch (e) {
                console.error('[Telemetry] Error parsing message:', e);
            }
        };

        this.socket.onclose = () => {
            const connBadge = document.getElementById('hud-conn-status');
            if (connBadge) {
                connBadge.innerHTML = '<span class="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span> <span class="text-amber-400 font-bold">RECONNECTING</span>';
            }
            setTimeout(() => this.connect(), 2000);
        };
    }

    handleMessage(msg) {
        const type = msg.type;

        if (type === 'incident_snapshot' || type === 'incident_update') {
            this.incident = msg.incident;
            this.renderIncidentState(msg.incident);
            if (msg.new_tools) {
                msg.new_tools.forEach(t => this.renderToolLog(t));
            }
        } else if (type === 'partial_transcript') {
            this.showPartialTranscript(msg.text);
        } else if (type === 'final_transcript') {
            this.hidePartialTranscript();
            this.appendTranscript(msg.speaker, msg.text, msg.timestamp);
        } else if (type === 'tool_executed') {
            this.renderToolLog(msg);
        }
    }

    renderIncidentState(inc) {
        if (!inc) return;

        // Header Incident ID
        const idElem = document.getElementById('header-incident-id');
        if (idElem) idElem.innerText = inc.incident_id;

        // Incident Classification Badge
        const typeElem = document.getElementById('badge-incident-type');
        if (typeElem) {
            typeElem.innerText = inc.incident_type || 'Pending Triage';
        }

        // Location Field
        const locElem = document.getElementById('field-location');
        if (locElem) {
            locElem.innerText = inc.location || 'Detecting...';
            if (inc.location && inc.location !== 'Detecting...') {
                locElem.className = 'font-bold text-cyan-300 font-mono cursor-pointer hover:underline';
                locElem.onclick = () => this.focusMapLocation();
            }
        }

        // Vitals & AVPU / GCS
        if (inc.vitals) {
            const gcsElem = document.getElementById('field-consciousness');
            const respElem = document.getElementById('field-breathing');
            const bleedElem = document.getElementById('field-bleeding');

            if (gcsElem) gcsElem.innerText = inc.vitals.consciousness || 'Alert (GCS 15)';
            if (respElem) respElem.innerText = inc.vitals.breathing || 'Normal';
            if (bleedElem) bleedElem.innerText = inc.vitals.bleeding || 'None';

            // Auto-check for CPR Metronome trigger on cardiac arrest
            const isCardiac = (inc.vitals.breathing && inc.vitals.breathing.toLowerCase().includes('not breathing')) ||
                              (inc.vitals.consciousness && inc.vitals.consciousness.toLowerCase().includes('unconscious')) ||
                              (inc.incident_type && inc.incident_type.toLowerCase().includes('cardiac'));

            if (isCardiac && inc.triage_level === 'RED' && window.aegisApp && !window.aegisApp.cprActive) {
                window.aegisApp.toggleCprMetronome(true);
            }
        }

        // Triage Matrix
        this.updateTriageMatrix(inc.triage_level);

        // Update Map Entities & Routes
        this.updateMapEntities(inc);

        // Dispatched Units
        this.renderDispatchedUnits(inc.dispatched_units);

        // Nearby Public Safe Havens & Landmarks
        this.renderSafeHavens(inc.safe_havens);
    }

    focusMapLocation() {
        if (this.incidentMarker && this.map) {
            this.map.flyTo(this.incidentMarker.getLatLng(), 15, { duration: 1.2 });
        }
    }

    updateMapEntities(inc) {
        if (!this.map || !window.L) return;

        const hasLocation = inc.location && inc.location !== 'Detecting...';
        const incidentCoords = [inc.latitude || 37.7749, inc.longitude || -122.4194];

        if (hasLocation) {
            if (!this.incidentMarker) {
                const incIcon = L.divIcon({
                    className: 'custom-map-icon',
                    html: `
                        <div class="px-2.5 py-1 rounded-md bg-red-600 border-2 border-white text-white font-mono text-[9px] shadow-xl flex items-center gap-1.5 font-bold animate-bounce">
                            <span class="w-2 h-2 rounded-full bg-white animate-ping"></span>
                            INCIDENT SCENE
                        </div>
                    `,
                    iconSize: [120, 26]
                });
                this.incidentMarker = L.marker(incidentCoords, { icon: incIcon }).addTo(this.map);
            } else {
                this.incidentMarker.setLatLng(incidentCoords);
            }
            this.map.flyTo(incidentCoords, 15, { duration: 1.2 });
        }

        // Hazard Perimeter Overlay (Gas leak, Fire, Hazmat)
        const isHazard = (inc.incident_type && (inc.incident_type.toLowerCase().includes('gas') || inc.incident_type.toLowerCase().includes('hazard') || inc.incident_type.toLowerCase().includes('fire') || inc.incident_type.toLowerCase().includes('explosion')));
        if (isHazard && hasLocation) {
            if (!this.hazardCircle) {
                this.hazardCircle = L.circle(incidentCoords, {
                    radius: 200,
                    color: '#f97316',
                    fillColor: '#ea580c',
                    fillOpacity: 0.2,
                    dashArray: '4, 6',
                    weight: 2
                }).addTo(this.map);
            } else {
                this.hazardCircle.setLatLng(incidentCoords);
            }
        } else if (this.hazardCircle) {
            this.map.removeLayer(this.hazardCircle);
            this.hazardCircle = null;
        }

        // Render Dispatched Units & Initialize Driving Simulation Vectors
        if (inc.dispatched_units && inc.dispatched_units.length > 0) {
            inc.dispatched_units.forEach((u, i) => {
                const isMedic = u.unit_type.includes('AMBULANCE') || u.unit_type.includes('ALS');
                const badgeColor = isMedic ? 'bg-red-950 border-red-400 text-red-300' : 'bg-amber-950 border-amber-400 text-amber-300';

                // Initialize driving simulation state if not yet tracking
                if (!this.activeSimulations[u.unit_id]) {
                    const startLat = (inc.latitude || 37.7749) + (i === 0 ? 0.015 : -0.012) + (Math.random() * 0.004);
                    const startLng = (inc.longitude || -122.4194) + (i === 0 ? -0.018 : 0.016) + (Math.random() * 0.004);
                    const origin = [startLat, startLng];

                    // Realistic city grid turn waypoints
                    const wp1 = [startLat, (inc.longitude || -122.4194)];
                    const wp2 = [(startLat + (inc.latitude || 37.7749)) / 2, (inc.longitude || -122.4194)];
                    const waypoints = [origin, wp1, wp2, incidentCoords];

                    this.activeSimulations[u.unit_id] = {
                        unit_id: u.unit_id,
                        waypoints: waypoints,
                        totalDurationSec: (u.eta_minutes || 4) * 60,
                        remainingSec: (u.eta_minutes || 4) * 60,
                        progress: 0.0,
                        currentPos: origin,
                        arrived: false
                    };

                    const uIcon = L.divIcon({
                        className: 'custom-map-icon',
                        html: `<div class="px-2 py-0.5 rounded ${badgeColor} border font-mono text-[8px] shadow-lg font-bold flex items-center gap-1"><i data-lucide="navigation" class="w-2.5 h-2.5"></i> ${u.unit_id} (ETA ${u.eta_minutes}m)</div>`,
                        iconSize: [120, 20]
                    });
                    const marker = L.marker(origin, { icon: uIcon }).addTo(this.map);
                    this.unitMarkers[u.unit_id] = marker;

                    const routeLine = L.polyline(waypoints, {
                        color: isMedic ? '#ef4444' : '#f59e0b',
                        weight: 3,
                        opacity: 0.8,
                        dashArray: '6, 8',
                        lineCap: 'round'
                    }).addTo(this.map);
                    this.routePolylines[u.unit_id] = routeLine;
                }
            });
        }

        // Render Nearby Safe Havens on Map
        if (inc.safe_havens && inc.safe_havens.length > 0) {
            // Clean previous safe haven markers
            this.safeHavenMarkers.forEach(m => this.map.removeLayer(m));
            this.safeHavenMarkers = [];

            inc.safe_havens.forEach(sh => {
                const coords = [sh.latitude || 37.7760, sh.longitude || -122.4175];
                const isAed = sh.type === 'AED_MEDICAL_REFUGE';
                const havenColor = isAed ? 'bg-emerald-950 border-emerald-400 text-emerald-300' : 'bg-indigo-950 border-indigo-400 text-indigo-300';
                const havenIcon = isAed ? 'shield-check' : 'building';

                const hIcon = L.divIcon({
                    className: 'custom-map-icon',
                    html: `<div class="px-2 py-0.5 rounded ${havenColor} border font-mono text-[8px] shadow-lg font-bold flex items-center gap-1"><i data-lucide="${havenIcon}" class="w-2.5 h-2.5"></i> ${sh.name.substring(0, 22)}... (${sh.distance_meters}m)</div>`,
                    iconSize: [140, 20]
                });
                const hMarker = L.marker(coords, { icon: hIcon }).addTo(this.map);
                hMarker.bindPopup(`
                    <div class="font-sans text-xs p-1">
                        <strong class="text-slate-900">${sh.name}</strong><br>
                        <span class="text-emerald-600 font-mono font-bold">${sh.category}</span><br>
                        <span class="text-slate-600 text-[10px]">${sh.address}</span><br>
                        <span class="text-indigo-600 font-mono text-[10px] font-bold">🚶 ${sh.distance_meters}m • ${sh.walk_time_mins} min walk</span>
                    </div>
                `);
                this.safeHavenMarkers.push(hMarker);
            });
        }

        if (window.lucide) lucide.createIcons();
    }

    renderSafeHavens(havens) {
        const container = document.getElementById('safe-havens-list');
        const countBadge = document.getElementById('safe-havens-count-badge');
        if (!container) return;

        if (!havens || havens.length === 0) {
            container.innerHTML = `
                <div class="p-2.5 rounded-xl bg-tactical-950/80 border border-tactical-border text-center text-slate-500 font-mono text-xs">
                    Scanning for nearby public shelters & AEDs...
                </div>
            `;
            if (countBadge) countBadge.innerText = 'SCANNING...';
            return;
        }

        if (countBadge) countBadge.innerText = `${havens.length} VERIFIED`;

        container.innerHTML = havens.map(h => {
            const isAed = h.type === 'AED_MEDICAL_REFUGE';
            const icon = isAed ? 'shield-check' : (h.type.includes('POLICE') ? 'shield' : 'building');
            const iconBg = isAed ? 'bg-emerald-950/80 text-emerald-400 border-emerald-500/30' : 'bg-indigo-950/80 text-indigo-400 border-indigo-500/30';
            const tagBg = isAed ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30';
            const tagText = isAed ? 'PUBLIC AED' : (h.type.includes('POLICE') ? 'SAFE ZONE' : 'SHELTER');

            return `
                <div class="p-2 rounded-xl bg-tactical-950/90 border border-tactical-border/90 flex items-center justify-between transition-all hover:border-indigo-500/50">
                    <div class="flex items-center gap-2">
                        <div class="p-1.5 rounded-lg ${iconBg} border">
                            <i data-lucide="${icon}" class="w-3.5 h-3.5"></i>
                        </div>
                        <div>
                            <div class="font-bold text-slate-200 text-xs">${h.name}</div>
                            <div class="text-[10px] text-slate-400">${h.address} • <span class="text-cyan-400 font-mono">${h.distance_meters}m (${h.walk_time_mins} min walk)</span></div>
                        </div>
                    </div>
                    <span class="px-1.5 py-0.5 text-[9px] font-mono font-bold rounded ${tagBg} border">${tagText}</span>
                </div>
            `;
        }).join('');

        if (window.lucide) lucide.createIcons();
    }

    updateTriageMatrix(level) {
        const badge = document.getElementById('triage-badge');
        const cGreen = document.getElementById('card-triage-green');
        const cAmber = document.getElementById('card-triage-amber');
        const cRed = document.getElementById('card-triage-red');
        const mainContainer = document.querySelector('main');

        if (cGreen) cGreen.classList.remove('triage-active-green');
        if (cAmber) cAmber.classList.remove('triage-active-amber');
        if (cRed) cRed.classList.remove('triage-active-red');

        if (mainContainer) {
            mainContainer.classList.remove('emergency-glow-red', 'emergency-glow-amber', 'emergency-glow-green');
        }

        if (level === 'RED') {
            if (cRed) cRed.classList.add('triage-active-red');
            if (badge) {
                badge.className = 'px-2.5 py-0.5 text-xs font-mono font-bold rounded bg-red-500/25 text-red-400 border border-red-500/50 animate-pulse shadow-md shadow-red-950/50';
                badge.innerText = 'P1 - ECHO LIFE THREAT';
            }
            if (mainContainer) mainContainer.classList.add('emergency-glow-red');
        } else if (level === 'AMBER') {
            if (cAmber) cAmber.classList.add('triage-active-amber');
            if (badge) {
                badge.className = 'px-2.5 py-0.5 text-xs font-mono font-bold rounded bg-amber-500/25 text-amber-400 border border-amber-500/50 shadow-md shadow-amber-950/50';
                badge.innerText = 'P2 - DELTA URGENT';
            }
            if (mainContainer) mainContainer.classList.add('emergency-glow-amber');
        } else {
            if (cGreen) cGreen.classList.add('triage-active-green');
            if (badge) {
                badge.className = 'px-2.5 py-0.5 text-xs font-mono font-bold rounded bg-emerald-500/25 text-emerald-400 border border-emerald-500/50';
                badge.innerText = 'P3 - ALPHA STANDARD';
            }
            if (mainContainer) mainContainer.classList.add('emergency-glow-green');
        }
    }

    renderDispatchedUnits(units) {
        const container = document.getElementById('dispatched-units-list');
        const countBadge = document.getElementById('dispatched-count-badge');
        if (!container) return;

        if (!units || units.length === 0) {
            container.innerHTML = `
                <div class="text-center py-5 text-slate-500 font-mono text-xs">
                    <i data-lucide="radio" class="w-6 h-6 mx-auto mb-1.5 opacity-30 text-slate-400"></i>
                    No units dispatched yet. Awaiting AI triage recommendations.
                </div>
            `;
            if (countBadge) countBadge.innerText = '0 UNITS';
            if (window.lucide) lucide.createIcons();
            return;
        }

        if (countBadge) countBadge.innerText = `${units.length} UNITS EN ROUTE`;

        container.innerHTML = units.map(u => {
            const isMedic = u.unit_type.includes('AMBULANCE') || u.unit_type.includes('ALS');
            const isFire = u.unit_type.includes('FIRE') || u.unit_type.includes('HAZMAT');
            const icon = isMedic ? 'ambulance' : (isFire ? 'flame' : 'shield');
            const badgeBg = isMedic ? 'bg-red-950/60 border-red-500/40 text-red-300' : (isFire ? 'bg-amber-950/60 border-amber-500/40 text-amber-300' : 'bg-blue-950/60 border-blue-500/40 text-blue-300');
            
            const sim = this.activeSimulations[u.unit_id];
            const progress = sim ? Math.round(sim.progress * 100) : Math.max(10, Math.min(95, 100 - (u.eta_minutes * 10)));
            const isArrived = sim && sim.arrived;
            const etaString = isArrived ? 'ARRIVED ON SCENE' : (sim ? `${Math.floor(sim.remainingSec / 60)}m ${sim.remainingSec % 60}s` : `ETA ${u.eta_minutes} MIN`);
            const statusBadgeClass = isArrived ? 'bg-emerald-500/30 text-emerald-300 border-emerald-500/50' : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';

            return `
                <div class="p-2.5 rounded-lg border ${badgeBg} bg-tactical-900/90 shadow-md transition-all hover:scale-[1.01]">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-2.5">
                            <div class="p-2 rounded-lg bg-slate-800/90 border border-slate-700">
                                <i data-lucide="${icon}" class="w-4 h-4"></i>
                            </div>
                            <div>
                                <div class="font-bold text-slate-100 font-mono text-xs flex items-center gap-1.5">
                                    ${u.unit_id}
                                    <span class="text-[9px] px-1.5 py-0.5 bg-slate-800 rounded font-normal text-slate-300 border border-slate-700">${u.unit_type}</span>
                                </div>
                                <div class="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                                    <i data-lucide="map-pin" class="w-2.5 h-2.5 text-slate-500"></i> ${u.station}
                                </div>
                            </div>
                        </div>
                        <div class="text-right">
                            <span class="px-2 py-0.5 text-[10px] font-mono font-bold rounded ${statusBadgeClass} border">
                                ${etaString}
                            </span>
                            <div class="text-[9px] text-cyan-400 font-mono uppercase mt-1 flex items-center justify-end gap-1">
                                <span class="w-1.5 h-1.5 rounded-full ${isArrived ? 'bg-emerald-400' : 'bg-cyan-400 animate-ping'}"></span> ${isArrived ? 'ON SCENE' : u.status}
                            </div>
                        </div>
                    </div>
                    <!-- Mini live progress bar -->
                    <div class="w-full bg-slate-800 rounded-full h-1.5 mt-2 overflow-hidden">
                        <div class="bg-gradient-to-r from-cyan-500 to-emerald-400 h-full rounded-full transition-all duration-300" style="width: ${progress}%"></div>
                    </div>
                </div>
            `;
        }).join('');

        if (window.lucide) lucide.createIcons();
    }

    renderToolLog(toolData) {
        this.cachedTools.unshift(toolData);
        const container = document.getElementById('tool-logs-container');
        if (!container) return;

        if (container.innerHTML.includes('Waiting for tool triggers')) {
            container.innerHTML = '';
        }

        const name = toolData.name || toolData.tool || 'tool_call';
        const argsStr = JSON.stringify(toolData.args || {}, null, 2);
        const time = toolData.timestamp || new Date().toLocaleTimeString();

        const logDiv = document.createElement('div');
        logDiv.className = 'p-2.5 rounded-lg bg-tactical-800/90 border border-amber-500/30 font-mono text-[10px] leading-relaxed shadow-sm transition-all hover:border-amber-400';
        logDiv.innerHTML = `
            <div class="flex items-center justify-between text-amber-400 font-bold mb-1">
                <span class="flex items-center gap-1"><i data-lucide="zap" class="w-3 h-3"></i> ${name}()</span>
                <span class="text-slate-500 text-[9px]">${time}</span>
            </div>
            <div class="p-1.5 bg-tactical-950 rounded border border-tactical-border/60 text-slate-300 overflow-x-auto whitespace-pre">${argsStr}</div>
            <div class="text-emerald-400 mt-1 flex items-center gap-1 font-bold">
                <i data-lucide="check-circle" class="w-3 h-3"></i> EXECUTED & COMMITTED
            </div>
        `;
        container.prepend(logDiv);
        if (window.lucide) lucide.createIcons();
    }

    appendTranscript(speaker, text, timestamp) {
        const feed = document.getElementById('transcript-feed');
        if (!feed) return;

        const isAgent = speaker.toLowerCase().includes('agent') || speaker.toLowerCase().includes('dispatch');
        const bubbleClass = isAgent ? 'msg-agent ml-4' : 'msg-caller mr-4';
        const speakerColor = isAgent ? 'text-cyan-400' : 'text-rose-400';
        const speakerIcon = isAgent ? 'headset' : 'user';

        let formattedText = text
            .replace(/(\d+[\w\s]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Highway|Hwy|Market|Broadway|Pine))/gi, '<span class="entity-chip-location" onclick="window.telemetryManager.focusMapLocation()"><i data-lucide="map-pin" class="inline w-3 h-3"></i> $1</span>')
            .replace(/(unconscious|cardiac arrest|not breathing|bleeding heavily|severe collision|trapped|fire|gas leak|chest compressions)/gi, '<span class="entity-chip-danger"><i data-lucide="alert-triangle" class="inline w-3 h-3"></i> $1</span>')
            .replace(/(MPDS|Echo|Delta|Alpha|GCS 15|CPR)/gi, '<span class="entity-chip-protocol"><i data-lucide="shield" class="inline w-3 h-3"></i> $1</span>');

        const div = document.createElement('div');
        div.className = `p-3 rounded-xl ${bubbleClass} text-xs shadow-lg transition-all animate-fade-in`;
        div.innerHTML = `
            <div class="flex items-center justify-between font-mono text-[10px] mb-1.5 font-bold ${speakerColor}">
                <span class="flex items-center gap-1.5">
                    <i data-lucide="${speakerIcon}" class="w-3.5 h-3.5"></i>
                    ${speaker.toUpperCase()}
                </span>
                <span class="text-slate-400 text-[9px] font-normal">${timestamp || new Date().toLocaleTimeString()}</span>
            </div>
            <div class="text-slate-100 leading-relaxed font-sans">${formattedText}</div>
        `;

        feed.appendChild(div);
        feed.scrollTop = feed.scrollHeight;
        if (window.lucide) lucide.createIcons();
    }

    showPartialTranscript(text) {
        const bar = document.getElementById('partial-transcript-bar');
        const textElem = document.getElementById('partial-text');
        if (bar && textElem) {
            bar.classList.remove('hidden');
            textElem.innerText = text;
        }
    }

    hidePartialTranscript() {
        const bar = document.getElementById('partial-transcript-bar');
        if (bar) bar.classList.add('hidden');
    }

    _bindEvents() {
        // Quick Scenario Simulator Buttons
        document.querySelectorAll('.btn-scenario').forEach(btn => {
            btn.addEventListener('click', () => {
                const text = btn.getAttribute('data-text');
                if (window.aegisApp) {
                    window.aegisApp.sendTextPrompt(text);
                }
            });
        });

        // Reset Incident Button
        const resetBtn = document.getElementById('btn-reset-incident');
        if (resetBtn) {
            resetBtn.addEventListener('click', async () => {
                if (confirm("Reset current emergency incident? All telemetry and logs will be refreshed.")) {
                    try {
                        await fetch('/api/reset', { method: 'POST' });
                        document.getElementById('transcript-feed').innerHTML = `
                            <div class="text-center my-3">
                                <span class="text-[11px] font-mono text-slate-400 bg-tactical-900 px-4 py-1.5 rounded-full border border-tactical-border">
                                    CAD Incident Reset • Ready for incoming emergency call
                                </span>
                            </div>
                        `;
                        document.getElementById('tool-logs-container').innerHTML = `<div class="text-slate-500 italic p-2">[Waiting for tool triggers...]</div>`;
                        if (window.aegisApp) {
                            window.aegisApp.toggleCprMetronome(false);
                        }
                    } catch (e) {
                        console.error('Reset error:', e);
                    }
                }
            });
        }

        // Export Modal & Tabs
        const exportBtn = document.getElementById('btn-export-report');
        const fhirBtn = document.getElementById('btn-export-fhir');
        const modal = document.getElementById('modal-export');
        const closeModal = document.getElementById('btn-close-modal');
        const copyBtn = document.getElementById('btn-copy-clipboard');
        const dlBtn = document.getElementById('btn-download-export');
        const tabMd = document.getElementById('tab-export-md');
        const tabFhir = document.getElementById('tab-export-fhir');
        const tabRaw = document.getElementById('tab-export-raw');
        let activeTab = 'md';

        const updateExportContent = async (tab) => {
            activeTab = tab;
            const pre = document.getElementById('export-content-pre');
            const title = document.getElementById('modal-title');

            [tabMd, tabFhir, tabRaw].forEach(t => {
                if (t) t.className = 'px-3 py-1 text-xs font-semibold rounded text-slate-400 hover:text-white transition-all';
            });

            if (tab === 'md') {
                if (tabMd) tabMd.className = 'px-3 py-1 text-xs font-semibold rounded bg-cyan-600 text-white shadow';
                if (title) title.innerText = 'CAD Incident Case File (Markdown)';
                if (pre) pre.innerText = this.generateMarkdownReport();
            } else if (tab === 'fhir') {
                if (tabFhir) tabFhir.className = 'px-3 py-1 text-xs font-semibold rounded bg-purple-600 text-white shadow';
                if (title) title.innerText = 'HL7 FHIR (R4) Clinical Encounter Bundle';
                try {
                    const res = await fetch('/api/incident/fhir');
                    const fhirData = await res.json();
                    if (pre) pre.innerText = JSON.stringify(fhirData, null, 2);
                } catch (e) {
                    if (pre) pre.innerText = 'Error loading FHIR bundle.';
                }
            } else if (tab === 'raw') {
                if (tabRaw) tabRaw.className = 'px-3 py-1 text-xs font-semibold rounded bg-amber-600 text-white shadow';
                if (title) title.innerText = 'Raw CAD Incident JSON Telemetry';
                if (pre) pre.innerText = JSON.stringify(this.incident || {}, null, 2);
            }
        };

        if (tabMd) tabMd.addEventListener('click', () => updateExportContent('md'));
        if (tabFhir) tabFhir.addEventListener('click', () => updateExportContent('fhir'));
        if (tabRaw) tabRaw.addEventListener('click', () => updateExportContent('raw'));

        if (exportBtn && modal) {
            exportBtn.addEventListener('click', () => {
                modal.classList.remove('hidden');
                updateExportContent('md');
            });
        }

        if (fhirBtn && modal) {
            fhirBtn.addEventListener('click', () => {
                modal.classList.remove('hidden');
                updateExportContent('fhir');
            });
        }

        if (closeModal && modal) {
            closeModal.addEventListener('click', () => modal.classList.add('hidden'));

            copyBtn.addEventListener('click', () => {
                const text = document.getElementById('export-content-pre').innerText;
                navigator.clipboard.writeText(text);
                copyBtn.innerHTML = '<i data-lucide="check" class="w-3.5 h-3.5"></i> Copied!';
                setTimeout(() => {
                    copyBtn.innerHTML = '<i data-lucide="copy" class="w-3.5 h-3.5"></i> Copy to Clipboard';
                    if (window.lucide) lucide.createIcons();
                }, 2000);
            });

            dlBtn.addEventListener('click', () => {
                const text = document.getElementById('export-content-pre').innerText;
                const isJson = activeTab === 'fhir' || activeTab === 'raw';
                const blob = new Blob([text], { type: isJson ? 'application/json' : 'text/markdown' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${this.incident ? this.incident.incident_id : 'INCIDENT'}_${activeTab.toUpperCase()}.${isJson ? 'json' : 'md'}`;
                a.click();
            });
        }
    }

    generateMarkdownReport() {
        const inc = this.incident || {};
        const vitals = inc.vitals || {};
        const units = inc.dispatched_units || [];
        const transcripts = inc.call_transcript || [];

        return `# 🚨 EMERGENCY 911 CAD INCIDENT REPORT
**Incident ID:** ${inc.incident_id || 'N/A'}  
**Generated At:** ${new Date().toISOString()}  
**Triage Priority:** ${inc.triage_level || 'STANDARD'}  
**Location:** ${inc.location || 'Unknown'}  
**Incident Classification:** ${inc.incident_type || 'Emergency Triage'}  

---

## 🩺 Patient Clinical Triage & Vitals
- **Consciousness:** ${vitals.consciousness || 'Unknown'}
- **Respiratory State:** ${vitals.breathing || 'Unknown'}
- **Hemorrhage / Bleeding:** ${vitals.bleeding || 'None'}
- **Assessed Severity Level:** ${vitals.triage_level || 'STANDARD'}

---

## 🚒 Active Responder Units Dispatched (${units.length})
${units.map(u => `- **${u.unit_id}** (${u.unit_type}) from ${u.station} — ETA: ${u.eta_minutes} min [${u.status}]`).join('\n') || 'None'}

---

## 🎙️ Real-time Audio Transcript Log
${transcripts.map(t => `**[${t.timestamp || ''}] ${t.speaker}:** ${t.text}`).join('\n\n') || 'No transcripts recorded.'}

---
*Generated autonomously by AegisVoice Pro (AssemblyAI Universal-Streaming + Multi-Agent CAD Engine)*
`;
    }
}

window.telemetryManager = new TelemetryManager();
