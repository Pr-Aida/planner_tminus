import { supabase } from './supabase';
import { getSignedInUserId } from './activitySync';
import { isTimeUnit } from './progress';

export interface ContributionInput {
  activityId: string;
  projectId: string;
  resourceId: string | null;
  unitsAdded: number;
  dateKey: string;
  durationMinutes: number;
}

/**
 * Atomically shift a resource's completed value by `delta` using a server-side
 * function. Returns the new completed value, or null on failure.
 */
export async function shiftResourceCompleted(resourceId: string, delta: number): Promise<number | null> {
  const { data, error } = await supabase
    .rpc('shift_resource_completed', { p_resource_id: resourceId, p_delta: delta });
  if (error || data === null || data === undefined) {
    console.error('shift_resource_completed failed:', error);
    return null;
  }
  return data as number;
}

async function findContribution(activityId: string) {
  const { data, error } = await supabase
    .from('planner_progress_contributions')
    .select('id, resource_id, units_added, duration_minutes')
    .eq('activity_id', activityId)
    .maybeSingle();
  if (error) {
    console.error('findContribution failed:', error);
    return null;
  }
  return data as { id: string; resource_id: string | null; units_added: number; duration_minutes: number } | null;
}

/**
 * Upsert a contribution linked to an activity.
 * - If a contribution for this activityId already exists, it updates it
 *   (shifting the resource completed value by the difference) — no double counting.
 * - If the resource is a time unit and no explicit unitsAdded is given (<= 0),
 *   the duration_minutes is used as the units_added automatically.
 * Returns true on success, false on failure.
 */
export async function upsertContribution(input: ContributionInput): Promise<boolean> {
  const userId = await getSignedInUserId();
  if (!userId) return false;

  const existing = await findContribution(input.activityId);

  // For time resources, if no explicit unitsAdded, use duration minutes
  let effectiveUnits = input.unitsAdded;
  if (input.resourceId && isTimeUnitUnitOf(input.resourceId)) {
    if (effectiveUnits <= 0 && input.durationMinutes > 0) {
      effectiveUnits = input.durationMinutes;
    }
  }

  if (existing) {
    const unitsDelta = effectiveUnits - existing.units_added;
    if (existing.resource_id === input.resourceId) {
      if (input.resourceId && unitsDelta !== 0) {
        const next = await shiftResourceCompleted(input.resourceId, unitsDelta);
        if (next === null) return false;
      }
    } else {
      // Resource changed: reverse old, apply new
      if (existing.resource_id) {
        await shiftResourceCompleted(existing.resource_id, -existing.units_added);
      }
      if (input.resourceId && effectiveUnits !== 0) {
        const next = await shiftResourceCompleted(input.resourceId, effectiveUnits);
        if (next === null) return false;
      }
    }
    const { error: updErr } = await supabase.from('planner_progress_contributions')
      .update({
        project_id: input.projectId,
        resource_id: input.resourceId,
        units_added: effectiveUnits,
        duration_minutes: input.durationMinutes,
        date_key: input.dateKey,
      })
      .eq('id', existing.id);
    if (updErr) {
      console.error('upsertContribution update failed:', updErr);
      return false;
    }
    return true;
  }

  // Insert new
  if (input.resourceId && effectiveUnits !== 0) {
    const next = await shiftResourceCompleted(input.resourceId, effectiveUnits);
    if (next === null) return false;
  }
  const { error: insertErr } = await supabase.from('planner_progress_contributions').insert({
    user_id: userId,
    activity_id: input.activityId,
    project_id: input.projectId,
    resource_id: input.resourceId,
    units_added: effectiveUnits,
    date_key: input.dateKey,
    duration_minutes: input.durationMinutes,
  });
  if (insertErr) {
    console.error('upsertContribution insert failed:', insertErr);
    // Try to reverse the resource shift
    if (input.resourceId && effectiveUnits !== 0) {
      await shiftResourceCompleted(input.resourceId, -effectiveUnits);
    }
    return false;
  }
  return true;
}

// Cache resource units to avoid extra lookups during upsert
const resourceUnitCache = new Map<string, string>();
async function isTimeUnitUnitOf(resourceId: string): Promise<boolean> {
  if (resourceUnitCache.has(resourceId)) {
    return isTimeUnit(resourceUnitCache.get(resourceId)!);
  }
  const { data } = await supabase
    .from('planner_progress_resources')
    .select('unit')
    .eq('id', resourceId)
    .maybeSingle();
  const unit = (data as { unit: string } | null)?.unit || '';
  resourceUnitCache.set(resourceId, unit);
  return isTimeUnit(unit);
}

/**
 * Remove a contribution by activity ID. Reverses the resource completed shift.
 * Returns true on success, false on failure.
 */
export async function removeContribution(activityId: string): Promise<boolean> {
  const existing = await findContribution(activityId);
  if (!existing) return true;

  if (existing.resource_id && existing.units_added !== 0) {
    const next = await shiftResourceCompleted(existing.resource_id, -existing.units_added);
    if (next === null) {
      console.error('removeContribution: failed to reverse resource completed');
      return false;
    }
  }
  const { error } = await supabase.from('planner_progress_contributions').delete().eq('id', existing.id);
  if (error) {
    console.error('removeContribution: delete failed:', error);
    // Try to re-apply the shift since delete failed
    if (existing.resource_id && existing.units_added !== 0) {
      await shiftResourceCompleted(existing.resource_id, existing.units_added);
    }
    return false;
  }
  return true;
}

export async function getActivityLink(activityId: string): Promise<{ project_id: string; resource_id: string | null; units_added: number } | null> {
  const { data, error } = await supabase
    .from('planner_progress_contributions')
    .select('project_id, resource_id, units_added')
    .eq('activity_id', activityId)
    .maybeSingle();
  if (error || !data) return null;
  return data as { project_id: string; resource_id: string | null; units_added: number };
}

export function calcDurationMinutes(from: string, to: string): number {
  if (!from || !to) return 0;
  const [fh, fm] = from.split(':').map(Number);
  const [th, tm] = to.split(':').map(Number);
  if (isNaN(fh) || isNaN(fm) || isNaN(th) || isNaN(tm)) return 0;
  const diff = (th * 60 + tm) - (fh * 60 + fm);
  return diff > 0 ? diff : 0;
}
