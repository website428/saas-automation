import { serverSupabase } from "@/lib/server-supabase";

/** Records an internal activity without sending customer data to an external service. */
export async function recordSalesActivity(contactId: string | null, activityType: string, title: string, details: Record<string, unknown> = {}) {
  const { error } = await serverSupabase.from("sales_activity").insert({ contact_id: contactId, activity_type: activityType, title, details });
  if (error) console.error("Sales activity record failed", error);
}
