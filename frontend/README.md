# Nyaya frontend

React + Vite client for the legal RAG API: a chat panel with streamed, cited
answers and a browser for the extracted forms.

    npm install
    npm run dev      # http://localhost:5173
    npm run build    # production bundle in dist/
    npm run preview  # serve the built bundle

`VITE_API_URL` is the API base URL, default `http://localhost:8000`; copy
`.env.example` to `.env` to change it. The session id is generated in the
browser on first load and sent as `x-session-id` on every request.
