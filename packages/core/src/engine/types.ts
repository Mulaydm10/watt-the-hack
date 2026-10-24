export type Renovation = 'unrenovated' | 'partially' | 'fully' | null;
export type Distribution = 'radiators' | 'underfloor' | 'mixed' | 'wall' | 'ceiling';
/** Low-temperature surface heating (underfloor, wall, ceiling): no radiators to check. */
export const isSurfaceHeating = (d: Distribution | null) => d === 'underfloor' || d === 'wall' || d === 'ceiling';
export type HouseType = 'detached' | 'semi' | 'terraced' | 'apartment' | 'other';
export type Carrier = 'gas' | 'oil' | 'district' | 'electric' | 'biomass' | 'other';
export type PipeSystem = 'two-pipe' | 'single-pipe' | 'unknown';
export type Verdict = 'green' | 'yellow' | 'red';
export type Confidence = 'high' | 'medium' | 'low';

export type Building = {
  building_id?: string;
  construction_year: number | null;
  floor_area_m2: number | null;
  renovation_status: Renovation;
  heat_distribution: Distribution | null;
  annual_consumption_kwh: number | null;
  energy_carrier: Carrier | null;
  energy_carrier_detail?: string;
  radiator_info?: string;
  pipe_system: PipeSystem;
  flow_temperature_c: number | null;
  persons_in_household: number | null;
  hot_water_via_heating: boolean | null;
  rooms: number | null;
  building_notes?: string;
  location?: string;
  // Agent / teammate parameters (v0.2). All optional; unknown = not documented.
  house_type?: HouseType | null;
  units_in_building?: number | null;
  /** Landlord, owners' association (WEG) or co-owners must approve. */
  approval_needed?: boolean | null;
  /** Energy certificate demand, kWh per m² and year. Cross-check only; never replaces the bill. */
  certificate_kwh_m2a?: number | null;
  /** Rooms do not heat evenly / comfort complaints. */
  uneven_heating?: boolean | null;
  /** Set only by the path-to-green simulation: bill, area and rooms confirmed on site. */
  verified_on_site?: boolean;
  reference_heating_load_kw?: number;
  expected_verdict?: Verdict;
};

/** Result of the photo classifier (AI or manual questions). */
export type PhotoFindings = {
  label: 'single-pipe' | 'two-pipe' | 'unclear';
  confidence: number;
  evidence: string[];
  radiator_type?: '11' | '22' | '33' | 'unknown';
  source: 'ai' | 'manual';
};

export type Reason = { effect: string; reason: string };

export type Range = { low: number; high: number };

export type HeatLoad = {
  methodA: (Range & { wPerM2: Range; band: string; notes: string[] }) | null;
  methodB: { kw: number; wPerM2: number; usefulHeatKwh: number; steps: string[] } | null;
  bestKw: number | null;
  bestWPerM2: number | null;
  range: Range | null;
  rules: Reason[];
};

export type Flag = { title: string; detail: string; critical?: boolean };

export type Flags = {
  obstacles: Flag[];
  unknowns: Flag[];
  contradictions: Flag[];
  technicianChecks: Flag[];
  tips: string[];
};

export type Radiators = {
  jaz: number;
  jazWorst: number;
  flowTemp: string;
  reason: string;
  likelyAbove55: boolean;
};

export type Costs = {
  usefulHeatKwh: number;
  heatPumpEur: number;
  heatPumpEurWorst: number;
  currentEur: number | null;
  currentLabel: string;
  assumptions: string[];
};

export type Assessment = {
  verdict: Verdict;
  confidence: Confidence;
  headline: string;
  verdictReasons: string[];
  heatLoad: HeatLoad;
  radiators: Radiators;
  costs: Costs | null;
  flags: Flags;
  pipeSystem: { value: PipeSystem; source: string };
};
