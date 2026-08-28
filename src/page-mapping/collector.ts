const MAX_TEXT = 80;
const MAX_PAGE_SAMPLE = 240;
const SHOW_ELEMENT = 1;

const SKIP_INPUT_TYPES = new Set([
  'hidden',
  'submit',
  'button',
  'reset',
  'image',
  'file',
]);

export type CollectedControlKind =
  'text' | 'textarea' | 'radio' | 'checkbox' | 'select' | 'date' | 'unknown';

export interface CollectedField {
  id: string;
  kind: CollectedControlKind;
  tagName: string;
  type: string;
  name: string;
  idAttr: string;
  label: string;
  nearbyText: string;
  group: string;
  options: string[];
  currentValue: string;
  required: boolean;
  inShadow: boolean;
  fingerprint: string;
}

export interface InaccessibleRegion {
  reason: 'closedShadow' | 'crossOriginFrame' | 'unsupported';
  description: string;
}

export interface PageCollection {
  origin: string;
  title: string;
  pageTextSample: string;
  fields: CollectedField[];
  inaccessible: InaccessibleRegion[];
}

export function collectPageFields(root: Document = document): PageCollection {
  const fields: CollectedField[] = [];
  let index = 0;
  for (const element of walkElements(root)) {
    if (!isCandidateControl(element)) continue;
    if (!isVisibleAndEnabled(element)) continue;
    fields.push(describeField(element, index));
    index += 1;
  }
  return {
    origin: root.defaultView?.location.origin ?? '',
    title: root.title.slice(0, MAX_TEXT),
    pageTextSample: pageSample(root),
    fields,
    inaccessible: collectInaccessible(root),
  };
}

function* walkElements(root: Document | ShadowRoot): Generator<Element> {
  const documentRef = ownerDocument(root);
  const walker = documentRef.createTreeWalker(root, SHOW_ELEMENT);
  let current = walker.nextNode();
  while (current) {
    if (isElement(current)) {
      yield current;
      if (current.shadowRoot) yield* walkElements(current.shadowRoot);
    }
    current = walker.nextNode();
  }
}

function isElement(node: Node): node is Element {
  return node.nodeType === 1;
}

function isDocumentNode(node: Node): node is Document {
  return node.nodeType === 9;
}

function isShadowRoot(node: Node): node is ShadowRoot {
  return node.nodeType === 11 && 'host' in node;
}

function resolveId(root: Node, id: string): Element | null {
  if (isDocumentNode(root)) return root.getElementById(id);
  if (isShadowRoot(root)) return root.querySelector(`#${cssEscape(id)}`);
  return null;
}

function ownerDocument(root: Document | ShadowRoot): Document {
  return isDocumentNode(root) ? root : root.ownerDocument;
}

function isCandidateControl(element: Element): boolean {
  return /^(INPUT|TEXTAREA|SELECT)$/.test(element.tagName);
}

function asControl(element: Element): HTMLInputElement {
  return element as HTMLInputElement;
}

function isVisibleAndEnabled(element: Element): boolean {
  const control = asControl(element);
  if (control.disabled) return false;
  if (element.tagName === 'INPUT' && SKIP_INPUT_TYPES.has(control.type)) {
    return false;
  }
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  if (
    style &&
    (style.display === 'none' ||
      style.visibility === 'hidden' ||
      style.opacity === '0')
  ) {
    return false;
  }
  return element.getAttribute('aria-hidden') !== 'true';
}

function describeField(element: Element, index: number): CollectedField {
  const control = asControl(element);
  const kind = controlKind(element);
  const label = fieldLabel(element);
  const group = fieldGroup(element);
  const type =
    element.tagName === 'INPUT' ? control.type : element.tagName.toLowerCase();
  return {
    id: `field:${index}`,
    kind,
    tagName: element.tagName.toLowerCase(),
    type,
    name: control.name ?? '',
    idAttr: element.id,
    label: clip(label),
    nearbyText: clip(nearbyText(element, label, group)),
    group: clip(group),
    options: fieldOptions(element).map((option) => clip(option)),
    currentValue: clip(visibleValue(element)),
    required: Boolean(control.required),
    inShadow: isShadowRoot(element.getRootNode()),
    fingerprint: fieldFingerprint(element, type, label, group),
  };
}

