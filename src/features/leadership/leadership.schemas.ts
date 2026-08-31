import { z } from "zod";

export const leadershipAvatarSchema = z.object({
  url: z.string(),
  alt: z.string(),
});

export const leadershipMemberSchema = z.object({
  id: z.number().int(),
  position: z.number().int(),
  name: z.string(),
  role: z.string().nullable(),
  quote: z.string().nullable(),
  avatars: z.array(leadershipAvatarSchema),
});

export const leadershipResponseSchema = z.object({
  leadership: z.array(leadershipMemberSchema),
});

export type LeadershipResponse = z.infer<typeof leadershipResponseSchema>;
