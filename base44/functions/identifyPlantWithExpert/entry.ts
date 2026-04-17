import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';
import { webSearchTool, Agent, Runner } from 'npm:@openai/agents@0.1.0';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { image_url } = await req.json();

        // Setup the custom Plant Expert agent
        const webSearchPreview = webSearchTool({
            userLocation: {
                type: "approximate",
                country: undefined,
                region: undefined,
                city: undefined,
                timezone: undefined
            },
            searchContextSize: "medium"
        });

        const plantExpert = new Agent({
            name: "Plant Expert",
            instructions: `You are a botanist and have a whole database of all the plants that people might have. 
            
Analyze the plant image and provide detailed care information in this EXACT JSON format:
{
    "name": "common name",
    "scientific_name": "scientific name",
    "care_instructions": {
        "watering": "detailed watering instructions",
        "sunlight": "sunlight requirements",
        "soil": "soil preferences",
        "humidity": "humidity needs",
        "temperature": "temperature range",
        "fertilizing": "fertilizing schedule",
        "tips": "care tips and warnings"
    },
    "water_frequency_days": number (how many days between watering)
}`,
            model: "gpt-5-mini",
            tools: [webSearchPreview],
            modelSettings: {
                reasoning: {
                    effort: "medium"
                },
                store: true
            }
        });

        const conversationHistory = [
            {
                role: "user",
                content: [
                    {
                        type: "input_image",
                        source: image_url
                    },
                    {
                        type: "input_text",
                        text: "Identify this plant and provide comprehensive care instructions in the exact JSON format specified."
                    }
                ]
            }
        ];

        const runner = new Runner({
            traceMetadata: {
                __trace_source__: "agent-builder",
                workflow_id: "wf_68e7e1bbd40881909aef424a0e64f8ca037ed10c0129228f"
            }
        });

        const result = await runner.run(plantExpert, conversationHistory);

        if (!result.finalOutput) {
            throw new Error("Agent result is undefined");
        }

        // Try to parse the JSON response
        let plantData;
        try {
            // Extract JSON from the response if it's wrapped in markdown or text
            const jsonMatch = result.finalOutput.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                plantData = JSON.parse(jsonMatch[0]);
            } else {
                plantData = JSON.parse(result.finalOutput);
            }
        } catch (e) {
            // If parsing fails, return error
            return Response.json({ 
                success: false, 
                error: "Could not parse plant data from expert response" 
            }, { status: 400 });
        }

        return Response.json({ success: true, plantData });
    } catch (error) {
        console.error('Error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});