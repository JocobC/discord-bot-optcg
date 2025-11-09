// Create a new file at src/scraper.js

import { load } from 'cheerio';
import { DiscordRequest } from './utils.js';

/**
 * Scrapes a single site for a single item
 */
async function scrapeSite(siteConfig, searchItem) {
  const availableItems = [];
  // Use encodeURIComponent to safely add the item to a URL
  const url = siteConfig.url_template.replace('{ITEM}', encodeURIComponent(searchItem));

  console.log(`Checking ${siteConfig.name} for: ${searchItem}`);

  try {
    const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' };
    
    // Use the native fetch() in Cloudflare Workers
    const response = await fetch(url, { headers });

    if (!response.ok) {
      console.error(`Error fetching ${url}: ${response.statusText}`);
      return availableItems;
    }

    const html = await response.text();
    const $ = load(html);

    const items = $(siteConfig.container_selector);

    items.each((index, element) => {
      const item = $(element);
      const isOutOfStock = item.find(siteConfig.out_of_stock_selector).length > 0;

      if (!isOutOfStock) {
        const title = item.find(siteConfig.title_selector).text().trim();
        const price = item.find(siteConfig.price_selector).text().trim();
        
        // Simple filter to reduce false positives
        const searchKeywords = searchItem.toLowerCase().split(' ');
        const titleLower = title.toLowerCase();
        
        if (searchKeywords.every(keyword => titleLower.includes(keyword))) {
          availableItems.push({
            title: title || "Title not found",
            price: price || "Price not found",
          });
        }
      }
    });
  } catch (error) {
    console.error(`Error scraping ${siteConfig.name}: ${error.message}`);
  }
  return availableItems;
}

/**
 * Main scraper task run by the Cron Trigger
 * @param {object} env - The worker environment (contains SCRAPER_KV)
 */
export async function runScraperTask(env) {
  console.log("Running hourly scraper task...");
  
  // 1. Get config from KV
  const config = await env.SCRAPER_KV.get('CONFIG', 'json') || {};
  const items = await env.SCRAPER_KV.get('ITEMS', 'json') || [];
  const sites = await env.SCRAPER_KV.get('SITES', 'json') || [];

  const { channelId } = config;

  if (!channelId) {
    console.log("No channel configured. Skipping scrape. Use /scrape-setchannel");
    return;
  }
  
  if (items.length === 0 || sites.length === 0) {
    console.log("No items or sites configured. Skipping scrape.");
    return;
  }

  // 2. Run the scrapes
  for (const item of items) {
    let resultsDescription = '';
    for (const site of sites) {
      const availableItems = await scrapeSite(site, item);
      if (availableItems.length > 0) {
        resultsDescription += `**Found at ${site.name}:**\n`;
        availableItems.forEach(found => {
          resultsDescription += `• **${found.title}** - ${found.price}\n`;
        });
        resultsDescription += '\n'; // Add space between sites
      }
      // No sleep() needed, requests are async
    }

    // 3. Send results to Discord if anything was found
    if (resultsDescription) {
      const embed = {
        title: `✅ In-Stock Alert: ${item}`,
        description: resultsDescription,
        color: 0x00FF00, // Green
        timestamp: new Date().toISOString(),
      };

      const endpoint = `/channels/${channelId}/messages`;
      try {
        await DiscordRequest(endpoint, {
          method: 'POST',
          body: {
            embeds: [embed],
          },
        });
      } catch (err) {
        console.error('Error sending message to Discord:', err);
      }
    }
  }

  console.log("Scraper task complete.");
}