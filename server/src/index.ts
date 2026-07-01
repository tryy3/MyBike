import { createApp } from "./app";

const app = createApp();
const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
