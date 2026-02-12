import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 10;

interface ResearchResult {
  companyName: string;
  website: string;
  atsDetected: string;
  liveRoles: number | null;
  linkedinSearchUrl: string;
  careersUrl: string | null;
}

const ATS_PATTERNS: { name: string; patterns: RegExp[] }[] = [
  {
    name: "Greenhouse",
    patterns: [
      /boards\.greenhouse\.io/i,
      /job-boards\.greenhouse\.io/i,
      /greenhouse\.io/i,
    ],
  },
  { name: "Lever", patterns: [/jobs\.lever\.co/i, /lever\.co/i] },
  {
    name: "Workday",
    patterns: [/myworkdayjobs\.com/i, /myworkdaysite\.com/i, /workday\.com/i],
  },
  { name: "Ashby", patterns: [/jobs\.ashbyhq\.com/i, /ashbyhq\.com/i] },
  {
    name: "SmartRecruiters",
    patterns: [/jobs\.smartrecruiters\.com/i, /smartrecruiters\.com/i],
  },
  { name: "BambooHR", patterns: [/bamboohr\.com/i] },
  { name: "Teamtailor", patterns: [/teamtailor\.com/i] },
  { name: "iCIMS", patterns: [/icims\.com/i] },
  { name: "Recruitee", patterns: [/recruitee\.com/i] },
  { name: "Pinpoint", patterns: [/pinpointhq\.com/i] },
  { name: "Workable", patterns: [/apply\.workable\.com/i, /workable\.com/i] },
  { name: "JazzHR", patterns: [/applytojob\.com/i, /jazzhr\.com/i] },
  { name: "Breezy HR", patterns: [/breezy\.hr/i] },
];

// Only the most common paths — tried in parallel
const CAREERS_PATHS = ["/careers", "/jobs", "/join-us", "/open-positions"];

async function fetchWithTimeout(
  url: string,
  timeoutMs = 3000
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
    });
    return res;
  } finally {
    clearTimeout(timeout);
  }
}

function extractCompanyName(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    const parts = hostname.replace(/^www\./, "").split(".");
    return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  } catch {
    return "Unknown";
  }
}

function detectAtsFromUrl(url: string): string | null {
  for (const ats of ATS_PATTERNS) {
    for (const pattern of ats.patterns) {
      if (pattern.test(url)) {
        return ats.name;
      }
    }
  }
  return null;
}

function detectAtsFromHtml(html: string): string | null {
  const lowerHtml = html.toLowerCase();
  const checks: [string, string][] = [
    ["greenhouse", "Greenhouse"],
    ["lever.co", "Lever"],
    ["workday", "Workday"],
    ["ashbyhq", "Ashby"],
    ["smartrecruiters", "SmartRecruiters"],
    ["bamboohr", "BambooHR"],
    ["teamtailor", "Teamtailor"],
    ["icims", "iCIMS"],
    ["recruitee", "Recruitee"],
    ["pinpointhq", "Pinpoint"],
    ["workable", "Workable"],
    ["jazz", "JazzHR"],
    ["breezy.hr", "Breezy HR"],
  ];
  for (const [keyword, name] of checks) {
    if (lowerHtml.includes(keyword)) {
      return name;
    }
  }
  return null;
}

