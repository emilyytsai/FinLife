import type { Metadata } from "next";
import type { ReactNode } from "react";
import {
  CashStackAsset,
  ChildAsset,
  CreditCardAsset,
  DebitCardAsset,
  DebtAsset,
  HouseAsset,
  InvestmentsAsset,
  MarketNodesAsset,
  NetworkSphereAsset,
  PersonAsset,
  SavingsCubeAsset,
  SedanAsset,
  SpouseAsset,
  SuvAsset,
  WaveChartAsset,
} from "@/components/cloud/assets";

export const metadata: Metadata = {
  title: "Asset library | FinLife",
};

// /library/: every LiDAR asset in one place, for design review. Names only; no values.
export default function LibraryPage() {
  return (
    <main className="min-h-full flex-1 bg-black px-4 py-8 text-neutral-200 sm:px-8">
      <h1 className="text-[11px] font-semibold uppercase tracking-[0.24em] text-neutral-400">FinLife asset library</h1>

      <h2 className="mt-8 text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-500">Tangible</h2>
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <Tile name="Person">
          <PersonAsset />
        </Tile>
        <Tile name="Spouse">
          <SpouseAsset />
        </Tile>
        <Tile name="Child 1">
          <ChildAsset variant={1} />
        </Tile>
        <Tile name="Child 2">
          <ChildAsset variant={2} phase={3} />
        </Tile>
        <Tile name="Family house" wide>
          <HouseAsset />
        </Tile>
        <Tile name="Sedan">
          <SedanAsset className="h-28 w-full" />
        </Tile>
        <Tile name="SUV">
          <SuvAsset className="h-32 w-full" />
        </Tile>
      </div>

      <h2 className="mt-10 text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-500">Quantifiable</h2>
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-9">
        <Tile name="Debit">
          <DebitCardAsset />
        </Tile>
        <Tile name="Credit">
          <CreditCardAsset />
        </Tile>
        <Tile name="Debt">
          <DebtAsset />
        </Tile>
        <Tile name="Cash">
          <CashStackAsset />
        </Tile>
        <Tile name="401(k)">
          <NetworkSphereAsset />
        </Tile>
        <Tile name="Savings">
          <SavingsCubeAsset />
        </Tile>
        <Tile name="Investments">
          <InvestmentsAsset />
        </Tile>
        <Tile name="Stocks">
          <WaveChartAsset />
        </Tile>
        <Tile name="Other investments">
          <MarketNodesAsset />
        </Tile>
      </div>
    </main>
  );
}

function Tile({ name, wide = false, children }: { name: string; wide?: boolean; children: ReactNode }) {
  return (
    <figure className={`flex flex-col items-center justify-end gap-3 rounded-2xl border border-white/10 p-4 ${wide ? "col-span-2" : ""}`}>
      {children}
      <figcaption className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-400">{name}</figcaption>
    </figure>
  );
}
