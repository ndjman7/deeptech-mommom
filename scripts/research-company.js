const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const companyName = process.argv[2];
const searchQuery = process.argv[3] || companyName;

if (!companyName) {
  console.error('Usage: node research-company.js <company-name> [search-query]');
  process.exit(1);
}

async function extractTextContent(page) {
  return await page.evaluate(() => {
    const selectors = ['main', 'article', '#content', '.content', '[role="main"]', 'body'];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.innerText.trim().length > 100) {
        return el.innerText.trim().substring(0, 15000);
      }
    }
    return document.body?.innerText?.trim().substring(0, 15000) || '';
  });
}

async function searchGoogle(page, query) {
  const results = [];
  try {
    await page.goto(`https://www.google.com/search?q=${encodeURIComponent(query)}&hl=ko`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000
    });
    await page.waitForTimeout(2000);

    const searchResults = await page.$$('div.g, div[data-sokoban-container]');
    for (const result of searchResults.slice(0, 8)) {
      try {
        const title = await result.$eval('h3', el => el.textContent).catch(() => '');
        const link = await result.$eval('a', el => el.href).catch(() => '');
        const snippet = await result.$eval('[data-sncf], .VwiC3b, [style*="-webkit-line-clamp"]', el => el.textContent).catch(() => '');
        if (title && link) {
          results.push({ title, link, snippet });
        }
      } catch (e) {}
    }
  } catch (e) {
    console.error(`Google search failed for "${query}": ${e.message}`);
  }
  return results;
}

async function visitPage(page, url, timeout = 12000) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
    await page.waitForTimeout(1500);
    const title = await page.title();
    const content = await extractTextContent(page);
    const metaDesc = await page.$eval('meta[name="description"]', el => el.content).catch(() => '');
    return { url, title, content, metaDesc, success: true };
  } catch (e) {
    return { url, title: '', content: '', metaDesc: '', success: false, error: e.message };
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'ko-KR'
  });
  const page = await context.newPage();

  const output = {
    company: companyName,
    searchQuery,
    timestamp: new Date().toISOString(),
    searches: {},
    pages: []
  };

  // Search 1: Company main info
  console.error(`[${companyName}] Searching: ${searchQuery} 기업 기술`);
  output.searches.main = await searchGoogle(page, `${searchQuery} 기업 기술`);

  // Search 2: Company deeptech/TIPS info
  console.error(`[${companyName}] Searching: ${searchQuery} 딥테크 팁스`);
  output.searches.deeptech = await searchGoogle(page, `${searchQuery} 딥테크 팁스 선정`);

  // Search 3: Company tech/product info
  console.error(`[${companyName}] Searching: ${searchQuery} 기술력 제품`);
  output.searches.tech = await searchGoogle(page, `${searchQuery} 기술력 제품 솔루션`);

  // Search 4: Company funding/investment info
  console.error(`[${companyName}] Searching: ${searchQuery} 투자 펀딩`);
  output.searches.funding = await searchGoogle(page, `${searchQuery} 투자 펀딩 시리즈`);

  // Collect unique URLs to visit
  const allResults = [
    ...output.searches.main,
    ...output.searches.deeptech,
    ...output.searches.tech,
    ...output.searches.funding,
  ];

  const visited = new Set();
  const urlsToVisit = [];
  for (const r of allResults) {
    if (r.link && !visited.has(r.link) && !r.link.includes('google.com') && urlsToVisit.length < 6) {
      visited.add(r.link);
      urlsToVisit.push(r.link);
    }
  }

  // Visit top pages
  for (const url of urlsToVisit) {
    console.error(`[${companyName}] Visiting: ${url}`);
    const pageData = await visitPage(page, url);
    output.pages.push(pageData);
  }

  await browser.close();

  // Output JSON
  console.log(JSON.stringify(output, null, 2));
}

main().catch(e => {
  console.error('Fatal error:', e.message);
  process.exit(1);
});