export function findControlByFingerprint(
  root: Document,
  fingerprint: string,
  occurrence = 0,
): Element | undefined {
  let seen = 0;
  for (const element of walkElements(root)) {
    if (!isCandidateControl(element)) continue;
    if (controlFingerprint(element) === fingerprint) {
      if (seen === occurrence) return element;
      seen += 1;
    }
  }
  return undefined;
}

export function controlFingerprint(element: Element): string {
  const control = asControl(element);
  const type =
    element.tagName === 'INPUT' ? control.type : element.tagName.toLowerCase();
  return fieldFingerprint(
    element,
    type,
    fieldLabel(element),
    fieldGroup(element),
  );
}

export function fingerprintOccurrence(
  root: Document,
  element: Element,
): number {
  const fingerprint = controlFingerprint(element);
  let seen = 0;
  for (const current of walkElements(root)) {
    if (!isCandidateControl(current)) continue;
    if (controlFingerprint(current) !== fingerprint) continue;
    if (current === element) return seen;
    seen += 1;
  }
  return 0;
}

function fieldFingerprint(
  element: Element,
  type: string,
  label: string,
  group: string,
): string {
  const control = asControl(element);
  return [
    element.tagName.toLowerCase(),
    type,
    control.name ?? '',
    element.id,
    label,
    group,
  ]
    .filter(Boolean)
    .join('|');
}

function controlKind(element: Element): CollectedControlKind {
  if (element.tagName === 'TEXTAREA') return 'textarea';
  if (element.tagName === 'SELECT') return 'select';
  if (element.tagName !== 'INPUT') return 'unknown';
  const type = asControl(element).type;
  if (type === 'radio') return 'radio';
  if (type === 'checkbox') return 'checkbox';
  if (type === 'date' || type === 'datetime-local') return 'date';
  return 'text';
}

function fieldLabel(element: Element): string {
  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy) {
    const parts = labelledBy
      .split(/\s+/)
      .map((id) => resolveId(element.getRootNode(), id)?.textContent)
      .filter((text): text is string => Boolean(text));
    if (parts.length) return normalize(parts.join(' '));
  }
  const aria = element.getAttribute('aria-label');
  if (aria) return normalize(aria);
  const associated = labelsOf(element);
  if (associated.length) {
    return visibleFieldLabel(
      element,
      associated.map((label) => labelText(label, element)).join(' '),
    );
  }
  const wrapping = element.closest('label');
  if (wrapping) return visibleFieldLabel(element, labelText(wrapping, element));
  return fieldsetLegend(element);
}

function visibleFieldLabel(element: Element, raw: string): string {
  const text = normalize(raw);
  const legend = fieldsetLegend(element);
  const control = asControl(element);
  if (
    legend &&
    element.tagName === 'INPUT' &&
    (control.type === 'radio' || control.type === 'checkbox') &&
    text === control.value
  ) {
    return legend;
  }
  return text;
}

function fieldsetLegend(element: Element): string {
  return normalize(
    element.closest('fieldset')?.querySelector('legend')?.textContent ?? '',
  );
}

function labelsOf(element: Element): HTMLLabelElement[] {
  if (!isCandidateControl(element)) return [];
  return Array.from(asControl(element).labels ?? []);
}

function labelText(label: Element, control: Element): string {
  const clone = label.cloneNode(true) as Element;
  clone.querySelectorAll('input, textarea, select').forEach((node) => {
    if (node !== control) node.remove();
  });
  return clone.textContent ?? '';
}

function fieldGroup(element: Element): string {
  const legend = element.closest('fieldset')?.querySelector('legend');
  if (legend?.textContent) return normalize(legend.textContent);
  const heading = element
    .closest('section, form, article')
    ?.querySelector('h1, h2, h3, h4');
  return normalize(heading?.textContent ?? '');
}

