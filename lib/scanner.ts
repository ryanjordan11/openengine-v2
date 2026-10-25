import { parse } from "node-html-parser";

export interface CheckResult {
  id: string;
  name: string;
  category: string;
  passed: boolean;
  weight: number;
  description: string;
  fix: string;
}

export interface BrokenLink {
  page: string;
  target: string;
  status: number | null;
}

export interface PageScan {
  url: string;
  score: number;
  checks: CheckResult[];
  ttfbMs: number | null;
  htmlBytes: number;
  renderBlocking: number;
  images: number;
  linksFound: number;
  brokenLinks: BrokenLink[];
}

export interface ScanResult {
  url: string;
  score: number;
  checks: CheckResult[];
  pages: PageScan[];
  crawledAt: string;
  pageTitle?: string;
  finalUrl?: string;
  ogImage?: string;
  twitterCard?: string;
  metaDesc?: string;
}

const TIMEOUT_MS = 10_000;
const SKIP_EXT = /\.(pdf|jpe?g|png|gif|webp|avif|svg|ico|zip|gz|mp[34]|mov|avi|css|js|xml|json|woff2?|ttf|eot)$/i;

async function fetchTimed(url: string): Promise<{ text: string | null; status: number; ttfbMs: number | null }> {
  const start = performance.now();
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; AEO-Scanner/1.0; +https://openengine.local)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
    });
    const ttfbMs = Math.round(performance.now() - start);
    if (!res.ok) return { text: null, status: res.status, ttfbMs };
    const text = await res.text();
    return { text, status: res.status, ttfbMs };
  } catch {
    return { text: null, status: 0, ttfbMs: null };
  }
}

async function fetchText(url: string): Promise<string | null> {
  return (await fetchTimed(url)).text;
}

function extractInternalLinks(html: string, pageUrl: string, host: string): string[] {
  const doc = parse(html);
  const links = new Set<string>();
  for (const a of doc.querySelectorAll("a[href]")) {
    const href = a.getAttribute("href")?.trim();
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) continue;
    try {
      const u = new URL(href, pageUrl);
      if (u.host !== host) continue;
      if (SKIP_EXT.test(u.pathname)) continue;
      u.hash = "";
      links.add(u.href);
    } catch {
      continue;
    }
  }
  return [...links];
}

