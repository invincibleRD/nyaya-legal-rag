import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

// A stand-in for the gazette: same geometry, a few lines of text. The real act
// is gitignored, so without this the parser tests only ever run on a machine
// that has fetched the corpus — which is how CI ended up covering half of what
// the developer's machine covers.
const BODY_X = 118
const INDENT_X = 142
const MARGIN_X = 57
const PAGE_W = 595.276
const PAGE_H = 841.89

export async function makeStatutePdf() {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.TimesRoman)
  const page = doc.addPage([PAGE_W, PAGE_H])

  const draw = (text, x, y, size = 10) =>
    page.drawText(text, { x, y, size, font, color: rgb(0, 0, 0) })

  // running header, has to be discarded by the parser
  draw('THE GAZETTE OF INDIA EXTRAORDINARY', 217, 789.6, 8)

  draw('CHAPTER VI', 250, 700)
  draw('PROCESSES TO COMPEL APPEARANCE', 200, 686)

  // marginal notes: small type, outdented left
  draw('Form of summons.', MARGIN_X, 660, 8)
  draw('Summons how', MARGIN_X, 600, 8)
  draw('served.', MARGIN_X, 590, 8)

  // first section, indented first line then body
  draw('1. Every summons issued by a Court under this Sanhita shall be in', INDENT_X, 660)
  draw('writing, in duplicate, signed by the presiding officer of such Court.', BODY_X, 648)
  draw('Provided that no summons shall issue without the seal of the Court.', BODY_X, 636)

  // second section, with a subsection and a cross reference
  draw('2. (1) Every summons shall be served by a police officer, subject to', INDENT_X, 600)
  draw('the rules made under section 63 of this Sanhita.', BODY_X, 588)
  draw('(2) The summons shall be served personally on the person summoned.', INDENT_X, 570)

  return Buffer.from(await doc.save())
}
