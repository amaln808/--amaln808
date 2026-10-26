import { describe, expect, it } from "vitest";
import {
  averageUnitCost,
  marginOfPrice,
  markupFromMargin,
  priceForMargin,
  suggestUnitPrice,
  withVat,
} from "./pricing";

describe("pricing", () => {
  it("prices for a margin on the selling price, not a markup on cost", () => {
    expect(priceForMargin(700, 30)).toBe(1000);
    expect(priceForMargin(678, 40)).toBe(1130);
    expect(priceForMargin(700, 100)).toBeNull();
    expect(markupFromMargin(30)).toBeCloseTo(42.857, 2);
    expect(marginOfPrice(700, 1000)).toBeCloseTo(30);
  });

  it("adds VAT and averages the latest batches by units made", () => {
    expect(withVat(1000, 5)).toBe(1050);
    expect(
      averageUnitCost(
        [
          {
            productionDate: "2026-10-01",
            qtyProduced: 100,
            totalCostBaisa: 70000,
          },
          {
            productionDate: "2026-10-10",
            qtyProduced: 50,
            totalCostBaisa: 40000,
          },
          {
            productionDate: "2026-08-01",
            qtyProduced: 1000,
            totalCostBaisa: 1,
          },
        ],
        2,
      ),
    ).toBeCloseTo(733.333, 2);
    expect(averageUnitCost([])).toBeNull();
  });

  it("suggests a line price: channel, then this customer, then anyone, then cost + margin", () => {
    expect(
      suggestUnitPrice({
        channelPrice: 1500,
        customerLast: 1400,
        unitCost: 700,
        marginPct: 30,
      }),
    ).toEqual({ priceBaisa: 1500, source: "channel" });
    expect(
      suggestUnitPrice({
        customerLast: 1400,
        anyLast: 1300,
        unitCost: 700,
        marginPct: 30,
      }),
    ).toEqual({ priceBaisa: 1400, source: "customer" });
    expect(
      suggestUnitPrice({ anyLast: 1300, unitCost: 700, marginPct: 30 }),
    ).toEqual({ priceBaisa: 1300, source: "last" });
    expect(suggestUnitPrice({ unitCost: 700, marginPct: 30 })).toEqual({
      priceBaisa: 1000,
      source: "cost",
    });
    expect(suggestUnitPrice({ marginPct: 30 })).toBeNull();
  });
});
