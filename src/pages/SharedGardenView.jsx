import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

export default function SharedGardenView() {
  const { shareToken } = useParams();
  const [share, setShare] = useState(null);
  const [plants, setPlants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    loadGarden();
  }, [shareToken]);

  const loadGarden = async () => {
    try {
      const shares = await base44.asServiceRole.entities.SharedGarden.filter({
        share_token: shareToken,
        is_active: true
      });

      if (!shares || shares.length === 0) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      const garden = shares[0];
      setShare(garden);

      const allPlants = await base44.asServiceRole.entities.Plant.filter({
        created_by: garden.owner_email
      });
      setPlants(allPlants);
    } catch (error) {
      console.error("Error loading shared garden:", error);
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Garden Not Found</CardTitle>
            <CardDescription>This garden share link is invalid or expired.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">{share.public_name}</h1>
          {share.public_description && (
            <p className="text-gray-600 text-lg">{share.public_description}</p>
          )}
          <p className="text-gray-500 mt-2">🌱 {plants.length} plant{plants.length !== 1 ? 's' : ''}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {plants.map((plant) => (
            <Card key={plant.id} className="overflow-hidden hover:shadow-lg transition">
              {plant.image_url && (
                <img src={plant.image_url} alt={plant.name} className="w-full h-48 object-cover" />
              )}
              <CardHeader>
                <CardTitle className="text-xl">{plant.name}</CardTitle>
                {plant.scientific_name && (
                  <CardDescription className="italic">{plant.scientific_name}</CardDescription>
                )}
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  {plant.plant_type && <p><span className="font-semibold">Type:</span> {plant.plant_type}</p>}
                  {plant.location && <p><span className="font-semibold">Location:</span> {plant.location}</p>}
                  {plant.nickname && <p><span className="font-semibold">Nickname:</span> {plant.nickname}</p>}
                  {plant.water_frequency_days && (
                    <p><span className="font-semibold">Water every:</span> {plant.water_frequency_days} days</p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {plants.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500 text-lg">No plants in this garden yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}