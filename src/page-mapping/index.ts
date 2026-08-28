export {
  collectPageFields,
  findControlByFingerprint,
  controlFingerprint,
} from './collector';
export type {
  CollectedControlKind,
  CollectedField,
  InaccessibleRegion,
  PageCollection,
} from './collector';
export { fieldDictionary, detectSectionContext } from './dictionary';
export type { FieldDictionaryEntry } from './dictionary';
export {
  compactText,
  detectValueFormat,
  normalizeMappedValue,
} from './normalize';
export { scoreCollectedField, scorePageFields } from './scorer';
export type {
  FieldMappingCandidate,
  MappingConfidence,
  ScoredPageField,
} from './scorer';
export { applySiteRules, pageSignatureOf, rememberFieldMapping } from './rules';
export type { SiteMappingRule } from './rules';
