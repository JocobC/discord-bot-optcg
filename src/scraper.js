import { load } from 'cheerio';
import { DiscordRequest } from './utils.js';

const STATE_KEY = 'PREVIOUS_ITEM_STATE';

/**
 * Scrapes a site and returns ALL items found (both in and out of stock)
 */
async function scrapeSite(siteConfig, searchItem) {
  const allFoundItems = []; 
  const url = siteConfig.url_template.replace('{ITEM}', encodeURIComponent(searchItem));

  console.log(`Checking ${siteConfig.name} for: ${searchItem}`);

  try {
    const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' };
    const response = await fetch(url, { headers });

    if (!response.ok) {
      console.error(`Error fetching ${url}: ${response.statusText}`);
      return allFoundItems;
    }

    const html = await response.text();
    const $ = load(html);
    const items = $(siteConfig.container_selector);

    items.each((index, element) => {
      const item = $(element);
      
      const isOutOfStock = item.find(siteConfig.out_of_stock_selector).length > 0;
      const title = item.find(siteConfig.title_selector).text().trim();
      const price = item.find(siteConfig.price_selector).text().trim();
      
      const searchKeywords = searchItem.toLowerCase().split(' ');
      const titleLower = title.toLowerCase();
      
      if (title && searchKeywords.every(keyword => titleLower.includes(keyword))) {
        allFoundItems.push({
          title: title,
          price: price,
          inStock: !isOutOfStock
        });
      }
    });
  } catch (error) {
    console.error(`Error scraping ${siteConfig.name}: ${error.message}`);
  }
  return allFoundItems;
}

/**
 * Main scraper task run by the Cron Trigger
 */
export async function runScraperTask(env) {
  console.log("Running hourly scraper task with state tracking...");
  
  // 1. Get configuration
  const config = await env.SCRAPER_KV.get('CONFIG', 'json') || {};
  const itemsToSearch = await env.SCRAPER_KV.get('ITEMS', 'json') || [];
  const sitesToScrape = await env.SCRAPER_KV.get('SITES', 'json') || [];
  const { channelId } = config;

  if (!channelId || itemsToSearch.length === 0 || sitesToScrape.length === 0) {
    console.log("Skipping scrape: Missing channel, items, or sites.");
    return;
  }

  // 2. LOAD PREVIOUS STATE (The Bot's Memory)
  const previousState = await env.SCRAPER_KV.get(STATE_KEY, 'json') || {};

  // 3. BUILD CURRENT STATE
  const currentState = {};
  let inStockMessages = '';
  let outOfStockMessages = '';

  for (const item of itemsToSearch) {
    for (const site of sitesToScrape) {
      // Get all items found on the page
      const allItemsOnPage = await scrapeSite(site, item);

      for (const scrapedItem of allItemsOnPage) {
        const itemID = `${site.name}_${scrapedItem.title}`;
        
        const newStatus = scrapedItem.inStock ? "IN_STOCK" : "OUT_OF_STOCK";
        const oldStatus = previousState[itemID];

        currentState[itemID] = newStatus;

        // 4. COMPARE STATES
        if (newStatus === "IN_STOCK" && oldStatus !== "IN_STOCK") {
          // NEWLY in stock
          inStockMessages += `**${scrapedItem.title}**\n${scrapedItem.price}\n*At: ${site.name}*\n\n`;
        } else if (newStatus === "OUT_OF_STOCK" && oldStatus === "IN_STOCK") {
          // It just went OUT of stock
          outOfStockMessages += `**${scrapedItem.title}**\n*At: ${site.name}*\n\n`;
        }
      }
    }
  }

  // 5. SEND ALERTS (only if there are messages)
  const endpoint = `/channels/${channelId}/messages`;
  
  try {
    if (inStockMessages) {
      const embed = {
        title: "✅ In-Stock Alert",
        description: inStockMessages,
        color: 0x00FF00, // Green
        timestamp: new Date().toISOString(),
      };
      await DiscordRequest(endpoint, { method: 'POST', body: { embeds: [embed] } }, env);
    }
    
    if (outOfStockMessages) {
      const embed = {
        title: "❌ Out-of-Stock Alert",
        description: outOfStockMessages,
        color: 0xFF0000, // Red
        timestamp: new Date().toISOString(),
      };
      await DiscordRequest(endpoint, { method: 'POST', body: { embeds: [embed] } }, env);
    }

  } catch (err) {
    console.error('Error sending message to Discord:', err);
  }
  
  await env.SCRAPER_KV.put(STATE_KEY, JSON.stringify(currentState));

  console.log("Scraper task complete.");
}