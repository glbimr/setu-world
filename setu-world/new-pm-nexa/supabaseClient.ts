import { createClient } from '@supabase/supabase-js';
import type { ChatMessage } from './types';

const supabaseUrl = "https://tjgzqaeyadranyjhmmbh.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqZ3pxYWV5YWRyYW55amhtbWJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYyNDM0MTAsImV4cCI6MjA4MTgxOTQxMH0.2cCWdBB7dRdeLe6upaaz3StxUOUscF1kiSYthw1vvJg";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Fetch messages from `public.messages`.
 * Options:
 *  - limit: number of rows to return (default 100)
 *  - recipientId: filter by recipient id (optional)
 *  - order: 'asc' | 'desc' (default 'desc')
 */
export const fetchMessages = async (opts?: { limit?: number; recipientId?: string; order?: 'asc' | 'desc' }) => {
	const { limit = 100, recipientId, order = 'desc' } = opts || {};

	let query = supabase.from('messages').select('*').order('timestamp', { ascending: order === 'asc' });
	// Fallback: if table uses created_at
	// We'll let Supabase ignore the order if the column doesn't exist (it will return an error), so try-catch below.

	if (recipientId) {
		// Try both camelCase and snake_case column names
		query = query.or(`recipient_id.eq.${recipientId},recipientId.eq.${recipientId}`);
	}

	if (limit) query = query.limit(limit);

	try {
		const { data, error } = await query;
		if (error) throw error;
		if (!data) return [] as ChatMessage[];

		// Normalize common column names to `ChatMessage` shape
		const normalized: ChatMessage[] = (data as any[]).map(row => {
			return {
				id: row.id,
				senderId: row.sender_id ?? row.senderId ?? row.sender,
				recipientId: row.recipient_id ?? row.recipientId ?? row.recipient,
				text: row.text ?? row.body ?? row.message ?? '',
				timestamp: typeof row.timestamp === 'number' ? row.timestamp : (row.timestamp ? Date.parse(row.timestamp) : (row.created_at ? Date.parse(row.created_at) : 0)),
				type: row.type ?? 'text',
				attachments: row.attachments ?? [],
				isRead: row.is_read ?? row.isRead ?? false
			} as ChatMessage;
		});

		return normalized;
	} catch (err) {
		console.error('fetchMessages error', err);
		return [] as ChatMessage[];
	}
};