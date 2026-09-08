import { invoke } from "@tauri-apps/api/core";

export interface Session {
  id: number;
  goal: string;
  plannedMinutes: number;
  startedAt: string;
  endedAt?: string | null;
}

export interface Distraction {
  id: number;
  sessionId: number;
  processName: string;
  timestamp: string;
}

export interface BlacklistItem {
  id: number;
  name: string;
  itemType: "app" | "domain";
}

/**
 * Ping backend to verify Tauri IPC communication
 */
export async function ping(): Promise<string> {
  return invoke<string>("ping");
}

/**
 * Start a new focus session
 */
export async function startSession(goal: string, minutes: number): Promise<Session> {
  return invoke<Session>("start_session", { goal, minutes });
}

/**
 * End the currently active session
 */
export async function endSession(): Promise<Session | null> {
  return invoke<Session | null>("end_session");
}

/**
 * Get past session history
 */
export async function getHistory(): Promise<Session[]> {
  return invoke<Session[]>("get_history");
}

/**
 * Add an item to the blacklist
 */
export async function addBlacklistItem(name: string, itemType: "app" | "domain"): Promise<BlacklistItem> {
  return invoke<BlacklistItem>("add_blacklist_item", { name, itemType });
}

/**
 * Remove an item from the blacklist
 */
export async function removeBlacklistItem(id: number): Promise<boolean> {
  return invoke<boolean>("remove_blacklist_item", { id });
}
