import {
  InteractionType,
  InteractionResponseType,
  InteractionResponseFlags,
  verifyKey, // We import verifyKey directly
} from 'discord-interactions';
import { DiscordRequest } from './utils.js';
import { runScraperTask } from './scraper.js';

/**
 * A simple, self-contained verification function.
 */
async function VerifyRequest(request, env) {
  const publicKey = env.DISCORD_PUBLIC_KEY;
  if (!publicKey) {
    console.error('CRITICAL: DISCORD_PUBLIC_KEY secret is not defined.');
    return { isValid: false, interaction: null };
  }

  const signature = request.headers.get('x-signature-ed25519');
  const timestamp = request.headers.get('x-signature-timestamp');
  const body = await request.clone().text(); // Read the raw body

  if (!signature || !timestamp || !body) {
    console.error('CRITICAL: Missing signature, timestamp, or body.');
    return { isValid: false, interaction: null };
  }

  // Run the verification
  const isValidRequest = await verifyKey(body, signature, timestamp, publicKey);

  if (!isValidRequest) {
    console.error('CRITICAL: Bad request signature.');
    return { isValid: false, interaction: null };
  }

  return { isValid: true, interaction: JSON.parse(body) };
}


export default {
  async fetch(request, env, ctx) {
    // Handle Cron Trigger
    if (request.cf?.cron) {
      console.log('Cron trigger received. Starting scraper task.');
      ctx.waitUntil(runScraperTask(env));
      return new Response('Cron task started.', { status: 200 });
    }

    const url = new URL(request.url);

    // Only respond to POST requests at /interactions
    if (request.method === 'POST' && url.pathname === '/interactions') {
      
      // Use our new self-contained verification function
      const { isValid, interaction } = await VerifyRequest(request, env);
      
      // Verification failed
      if (!isValid || !interaction) {
        return new Response('Bad request signature.', { status: 401 });
      }

      const { type, id, data } = interaction;
      const headers = { 'Content-Type': 'application/json' };

      // Handle PING (This is the verification request)
      if (type === InteractionType.PING) {
        return new Response(
          JSON.stringify({ type: InteractionResponseType.PONG }),
          { headers },
        );
      }

      // Handle Slash Commands
      if (type === InteractionType.APPLICATION_COMMAND) {
        
        if (data.name === 'scrape-setchannel') {
          const channelId = data.options[0].value;
          const channel = data.resolved.channels[channelId];
          await env.SCRAPER_KV.put('CONFIG', JSON.stringify({ channelId: channelId }));
          return new Response(
            JSON.stringify({
              type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
              data: { content: `✅ Done. Scraper alerts will now be sent to #${channel.name}.`, flags: InteractionResponseFlags.EPHEMERAL },
            }),
            { headers },
          );
        }

        if (data.name === 'scrape-additem') {
          const newItem = data.options[0].value;
          const items = await env.SCRAPER_KV.get('ITEMS', 'json') || [];
          if (items.includes(newItem)) {
            return new Response(
              JSON.stringify({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: 'This item is already in the list.', flags: InteractionResponseFlags.EPHEMERAL }, }),
              { headers },
            );
          }
          items.push(newItem);
          await env.SCRAPER_KV.put('ITEMS', JSON.stringify(items));
          return new Response(
            JSON.stringify({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: `Added \`${newItem}\` to the search list.` }, }),
            { headers },
          );
        }

        if (data.name === 'scrape-removeitem') {
          const itemToRemove = data.options[0].value;
          let items = await env.SCRAPER_KV.get('ITEMS', 'json') || [];
          const originalLength = items.length;
          items = items.filter(item => item !== itemToRemove);
          if (items.length === originalLength) {
            return new Response(
              JSON.stringify({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: `Could not find \`${itemToRemove}\` in the list.`, flags: InteractionResponseFlags.EPHEMERAL }, }),
              { headers },
            );
          }
          await env.SCRAPER_KV.put('ITEMS', JSON.stringify(items));
          return new Response(
            JSON.stringify({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: `Removed \`${itemToRemove}\` from the search list.` }, }),
            { headers },
          );
        }
        
        if (data.name === 'scrape-list') {
          const items = await env.SCRAPER_KV.get('ITEMS', 'json') || [];
          const sites = await env.SCRAPER_KV.get('SITES', 'json') || [];
          const config = await env.SCRAPER_KV.get('CONFIG', 'json') || {};
          const itemsString = items.length > 0 ? items.map(item => `• ${item}`).join('\n') : "No items.";
          const sitesString = sites.length > 0 ? sites.map(site => `• ${site.name}`).join('\n') : "No sites.";
          const channelString = config.channelId ? `<#${config.channelId}>` : "Not set. Use /scrape-setchannel";
          const embed = {
            title: 'Scraper Configuration',
            color: 0x0099FF,
            fields: [
              { name: 'Alert Channel', value: channelString, inline: false },
              { name: '🔎 Items to Search', value: itemsString, inline: true },
              { name: '🌐 Sites to Scrape', value: sitesString, inline: true },
            ],
          };
          return new Response(
            JSON.stringify({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { embeds: [embed] }, }),
            { headers },
          );
        }
        
        if (data.name === 'scrape-addsite') {
          const options = data.options.reduce((acc, opt) => { acc[opt.name] = opt.value; return acc; }, {});
          const newSite = {
            name: options.sitename,
            url_template: options.url_template,
            container_selector: options.container_selector,
            title_selector: options.title_selector,
            price_selector: options.price_selector,
            out_of_stock_selector: options.out_of_stock_selector,
          };
          const sites = await env.SCRAPER_KV.get('SITES', 'json') || [];
          sites.push(newSite);
          await env.SCRAPER_KV.put('SITES', JSON.stringify(sites));
          return new Response(
            JSON.stringify({ type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE, data: { content: `Added new site: \`${newSite.name}\`.` }, }),
            { headers },
          );
        }
      }
      
      console.error('Unknown interaction type:', type);
      return new Response('Unknown interaction type.', { status: 400 });
    }

    // Default response for all other requests
    return new Response('Hello! This is the scraper bot. The interaction endpoint is at /interactions', { status: 200 });
  },
};