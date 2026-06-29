import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import OpenAI from 'npm:openai';

const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });

const PLANT_TYPES = ["Needs Attention", "Flowers", "Vegetables", "Herbs", "Trees & Shrubs", "Houseplants", "Succulents & Cacti", "Seedlings", "Perennials", "Annuals"];

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  // Get plants without a plant_type
  const allPlants = await base44.entities.Plant.filter({ created_by: user.email });
  const uncategorized = allPlants.filter(p => !p.plant_type?.trim() || !PLANT_TYPES.includes(p.plant_type));

  if (uncategorized.length === 0) {
    return Response.json({ updated: 0, message: 'All plants already categorized' });
  }

  const plantList = uncategorized.map(p => ({
    id: p.id,
    key: p.scientific_name || p.name,
    display: `${p.scientific_name ? p.scientific_name : p.name}${p.scientific_name && p.name ? ` (${p.name})` : ''}`
  }));

  const plantNames = plantList.map(p => p.display);

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `You are an expert botanist. Categorize plants using these user-friendly categories:
  - Needs Attention: Plants showing signs of stress, disease, or requiring immediate care
  - Flowers: Flowering ornamentals (roses, orchids, tulips, sunflowers, etc.)
  - Vegetables: Edible vegetable plants (tomato, lettuce, pepper, zucchini, etc.)
  - Herbs: Culinary and medicinal herbs (basil, mint, rosemary, thyme, etc.)
  - Trees & Shrubs: Large woody plants and smaller shrubs for landscaping
  - Houseplants: Indoor foliage plants (pothos, monstera, snake plant, etc.)
  - Succulents & Cacti: Drought-resistant plants with fleshy leaves/stems (jade, aloe, echeveria, etc.)
  - Seedlings: Young plants at early growth stages
  - Perennials: Plants that live for multiple years (daylily, peony, lavender, etc.)
  - Annuals: Plants that complete life cycle in one season (marigold, zinnias, impatiens, etc.)

  Prioritize practical usefulness over strict botanical classification. Return a JSON object where keys match the plant names exactly as given. Only use types from the list.`
      },
      {
        role: "user",
        content: `Categorize these plants: ${JSON.stringify(plantNames)}`
      }
    ],
    response_format: { type: "json_object" }
  });

  const categories = JSON.parse(response.choices[0].message.content);

  let updated = 0;
  for (const item of plantList) {
    let plantType = categories[item.display];
    if (!plantType) {
      const lowerDisplay = item.display.toLowerCase();
      const matchingKey = Object.keys(categories).find(k => k.toLowerCase() === lowerDisplay);
      if (matchingKey) plantType = categories[matchingKey];
    }

    if (plantType && PLANT_TYPES.includes(plantType)) {
      await base44.entities.Plant.update(item.id, { plant_type: plantType });
      updated++;
    }
  }

  return Response.json({ updated, message: `Categorized ${updated} plants` });
});