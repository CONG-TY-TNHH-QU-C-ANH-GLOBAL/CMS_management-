import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, test } from "bun:test";

const source = readFileSync(new URL("./thg-lead.js", import.meta.url), "utf8");

// DOM geometry is an I/O boundary. Run the shipped script with controlled viewport events.
function page({
  ready = false,
  visualViewport = true,
  header = true,
  open = false,
  maxHeight = "",
} = {}) {
  let top = 125.1875;
  let visible = true;
  const sheet = {
    style: { maxHeight },
    getBoundingClientRect: () => ({ top }),
  };
  const menu = Object.assign(new EventTarget(), {
    open,
    getClientRects: () => (visible ? [{}] : []),
    querySelector: (selector: string) => (selector === ".thg-h-sheet" ? sheet : null),
  });
  const viewport = Object.assign(new EventTarget(), { height: 667, offsetTop: 0 });
  const window: EventTarget & {
    innerHeight: number;
    visualViewport: typeof viewport | undefined;
    THGLead?: { open: () => void; close: () => void };
  } = Object.assign(new EventTarget(), {
    innerHeight: 667,
    visualViewport: visualViewport ? viewport : undefined,
  });
  const document = Object.assign(new EventTarget(), {
    readyState: ready ? "complete" : "loading",
    currentScript: null,
    documentElement: { lang: "vi" },
    querySelector: (selector: string) =>
      header && selector === "#thg-header .thg-h-mobile" ? menu : null,
  });
  runInNewContext(source, { window, document, location: { hash: "" } });
  return {
    sheet,
    menu,
    viewport,
    window,
    document,
    setTop: (value: number) => (top = value),
    setVisible: (value: boolean) => (visible = value),
    ready: () => document.dispatchEvent(new Event("DOMContentLoaded")),
    toggle(value: boolean) {
      menu.open = value;
      menu.dispatchEvent(new Event("toggle"));
    },
  };
}

describe("uploaded landing mobile header viewport", () => {
  test("initializes after the head script's header markup has been parsed", () => {
    const p = page();
    p.toggle(true);
    expect(p.sheet.style.maxHeight).toBe("");
    p.ready();
    expect(p.sheet.style.maxHeight).toBe("541.8125px");
  });

  test("opening below an announcement fits the sheet to the visible viewport", () => {
    const p = page({ ready: true });
    expect(p.sheet.style.maxHeight).toBe("");
    p.toggle(true);
    expect(p.sheet.style.maxHeight).toBe("541.8125px");
  });

  test("scroll and resize/orientation remeasure the sheet instead of assuming a 72px top", () => {
    const p = page({ ready: true, open: true, visualViewport: false });
    p.setTop(72);
    p.window.dispatchEvent(new Event("scroll"));
    expect(p.sheet.style.maxHeight).toBe("595px");
    p.window.innerHeight = 568;
    p.setTop(143.78125);
    p.window.dispatchEvent(new Event("resize"));
    expect(p.sheet.style.maxHeight).toBe("424.21875px");
  });

  test("visual viewport resize and pan use its height and layout-viewport offset", () => {
    const p = page({ ready: true, open: true });
    p.viewport.height = 400;
    p.viewport.offsetTop = 80;
    p.viewport.dispatchEvent(new Event("resize"));
    expect(p.sheet.style.maxHeight).toBe("354.8125px");
    p.viewport.offsetTop = 100;
    p.viewport.dispatchEvent(new Event("scroll"));
    expect(p.sheet.style.maxHeight).toBe("374.8125px");
    p.setTop(600);
    p.viewport.dispatchEvent(new Event("resize"));
    expect(p.sheet.style.maxHeight).toBe("0px");
  });

  test("closing restores the original style and reopening uses the new viewport", () => {
    const p = page({ ready: true, maxHeight: "500px" });
    p.toggle(true);
    expect(p.sheet.style.maxHeight).toBe("541.8125px");
    p.toggle(false);
    expect(p.sheet.style.maxHeight).toBe("500px");
    p.viewport.height = 568;
    p.viewport.dispatchEvent(new Event("resize"));
    expect(p.sheet.style.maxHeight).toBe("500px");
    p.toggle(true);
    expect(p.sheet.style.maxHeight).toBe("442.8125px");
  });

  test("crossing the desktop breakpoint leaves desktop CSS alone and can return to mobile", () => {
    const p = page({ ready: true, open: true });
    expect(p.sheet.style.maxHeight).toBe("541.8125px");
    p.setVisible(false);
    p.window.dispatchEvent(new Event("resize"));
    expect(p.sheet.style.maxHeight).toBe("");
    p.setVisible(true);
    p.setTop(72);
    p.window.dispatchEvent(new Event("resize"));
    expect(p.sheet.style.maxHeight).toBe("595px");
  });

  test("pages without the standard header retain the consultation API", () => {
    const p = page({ ready: true, header: false });
    expect(typeof p.window.THGLead?.open).toBe("function");
    expect(typeof p.window.THGLead?.close).toBe("function");
    p.window.dispatchEvent(new Event("resize"));
    expect(p.sheet.style.maxHeight).toBe("");
  });
});
