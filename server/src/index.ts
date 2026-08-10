import { app } from "./app";

app.listen(Number(process.env.PORT) || 3000);

console.log(`Isaac server running at http://localhost:${app.server?.port}`);