async function findCareersPage(
  baseUrl: string
): Promise<{ url: string; html: string } | null> {
  const baseDomain = new URL(baseUrl).hostname.replace(/^www\./, "");

  // Run homepage fetch AND common path checks in parallel
  const pathChecks = CAREERS_PATHS.map(async (path) => {
    try {
      const url = new URL(path, baseUrl).href;
      const res = await fetchWithTimeout(url, 3000);
      if (res.ok) {
        const finalDomain = new URL(res.url).hostname.replace(/^www\./, "");
        if (finalDomain === baseDomain || detectAtsFromUrl(res.url)) {
          return { url: res.url, html: await res.text() };
        }
      }
    } catch {
      // ignore
    }
    return null;
  });

  const homepageCheck = (async () => {
    try {
      const res = await fetchWithTimeout(baseUrl, 3000);
      if (res.ok) {
        return await res.text();
      }
    } catch {
      // ignore
    }
    return null;
  })();

  // Wait for all in parallel
  const [pathResults, homepageHtml] = await Promise.all([
    Promise.all(pathChecks),
    homepageCheck,
  ]);

  // Return first successful path match (prefer /careers > /jobs > etc)
  for (const result of pathResults) {
    if (result) return result;
  }

  // If no direct path worked, parse homepage for ATS or careers links
  if (homepageHtml) {
    const $ = cheerio.load(homepageHtml);

    // Priority 1: direct ATS links
    const atsLinks: string[] = [];
    $("iframe[src], a[href]").each((_, el) => {
      const src = $(el).attr("src") || $(el).attr("href") || "";
      if (detectAtsFromUrl(src)) {
        atsLinks.push(src);
      }
    });

    for (const link of atsLinks.slice(0, 2)) {
      let fullUrl: string;
      try {
        fullUrl = new URL(link, baseUrl).href;
      } catch {
        continue;
      }
      try {
        const res = await fetchWithTimeout(fullUrl, 3000);
        if (res.ok) {
          return { url: res.url, html: await res.text() };
        }
      } catch {
        return { url: fullUrl, html: "" };
      }
    }

    // Priority 2: career-related href paths
    const careersLinks: string[] = [];
    $("a[href]").each((_, el) => {
      const href = $(el).attr("href") || "";
      if (
        /\/(careers|jobs|open-positions|openings|vacancies)(\/|$|\?)/i.test(
          href
        )
      ) {
        careersLinks.push(href);
      }
    });

    // Priority 3: career-related anchor text
    $("a[href]").each((_, el) => {
      const href = $(el).attr("href") || "";
      const text = $(el).text().trim().toLowerCase();
      if (
        (text === "careers" ||
          text === "jobs" ||
          text === "work with us" ||
          text === "join us") &&
        href.length > 1 &&
        !careersLinks.includes(href)
      ) {
        careersLinks.push(href);
      }
    });

    for (const link of careersLinks.slice(0, 3)) {
      let fullUrl: string;
      try {
        fullUrl = new URL(link, baseUrl).href;
      } catch {
        continue;
      }
      try {
        const res = await fetchWithTimeout(fullUrl, 3000);
        if (res.ok) {
          const finalDomain = new URL(res.url).hostname.replace(/^www\./, "");
          if (finalDomain === baseDomain || detectAtsFromUrl(res.url)) {
            return { url: res.url, html: await res.text() };
          }
        }
      } catch {
        continue;
      }
    }
  }

  return null;
}

