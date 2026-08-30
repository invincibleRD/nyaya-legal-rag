import { ingestStatute } from '../src/ingestion/index.js'
import { config } from '../src/core/config.js'
import { logger } from '../src/core/logger.js'

const pdfPath = process.argv[2] || config.corpus.sourcePdf

const result = await ingestStatute({
  pdfPath,
  collection: config.qdrant.statuteCollection,
  onProgress: (p) => {
    if (Math.round(p * 100) % 20 === 0) logger.info({ percent: Math.round(p * 100) }, 'embedding')
  },
})

logger.info(result, 'done')
