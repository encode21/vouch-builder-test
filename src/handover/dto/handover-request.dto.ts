import { z } from 'zod';

const structuredEventSchema = z.object({
  id: z.string().min(1),
  timestamp: z.string().min(1),
  type: z.string().min(1),
  room: z.string().nullable(),
  guest: z.string().nullable(),
  description: z.string().min(1),
  status: z.string().min(1),
});

export const handoverRequestSchema = z.object({
  hotelId: z.string().min(1),
  timezone: z.string().min(1),
  morningDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'morningDate must be YYYY-MM-DD'),
  events: z.array(structuredEventSchema).default([]),
  nightLog: z.string().optional(),
});

export type HandoverRequestDto = z.infer<typeof handoverRequestSchema>;
