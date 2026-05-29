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

  const plantNames = uncategorized.map(p => p.name);

   const response = await openai.chat.completions.create({
     model: "gpt-4o-mini",
     messages: [
       {
         role: "system",
         content: `You are an expert botanist. Categorize plants accurately using these definitions:
  - Orchid: Flowering plants in the family Orchidaceae with distinctive blooms and aerial roots
  - Succulent: Plants with thick fleshy leaves/stems that store water (e.g., jade, aloe, echeveria)
  - Cactus: Succulent plants in Cactaceae family with spines and typically spherical/columnar shape
  - Tropical: Plants originating from warm humid tropical regions (not classified as succulent/cactus/orchid)
  - Tree: Woody plants with a single trunk and substantial height, mature form
  - Shrub: Woody plants that are shorter than trees with multiple stems from base
  - Herb: Low-growing plants used for cooking/medicine (basil, mint, rosemary, etc.)
  - Vegetable: Edible plants grown for their produce (tomato, lettuce, pepper, etc.)
  - Fruit: Plants grown primarily for fruit production (apple, berry bushes, etc.)
  - Fern: Non-flowering plants with fronds, reproducing via spores
  - Vine: Climbing or trailing plants with long stems (ivy, clematis, jasmine, etc.)
  - Grass: Monocot family Poaceae including ornamental grasses and lawn grasses
  - Aquatic: Plants that grow in water or very wet conditions
  - Bulb: Plants that grow from bulbs/tubers/corms (tulip, daffodil, hyacinth, dahlia, etc.)
  - Other: Plants that don't fit above categories

  Given a list of plant names, assign each one the MOST SPECIFIC and ACCURATE plant_type from the list above. Return a JSON object as {"plant_name_1": "category_1", "plant_name_2": "category_2"} where keys are plant names exactly as given (case-insensitive match is OK for keys). Only use types from the list.`
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
     // Try exact match first, then case-insensitive match
     let plantType = categories[plant.name];
     if (!plantType) {
       const lowerName = plant.name.toLowerCase();
       const matchingKey = Object.keys(categories).find(k => k.toLowerCase() === lowerName);
       if (matchingKey) plantType = categories[matchingKey];
     }

     if (plantType && PLANT_TYPES.includes(plantType)) {
       await base44.entities.Plant.update(plant.id, { plant_type: plantType });
       updated++;
     }
   }

  return Response.json({ updated, message: `Categorized ${updated} plants` });
});