async function countJobsViaApi(
  careersUrl: string,
  atsName: string,
  companySlug: string
): Promise<number | null> {
  if (atsName === "Greenhouse") {
    const ghMatch = careersUrl.match(
      /(?:boards|job-boards)\.greenhouse\.io\/([^/?#]+)/i
    );
    const slugs = ghMatch
      ? [ghMatch[1], companySlug.toLowerCase()]
      : [companySlug.toLowerCase()];

    for (const slug of [...new Set(slugs)]) {
      try {
        const res = await fetchWithTimeout(
          `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`,
          3000
        );
        if (res.ok) {
          const data = await res.json();
          if (data.jobs && Array.isArray(data.jobs)) {
            return data.jobs.length;
          }
        }
      } catch {
        // Fall through
      }
    }
  }

  if (atsName === "Ashby") {
    const ashbyMatch = careersUrl.match(/jobs\.ashbyhq\.com\/([^/?#]+)/i);
    const slug = ashbyMatch ? ashbyMatch[1] : companySlug.toLowerCase();
    try {
      const res = await fetchWithTimeout(
        `https://api.ashbyhq.com/posting-api/job-board/${slug}`,
        3000
      );
      if (res.ok) {
        const data = await res.json();
        if (data.jobs && Array.isArray(data.jobs)) {
          return data.jobs.length;
        }
      }
    } catch {
      // Fall through
    }
  }

  if (atsName === "Lever") {
    const leverMatch = careersUrl.match(/jobs\.lever\.co\/([^/?#]+)/i);
    const slug = leverMatch ? leverMatch[1] : companySlug.toLowerCase();
    try {
      const res = await fetchWithTimeout(
        `https://api.lever.co/v0/postings/${slug}?mode=json`,
        3000
      );
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          return data.length;
        }
      }
    } catch {
      // Fall through
    }
  }

  return null;
}

function countJobsFromHtml(
  html: string,
  atsName: string | null
): number | null {
  if (!html) return null;

  const $ = cheerio.load(html);

  if (atsName === "Greenhouse") {
    const openings = $(".opening").length;
    if (openings > 0) return openings;
    const jobPosts = $('[class*="job-post"], [class*="opening"]').length;
    if (jobPosts > 0) return jobPosts;
  }

  if (atsName === "Lever") {
    const postings = $(".posting").length;
    if (postings > 0) return postings;
  }

  if (atsName === "Ashby") {
    const jobs = $('[class*="ashby-job"], [data-testid*="job"]').length;
    if (jobs > 0) return jobs;
  }

  if (atsName === "SmartRecruiters") {
    const jobs = $(
      ".opening-job, .js-openings li, [class*='job-item']"
    ).length;
    if (jobs > 0) return jobs;
  }

  if (atsName === "Workable") {
    const jobs = $("[data-ui='job'], li[data-role]").length;
    if (jobs > 0) return jobs;
  }

  const genericSelectors = [
    '[class*="job-listing"]',
    '[class*="job-item"]',
    '[class*="job-card"]',
    '[class*="job-post"]',
    '[class*="position-item"]',
    '[class*="opening"]',
    '[class*="vacancy"]',
    '[class*="career-item"]',
    '[data-job-id]',
    'tr[class*="job"]',
    'li[class*="job"]',
    ".posting",
    ".job",
  ];

  for (const selector of genericSelectors) {
    const count = $(selector).length;
    if (count > 0) return count;
  }

  const jobLinks = new Set<string>();
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") || "";
    const text = $(el).text().trim();
    if (
      text.length > 5 &&
      text.length < 200 &&
      (/\/(jobs?|positions?|openings?|roles?)\//i.test(href) ||
        /\/apply/i.test(href))
    ) {
      jobLinks.add(text.toLowerCase());
    }
  });

  if (jobLinks.size > 0) return jobLinks.size;

  return null;
}

function buildLinkedInSearchUrl(companyName: string): string {
  const query = `site:linkedin.com/in/ "${companyName}" ("recruiter" OR "talent acquisition" OR "head of recruitment" OR "recruitment manager" OR "TA lead" OR "talent lead" OR "head of people" OR "VP talent")`;
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { error: "Please provide a valid URL" },
        { status: 400 }
      );
    }

    let normalizedUrl = url.trim();
    if (
      !normalizedUrl.startsWith("http://") &&
      !normalizedUrl.startsWith("https://")
    ) {
      normalizedUrl = "https://" + normalizedUrl;
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(normalizedUrl);
    } catch {
      return NextResponse.json(
        { error: "Invalid URL format" },
        { status: 400 }
      );
    }

    const baseUrl = `${parsedUrl.protocol}//${parsedUrl.hostname}`;
    const companyName = extractCompanyName(normalizedUrl);

    console.log(`[research] Starting research for ${baseUrl} (${companyName})`);

    const careersPage = await findCareersPage(baseUrl);

    console.log(`[research] Careers page: ${careersPage ? careersPage.url : "NOT FOUND"} (html length: ${careersPage?.html?.length ?? 0})`);

    let atsDetected = "Unknown / Custom ATS";
    let liveRoles: number | null = null;
    let careersUrl: string | null = null;

    if (careersPage) {
      careersUrl = careersPage.url;

      const atsFromUrl = detectAtsFromUrl(careersPage.url);
      if (atsFromUrl) {
        atsDetected = atsFromUrl;
      } else {
        const atsFromHtml = detectAtsFromHtml(careersPage.html);
        if (atsFromHtml) {
          atsDetected = atsFromHtml;
        }
      }

      // If careers page links to an external ATS, detect it
      if (!atsFromUrl && careersPage.html) {
        const $ = cheerio.load(careersPage.html);
        $("a[href], iframe[src]").each((_, el) => {
          if (atsDetected !== "Unknown / Custom ATS") return;
          const href = $(el).attr("href") || $(el).attr("src") || "";
          const ats = detectAtsFromUrl(href);
          if (ats) {
            atsDetected = ats;
            careersUrl = href;
          }
        });
      }
    }

    console.log(`[research] ATS detected: ${atsDetected}, careersUrl: ${careersUrl}`);

    // Try API-based job counting (most reliable)
    if (atsDetected !== "Unknown / Custom ATS") {
      liveRoles = await countJobsViaApi(
        careersUrl || baseUrl,
        atsDetected,
        companyName
      );
    }

    // Fall back to HTML scraping
    if (liveRoles === null && careersPage?.html) {
      liveRoles = countJobsFromHtml(careersPage.html, atsDetected);
    }

    console.log(`[research] Live roles: ${liveRoles}`);

    const linkedinSearchUrl = buildLinkedInSearchUrl(companyName);

    const result: ResearchResult = {
      companyName,
      website: baseUrl,
      atsDetected,
      liveRoles,
      linkedinSearchUrl,
      careersUrl,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("Research error:", error);
    return NextResponse.json(
      { error: "Failed to research company. Please try again." },
      { status: 500 }
    );
  }
}
