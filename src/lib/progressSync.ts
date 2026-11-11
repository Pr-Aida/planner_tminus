import { supabase } from './supabase';
import { getSignedInUserId } from './activitySync';

export interface ContributionInput {
  activityId: string;
  projectId: string;
  resourceId: string | null;
  unitsAdded: number;
  dateKey: string;
  durationMinutes: number;
}

async function shiftResourceCompleted(resourceId: string, delta: number): Promise<void> {
  if (delta === 0) return;
  const { data } = await supabase
    .from('planner_progress_resources')
    .select('completed, total')
    .eq('id', resourceId)
    .maybeSingle();
  if (!data) return;
  const row = data as { completed: number; total: number };
  const next = Math.max(0, Math.min(row.completed + delta, row.total));
  await supabase.from('planner_progress_resources').update({ completed: next }).eq('id', resourceId);
}

async function findContribution(activityId: string) {
  const { data } = await supabase
    .from('planner_progress_contributions')
    .select('id, resource_id, units_added')
    .eq('activity_id', activityId)
    .maybeSingle();
  return data as { id: string; resource_id: string | null; units_added: number } | null;
}

export async function upsertContribution(input: ContributionInput): Promise<void> {
  const userId = await getSignedInUserId();
  if (!userId) return;

  const existing = await findContribution(input.activityId);

  if (existing) {
    if (existing.resource_id === input.resourceId) {
      if (input.resourceId) await shiftResourceCompleted(input.resourceId, input.unitsAdded - existing.units_added);
    } else {
      if (existing.resource_id) await shiftResourceCompleted(existing.resource_id, -existing.units_added);
      if (input.resourceId) await shiftResourceCompleted(input.resourceId, input.unitsAdded);
    }
    await supabase.from('planner_progress_contributions')
      .update({
        project_id: input.projectId,
        resource_id: input.resourceId,
        units_added: input.unitsAdded,
        duration_minutes: input.durationMinutes,
        date_key: input.dateKey,
      })
      .eq('id', existing.id);
    return;
  }

  if (input.resourceId) await shiftResourceCompleted(input.resourceId, input.unitsAdded);
  await supabase.from('planner_progress_contributions').insert({
    user_id: userId,
    activity_id: input.activityId,
    project_id: input.projectId,
    resource_id: input.resourceId,
    units_added: input.unitsAdded,
    date_key: input.dateKey,
    duration_minutes: input.durationMinutes,
  });
}

export async function removeContribution(activityId: string): Promise<void> {
  const existing = await findContribution(activityId);
  if (!existing) return;
  if (existing.resource_id) await shiftResourceCompleted(existing.resource_id, -existing.units_added);
  await supabase.from('planner_progress_contributions').delete().eq('id', existing.id);
}

export async function getActivityLink(activityId: string): Promise<{ project_id: string; resource_id: string | null; units_added: number } | null> {
  const { data } = await supabase
    .from('planner_progress_contributions')
    .select('project_id, resource_id, units_added')
    .eq('activity_id', activityId)
    .maybeSingle();
  if (!data) return null;
  return data as { project_id: string; resource_id: string | null; units_added: number };
}

export function calcDurationMinutes(from: string, to: string): number {
  if (!from || !to) return 0;
  const [fh, fm] = from.split(':').map(Number);
  const [th, tm] = to.split(':').map(Number);
  const diff = (th * 60 + tm) - (fh * 60 + fm);
  return diff > 0 ? diff : 0;
}
