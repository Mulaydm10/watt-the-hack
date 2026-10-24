import type { Building, PhotoFindings } from '../engine/types';

export type Ownership = 'owner' | 'co-owner' | 'tenant' | 'landlord';
export type BoilerAge = 'broken' | 'over20' | '10to20' | 'under10';
export type Timeline = 'asap' | 'within6m' | 'within2y' | 'curious';
export type YesNoUnsure = 'yes' | 'no' | 'unsure';

/** All optional; null = "prefer not to say". Nothing personal: no name, age, income, nationality. */
export type Commitment = {
  ownership: Ownership | null;
  boiler: BoilerAge | null;
  timeline: Timeline | null;
  decisionMakers: YesNoUnsure | null;
  subsidiesLooked: 'yes' | 'no' | null;
  sharePhotos: 'yes' | 'later' | null;
};

export const NO_COMMITMENT: Commitment = { ownership: null, boiler: null, timeline: null, decisionMakers: null, subsidiesLooked: null, sharePhotos: null };

export type MeterCabinet = 'modern' | 'old-or-full' | 'unclear';

/** Remote pre-check: photo tasks the homeowner can do from the phone. */
export type PreCheck = {
  meterCabinet: MeterCabinet | null; // null = not provided
  outdoorSpot: { space1x1: YesNoUnsure; neighbourOk: YesNoUnsure } | null;
  boilerRoomPhoto: boolean;
  radiatorPhoto: boolean;
};

export const NO_PRECHECK: PreCheck = { meterCabinet: null, outdoorSpot: null, boilerRoomPhoto: false, radiatorPhoto: false };

export type Lead = {
  id: string;
  building: Building;
  photo?: PhotoFindings;
  commitment: Commitment;
  preCheck: PreCheck;
  consent: boolean;
  source: 'demo' | 'homeowner';
  createdAt: string;
};

export type Tier = 'A' | 'B' | 'C' | 'D';
export type CommitmentLevel = 'high' | 'medium' | 'low' | 'unknown';
