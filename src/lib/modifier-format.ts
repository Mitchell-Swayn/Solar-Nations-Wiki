import type { ModifierRef } from './types';
import { getModifierTargetName } from './data';

export function formatModifierTemplate(modifier: ModifierRef, template: string): string {
  const targets = [modifier.value1, modifier.value2, modifier.value3];
  return template
    .replace(/<img\s+id="[^"]+"\s*\/>/gi, '')
    .replace(/<\/?[a-zA-Z][^>]*>/g, '')
    .replace(/<\/>/g, '')
    .replace(/\$?\{val\}/g, '')
    .replace(/\{([123])_img\}/g, '')
    .replace(/\{([123])\}/g, (_match, rawPosition: string) => {
      const position = Number(rawPosition);
      const target = targets[position - 1];
      return target ? getModifierTargetName(modifier.key, position, target) : '';
    })
    .replace(/\s*:\s*$/, '')
    .replace(/\s+([.,;)])/g, '$1')
    .replace(/\(\s*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
