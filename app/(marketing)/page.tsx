import { Faq, type FaqItem } from "@/components/blocks/faq";
import { Hero } from "@/components/blocks/hero";
import { HowItWorks, type CoverageChip, type Step } from "@/components/blocks/how-it-works";
import { Pricing } from "@/components/blocks/pricing";
import { StatBand, type Stat } from "@/components/blocks/stat-band";

const stats: readonly Stat[] = [
  { value: "22", unit: "min", label: "Target average response" },
  { value: "24/7", label: "Dispatch, every day" },
  { value: "50", unit: "+", label: "Cities planned" },
];

const steps: readonly Step[] = [
  {
    number: "01",
    icon: "pin",
    title: "Drop a pin",
    body: "Share your location, battery level, and connector type. Add a note if the spot is hard to find.",
    foot: "Takes under a minute",
  },
  {
    number: "02",
    icon: "route",
    title: "We dispatch the nearest van",
    body: "Dispatch matches a van with the right connector and enough charge, then sends you a live ETA.",
    foot: "Auto-assign + dispatcher override",
  },
  {
    number: "03",
    icon: "bolt",
    title: "Charge where you park",
    body: "A verified technician tops you up to your target. Pay in-app after the charge and get a receipt by email.",
    foot: "Pay after service",
  },
];

const coverage: readonly CoverageChip[] = [
  { label: "Indiranagar" },
  { label: "Koramangala" },
  { label: "HSR Layout" },
  { label: "Whitefield" },
  { label: "Guwahati · planned", planned: true },
  { label: "50+ cities planned", planned: true, icon: "plus" },
];

const faqs: readonly FaqItem[] = [
  {
    question: "What if no van is near me?",
    answer:
      "Dispatch keeps searching and escalates to a human dispatcher. If we cannot reach you within the promised window, you can cancel at no cost.",
  },
  {
    question: "Do I need to stay with the car?",
    answer:
      "We recommend it. If you need to step away, confirm with the technician first — they will call when they arrive and walk you through the handover.",
  },
  {
    question: "Which connectors do you support?",
    answer:
      "CCS2, CHAdeMO, and Type 2 in the demo. Connector compatibility is checked before a van is assigned, so you never wait for the wrong van.",
  },
  {
    question: "Is this a real service?",
    answer:
      "This is a design concept for an internship project. The fleet is simulated, the stats are targets, and payments use Razorpay test mode.",
  },
];

export default function LandingPage() {
  return (
    <main id="main">
      <Hero />
      <StatBand
        items={stats}
        note="Targets from the pilot plan — not current coverage. Demo fleet is simulated."
      />
      <HowItWorks steps={steps} coverage={coverage} />
      <Pricing city="Bengaluru" baseFeePaise={19_900} perKwhPaise={1_800} exampleKwh={11} />
      <Faq items={faqs} />
    </main>
  );
}
