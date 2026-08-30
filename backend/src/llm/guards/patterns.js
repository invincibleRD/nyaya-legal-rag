// these words are ordinary legal vocabulary. "can the court disregard the rules
// of evidence" is a real question, so a soft rule alone must not refuse it.
const LEGAL_SUBJECT =
  /\b(court|magistrate|judge|judicial|police|officer|accused|complainant|witness|surety|bail|bond|evidence|sanhita|bnss|bns|crpc|warrant|summons|fir|prosecutor|tribunal|sentence|appeal|section\s*\d+)\b/i

const RULES = [
  {
    name: 'override_instructions',
    soft: true,
    re: /\b(ignore|disregard|forget|override|bypass)\b[^.\n]{0,30}\b(your|previous|prior|earlier|above|preceding|original|initial|system|all|any)\b[^.\n]{0,25}\b(instruction|prompt|rule|guideline|directive|context|message)s?\b/i,
  },
  {
    name: 'override_instructions',
    soft: true,
    re: /\b(ignore|disregard|forget|override|bypass)\b[^.\n]{0,25}\b(instruction|prompt|rule|guideline)s?\b[^.\n]{0,15}\b(above|earlier|before|given|provided)\b/i,
  },
  {
    name: 'ignore_above',
    soft: true,
    re: /\b(ignore|disregard|forget)\b[^.\n]{0,20}\bthe (above|preceding|previous|foregoing)\b/i,
  },
  { name: 'system_prompt', re: /\bsystem prompt\b/i },
  {
    name: 'reveal_instructions',
    soft: true,
    re: /\b(reveal|show|repeat|print|output|display|leak|list)\b[^.\n]{0,30}\byour\b[^.\n]{0,20}\b(instructions?|prompt|rules|guidelines)\b/i,
  },
  { name: 'persona_switch', soft: true, re: /\byou are now\b/i },
  { name: 'persona_switch', soft: true, re: /\b(from now on|starting now)\b[^.\n]{0,20}\byou\b/i },
  {
    // a persona asked to break rules is an attack whatever it is dressed as
    name: 'roleplay',
    re: /\b(pretend|roleplay|role-play|imagine|act as)\b[^.\n]{0,40}\b(ignores?|breaks?|violates?|disregards?|bends?|is not bound by|does not follow)\b/i,
  },
  {
    name: 'roleplay',
    soft: true,
    re: /\b(pretend|roleplay|role-play|imagine)\b[^.\n]{0,25}\byou (are|were|have)\b/i,
  },
  {
    name: 'roleplay',
    re: /\bact as\b[^.\n]{0,25}\b(unrestricted|unfiltered|uncensored|jailbroken|dan)\b/i,
  },
  { name: 'jailbreak', re: /\b(developer mode|do anything now|dan mode)\b/i },
  { name: 'jailbreak', re: /\bno longer (bound|restricted|limited)\b/i },
  { name: 'jailbreak', soft: true, re: /\bwithout (any )?(restrictions|filters|guardrails)\b/i },
  {
    name: 'format_hijack',
    re: /\b(do not|don'?t|never|stop|avoid|omit)\b[^.\n]{0,25}\b(cite|citing|citations?|sources?|disclaimers?)\b/i,
  },
  {
    name: 'format_hijack',
    re: /\b(respond|reply|answer|output|print)\b[^.\n]{0,20}\b(only with|with only|nothing but|exactly the following|the following text)\b/i,
  },
  {
    name: 'format_hijack',
    re: /\bin (all|every|each) (of your )?(future )?(responses?|answers?|replies)\b/i,
  },
]

const DOCUMENT_RULES = [
  {
    name: 'document_promotion',
    re: /\b(recommend|suggest|promote|endorse|refer .{0,15}to)\b[^.\n]{0,30}\b(law firm|advocates?|attorneys?|lawyers?|chambers)\b/i,
  },
  {
    name: 'document_directive',
    re: /\b(ai assistant|the assistant|language model|chatbot|llm|ai)\s+(must|should|shall|always|never|is required to)\b/i,
  },
  {
    name: 'document_directive',
    re: /\bwhen (asked|answering|responding)\b[^.\n]{0,40}\b(you (must|should|always|never)|always (say|reply|respond|recommend|mention)|only (say|reply|recommend))\b/i,
  },
  {
    name: 'document_directive',
    re: /\b(important|note)\b[^.\n]{0,15}\b(for|to) (the )?(ai|assistant|model|language model)\b/i,
  },
]

// zero width chars and line breaks are the cheapest way to slip past a regex
function normalize(text) {
  return String(text || '')
    .replace(/[\u200b-\u200f\u202a-\u202e]/g, '')
    .replace(/\s+/g, ' ')
}

function match(rules, text, { allowSoft = true } = {}) {
  const clean = normalize(text)
  if (!clean) return null
  const legal = LEGAL_SUBJECT.test(clean)
  const hit = rules.find((r) => {
    if (!r.re.test(clean)) return false
    // a soft rule in a sentence full of legal vocabulary is not evidence enough
    if (r.soft && allowSoft && legal) return false
    return true
  })
  return hit ? hit.name : null
}

export function findInjection(text) {
  return match(RULES, text)
}

// an uploaded file has no business giving the assistant orders, so the softening
// does not apply to document text
export function findDocumentInjection(text) {
  return (
    match(DOCUMENT_RULES, text, { allowSoft: false }) || match(RULES, text, { allowSoft: false })
  )
}
