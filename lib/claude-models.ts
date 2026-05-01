export interface ClaudeModel {
  id: string;       // value passed to --model flag
  label: string;    // display name
  description: string;
  tier: 'opus' | 'sonnet' | 'haiku';
}

export interface EffortLevel {
  value: string;
  label: string;
  description: string;
}

export const EFFORT_LEVELS: EffortLevel[] = [
  { value: 'low',    label: 'Low',    description: 'Minimal thinking — fast, cheap' },
  { value: 'medium', label: 'Medium', description: 'Balanced — recommended for most tickets' },
  { value: 'high',   label: 'High',   description: 'More reasoning — for complex tasks' },
  { value: 'xhigh',  label: 'X-High', description: 'Deep analysis — use sparingly' },
  { value: 'max',    label: 'Max',    description: 'Maximum effort — slowest and most expensive' },
];

export const DEFAULT_EFFORT = EFFORT_LEVELS[1]; // medium

export const CLAUDE_MODELS: ClaudeModel[] = [
  {
    id: 'claude-opus-4-6',
    label: 'Claude Opus 4',
    description: 'Most capable — best for complex, multi-file changes',
    tier: 'opus',
  },
  {
    id: 'claude-sonnet-4-6',
    label: 'Claude Sonnet 4',
    description: 'Balanced speed & intelligence — recommended for most tickets',
    tier: 'sonnet',
  },
  {
    id: 'claude-haiku-4-5-20251001',
    label: 'Claude Haiku 4.5',
    description: 'Fastest & cheapest — good for small, well-defined tasks',
    tier: 'haiku',
  },
];

export const DEFAULT_MODEL = CLAUDE_MODELS[1]; // Sonnet

export const TIER_STYLES: Record<ClaudeModel['tier'], string> = {
  opus:   'text-violet-300 bg-violet-900/40 border-violet-700',
  sonnet: 'text-indigo-300 bg-indigo-900/40 border-indigo-700',
  haiku:  'text-sky-300 bg-sky-900/40 border-sky-700',
};