async function checkBrokenLinks(targets: string[], pageUrl: string, limit = 40): Promise<BrokenLink[]> {
  const broken: BrokenLink[] = [];
  const queue = targets.slice(0, limit);
  const CONCURRENCY = 8;
  let idx = 0;

  async function worker() {
    while (idx < queue.length) {
      const target = queue[idx++];
      try {
        const res = await fetch(target, {
          method: "HEAD",
          signal: AbortSignal.timeout(8000),
          redirect: "follow",
          headers: { "User-Agent": "Mozilla/5.0 (compatible; AEO-Scanner/1.0)" },
        });
        if (res.status >= 400) {
          broken.push({ page: pageUrl, target, status: res.status });
        }
      } catch {
        broken.push({ page: pageUrl, target, status: null });
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return broken;
}

function pageChecks(html: string, doc: ReturnType<typeof parse>, parsed: URL, ctx: {
  jsonLdBlocks: Record<string, unknown>[];
  microdataTypes: Set<string>;
  robotsTxt: string | null;
  llmsTxt: string | null;
  llmsFullTxt: string | null;
  mcpJson: string | null;
  hasFeed: boolean;
  allowedCrawlers: string[];
  disallowedCrawlers: string[];
  lastModified: string | null;
  hasDateModified: boolean;
  ttfbMs: number | null;
  htmlBytes: number;
  brokenLinks: BrokenLink[];
  sitemapCount: number | null;
}): CheckResult[] {
  const {
    jsonLdBlocks, microdataTypes, llmsTxt, llmsFullTxt, mcpJson,
    hasFeed, allowedCrawlers, disallowedCrawlers, lastModified, hasDateModified,
    ttfbMs, htmlBytes, brokenLinks, sitemapCount,
  } = ctx;

  const checks: CheckResult[] = [];
  const push = (c: Omit<CheckResult, "id" | "weight"> & { id: string; weight: number }) => checks.push(c);

  const hasSchemaType = (...types: string[]) =>
    jsonLdBlocks.some((b) => {
      const t = b["@type"];
      if (typeof t === "string") return types.some((x) => t.toLowerCase() === x.toLowerCase());
      if (Array.isArray(t)) return t.some((x) => typeof x === "string" && types.some((y) => x.toLowerCase() === y.toLowerCase()));
      return false;
    }) || [...microdataTypes].some((t) => types.some((x) => t.toLowerCase() === x.toLowerCase()));

  const scripts = doc.querySelectorAll("script[src]");
  const stylesheets = doc.querySelectorAll('link[rel="stylesheet"]');
  const images = doc.querySelectorAll("img");
  const blockingScripts = scripts.filter((s) => {
    const se = s as unknown as { parentElement?: HTMLElement | null };
    const inHead = se.parentElement?.tagName === "HEAD";
    return inHead && !s.getAttribute("async") && !s.getAttribute("defer");
  });
  const blockingResources = blockingScripts.length + stylesheets.length;

  const isHttps = parsed.protocol === "https:";
  const titleEl = doc.querySelector("title");
  const pageTitle = titleEl?.textContent?.trim() || undefined;
  const metaDesc = doc.querySelector('meta[name="description"]')?.getAttribute("content")?.trim() || "";
  const canonical = doc.querySelector('link[rel="canonical"]')?.getAttribute("href")?.trim() || "";
  const robotsMeta = doc.querySelector('meta[name="robots"]')?.getAttribute("content")?.trim() || "";
  const viewport = doc.querySelector('meta[name="viewport"]')?.getAttribute("content")?.trim() || "";
  const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute("content")?.trim() || "";
  const ogDesc = doc.querySelector('meta[property="og:description"]')?.getAttribute("content")?.trim() || "";
  const ogImage = doc.querySelector('meta[property="og:image"]')?.getAttribute("content")?.trim() || "";
  const twitterCard = doc.querySelector('meta[name="twitter:card"]')?.getAttribute("content")?.trim() || "";
  const h1s = doc.querySelectorAll("h1");
  const h1Text = h1s[0]?.textContent?.trim() || "";
  const htmlLang = doc.querySelector("html")?.getAttribute("lang")?.trim() || "";
  const charset = doc.querySelector('meta[charset]')?.getAttribute("charset")?.trim() ||
    doc.querySelector('meta[http-equiv="Content-Type"]')?.getAttribute("content")?.match(/charset=([\w-]+)/i)?.[1] || "";
  const hasSameAs = jsonLdBlocks.some((b) => Array.isArray(b.sameAs) && (b.sameAs as unknown[]).length > 0);
  const hasHreflang = doc.querySelectorAll('link[rel="alternate"][hreflang]').length > 0;
  const hasFavicon = doc.querySelector('link[rel~="icon"], link[rel="apple-touch-icon"]') !== null;
  const hasPreconnect = doc.querySelectorAll('link[rel="preconnect"], link[rel="dns-prefetch"]').length > 0;

  push({ id: "https", name: "HTTPS Enabled", category: "Security", weight: 3, passed: isHttps, description: "Your site is served over HTTPS.", fix: "Install an SSL certificate and redirect all HTTP traffic to HTTPS." });
  push({ id: "ttfb", name: "Time to First Byte", category: "Performance", weight: 2, passed: ttfbMs !== null && ttfbMs < 600, description: ttfbMs !== null ? `TTFB: ${ttfbMs}ms (target < 600ms).` : "Could not measure TTFB.", fix: "Use a CDN, enable caching, and reduce server-side processing to get TTFB under 600ms." });
  push({ id: "render-blocking", name: "No Render-Blocking Resources", category: "Performance", weight: 2, passed: blockingResources === 0, description: `${blockingResources} render-blocking resource(s) detected in <head>.`, fix: "Add 'async' or 'defer' to scripts in <head>, or move them before </body>." });
  push({ id: "html-size", name: "HTML Payload Size", category: "Performance", weight: 1, passed: htmlBytes < 100_000, description: `HTML payload: ${(htmlBytes / 1024).toFixed(1)} KB (target < 100 KB).`, fix: "Minify HTML, remove inline scripts/styles, and lazy-load below-the-fold content." });
  push({ id: "image-alt", name: "Image Alt Text", category: "Accessibility", weight: 2, passed: images.length === 0 || doc.querySelectorAll("img:not([alt])").length === 0, description: doc.querySelectorAll("img:not([alt])").length === 0 ? `All ${images.length} images have alt text.` : `${doc.querySelectorAll("img:not([alt])").length} of ${images.length} images are missing alt text.`, fix: "Add descriptive alt attributes to every <img> tag." });
  push({ id: "title", name: "Page Title Tag", category: "Meta Tags", weight: 3, passed: pageTitle !== undefined && pageTitle.length >= 10 && pageTitle.length <= 70, description: pageTitle ? `Title detected (${pageTitle.length} chars).` : "No title tag found.", fix: "Add a <title> tag between 10–70 characters describing the page." });
  push({ id: "meta-description", name: "Meta Description", category: "Meta Tags", weight: 3, passed: metaDesc.length >= 70 && metaDesc.length <= 160, description: metaDesc ? `Description detected (${metaDesc.length} chars).` : "No meta description found.", fix: "Add a <meta name='description'> between 70–160 characters." });
  push({ id: "canonical", name: "Canonical URL", category: "Meta Tags", weight: 2, passed: canonical !== "", description: canonical ? "Canonical link tag present." : "No <link rel='canonical'> found.", fix: "Add <link rel='canonical' href='...'> to prevent duplicate-content signals." });
  push({ id: "robots-meta", name: "Robots Meta Tag", category: "Meta Tags", weight: 2, passed: robotsMeta !== "" && !/noindex/i.test(robotsMeta), description: /noindex/i.test(robotsMeta) ? "Page is set to noindex." : "No restrictive robots meta detected.", fix: "Remove 'noindex' from the robots meta tag on pages you want indexed." });
  push({ id: "viewport", name: "Mobile Viewport", category: "Mobile", weight: 2, passed: viewport.includes("width=device-width"), description: "Responsive viewport meta tag present.", fix: "Add <meta name='viewport' content='width=device-width, initial-scale=1'>." });
  push({ id: "lang", name: "HTML Lang Attribute", category: "Accessibility", weight: 1, passed: htmlLang !== "", description: htmlLang ? `Language declared: ${htmlLang}.` : "Missing lang attribute on <html>.", fix: "Add lang='en' (or your language) to the <html> tag." });
  push({ id: "h1", name: "Single H1 Heading", category: "Structure", weight: 3, passed: h1s.length === 1 && h1Text.length > 0, description: h1s.length === 0 ? "No H1 heading found." : h1s.length > 1 ? `${h1s.length} H1 headings found (should be 1).` : "Exactly one H1 heading present.", fix: "Use exactly one <h1> per page that summarizes the main topic." });
  push({ id: "charset", name: "Character Encoding", category: "Meta Tags", weight: 1, passed: charset.toLowerCase().includes("utf-8"), description: "UTF-8 charset declared.", fix: "Add <meta charset='utf-8'> as the first element in <head>." });
  push({ id: "og-tags", name: "Open Graph Tags", category: "Social", weight: 2, passed: ogTitle !== "" && ogDesc !== "" && ogImage !== "", description: "og:title, og:description, and og:image are set.", fix: "Add og:title, og:description, and og:image meta tags for rich social previews." });
  push({ id: "twitter-card", name: "Twitter Card", category: "Social", weight: 1, passed: twitterCard !== "" && twitterCard !== "none", description: "Twitter Card meta tag present.", fix: "Add <meta name='twitter:card' content='summary_large_image'>." });
  push({ id: "jsonld", name: "JSON-LD Structured Data", category: "Schema", weight: 3, passed: jsonLdBlocks.length > 0, description: jsonLdBlocks.length > 0 ? `${jsonLdBlocks.length} JSON-LD block(s) detected.` : "No JSON-LD structured data found.", fix: "Add <script type='application/ld+json'> with relevant schema types." });
  push({ id: "speakable", name: "Speakable Schema", category: "AI Mode", weight: 3, passed: hasSchemaType("SpeakableSpecification", "speakablespecification"), description: "SpeakableSpecification markup detected for voice/AI citations.", fix: "Add SpeakableSpecification schema pointing to article sections ideal for voice answers." });
  push({ id: "howto-schema", name: "HowTo Schema", category: "AI Mode", weight: 2, passed: hasSchemaType("HowTo"), description: "HowTo structured data detected.", fix: "Mark up step-by-step guides with HowTo schema for AI Mode extraction." });
  push({ id: "qa-schema", name: "QAPage / FAQPage Schema", category: "AI Mode", weight: 3, passed: hasSchemaType("QAPage", "Question", "FAQPage") || /class=["'][^"']*\b(answer|faq|direct-answer)\b/i.test(html), description: "Q&A-style structured data detected.", fix: "Add FAQPage or QAPage schema to question-and-answer content." });
  push({ id: "product-schema", name: "Product Schema", category: "Generative UI", weight: 2, passed: hasSchemaType("Product"), description: "Product schema with substantive properties detected.", fix: "Add Product schema with name, image, offers, and aggregateRating for e-commerce pages." });
  push({ id: "service-schema", name: "Service Schema", category: "Generative UI", weight: 2, passed: hasSchemaType("Service"), description: "Service schema detected.", fix: "Add Service schema describing your offerings with provider and areaServed." });
  push({ id: "event-schema", name: "Event Schema", category: "Generative UI", weight: 2, passed: hasSchemaType("Event"), description: "Event schema detected.", fix: "Add Event schema with startDate, location, and offers for event pages." });
  push({ id: "recipe-schema", name: "Recipe Schema", category: "Generative UI", weight: 2, passed: hasSchemaType("Recipe"), description: "Recipe schema detected.", fix: "Add Recipe schema with ingredients, steps, and nutrition for recipe content." });
  push({ id: "eeat-person", name: "Authored Entity (E-E-A-T)", category: "Trust", weight: 3, passed: hasSchemaType("Person", "Organization") && hasSameAs, description: "Person/Organization schema with sameAs links detected.", fix: "Add Person or Organization schema with sameAs linking to verifiable profiles." });
  push({ id: "breadcrumb", name: "Breadcrumb Schema", category: "Schema", weight: 1, passed: hasSchemaType("BreadcrumbList", "Breadcrumb"), description: "BreadcrumbList structured data detected.", fix: "Add BreadcrumbList schema showing the page's position in the site hierarchy." });
  push({ id: "ai-crawlers", name: "AI Crawler Allowlist", category: "Agent Ecosystem", weight: 3, passed: allowedCrawlers.length >= 4 && disallowedCrawlers.length === 0, description: allowedCrawlers.length === 0 ? "No explicit AI-crawler allow rules in robots.txt." : `${allowedCrawlers.length} AI crawler(s) allowed${disallowedCrawlers.length > 0 ? `, ${disallowedCrawlers.length} blocked` : ""}.`, fix: "Add 'User-agent: <name> / Allow: /' rules for GPTBot, OAI-SearchBot, Claude-SearchBot, Perplexity-User, Applebot-Extended, Meta-ExternalAgent, and Google-Agent." });
  push({ id: "llms-txt", name: "llms.txt File", category: "Agent Ecosystem", weight: 3, passed: llmsTxt !== null, description: llmsTxt ? "llms.txt detected at root." : "No llms.txt found at the site root.", fix: "Create /llms.txt with a markdown overview of your site for LLMs." });
  push({ id: "llms-full", name: "llms-full.txt File", category: "Agent Ecosystem", weight: 1, passed: llmsFullTxt !== null, description: llmsFullTxt ? "llms-full.txt detected (full-content feed for LLMs)." : "No llms-full.txt found.", fix: "Create /llms-full.txt with complete site content in markdown for deep LLM crawling." });
  push({ id: "mcp-card", name: "MCP Server Card", category: "Agent Ecosystem", weight: 2, passed: mcpJson !== null, description: mcpJson ? "MCP server card detected at /.well-known/mcp.json." : "No MCP server card found.", fix: "Publish /.well-known/mcp.json so AI assistants can auto-connect to your services." });
  push({ id: "feed", name: "Subscribable Feed (RSS/Atom/JSON)", category: "Information Agent", weight: 2, passed: hasFeed, description: hasFeed ? "RSS, Atom, or JSON Feed autodiscovery link found." : "No feed autodiscovery link in <head>.", fix: "Add <link rel='alternate' type='application/rss+xml' href='...'> for information-agent subscriptions." });
  push({ id: "freshness", name: "Freshness Signals", category: "Information Agent", weight: 2, passed: lastModified !== null || hasDateModified, description: lastModified ? `Last-Modified header present (${lastModified}).` : hasDateModified ? "dateModified property found in structured data." : "No freshness signals detected.", fix: "Send a Last-Modified HTTP header or include dateModified in your JSON-LD." });
  push({ id: "sitemap", name: "XML Sitemap", category: "Sitemap", weight: 2, passed: sitemapCount !== null && sitemapCount > 0, description: sitemapCount !== null ? `${sitemapCount} URL(s) in sitemap.xml.` : "No sitemap.xml found.", fix: "Generate and serve a sitemap.xml at the site root listing all indexable pages." });
  push({ id: "hreflang", name: "Hreflang Tags", category: "International", weight: 1, passed: hasHreflang || true, description: hasHreflang ? "Hreflang alternate links detected." : "No hreflang tags (only needed for multilingual sites).", fix: "Add <link rel='alternate' hreflang='...'> for each language version of the page." });
  push({ id: "favicon", name: "Favicon", category: "Meta Tags", weight: 1, passed: hasFavicon, description: "Favicon or Apple touch icon declared.", fix: "Add <link rel='icon' href='/favicon.ico'> or an Apple touch icon." });
  push({ id: "preconnect", name: "Resource Hints", category: "Performance", weight: 1, passed: hasPreconnect, description: "preconnect or dns-prefetch hints found.", fix: "Add <link rel='preconnect' href='...'> for third-party origins to speed up connections." });
  push({ id: "broken-links", name: "No Broken Internal Links", category: "Links", weight: 3, passed: brokenLinks.length === 0, description: brokenLinks.length === 0 ? "All internal links returned 2xx/3xx." : `${brokenLinks.length} broken internal link(s) detected.`, fix: "Fix or remove broken internal links — they waste crawl budget and hurt user trust." });

  return checks;
}

function scoreChecks(checks: CheckResult[]): number {
  const max = checks.reduce((s, c) => s + c.weight, 0);
  const earned = checks.filter((c) => c.passed).reduce((s, c) => s + c.weight, 0);
  return Math.round((earned / max) * 100);
}

export async function scanPage(pageUrl: string, host: string): Promise<PageScan> {
  const parsed = new URL(pageUrl);
  const baseUrl = `${parsed.protocol}//${parsed.host}`;

  const { text: html, status, ttfbMs } = await fetchTimed(pageUrl);
  if (!html) {
    return {
      url: pageUrl,
      score: 0,
      checks: [{ id: "fetch", name: "Page Fetch", category: "Errors", passed: false, weight: 1, description: `Could not fetch page (status ${status}).`, fix: "Verify the URL is reachable." }],
      ttfbMs,
      htmlBytes: 0,
      renderBlocking: 0,
      images: 0,
      linksFound: 0,
      brokenLinks: [],
    };
  }

  const doc = parse(html);

  const jsonLdScripts = doc.querySelectorAll('script[type="application/ld+json"]');
  const jsonLdBlocks: Record<string, unknown>[] = [];
  for (const s of jsonLdScripts) {
    const raw = s.textContent?.trim();
    if (!raw) continue;
    try {
      const p = JSON.parse(raw);
      if (Array.isArray(p)) jsonLdBlocks.push(...(p as Record<string, unknown>[]));
      else jsonLdBlocks.push(p as Record<string, unknown>);
    } catch {
      const multi = raw.match(/\{[\s\S]*?\}(?=\s*\{|\s*$)/g);
      if (multi) for (const chunk of multi) {
        try {
          jsonLdBlocks.push(JSON.parse(chunk));
        } catch {
          continue;
        }
      }
    }
  }

  const microdataItems = doc.querySelectorAll("[itemscope]");
  const microdataTypes = new Set<string>();
  for (const item of microdataItems) {
    const t = item.getAttribute("itemtype");
    if (t) microdataTypes.add(t.split("/").pop() ?? t);
  }

  const internalLinks = extractInternalLinks(html, pageUrl, host);
  const brokenLinks = await checkBrokenLinks(internalLinks, pageUrl);

  const [robotsTxt, llmsTxt, llmsFullTxt, mcpJson, sitemapXml] = await Promise.all([
    fetchText(`${baseUrl}/robots.txt`),
    fetchText(`${baseUrl}/llms.txt`),
    fetchText(`${baseUrl}/llms-full.txt`),
    fetchText(`${baseUrl}/.well-known/mcp.json`),
    fetchText(`${baseUrl}/sitemap.xml`),
  ]);

  const robotsLower = (robotsTxt ?? "").toLowerCase();
  const crawlerUserAgents = ["gptbot", "oai-searchbot", "claude-searchbot", "claudebot", "perplexity-user", "applebot-extended", "meta-externalagent", "google-agent", "google-extended", "googlebot"];
  const allowedCrawlers = crawlerUserAgents.filter((ua) => new RegExp(`user-agent:\\s*${ua.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?allow:`).test(robotsLower));
  const disallowedCrawlers = crawlerUserAgents.filter((ua) => new RegExp(`user-agent:\\s*${ua.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?disallow:\\s*/`).test(robotsLower));

  const feedLinks = doc.querySelectorAll('link[type="application/rss+xml"], link[type="application/atom+xml"], link[type="application/feed+json"]');

  let lastModified: string | null = null;
  try {
    const res = await fetch(pageUrl, { method: "HEAD", signal: AbortSignal.timeout(TIMEOUT_MS), redirect: "follow" });
    lastModified = res.headers.get("last-modified");
  } catch {
    lastModified = null;
  }

  const hasDateModified = jsonLdBlocks.some((b) => typeof b.dateModified === "string");
  const sitemapCount = sitemapXml ? (sitemapXml.match(/<loc>/g) ?? []).length : null;

  const checks = pageChecks(html, doc, parsed, {
    jsonLdBlocks,
    microdataTypes,
    robotsTxt,
    llmsTxt,
    llmsFullTxt,
    mcpJson,
    hasFeed: feedLinks.length > 0,
    allowedCrawlers,
    disallowedCrawlers,
    lastModified,
    hasDateModified,
    ttfbMs,
    htmlBytes: new TextEncoder().encode(html).length,
    brokenLinks,
    sitemapCount,
  });

  return {
    url: pageUrl,
    score: scoreChecks(checks),
    checks,
    ttfbMs,
    htmlBytes: new TextEncoder().encode(html).length,
    renderBlocking: blockingCount(doc),
    images: doc.querySelectorAll("img").length,
    linksFound: internalLinks.length,
    brokenLinks,
  };
}

function blockingCount(doc: ReturnType<typeof parse>): number {
  const scripts = doc.querySelectorAll("script[src]");
  const stylesheets = doc.querySelectorAll('link[rel="stylesheet"]');
  const blockingScripts = scripts.filter((s) => {
    const se = s as unknown as { parentElement?: HTMLElement | null };
    return se.parentElement?.tagName === "HEAD" && !s.getAttribute("async") && !s.getAttribute("defer");
  });
  return blockingScripts.length + stylesheets.length;
}

export async function scanSite(inputUrl: string, crawl = false, maxPages = 8): Promise<ScanResult> {
  let normalized = inputUrl.trim();
  if (!/^https?:\/\//i.test(normalized)) normalized = `https://${normalized}`;

  const firstParsed = new URL(normalized);
  const host = firstParsed.host;
  const pagesToCrawl: string[] = [firstParsed.href];
  const seen = new Set<string>([firstParsed.href]);
  const allPages: PageScan[] = [];
  const allBrokenLinks: BrokenLink[] = [];

  const limit = crawl ? maxPages : 1;

  while (pagesToCrawl.length > 0 && allPages.length < limit) {
    const pageUrl = pagesToCrawl.shift()!;
    const pageScan = await scanPage(pageUrl, host);
    allPages.push(pageScan);
    allBrokenLinks.push(...pageScan.brokenLinks);

    if (crawl && allPages.length < limit) {
      try {
        const { text } = await fetchTimed(pageUrl);
        if (text) {
          for (const link of extractInternalLinks(text, pageUrl, host)) {
            if (!seen.has(link) && pagesToCrawl.length + allPages.length < limit) {
              seen.add(link);
              pagesToCrawl.push(link);
            }
          }
        }
      } catch {
        continue;
      }
    }
  }

  const aggregatedChecks: CheckResult[] = mergePageChecks(allPages);
  const score = scoreChecks(aggregatedChecks);

  const doc = parse((await fetchText(firstParsed.href)) ?? "");
  const ogImage = doc.querySelector('meta[property="og:image"]')?.getAttribute("content")?.trim() || undefined;
  const twitterCard = doc.querySelector('meta[name="twitter:card"]')?.getAttribute("content")?.trim() || undefined;
  const metaDesc = doc.querySelector('meta[name="description"]')?.getAttribute("content")?.trim() || undefined;

  return {
    url: firstParsed.href,
    score,
    checks: aggregatedChecks,
    pages: allPages,
    crawledAt: new Date().toISOString(),
    pageTitle: doc.querySelector("title")?.textContent?.trim() || undefined,
    finalUrl: firstParsed.href,
    ogImage,
    twitterCard,
    metaDesc,
  };
}

function mergePageChecks(pages: PageScan[]): CheckResult[] {
  if (pages.length === 1) return pages[0].checks;

  const merged: CheckResult[] = [];
  const byId = new Map<string, CheckResult[]>();
  for (const p of pages) {
    for (const c of p.checks) {
      if (!byId.has(c.id)) byId.set(c.id, []);
      byId.get(c.id)!.push(c);
    }
  }
  for (const [, list] of byId) {
    const allPassed = list.every((c) => c.passed);
    const anyPassed = list.some((c) => c.passed);
    const base = list[0];
    merged.push({
      ...base,
      passed: allPassed,
      description: allPassed
        ? `${base.description} (passed on all ${pages.length} pages)`
        : anyPassed
          ? `Passed on ${list.filter((c) => c.passed).length} of ${pages.length} pages.`
          : `${base.description} (failed on all ${pages.length} pages)`,
    });
  }
  return merged;
}
