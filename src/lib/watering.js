// One-tap watering from the garden cards, with Undo.
import { base44 } from '@/api/base44Client';
import { localToday, toLocalDateString } from '@/lib/dates';
import { refreshPlantData } from '@/lib/query-client';
import { showAdForEvent } from '@/lib/admob';
import { toast } from 'sonner';

const STAGES = [[20, 'mature'], [15, 'large'], [10, 'medium'], [5, 'small'], [0, 'seedling']];
const RANK = { seedling: 0, small: 1, medium: 2, large: 3, mature: 4 };

export function wateredToday(plant) {
  return String(plant?.last_watered || '').slice(0, 10) === localToday();
}

/** Logs today's watering for one plant. Returns the undo info. */
async function waterOne(plant) {
  const today = localToday();
  const before = {
    last_watered: plant.last_watered ?? null,
    next_watering_due: plant.next_watering_due ?? null,
    total_waterings: plant.total_waterings ?? 0,
    growth_stage: plant.growth_stage ?? 'seedling',
    status: plant.status ?? 'healthy',
  };
  const total = (plant.total_waterings || 0) + 1;
  const computed = STAGES.find(([min]) => total >= min)[1];
  const stage = (RANK[plant.growth_stage] ?? 0) > RANK[computed] ? plant.growth_stage : computed;
  const next = new Date(today + 'T12:00:00');
  next.setDate(next.getDate() + (plant.water_frequency_days || 7));
  const isNewest = !plant.last_watered || today >= String(plant.last_watered).slice(0, 10);

  const [, log] = await Promise.all([
    base44.entities.Plant.update(plant.id, {
      total_waterings: total,
      growth_stage: stage,
      status: plant.status === 'wilted' ? 'healthy' : (plant.status || 'healthy'),
      ...(isNewest ? { last_watered: today, next_watering_due: toLocalDateString(next) } : {}),
    }),
    base44.entities.WateringLog.create({
      plant_id: plant.id,
      plant_name: plant.nickname || plant.name,
      watered_date: today,
      method: 'quick',
    }),
  ]);
  return { plantId: plant.id, before, logId: log?.id, grew: stage !== (plant.growth_stage || 'seedling'), stage };
}

async function undo(info) {
  await Promise.all([
    base44.entities.Plant.update(info.plantId, info.before),
    info.logId ? base44.entities.WateringLog.delete(info.logId) : null,
  ]);
  refreshPlantData();
}

/** Watering round: log one plant (no toast, no ad; the round shows one ad at the end). */
export async function waterPlantQuiet(plant) {
  return waterOne(plant);
}

/** Watering round: take back one plant's watering from this round. */
export async function undoWateringQuiet(info) {
  return undo(info);
}

/** Card button: water now, toast with Undo, one ad (same rule as every watering). */
export async function quickWaterPlant(plant) {
  const name = plant.nickname || plant.name || 'Plant';
  const info = await waterOne(plant);
  refreshPlantData();
  toast.success(info.grew ? `💧 ${name} watered — it grew to ${info.stage}! 🌱` : `💧 ${name} watered`, {
    duration: 5000,
    action: {
      label: 'Undo',
      onClick: () => undo(info).then(() => toast(`Undid ${name}'s watering`)).catch(() => toast.error("Couldn't undo. Try again.")),
    },
  });
  // Let Undo be seen before any ad
  setTimeout(() => showAdForEvent('water'), 3500);
  return info;
}
