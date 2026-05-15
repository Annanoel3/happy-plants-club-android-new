import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import OpenAI from 'npm:openai';

const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });

const PLANT_TYPES = ["Orchid", "Succulent", "Cactus", "Tropical", "Tree", "Shrub", "Herb", "Vegetable", "Fruit", "Fern", "Vine", "Grass", "Aquatic", "Bulb", "Other"];

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  // Get plants without a plant_type
  const allPlants = await base44.entities.Plant.filter({ created_by: user.email });
  const uncategorized = allPlants.filter(p => !p.plant_type || p.plant_type === 'Other');

  if (uncategorized.length === 0) {
    return Response.json({ updated: 0, message: 'All plants already categorized' });
  }

  const plantNames = uncategorized.map(p => p.scientific_name || p.name);

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `You are a botanist. Given a list of plant names, assign each one a plant_type from this list: ${PLANT_TYPES.join(', ')}. Return a JSON object where keys are the plant names exactly as given and values are the plant_type. Do not use any type not in the list.`
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
  for (const plant of uncategorized) {
    const key = plant.scientific_name || plant.name;
    const plantType = categories[key];
    if (plantType && PLANT_TYPES.includes(plantType)) {
      await base44.entities.Plant.update(plant.id, { plant_type: plantType });
      updated++;
    }
  }

  return Response.json({ updated, message: `Categorized ${updated} plants` });
});