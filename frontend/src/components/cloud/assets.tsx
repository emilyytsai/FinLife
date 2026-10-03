"use client";

import { PointCloud } from "@/components/cloud/PointCloud";
import {
  cashStackCloud,
  childCloud,
  condoCloud,
  creditCardCloud,
  debitCardCloud,
  houseCloud,
  investmentsCloud,
  marketNodesCloud,
  networkSphereCloud,
  personCloud,
  savingsCubeCloud,
  sedanCloud,
  spouseCloud,
  suvCloud,
  waveChartCloud,
  type Cloud,
} from "@/lib/pointcloud/models";

// The LiDAR asset library: one component per asset, each a point cloud with its own idle motion.
// Models are built once, on first use, and shared by every instance.

function once(build: () => Cloud): () => Cloud {
  let cloud: Cloud | null = null;
  return () => (cloud ??= build());
}

const MODELS = {
  person: once(personCloud),
  spouse: once(spouseCloud),
  child1: once(() => childCloud(1)),
  child2: once(() => childCloud(2)),
  house: once(houseCloud),
  condo: once(condoCloud),
  sedan: once(sedanCloud),
  suv: once(suvCloud),
  debit: once(debitCardCloud),
  credit: once(creditCardCloud),
  cash: once(cashStackCloud),
  network: once(networkSphereCloud),
  cube: once(savingsCubeCloud),
  wave: once(waveChartCloud),
  market: once(marketNodesCloud),
  investments: once(investmentsCloud),
};

interface AssetProps {
  className?: string;
  phase?: number;
}

// Tangible assets: people sway gently, the house and cars turn a little to show their depth.
export const PersonAsset = ({ className = "h-52 w-24", phase = 0 }: AssetProps) => (
  <PointCloud cloud={MODELS.person()} motion="sway" phase={phase} dotSize={1.1} className={className} />
);
export const SpouseAsset = ({ className = "h-48 w-24", phase = 1.3 }: AssetProps) => (
  <PointCloud cloud={MODELS.spouse()} motion="sway" phase={phase} dotSize={1.1} className={className} />
);
export const ChildAsset = ({ className = "h-32 w-16", phase = 2.1, variant = 1 }: AssetProps & { variant?: 1 | 2 }) => (
  <PointCloud cloud={variant === 1 ? MODELS.child1() : MODELS.child2()} motion="sway" phase={phase} className={className} />
);
export const HouseAsset = ({ className = "h-52 w-64", phase = 0.4 }: AssetProps) => (
  <PointCloud cloud={MODELS.house()} motion="sway" angle={-0.55} phase={phase} tilt={0.28} className={className} />
);
export const CondoAsset = ({ className = "h-56 w-40", phase = 0.6 }: AssetProps) => (
  <PointCloud cloud={MODELS.condo()} motion="sway" angle={-0.5} phase={phase} tilt={0.22} className={className} />
);
export const SedanAsset = ({ className = "h-28 w-52", phase = 0.8 }: AssetProps) => (
  <PointCloud cloud={MODELS.sedan()} motion="sway" angle={-0.5} phase={phase} tilt={0.3} className={className} />
);
export const SuvAsset = ({ className = "h-32 w-52", phase = 1.6 }: AssetProps) => (
  <PointCloud cloud={MODELS.suv()} motion="sway" angle={-0.5} phase={phase} tilt={0.3} className={className} />
);

// Quantifiable assets: abstract structures that turn continuously.
export const DebitCardAsset = ({ className = "size-24", phase = 0 }: AssetProps) => (
  <PointCloud cloud={MODELS.debit()} motion="sway" angle={-0.35} tilt={0.35} phase={phase} className={className} />
);
export const CreditCardAsset = ({ className = "size-24", phase = 0.9 }: AssetProps) => (
  <PointCloud cloud={MODELS.credit()} motion="sway" angle={-0.35} tilt={0.35} phase={phase} className={className} />
);
export const CashStackAsset = ({ className = "size-24", phase = 0.3 }: AssetProps) => (
  <PointCloud cloud={MODELS.cash()} motion="spin" speed={0.25} tilt={0.4} phase={phase} className={className} />
);
export const NetworkSphereAsset = ({ className = "size-24", phase = 0.5 }: AssetProps) => (
  <PointCloud cloud={MODELS.network()} motion="spin" speed={0.22} phase={phase} className={className} />
);
export const SavingsCubeAsset = ({ className = "size-24", phase = 1.1 }: AssetProps) => (
  <PointCloud cloud={MODELS.cube()} motion="spin" speed={0.2} tilt={0.5} phase={phase} className={className} />
);
export const WaveChartAsset = ({ className = "size-24", phase = 0.7 }: AssetProps) => (
  <PointCloud cloud={MODELS.wave()} motion="sway" angle={-0.5} tilt={0.5} phase={phase} className={className} />
);
export const InvestmentsAsset = ({ className = "size-24", phase = 1.4 }: AssetProps) => (
  <PointCloud cloud={MODELS.investments()} motion="sway" angle={-0.45} tilt={0.3} phase={phase} className={className} />
);
export const MarketNodesAsset = ({ className = "size-24", phase = 1.9 }: AssetProps) => (
  <PointCloud cloud={MODELS.market()} motion="spin" speed={0.24} phase={phase} className={className} />
);