function fieldOptions(element: Element): string[] {
  if (element.tagName === 'SELECT') {
    return Array.from((element as HTMLSelectElement).options)
      .map((option) => normalize(option.textContent ?? option.value))
      .filter(Boolean);
  }
  const control = asControl(element);
  if (element.tagName === 'INPUT' && control.type === 'radio' && control.name) {
    const scope = control.form ?? element.getRootNode();
    return Array.from(
      (scope as ParentNode).querySelectorAll(
        `input[type="radio"][name="${cssEscape(control.name)}"]`,
      ),
    ).map((radio) => asControl(radio).value);
  }
  return [];
}

function visibleValue(element: Element): string {
  const control = asControl(element);
  if (element.tagName === 'SELECT') {
    const select = element as HTMLSelectElement;
    return select.options[select.selectedIndex]?.text ?? select.value;
  }
  if (element.tagName === 'INPUT' && control.type === 'checkbox') {
    return control.checked ? 'true' : 'false';
  }
  if (element.tagName === 'INPUT' && control.type === 'radio') {
    return control.checked ? control.value : '';
  }
  if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
    return control.value;
  }
  return '';
}

function nearbyText(element: Element, label: string, group: string): string {
  const parts = [label, group];
  const previous = element.previousElementSibling;
  if (previous && !previous.matches('input, textarea, select, button')) {
    parts.push(previous.textContent ?? '');
  }
  return normalize(parts.join(' '));
}

function collectInaccessible(root: Document): InaccessibleRegion[] {
  const regions: InaccessibleRegion[] = [];
  for (const frame of Array.from(root.querySelectorAll('iframe'))) {
    try {
      if (!(frame as HTMLIFrameElement).contentDocument) {
        regions.push({
          reason: 'crossOriginFrame',
          description: clip(
            frame.getAttribute('title') || frame.id || 'iframe',
          ),
        });
      }
    } catch {
      regions.push({
        reason: 'crossOriginFrame',
        description: clip(frame.getAttribute('title') || frame.id || 'iframe'),
      });
    }
  }
  for (const widget of Array.from(
    root.querySelectorAll('[role="listbox"], [role="combobox"]'),
  )) {
    if (widget.tagName === 'SELECT') continue;
    regions.push({
      reason: 'unsupported',
      description: clip(
        widget.getAttribute('aria-label') ||
          widget.textContent ||
          'custom widget',
      ),
    });
  }
  for (const host of walkHostCandidates(root)) {
    if (host.shadowRoot) continue;
    if (host.querySelector('input, textarea, select')) continue;
    if (host.childElementCount > 0) continue;
    const labeled = fieldLabel(host) || host.closest('label')?.textContent;
    if (!labeled) continue;
    regions.push({
      reason: 'closedShadow',
      description: clip(labeled),
    });
  }
  return regions;
}

function* walkHostCandidates(root: Document | ShadowRoot): Generator<Element> {
  const documentRef = ownerDocument(root);
  const walker = documentRef.createTreeWalker(root, SHOW_ELEMENT);
  let current = walker.nextNode();
  while (current) {
    if (isElement(current) && current.tagName === 'DIV') yield current;
    if (isElement(current) && current.shadowRoot) {
      yield* walkHostCandidates(current.shadowRoot);
    }
    current = walker.nextNode();
  }
}

function pageSample(root: Document): string {
  const headings = Array.from(root.querySelectorAll('h1, h2, h3'))
    .map((node) => normalize(node.textContent ?? ''))
    .filter(Boolean);
  return clip([root.title, ...headings].join(' · '), MAX_PAGE_SAMPLE);
}

function normalize(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function clip(value: string, max = MAX_TEXT): string {
  const normalized = normalize(value);
  return normalized.length > max
    ? `${normalized.slice(0, max - 1)}…`
    : normalized;
}

function cssEscape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
