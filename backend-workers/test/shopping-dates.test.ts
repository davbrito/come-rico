import { describe, expect, it } from "vitest";
import { addDays, mondayOf } from "../src/features/shopping";

describe("shopping week math", () => {
  it("maps any weekday to the Monday of its week", () => {
    // 2026-07-08 is a Wednesday → Monday is 2026-07-06.
    expect(mondayOf("2026-07-08")).toBe("2026-07-06");
    // Monday maps to itself.
    expect(mondayOf("2026-07-06")).toBe("2026-07-06");
    // Sunday belongs to the same week's Monday, not the next.
    expect(mondayOf("2026-07-12")).toBe("2026-07-06");
  });

  it("computes the inclusive week end (Monday + 6 = Sunday)", () => {
    expect(addDays("2026-07-06", 6)).toBe("2026-07-12");
  });

  it("crosses month boundaries correctly", () => {
    // 2026-08-01 is a Saturday → Monday 2026-07-27.
    expect(mondayOf("2026-08-01")).toBe("2026-07-27");
  });
});
