# Nyaya — legal assistant over the Bharatiya Nagarik Suraksha Sanhita, 2023

Two panels: a chatbot that answers questions on the bare act and always cites
Act + Section, and a forms library extracted straight out of the source PDF.

Work in progress. Run guide, env table, eval results and AI usage disclosure
land here as the parts get built.

## Stack

- Backend: Node 22 + Express, plain JS (ESM)
- Vector DB: Qdrant (dense + BM25 sparse, fused with RRF)
- Embeddings: BAAI/bge-base-en-v1.5, self hosted, no hosted embedding APIs
- Queue: BullMQ on Redis
- Frontend: React + Vite + Tailwind
- LLM: provider behind an interface, swap with `LLM_PROVIDER` (gemini default, ollama supported)
