import { z } from 'zod';

export const studioSchema = z.object({
  name: z.string().min(1),
  label: z.string().min(1),
  locality: z.string().min(1),
  country: z.string().min(1),
  description: z.string().min(1),
  domain: z.string().url().optional(),
  email: z.string().email().optional(),
  socials: z.array(z.object({ label: z.string().min(1), url: z.string().url() })),
  formEndpoint: z.string().url().optional()
});

export const serviceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  sentence: z.string().min(1),
  stack: z.string().min(1)
});

export const projectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: z.string().min(1),
  year: z.number().int().min(2000).max(2100),
  sentence: z.string().min(1),
  stack: z.string().min(1),
  seed: z.number().int()
});

export const chapterSchema = z.object({
  id: z.string().min(1),
  key: z.enum(['strategy', 'design', 'build', 'launch']),
  name: z.string().min(1),
  heading: z.string().min(1),
  body: z.string().min(1)
});

export const contentSchema = z.object({
  studio: studioSchema,
  services: z.array(serviceSchema).min(1),
  projects: z.array(projectSchema).min(1),
  chapters: z.array(chapterSchema).length(4),
  copy: z.record(z.string(), z.unknown())
});

export type Studio = z.infer<typeof studioSchema>;
export type Service = z.infer<typeof serviceSchema>;
export type Project = z.infer<typeof projectSchema>;
export type Chapter = z.infer<typeof chapterSchema>;
