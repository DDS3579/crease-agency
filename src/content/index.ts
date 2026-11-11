import { contentSchema } from './schema';
import { studio } from './demo/studio';
import { services } from './demo/services';
import { projects } from './demo/projects';
import { copy } from './demo/copy';

const endpoint =
  typeof process !== 'undefined' ? process.env['PUBLIC_FORM_ENDPOINT'] : undefined;

const raw = {
  studio: { ...studio, formEndpoint: endpoint ?? studio.formEndpoint },
  services: [...services],
  projects: [...projects],
  chapters: [...copy.chapters],
  copy
};

export const content = contentSchema.parse(raw);

export const counts = {
  stages: content.chapters.length,
  services: content.services.length,
  projects: content.projects.length
} as const;

export const missingFields = [
  !content.studio.domain && 'studio.domain',
  !content.studio.email && 'studio.email',
  content.studio.socials.length === 0 && 'studio.socials',
  !content.studio.formEndpoint && 'studio.formEndpoint'
].filter(Boolean) as string[];

export function warnMissingFields(): void {
  if (missingFields.length > 0) {
    console.warn(
      `[crease] DEMO [FILL] fields missing: ${missingFields.join(', ')}. Omitted from the page.`
    );
  }
}

export function dataStrip(): string {
  return copy.hero.dataStrip
    .replace('{stages}', String(counts.stages))
    .replace('{services}', String(counts.services))
    .replace('{projects}', String(counts.projects));
}
