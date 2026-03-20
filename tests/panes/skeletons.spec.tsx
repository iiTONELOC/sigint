/// <reference lib="dom" />
import { describe, test, expect } from "bun:test";
import { renderToString } from "react-dom/server";
import { createElement } from "react";

import { DossierSkeleton } from "@/panes/dossier/DossierSkeleton";
import { DataTableSkeleton } from "@/panes/data-table/DataTableSkeleton";
import { IntelFeedSkeleton } from "@/panes/intel-feed/IntelFeedSkeleton";
import { AlertLogSkeleton } from "@/panes/alert-log/AlertLogSkeleton";
import { RawConsoleSkeleton } from "@/panes/raw-console/RawConsoleSkeleton";
import { VideoFeedSkeleton } from "@/panes/video-feed/VideoFeedSkeleton";
import { NewsFeedSkeleton } from "@/panes/news-feed/NewsFeedSkeleton";

function render(el: React.ReactElement) {
  return renderToString(el);
}

describe("DossierSkeleton", () => {
  test("renders with pulse animation", () => {
    const html = render(createElement(DossierSkeleton));
    expect(html).toContain("animate-pulse");
  });

  test("renders icon and placeholder bars", () => {
    const html = render(createElement(DossierSkeleton));
    expect(html).toContain("svg");
    expect(html).toContain("bg-sig-dim");
  });

  test("renders photo and section placeholders", () => {
    const html = render(createElement(DossierSkeleton));
    // Photo placeholder (h-36) + 3 section groups with bg-sig-dim/15
    expect(html).toContain("h-36");
    const sections = html.match(/bg-sig-dim\/15/g);
    expect(sections).not.toBeNull();
    expect(sections!.length).toBe(3);
  });
});

describe("DataTableSkeleton", () => {
  test("renders with pulse animation", () => {
    const html = render(createElement(DataTableSkeleton));
    expect(html).toContain("animate-pulse");
  });

  test("renders table icon", () => {
    const html = render(createElement(DataTableSkeleton));
    expect(html).toContain("svg");
  });

  test("renders 12 row placeholders", () => {
    const html = render(createElement(DataTableSkeleton));
    const rows = html.match(/w-8/g);
    expect(rows).not.toBeNull();
    expect(rows!.length).toBe(12);
  });
});

describe("IntelFeedSkeleton", () => {
  test("renders with pulse animation", () => {
    const html = render(createElement(IntelFeedSkeleton));
    expect(html).toContain("animate-pulse");
  });

  test("renders 5 product card placeholders", () => {
    const html = render(createElement(IntelFeedSkeleton));
    const cards = html.match(/border-sig-border\/20/g);
    expect(cards).not.toBeNull();
    expect(cards!.length).toBe(5);
  });
});

describe("AlertLogSkeleton", () => {
  test("renders with pulse animation", () => {
    const html = render(createElement(AlertLogSkeleton));
    expect(html).toContain("animate-pulse");
  });

  test("renders 8 alert row placeholders", () => {
    const html = render(createElement(AlertLogSkeleton));
    const rows = html.match(/border-l-2/g);
    expect(rows).not.toBeNull();
    expect(rows!.length).toBe(8);
  });
});

describe("RawConsoleSkeleton", () => {
  test("renders with pulse animation", () => {
    const html = render(createElement(RawConsoleSkeleton));
    expect(html).toContain("animate-pulse");
  });

  test("renders terminal icon", () => {
    const html = render(createElement(RawConsoleSkeleton));
    expect(html).toContain("svg");
  });

  test("renders line placeholders", () => {
    const html = render(createElement(RawConsoleSkeleton));
    expect(html).toContain("bg-sig-dim/8");
  });
});

describe("VideoFeedSkeleton", () => {
  test("renders with pulse animation", () => {
    const html = render(createElement(VideoFeedSkeleton));
    expect(html).toContain("animate-pulse");
  });

  test("renders 2x2 grid", () => {
    const html = render(createElement(VideoFeedSkeleton));
    expect(html).toContain("grid-cols-2");
    expect(html).toContain("grid-rows-2");
  });

  test("renders 4 video slot placeholders", () => {
    const html = render(createElement(VideoFeedSkeleton));
    const slots = html.match(/bg-black\/80/g);
    expect(slots).not.toBeNull();
    expect(slots!.length).toBe(4);
  });
});

describe("NewsFeedSkeleton", () => {
  test("renders with pulse animation", () => {
    const html = render(createElement(NewsFeedSkeleton));
    expect(html).toContain("animate-pulse");
  });

  test("renders filter bar placeholders", () => {
    const html = render(createElement(NewsFeedSkeleton));
    // 4 filter buttons in the bar
    expect(html).toContain("border-sig-border/20");
  });

  test("renders 6 article placeholders", () => {
    const html = render(createElement(NewsFeedSkeleton));
    const articles = html.match(/w-full bg-sig-dim\/10/g);
    expect(articles).not.toBeNull();
    expect(articles!.length).toBe(6);
  });
});
