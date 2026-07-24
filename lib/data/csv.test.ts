import { describe, it, expect } from "vitest";
import { rowsToCsv } from "./csv";
import type { DataRow } from "./store";

describe("rowsToCsv", () => {
  it("empty rows returns header only (empty)", () => {
    expect(rowsToCsv([])).toBe("");
  });

  it("single row with single column", () => {
    const rows: DataRow[] = [{ name: "test" }];
    expect(rowsToCsv(rows)).toBe("name\r\ntest");
  });

  it("multiple rows and columns", () => {
    const rows: DataRow[] = [
      { name: "Product A", price: "100", link: "https://a.com" },
      { name: "Product B", price: "200", link: "https://b.com" },
    ];
    expect(rowsToCsv(rows)).toBe(
      'name,price,link\r\nProduct A,100,https://a.com\r\nProduct B,200,https://b.com',
    );
  });

  it("escapes commas and quotes in values", () => {
    const rows: DataRow[] = [{ name: 'He said "hello, world"' }];
    expect(rowsToCsv(rows)).toBe('name\r\n"He said ""hello, world"""');
  });

  it("handles newlines in values", () => {
    const rows: DataRow[] = [{ desc: "line1\nline2" }];
    const csv = rowsToCsv(rows);
    expect(csv).toContain('"line1\nline2"');
  });

  it("handles rows with different keys", () => {
    const rows: DataRow[] = [
      { a: "1", b: "2" },
      { a: "3", c: "4" },
    ];
    const csv = rowsToCsv(rows);
    expect(csv).toContain("a,b");
    expect(csv).toContain("c");
  });
});
