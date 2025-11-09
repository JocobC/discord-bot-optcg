import { InstallGlobalCommands } from './utils.js';

// Command to set the channel for scraper alerts
export const SCRAPE_SETCHANNEL_COMMAND = {
  name: 'scrape-setchannel',
  description: 'Sets the channel where scraper alerts will be sent.',
  options: [
    {
      type: 7, // CHANNEL
      name: 'channel',
      description: 'The channel to send alerts to.',
      required: true,
    },
  ],
  type: 1,
};

// Command to add a card to the search list
export const SCRAPE_ADDITEM_COMMAND = {
  name: 'scrape-additem',
  description: 'Adds a TCG card or item to the search list.',
  options: [
    {
      type: 3, // STRING
      name: 'item',
      description: 'The name of the card/item to search for (e.g., "Black Lotus").',
      required: true,
    },
  ],
  type: 1,
};

// Command to remove a card
export const SCRAPE_REMOVEITEM_COMMAND = {
  name: 'scrape-removeitem',
  description: 'Removes a card/item from the search list.',
  options: [
    {
      type: 3, // STRING
      name: 'item',
      description: 'The exact name of the card/item to remove.',
      required: true,
    },
  ],
  type: 1,
};

// Command to list all items and sites
export const SCRAPE_LIST_COMMAND = {
  name: 'scrape-list',
  description: 'Lists all items and sites currently being scraped.',
  type: 1,
};

// Command to add a new site (with all selectors)
export const SCRAPE_ADDSITE_COMMAND = {
  name: 'scrape-addsite',
  description: 'Adds a new website to scrape.',
  options: [
    { type: 3, name: 'sitename', description: 'A unique name for the site (e.g., "TCG Central").', required: true },
    { type: 3, name: 'url_template', description: 'The search URL. Use {ITEM} as a placeholder (e.g., "https://site.com/search?q={ITEM}").', required: true },
    { type: 3, name: 'container_selector', description: 'The CSS selector for the product "box". (e.g., "div.product-card")', required: true },
    { type: 3, name: 'title_selector', description: 'CSS selector for the item title. (e.g., "h3.product-name")', required: true },
    { type: 3, name: 'price_selector', description: 'CSS selector for the item price. (e.g., "span.price")', required: true },
    { type: 3, name: 'out_of_stock_selector', description: 'CSS selector for the "Sold Out" badge. (e.g., "div.sold-out")', required: true },
  ],
  type: 1,
};


export const ALL_COMMANDS = [
  SCRAPE_SETCHANNEL_COMMAND,
  SCRAPE_ADDITEM_COMMAND,
  SCRAPE_REMOVEITEM_COMMAND,
  SCRAPE_LIST_COMMAND,
  SCRAPE_ADDSITE_COMMAND,
];

InstallGlobalCommands(process.env.DISCORD_APP_ID, ALL_COMMANDS);