// The BM25 leg matches words, and the words a person uses are not always the
// words the draftsman used. "Anticipatory bail" never appears in the BNSS; the
// act says "apprehending arrest". Each entry adds the statutory phrasing to the
// sparse query, it never replaces what the user typed.
const BRIDGE = [
  [/\banticipatory bail\b/i, 'apprehending arrest direction for grant of bail'],
  [/\bzero f\.?i\.?r\.?\b/i, 'information cognizable offence irrespective of jurisdiction'],
  [/\bf\.?i\.?r\.?\b/i, 'first information report information in cognizable cases'],
  [/\bcharge\s?sheet\b/i, 'report of police officer on completion of investigation'],
  [/\bpolice remand\b|\bremand\b/i, 'custody of the accused detention'],
  [/\bnon[- ]bailable warrant\b|\bnbw\b/i, 'warrant of arrest'],
  [/\bcustodial interrogation\b/i, 'police custody interrogation'],
  [/\bdefault bail\b|\bstatutory bail\b/i, 'investigation not completed within the period'],
  [/\bquash(ing)?\b/i, 'inherent powers of the High Court'],
  [/\bcompound(ing)? (the )?offence\b/i, 'compounding of offences'],
  [/\bplea bargain(ing)?\b/i, 'plea bargaining application'],
  [/\bhandcuff(s|ing)?\b/i, 'arrest how made restraint'],
  [/\bbody search\b|\bsearch of a woman\b/i, 'search of person female'],
  [/\bpost[- ]?mortem\b/i, 'inquiry by Magistrate into cause of death'],
  [/\bwitness protection\b/i, 'witness protection scheme'],
  [/\bvictim compensation\b/i, 'order to pay compensation victim'],
  [/\bin absentia\b|\babsconder\b|\babsconding\b/i, 'proclaimed offender trial in absentia'],
  [/\bsummary trial\b/i, 'power to try summarily'],
  [/\bdischarge(d)?\b/i, 'when accused shall be discharged'],
  [/\bhow long\b.*\bcustody\b|\bcustody\b.*\bhow long\b/i, 'twenty-four hours'],
  [/\bbail bond\b/i, 'bond and bail-bond'],
  [/\bbefore a magistrate\b|\bproduced\b|\bwithout delay\b/i, 'twenty-four hours detained'],
  [/\bjumped bail\b|\bcannot be found\b|\bfled\b|\bran away\b/i, 'proclaimed offender absconding'],
  [
    /\blighter sentence\b|\bnegotiate\b.*\bsentence\b|\badmit(ting)? the offence\b/i,
    'plea bargaining mutually satisfactory disposition',
  ],
  [/\bwithout a full trial\b|\btrivial\b|\bpetty\b|\bminor offence\b/i, 'summarily petty offence'],
]

export function expandQuery(text) {
  const query = String(text || '')
  const extra = BRIDGE.filter(([pattern]) => pattern.test(query)).map(([, words]) => words)
  return extra.length ? `${query} ${extra.join(' ')}` : query
}
